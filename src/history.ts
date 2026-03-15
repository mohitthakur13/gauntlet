import type { CritiqueMode, HistoryEntry, ModelId, ModelRole, Round } from './types.js';

export class ConversationHistory {
  entries: HistoryEntry[] = [];
  private dirty = false;
  private rounds: Round[] = [];
  private currentRound: Round | null = null;

  addUserMessage(content: string): void {
    this.entries.push({
      role: 'user',
      content,
    });
    this.dirty = true;
  }

  addAssistantMessage(modelId: ModelId, content: string, entryRole?: ModelRole): HistoryEntry {
    const entry: HistoryEntry = {
      role: 'assistant',
      content,
      modelId,
      entryRole,
    };
    this.entries.push(entry);
    this.dirty = true;
    return entry;
  }

  addEntry(entry: HistoryEntry): HistoryEntry {
    this.entries.push(entry);
    this.dirty = true;
    return entry;
  }

  startRound(question: string, proposerEntry: HistoryEntry): Round {
    const round: Round = {
      number: this.rounds.length + 1,
      question,
      proposerEntry,
      critiqueEntries: [],
      critiqueMode: null,
      criticOrder: [],
      reviewEntry: null,
    };
    this.currentRound = round;
    this.rounds.push(round);
    return round;
  }

  addCritiqueToCurrentRound(entry: HistoryEntry, modelId: string): void {
    if (!this.currentRound) {
      return;
    }

    this.currentRound.critiqueEntries.push(entry);
    this.currentRound.criticOrder.push(modelId);
  }

  closeRound(mode: CritiqueMode): void {
    if (!this.currentRound) {
      return;
    }

    this.currentRound.critiqueMode = mode;
    this.currentRound = null;
  }

  setReviewOnLastRound(entry: HistoryEntry): void {
    const last = this.getLastRound();
    if (last) {
      last.reviewEntry = entry;
    }
  }

  getLastRound(): Round | null {
    return this.rounds[this.rounds.length - 1] ?? null;
  }

  getRounds(): Round[] {
    return [...this.rounds];
  }

  buildParallelCriticContext(round: Round, question: string): string {
    return [
      `User question: ${question}`,
      '',
      `Proposal — ${round.proposerEntry.modelId}:`,
      round.proposerEntry.content,
      '',
      'Please critique this response.',
    ].join('\n');
  }

  buildSequentialCriticContext(
    round: Round,
    question: string,
    position: number,
    total: number,
  ): string {
    void total;

    const parts = [
      `User question: ${question}`,
      '',
      `Proposal — ${round.proposerEntry.modelId}:`,
      round.proposerEntry.content,
    ];

    for (let index = 0; index < position; index += 1) {
      parts.push('');
      parts.push(`Critic ${index + 1} — ${round.criticOrder[index]}:`);
      parts.push(round.critiqueEntries[index]?.content ?? '');
    }

    parts.push('');
    parts.push('Please critique this response.');
    return parts.join('\n');
  }

  buildSynthesiserContext(round: Round, question: string): string {
    const parts = [
      `User question: ${question}`,
      '',
      `Proposal — ${round.proposerEntry.modelId}:`,
      round.proposerEntry.content,
    ];

    for (let index = 0; index < round.critiqueEntries.length; index += 1) {
      parts.push('');
      parts.push(`Critic ${index + 1} — ${round.criticOrder[index]}:`);
      parts.push(round.critiqueEntries[index]?.content ?? '');
    }

    parts.push('');
    parts.push(
      'Please synthesise: incorporate what is correct, push back on what is not, and provide a revised response.',
    );
    return parts.join('\n');
  }

  clear(): void {
    this.entries = [];
    this.dirty = false;
    this.rounds = [];
    this.currentRound = null;
  }

  markSaved(): void {
    this.dirty = false;
  }

  getEntries(): HistoryEntry[] {
    return [...this.entries];
  }

  hasUnsavedChanges(): boolean {
    return this.dirty && this.entries.length > 0;
  }

  count(): number {
    return this.entries.length;
  }
}

export function formatEntryForModel(entry: HistoryEntry): string {
  if (entry.role === 'user') {
    return `[You]: ${entry.content}`;
  }

  return `[${entry.modelId ?? 'assistant'}]: ${entry.content}`;
}

export { ConversationHistory as History };
