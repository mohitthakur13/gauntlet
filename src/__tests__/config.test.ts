import { describe, expect, test } from 'vitest';
import { deriveDisplayName, resolveModelAddress, validateConfig } from '../config.js';

const validConfig = {
  models: [
    { id: 'codex', model: 'gpt-5.4', displayName: 'codex', provider: 'openai' },
    { id: 'opus', model: 'claude-opus-4-6', displayName: 'opus', provider: 'anthropic' },
  ],
  defaults: {
    proposerId: 'codex',
    criticIds: ['opus'],
  },
};

describe('deriveDisplayName', () => {
  test.each([
    ['o3', 'o3'],
    ['gpt-4o', 'gpt-4o'],
    ['gpt-5.4', 'gpt-5.4'],
    ['claude-opus-4-6', 'opus'],
    ['claude-sonnet-4-6', 'sonnet'],
    ['claude-haiku-4-5-20251001', 'haiku'],
    ['claude-opus-4-5-20251101', 'opus'],
  ])('deriveDisplayName(%s) → %s', (input, expected) => {
    expect(deriveDisplayName(input)).toBe(expected);
  });
});

describe('resolveModelAddress', () => {
  test('matches by exact id', () => {
    const client = resolveModelAddress('codex');
    expect(client).not.toBeNull();
  });

  test('matches by display name', () => {
    const client = resolveModelAddress('opus');
    expect(client).not.toBeNull();
  });

  test('case-insensitive match', () => {
    const lower = resolveModelAddress('opus');
    const upper = resolveModelAddress('OPUS');
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
  });

  test('unknown id returns null', () => {
    const client = resolveModelAddress('unknown-model-xyz');
    expect(client).toBeNull();
  });
});

describe('config validation — failure paths', () => {
  test('throws or errors on empty criticIds', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        defaults: { proposerId: 'codex', criticIds: [] },
      })
    ).toThrow();
  });

  test('throws or errors on unknown proposerId', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        defaults: { proposerId: 'nonexistent', criticIds: ['opus'] },
      })
    ).toThrow();
  });

  test('throws or errors on unknown criticId', () => {
    expect(() =>
      validateConfig({
        ...validConfig,
        defaults: { proposerId: 'codex', criticIds: ['nonexistent'] },
      })
    ).toThrow();
  });

  test('throws or errors on duplicate model ids in models array', () => {
    const dupeModels = [
      ...validConfig.models,
      { ...validConfig.models[0] },
    ];
    expect(() =>
      validateConfig({ ...validConfig, models: dupeModels })
    ).toThrow();
  });
});
