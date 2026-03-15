import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveContext } from '../context.js';

const createdPaths: string[] = [];

async function writeTempFile(content: string | Uint8Array): Promise<string> {
  const filePath = join(tmpdir(), `gauntlet-test-${Date.now()}-${Math.random()}`);
  createdPaths.push(filePath);
  await writeFile(filePath, content);
  return filePath;
}

async function writeTempBinaryFile(): Promise<string> {
  const filePath = join(tmpdir(), `gauntlet-test-binary-${Date.now()}`);
  const buf = Buffer.alloc(512, 1);
  buf[10] = 0x00;
  createdPaths.push(filePath);
  await writeFile(filePath, buf);
  return filePath;
}

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map(async (filePath) => {
    await unlink(filePath).catch(() => undefined);
  }));
});

describe('section extraction', () => {
  test('extracts ## Project Context section', async () => {
    const f = await writeTempFile(`
# Other stuff
ignored

## Project Context
this is the context

## Another section
also ignored
`);
    const result = await resolveContext(f);
    expect(result.content).toContain('this is the context');
    expect(result.content).not.toContain('ignored');
    expect(result.content).not.toContain('also ignored');
  });

  test('extracts # Project Context (single hash)', async () => {
    const f = await writeTempFile(`
# Project Context
single hash content
`);
    const result = await resolveContext(f);
    expect(result.content).toContain('single hash content');
  });

  test('uses full file when no Project Context heading', async () => {
    const f = await writeTempFile(`
## Something else
all of this content
`);
    const result = await resolveContext(f);
    expect(result.content).toContain('all of this content');
  });

  test('empty Project Context section returns empty content', async () => {
    const f = await writeTempFile(`
## Project Context

## Another section
other content
`);
    const result = await resolveContext(f);
    expect(result.content.trim()).toBe('');
    expect(result.content).not.toContain('other content');
  });

  test('multiple Project Context headings — first match wins', async () => {
    const f = await writeTempFile(`
## Project Context
first context

## Project Context
second context
`);
    const result = await resolveContext(f);
    expect(result.content).toContain('first context');
    expect(result.content).not.toContain('second context');
  });
});

describe('@file: expansion', () => {
  test('expands @file: and inlines content', async () => {
    const ref = await writeTempFile('referenced content');
    const f = await writeTempFile(`## Project Context\n@file: ${ref}`);
    const result = await resolveContext(f);
    expect(result.content).toContain('referenced content');
    expect(result.expandedFiles).toHaveLength(1);
  });

  test('@file: without space is supported', async () => {
    const ref = await writeTempFile('no space content');
    const f = await writeTempFile(`## Project Context\n@file:${ref}`);
    const result = await resolveContext(f);
    expect(result.content).toContain('no space content');
  });

  test('@file: with trailing whitespace is trimmed', async () => {
    const ref = await writeTempFile('trailing space content');
    const f = await writeTempFile(`## Project Context\n@file: ${ref}   `);
    const result = await resolveContext(f);
    expect(result.content).toContain('trailing space content');
  });

  test('paths resolve relative to process.cwd(), not context file', async () => {
    const ref = await writeTempFile('cwd-relative content');
    const refRelative = relative(process.cwd(), ref);
    const f = await writeTempFile(`## Project Context\n@file: ${refRelative}`);
    const result = await resolveContext(f);
    expect(result.content).toContain('cwd-relative content');
  });

  test('preserves line breaks in included file content', async () => {
    const ref = await writeTempFile('line one\nline two\nline three');
    const f = await writeTempFile(`## Project Context\n@file: ${ref}`);
    const result = await resolveContext(f);
    expect(result.content).toContain('line one\nline two\nline three');
  });

  test('does not recursively expand @file: in included files', async () => {
    const nested = await writeTempFile('@file: /should/not/expand');
    const f = await writeTempFile(`## Project Context\n@file: ${nested}`);
    const result = await resolveContext(f);
    expect(result.content).toContain('@file:');
    expect(result.skippedFiles).toHaveLength(0);
    expect(result.expandedFiles).toHaveLength(1);
  });
});

describe('@file: guardrails', () => {
  test('warns and skips missing file', async () => {
    const f = await writeTempFile(`## Project Context\n@file: /does/not/exist.ts`);
    const result = await resolveContext(f);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0]).toContain('not/exist.ts');
  });

  test('warns and skips file over 50KB', async () => {
    const big = await writeTempFile('x'.repeat(51 * 1024));
    const f = await writeTempFile(`## Project Context\n@file: ${big}`);
    const result = await resolveContext(f);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0]).toContain('50KB');
  });

  test('warns and skips binary file', async () => {
    const bin = await writeTempBinaryFile();
    const f = await writeTempFile(`## Project Context\n@file: ${bin}`);
    const result = await resolveContext(f);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0]).toContain('binary');
  });

  test('truncates resolved content at 32000 chars', async () => {
    const big = await writeTempFile('y'.repeat(40_000));
    const f = await writeTempFile(`## Project Context\n@file: ${big}`);
    const result = await resolveContext(f);
    expect(result.content.length).toBeLessThanOrEqual(32_000);
    expect(result.truncated).toBe(true);
  });

  test('content under 32000 chars is not truncated', async () => {
    const f = await writeTempFile(`## Project Context\nshort content`);
    const result = await resolveContext(f);
    expect(result.truncated).toBe(false);
  });
});
