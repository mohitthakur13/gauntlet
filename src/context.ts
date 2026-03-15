import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import type { ContextResolver, ContextState } from './types.js';

const MAX_FILE_SIZE = 50 * 1024;
const MAX_CONTEXT_CHARS = 32_000;
const BINARY_SAMPLE_CHARS = 512;

function emptyContext(): ContextState {
  return {
    path: null,
    content: '',
    expandedFiles: [],
    skippedFiles: [],
    warnings: [],
    truncated: false,
  };
}

function extractProjectContextSection(content: string): string {
  const lines = content.split('\n');
  const headingIndex = lines.findIndex((line) => /^#{1,2}\s+Project Context\s*$/i.test(line.trim()));
  if (headingIndex === -1) {
    return content;
  }

  const headingLine = lines[headingIndex].trim();
  const headingLevel = headingLine.startsWith('##') ? 2 : 1;
  let endIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (headingLevel === 1 && /^#\s/.test(line)) {
      endIndex = index;
      break;
    }
    if (headingLevel === 2 && /^#{1,2}\s/.test(line)) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(headingIndex + 1, endIndex).join('\n');
}

async function inspectFile(candidatePath: string): Promise<'ok' | 'binary' | 'over-limit' | 'unreadable' | 'missing'> {
  try {
    const fileContent = await readFile(candidatePath, 'utf8');
    if (fileContent.length > MAX_FILE_SIZE) {
      return 'over-limit';
    }

    if (fileContent.slice(0, BINARY_SAMPLE_CHARS).includes('\0')) {
      return 'binary';
    }

    return 'ok';
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return 'missing';
    }
    return 'unreadable';
  }
}

async function resolveFileReferences(
  content: string,
  cwd: string,
): Promise<Pick<ContextState, 'content' | 'expandedFiles' | 'skippedFiles' | 'warnings' | 'truncated'>> {
  const expandedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const warnings: string[] = [];
  const resolvedLines: string[] = [];

  for (const line of content.split('\n')) {
    const match = line.match(/^\s*@file:\s*(.+?)\s*$/i);
    if (!match) {
      resolvedLines.push(line);
      continue;
    }

    const relativePath = match[1].trim();
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const status = await inspectFile(absolutePath);

    if (status !== 'ok') {
      const reason = status === 'missing'
        ? 'not found'
        : status === 'unreadable'
          ? 'unreadable'
          : status === 'binary'
            ? 'binary'
            : 'over 50KB';
      skippedFiles.push(`${relativePath} — ${reason}`);
      warnings.push(`Skipped ${relativePath} — ${reason}.`);
      continue;
    }

    const fileContent = await readFile(absolutePath, 'utf8');
    expandedFiles.push(relativePath);
    resolvedLines.push(fileContent);
  }

  let resolvedContent = resolvedLines.join('\n');
  let truncated = false;
  if (resolvedContent.length > MAX_CONTEXT_CHARS) {
    resolvedContent = resolvedContent.slice(0, MAX_CONTEXT_CHARS);
    truncated = true;
    warnings.push('Context truncated at 32,000 chars.');
  }

  return {
    content: resolvedContent,
    expandedFiles,
    skippedFiles,
    warnings,
    truncated,
  };
}

export async function resolveContext(contextPath: string): Promise<ContextState> {
  try {
    const rawContent = await readFile(contextPath, 'utf8');
    const extracted = extractProjectContextSection(rawContent);
    const resolved = await resolveFileReferences(extracted, process.cwd());
    return {
      path: contextPath,
      content: resolved.content,
      expandedFiles: resolved.expandedFiles,
      skippedFiles: resolved.skippedFiles,
      warnings: resolved.warnings,
      truncated: resolved.truncated,
    };
  } catch {
    return emptyContext();
  }
}

export async function loadContext(resolver: ContextResolver): Promise<ContextState> {
  const candidate = resolver.explicitPath
    ? path.resolve(resolver.cwd, resolver.explicitPath)
    : path.resolve(resolver.cwd, 'context.md');

  return resolveContext(candidate);
}

export function describeContext(context: ContextState): string {
  if (!context.path) {
    return 'No context.md found. Run with --context path/to/file or add context.md to current directory.';
  }

  return `Context loaded: ${context.path} (${context.content.length} chars)`;
}

export function previewContext(context: ContextState, length = 300): string {
  if (!context.path) {
    return 'No context loaded.';
  }

  const preview = context.content.replace(/\s+/g, ' ').trim().slice(0, length);
  const expanded = context.expandedFiles.length > 0 ? context.expandedFiles.join(', ') : 'none';
  const skipped = context.skippedFiles.length > 0 ? context.skippedFiles.join(', ') : 'none';

  return [
    `Context file:    ${context.path}`,
    `Files expanded:  ${context.expandedFiles.length} (${expanded})`,
    `Files skipped:   ${context.skippedFiles.length} (${skipped})`,
    `Resolved size:   ${context.content.length.toLocaleString()} chars`,
    'Preview:',
    `${preview}${context.content.length > length ? '...' : ''}`,
    ...context.warnings,
  ].join('\n');
}
