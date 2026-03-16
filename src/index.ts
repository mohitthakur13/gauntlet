#!/usr/bin/env node

import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { createClients, validateStartup } from './config.js';
import { Renderer } from './renderer.js';
import { startRepl } from './repl.js';

function parseArgs(argv: string[]): { contextPath?: string } {
  const contextIndex = argv.indexOf('--context');
  if (contextIndex === -1) {
    return {};
  }

  const contextPath = argv[contextIndex + 1];
  return contextPath ? { contextPath } : {};
}

async function main(): Promise<void> {
  await loadEnvFile();

  const renderer = new Renderer();
  const diagnostics = validateStartup();
  for (const warning of diagnostics.warnings) {
    renderer.warn(warning);
  }

  if (diagnostics.errors.length > 0) {
    for (const error of diagnostics.errors) {
      renderer.error(error);
    }
    renderer.print('');
    renderer.print('Gauntlet cannot start. Fix the errors above and try again.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  await startRepl({
    cwd: process.cwd(),
    resolver: {
      cwd: process.cwd(),
      explicitPath: args.contextPath,
    },
    clients: createClients(),
  });
}

async function loadEnvFile(): Promise<void> {
  const envPath = new URL('../.env', import.meta.url).pathname;
  try {
    const file = await readFile(envPath, 'utf8');
    const parsed = dotenv.parse(file);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Missing .env is fine.
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
