import process from 'node:process';
import configData from './config.json' with { type: 'json' };
import { CodexClient } from './models/codex.js';
import { OpusClient } from './models/opus.js';
import type { ModelClient, ModelDefinition, ModelId, ReplState } from './types.js';

export const MODEL_CONFIGS: ModelDefinition[] = configData.models;

const MODEL_CONFIG_BY_ID = new Map(MODEL_CONFIGS.map((entry) => [entry.id, entry]));

const PROVIDERS: Record<string, (entry: ModelDefinition, apiKey: string) => ModelClient> = {
  openai: (entry, apiKey) => new CodexClient(entry.id, entry.model, entry.displayName, apiKey),
  anthropic: (entry, apiKey) => new OpusClient(entry.id, entry.model, entry.displayName, apiKey),
};

function getApiKey(provider: string): string {
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY ?? '';
  }

  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY ?? '';
  }

  return '';
}

export function deriveDisplayName(model: string): string {
  if (!model.startsWith('claude-')) {
    return model;
  }

  let stripped = model.replace(/^claude-/, '');
  stripped = stripped.replace(/-\d{8}$/, '');
  stripped = stripped.replace(/-\d+-\d+$/, '');
  return stripped || model;
}

export function validateConfig(config: {
  models: ModelDefinition[];
  defaults: { proposerId: string; criticIds: string[] };
} = configData): void {
  const ids = new Set<string>();
  for (const entry of config.models) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate model id: ${entry.id}`);
    }
    ids.add(entry.id);
  }

  if (config.defaults.criticIds.length === 0) {
    throw new Error('criticIds must not be empty');
  }

  if (!ids.has(config.defaults.proposerId)) {
    throw new Error(`Unknown proposer model id: ${config.defaults.proposerId}`);
  }

  for (const criticId of config.defaults.criticIds) {
    if (!ids.has(criticId)) {
      throw new Error(`Unknown critic model id: ${criticId}`);
    }
  }
}

export function createClients(): Map<ModelId, ModelClient> {
  validateConfig();

  const clients = new Map<ModelId, ModelClient>();
  for (const entry of MODEL_CONFIGS) {
    const factory = PROVIDERS[entry.provider];
    if (!factory) {
      throw new Error(`Unknown provider: ${entry.provider}`);
    }

    clients.set(entry.id, factory(entry, getApiKey(entry.provider)));
  }

  return clients;
}

export function getModelConfig(id: ModelId): ModelDefinition {
  const entry = MODEL_CONFIG_BY_ID.get(id);
  if (!entry) {
    throw new Error(`Unknown model id: ${id}`);
  }

  return entry;
}

export function getModelDisplayName(id: ModelId): string {
  return getModelConfig(id).displayName;
}

export function resolveModelAddress(token: string): ModelId | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const entry of MODEL_CONFIGS) {
    if (normalized === entry.id.toLowerCase() || normalized === entry.displayName.toLowerCase()) {
      return entry.id;
    }
  }

  return null;
}

export function getProposerAndCriticIds(): {
  proposerId: string;
  criticIds: string[];
} {
  return {
    proposerId: configData.defaults.proposerId,
    criticIds: [...configData.defaults.criticIds],
  };
}

export function buildInitialReplState(): ReplState {
  const { proposerId, criticIds } = getProposerAndCriticIds();
  return {
    mode: 'multi',
    proposerId,
    criticIds,
    singleModelId: null,
    isStreaming: false,
    streamingTarget: null,
    debate: null,
    savedDebates: [],
  };
}
