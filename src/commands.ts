import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { previewContext } from './context.js';
import { ConversationHistory } from './history.js';
import type { ActiveOrder, CommandContext, CommandResult } from './types.js';

function formatOrder(order: ActiveOrder): string {
  return order === 'codex-first' ? 'Order: codex → opus' : 'Order: opus → codex';
}

export function parseCommand(input: string, context: CommandContext): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { type: 'noop' };
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(' ');

  switch (command) {
    case '/codex':
      return { type: 'mode', mode: 'codex', message: 'Mode set to codex.' };
    case '/opus':
      return { type: 'mode', mode: 'opus', message: 'Mode set to opus.' };
    case '/both':
      return { type: 'mode', mode: 'both', message: 'Mode set to both.' };
    case '/order':
      if (context.repl.mode !== 'both') {
        return {
          type: 'info',
          message: 'Order only applies in /both mode. Switch with /both first.',
        };
      }

      if (!arg) {
        return { type: 'order', message: formatOrder(context.repl.order) };
      }

      if (arg !== 'codex-first' && arg !== 'opus-first') {
        return { type: 'info', message: 'Usage: /order codex-first|opus-first' };
      }

      return { type: 'order', order: arg, message: formatOrder(arg) };
    case '/load':
      if (!arg) {
        return { type: 'info', message: 'Usage: /load <path>' };
      }
      return { type: 'input', content: `@load ${arg}`, display: arg };
    case '/context':
      if (arg === 'reload') {
        return { type: 'context-reload' };
      }
      return { type: 'info', message: previewContext(context.context) };
    case '/clear':
      return { type: 'clear' };
    case '/save':
      return { type: 'save', path: arg || undefined };
    case '/models':
      return {
        type: 'info',
        message: `Codex: ${context.codexModel}\nOpus: ${context.opusModel}`,
      };
    case '/help':
      return {
        type: 'info',
        message: [
          'Routing',
          '  /codex              Only Codex responds',
          '  /opus               Only Opus responds',
          '  /both               Both models respond (default)',
          '  /order codex-first  Codex responds first, Opus critiques',
          '  /order opus-first   Opus responds first, Codex critiques',
          '',
          'Input',
          '  /load <path>        Load a file as the next user message',
          '  /context            Show loaded context file',
          '  /context reload     Reload context.md from disk',
          '',
          'Session',
          '  /save [path]        Save session to markdown',
          '  /clear              Clear conversation history',
          '  /models             Show current model names',
          '',
          'Utility',
          '  /help               Show this help',
          '  /exit or /q         Exit gauntlet',
        ].join('\n'),
      };
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

export async function saveHistory(history: ConversationHistory, cwd: string, targetPath?: string): Promise<string> {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const resolvedPath = path.resolve(cwd, targetPath ?? `gauntlet-session-${timestamp}.md`);
  const content = history
    .getEntries()
    .map((entry) => {
      const label = entry.author === 'you' ? 'You' : entry.author === 'codex' ? 'Codex' : 'Opus';
      return `## ${label}\n\n_${entry.timestamp}_\n\n${entry.content}\n`;
    })
    .join('\n');

  await writeFile(resolvedPath, content, 'utf8');
  history.markSaved();
  return resolvedPath;
}
