import { describe, expect, test } from 'vitest';
import { formatEntryForModel, History } from '../history.js';
import type { HistoryEntry } from '../types.js';

function makeProposerEntry(content = 'proposal'): HistoryEntry {
  return { role: 'assistant', content, modelId: 'codex', entryRole: 'proposer' };
}

function makeCritiqueEntry(modelId: string, content = 'critique'): HistoryEntry {
  return { role: 'assistant', content, modelId, entryRole: 'critic' };
}

function makeSynthesiserEntry(): HistoryEntry {
  return { role: 'assistant', content: 'synthesis', modelId: 'codex', entryRole: 'synthesiser' };
}

describe('round lifecycle — happy path', () => {
  test('startRound creates correct shape', () => {
    const h = new History();
    const entry = makeProposerEntry();
    const round = h.startRound('question', entry);
    expect(round.number).toBe(1);
    expect(round.question).toBe('question');
    expect(round.proposerEntry).toBe(entry);
    expect(round.critiqueEntries).toHaveLength(0);
    expect(round.criticOrder).toHaveLength(0);
    expect(round.critiqueMode).toBeNull();
    expect(round.reviewEntry).toBeNull();
  });

  test('second round gets number 2', () => {
    const h = new History();
    h.startRound('q1', makeProposerEntry());
    h.closeRound('parallel');
    h.startRound('q2', makeProposerEntry());
    expect(h.getLastRound()?.number).toBe(2);
  });

  test('addCritiqueToCurrentRound appends entry and id', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    h.addCritiqueToCurrentRound(makeCritiqueEntry('gemini'), 'gemini');
    const round = h.getLastRound()!;
    expect(round.critiqueEntries).toHaveLength(2);
    expect(round.criticOrder).toEqual(['opus', 'gemini']);
  });

  test('closeRound sets critiqueMode', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    h.closeRound('sequential');
    expect(h.getLastRound()?.critiqueMode).toBe('sequential');
  });

  test('closeRound with no critiques is allowed', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    expect(() => h.closeRound('parallel')).not.toThrow();
    const round = h.getLastRound()!;
    expect(round.critiqueMode).toBe('parallel');
    expect(round.critiqueEntries).toHaveLength(0);
  });

  test('setReviewOnLastRound sets reviewEntry', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    h.closeRound('parallel');
    const review = makeSynthesiserEntry();
    h.setReviewOnLastRound(review);
    expect(h.getLastRound()?.reviewEntry).toBe(review);
  });

  test('clear resets everything', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    h.closeRound('parallel');
    h.clear();
    expect(h.getLastRound()).toBeNull();
    expect(h.getRounds()).toHaveLength(0);
    expect(h.entries).toHaveLength(0);
  });
});

describe('round lifecycle — invariants', () => {
  test('critiqueEntries and criticOrder stay aligned', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    h.addCritiqueToCurrentRound(makeCritiqueEntry('gemini'), 'gemini');
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    const round = h.getLastRound()!;
    expect(round.critiqueEntries.length).toBe(round.criticOrder.length);
  });

  test('duplicate critic IDs are preserved — not deduplicated', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    const round = h.getLastRound()!;
    expect(round.criticOrder).toEqual(['opus', 'opus']);
    expect(round.critiqueEntries).toHaveLength(2);
  });

  test('addCritiqueToCurrentRound after closeRound is a no-op', () => {
    const h = new History();
    h.startRound('q', makeProposerEntry());
    h.closeRound('parallel');
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    expect(h.getLastRound()?.critiqueEntries).toHaveLength(0);
  });

  test('setReviewOnLastRound on empty history is a no-op', () => {
    const h = new History();
    expect(() => h.setReviewOnLastRound(makeSynthesiserEntry())).not.toThrow();
  });

  test('getLastRound returns null on empty history', () => {
    const h = new History();
    expect(h.getLastRound()).toBeNull();
  });

  test('startRound while prior round still open abandons prior round', () => {
    const h = new History();
    h.startRound('q1', makeProposerEntry('proposal 1'));
    h.startRound('q2', makeProposerEntry('proposal 2'));
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus'), 'opus');
    expect(h.getLastRound()?.question).toBe('q2');
    expect(h.getLastRound()?.critiqueEntries).toHaveLength(1);
    expect(h.getRounds()).toHaveLength(2);
    expect(h.getRounds()[0]?.critiqueEntries).toHaveLength(0);
  });
});

describe('buildParallelCriticContext — contract', () => {
  test('contains question and proposal', () => {
    const h = new History();
    const round = h.startRound('my question', makeProposerEntry('my proposal'));
    const ctx = h.buildParallelCriticContext(round, 'my question');
    expect(ctx).toContain('my question');
    expect(ctx).toContain('my proposal');
    expect(ctx).toContain('codex');
  });

  test('does not contain prior critiques', () => {
    const h = new History();
    const round = h.startRound('q', makeProposerEntry());
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus', 'opus said this'), 'opus');
    const ctx = h.buildParallelCriticContext(round, 'q');
    expect(ctx).not.toContain('opus said this');
  });
});

describe('buildSequentialCriticContext — contract', () => {
  test('position 0 sees only proposal, no prior critics', () => {
    const h = new History();
    const round = h.startRound('q', makeProposerEntry('proposal'));
    const ctx = h.buildSequentialCriticContext(round, 'q', 0, 3);
    expect(ctx).toContain('proposal');
    expect(ctx).not.toContain('Critic 1');
  });

  test('position 1 sees proposal and critic 1 labeled correctly', () => {
    const h = new History();
    const round = h.startRound('q', makeProposerEntry('proposal'));
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus', 'opus said this'), 'opus');
    const ctx = h.buildSequentialCriticContext(round, 'q', 1, 2);
    expect(ctx).toContain('proposal');
    expect(ctx).toContain('Critic 1 — opus:');
    expect(ctx).toContain('opus said this');
    expect(ctx).not.toContain('Critic 2');
  });

  test('labels use position not model name as identifier', () => {
    const h = new History();
    const round = h.startRound('q', makeProposerEntry());
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus', 'first'), 'opus');
    const ctx = h.buildSequentialCriticContext(round, 'q', 1, 2);
    expect(ctx).toMatch(/Critic 1 — opus:/);
  });

  test('duplicate critic at position 1 shows prior output', () => {
    const h = new History();
    const round = h.startRound('q', makeProposerEntry());
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus', 'first opus run'), 'opus');
    const ctx = h.buildSequentialCriticContext(round, 'q', 1, 2);
    expect(ctx).toContain('first opus run');
  });
});

describe('buildSynthesiserContext — contract', () => {
  test('contains proposal and all critiques with labels', () => {
    const h = new History();
    const round = h.startRound('q', makeProposerEntry('proposal'));
    h.addCritiqueToCurrentRound(makeCritiqueEntry('opus', 'opus critique'), 'opus');
    h.addCritiqueToCurrentRound(makeCritiqueEntry('gemini', 'gemini critique'), 'gemini');
    const ctx = h.buildSynthesiserContext(round, 'q');
    expect(ctx).toContain('proposal');
    expect(ctx).toContain('Critic 1 — opus:');
    expect(ctx).toContain('opus critique');
    expect(ctx).toContain('Critic 2 — gemini:');
    expect(ctx).toContain('gemini critique');
  });

  test('works with zero critiques', () => {
    const h = new History();
    const round = h.startRound('q', makeProposerEntry('proposal'));
    const ctx = h.buildSynthesiserContext(round, 'q');
    expect(ctx).toContain('proposal');
  });
});

describe('formatEntryForModel', () => {
  test('user entry formats as [You]: content', () => {
    const entry: HistoryEntry = { role: 'user', content: 'hello' };
    const result = formatEntryForModel(entry);
    expect(result).toContain('[You]');
    expect(result).toContain('hello');
  });

  test('assistant entry formats with model id', () => {
    const entry: HistoryEntry = { role: 'assistant', content: 'response', modelId: 'codex' };
    const result = formatEntryForModel(entry);
    expect(result).toContain('[codex]');
    expect(result).toContain('response');
  });
});
