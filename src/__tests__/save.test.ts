import { describe, expect, test } from 'vitest';
import { formatSaveOutput } from '../commands.js';
import { buildInitialReplState } from '../config.js';
import { History } from '../history.js';
import type { HistoryEntry, ReplState } from '../types.js';

function makeProposerEntry(content = 'proposal'): HistoryEntry {
  return { role: 'assistant', content, modelId: 'codex', entryRole: 'proposer' };
}

function makeCritiqueEntry(modelId: string, content = 'critique'): HistoryEntry {
  return { role: 'assistant', content, modelId, entryRole: 'critic' };
}

function makeSynthesiserEntry(): HistoryEntry {
  return { role: 'assistant', content: 'synthesis', modelId: 'codex', entryRole: 'synthesiser' };
}

describe('/save round-based format', () => {
  function buildTestSession(): { history: History; state: ReplState } {
    const h = new History();
    const proposer = makeProposerEntry('## First principles\nthe proposal\n## Biggest risk\nthe risk');
    h.addEntry({ role: 'user', content: 'my question' });
    h.addEntry(proposer);
    h.startRound('my question', proposer);
    const critique = makeCritiqueEntry('opus', '## Missed\nstuff\n## Elevation\nmore\n## Biggest risk\nbig');
    h.addEntry(critique);
    h.addCritiqueToCurrentRound(critique, 'opus');
    h.closeRound('sequential');
    const review = makeSynthesiserEntry();
    h.addEntry(review);
    h.setReviewOnLastRound(review);
    return { history: h, state: buildInitialReplState() };
  }

  test('save output contains round heading', () => {
    const { history, state } = buildTestSession();
    const output = formatSaveOutput(history, state);
    expect(output).toContain('## Round 1');
  });

  test('save output contains query', () => {
    const { history, state } = buildTestSession();
    const output = formatSaveOutput(history, state);
    expect(output).toContain('my question');
  });

  test('save output contains critique mode metadata', () => {
    const { history, state } = buildTestSession();
    const output = formatSaveOutput(history, state);
    expect(output).toContain('sequential');
  });

  test('save output contains critic order', () => {
    const { history, state } = buildTestSession();
    const output = formatSaveOutput(history, state);
    expect(output).toContain('opus');
  });

  test('save output contains proposal section label', () => {
    const { history, state } = buildTestSession();
    const output = formatSaveOutput(history, state);
    expect(output).toContain('Proposal');
    expect(output).toContain('codex');
  });

  test('save output contains critique section label with position', () => {
    const { history, state } = buildTestSession();
    const output = formatSaveOutput(history, state);
    expect(output).toContain('Critique');
    expect(output).toContain('opus');
  });

  test('save output contains review section label', () => {
    const { history, state } = buildTestSession();
    const output = formatSaveOutput(history, state);
    expect(output).toContain('Review');
    expect(output).toContain('synthesising');
  });

  test('round with no critique has no critique section', () => {
    const h = new History();
    const proposer = makeProposerEntry('proposal only');
    h.startRound('q', proposer);
    const output = formatSaveOutput(h, buildInitialReplState());
    expect(output).not.toContain('Critique');
    expect(output).not.toContain('Review');
  });

  test('multiple rounds are separated', () => {
    const h = new History();
    const e = makeProposerEntry();
    h.startRound('q1', e);
    h.closeRound('parallel');
    h.startRound('q2', e);
    const output = formatSaveOutput(h, buildInitialReplState());
    expect(output).toContain('## Round 1');
    expect(output).toContain('## Round 2');
  });

  test('debate save includes full metadata header', () => {
    const state = {
      ...buildInitialReplState(),
      savedDebates: [{
        stance: 'aggressive',
        auto: false,
        maxRounds: 0,
        completedRounds: 2,
        question: 'Should we use a monolith?',
        humanSteers: ['Focus on migration cost.'],
        converged: false,
        debateRounds: [
          {
            number: 1,
            firstEntry: { role: 'assistant', modelId: 'codex', entryRole: 'debater', content: 'round 1 a' },
            secondEntry: { role: 'assistant', modelId: 'opus', entryRole: 'debater', content: 'round 1 b' },
            convergenceSignal: false,
            convergenceJudged: false,
          },
          {
            number: 2,
            firstEntry: { role: 'assistant', modelId: 'opus', entryRole: 'debater', content: 'round 2 a' },
            secondEntry: { role: 'assistant', modelId: 'codex', entryRole: 'debater', content: 'round 2 b' },
            convergenceSignal: false,
            convergenceJudged: false,
          },
        ],
        modelA: 'codex',
        modelB: 'opus',
        exitReason: 'manual-verdict',
        judgeId: 'gemini',
        verdictEntry: { role: 'assistant', modelId: 'gemini', entryRole: 'judge', content: 'verdict' },
      }],
    } satisfies ReplState;
    const output = formatSaveOutput(new History(), state);
    expect(output).toContain('## Debate — aggressive');
    expect(output).toContain('**Debaters:** codex vs opus');
    expect(output).toContain('**Mode:** manual');
    expect(output).toContain('**Completed rounds:** 2');
    expect(output).toContain('**Exit reason:** manual-verdict');
    expect(output).toContain('**Judge:** gemini');
  });

  test('debate save includes moderator steering sections between rounds', () => {
    const state = {
      ...buildInitialReplState(),
      savedDebates: [{
        stance: 'cooperative',
        auto: false,
        maxRounds: 0,
        completedRounds: 2,
        question: 'q',
        humanSteers: ['Focus on latency.'],
        converged: false,
        debateRounds: [
          {
            number: 1,
            firstEntry: { role: 'assistant', modelId: 'codex', entryRole: 'debater', content: 'r1a' },
            secondEntry: { role: 'assistant', modelId: 'opus', entryRole: 'debater', content: 'r1b' },
            convergenceSignal: false,
            convergenceJudged: false,
          },
          {
            number: 2,
            firstEntry: { role: 'assistant', modelId: 'opus', entryRole: 'debater', content: 'r2a' },
            secondEntry: { role: 'assistant', modelId: 'codex', entryRole: 'debater', content: 'r2b' },
            convergenceSignal: false,
            convergenceJudged: false,
          },
        ],
        modelA: 'codex',
        modelB: 'opus',
        exitReason: 'debate-off',
        judgeId: null,
        verdictEntry: null,
      }],
    } satisfies ReplState;
    const output = formatSaveOutput(new History(), state);
    expect(output).toContain('### Moderator steering');
    expect(output).toContain('Focus on latency.');
  });

  test('debate save with no steering omits steering section', () => {
    const state = {
      ...buildInitialReplState(),
      savedDebates: [{
        stance: 'cooperative',
        auto: true,
        maxRounds: 5,
        completedRounds: 1,
        question: 'q',
        humanSteers: [],
        converged: true,
        debateRounds: [
          {
            number: 1,
            firstEntry: { role: 'assistant', modelId: 'codex', entryRole: 'debater', content: 'r1a' },
            secondEntry: { role: 'assistant', modelId: 'opus', entryRole: 'debater', content: 'r1b' },
            convergenceSignal: true,
            convergenceJudged: true,
          },
        ],
        modelA: 'codex',
        modelB: 'opus',
        exitReason: 'converged',
        judgeId: 'codex',
        verdictEntry: { role: 'assistant', modelId: 'codex', entryRole: 'judge', content: 'verdict' },
      }],
    } satisfies ReplState;
    const output = formatSaveOutput(new History(), state);
    expect(output).not.toContain('### Moderator steering');
  });

  test('debate save with debate off shows no judge and no verdict', () => {
    const state = {
      ...buildInitialReplState(),
      savedDebates: [{
        stance: 'aggressive',
        auto: false,
        maxRounds: 0,
        completedRounds: 1,
        question: 'q',
        humanSteers: [],
        converged: false,
        debateRounds: [
          {
            number: 1,
            firstEntry: { role: 'assistant', modelId: 'codex', entryRole: 'debater', content: 'r1a' },
            secondEntry: { role: 'assistant', modelId: 'opus', entryRole: 'debater', content: 'r1b' },
            convergenceSignal: false,
            convergenceJudged: false,
          },
        ],
        modelA: 'codex',
        modelB: 'opus',
        exitReason: 'debate-off',
        judgeId: null,
        verdictEntry: null,
      }],
    } satisfies ReplState;
    const output = formatSaveOutput(new History(), state);
    expect(output).toContain('**Judge:** —');
    expect(output).not.toContain('### Verdict');
  });
});
