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
});
