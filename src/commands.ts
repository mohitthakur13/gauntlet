import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getModelConfig, getModelDisplayName } from './config.js';
import { previewContext } from './context.js';
import { ConversationHistory } from './history.js';
import type { CommandContext, CommandResult, ContextState, CritiqueMode, ModelDefinition, ModelId, ReplState, Round, SavedDebate } from './types.js';

function findModelId(token: string, models: ModelDefinition[]): ModelId | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const entry = models.find((model) => (
    model.id.toLowerCase() === normalized || model.displayName.toLowerCase() === normalized
  ));
  return entry?.id ?? null;
}

function parseModelIds(tokens: string[], models: ModelDefinition[]): ModelId[] | null {
  const ids: ModelId[] = [];
  for (const token of tokens) {
    const id = findModelId(token, models);
    if (!id) {
      return null;
    }
    ids.push(id);
  }
  return ids;
}

function isKnownModelToken(token: string, models: ModelDefinition[]): boolean {
  return findModelId(token, models) !== null;
}

function availableModelList(models: ModelDefinition[]): string {
  return models.map((model) => model.id).join(', ');
}

function parseCritiqueArgs(
  args: string[],
  models: ModelDefinition[],
  defaultCriticIds: ModelId[],
): { mode: CritiqueMode; criticIds: ModelId[] } | { error: string } {
  if (args.length === 0) {
    return { mode: 'parallel', criticIds: [...defaultCriticIds] };
  }

  const [first, ...rest] = args;
  if (first === 'parallel' || first === 'sequential') {
    const mode = first;
    if (rest.length === 0) {
      return { mode, criticIds: [...defaultCriticIds] };
    }

    const criticIds: ModelId[] = [];
    for (const token of rest) {
      const modelId = findModelId(token, models);
      if (!modelId) {
        return {
          error: `Unknown model: "${token}"\nAvailable models: ${availableModelList(models)}`,
        };
      }
      criticIds.push(modelId);
    }

    return { mode, criticIds };
  }

  if (isKnownModelToken(first, models)) {
    return {
      error: `Specify mode before model ids:\n  /critique parallel ${args.join(' ')}\n  /critique sequential ${args.join(' ')}`,
    };
  }

  return { error: `Unknown argument: "${first}"` };
}

function formatCritics(criticIds: ModelId[]): string {
  return `Critics: ${criticIds.map((id) => getModelDisplayName(id)).join(', ')}`;
}

export function getDebateUsage(replState: ReplState): string {
  if (replState.debate) {
    const debate = replState.debate;
    const mode = debate.auto ? `auto ${debate.maxRounds}` : 'manual';
    const question = debate.question || 'awaiting question';
    return [
      `Debate active: ${debate.stance} (${mode})`,
      `Round: ${debate.currentRound}`,
      `Debaters: ${debate.modelA} vs ${debate.modelB}`,
      `Question: ${question}`,
    ].join('\n');
  }

  return 'Usage: /debate aggressive|cooperative [auto <n>]';
}

export function isBlockedDuringDebate(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return false;
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (command === '/debate' && rest[0] === 'off') {
    return false;
  }

  return ![
    '/debate',
    '/verdict',
    '/help',
    '/models',
    '/context',
    '/save',
  ].includes(command);
}

export function parseCommand(input: string, context: CommandContext): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { type: 'noop' };
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  const targetModel = context.models.find((entry) => command === `/${entry.id}`);

  if (targetModel) {
    return {
      type: 'mode',
      mode: 'single',
      modelId: targetModel.id,
      message: `Mode set to ${targetModel.displayName}.`,
    };
  }

  switch (command) {
    case '/both':
      return { type: 'mode', mode: 'multi', message: 'Mode set to multi.' };
    case '/single': {
      const token = rest[0];
      if (!token) {
        return { type: 'info', message: 'Usage: /single <id>' };
      }

      const modelId = findModelId(token, context.models);
      if (!modelId) {
        return { type: 'info', message: `Unknown model "${token}".` };
      }

      return {
        type: 'mode',
        mode: 'single',
        modelId,
        message: `Mode set to ${getModelDisplayName(modelId)}.`,
      };
    }
    case '/propose': {
      const token = rest[0];
      if (!token) {
        return { type: 'info', message: 'Usage: /propose <id>' };
      }

      const modelId = findModelId(token, context.models);
      if (!modelId) {
        return { type: 'info', message: `Unknown model "${token}".` };
      }

      return {
        type: 'propose',
        modelId,
        message: `Proposer: ${getModelDisplayName(modelId)}`,
      };
    }
    case '/critics':
      if (rest.length === 0) {
        return { type: 'critics', message: formatCritics(context.repl.criticIds) };
      }

      if (rest.length < 1) {
        return { type: 'info', message: 'Usage: /critics <id> [id...]' };
      }

      {
        const criticIds = parseModelIds(rest, context.models);
        if (!criticIds) {
          const unknown = rest.find((token) => !findModelId(token, context.models)) ?? rest[0];
          return { type: 'info', message: `Unknown model "${unknown}".` };
        }

        return {
          type: 'critics',
          criticIds,
          message: formatCritics(criticIds),
        };
      }
    case '/critique': {
      const parsed = parseCritiqueArgs(rest, context.models, context.repl.criticIds);
      if ('error' in parsed) {
        return { type: 'info', message: parsed.error };
      }

      return { type: 'critique', mode: parsed.mode, criticIds: parsed.criticIds };
    }
    case '/review': {
      if (rest.length === 0) {
        return { type: 'review' };
      }

      const modelId = findModelId(rest[0], context.models);
      if (!modelId) {
        return { type: 'info', message: `Unknown model "${rest[0]}".` };
      }

      return { type: 'review', modelId };
    }
    case '/load':
      if (rest.length === 0) {
        return { type: 'info', message: 'Usage: /load <path>' };
      }
      return { type: 'input', content: `@load ${rest.join(' ')}`, display: rest.join(' ') };
    case '/context':
      if (rest[0] === 'reload') {
        return { type: 'context-reload' };
      }
      return { type: 'info', message: previewContext(context.context) };
    case '/debate':
      if (rest.length === 0) {
        return { type: 'info', message: getDebateUsage(context.repl) };
      }

      if (context.repl.debate && rest[0] !== 'off') {
        return { type: 'info', message: 'Debate already active. Use /debate off to exit first.' };
      }

      if (rest[0] === 'off') {
        if (!context.repl.debate) {
          return { type: 'info', message: 'No active debate.' };
        }
        if (rest.length > 1) {
          return { type: 'info', message: 'Usage: /debate off' };
        }
        return { type: 'debate-off' };
      }

      if (context.repl.criticIds.length === 0) {
        return { type: 'info', message: 'Debate requires at least one critic. Use /critics to set one.' };
      }

      const stance = rest[0];
      if (stance !== 'aggressive' && stance !== 'cooperative') {
        return {
          type: 'info',
          message: 'Usage: /debate aggressive|cooperative [auto <n>]',
        };
      }

      if (rest[1] === 'auto') {
        const n = Number.parseInt(rest[2] ?? '', 10);
        if (Number.isNaN(n) || n < 1) {
          return {
            type: 'info',
            message: 'Max rounds must be >= 1',
          };
        }
        if (rest.length !== 3) {
          return {
            type: 'info',
            message: 'Usage: /debate aggressive|cooperative [auto <n>]',
          };
        }
        return { type: 'debate', stance, auto: true, maxRounds: n };
      }

      if (rest.length > 1) {
        return {
          type: 'info',
          message: 'Usage: /debate aggressive|cooperative [auto <n>]',
        };
      }

      return { type: 'debate', stance, auto: false, maxRounds: 0 };
    case '/verdict': {
      if (!context.repl.debate) {
        return { type: 'info', message: 'No active debate.' };
      }

      const judgeId = rest[0];
      if (judgeId && !context.models.some((model) => model.id === judgeId)) {
        return {
          type: 'info',
          message: `Unknown model: ${judgeId}. Use /models to see available.`,
        };
      }
      if (rest.length > 1) {
        return { type: 'info', message: 'Usage: /verdict [id]' };
      }
      return { type: 'verdict', judgeId };
    }
    case '/clear':
      return { type: 'clear' };
    case '/save':
      return { type: 'save', path: rest.join(' ') || undefined };
    case '/models':
      return {
        type: 'info',
        message: context.models.map((entry) => (
          `${entry.id}: ${entry.displayName} · ${entry.model} · ${entry.provider}`
        )).join('\n'),
      };
    case '/help':
      {
      return {
        type: 'info',
        message: [
          'Proposer & critics',
          '  /propose <id>                    Set who proposes',
          '  /critics [id...]                 Show or set critic list',
          '',
          'Critique',
          '  /critique                        Parallel (default order)',
          '  /critique parallel               Explicit parallel',
          '  /critique sequential             Sequential (default order)',
          '  /critique sequential <id> [id…]  Sequential (custom order)',
          '  /review [id]                     Synthesise all critiques',
          '',
          'Debate',
          '  /debate aggressive|cooperative   Start manual debate',
          '  /debate <stance> auto <n>        Start auto debate',
          '  /verdict [id]                    End debate with verdict',
          '  /debate off                      Exit debate without verdict',
          '',
          'Modes',
          '  /both                            Multi mode',
          '  /single <id>                     Single model freeform',
          '  /<id>                            Shortcut for any model in config.json',
          '',
          'Direct address',
          '  @<model> <message>               One-turn message, mode unchanged',
          '',
          'Input',
          '  /load <path>                     Load file as next message',
          '  /context                         Show context metadata',
          '  /context reload                  Reload context.md from disk',
          '',
          'Session',
          '  /save [path]                     Save session to markdown',
          '  /clear                           Clear history and rounds',
          '  /models                          Show available models',
          '  /help                            Show this help',
          '',
          'Keys',
          '  ctrl+c at prompt                 Exit (save prompt if history)',
          '  ctrl+c mid-stream                Cancel current response',
        ].join('\n'),
      };
      }
    case '/exit':
    case '/q':
      return { type: 'exit' };
    default:
      return { type: 'info', message: `Unknown command: ${command}` };
  }
}

export async function resolveLoadedInput(cwd: string, relativePath: string): Promise<string> {
  const absolutePath = path.resolve(cwd, relativePath);
  return readFile(absolutePath, 'utf8');
}

function renderRound(round: Round): string {
  const proposalName = round.proposerEntry.modelId ? getModelDisplayName(round.proposerEntry.modelId) : 'assistant';
  const parts: string[] = [
    `## Round ${round.number}`,
    '',
    `**Query:** ${round.question}`,
  ];

  if (round.critiqueMode) {
    parts.push(`**Critique mode:** ${round.critiqueMode}`);
    parts.push(`**Critic order:** ${round.criticOrder.map((criticId) => getModelDisplayName(criticId)).join(', ')}`);
  }

  parts.push('');
  parts.push(`### Proposal — ${proposalName}`);
  parts.push('');
  parts.push(round.proposerEntry.content);

  if (round.critiqueEntries.length > 0) {
    for (let index = 0; index < round.critiqueEntries.length; index += 1) {
      const entry = round.critiqueEntries[index];
      const criticId = round.criticOrder[index] ?? entry.modelId ?? 'critic';
      const criticName = criticId === 'critic' ? criticId : getModelDisplayName(criticId);
      const modeLabel = round.critiqueMode === 'parallel'
        ? '[parallel]'
        : `[sequential ${index + 1}/${round.critiqueEntries.length}]`;
      parts.push('');
      parts.push(`### Critique ${index + 1} — ${criticName} ${modeLabel}`);
      parts.push('');
      parts.push(entry.content);
    }
  }

  if (round.reviewEntry) {
    const reviewName = round.reviewEntry.modelId ? getModelDisplayName(round.reviewEntry.modelId) : 'assistant';
    parts.push('');
    parts.push(`### Review — ${reviewName} (synthesising)`);
    parts.push('');
    parts.push(round.reviewEntry.content);
  }

  return parts.join('\n');
}

function renderDebate(savedDebate: SavedDebate): string {
  const parts: string[] = [
    `## Debate — ${savedDebate.stance}`,
    '',
    `**Debaters:** ${savedDebate.modelA} vs ${savedDebate.modelB}`,
    `**Mode:** ${savedDebate.auto ? 'auto' : 'manual'}`,
    `**Max rounds:** ${savedDebate.maxRounds > 0 ? savedDebate.maxRounds : '—'}`,
    `**Completed rounds:** ${savedDebate.completedRounds}`,
    `**Exit reason:** ${savedDebate.exitReason}`,
    `**Judge:** ${savedDebate.judgeId ?? '—'}`,
    '',
    `**Question:** ${savedDebate.question}`,
  ];

  for (let index = 0; index < savedDebate.debateRounds.length; index += 1) {
    const round = savedDebate.debateRounds[index];
    const steer = savedDebate.humanSteers[index - 1];
    parts.push('');
    parts.push(`### Round ${round.number} — ${round.firstEntry.modelId ?? 'assistant'}`);
    parts.push(round.firstEntry.content);
    parts.push('');
    parts.push(`### Round ${round.number} — ${round.secondEntry.modelId ?? 'assistant'}`);
    parts.push(round.secondEntry.content);
    if (steer) {
      parts.push('');
      parts.push('### Moderator steering');
      parts.push(steer);
    }
  }

  if (savedDebate.verdictEntry) {
    parts.push('');
    parts.push(`### Verdict — ${savedDebate.verdictEntry.modelId ?? savedDebate.judgeId ?? 'assistant'}`);
    parts.push(savedDebate.verdictEntry.content);
  }

  return parts.join('\n');
}

export function formatSaveOutput(
  history: ConversationHistory,
  replState: ReplState,
  context: ContextState = {
    path: null,
    content: '',
    expandedFiles: [],
    skippedFiles: [],
    warnings: [],
    truncated: false,
  },
): string {
  const proposer = getModelConfig(replState.proposerId);
  const critics = replState.criticIds.map((criticId) => getModelConfig(criticId));
  const rounds = history.getRounds();
  return [
    ...[
    '# Gauntlet Session',
    `Date: ${new Date().toISOString()}`,
    `Proposer: ${proposer.displayName} (${proposer.model})`,
    `Critics: ${critics.map((critic) => `${critic.displayName} (${critic.model})`).join(', ')}`,
    `Context: ${context.path ?? 'none'}`,
    '',
    '---',
    '',
    ...rounds.flatMap((round, index) => (
      index === rounds.length - 1
        ? [renderRound(round)]
        : [renderRound(round), '', '---', '']
    )),
    ],
    ...contextualDebates(replState.savedDebates),
  ].flat().join('\n');
}

function contextualDebates(savedDebates: SavedDebate[]): string[] {
  if (savedDebates.length === 0) {
    return [];
  }

  return savedDebates.flatMap((savedDebate, index) => (
    index === 0
      ? ['', '---', '', renderDebate(savedDebate)]
      : ['', '---', '', renderDebate(savedDebate)]
  ));
}

export async function saveHistory(
  history: ConversationHistory,
  cwd: string,
  targetPath: string | undefined,
  options: {
    replState: ReplState;
    context: ContextState;
  },
): Promise<string> {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const resolvedPath = path.resolve(cwd, targetPath ?? `gauntlet-session-${timestamp}.md`);
  const content = formatSaveOutput(history, options.replState, options.context);

  await writeFile(resolvedPath, content, 'utf8');
  history.markSaved();
  return resolvedPath;
}
