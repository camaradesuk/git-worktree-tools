import { describe, it, expect } from 'vitest';
import { pickAutoProvider, type ProviderDiagnostic } from './doctor.js';

function diag(name: string, overrides: Partial<ProviderDiagnostic> = {}): ProviderDiagnostic {
  return {
    name,
    displayName: name,
    installed: true,
    authenticated: true,
    reachable: true,
    model: undefined,
    timeoutMs: 60_000,
    error: undefined,
    ...overrides,
  };
}

describe('pickAutoProvider', () => {
  it('picks the first provider in priority order that is installed', () => {
    const result = pickAutoProvider([diag('openai'), diag('claude')], ['openai', 'claude']);
    expect(result.selected).toBe('openai');
    expect(result.reason).toContain('installed');
  });

  it('skips a provider that is not installed', () => {
    const result = pickAutoProvider(
      [diag('openai', { installed: false }), diag('claude')],
      ['openai', 'claude']
    );
    expect(result.selected).toBe('claude');
  });

  it('skips a provider whose authenticated check explicitly failed', () => {
    const result = pickAutoProvider(
      [diag('gemini-api', { authenticated: false }), diag('ollama')],
      ['gemini-api', 'ollama']
    );
    expect(result.selected).toBe('ollama');
  });

  it('does NOT skip a provider whose authenticated check is merely "unknown"', () => {
    // Mirrors the manager's cheap-availability semantics on purpose.
    const result = pickAutoProvider([diag('claude', { authenticated: 'unknown' })], ['claude']);
    expect(result.selected).toBe('claude');
  });

  it('returns null with a reason when nothing is installed', () => {
    const result = pickAutoProvider(
      [diag('openai', { installed: false }), diag('claude', { installed: false })],
      ['openai', 'claude']
    );
    expect(result.selected).toBeNull();
    expect(result.reason).toContain('no provider');
  });

  it('flags a selected-but-unreachable provider (the GEMINI_API_KEY bug, reproduced)', () => {
    const result = pickAutoProvider(
      [
        diag('gemini-api', {
          authenticated: true,
          reachable: false,
          error: 'HTTP 400: API_KEY_INVALID',
        }),
      ],
      ['gemini-api']
    );

    expect(result.selected).toBe('gemini-api');
    expect(result.warning).toContain('API_KEY_INVALID');
  });

  it('ignores priority entries with no matching diagnostic', () => {
    const result = pickAutoProvider([diag('claude')], ['openai', 'claude']);
    expect(result.selected).toBe('claude');
  });
});
