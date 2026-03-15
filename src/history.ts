import type { HistoryEntry, ModelName } from './types.js';

export class ConversationHistory {
  private entries: HistoryEntry[] = [];
  private dirty = false;

  addUserMessage(content: string): void {
    this.entries.push({
      role: 'user',
      content,
      author: 'you',
      timestamp: new Date().toISOString(),
    });
    this.dirty = true;
  }

  addAssistantMessage(model: ModelName, content: string): void {
    this.entries.push({
      role: 'assistant',
      content,
      author: model,
      timestamp: new Date().toISOString(),
    });
    this.dirty = true;
  }

  clear(): void {
    this.entries = [];
    this.dirty = false;
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
  const label = entry.author === 'you' ? 'You' : entry.author === 'codex' ? 'Codex' : 'Opus';
  return `[${label}]: ${entry.content}`;
}
