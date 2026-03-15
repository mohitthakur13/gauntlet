import readline, { type Interface as ReadlineInterface } from 'node:readline';
import process from 'node:process';
import { getModelDisplayName, resolveModelAddress } from './config.js';
import { loadContext } from './context.js';
import { parseCommand, resolveLoadedInput, saveHistory } from './commands.js';
import { ConversationHistory } from './history.js';
import { Renderer } from './renderer.js';
import type { ContextResolver, ModelClient, ModelName, ModelRole, ReplState } from './types.js';

type PromptPhase = 'prompt' | 'confirming';

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

export async function startRepl(params: {
  cwd: string;
  resolver: ContextResolver;
  codex: ModelClient;
  opus: ModelClient;
}): Promise<void> {
  const renderer = new Renderer();
  const history = new ConversationHistory();
  let context = await loadContext(params.resolver);
  let replState: ReplState = {
    mode: 'both',
    order: 'codex-first',
    hasHistory: false,
    isStreaming: false,
    streamingTarget: null,
  };
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
    if (!replState.hasHistory || !history.hasUnsavedChanges()) {
      return true;
    }

    const answer = await confirm(`Session has ${history.count()} turns. Save before exiting? [y/n/path] `);
    if (!answer || answer.toLowerCase() === 'n') {
      return true;
    }

    try {
      const savedPath = await saveHistory(history, params.cwd, answer.toLowerCase() === 'y' ? undefined : answer);
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

  renderer.banner(context.path, params.codex.model, params.opus.model, replState);

  while (!closed) {
    phase = 'prompt';
    const rawInput = await question(rl, renderer.renderPrompt(replState), (finish) => {
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

    const directAddress = parseDirectAddress(input);
    if (directAddress) {
      if (directAddress.type === 'unknown') {
        renderer.error(`Unknown model "${directAddress.token}". Use @codex or @<display-name>.`);
        continue;
      }

      if (!directAddress.message) {
        renderer.error(`Usage: @${directAddress.token} <message>`);
        continue;
      }

      await runTurn(directAddress.message, directAddress.model);
      continue;
    }

    const command = parseCommand(input, {
      cwd: params.cwd,
      repl: replState,
      context,
      historyLength: history.count(),
      codexModel: params.codex.model,
      opusModel: params.opus.model,
    });

    if (command.type !== 'noop') {
      if (command.type === 'mode') {
        replState = { ...replState, mode: command.mode };
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'order') {
        if (command.order) {
          replState = { ...replState, order: command.order };
        }
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'info') {
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'context-reload') {
        context = await loadContext(params.resolver);
        renderer.info(context.path ? `Context reloaded: ${context.path}` : 'No context loaded.');
        continue;
      }

      if (command.type === 'clear') {
        const answer = await confirm('Clear history? [y/n] ');
        if (answer.toLowerCase() === 'y') {
          history.clear();
          replState = { ...replState, hasHistory: false };
          renderer.info('History cleared.');
        }
        continue;
      }

      if (command.type === 'save') {
        try {
          const savedPath = await saveHistory(history, params.cwd, command.path);
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
          await runTurn(loaded);
        } catch (error) {
          renderer.error(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
    }

    await runTurn(rawInput);
  }

  process.removeListener('SIGINT', onSigint);
  process.stdout.write('\n');

  async function runTurn(message: string, directTarget?: ModelName): Promise<void> {
    history.addUserMessage(message);
    replState = { ...replState, hasHistory: true };

    if (directTarget) {
      const role = getRoleForModel(directTarget);
      const client = directTarget === 'codex' ? params.codex : params.opus;
      const text = await streamModel(directTarget, client, role);
      if (text !== null) {
        history.addAssistantMessage(directTarget, text);
      }
      renderer.separator();
      return;
    }

    if (replState.mode === 'codex') {
      const codexText = await streamModel('codex', params.codex, 'freeform');
      if (codexText !== null) {
        history.addAssistantMessage('codex', codexText);
      }
      renderer.separator();
      return;
    }

    if (replState.mode === 'opus') {
      const opusText = await streamModel('opus', params.opus, 'freeform');
      if (opusText !== null) {
        history.addAssistantMessage('opus', opusText);
      }
      renderer.separator();
      return;
    }

    const sequence: Array<{ label: ModelName; client: ModelClient; role: ModelRole }> =
      replState.order === 'codex-first'
        ? [
            { label: 'codex', client: params.codex, role: 'proposer' },
            { label: 'opus', client: params.opus, role: 'critic' },
          ]
        : [
            { label: 'opus', client: params.opus, role: 'proposer' },
            { label: 'codex', client: params.codex, role: 'critic' },
          ];

    for (const step of sequence) {
      const text = await streamModel(step.label, step.client, step.role);
      if (text === null) {
        renderer.separator();
        return;
      }
      history.addAssistantMessage(step.label, text);
    }

    renderer.separator();
  }

  async function streamModel(label: 'codex' | 'opus', client: ModelClient, role: ModelRole): Promise<string | null> {
    renderer.print('');
    replState = { ...replState, isStreaming: true, streamingTarget: label };
    renderer.print(renderer.renderPrompt(replState));
    renderer.print(renderer.modelHeader(label));

    abortController = new AbortController();

    try {
      const result = await client.streamResponse({
        history: history.getEntries(),
        context: context.content,
        role,
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
      const modelLabel = getModelDisplayName(label);
      if (error instanceof Error && error.message.startsWith(`${modelLabel} error:`)) {
        if (error.message.includes('429')) {
          renderer.error(`${error.message} — retrying in 5s failed`);
        } else {
          renderer.error(error.message);
        }
      } else {
        renderer.error(`${modelLabel} error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    } finally {
      abortController = null;
      replState = { ...replState, isStreaming: false, streamingTarget: null };
    }
  }

  function getRoleForModel(model: ModelName): ModelRole {
    if (replState.mode !== 'both') {
      return 'freeform';
    }

    if (replState.order === 'codex-first') {
      return model === 'codex' ? 'proposer' : 'critic';
    }

    return model === 'opus' ? 'proposer' : 'critic';
  }
}

function parseDirectAddress(
  input: string,
): { type: 'target'; model: ModelName; message: string; token: string } | { type: 'unknown'; token: string } | null {
  const match = input.match(/^@([^\s]+)\s*(.*)$/i);
  if (!match) {
    return null;
  }

  const [, rawToken, rest] = match;
  const model = resolveModelAddress(rawToken);
  if (!model) {
    return { type: 'unknown', token: rawToken };
  }

  return {
    type: 'target',
    model,
    message: rest.trim(),
    token: rawToken,
  };
}
