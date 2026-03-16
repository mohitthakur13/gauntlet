import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { deriveDisplayName, resolveModelAddress, validateConfig, validateStartup } from '../config.js';

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

function makeFixtureDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'gauntlet-config-test-'));
}

function writeConfigFixture(dir: string, value: unknown): string {
  const configPath = path.join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify(value, null, 2));
  return configPath;
}

describe('validateStartup', () => {
  test('reports missing config.json as a fatal error', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: path.join(dir, 'config.json'),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toEqual(['✗ config.json: file not found']);
    expect(diagnostics.warnings).toEqual([]);
  });

  test('reports invalid JSON with the parse message', () => {
    const dir = makeFixtureDir();
    const configPath = path.join(dir, 'config.json');
    writeFileSync(configPath, '{"models": [');

    const diagnostics = validateStartup({
      configPath,
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toHaveLength(1);
    expect(diagnostics.errors[0]).toContain('✗ config.json: invalid JSON');
  });

  test('reports missing models array', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, { defaults: validConfig.defaults }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain('✗ config.json: missing "models" array');
  });

  test('reports empty models array', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, { models: [], defaults: validConfig.defaults }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain('✗ config.json: "models" array must not be empty');
  });

  test('reports missing defaults object', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, { models: validConfig.models }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain('✗ config.json: missing "defaults" object');
  });

  test('reports missing model fields with the entry index', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, {
        models: [{ id: 'codex', model: 'gpt-5.4', displayName: 'codex' }],
        defaults: validConfig.defaults,
      }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain('✗ config.json: model at index 0 is missing "provider"');
  });

  test('reports duplicate model ids', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, {
        ...validConfig,
        models: [...validConfig.models, { ...validConfig.models[1] }],
      }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain('✗ config.json: duplicate model id "opus" (appears 2 times)');
  });

  test('reports unknown providers with available options', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, {
        ...validConfig,
        models: [
          ...validConfig.models,
          { id: 'gemini', model: 'gemini-2.5-pro', displayName: 'gemini', provider: 'google' },
        ],
      }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain(
      '✗ config.json: model "gemini" uses unknown provider "google". Available providers: openai, anthropic'
    );
  });

  test('reports invalid proposer references', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, {
        ...validConfig,
        defaults: { proposerId: 'gpt4', criticIds: ['opus'] },
      }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain(
      '✗ config.json: defaults.proposerId "gpt4" does not match any model id. Available models: codex, opus'
    );
  });

  test('reports invalid critic references', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, {
        ...validConfig,
        defaults: { proposerId: 'codex', criticIds: ['sonnet'] },
      }),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toContain(
      '✗ config.json: defaults.criticIds contains "sonnet" which does not match any model id. Available models: codex, opus'
    );
  });

  test('warns for a missing API key', () => {
    const dir = makeFixtureDir();
    const envPath = path.join(dir, '.env');
    writeFileSync(envPath, 'OPENAI_API_KEY=test\n');

    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, validConfig),
      envPath,
      env: { OPENAI_API_KEY: 'test' },
    });

    expect(diagnostics.errors).toEqual([]);
    expect(diagnostics.warnings).toEqual([
      '⚠ Missing ANTHROPIC_API_KEY — opus will not work. Add it to .env and restart.',
    ]);
  });

  test('deduplicates missing API key warnings by provider', () => {
    const dir = makeFixtureDir();
    const envPath = path.join(dir, '.env');
    writeFileSync(envPath, '');

    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, {
        ...validConfig,
        models: [
          ...validConfig.models,
          {
            id: 'sonnet',
            model: 'claude-sonnet-4-6',
            displayName: 'sonnet',
            provider: 'anthropic',
          },
        ],
      }),
      envPath,
      env: {},
    });

    expect(diagnostics.warnings).toEqual([
      '⚠ Missing OPENAI_API_KEY — codex will not work. Add it to .env and restart.',
      '⚠ Missing ANTHROPIC_API_KEY — opus, sonnet will not work. Add it to .env and restart.',
    ]);
  });

  test('warns when .env is missing and skips per-key warnings', () => {
    const dir = makeFixtureDir();
    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, validConfig),
      envPath: path.join(dir, '.env'),
      env: {},
    });

    expect(diagnostics.errors).toEqual([]);
    expect(diagnostics.warnings).toEqual([
      '⚠ No .env file found. Copy .env.example to .env and add your API keys.',
    ]);
  });

  test('returns no diagnostics for a valid config with keys present', () => {
    const dir = makeFixtureDir();
    const envPath = path.join(dir, '.env');
    writeFileSync(envPath, 'OPENAI_API_KEY=test\nANTHROPIC_API_KEY=test\n');

    const diagnostics = validateStartup({
      configPath: writeConfigFixture(dir, validConfig),
      envPath,
      env: {
        OPENAI_API_KEY: 'test',
        ANTHROPIC_API_KEY: 'test',
      },
    });

    expect(diagnostics).toEqual({ warnings: [], errors: [] });
  });
});
