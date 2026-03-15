export type Mode = 'both' | 'codex' | 'opus';

export type ModelName = 'codex' | 'opus';

export type HistoryRole = 'user' | 'assistant';

export interface HistoryEntry {
  role: HistoryRole;
  content: string;
  author: 'you' | ModelName;
  timestamp: string;
}

export interface ContextState {
  path: string | null;
  content: string;
}

export interface ContextResolver {
  explicitPath?: string;
  cwd: string;
}

export interface StreamResult {
  text: string;
  cancelled: boolean;
  skipped: boolean;
}

export interface ModelClient {
  readonly model: string;
  streamResponse(input: {
    history: HistoryEntry[];
    context: string;
    signal: AbortSignal;
    write: (chunk: string) => void;
  }): Promise<StreamResult>;
}

export interface CommandContext {
  cwd: string;
  mode: Mode;
  context: ContextState;
  historyLength: number;
  codexModel: string;
  opusModel: string;
}

export type CommandResult =
  | { type: 'mode'; mode: Mode; message: string }
  | { type: 'info'; message: string }
  | { type: 'input'; content: string; display: string }
  | { type: 'clear' }
  | { type: 'save'; path?: string }
  | { type: 'context-reload' }
  | { type: 'exit' }
  | { type: 'noop' };
