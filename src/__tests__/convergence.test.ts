import { describe, expect, test } from 'vitest';
import { checkConvergence, checkStructuralConvergence } from '../convergence.js';
import type { DebateState, HistoryEntry, ModelClient, StreamResult } from '../types.js';

function aggressiveEntry(attack: string, concession: string, extra = ''): string {
  return `## Position\nPosition\n## Attack\n${attack}\n## Concession\n${concession}\n${extra}`.trim();
}

function cooperativeEntry(challenge: string, build: string, extra = ''): string {
  return `## Build\n${build}\n## Challenge\n${challenge}\n## Synthesis\nAnswer\n${extra}`.trim();
}

function makeHistoryEntry(content: string): HistoryEntry {
  return { role: 'assistant', content, modelId: 'codex', entryRole: 'debater' };
}

function makeDebate(round: number, stance: DebateState['stance'], auto = true): DebateState {
  return {
    stance,
    auto,
    maxRounds: 5,
    currentRound: round,
    question: 'q',
    humanSteers: [],
    converged: false,
    debateRounds: [],
    modelA: 'codex',
    modelB: 'opus',
    exitReason: null,
  };
}

function makeJudge(response: StreamResult): ModelClient {
  return {
    id: 'judge',
    model: 'judge-model',
    displayName: 'judge',
    async streamResponse() {
      return response;
    },
  };
}

describe('checkStructuralConvergence', () => {
  test('mutual agreement markers in both fire signal', () => {
    const result = checkStructuralConvergence(
      aggressiveEntry('short attack', 'I concede the point.'),
      aggressiveEntry('another short attack', 'I agree there is no remaining disagreement.'),
      'aggressive',
    );
    expect(result.signals).toContain('mutual-agreement');
  });

  test('one-sided agreement does not fire signal', () => {
    const result = checkStructuralConvergence(
      aggressiveEntry('short attack', 'I agree.'),
      aggressiveEntry('another short attack', 'No concession.'),
      'aggressive',
    );
    expect(result.signals).not.toContain('mutual-agreement');
  });

  test('shrinking attacks below 50 words in both fire signal', () => {
    const result = checkStructuralConvergence(
      aggressiveEntry('a few words', 'many more words here for concession'),
      aggressiveEntry('few words', 'many more words here for concession'),
      'aggressive',
    );
    expect(result.signals).toContain('shrinking-attacks');
  });

  test('one side above threshold does not fire shrinking signal', () => {
    const longAttack = new Array(51).fill('word').join(' ');
    const result = checkStructuralConvergence(
      aggressiveEntry(longAttack, 'short'),
      aggressiveEntry('few words', 'many more words here for concession'),
      'aggressive',
    );
    expect(result.signals).not.toContain('shrinking-attacks');
  });

  test('concession dominance in both fires signal', () => {
    const result = checkStructuralConvergence(
      aggressiveEntry('few words', 'this concession section is definitely longer than attack'),
      aggressiveEntry('few words', 'this concession section is definitely longer than attack'),
      'aggressive',
    );
    expect(result.signals).toContain('concession-dominance');
  });

  test('all three signals produce signalCount 3', () => {
    const result = checkStructuralConvergence(
      aggressiveEntry('few words', 'I agree and I concede there is no remaining disagreement now'),
      aggressiveEntry('few words', 'I fully agree and nothing to add because we have converged'),
      'aggressive',
    );
    expect(result.signalCount).toBe(3);
  });

  test('zero signals produce signalCount 0', () => {
    const longAttack = new Array(60).fill('attack').join(' ');
    const result = checkStructuralConvergence(
      aggressiveEntry(longAttack, 'tiny'),
      aggressiveEntry(longAttack, 'tiny'),
      'aggressive',
    );
    expect(result.signalCount).toBe(0);
  });

  test('aggressive uses Attack and Concession headings', () => {
    const result = checkStructuralConvergence(
      aggressiveEntry('few', 'many many'),
      aggressiveEntry('few', 'many many'),
      'aggressive',
    );
    expect(result.signals).toContain('concession-dominance');
  });

  test('cooperative uses Challenge and Build headings', () => {
    const result = checkStructuralConvergence(
      cooperativeEntry('few', 'many many words in build'),
      cooperativeEntry('few', 'many many words in build'),
      'cooperative',
    );
    expect(result.signals).toContain('concession-dominance');
  });

  test('missing headings are handled gracefully', () => {
    const result = checkStructuralConvergence('plain text', 'plain text', 'cooperative');
    expect(result.signalCount).toBe(1);
    expect(result.signals).toContain('shrinking-attacks');
  });
});

describe('checkConvergence', () => {
  const longAttack = new Array(60).fill('attack').join(' ');
  const first = makeHistoryEntry(aggressiveEntry(longAttack, 'tiny'));
  const second = makeHistoryEntry(aggressiveEntry(longAttack, 'tiny'));

  test('0 signals and not periodic do not invoke judge', async () => {
    const result = await checkConvergence(
      first,
      second,
      makeDebate(1, 'aggressive', true),
      makeJudge({ text: 'CONVERGED', cancelled: false, skipped: false }),
      new AbortController().signal,
    );
    expect(result.method).toBe('structural-only');
    expect(result.shouldStop).toBe(false);
  });

  test('1 signal invokes judge', async () => {
    const result = await checkConvergence(
      makeHistoryEntry(aggressiveEntry('few', 'tiny')),
      makeHistoryEntry(aggressiveEntry('few', 'tiny')),
      makeDebate(1, 'aggressive', true),
      makeJudge({ text: 'DIVERGENT', cancelled: false, skipped: false }),
      new AbortController().signal,
    );
    expect(result.method).toBe('judge');
    expect(result.shouldStop).toBe(false);
  });

  test('0 signals but every 3rd round invokes judge', async () => {
    const result = await checkConvergence(
      first,
      second,
      makeDebate(3, 'aggressive', true),
      makeJudge({ text: 'DIVERGENT', cancelled: false, skipped: false }),
      new AbortController().signal,
    );
    expect(result.method).toBe('judge');
  });

  test('judge returns CONVERGED sets shouldStop true', async () => {
    const result = await checkConvergence(
      makeHistoryEntry(aggressiveEntry('few', 'I agree there is no remaining disagreement now')),
      makeHistoryEntry(aggressiveEntry('few', 'I fully agree and nothing to add')),
      makeDebate(1, 'aggressive', true),
      makeJudge({ text: 'CONVERGED', cancelled: false, skipped: false }),
      new AbortController().signal,
    );
    expect(result.shouldStop).toBe(true);
    expect(result.judgeVerdict).toBe('CONVERGED');
  });

  test('judge returns DIVERGENT sets shouldStop false', async () => {
    const result = await checkConvergence(
      makeHistoryEntry(aggressiveEntry('few', 'I agree there is no remaining disagreement now')),
      makeHistoryEntry(aggressiveEntry('few', 'I fully agree and nothing to add')),
      makeDebate(1, 'aggressive', true),
      makeJudge({ text: 'DIVERGENT', cancelled: false, skipped: false }),
      new AbortController().signal,
    );
    expect(result.shouldStop).toBe(false);
    expect(result.judgeVerdict).toBe('DIVERGENT');
  });

  test('judge cancelled sets shouldStop false', async () => {
    const result = await checkConvergence(
      makeHistoryEntry(aggressiveEntry('few', 'I agree there is no remaining disagreement now')),
      makeHistoryEntry(aggressiveEntry('few', 'I fully agree and nothing to add')),
      makeDebate(1, 'aggressive', true),
      makeJudge({ text: '', cancelled: true, skipped: false }),
      new AbortController().signal,
    );
    expect(result.shouldStop).toBe(false);
    expect(result.method).toBe('judge');
  });
});
