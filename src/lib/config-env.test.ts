import { describe, it, expect } from 'vitest';
import { readEnvOverrides, applyEnvOverrides } from './config-env.js';
import { getDefaultConfig } from './config.js';

describe('readEnvOverrides', () => {
  it('returns {} when no GWT_AI_* vars are set', () => {
    expect(readEnvOverrides({})).toEqual({});
  });

  it('parses GWT_AI_PROVIDER', () => {
    expect(readEnvOverrides({ GWT_AI_PROVIDER: 'claude' })).toEqual({ aiProvider: 'claude' });
  });

  it('rejects an invalid GWT_AI_PROVIDER', () => {
    expect(() => readEnvOverrides({ GWT_AI_PROVIDER: 'bogus' })).toThrow('GWT_AI_PROVIDER');
  });

  it('parses GWT_AI_PRIORITY as a trimmed comma-separated list', () => {
    expect(readEnvOverrides({ GWT_AI_PRIORITY: ' openai, claude ,ollama ' })).toEqual({
      aiProviderPriority: ['openai', 'claude', 'ollama'],
    });
  });

  it('rejects an unknown provider inside GWT_AI_PRIORITY', () => {
    expect(() => readEnvOverrides({ GWT_AI_PRIORITY: 'openai,bogus' })).toThrow('GWT_AI_PRIORITY');
  });

  it('rejects "auto" inside GWT_AI_PRIORITY (a meta-value, not a concrete provider)', () => {
    expect(() => readEnvOverrides({ GWT_AI_PRIORITY: 'auto,claude' })).toThrow('GWT_AI_PRIORITY');
  });

  it('parses GWT_NO_AI truthy and falsy values', () => {
    expect(readEnvOverrides({ GWT_NO_AI: '1' })).toEqual({ noAi: true });
    expect(readEnvOverrides({ GWT_NO_AI: 'true' })).toEqual({ noAi: true });
    expect(readEnvOverrides({ GWT_NO_AI: '0' })).toEqual({ noAi: false });
  });

  it('rejects a non-boolean-ish GWT_NO_AI', () => {
    expect(() => readEnvOverrides({ GWT_NO_AI: 'yes' })).toThrow('GWT_NO_AI');
  });

  it('parses GWT_AI_TIMEOUT as a positive integer', () => {
    expect(readEnvOverrides({ GWT_AI_TIMEOUT: '5000' })).toEqual({ aiTimeout: 5000 });
  });

  it('rejects non-integer, zero, or negative GWT_AI_TIMEOUT', () => {
    expect(() => readEnvOverrides({ GWT_AI_TIMEOUT: '5000.5' })).toThrow('GWT_AI_TIMEOUT');
    expect(() => readEnvOverrides({ GWT_AI_TIMEOUT: '0' })).toThrow('GWT_AI_TIMEOUT');
    expect(() => readEnvOverrides({ GWT_AI_TIMEOUT: '-5' })).toThrow('GWT_AI_TIMEOUT');
  });
});

describe('applyEnvOverrides', () => {
  it('is a no-op when there are no overrides', () => {
    const config = getDefaultConfig();
    expect(applyEnvOverrides(config, {})).toBe(config);
  });

  it('applies aiProvider onto config.ai.provider', () => {
    expect(applyEnvOverrides(getDefaultConfig(), { aiProvider: 'claude' }).ai.provider).toBe(
      'claude'
    );
  });

  it('GWT_NO_AI beats GWT_AI_PROVIDER when both are set', () => {
    const result = applyEnvOverrides(getDefaultConfig(), { aiProvider: 'claude', noAi: true });
    expect(result.ai.provider).toBe('none');
  });

  it('applies aiProviderPriority and aiTimeout', () => {
    const result = applyEnvOverrides(getDefaultConfig(), {
      aiProviderPriority: ['openai', 'claude'],
      aiTimeout: 15000,
    });
    expect(result.ai.providerPriority).toEqual(['openai', 'claude']);
    expect(result.ai.timeout).toBe(15000);
  });
});
