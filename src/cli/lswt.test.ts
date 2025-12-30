import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the CLI
vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../lib/github.js', () => ({
  isGhInstalled: vi.fn(),
}));

vi.mock('../lib/lswt/index.js', () => ({
  parseArgs: vi.fn(),
  getHelpText: vi.fn(),
  formatTypeLabel: vi.fn(),
  getDisplayPath: vi.fn(),
  formatJsonOutput: vi.fn(),
  gatherWorktreeInfo: vi.fn(),
  createDefaultDeps: vi.fn(),
}));

// Import after mocking
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as lswt from '../lib/lswt/index.js';

describe('cli/lswt', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetAllMocks();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // @ts-expect-error - process.exit mock type is complex
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    originalArgv = process.argv;
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
    process.argv = originalArgv;
    vi.resetModules();
  });

  async function runCli(args: string[] = []): Promise<void> {
    process.argv = ['node', 'lswt', ...args];
    // Re-import to trigger main()
    await import('./lswt.js');
    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  describe('help option', () => {
    it('prints help and exits 0 on --help', async () => {
      vi.mocked(lswt.parseArgs).mockReturnValue({ kind: 'help' });
      vi.mocked(lswt.getHelpText).mockReturnValue('Usage: lswt [options]');

      await runCli(['--help']);

      expect(lswt.getHelpText).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: lswt [options]');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('error handling', () => {
    it('prints error and exits 1 on parse error', async () => {
      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'error',
        message: 'Unknown option: --invalid',
      });

      await runCli(['--invalid']);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('exits 1 when not in git repo', async () => {
      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('');

      await runCli([]);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('status flag', () => {
    it('warns when gh not installed and status requested', async () => {
      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(false);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof lswt.createDefaultDeps>
      );
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue([]);

      await runCli(['--status']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('GitHub CLI'));
    });
  });

  describe('json output', () => {
    it('outputs JSON when --json flag is set', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          hasChanges: false,
        },
      ];

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: true, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof lswt.createDefaultDeps>
      );
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatJsonOutput).mockReturnValue('[{"path":"/repo"}]');

      await runCli(['--json']);

      expect(lswt.formatJsonOutput).toHaveBeenCalledWith(mockWorktrees);
      expect(mockConsoleLog).toHaveBeenCalledWith('[{"path":"/repo"}]');
    });
  });

  describe('table output', () => {
    it('prints table for normal output', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          hasChanges: false,
        },
      ];

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof lswt.createDefaultDeps>
      );
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatTypeLabel).mockReturnValue({ text: '[main]', color: 'cyan' });
      vi.mocked(lswt.getDisplayPath).mockReturnValue('/repo');

      await runCli([]);

      expect(lswt.formatTypeLabel).toHaveBeenCalledWith(mockWorktrees[0]);
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('shows empty message when no worktrees', async () => {
      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof lswt.createDefaultDeps>
      );
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue([]);

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No worktrees'));
    });
  });
});
