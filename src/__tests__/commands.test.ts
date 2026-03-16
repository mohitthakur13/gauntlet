import process from 'node:process';
import { describe, expect, test } from 'vitest';
import { buildInitialReplState } from '../config.js';
import { parseCommand } from '../commands.js';
import type { CommandContext, ReplState } from '../types.js';

function makeContext(repl: ReplState): CommandContext {
  return {
    cwd: process.cwd(),
    repl,
    context: {
      path: null,
      content: '',
      expandedFiles: [],
      skippedFiles: [],
      warnings: [],
      truncated: false,
    },
    historyLength: 0,
    models: [
      { id: 'codex', model: 'gpt-5', displayName: 'codex', provider: 'openai' },
      { id: 'opus', model: 'claude-opus', displayName: 'opus', provider: 'anthropic' },
      { id: 'gemini', model: 'gemini-2.5', displayName: 'gemini', provider: 'google' },
    ],
    defaults: {
      proposerId: 'codex',
      criticIds: ['opus'],
    },
  };
}

describe('debate command parsing', () => {
  test('/debate aggressive parses manual debate', () => {
    expect(parseCommand('/debate aggressive', makeContext(buildInitialReplState()))).toEqual({
      type: 'debate',
      stance: 'aggressive',
      auto: false,
      maxRounds: 0,
    });
  });

  test('/debate cooperative parses manual debate', () => {
    expect(parseCommand('/debate cooperative', makeContext(buildInitialReplState()))).toEqual({
      type: 'debate',
      stance: 'cooperative',
      auto: false,
      maxRounds: 0,
    });
  });

  test('/debate aggressive auto 5 parses auto debate', () => {
    expect(parseCommand('/debate aggressive auto 5', makeContext(buildInitialReplState()))).toEqual({
      type: 'debate',
      stance: 'aggressive',
      auto: true,
      maxRounds: 5,
    });
  });

  test('/debate cooperative auto 3 parses auto debate', () => {
    expect(parseCommand('/debate cooperative auto 3', makeContext(buildInitialReplState()))).toEqual({
      type: 'debate',
      stance: 'cooperative',
      auto: true,
      maxRounds: 3,
    });
  });

  test('/debate auto without stance returns usage', () => {
    expect(parseCommand('/debate auto', makeContext(buildInitialReplState()))).toEqual({
      type: 'info',
      message: 'Usage: /debate aggressive|cooperative [auto <n>]',
    });
  });

  test('/debate aggressive auto without n returns error', () => {
    expect(parseCommand('/debate aggressive auto', makeContext(buildInitialReplState()))).toEqual({
      type: 'info',
      message: 'Max rounds must be >= 1',
    });
  });

  test('/debate aggressive auto 0 returns error', () => {
    expect(parseCommand('/debate aggressive auto 0', makeContext(buildInitialReplState()))).toEqual({
      type: 'info',
      message: 'Max rounds must be >= 1',
    });
  });

  test('/debate aggressive auto -1 returns error', () => {
    expect(parseCommand('/debate aggressive auto -1', makeContext(buildInitialReplState()))).toEqual({
      type: 'info',
      message: 'Max rounds must be >= 1',
    });
  });

  test('/debate aggressive foo returns usage', () => {
    expect(parseCommand('/debate aggressive foo', makeContext(buildInitialReplState()))).toEqual({
      type: 'info',
      message: 'Usage: /debate aggressive|cooperative [auto <n>]',
    });
  });

  test('/debate off returns debate-off when active', () => {
    const state = buildInitialReplState();
    state.debate = {
      stance: 'aggressive',
      auto: false,
      maxRounds: 0,
      currentRound: 1,
      question: 'q',
      humanSteers: [],
      converged: false,
      debateRounds: [],
      modelA: 'codex',
      modelB: 'opus',
      exitReason: null,
    };
    expect(parseCommand('/debate off', makeContext(state))).toEqual({ type: 'debate-off' });
  });

  test('/debate with no args returns usage when inactive', () => {
    expect(parseCommand('/debate', makeContext(buildInitialReplState()))).toEqual({
      type: 'info',
      message: 'Usage: /debate aggressive|cooperative [auto <n>]',
    });
  });

  test('/debate with no critics returns clear error', () => {
    const state = buildInitialReplState();
    state.criticIds = [];
    expect(parseCommand('/debate aggressive', makeContext(state))).toEqual({
      type: 'info',
      message: 'Debate requires at least one critic. Use /critics to set one.',
    });
  });

  test('/verdict parses without judgeId', () => {
    const state = buildInitialReplState();
    state.debate = {
      stance: 'aggressive',
      auto: false,
      maxRounds: 0,
      currentRound: 1,
      question: 'q',
      humanSteers: [],
      converged: false,
      debateRounds: [],
      modelA: 'codex',
      modelB: 'opus',
      exitReason: null,
    };
    expect(parseCommand('/verdict', makeContext(state))).toEqual({ type: 'verdict', judgeId: undefined });
  });

  test('/verdict gemini parses with judgeId', () => {
    const state = buildInitialReplState();
    state.debate = {
      stance: 'aggressive',
      auto: false,
      maxRounds: 0,
      currentRound: 1,
      question: 'q',
      humanSteers: [],
      converged: false,
      debateRounds: [],
      modelA: 'codex',
      modelB: 'opus',
      exitReason: null,
    };
    expect(parseCommand('/verdict gemini', makeContext(state))).toEqual({ type: 'verdict', judgeId: 'gemini' });
  });

  test('/verdict nonexistent returns error', () => {
    const state = buildInitialReplState();
    state.debate = {
      stance: 'aggressive',
      auto: false,
      maxRounds: 0,
      currentRound: 1,
      question: 'q',
      humanSteers: [],
      converged: false,
      debateRounds: [],
      modelA: 'codex',
      modelB: 'opus',
      exitReason: null,
    };
    expect(parseCommand('/verdict nonexistent', makeContext(state))).toEqual({
      type: 'info',
      message: 'Unknown model: nonexistent. Use /models to see available.',
    });
  });
});
