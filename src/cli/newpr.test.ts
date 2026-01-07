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
  getChangedFiles: vi.fn(),
  getCommitMessages: vi.fn(),
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
  generateBranchNameAsync: vi.fn(),
  generateWorktreePath: vi.fn(),
  generatePRContentAsync: vi.fn(),
}));

vi.mock('../lib/state-detection.js', () => ({
  analyzeGitState: vi.fn(),
  detectScenario: vi.fn(),
}));

// Create a mock hook runner that always allows hooks to pass
const mockHookRunner = {
  runHook: vi.fn().mockResolvedValue(true),
  runCleanup: vi.fn().mockResolvedValue(undefined),
  updateContext: vi.fn(),
  hasConfiguredHooks: vi.fn().mockReturnValue(false),
  getConfiguredHooks: vi.fn().mockReturnValue([]),
  getContext: vi.fn().mockReturnValue({}),
};

vi.mock('../lib/newpr/index.js', () => ({
  parseArgs: vi.fn(),
  getHelpText: vi.fn(),
  getScenarioContext: vi.fn(),
  isPrWorktreeScenario: vi.fn(),
  isExistingBranchAction: vi.fn(),
  executeStateAction: vi.fn(),
  getBranchPoint: vi.fn(),
  getScenarioMessageLevel: vi.fn(),
  createHookRunner: vi.fn(() => mockHookRunner),
  createActionDeps: vi.fn(() => ({
    gitAdd: vi.fn(),
    gitStash: vi.fn(),
    gitPush: vi.fn(),
    gitCommit: vi.fn(),
  })),
  HookRunner: vi.fn(),
  runLifecycleHook: vi.fn().mockResolvedValue(true),
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
import {
  loadConfig,
  generateBranchNameAsync,
  generateWorktreePath,
  generatePRContentAsync,
} from '../lib/config.js';
import { analyzeGitState, detectScenario } from '../lib/state-detection.js';
import * as newpr from '../lib/newpr/index.js';
import type { StateActionKey } from '../lib/json-output.js';
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
    previewLabel: 'preview',
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

  const defaultOptions = {
    baseBranch: 'main',
    draft: false,
    installDeps: false,
    openEditor: false,
    runWtlink: false,
    json: false,
    nonInteractive: false,
    noHooks: false,
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

    // Reset the hook runner mock to allow all hooks to pass
    mockHookRunner.runHook.mockResolvedValue(true);
    mockHookRunner.runCleanup.mockResolvedValue(undefined);
    mockHookRunner.updateContext.mockReturnValue(undefined);
    mockHookRunner.hasConfiguredHooks.mockReturnValue(false);
    mockHookRunner.getConfiguredHooks.mockReturnValue([]);
    mockHookRunner.getContext.mockReturnValue({});

    // Reset createHookRunner to return the mock
    vi.mocked(newpr.createHookRunner).mockReturnValue(
      mockHookRunner as unknown as ReturnType<typeof newpr.createHookRunner>
    );

    // Reset createActionDeps to return a mock deps object
    vi.mocked(newpr.createActionDeps).mockReturnValue({
      gitAdd: vi.fn(),
      gitStash: vi.fn(),
      gitPush: vi.fn(),
      gitCommit: vi.fn(),
    });

    // Default mocks for AI generation functions
    vi.mocked(generatePRContentAsync).mockResolvedValue({
      title: 'Test PR',
      description: '',
      aiGenerated: false,
    });
    vi.mocked(git.getChangedFiles).mockReturnValue([]);
    vi.mocked(git.getCommitMessages).mockReturnValue([]);

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
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(1); // 1-based index
      vi.mocked(newpr.isExistingBranchAction).mockReturnValue(false);
      vi.mocked(newpr.executeStateAction).mockReturnValue({ success: true, stashRef: null });
      vi.mocked(newpr.getBranchPoint).mockReturnValue('origin/main');
      vi.mocked(git.remoteBranchExists).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');
      vi.mocked(git.getStagedFiles).mockReturnValue([]);
      vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 100 }));
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr100');
      vi.mocked(generatePRContentAsync).mockResolvedValue({
        title: 'Add new feature',
        description: '',
        aiGenerated: false,
      });

      await runCli(['Add new feature']);

      // Verify wiring: checkout uses generated branch name and branch point
      expect(git.exec).toHaveBeenCalledWith([
        'checkout',
        '-b',
        'feature/add-new-feature', // from generateBranchNameAsync
        'origin/main', // from getBranchPoint
      ]);
      // Verify wiring: createPr receives correct branch and title (from generatePRContentAsync)
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
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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
      // User selects Cancel (option 2 in 1-based, array index 1)
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(2); // 1-based index

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
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(1); // 1-based index
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

  describe('JSON output mode', () => {
    it('outputs JSON error when gh not installed with --json flag', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'test', ...defaultOptions, json: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(false);

      await runCli(['test', '--json']);

      // Should output JSON error, not plain text
      const jsonOutput = mockConsoleLog.mock.calls.find((call) =>
        String(call[0]).includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();
      expect(jsonOutput![0]).toContain('"code": "GH_NOT_INSTALLED"');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when gh not authenticated with --json flag', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'test', ...defaultOptions, json: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(false);

      await runCli(['test', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls.find((call) =>
        String(call[0]).includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();
      expect(jsonOutput![0]).toContain('"code": "GH_NOT_AUTHENTICATED"');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON success for --pr mode', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'pr', prNumber: 123, ...defaultOptions, json: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(github.getPr).mockReturnValue(makePrInfo());
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr123');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await runCli(['--pr', '123', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls.find((call) =>
        String(call[0]).includes('"success": true')
      );
      expect(jsonOutput).toBeDefined();
      expect(jsonOutput![0]).toContain('"prNumber": 123');
    });

    it('outputs JSON error when parse fails with --json flag', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'error',
        message: 'Missing required argument',
      });

      await runCli(['--json']);

      const jsonOutput = mockConsoleLog.mock.calls.find((call) =>
        String(call[0]).includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();
      expect(jsonOutput![0]).toContain('"code": "INVALID_ARGUMENT"');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('non-interactive mode', () => {
    it('uses first available action when no --action specified', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: {
          mode: 'new',
          description: 'Add new feature',
          ...defaultOptions,
          nonInteractive: true,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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
      vi.mocked(newpr.isExistingBranchAction).mockReturnValue(false);
      vi.mocked(newpr.executeStateAction).mockReturnValue({ success: true, stashRef: null });
      vi.mocked(newpr.getBranchPoint).mockReturnValue('origin/main');
      vi.mocked(git.remoteBranchExists).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');
      vi.mocked(git.getStagedFiles).mockReturnValue([]);
      vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 100 }));
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr100');

      await runCli(['Add new feature', '--non-interactive']);

      // Should not prompt - should use first available action
      expect(prompts.promptChoiceIndex).not.toHaveBeenCalled();
      expect(newpr.executeStateAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'empty_commit' }),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String)
      );
    });

    it('uses specified action when --action is provided', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: {
          mode: 'new',
          description: 'Add new feature',
          ...defaultOptions,
          nonInteractive: true,
          action: 'commit_staged',
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
      vi.mocked(analyzeGitState).mockReturnValue(
        makeGitState({
          workingTreeStatus: 'has_staged',
          stagedFiles: ['file.ts'],
        })
      );
      vi.mocked(detectScenario).mockReturnValue('main_staged_same');
      vi.mocked(newpr.isPrWorktreeScenario).mockReturnValue(false);
      vi.mocked(newpr.getScenarioContext).mockReturnValue({
        message: 'You have staged changes',
        choices: [
          {
            label: 'Commit staged changes',
            action: { action: 'commit_staged', branchFrom: 'origin_main', stashUnstaged: false },
          },
          {
            label: 'Create empty commit',
            action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false },
          },
          { label: 'Cancel', action: null },
        ],
      });
      vi.mocked(newpr.getScenarioMessageLevel).mockReturnValue('info');
      vi.mocked(newpr.isExistingBranchAction).mockReturnValue(false);
      vi.mocked(newpr.executeStateAction).mockReturnValue({ success: true, stashRef: null });
      vi.mocked(newpr.getBranchPoint).mockReturnValue('origin/main');
      vi.mocked(git.remoteBranchExists).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');
      vi.mocked(git.getStagedFiles).mockReturnValue(['file.ts']);
      vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 100 }));
      vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr100');

      await runCli(['Add new feature', '--non-interactive', '--action', 'commit_staged']);

      expect(prompts.promptChoiceIndex).not.toHaveBeenCalled();
      expect(newpr.executeStateAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'commit_staged' }),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(String)
      );
    });

    it('exits with error when --action specifies invalid action', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: {
          mode: 'new',
          description: 'Add new feature',
          ...defaultOptions,
          nonInteractive: true,
          action: 'invalid_action' as StateActionKey, // intentionally invalid for test
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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

      await runCli(['Add new feature', '--non-interactive', '--action', 'invalid_action']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Action 'invalid_action' is not available")
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('exits with error in non-interactive mode from PR worktree', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: {
          mode: 'new',
          description: 'Add new feature',
          ...defaultOptions,
          nonInteractive: true,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo.pr123');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
      vi.mocked(analyzeGitState).mockReturnValue(
        makeGitState({
          worktreeType: 'pr_worktree',
        })
      );
      vi.mocked(detectScenario).mockReturnValue('pr_worktree');
      vi.mocked(newpr.isPrWorktreeScenario).mockReturnValue(true);

      await runCli(['Add new feature', '--non-interactive']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Cannot create PR from a PR worktree in non-interactive mode')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when --action is invalid with --json flag', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: {
          mode: 'new',
          description: 'Add new feature',
          ...defaultOptions,
          nonInteractive: true,
          action: 'invalid_action' as StateActionKey, // intentionally invalid for test
          json: true,
        },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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

      await runCli([
        'Add new feature',
        '--non-interactive',
        '--action',
        'invalid_action',
        '--json',
      ]);

      const jsonOutput = mockConsoleLog.mock.calls.find((call) =>
        String(call[0]).includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();
      expect(jsonOutput![0]).toContain('"code": "INVALID_ACTION"');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('PR not found handling', () => {
    it('outputs JSON error when PR not found with --json flag', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'pr', prNumber: 999, ...defaultOptions, json: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(github.getPr).mockReturnValue(null);

      await runCli(['--pr', '999', '--json']);

      // JSON mode outputs to console.log, not console.error
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Could not find PR'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('user cancellation handling', () => {
    it('outputs JSON error when user cancels with --json flag', async () => {
      vi.mocked(newpr.parseArgs).mockReturnValue({
        kind: 'success',
        options: { mode: 'new', description: 'test', ...defaultOptions, json: true },
      });
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(github.isAuthenticated).mockReturnValue(true);
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(git.getRepoName).mockReturnValue('repo');
      vi.mocked(loadConfig).mockReturnValue(defaultConfig);
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/test');
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
      // User selects Cancel (index 1 in array, so 2 in 1-based indexing)
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(2);

      await runCli(['test', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls.find((call) =>
        String(call[0]).includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();
      expect(jsonOutput![0]).toContain('"code": "USER_CANCELLED"');
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
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(1); // 1-based index
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
      vi.mocked(generateBranchNameAsync).mockResolvedValue('feature/add-new-feature');
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
      vi.mocked(prompts.promptChoiceIndex).mockResolvedValue(1); // 1-based index
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
