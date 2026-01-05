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
    preferredEditor: 'auto' as const,
    ai: { provider: 'none' as const },
    hooks: {},
    hookDefaults: { timeout: 30000, maxTimeout: 60000 },
    plugins: [],
    generators: {},
    integrations: {},
    logging: { level: 'info' as const, timestamps: true },
    global: { warnNotGlobal: true },
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
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
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
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
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
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
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

    it('displays grouped worktrees in interactive mode', async () => {
      const mockWorktrees = [
        makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' }),
        makeWorktreeInfo({ prNumber: 2, prState: 'CLOSED' }),
        makeWorktreeInfo({ prNumber: 3, prState: 'OPEN' }),
      ];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: [mockWorktrees[0]],
        closed: [mockWorktrees[1]],
        open: [mockWorktrees[2]],
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue([]);

      await runCli([]);

      expect(cleanpr.groupWorktreesByState).toHaveBeenCalledWith(mockWorktrees);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR Worktrees'));
    });

    it('shows no cleanable message when only open PRs exist', async () => {
      const mockWorktrees = [makeWorktreeInfo({ prNumber: 1, prState: 'OPEN' })];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: [],
        closed: [],
        open: mockWorktrees,
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue([]);

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No merged or closed PRs')
      );
    });

    it('handles user cancel in interactive mode', async () => {
      const mockWorktrees = [makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' })];
      const { promptChoice } = await import('../lib/prompts.js');

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: mockWorktrees,
        closed: [],
        open: [],
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      vi.mocked(promptChoice).mockResolvedValue('cancel');

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
    });

    it('handles all option in interactive mode', async () => {
      const mockWorktrees = [makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' })];
      const { promptChoice, promptConfirm } = await import('../lib/prompts.js');

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: mockWorktrees,
        closed: [],
        open: [],
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      vi.mocked(promptChoice).mockResolvedValue('all');
      vi.mocked(promptConfirm).mockResolvedValue(false); // Don't delete remote
      vi.mocked(cleanpr.cleanWorktree).mockReturnValue({
        success: true,
        message: 'Cleaned PR #1',
        prNumber: 1,
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });
      vi.mocked(cleanpr.summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await runCli([]);

      expect(cleanpr.cleanWorktree).toHaveBeenCalled();
      expect(cleanpr.summarizeResults).toHaveBeenCalled();
    });

    it('handles merged option in interactive mode', async () => {
      const mockWorktrees = [
        makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' }),
        makeWorktreeInfo({ prNumber: 2, prState: 'CLOSED' }),
      ];
      const { promptChoice, promptConfirm } = await import('../lib/prompts.js');

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: [mockWorktrees[0]],
        closed: [mockWorktrees[1]],
        open: [],
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      vi.mocked(promptChoice).mockResolvedValue('merged');
      vi.mocked(promptConfirm).mockResolvedValue(false);
      vi.mocked(cleanpr.cleanWorktree).mockReturnValue({
        success: true,
        message: 'Cleaned PR #1',
        prNumber: 1,
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });
      vi.mocked(cleanpr.summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await runCli([]);

      // Should only clean merged (PR #1), not closed (PR #2)
      expect(cleanpr.cleanWorktree).toHaveBeenCalledTimes(1);
    });

    it('handles select option in interactive mode', async () => {
      const mockWorktrees = [makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' })];
      const { promptChoice, promptConfirm } = await import('../lib/prompts.js');

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: mockWorktrees,
        closed: [],
        open: [],
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      // First prompt: select action, Second: individual confirm, Third: remote deletion
      vi.mocked(promptChoice).mockResolvedValue('select');
      vi.mocked(promptConfirm)
        .mockResolvedValueOnce(true) // Yes, clean this PR
        .mockResolvedValueOnce(false); // No, don't delete remote
      vi.mocked(cleanpr.cleanWorktree).mockReturnValue({
        success: true,
        message: 'Cleaned PR #1',
        prNumber: 1,
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });
      vi.mocked(cleanpr.summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await runCli([]);

      expect(cleanpr.cleanWorktree).toHaveBeenCalled();
    });

    it('skips PR when user declines in select mode', async () => {
      const mockWorktrees = [makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' })];
      const { promptChoice, promptConfirm } = await import('../lib/prompts.js');

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.groupWorktreesByState).mockReturnValue({
        merged: mockWorktrees,
        closed: [],
        open: [],
        unknown: [],
      });
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      vi.mocked(promptChoice).mockResolvedValue('select');
      vi.mocked(promptConfirm).mockResolvedValueOnce(false); // No, don't clean this PR

      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Nothing to clean'));
    });
  });

  describe('--all flag', () => {
    it('cleans all merged/closed worktrees in batch mode', async () => {
      const mockWorktrees = [makeWorktreeInfo()];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: false,
          dryRun: false,
        },
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
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });
      vi.mocked(cleanpr.summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await runCli(['--all']);

      // Verify wiring: cleanWorktree receives correct worktree info and options
      expect(cleanpr.cleanWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ prNumber: 123 }), // worktree info
        expect.objectContaining({ force: false, deleteRemote: false }), // options
        expect.any(Object) // deps
      );
      expect(cleanpr.summarizeResults).toHaveBeenCalled();
    });

    it('shows info when no cleanable worktrees in --all mode', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: false,
          dryRun: false,
        },
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
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
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
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });

      await runCli(['42']);

      // Verify wiring: findWorktreeByPrNumber receives worktrees and PR number
      expect(cleanpr.findWorktreeByPrNumber).toHaveBeenCalledWith([mockWorktree], 42);
      // Verify wiring: cleanWorktree receives correct worktree info and options
      expect(cleanpr.cleanWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ prNumber: 42 }), // worktree info
        expect.objectContaining({ force: false, deleteRemote: false }), // options
        expect.any(Object) // deps
      );
    });

    it('exits 1 when specific PR not found', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: 999,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: false,
          dryRun: false,
        },
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

  describe('JSON output mode', () => {
    it('outputs JSON error when gh not installed with --json', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: true,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(false);

      await runCli(['--json', '--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('GH_NOT_INSTALLED'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when not in git repo with --json', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: true,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('');

      await runCli(['--json', '--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('NOT_GIT_REPO'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error on parse error with --json', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'error',
        message: 'Invalid option: --invalid',
      });

      await runCli(['--json', '--invalid']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('INVALID_ARGUMENT'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON success when cleaning all with --json', async () => {
      const mockWorktrees = [makeWorktreeInfo()];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: true,
          dryRun: false,
        },
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
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });

      await runCli(['--json', '--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": true'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"totalCleaned": 1'));
    });

    it('outputs JSON empty result when no cleanable worktrees with --json --all', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: true,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue([]);

      await runCli(['--json', '--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": true'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"totalCleaned": 0'));
    });

    it('outputs JSON error when specific PR not found with --json', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: 999,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: true,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(cleanpr.findWorktreeByPrNumber).mockReturnValue(undefined);

      await runCli(['--json', '999']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR_NOT_FOUND'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON success when cleaning specific PR with --json', async () => {
      const mockWorktree = makeWorktreeInfo({ prNumber: 42 });

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: 42,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: true,
          dryRun: false,
        },
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
        localBranchDeleted: true,
        remoteBranchDeleted: true,
      });

      await runCli(['--json', '42']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": true'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"totalCleaned": 1'));
    });

    it('outputs JSON error when interactive mode requested with --json', async () => {
      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: true,
          json: true,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue([makeWorktreeInfo()]);

      await runCli(['--json']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"success": false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('INVALID_ARGUMENT'));
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Interactive mode not supported')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('dry-run mode', () => {
    it('outputs dry-run results with --dry-run --all', async () => {
      const mockWorktrees = [makeWorktreeInfo()];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: false,
          dryRun: true,
        },
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
        message: 'Would clean PR #123',
        prNumber: 123,
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });
      vi.mocked(cleanpr.summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await runCli(['--dry-run', '--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Would clean'));
    });

    it('outputs JSON dry-run results with --json --dry-run --all', async () => {
      const mockWorktrees = [makeWorktreeInfo()];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: true,
          dryRun: true,
        },
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
        message: 'Would clean PR #123',
        prNumber: 123,
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });

      await runCli(['--json', '--dry-run', '--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"wouldClean"'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"totalWouldClean": 1'));
    });

    it('outputs dry-run results for specific PR with --dry-run', async () => {
      const mockWorktree = makeWorktreeInfo({ prNumber: 42 });

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: 42,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: false,
          dryRun: true,
        },
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
        message: 'Would clean PR #42',
        prNumber: 42,
        localBranchDeleted: true,
        remoteBranchDeleted: false,
      });

      await runCli(['--dry-run', '42']);

      expect(cleanpr.cleanWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ prNumber: 42 }),
        expect.objectContaining({ dryRun: true }),
        expect.any(Object)
      );
    });
  });

  describe('failed cleanup handling', () => {
    it('handles failed cleanup result for specific PR', async () => {
      const mockWorktree = makeWorktreeInfo({ prNumber: 42 });

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: 42,
        options: {
          all: false,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: false,
          dryRun: false,
        },
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
        success: false,
        message: 'Failed to clean PR #42: worktree has uncommitted changes',
        prNumber: 42,
        localBranchDeleted: false,
        remoteBranchDeleted: false,
      });

      await runCli(['42']);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('handles failed cleanup in --all mode with warnings', async () => {
      const mockWorktrees = [
        makeWorktreeInfo({ prNumber: 1 }),
        makeWorktreeInfo({ prNumber: 2, hasChanges: true }),
      ];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: false,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      vi.mocked(cleanpr.cleanWorktree)
        .mockReturnValueOnce({
          success: true,
          message: 'Cleaned PR #1',
          prNumber: 1,
          localBranchDeleted: true,
          remoteBranchDeleted: false,
        })
        .mockReturnValueOnce({
          success: false,
          message: 'Skipped PR #2: has uncommitted changes',
          prNumber: 2,
          localBranchDeleted: false,
          remoteBranchDeleted: false,
        });
      vi.mocked(cleanpr.summarizeResults).mockReturnValue({ cleaned: 1, total: 2, failed: 1 });

      await runCli(['--all']);

      expect(cleanpr.summarizeResults).toHaveBeenCalled();
    });

    it('includes skipped items in JSON output', async () => {
      const mockWorktrees = [
        makeWorktreeInfo({ prNumber: 1 }),
        makeWorktreeInfo({ prNumber: 2, hasChanges: true }),
      ];

      vi.mocked(cleanpr.parseArgs).mockReturnValue({
        kind: 'success',
        prNumber: null,
        options: {
          all: true,
          force: false,
          deleteRemote: false,
          interactive: false,
          json: true,
          dryRun: false,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(cleanpr.createDefaultDeps).mockReturnValue(
        {} as ReturnType<typeof cleanpr.createDefaultDeps>
      );
      vi.mocked(cleanpr.gatherPrWorktreeInfo).mockResolvedValue(mockWorktrees);
      vi.mocked(cleanpr.getCleanableWorktrees).mockReturnValue(mockWorktrees);
      vi.mocked(cleanpr.cleanWorktree)
        .mockReturnValueOnce({
          success: true,
          message: 'Cleaned PR #1',
          prNumber: 1,
          localBranchDeleted: true,
          remoteBranchDeleted: false,
        })
        .mockReturnValueOnce({
          success: false,
          message: 'Skipped PR #2: has uncommitted changes',
          prNumber: 2,
          localBranchDeleted: false,
          remoteBranchDeleted: false,
        });

      await runCli(['--json', '--all']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"totalSkipped": 1'));
    });
  });
});
