import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContextResolver, ContextState } from './types.js';

export async function loadContext(resolver: ContextResolver): Promise<ContextState> {
  const candidate = resolver.explicitPath
    ? path.resolve(resolver.cwd, resolver.explicitPath)
    : path.resolve(resolver.cwd, 'context.md');

  try {
    const content = await readFile(candidate, 'utf8');
    return { path: candidate, content };
  } catch {
    return { path: null, content: '' };
  }
}

export function describeContext(context: ContextState): string {
  if (!context.path) {
    return 'No context.md found. Run with --context path/to/file or add context.md to current directory.';
  }

  return `Context loaded: ${context.path} (${context.content.length} chars)`;
}

export function previewContext(context: ContextState, length = 160): string {
  if (!context.path) {
    return 'No context loaded.';
  }

  const preview = context.content.replace(/\s+/g, ' ').trim().slice(0, length);
  return `${context.path}\n${preview}${context.content.length > length ? '...' : ''}`;
}
