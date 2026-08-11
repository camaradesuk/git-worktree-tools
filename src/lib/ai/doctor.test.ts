import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import {
  pickAutoProvider,
  probeCodex,
  probeClaude,
  probeGeminiApi,
  probeOllama,
  type ProviderDiagnostic,
} from './doctor.js';

vi.mock('child_process');

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

// --- Real per-provider probes -----------------------------------------
//
// Every spawnSync/fetch call is mocked. These tests must never spend real
// quota or contact a real provider — that only happens when a human runs
// `wt ai doctor` for real (see the manual smoke test in the PR/report).

function commandFoundResult(path: string) {
  return { status: 0, stdout: path, stderr: '', pid: 0, output: [], signal: null };
}

function commandNotFoundResult() {
  return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
}

describe('probeCodex', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('reports not installed and makes no live call when codex is missing', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'which' || cmd === 'where') return commandNotFoundResult();
      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });

    const result = await probeCodex({ offline: false });

    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe('unknown');
    expect(result.reachable).toBe('unknown');
    expect(vi.mocked(spawnSync).mock.calls.some(([cmd]) => cmd === 'codex')).toBe(false);
  });

  it('is installed+authenticated but makes no live exec call in offline mode', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'which' || cmd === 'where') return commandFoundResult('/usr/bin/codex');
      if (cmd === 'codex' && (args as string[])[0] === 'login') {
        return {
          status: 0,
          stdout: 'Logged in using ChatGPT',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        };
      }
      throw new Error(`unexpected spawnSync call: ${cmd} ${JSON.stringify(args)}`);
    });

    const result = await probeCodex({ offline: true });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.reachable).toBe('unknown');
    expect(
      vi
        .mocked(spawnSync)
        .mock.calls.some(([cmd, args]) => cmd === 'codex' && (args as string[])[0] === 'exec')
    ).toBe(false);
  });

  it('reports authenticated:false and skips the live probe (even online) when not logged in', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'which' || cmd === 'where') return commandFoundResult('/usr/bin/codex');
      if (cmd === 'codex' && (args as string[])[0] === 'login') {
        return { status: 1, stdout: 'Not logged in', stderr: '', pid: 0, output: [], signal: null };
      }
      throw new Error(`unexpected spawnSync call: ${cmd} ${JSON.stringify(args)}`);
    });

    const result = await probeCodex({ offline: false });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.reachable).toBe('unknown');
    expect(
      vi
        .mocked(spawnSync)
        .mock.calls.some(([cmd, args]) => cmd === 'codex' && (args as string[])[0] === 'exec')
    ).toBe(false);
  });

  it('probes reachability live when authenticated and online: success writes and reads the output file', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'which' || cmd === 'where') return commandFoundResult('/usr/bin/codex');
      const argv = args as string[];
      if (cmd === 'codex' && argv[0] === 'login') {
        return {
          status: 0,
          stdout: 'Logged in using ChatGPT',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        };
      }
      if (cmd === 'codex' && argv[0] === 'exec') {
        const outputFile = argv[argv.indexOf('--output-last-message') + 1];
        fs.writeFileSync(outputFile, 'OK', 'utf-8');
        return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
      }
      throw new Error(`unexpected spawnSync call: ${cmd} ${JSON.stringify(argv)}`);
    });

    const result = await probeCodex({ offline: false });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.reachable).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('reports reachable:false with the failure detail on a live probe failure', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'which' || cmd === 'where') return commandFoundResult('/usr/bin/codex');
      const argv = args as string[];
      if (cmd === 'codex' && argv[0] === 'login') {
        return {
          status: 0,
          stdout: 'Logged in using ChatGPT',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        };
      }
      if (cmd === 'codex' && argv[0] === 'exec') {
        return { status: 1, stdout: '', stderr: 'boom', pid: 0, output: [], signal: null };
      }
      throw new Error(`unexpected spawnSync call: ${cmd} ${JSON.stringify(argv)}`);
    });

    const result = await probeCodex({ offline: false });

    expect(result.reachable).toBe(false);
    expect(result.error).toContain('boom');
  });
});

describe('probeClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports not installed and makes no live call when claude is missing', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'which' || cmd === 'where') return commandNotFoundResult();
      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });

    const result = await probeClaude({ offline: false });

    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe('unknown');
    expect(result.reachable).toBe('unknown');
    expect(vi.mocked(spawnSync).mock.calls.some(([cmd]) => cmd === 'claude')).toBe(false);
  });

  it('stays honestly "unknown" (no credentials-file heuristic) and makes no live call offline', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'which' || cmd === 'where') return commandFoundResult('/usr/bin/claude');
      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });

    const result = await probeClaude({ offline: true });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe('unknown');
    expect(result.reachable).toBe('unknown');
    expect(vi.mocked(spawnSync).mock.calls.some(([cmd]) => cmd === 'claude')).toBe(false);
  });

  it('marks authenticated+reachable true only after a real live probe succeeds', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'which' || cmd === 'where') return commandFoundResult('/usr/bin/claude');
      if (cmd === 'claude') {
        return { status: 0, stdout: 'OK', stderr: '', pid: 0, output: [], signal: null };
      }
      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });

    const result = await probeClaude({ offline: false });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.reachable).toBe(true);
  });

  it('maps a live failure to reachable:false, authenticated stays unknown (not provably false)', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'which' || cmd === 'where') return commandFoundResult('/usr/bin/claude');
      if (cmd === 'claude') {
        return {
          status: 1,
          stdout: '',
          stderr: 'not authenticated',
          pid: 0,
          output: [],
          signal: null,
        };
      }
      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });

    const result = await probeClaude({ offline: false });

    expect(result.reachable).toBe(false);
    expect(result.authenticated).toBe('unknown');
    expect(result.error).toContain('not authenticated');
  });
});

describe('probeGeminiApi', () => {
  const originalEnv = process.env;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('reports authenticated:false with no live call when GEMINI_API_KEY is unset', async () => {
    delete process.env.GEMINI_API_KEY;

    const result = await probeGeminiApi({ offline: false });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.reachable).toBe('unknown');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports authenticated:true, reachable:unknown, and makes no live call in offline mode', async () => {
    process.env.GEMINI_API_KEY = 'some-key';

    const result = await probeGeminiApi({ offline: true });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.reachable).toBe('unknown');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports reachable:true on a live success', async () => {
    process.env.GEMINI_API_KEY = 'valid-key';
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
    });

    const result = await probeGeminiApi({ offline: false });

    expect(result.reachable).toBe(true);
  });

  it("maps a live HTTP 400 API_KEY_INVALID failure to reachable:false with the reason in error (this repo's real repro)", async () => {
    process.env.GEMINI_API_KEY = 'invalid-key';
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
            reason: 'API_KEY_INVALID',
          },
        }),
    });

    const result = await probeGeminiApi({ offline: false });

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('API_KEY_INVALID');
  });
});

describe('probeOllama', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is reachable when curl succeeds, and runs even in offline mode (free + local)', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'curl') {
        return { status: 0, stdout: '{"models":[]}', stderr: '', pid: 0, output: [], signal: null };
      }
      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });

    const result = await probeOllama({ offline: true });

    expect(result.installed).toBe(true);
    expect(result.reachable).toBe(true);
    expect(vi.mocked(spawnSync).mock.calls.some(([cmd]) => cmd === 'curl')).toBe(true);
  });

  it('reports not installed/unreachable when curl fails (no local ollama)', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'curl') {
        return {
          status: 7,
          stdout: '',
          stderr: 'connection refused',
          pid: 0,
          output: [],
          signal: null,
        };
      }
      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });

    const result = await probeOllama({ offline: false });

    expect(result.installed).toBe(false);
    expect(result.reachable).toBe(false);
  });
});
