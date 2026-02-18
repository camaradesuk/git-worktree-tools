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
  runInteractiveMode: vi.fn(),
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

      // printStatus('warning', ...) goes through console.log via ui/output.print()
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('GitHub CLI'));
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
          isDraft: null,
          hasChanges: false,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: true, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatJsonOutput).mockReturnValue('[{"path":"/repo"}]');

      await runCli(['--json']);

      // Verify wiring: gatherWorktreeInfo receives correct parameters
      expect(lswt.gatherWorktreeInfo).toHaveBeenCalledWith(
        '/repo', // repoRoot from git.getRepoRoot
        expect.objectContaining({ verbose: false, json: true, showStatus: false }), // options
        mockDeps // deps from createDefaultDeps
      );
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
          isDraft: null,
          hasChanges: false,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatTypeLabel).mockReturnValue({ text: '[main]', color: 'cyan' });
      vi.mocked(lswt.getDisplayPath).mockReturnValue('/repo');

      await runCli([]);

      // Verify wiring: gatherWorktreeInfo receives correct parameters
      expect(lswt.gatherWorktreeInfo).toHaveBeenCalledWith(
        '/repo', // repoRoot from git.getRepoRoot
        expect.objectContaining({ verbose: false, json: false, showStatus: false }), // options
        mockDeps // deps from createDefaultDeps
      );
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

    it('shows commit hash when verbose flag is set', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123def',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: false,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: true, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatTypeLabel).mockReturnValue({ text: '[main]', color: 'cyan' });
      vi.mocked(lswt.getDisplayPath).mockReturnValue('/repo');

      await runCli(['--verbose']);

      // Verify commit is printed in verbose mode (shared printTable uses "Commit" key)
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Commit'));
    });

    it('shows change indicator for worktrees with uncommitted changes', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: true,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatTypeLabel).mockReturnValue({ text: '[main]', color: 'cyan' });
      vi.mocked(lswt.getDisplayPath).mockReturnValue('/repo');

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('with changes'));
    });

    it('shows detached label when branch is missing', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: '',
          commit: 'abc123',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: false,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatTypeLabel).mockReturnValue({ text: '[main]', color: 'cyan' });
      vi.mocked(lswt.getDisplayPath).mockReturnValue('/repo');

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('(detached)'));
    });

    it('shows PR count in summary', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: false,
        },
        {
          path: '/repo.pr42',
          name: 'repo.pr42',
          branch: 'feature-1',
          commit: 'def456',
          type: 'pr' as const,
          prNumber: 42,
          prState: 'OPEN' as const,
          isDraft: false,
          hasChanges: false,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatTypeLabel).mockReturnValue({ text: '[main]', color: 'cyan' });
      vi.mocked(lswt.getDisplayPath).mockReturnValue('/repo');

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('2 worktrees'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('1 PRs'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('1 open'));
    });
  });

  describe('JSON error output', () => {
    it('outputs JSON error when not in git repo with --json', async () => {
      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: true, showStatus: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('');

      await runCli(['--json']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('NOT_GIT_REPO'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error on parse error with --json', async () => {
      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'error',
        message: 'Unknown option: --invalid',
      });

      await runCli(['--json', '--invalid']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('INVALID_ARGUMENT'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('interactive mode', () => {
    it('runs interactive mode when TTY and not JSON', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: false,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false, interactive: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);

      await runCli(['--interactive']);

      expect(lswt.runInteractiveMode).toHaveBeenCalledWith(
        mockWorktrees,
        expect.objectContaining({ interactive: true })
      );
    });

    it('skips interactive mode when --no-interactive is set', async () => {
      const mockWorktrees = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main' as const,
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: false,
        },
      ];
      const mockDeps = {} as ReturnType<typeof lswt.createDefaultDeps>;

      vi.mocked(lswt.parseArgs).mockReturnValue({
        kind: 'success',
        options: { verbose: false, json: false, showStatus: false, interactive: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(lswt.createDefaultDeps).mockReturnValue(mockDeps);
      vi.mocked(lswt.gatherWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(lswt.formatTypeLabel).mockReturnValue({ text: '[main]', color: 'cyan' });
      vi.mocked(lswt.getDisplayPath).mockReturnValue('/repo');

      await runCli(['--no-interactive']);

      expect(lswt.runInteractiveMode).not.toHaveBeenCalled();
    });
  });
});
