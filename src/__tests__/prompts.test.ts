import { describe, expect, test } from 'vitest';
import {
  buildSequentialCriticPrompt,
  buildSystemPrompt,
  FREEFORM_PROMPT,
  PARALLEL_CRITIC_PROMPT,
  PROPOSER_PROMPT,
  SEQUENTIAL_CRITIC_PROMPT,
  SYNTHESISER_PROMPT,
} from '../prompts.js';

describe('prompt heading contracts', () => {
  test('PROPOSER_PROMPT contains exactly the right headings', () => {
    expect(PROPOSER_PROMPT).toContain('## First principles');
    expect(PROPOSER_PROMPT).toContain('## Biggest risk');
    expect(PROPOSER_PROMPT).not.toContain('## Missed');
    expect(PROPOSER_PROMPT).not.toContain('## Elevation');
    expect(PROPOSER_PROMPT).not.toContain('## Incorporate');
  });

  test('PARALLEL_CRITIC_PROMPT contains exactly the right headings', () => {
    expect(PARALLEL_CRITIC_PROMPT).toContain('## Missed');
    expect(PARALLEL_CRITIC_PROMPT).toContain('## Elevation');
    expect(PARALLEL_CRITIC_PROMPT).toContain('## Biggest risk');
    expect(PARALLEL_CRITIC_PROMPT).not.toContain('## First principles');
    expect(PARALLEL_CRITIC_PROMPT).not.toContain('## Incorporate');
  });

  test('SEQUENTIAL_CRITIC_PROMPT contains exactly the right headings', () => {
    expect(SEQUENTIAL_CRITIC_PROMPT).toContain('## Missed');
    expect(SEQUENTIAL_CRITIC_PROMPT).toContain('## Elevation');
    expect(SEQUENTIAL_CRITIC_PROMPT).toContain('## Biggest risk');
    expect(SEQUENTIAL_CRITIC_PROMPT).not.toContain('## First principles');
  });

  test('SYNTHESISER_PROMPT contains exactly the right headings', () => {
    expect(SYNTHESISER_PROMPT).toContain('## Incorporate');
    expect(SYNTHESISER_PROMPT).toContain('## Push back');
    expect(SYNTHESISER_PROMPT).toContain('## Revised response');
    expect(SYNTHESISER_PROMPT).not.toContain('## First principles');
    expect(SYNTHESISER_PROMPT).not.toContain('## Missed');
  });
});

describe('buildSequentialCriticPrompt', () => {
  test('substitutes position and total correctly', () => {
    const prompt = buildSequentialCriticPrompt(2, 3);
    expect(prompt).toContain('2');
    expect(prompt).toContain('3');
  });

  test('different positions produce different prompts', () => {
    expect(buildSequentialCriticPrompt(1, 3)).not.toBe(buildSequentialCriticPrompt(2, 3));
  });

  test('does not contain unfilled placeholders', () => {
    const prompt = buildSequentialCriticPrompt(1, 2);
    expect(prompt).not.toContain('{position}');
    expect(prompt).not.toContain('{total}');
  });
});

describe('buildSystemPrompt', () => {
  test('wraps context with markers and includes prompt', () => {
    const result = buildSystemPrompt('my context', 'my prompt');
    expect(result).toContain('--- Project Context ---');
    expect(result).toContain('my context');
    expect(result).toContain('--- End Project Context ---');
    expect(result).toContain('my prompt');
  });

  test('returns prompt only when context is empty string', () => {
    const result = buildSystemPrompt('', 'my prompt');
    expect(result).toBe('my prompt');
    expect(result).not.toContain('Project Context');
  });

  test('returns prompt only when context is whitespace only', () => {
    const result = buildSystemPrompt('   \n  ', 'my prompt');
    expect(result).toBe('my prompt');
    expect(result).not.toContain('Project Context');
  });
});

describe('spelling consistency', () => {
  test('no US spelling "synthesizer" in any prompt constant', () => {
    const all = [
      PROPOSER_PROMPT,
      PARALLEL_CRITIC_PROMPT,
      SEQUENTIAL_CRITIC_PROMPT,
      SYNTHESISER_PROMPT,
      FREEFORM_PROMPT,
    ];
    for (const prompt of all) {
      expect(prompt).not.toMatch(/synthesizer/i);
    }
  });
});
