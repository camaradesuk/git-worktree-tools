import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the CLI
vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
  getRepoName: vi.fn(),
  fetch: vi.fn(),
  getCurrentBranch: vi.fn(),
  checkout: vi.fn(),
  exec: vi.fn(),
  push: vi.fn(),
  commit: vi.fn(),
  add: vi.fn(),
  stash: vi.fn(),
  stashApply: vi.fn(),
  stashDrop: vi.fn(),
  stashPop: vi.fn(),
  addWorktree: vi.fn(),
  getStagedFiles: vi.fn(),
  getUnstagedFiles: vi.fn(),
  getStatusOutput: vi.fn(),
  getCommitsAhead: vi.fn(),
  remoteBranchExists: vi.fn(),
  branchExists: vi.fn(),
}));

vi.mock('../lib/github.js', () => ({
  isGhInstalled: vi.fn(),
  isAuthenticated: vi.fn(),
  getPr: vi.fn(),
  getPrByBranch: vi.fn(),
  createPr: vi.fn(),
}));

vi.mock('../lib/prompts.js', () => ({
  promptChoiceIndex: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadConfig: vi.fn(),
  generateBranchName: vi.fn(),
  generateWorktreePath: vi.fn(),
}));

vi.mock('../lib/state-detection.js', () => ({
  analyzeGitState: vi.fn(),
  detectScenario: vi.fn(),
}));

vi.mock('../lib/newpr/index.js', () => ({
  parseArgs: vi.fn(),
  getHelpText: vi.fn(),
  getScenarioContext: vi.fn(),
  isPrWorktreeScenario: vi.fn(),
  isExistingBranchAction: vi.fn(),
  executeStateAction: vi.fn(),
  getBranchPoint: vi.fn(),
  getScenarioMessageLevel: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    symlinkSync: vi.fn(),
  },
  existsSync: vi.fn(),
  symlinkSync: vi.fn(),
}));

// Import after mocking
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as prompts from '../lib/prompts.js';
import { loadConfig, generateBranchName, generateWorktreePath } from '../lib/config.js';
import { analyzeGitState, detectScenario } from '../lib/state-detection.js';
import * as newpr from '../lib/newpr/index.js';
import fs from 'fs';

describe('cli/newpr', () => {
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
  };

  const defaultOptions = {
    baseBranch: 'main',
    draft: false,
    installDeps: false,
    openEditor: false,
    runWtlink: false,
    json: false,
    nonInteractive: false,
  };

  const makePrInfo = (overrides = {}) => ({
    number: 123,
    title: 'Test PR',
    state: 'OPEN' as const,
    headBranch: 'feature-123',
    baseBranch: 'main',
    url: 'https://github.com/org/repo/pull/123',
    isDraft: false,
    ...overrides,
  });

  const makeGitState = (overrides = {}) => ({
    worktreeType: 'main_worktree' as const,
    branchType: 'main' as const,
    currentBranch: 'main',
    commitRelationship: 'same' as const,
    workingTreeStatus: 'clean' as const,
    localCommits: [],
    stagedFiles: [],
    unstagedFiles: [],
    repoRoot: '/repo',
    repoName: 'repo',
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
    process.argv = ['node', 'newpr', ...args];
    await import('./newpr.js');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  describe('help option', () => {
    it('prints help and exits 0 on --help', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({ kind: 'help' });
      vi.mocked(newpr.getHelpText).mockReturnValue('Usage: newpr [options]');

      await runCli(['--help']);

      expect(newpr.getHelpText).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: newpr [options]');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('error handling', () => {
    it('prints error and exits 1 on parse error', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'error',
        message: 'Invalid option: --invalid',
      });

      await runCli(['--invalid']);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('exits 1 when gh not installed', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'test', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(false);

      await runCli(['test']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('GitHub CLI'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('exits 1 when gh not authenticated', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'test', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(false);

      await runCli(['test']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('not authenticated'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('--pr mode', () => {
    it('sets up worktree for existing PR', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'pr', prNumber: 123, ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(github.getPr).mockReturnValue(makePrInfo());
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr123');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await runCli(['--pr', '123']);

      // Verify wiring: worktree path, branch, and options are correctly passed through
      expect(git.addWorktree).toHaveBeenCalledWith(
        '/repo.pr123', // path from generateWorktreePath
        'feature-123', // branch from PR info
        expect.objectContaining({
          createBranch: true,
          startPoint: 'origin/feature-123',
        })
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR #123'));
    });

    it('exits 1 when PR not found', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'pr', prNumber: 999, ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(github.getPr).mockReturnValue(null);

      await runCli(['--pr', '999']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Could not find PR'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('--branch mode', () => {
    it('creates PR for existing branch', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'branch', branchName: 'my-feature', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(git.remoteBranchExists).mockReturnValue(true);
      vi.mocked(github.getPrByBranch).mockReturnValue(null);
      vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 456 }));
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr456');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await runCli(['--branch', 'my-feature']);

      // Verify wiring: createPr receives correct branch and description
      expect(github.createPr).toHaveBeenCalledWith(
        expect.objectContaining({
          head: 'my-feature',
          base: 'main', // from config
        })
      );
      // Verify wiring: addWorktree receives correct path, branch, and options
      expect(git.addWorktree).toHaveBeenCalledWith(
        '/repo.pr456', // path from generateWorktreePath
        'my-feature', // the branch name
        expect.objectContaining({
          createBranch: true,
          startPoint: 'origin/my-feature',
        })
      );
    });

    it('uses existing PR if branch already has one', async () => {
      const existingPr = makePrInfo({ number: 789 });

      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'branch', branchName: 'my-feature', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(git.remoteBranchExists).mockReturnValue(true);
      vi.mocked(github.getPrByBranch).mockReturnValue(existingPr);
      vi.mocked(github.getPr).mockReturnValue(existingPr);
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr789');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await runCli(['--branch', 'my-feature']);

      expect(github.createPr).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('PR #789 already exists')
      );
    });
  });

  describe('new feature mode', () => {
    it('creates new branch, PR, and worktree', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'Add new feature', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchName).mockReturnValue('feature/add-new-feature');
      vi.mocked(analyzeGitState).mockReturnValue(makeGitState());
      vi.mocked(detectScenario).mockReturnValue('main_clean_same');
      vi.mocked(newpr.isPrWorktreeScenario).mockReturnValue(false);
      vi.mocked(newpr.getScenarioContext).mockReturnValue({
        message: 'No changes detected',
        choices: [
          {
            label: 'Create empty commit',
            action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false },
          },
          { label: 'Cancel', action: null },
        ],
      });
      vi.mocked(newpr.getScenarioMessageLevel).mockReturnValue('warning');
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(0);
      vi.mocked(newpr.isExistingBranchAction).mockReturnValue(false);
      vi.mocked(newpr.executeStateAction).mockReturnValue({ success: true, stashRef: null });
      vi.mocked(newpr.getBranchPoint).mockReturnValue('origin/main');
      vi.mocked(git.remoteBranchExists).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');
      vi.mocked(git.getStagedFiles).mockReturnValue([]);
      vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 100 }));
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr100');

      await runCli(['Add new feature']);

      // Verify wiring: checkout uses generated branch name and branch point
      expect(git.exec).toHaveBeenCalledWith([
        'checkout',
        '-b',
        'feature/add-new-feature', // from generateBranchName
        'origin/main', // from getBranchPoint
      ]);
      // Verify wiring: createPr receives correct branch and description
      expect(github.createPr).toHaveBeenCalledWith(
        expect.objectContaining({
          head: 'feature/add-new-feature',
          base: 'main',
          title: 'Add new feature',
        })
      );
      // Verify wiring: addWorktree receives correct path and branch
      expect(git.addWorktree).toHaveBeenCalledWith(
        '/repo.pr100', // path from generateWorktreePath
        'feature/add-new-feature' // the branch name
      );
    });

    it('exits 1 when user cancels', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'Add new feature', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchName).mockReturnValue('feature/add-new-feature');
      vi.mocked(analyzeGitState).mockReturnValue(makeGitState());
      vi.mocked(detectScenario).mockReturnValue('main_clean_same');
      vi.mocked(newpr.isPrWorktreeScenario).mockReturnValue(false);
      vi.mocked(newpr.getScenarioContext).mockReturnValue({
        message: 'No changes detected',
        choices: [
          {
            label: 'Create empty commit',
            action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false },
          },
          { label: 'Cancel', action: null },
        ],
      });
      vi.mocked(newpr.getScenarioMessageLevel).mockReturnValue('warning');
      // User selects Cancel (index 1)
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(1);

      await runCli(['Add new feature']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Aborted'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('shows helpful error when checkout fails due to conflicting changes', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'Add new feature', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchName).mockReturnValue('feature/add-new-feature');
      vi.mocked(analyzeGitState).mockReturnValue(makeGitState());
      vi.mocked(detectScenario).mockReturnValue('main_clean_same');
      vi.mocked(newpr.isPrWorktreeScenario).mockReturnValue(false);
      vi.mocked(newpr.getScenarioContext).mockReturnValue({
        message: 'No changes detected',
        choices: [
          {
            label: 'Create empty commit',
            action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false },
          },
          { label: 'Cancel', action: null },
        ],
      });
      vi.mocked(newpr.getScenarioMessageLevel).mockReturnValue('warning');
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(0);
      vi.mocked(newpr.isExistingBranchAction).mockReturnValue(false);
      vi.mocked(newpr.executeStateAction).mockReturnValue({ success: true, stashRef: null });
      vi.mocked(newpr.getBranchPoint).mockReturnValue('origin/main');
      vi.mocked(git.remoteBranchExists).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');
      vi.mocked(git.getStagedFiles).mockReturnValue(['README.md']);
      vi.mocked(git.getUnstagedFiles).mockReturnValue([]);

      // Mock checkout to fail with a conflict error
      vi.mocked(git.exec).mockImplementation(() => {
        throw new Error(
          "error: Your local changes to 'README.md' would be overwritten by checkout"
        );
      });

      await runCli(['Add new feature']);

      // Verify helpful error messages are shown
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Checkout failed due to conflicting changes')
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Your staged changes are preserved')
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Commit your changes first')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('executeStateAction parameter verification', () => {
    it('passes repoRoot to executeStateAction for existing branch actions', async () => {
      const repoRoot = '/repo';
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'Add new feature', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue(repoRoot);
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchName).mockReturnValue('feature/add-new-feature');
      vi.mocked(analyzeGitState).mockReturnValue(
        makeGitState({
          currentBranch: 'feature/existing-branch',
          branchType: 'feature',
          workingTreeStatus: 'has_staged',
          stagedFiles: ['file.ts'],
        })
      );
      vi.mocked(detectScenario).mockReturnValue('branch_with_changes');
      vi.mocked(newpr.isPrWorktreeScenario).mockReturnValue(false);
      vi.mocked(newpr.getScenarioContext).mockReturnValue({
        message: 'You have uncommitted changes',
        choices: [
          {
            label: 'Commit all and create PR',
            action: { action: 'commit_all', branchFrom: 'head', stashUnstaged: false },
          },
          { label: 'Cancel', action: null },
        ],
      });
      vi.mocked(newpr.getScenarioMessageLevel).mockReturnValue('info');
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(0);
      // KEY: This is the existing branch action path
      vi.mocked(newpr.isExistingBranchAction).mockReturnValue(true);
      vi.mocked(newpr.executeStateAction).mockReturnValue({ success: true, stashRef: null });
      vi.mocked(git.remoteBranchExists).mockReturnValue(true);
      vi.mocked(git.getCurrentBranch).mockReturnValue('feature/existing-branch');
      vi.mocked(github.getPrByBranch).mockReturnValue(null);
      vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 100 }));
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr100');

      await runCli(['Add new feature']);

      // Verify executeStateAction was called with repoRoot as the 5th parameter
      expect(newpr.executeStateAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'commit_all' }),
        expect.any(String),
        'feature/existing-branch',
        expect.any(Object),
        repoRoot // This is the critical parameter that was missing
      );
    });

    it('passes repoRoot to executeStateAction for new branch actions', async () => {
      const repoRoot = '/repo';
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'Add new feature', ...defaultOptions },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue(repoRoot);
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchName).mockReturnValue('feature/add-new-feature');
      vi.mocked(analyzeGitState).mockReturnValue(makeGitState());
      vi.mocked(detectScenario).mockReturnValue('main_clean_same');
      vi.mocked(newpr.isPrWorktreeScenario).mockReturnValue(false);
      vi.mocked(newpr.getScenarioContext).mockReturnValue({
        message: 'No changes detected',
        choices: [
          {
            label: 'Create empty commit',
            action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false },
          },
          { label: 'Cancel', action: null },
        ],
      });
      vi.mocked(newpr.getScenarioMessageLevel).mockReturnValue('warning');
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(0);
      // This is the new branch action path
      vi.mocked(newpr.isExistingBranchAction).mockReturnValue(false);
      vi.mocked(newpr.executeStateAction).mockReturnValue({ success: true, stashRef: null });
      vi.mocked(newpr.getBranchPoint).mockReturnValue('origin/main');
      vi.mocked(git.remoteBranchExists).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');
      vi.mocked(git.getStagedFiles).mockReturnValue([]);
      vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 100 }));
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr100');

      await runCli(['Add new feature']);

      // Verify executeStateAction was called with repoRoot as the 5th parameter
      expect(newpr.executeStateAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'empty_commit' }),
        expect.any(String),
        'feature/add-new-feature',
        expect.any(Object),
        repoRoot // This ensures git operations run from repo root
      );
    });
  });
});
