import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CodexClient } from './models/codex.js';
import { OpusClient } from './models/opus.js';
import type {
  ModelClient,
  ModelDefaults,
  ModelDefinition,
  ModelId,
  ReplState,
} from './types.js';

interface AppConfig {
  models: ModelDefinition[];
  defaults: ModelDefaults;
}

interface StartupValidationOptions {
  configPath?: string;
  envPath?: string;
  env?: Record<string, string | undefined>;
}

export interface StartupDiagnostic {
  warnings: string[];
  errors: string[];
}

export const MODEL_CONFIGS: ModelDefinition[] = [];

const MODEL_CONFIG_BY_ID = new Map<ModelId, ModelDefinition>();

const PROVIDERS: Record<string, (entry: ModelDefinition, apiKey: string) => ModelClient> = {
  openai: (entry, apiKey) => new CodexClient(entry.id, entry.model, entry.displayName, apiKey),
  anthropic: (entry, apiKey) => new OpusClient(entry.id, entry.model, entry.displayName, apiKey),
};

const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

let cachedConfig: AppConfig | null = null;

function getDefaultConfigPath(): string {
  return fileURLToPath(new URL('./config.json', import.meta.url));
}

function getDefaultEnvPath(): string {
  return fileURLToPath(new URL('../.env', import.meta.url));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stripDiagnosticPrefix(message: string): string {
  return message.replace(/^[⚠✗]\s+/, '');
}

function readConfigFile(configPath: string): { value?: unknown; error?: string } {
  if (!existsSync(configPath)) {
    return { error: '✗ config.json: file not found' };
  }

  let raw = '';
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    return {
      error: `✗ config.json: invalid JSON — ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { error: '✗ config.json: invalid JSON — top-level value must be an object' };
    }
    return { value: parsed };
  } catch (error) {
    return {
      error: `✗ config.json: invalid JSON — ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function collectConfigErrors(config: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(config)) {
    return ['✗ config.json: invalid JSON — top-level value must be an object'];
  }

  const { models, defaults } = config;

  if (!Array.isArray(models)) {
    errors.push('✗ config.json: missing "models" array');
  } else if (models.length === 0) {
    errors.push('✗ config.json: "models" array must not be empty');
  }

  if (!isRecord(defaults)) {
    errors.push('✗ config.json: missing "defaults" object');
  } else {
    if (!isNonEmptyString(defaults.proposerId)) {
      errors.push('✗ config.json: missing "defaults.proposerId" string');
    }

    if (!Array.isArray(defaults.criticIds)) {
      errors.push('✗ config.json: missing "defaults.criticIds" array of strings');
    } else if (defaults.criticIds.length === 0) {
      errors.push('✗ config.json: "defaults.criticIds" must not be empty');
    } else if (defaults.criticIds.some((criticId) => !isNonEmptyString(criticId))) {
      errors.push('✗ config.json: "defaults.criticIds" must be an array of strings');
    }
  }

  if (!Array.isArray(models)) {
    return errors;
  }

  for (const [index, entry] of models.entries()) {
    if (!isRecord(entry) || !isNonEmptyString(entry.id)) {
      errors.push(`✗ config.json: model at index ${index} is missing "id"`);
    }
    if (!isRecord(entry) || !isNonEmptyString(entry.model)) {
      errors.push(`✗ config.json: model at index ${index} is missing "model"`);
    }
    if (!isRecord(entry) || !isNonEmptyString(entry.displayName)) {
      errors.push(`✗ config.json: model at index ${index} is missing "displayName"`);
    }
    if (!isRecord(entry) || !isNonEmptyString(entry.provider)) {
      errors.push(`✗ config.json: model at index ${index} is missing "provider"`);
    }
  }

  const ids = new Map<string, number>();
  for (const entry of models) {
    if (!isRecord(entry) || !isNonEmptyString(entry.id)) {
      continue;
    }
    ids.set(entry.id, (ids.get(entry.id) ?? 0) + 1);
  }

  for (const [id, count] of ids.entries()) {
    if (count > 1) {
      errors.push(`✗ config.json: duplicate model id "${id}" (appears ${count} times)`);
    }
  }

  const availableProviders = Object.keys(PROVIDERS).join(', ');
  for (const entry of models) {
    if (!isRecord(entry) || !isNonEmptyString(entry.id) || !isNonEmptyString(entry.provider)) {
      continue;
    }
    if (!(entry.provider in PROVIDERS)) {
      errors.push(
        `✗ config.json: model "${entry.id}" uses unknown provider "${entry.provider}". Available providers: ${availableProviders}`
      );
    }
  }

  if (!isRecord(defaults) || !isNonEmptyString(defaults.proposerId) || !Array.isArray(defaults.criticIds)) {
    return errors;
  }

  const availableModelIds = [...ids.keys()];
  const availableLabel = availableModelIds.join(', ');
  if (!ids.has(defaults.proposerId)) {
    errors.push(
      `✗ config.json: defaults.proposerId "${defaults.proposerId}" does not match any model id. Available models: ${availableLabel}`
    );
  }

  for (const criticId of defaults.criticIds) {
    if (!isNonEmptyString(criticId) || ids.has(criticId)) {
      continue;
    }
    errors.push(
      `✗ config.json: defaults.criticIds contains "${criticId}" which does not match any model id. Available models: ${availableLabel}`
    );
  }

  return errors;
}

function applyConfig(config: AppConfig): AppConfig {
  cachedConfig = config;
  MODEL_CONFIGS.splice(0, MODEL_CONFIGS.length, ...config.models);
  MODEL_CONFIG_BY_ID.clear();
  for (const entry of config.models) {
    MODEL_CONFIG_BY_ID.set(entry.id, entry);
  }
  return config;
}

function loadValidatedConfig(configPath = getDefaultConfigPath()): AppConfig {
  const result = readConfigFile(configPath);
  if (result.error) {
    throw new Error(stripDiagnosticPrefix(result.error));
  }

  const errors = collectConfigErrors(result.value);
  if (errors.length > 0) {
    throw new Error(stripDiagnosticPrefix(errors[0]));
  }

  return result.value as AppConfig;
}

function ensureRuntimeConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  return applyConfig(loadValidatedConfig());
}

function initializeRuntimeConfig(): void {
  try {
    applyConfig(loadValidatedConfig());
  } catch {
    // Startup validation handles reporting; keep module import safe.
  }
}

export function getRequiredEnvKey(provider: string): string | null {
  return PROVIDER_ENV_KEYS[provider] ?? null;
}

function getApiKey(provider: string): string {
  const envKey = getRequiredEnvKey(provider);
  return envKey ? process.env[envKey] ?? '' : '';
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
} = ensureRuntimeConfig()): void {
  const errors = collectConfigErrors(config);
  if (errors.length > 0) {
    throw new Error(stripDiagnosticPrefix(errors[0]));
  }
}

export function validateStartup(options: StartupValidationOptions = {}): StartupDiagnostic {
  const warnings: string[] = [];
  const errors: string[] = [];

  const configPath = options.configPath ?? getDefaultConfigPath();
  const envPath = options.envPath ?? getDefaultEnvPath();
  const env = options.env ?? process.env;

  const configResult = readConfigFile(configPath);
  if (configResult.error) {
    errors.push(configResult.error);
    return { warnings, errors };
  }

  errors.push(...collectConfigErrors(configResult.value));

  if (errors.length > 0) {
    return { warnings, errors };
  }

  const config = configResult.value as AppConfig;
  const envMissing = !existsSync(envPath);
  if (envMissing) {
    warnings.push('⚠ No .env file found. Copy .env.example to .env and add your API keys.');
    return { warnings, errors };
  }

  const missingByEnvKey = new Map<string, { envKey: string; modelNames: string[] }>();
  for (const entry of config.models) {
    const envKey = getRequiredEnvKey(entry.provider);
    if (!envKey || isNonEmptyString(env[envKey])) {
      continue;
    }

    const warning = missingByEnvKey.get(envKey) ?? { envKey, modelNames: [] };
    warning.modelNames.push(entry.displayName || entry.id);
    missingByEnvKey.set(envKey, warning);
  }

  for (const { envKey, modelNames } of missingByEnvKey.values()) {
    warnings.push(
      `⚠ Missing ${envKey} — ${modelNames.join(', ')} will not work. Add it to .env and restart.`
    );
  }

  return { warnings, errors };
}

export function createClients(): Map<ModelId, ModelClient> {
  const config = ensureRuntimeConfig();
  validateConfig(config);

  const clients = new Map<ModelId, ModelClient>();
  for (const entry of config.models) {
    const factory = PROVIDERS[entry.provider];
    if (!factory) {
      throw new Error(`Unknown provider: ${entry.provider}`);
    }

    clients.set(entry.id, factory(entry, getApiKey(entry.provider)));
  }

  return clients;
}

export function getModelConfig(id: ModelId): ModelDefinition {
  ensureRuntimeConfig();
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
  ensureRuntimeConfig();
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
  const config = ensureRuntimeConfig();
  return {
    proposerId: config.defaults.proposerId,
    criticIds: [...config.defaults.criticIds],
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

initializeRuntimeConfig();
