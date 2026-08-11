import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIConfig } from './types.js';

vi.mock('./doctor.js', () => ({
  probeCodex: vi.fn(),
  probeClaude: vi.fn(),
  probeGeminiApi: vi.fn(),
  probeOllama: vi.fn(),
  pickAutoProvider: vi.fn(),
}));

import {
  probeCodex,
  probeClaude,
  probeGeminiApi,
  probeOllama,
  pickAutoProvider,
} from './doctor.js';
import { runDiagnostics } from './doctor-report.js';

function mockAllProbes() {
  vi.mocked(probeCodex).mockResolvedValue({
    installed: true,
    authenticated: true,
    reachable: true,
  });
  vi.mocked(probeClaude).mockResolvedValue({
    installed: true,
    authenticated: 'unknown',
    reachable: 'unknown',
  });
  vi.mocked(probeGeminiApi).mockResolvedValue({
    installed: true,
    authenticated: false,
    reachable: 'unknown',
  });
  vi.mocked(probeOllama).mockResolvedValue({
    installed: false,
    authenticated: true,
    reachable: false,
  });
}

describe('runDiagnostics', () => {
  // The plan's original test relies on `mock.calls[0]` to inspect the most
  // recent call to pickAutoProvider, which only isolates correctly if mocks
  // are cleared between tests (this file's vitest.config.ts sets neither
  // clearMocks nor restoreMocks globally). Without this, "honours
  // ai.providerPriority" reads a call left over from an earlier test.
  // Deviation from the plan's literal snippet, documented in the report.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles one diagnostic per provider, in default priority order', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'openai', reason: 'first available' });

    const report = await runDiagnostics({ provider: 'auto' }, { offline: true });

    expect(report.providers.map((p) => p.name)).toEqual([
      'openai',
      'claude',
      'gemini-api',
      'ollama',
    ]);
    expect(report.providers[0].displayName).toBe('codex');
    expect(report.selected).toBe('openai');
  });

  it('passes the configured model and timeout into each diagnostic', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'openai', reason: 'x' });

    const config: AIConfig = {
      provider: 'auto',
      models: { openai: 'gpt-5.6-codex' },
      timeout: 12_000,
    };
    const report = await runDiagnostics(config, { offline: true });

    const codexDiag = report.providers.find((p) => p.name === 'openai')!;
    expect(codexDiag.model).toBe('gpt-5.6-codex');
    expect(codexDiag.timeoutMs).toBe(12_000);
  });

  it('honours ai.providerPriority for ordering and for pickAutoProvider input', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'claude', reason: 'x' });

    await runDiagnostics(
      { provider: 'auto', providerPriority: ['claude', 'openai'] },
      {
        offline: true,
      }
    );

    const [, priorityArg] = vi.mocked(pickAutoProvider).mock.calls[0];
    expect(priorityArg).toEqual(['claude', 'openai']);
  });

  it('surfaces a non-auto configured mode', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'claude', reason: 'configured' });

    const report = await runDiagnostics({ provider: 'claude' }, { offline: true });
    expect(report.configuredMode).toBe('claude');
  });
});
