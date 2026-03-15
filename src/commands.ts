import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { previewContext } from './context.js';
import { ConversationHistory } from './history.js';
import type { CommandContext, CommandResult } from './types.js';

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
          '/codex        Switch to CODEX mode',
          '/opus         Switch to OPUS mode',
          '/both         Switch to BOTH mode',
          '/load <path>  Load a file and send it as the next user message',
          '/context      Show the loaded context',
          '/context reload  Reload context.md from disk',
          '/clear        Clear conversation history',
          '/save [path]  Save the session to markdown',
          '/models       Show model names',
          '/help         Show all commands',
          '/exit or /q   Exit the REPL',
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
  const resolvedPath = path.resolve(cwd, targetPath ?? `critique-session-${timestamp}.md`);
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
