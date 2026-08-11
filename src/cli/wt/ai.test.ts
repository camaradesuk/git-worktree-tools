import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/ai/doctor-report.js', () => ({ runDiagnostics: vi.fn() }));
vi.mock('../../lib/config.js', () => ({ loadConfig: vi.fn() }));
vi.mock('../../lib/git.js', () => ({ getRepoRoot: vi.fn(() => '/repo') }));

import { runDiagnostics } from '../../lib/ai/doctor-report.js';
import { loadConfig } from '../../lib/config.js';
import { aiCommand } from './ai.js';

const FAKE_REPORT = {
  configuredMode: 'auto',
  providers: [
    {
      name: 'openai',
      displayName: 'codex',
      installed: true,
      authenticated: true,
      reachable: true,
      model: undefined,
      timeoutMs: 60000,
    },
    {
      name: 'gemini-api',
      displayName: 'gemini-api',
      installed: true,
      authenticated: true,
      reachable: false,
      model: undefined,
      timeoutMs: 60000,
      error: 'API_KEY_INVALID: API key not valid.',
    },
  ],
  selected: 'openai',
  selectionReason: 'codex is installed and authenticated, first in priority order',
};

describe('wt ai doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockReturnValue({ ai: { provider: 'auto' } } as never);
    vi.mocked(runDiagnostics).mockResolvedValue(FAKE_REPORT as never);
  });

  it('prints JSON with --json and does not exit 1', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'doctor',
      json: true,
    });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.success).toBe(true);
    expect(output.data.selected).toBe('openai');
    expect(exitSpy).not.toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes --offline through to runDiagnostics', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'doctor',
      json: true,
      offline: true,
    });
    expect(runDiagnostics).toHaveBeenCalledWith(expect.anything(), { offline: true });
  });

  it('defaults offline to false', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'doctor',
      json: true,
    });
    expect(runDiagnostics).toHaveBeenCalledWith(expect.anything(), { offline: false });
  });

  it('exits 1 with INVALID_ARGUMENT on an unknown subcommand', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'bogus',
      json: true,
    });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.success).toBe(false);
    expect(output.error.code).toBe('INVALID_ARGUMENT');
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
