import configData from './config.json' with { type: 'json' };
import type { ModelName } from './types.js';

export interface ModelConfig {
  model: string;
  displayName: string;
  provider: 'openai' | 'anthropic';
}

export const CODEX_CONFIG: ModelConfig = {
  model: configData.codex.model,
  displayName: configData.codex.displayName,
  provider: 'openai',
};

export const OPUS_CONFIG: ModelConfig = {
  model: configData.opus.model,
  displayName: configData.opus.displayName,
  provider: 'anthropic',
};

export function getModelConfig(name: ModelName): ModelConfig {
  return name === 'codex' ? CODEX_CONFIG : OPUS_CONFIG;
}

export function getModelDisplayName(name: ModelName): string {
  return getModelConfig(name).displayName;
}

export function resolveModelAddress(token: string): ModelName | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'codex' || normalized === CODEX_CONFIG.displayName.toLowerCase()) {
    return 'codex';
  }

  if (normalized === 'opus' || normalized === OPUS_CONFIG.displayName.toLowerCase()) {
    return 'opus';
  }

  return null;
}
