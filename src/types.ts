export type ModelId = string;

export type CritiqueMode = 'parallel' | 'sequential';

export type DebateStance = 'aggressive' | 'cooperative';

export type DebateExitReason =
  | 'manual-verdict'
  | 'converged'
  | 'max-rounds'
  | 'debate-off'
  | 'cancelled';

export type ModelRole = 'proposer' | 'critic' | 'synthesiser' | 'freeform' | 'debater' | 'judge';

export interface ReplState {
  mode: 'multi' | 'single';
  proposerId: string;
  criticIds: string[];
  singleModelId: string | null;
  isStreaming: boolean;
  streamingTarget: string | null;
  debate: DebateState | null;
  savedDebates: SavedDebate[];
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

export interface DebateRound {
  number: number;
  firstEntry: HistoryEntry;
  secondEntry: HistoryEntry;
  convergenceSignal: boolean;
  convergenceJudged: boolean;
}

export interface DebateState {
  stance: DebateStance;
  auto: boolean;
  maxRounds: number;
  currentRound: number;
  question: string;
  humanSteers: string[];
  converged: boolean;
  debateRounds: DebateRound[];
  modelA: string;
  modelB: string;
  exitReason: DebateExitReason | null;
}

export interface SavedDebate {
  stance: DebateStance;
  auto: boolean;
  maxRounds: number;
  completedRounds: number;
  question: string;
  humanSteers: string[];
  converged: boolean;
  debateRounds: DebateRound[];
  modelA: string;
  modelB: string;
  exitReason: DebateExitReason;
  judgeId: string | null;
  verdictEntry: HistoryEntry | null;
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

export interface GenerationParams {
  temperature?: number;
  presencePenalty?: number;
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
    generationParams?: GenerationParams;
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
  | { type: 'debate'; stance: DebateStance; auto: boolean; maxRounds: number }
  | { type: 'debate-off' }
  | { type: 'verdict'; judgeId?: string }
  | { type: 'exit' }
  | { type: 'noop' };
