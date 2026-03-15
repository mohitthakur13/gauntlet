import { describe, expect, test } from 'vitest';
import { renderCriticHeader, renderPrompt, renderSynthesiserHeader } from '../renderer.js';
import type { ReplState } from '../types.js';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function makeMultiState(proposerId: string, criticIds: string[]): ReplState {
  return {
    mode: 'multi',
    proposerId,
    criticIds,
    singleModelId: null,
    isStreaming: false,
    streamingTarget: null,
  };
}

function makeSingleState(modelId: string): ReplState {
  return {
    mode: 'single',
    proposerId: 'codex',
    criticIds: ['opus'],
    singleModelId: modelId,
    isStreaming: false,
    streamingTarget: null,
  };
}

describe('renderPrompt contracts', () => {
  test('multi mode shows proposer → critics with arrow', () => {
    const result = stripAnsi(renderPrompt(makeMultiState('codex', ['opus'])));
    expect(result).toContain('codex');
    expect(result).toContain('opus');
    expect(result).toContain('→');
    expect(result).toContain('›');
  });

  test('single mode shows model name only, no arrow', () => {
    const result = stripAnsi(renderPrompt(makeSingleState('opus')));
    expect(result).toContain('opus');
    expect(result).not.toContain('→');
    expect(result).toContain('›');
  });

  test('streaming overrides multi/single prompt shape', () => {
    const state = {
      ...makeMultiState('codex', ['opus']),
      isStreaming: true,
      streamingTarget: 'opus',
    };
    const result = stripAnsi(renderPrompt(state));
    expect(result).toContain('streaming');
    expect(result).toContain('›');
  });

  test('duplicate critics shown as-is, not deduplicated', () => {
    const result = stripAnsi(renderPrompt(makeMultiState('codex', ['opus', 'opus'])));
    const matches = result.match(/opus/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('three critics shows first two plus overflow count', () => {
    const result = stripAnsi(renderPrompt(makeMultiState('codex', ['opus', 'gemini', 'sonnet'])));
    expect(result).toContain('opus');
    expect(result).toContain('gemini');
    expect(result).toContain('+1');
    expect(result).not.toContain('sonnet');
  });

  test('empty critic list renders safely without crashing', () => {
    expect(() => renderPrompt(makeMultiState('codex', []))).not.toThrow();
  });

  test('unknown model id falls back to raw id in display', () => {
    const result = stripAnsi(renderPrompt(makeMultiState('codex', ['unknown-model-xyz'])));
    expect(result).toContain('unknown-model-xyz');
  });
});

describe('renderCriticHeader and renderSynthesiserHeader', () => {
  test('parallel header shows model name and [parallel]', () => {
    const result = stripAnsi(renderCriticHeader('opus', 'parallel'));
    expect(result).toContain('opus');
    expect(result).toContain('parallel');
  });

  test('sequential header shows position and total', () => {
    const result = stripAnsi(renderCriticHeader('opus', 'sequential', 2, 3));
    expect(result).toContain('opus');
    expect(result).toContain('2/3');
  });

  test('synthesiser header shows model name and synthesising', () => {
    const result = stripAnsi(renderSynthesiserHeader('codex'));
    expect(result).toContain('codex');
    expect(result).toContain('synthesising');
  });
});
