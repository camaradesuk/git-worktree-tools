import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIConfig } from './types.js';

// Partial mock: keep the real (pure) describeSelectionWarning, mock only the
// probes, which are the parts that would otherwise touch a real subprocess.
vi.mock('./doctor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./doctor.js')>();
  return {
    ...actual,
    probeCodex: vi.fn(),
    probeClaude: vi.fn(),
    probeGeminiApi: vi.fn(),
    probeOllama: vi.fn(),
  };
});

// Selection is sourced from the real manager's getAutoSelectionPreview(),
// not re-derived — mock the manager itself so tests control what it reports
// without spawning any real subprocess/network call.
vi.mock('./provider-manager.js', () => ({
  AIProviderManager: vi.fn(),
}));

import { probeCodex, probeClaude, probeGeminiApi, probeOllama } from './doctor.js';
import { AIProviderManager } from './provider-manager.js';
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

/** Stub what the (mocked) real manager reports it would select. */
function mockManagerSelection(selected: string | null, priority: string[] = []) {
  vi.mocked(AIProviderManager).mockImplementation(
    () =>
      ({
        getAutoSelectionPreview: vi.fn().mockResolvedValue({ priority, selected }),
      }) as unknown as AIProviderManager
  );
}

describe('runDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles one diagnostic per provider, in default priority order', async () => {
    mockAllProbes();
    mockManagerSelection('openai');

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
    mockManagerSelection('openai');

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

  it('honours ai.providerPriority for probe ordering AND passes the same config to the manager', async () => {
    mockAllProbes();
    mockManagerSelection('claude');

    const report = await runDiagnostics(
      { provider: 'auto', providerPriority: ['claude', 'openai'] },
      { offline: true }
    );

    expect(report.providers.map((p) => p.name)).toEqual(['claude', 'openai']);
    // The manager must see the SAME config (including providerPriority) that
    // drove the probe ordering, so its selection can't silently diverge.
    const [managerArgs] = vi.mocked(AIProviderManager).mock.calls[0];
    expect(managerArgs.config?.providerPriority).toEqual(['claude', 'openai']);
  });

  it('surfaces a non-auto configured mode', async () => {
    mockAllProbes();
    mockManagerSelection('claude');

    const report = await runDiagnostics({ provider: 'claude' }, { offline: true });
    expect(report.configuredMode).toBe('claude');
  });

  it("reports the manager's REAL selection even when a higher-priority provider looks unauthenticated to the doctor (divergence guard)", async () => {
    // codex is installed but its OWN probe (codex login status) says
    // authenticated:false; claude is installed and authenticated. The
    // MANAGER has no "authenticated" concept at all for CLI providers — it
    // picks purely on `commandExists`, so it still selects codex first. A
    // doctor that re-derived selection from its own auth-aware diagnostics
    // (the old pickAutoProvider) would wrongly report claude here instead.
    vi.mocked(probeCodex).mockResolvedValue({
      installed: true,
      authenticated: false,
      reachable: 'unknown',
    });
    vi.mocked(probeClaude).mockResolvedValue({
      installed: true,
      authenticated: true,
      reachable: true,
    });
    vi.mocked(probeGeminiApi).mockResolvedValue({
      installed: false,
      authenticated: false,
      reachable: 'unknown',
    });
    vi.mocked(probeOllama).mockResolvedValue({
      installed: false,
      authenticated: true,
      reachable: false,
    });
    mockManagerSelection('openai');

    const report = await runDiagnostics({ provider: 'auto' }, { offline: true });

    expect(report.selected).toBe('openai');
    expect(report.selectionWarning).toContain('not appear to be authenticated');
  });

  it('returns null selected and no warning when the manager finds nothing available', async () => {
    mockAllProbes();
    mockManagerSelection(null);

    const report = await runDiagnostics({ provider: 'auto' }, { offline: true });

    expect(report.selected).toBeNull();
    expect(report.selectionWarning).toBeUndefined();
    expect(report.selectionReason).toContain('no provider');
  });
});
