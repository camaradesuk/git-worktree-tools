import { describe, it, expect } from 'vitest';
import { resolveProviderModel, resolveProviderTimeout } from './config-resolvers.js';
import { DEFAULT_AI_TIMEOUT_MS } from './types.js';
import type { AIConfig } from './types.js';

describe('resolveProviderModel', () => {
  it('returns undefined when nothing is configured', () => {
    expect(resolveProviderModel({}, 'claude')).toBeUndefined();
  });

  it('reads the new ai.models.<provider> field', () => {
    const config: AIConfig = { models: { claude: 'claude-opus-4-6' } };
    expect(resolveProviderModel(config, 'claude')).toBe('claude-opus-4-6');
  });

  it('falls back to the legacy ai.claude.model field', () => {
    const config: AIConfig = { claude: { model: 'claude-legacy' } };
    expect(resolveProviderModel(config, 'claude')).toBe('claude-legacy');
  });

  it('prefers ai.models.<provider> over the legacy nested field', () => {
    const config: AIConfig = {
      models: { claude: 'claude-new' },
      claude: { model: 'claude-legacy' },
    };
    expect(resolveProviderModel(config, 'claude')).toBe('claude-new');
  });

  it('maps gemini-api model lookups onto the legacy gemini.model field', () => {
    const config: AIConfig = { gemini: { model: 'gemini-legacy' } };
    expect(resolveProviderModel(config, 'gemini-api')).toBe('gemini-legacy');
  });

  it('maps the codex provider (config key "openai") onto ai.openai.model', () => {
    const config: AIConfig = { openai: { model: 'o1-mini' } };
    expect(resolveProviderModel(config, 'openai')).toBe('o1-mini');
  });
});

describe('resolveProviderTimeout', () => {
  it('returns DEFAULT_AI_TIMEOUT_MS when nothing is configured', () => {
    expect(resolveProviderTimeout({}, 'claude')).toBe(DEFAULT_AI_TIMEOUT_MS);
  });

  it('uses ai.timeout as the global default', () => {
    expect(resolveProviderTimeout({ timeout: 15_000 }, 'claude')).toBe(15_000);
  });

  it('prefers ai.providers.<name>.timeout over ai.timeout', () => {
    const config: AIConfig = { timeout: 15_000, providers: { claude: { timeout: 5_000 } } };
    expect(resolveProviderTimeout(config, 'claude')).toBe(5_000);
  });

  it('uses the caller-supplied fallback when neither is configured', () => {
    expect(resolveProviderTimeout({}, 'ollama', 120_000)).toBe(120_000);
  });

  it('still prefers an explicit ai.timeout over the caller-supplied fallback', () => {
    expect(resolveProviderTimeout({ timeout: 9_000 }, 'ollama', 120_000)).toBe(9_000);
  });
});
