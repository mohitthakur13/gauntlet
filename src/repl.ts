import readline, { type Interface as ReadlineInterface } from 'node:readline';
import process from 'node:process';
import { buildInitialReplState, getProposerAndCriticIds, MODEL_CONFIGS, resolveModelAddress } from './config.js';
import { loadContext, previewContext } from './context.js';
import { parseCommand, resolveLoadedInput, saveHistory } from './commands.js';
import { ConversationHistory } from './history.js';
import { buildSequentialCriticPrompt, buildSystemPrompt, FREEFORM_PROMPT, PARALLEL_CRITIC_PROMPT, PROPOSER_PROMPT, SYNTHESISER_PROMPT } from './prompts.js';
import { Renderer } from './renderer.js';
import type { ContextResolver, ContextState, CritiqueMode, HistoryEntry, ModelClient, ModelId, ModelRole, ReplState } from './types.js';

type PromptPhase = 'prompt' | 'confirming';

const STREAMING_BLOCKED_COMMANDS = [
  'propose',
  'critics',
  'both',
  'single',
  'critique',
  'review',
  'clear',
  'context reload',
  ...MODEL_CONFIGS.map((entry) => entry.id),
] as const;

function question(
  rl: ReadlineInterface,
  prompt: string,
  setPendingFinish?: (finish: (() => void) | null) => void,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: string | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      setPendingFinish?.(null);
      (rl as unknown as { removeListener: (event: string, listener: () => void) => void }).removeListener('close', onClose);
      resolve(value);
    };

    const onClose = (): void => finish(null);

    setPendingFinish?.(() => finish(null));
    (rl as unknown as { on: (event: string, listener: () => void) => void }).on('close', onClose);
    rl.question(prompt, (answer) => finish(answer));
  });
}

function buildSyntheticUserHistory(history: HistoryEntry[], content: string): HistoryEntry[] {
  return [...history, { role: 'user', content }];
}

function previewContextForReload(context: ContextState): string {
  return previewContext(context);
}

function getSlashCommandKey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  if (parts[0] === 'context' && parts[1] === 'reload') {
    return 'context reload';
  }

  return parts[0];
}

function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

function isDirectAddressInput(input: string): boolean {
  return /^@/.test(input.trim());
}

function isReadOnlyCommand(input: string): boolean {
  const key = getSlashCommandKey(input);
  return key === 'help' || key === 'models' || key === 'context';
}

function isMutatingCommand(input: string): boolean {
  const key = getSlashCommandKey(input);
  return key !== null && STREAMING_BLOCKED_COMMANDS.includes(key as (typeof STREAMING_BLOCKED_COMMANDS)[number]);
}

export async function startRepl(params: {
  cwd: string;
  resolver: ContextResolver;
  clients: Map<ModelId, ModelClient>;
}): Promise<void> {
  const renderer = new Renderer();
  const history = new ConversationHistory();
  let context = await loadContext(params.resolver);
  let replState: ReplState = buildInitialReplState();
  let phase: PromptPhase = 'prompt';
  let abortController: AbortController | null = null;
  let pendingPromptFinish: (() => void) | null = null;
  let exitRequested = false;
  let exiting = false;
  let closed = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  const confirm = async (prompt: string): Promise<string> => {
    phase = 'confirming';
    try {
      return ((await question(rl, prompt)) ?? '').trim();
    } finally {
      phase = 'prompt';
    }
  };

  const saveIfRequested = async (): Promise<boolean> => {
    if (history.count() === 0 || !history.hasUnsavedChanges()) {
      return true;
    }

    const answer = await confirm(`Session has ${history.count()} turns. Save before exiting? [y/n/path] `);
    if (!answer || answer.toLowerCase() === 'n') {
      return true;
    }

    try {
      const savedPath = await saveHistory(history, params.cwd, answer.toLowerCase() === 'y' ? undefined : answer, {
        replState,
        context,
      });
      renderer.info(`Saved session to ${savedPath}`);
      return true;
    } catch (error) {
      renderer.error(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const handleExit = async (): Promise<void> => {
    if (exiting) {
      return;
    }

    exiting = true;
    exitRequested = false;
    const okayToExit = await saveIfRequested();
    if (!okayToExit) {
      exiting = false;
      return;
    }

    rl.close();
  };

  const onSigint = (): void => {
    if (replState.isStreaming) {
      abortController?.abort();
      replState = { ...replState, isStreaming: false, streamingTarget: null };
      return;
    }

    if (phase === 'confirming') {
      return;
    }

    if (pendingPromptFinish) {
      exitRequested = true;
      pendingPromptFinish();
      return;
    }

    void handleExit();
  };

  rl.on('close', () => {
    closed = true;
  });

  process.on('SIGINT', onSigint);

  renderer.banner(context.path, [...params.clients.values()], replState);

  while (!closed) {
    phase = 'prompt';
    const rawInput = await question(rl, renderer.renderPrompt(replState, params.clients), (finish) => {
      pendingPromptFinish = finish;
    });

    if (rawInput === null) {
      if (exitRequested) {
        await handleExit();
      }
      break;
    }

    const input = rawInput.trim();
    if (!input) {
      continue;
    }

    if (replState.isStreaming) {
      if (isReadOnlyCommand(input)) {
        const readOnlyCommand = parseCommand(input, {
          cwd: params.cwd,
          repl: replState,
          context,
          historyLength: history.count(),
          models: MODEL_CONFIGS,
          defaults: getProposerAndCriticIds(),
        });
        if (readOnlyCommand.type === 'info') {
          renderer.info(readOnlyCommand.message);
        }
        continue;
      }

      if (isDirectAddressInput(input)) {
        renderer.error('Cannot send messages while streaming.\nPress ctrl+c to cancel, then try again.');
      } else if (isSlashCommand(input)) {
        if (!isMutatingCommand(input)) {
          renderer.error('Cannot change configuration while streaming.\nPress ctrl+c to cancel, then try again.');
          continue;
        }
        renderer.error('Cannot change configuration while streaming.\nPress ctrl+c to cancel, then try again.');
      } else {
        renderer.error('Cannot send messages while streaming.\nPress ctrl+c to cancel, then try again.');
      }
      continue;
    }

    const directAddress = parseDirectAddress(input);
    if (directAddress) {
      if (directAddress.type === 'unknown') {
        renderer.error(
          `Unknown model "${directAddress.token}". Available: ${MODEL_CONFIGS.map((entry) => `@${entry.id}`).join(', ')}`,
        );
        continue;
      }

      if (!directAddress.message) {
        renderer.error(`Usage: @${directAddress.token} <message>`);
        continue;
      }

      await runDirectTurn(directAddress.message, directAddress.modelId);
      continue;
    }

    const command = parseCommand(input, {
      cwd: params.cwd,
      repl: replState,
      context,
      historyLength: history.count(),
      models: MODEL_CONFIGS,
      defaults: getProposerAndCriticIds(),
    });

    if (command.type !== 'noop') {
      if (command.type === 'mode') {
        replState = command.mode === 'multi'
          ? { ...replState, mode: 'multi', singleModelId: null }
          : { ...replState, mode: 'single', singleModelId: command.modelId };
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'propose') {
        replState = { ...replState, proposerId: command.modelId };
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'critics') {
        if (command.criticIds) {
          replState = { ...replState, criticIds: command.criticIds };
        }
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'critique') {
        await runCritique(command.mode, command.criticIds);
        continue;
      }

      if (command.type === 'review') {
        await runReview(command.modelId);
        continue;
      }

      if (command.type === 'info') {
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'context-reload') {
        context = await loadContext(params.resolver);
        renderer.info(previewContextForReload(context));
        continue;
      }

      if (command.type === 'clear') {
        const answer = await confirm('Clear session? [y/n] ');
        if (answer.toLowerCase() === 'y') {
          history.clear();
          replState = { ...replState, isStreaming: false, streamingTarget: null };
          renderer.info('Session cleared.');
        }
        continue;
      }

      if (command.type === 'save') {
        try {
          const savedPath = await saveHistory(history, params.cwd, command.path, {
            replState,
            context,
          });
          renderer.info(`Saved session to ${savedPath}`);
        } catch (error) {
          renderer.error(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }

      if (command.type === 'exit') {
        await handleExit();
        break;
      }

      if (command.type === 'input') {
        try {
          const loaded = await resolveLoadedInput(params.cwd, command.display);
          await runQueryTurn(loaded);
        } catch (error) {
          renderer.error(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
    }

    await runQueryTurn(rawInput);
  }

  process.removeListener('SIGINT', onSigint);
  process.stdout.write('\n');

  async function runQueryTurn(message: string): Promise<void> {
    history.addUserMessage(message);

    if (replState.mode === 'single' && replState.singleModelId) {
      const client = params.clients.get(replState.singleModelId);
      if (!client) {
        renderer.error(`Unknown model "${replState.singleModelId}".`);
        renderer.separator();
        return;
      }

      const text = await streamModel({
        client,
        role: 'freeform',
        streamHistory: history.getEntries(),
        header: renderer.renderModelHeader(client.displayName),
        streamingTarget: client.displayName,
        systemPrompt: buildSystemPrompt(context.content, FREEFORM_PROMPT),
      });
      if (text !== null) {
        history.addAssistantMessage(replState.singleModelId, text, 'freeform');
      }
      renderer.separator();
      return;
    }

    const proposerClient = params.clients.get(replState.proposerId);
    if (!proposerClient) {
      renderer.error(`Unknown model "${replState.proposerId}".`);
      renderer.separator();
      return;
    }

    const proposalText = await streamModel({
      client: proposerClient,
      role: 'proposer',
      streamHistory: history.getEntries(),
      header: renderer.renderModelHeader(proposerClient.displayName),
      streamingTarget: proposerClient.displayName,
      systemPrompt: buildSystemPrompt(context.content, PROPOSER_PROMPT),
    });
    if (proposalText === null) {
      renderer.separator();
      return;
    }

    const proposerEntry = history.addAssistantMessage(replState.proposerId, proposalText, 'proposer');
    history.startRound(message, proposerEntry);
    renderer.separator();
  }

  async function runDirectTurn(message: string, modelId: ModelId): Promise<void> {
    history.addUserMessage(message);

    const client = params.clients.get(modelId);
    if (!client) {
      renderer.error(`Unknown model "${modelId}".`);
      renderer.separator();
      return;
    }

    const text = await streamModel({
      client,
      role: 'freeform',
      streamHistory: history.getEntries(),
      header: renderer.renderModelHeader(client.displayName),
      streamingTarget: client.displayName,
      systemPrompt: buildSystemPrompt(context.content, FREEFORM_PROMPT),
    });
    if (text !== null) {
      history.addAssistantMessage(modelId, text, 'freeform');
    }
    renderer.separator();
  }

  async function runCritique(mode: CritiqueMode, criticIds: ModelId[]): Promise<void> {
    const round = history.getLastRound();
    if (!round) {
      renderer.info('No response to critique yet. Send a query first.');
      return;
    }

    if (round.critiqueMode !== null) {
      renderer.info('This round has already been critiqued.\nSend a new query to start another round.');
      return;
    }

    for (let index = 0; index < criticIds.length; index += 1) {
      const criticId = criticIds[index];
      const criticClient = params.clients.get(criticId);
      if (!criticClient) {
        renderer.error(`Unknown model "${criticId}".`);
        return;
      }

      const systemPrompt = mode === 'parallel'
        ? buildSystemPrompt(context.content, PARALLEL_CRITIC_PROMPT)
        : buildSystemPrompt(context.content, buildSequentialCriticPrompt(index + 1, criticIds.length));
      const criticContext = mode === 'parallel'
        ? history.buildParallelCriticContext(round, round.question)
        : history.buildSequentialCriticContext(round, round.question, index, criticIds.length);
      const criticHistory = buildSyntheticUserHistory([], criticContext);
      const critiqueText = await streamModel({
        client: criticClient,
        role: 'critic',
        streamHistory: criticHistory,
        header: renderer.renderCriticHeader(criticClient.displayName, mode, index + 1, criticIds.length),
        streamingTarget: criticClient.displayName,
        systemPrompt,
      });

      if (critiqueText === null) {
        return;
      }

      const critiqueEntry = history.addAssistantMessage(criticId, critiqueText, 'critic');
      history.addCritiqueToCurrentRound(critiqueEntry, criticId);
    }

    history.closeRound(mode);
    renderer.separator();
  }

  async function runReview(modelId?: ModelId): Promise<void> {
    const round = history.getLastRound();
    if (!round) {
      renderer.info('No response to review. Send a query first.');
      return;
    }

    if (round.critiqueMode === null) {
      renderer.info('No critiques to review. Run /critique first.');
      return;
    }

    if (round.reviewEntry !== null) {
      renderer.info('This round has already been reviewed.\nSend a new query to start another round.');
      return;
    }

    const synthesiserId = modelId ?? replState.proposerId;
    const synthesiserClient = params.clients.get(synthesiserId);
    if (!synthesiserClient) {
      renderer.error(`Unknown model "${synthesiserId}".`);
      return;
    }

    const reviewContext = history.buildSynthesiserContext(round, round.question);
    const reviewHistory = buildSyntheticUserHistory([], reviewContext);
    const reviewText = await streamModel({
      client: synthesiserClient,
      role: 'synthesiser',
      streamHistory: reviewHistory,
      header: renderer.renderSynthesiserHeader(synthesiserClient.displayName),
      streamingTarget: `${synthesiserClient.displayName} (synthesising)`,
      systemPrompt: buildSystemPrompt(context.content, SYNTHESISER_PROMPT),
    });

    if (reviewText === null) {
      return;
    }

    const reviewEntry = history.addAssistantMessage(synthesiserId, reviewText, 'synthesiser');
    history.setReviewOnLastRound(reviewEntry);
    renderer.separator();
  }

  async function streamModel(paramsForStream: {
    client: ModelClient;
    role: ModelRole;
    streamHistory: HistoryEntry[];
    header: string;
    streamingTarget: string;
    systemPrompt?: string;
  }): Promise<string | null> {
    renderer.print('');
    replState = { ...replState, isStreaming: true, streamingTarget: paramsForStream.streamingTarget };
    renderer.print(renderer.renderPrompt(replState, params.clients));
    renderer.print(paramsForStream.header);

    abortController = new AbortController();

    try {
      const result = await paramsForStream.client.streamResponse({
        history: paramsForStream.streamHistory,
        context: context.content,
        role: paramsForStream.role,
        systemPrompt: paramsForStream.systemPrompt,
        signal: abortController.signal,
        write: (chunk) => renderer.write(chunk),
      });
      renderer.print('');

      if (result.cancelled) {
        renderer.info('[cancelled]');
        return null;
      }

      return result.text.trimEnd();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`${paramsForStream.client.displayName} error:`)) {
        if (error.message.includes('429')) {
          renderer.error(`${error.message} — retrying in 5s failed`);
        } else {
          renderer.error(error.message);
        }
      } else {
        renderer.error(
          `${paramsForStream.client.displayName} error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    } finally {
      abortController = null;
      replState = { ...replState, isStreaming: false, streamingTarget: null };
    }
  }
}

function parseDirectAddress(
  input: string,
): { type: 'target'; modelId: ModelId; message: string; token: string } | { type: 'unknown'; token: string } | null {
  const match = input.match(/^@([^\s]+)\s*(.*)$/i);
  if (!match) {
    return null;
  }

  const [, rawToken, rest] = match;
  const modelId = resolveModelAddress(rawToken);
  if (!modelId) {
    return { type: 'unknown', token: rawToken };
  }

  return {
    type: 'target',
    modelId,
    message: rest.trim(),
    token: rawToken,
  };
}
