export type ModelId = string;

export type CritiqueMode = 'parallel' | 'sequential';

export type ModelRole = 'proposer' | 'critic' | 'synthesiser' | 'freeform';

export interface ReplState {
  mode: 'multi' | 'single';
  proposerId: string;
  criticIds: string[];
  singleModelId: string | null;
  isStreaming: boolean;
  streamingTarget: string | null;
}

export type HistoryRole = 'user' | 'assistant';

export interface HistoryEntry {
  role: HistoryRole;
  content: string;
  modelId?: string;
  entryRole?: ModelRole;
}

export interface Round {
  number: number;
  question: string;
  proposerEntry: HistoryEntry;
  critiqueEntries: HistoryEntry[];
  critiqueMode: CritiqueMode | null;
  criticOrder: string[];
  reviewEntry: HistoryEntry | null;
}

export interface ContextState {
  path: string | null;
  content: string;
  expandedFiles: string[];
  skippedFiles: string[];
  warnings: string[];
  truncated: boolean;
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
  readonly id: ModelId;
  readonly model: string;
  readonly displayName: string;
  streamResponse(input: {
    history: HistoryEntry[];
    context: string;
    role: ModelRole;
    systemPrompt?: string;
    signal: AbortSignal;
    write: (chunk: string) => void;
  }): Promise<StreamResult>;
}

export interface ModelDefinition {
  id: ModelId;
  model: string;
  displayName: string;
  provider: string;
}

export interface ModelDefaults {
  proposerId: ModelId;
  criticIds: ModelId[];
}

export interface CommandContext {
  cwd: string;
  repl: ReplState;
  context: ContextState;
  historyLength: number;
  models: ModelDefinition[];
  defaults: ModelDefaults;
}

export type CommandResult =
  | { type: 'mode'; mode: 'multi'; message: string }
  | { type: 'mode'; mode: 'single'; modelId: ModelId; message: string }
  | { type: 'propose'; modelId: ModelId; message: string }
  | { type: 'critics'; criticIds?: ModelId[]; message: string }
  | { type: 'critique'; mode: CritiqueMode; criticIds: ModelId[] }
  | { type: 'review'; modelId?: ModelId }
  | { type: 'info'; message: string }
  | { type: 'input'; content: string; display: string }
  | { type: 'clear' }
  | { type: 'save'; path?: string }
  | { type: 'context-reload' }
  | { type: 'exit' }
  | { type: 'noop' };
