/**
 * Tests for run-command helper module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import path from 'path';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 }) as SpawnSyncReturns<Buffer>),
}));

// Import after mocking
const { runSubcommand, runSubcommandForResult, getCliPath } = await import('./run-command.js');

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('run-command helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockClear();
  });

  describe('runSubcommand', () => {
    it('spawns the correct CLI with arguments', () => {
      runSubcommand('newpr', ['--json', 'test description']);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--json', 'test description']),
        expect.objectContaining({
          stdio: 'inherit',
          env: process.env,
        })
      );
    });

    it('resolves CLI path correctly', () => {
      runSubcommand('lswt', []);

      const calledPath = (spawnSync as ReturnType<typeof vi.fn>).mock.calls[0][1][0];
      expect(calledPath).toContain('lswt.js');
      expect(path.isAbsolute(calledPath)).toBe(true);
    });

    it('exits with spawn result status code', () => {
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({ status: 0 });
      runSubcommand('cleanpr', ['--all']);
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('exits with status 1 when spawn result status is null', () => {
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({ status: null });
      runSubcommand('wtstate', []);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with non-zero status on failure', () => {
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({ status: 2 });
      runSubcommand('wtlink', ['validate']);
      expect(mockExit).toHaveBeenCalledWith(2);
    });
  });

  describe('runSubcommandForResult', () => {
    it('spawns the correct CLI and returns result', () => {
      const expectedResult = { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(expectedResult);

      const result = runSubcommandForResult('wtconfig', ['show']);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['show']),
        expect.objectContaining({
          stdio: 'inherit',
          env: process.env,
        })
      );
      expect(result).toBe(expectedResult);
    });

    it('does not call process.exit', () => {
      runSubcommandForResult('newpr', ['--help']);
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('getCliPath', () => {
    it('returns absolute path to CLI script', () => {
      const cliPath = getCliPath('newpr');
      expect(path.isAbsolute(cliPath)).toBe(true);
      expect(cliPath).toContain('newpr.js');
    });

    it('resolves path relative to wt directory', () => {
      const cliPath = getCliPath('lswt');
      // Path should be one level up from wt directory
      expect(cliPath).toMatch(/cli[/\\]lswt\.js$/);
    });

    it('returns correct paths for all CLI tools', () => {
      const cliNames = ['newpr', 'lswt', 'cleanpr', 'wtlink', 'wtstate', 'wtconfig'];

      for (const name of cliNames) {
        const cliPath = getCliPath(name);
        expect(cliPath).toContain(`${name}.js`);
        expect(path.isAbsolute(cliPath)).toBe(true);
      }
    });
  });
});
