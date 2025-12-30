import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the CLI
vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
  removeWorktree: vi.fn(),
  pruneWorktrees: vi.fn(),
}));

vi.mock('../lib/github.js', () => ({
  isGhInstalled: vi.fn(),
}));

vi.mock('../lib/prompts.js', () => ({
  promptChoice: vi.fn(),
  promptConfirm: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../lib/cleanpr/index.js', () => ({
  parseArgs: vi.fn(),
  getHelpText: vi.fn(),
  gatherPrWorktreeInfo: vi.fn(),
  createDefaultDeps: vi.fn(),
  groupWorktreesByState: vi.fn(),
  getCleanableWorktrees: vi.fn(),
  findWorktreeByPrNumber: vi.fn(),
  cleanWorktree: vi.fn(),
  summarizeResults: vi.fn(),
}));

// Import after mocking
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import { loadConfig } from '../lib/config.js';
import * as cleanpr from '../lib/cleanpr/index.js';

describe('cli/cleanpr', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];

  const defaultConfig = {
    baseBranch: 'main',
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    draftPr: false,
    sharedRepos: [],
    branchPrefix: 'feature',
    syncPatterns: [],
  };

  const makeWorktreeInfo = (overrides = {}) => ({
    path: '/repo.pr123',
    branch: 'feature-1',
    commit: 'abc123',
    prNumber: 123,
    prState: 'MERGED' as const,
    hasChanges: false,
    ...overrides,
  });

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
    process.argv = ['node', 'cleanpr', ...args];
    await import('./cleanpr.js');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  describe('help option', () => {
    it('prints help and exits 0 on --help', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({ kind: 'help' });
      vi.mocked(cleanpr.getHelpText).mockReturnValue('Usage: cleanpr [options]');

      await runCli(['--help']);

      expect(cleanpr.getHelpText).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: cleanpr [options]');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('error handling', () => {
    it('prints error and exits 1 on parse error', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'error',
        message: 'Invalid option: --invalid',
      });

      await runCli(['--invalid']);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('exits 1 when gh not installed', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: { all: false, force: false, deleteRemote: false, interactive: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(false);

      await runCli([]);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('GitHub CLI'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('exits 1 when not in git repo', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: { all: false, force: false, deleteRemote: false, interactive: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('');

      await runCli([]);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('interactive mode', () => {
    it('shows info message when no PR worktrees found', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: { all: false, force: false, deleteRemote: false, interactive: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: [],
        closed: [],
        open: [],
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue([]);

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No PR worktrees'));
    });
  });

  describe('--all flag', () => {
    it('cleans all merged/closed worktrees in batch mode', async () => {
      const mockWorktrees = [makeWorktreeInfo()];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: { all: true, force: false, deleteRemote: false, interactive: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      vi.mocked(cleanpr.cleanWorktree).mockReturnValue({
        success: true,
        message: 'Cleaned PR #123',
        prNumber: 123,
      });
      vi.mocked(cleanpr.summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await runCli(['--all']);

      expect(cleanpr.cleanWorktree).toHaveBeenCalled();
      expect(cleanpr.summarizeResults).toHaveBeenCalled();
    });

    it('shows info when no cleanable worktrees in --all mode', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: { all: true, force: false, deleteRemote: false, interactive: false },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue([]);

      await runCli(['--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No merged or closed'));
    });
  });

  describe('specific PR mode', () => {
    it('cleans specific PR worktree by number', async () => {
      const mockWorktree = makeWorktreeInfo({ prNumber: 42 });

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: 42,
        options: { all: false, force: false, deleteRemote: false, interactive: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue([mockWorktree]);
      vi.mocked(cleanpr.findWorktreeByPrNumber).mockReturnValue(mockWorktree);
      vi.mocked(cleanpr.cleanWorktree).mockReturnValue({
        success: true,
        message: 'Cleaned PR #42',
        prNumber: 42,
      });

      await runCli(['42']);

      expect(cleanpr.findWorktreeByPrNumber).toHaveBeenCalledWith([mockWorktree], 42);
      expect(cleanpr.cleanWorktree).toHaveBeenCalled();
    });

    it('exits 1 when specific PR not found', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: 999,
        options: { all: false, force: false, deleteRemote: false, interactive: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(cleanpr.findWorktreeByPrNumber).mockReturnValue(undefined);

      await runCli(['999']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('No worktree found'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});
