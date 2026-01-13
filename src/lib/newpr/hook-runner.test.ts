/**
 * Hook Runner Tests
 *
 * Tests the hook runner for newpr workflow lifecycle hooks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HookRunner, createHookRunner, runLifecycleHook } from './hook-runner.js';
import type { HooksConfig } from '../hooks/types.js';

// Mock colors to avoid ANSI codes in tests
vi.mock('../colors.js', () => ({
  dim: (s: string) => s,
  error: (s: string) => s,
  warning: (s: string) => s,
  info: (s: string) => s,
  success: (s: string) => s,
}));

// Create mock functions we can control
const mockExecuteHook = vi.fn();
const mockGetConfiguredHooks = vi.fn().mockReturnValue([]);
const mockHasHook = vi.fn().mockReturnValue(false);

// Mock the hooks executor module
vi.mock('../hooks/executor.js', () => ({
  createHookExecutor: vi.fn(() => ({
    executeHook: mockExecuteHook,
    getConfiguredHooks: mockGetConfiguredHooks,
    hasHook: mockHasHook,
  })),
  HookExecutor: vi.fn(),
  resolveHookCwd: vi.fn(() => '/test/worktree'),
}));

// Mock confirmation module
const mockIsInteractiveEnvironment = vi.fn().mockReturnValue(true);
const mockPromptHookConfirmation = vi.fn();
const mockCreateEditedHookDefinition = vi.fn();

vi.mock('../hooks/confirmation.js', () => ({
  isInteractiveEnvironment: () => mockIsInteractiveEnvironment(),
  promptHookConfirmation: (...args: unknown[]) => mockPromptHookConfirmation(...args),
  createEditedHookDefinition: (...args: unknown[]) => mockCreateEditedHookDefinition(...args),
}));

describe('HookRunner', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to default values
    mockGetConfiguredHooks.mockReturnValue([]);
    mockHasHook.mockReturnValue(false);
    mockExecuteHook.mockReset();
    mockIsInteractiveEnvironment.mockReturnValue(true);
    mockPromptHookConfirmation.mockReset();
    mockCreateEditedHookDefinition.mockReset();

    // Suppress console output
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('creates hook runner with empty config', () => {
      const runner = new HookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

      expect(runner).toBeInstanceOf(HookRunner);
    });

    it('creates hook runner with hooks config', () => {
      mockGetConfiguredHooks.mockReturnValue(['post-worktree']);

      const config: HooksConfig = {
        'post-worktree': 'npm install',
      };

      const runner = new HookRunner(config, { repoRoot: '/test', baseBranch: 'main' });

      expect(runner).toBeInstanceOf(HookRunner);
    });
  });

  describe('hasConfiguredHooks', () => {
    it('returns false when no hooks configured', () => {
      mockGetConfiguredHooks.mockReturnValue([]);

      const runner = new HookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

      expect(runner.hasConfiguredHooks()).toBe(false);
    });

    it('returns true when hooks are configured', () => {
      mockGetConfiguredHooks.mockReturnValue(['post-worktree']);

      const runner = new HookRunner(
        { 'post-worktree': 'npm install' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      expect(runner.hasConfiguredHooks()).toBe(true);
    });
  });

  describe('getConfiguredHooks', () => {
    it('returns list of configured hooks', () => {
      mockGetConfiguredHooks.mockReturnValue(['pre-analyze', 'post-worktree']);

      const runner = new HookRunner(
        { 'pre-analyze': 'echo 1', 'post-worktree': 'npm install' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      expect(runner.getConfiguredHooks()).toEqual(['pre-analyze', 'post-worktree']);
    });
  });

  describe('updateContext', () => {
    it('updates context with new values', () => {
      const runner = new HookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

      runner.updateContext({ branchName: 'feat/test', prNumber: 42 });

      const context = runner.getContext();
      expect(context.branchName).toBe('feat/test');
      expect(context.prNumber).toBe(42);
    });

    it('preserves existing context values', () => {
      const runner = new HookRunner(
        {},
        { repoRoot: '/test', baseBranch: 'main', description: 'Test' }
      );

      runner.updateContext({ branchName: 'feat/test' });

      const context = runner.getContext();
      expect(context.description).toBe('Test');
      expect(context.branchName).toBe('feat/test');
    });

    it('overwrites existing values with same key', () => {
      const runner = new HookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

      runner.updateContext({ branchName: 'feat/first' });
      runner.updateContext({ branchName: 'feat/second' });

      const context = runner.getContext();
      expect(context.branchName).toBe('feat/second');
    });
  });

  describe('getContext', () => {
    it('returns a copy of context', () => {
      const runner = new HookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

      const context1 = runner.getContext();
      context1.branchName = 'modified';

      const context2 = runner.getContext();
      expect(context2.branchName).toBeUndefined();
    });
  });

  describe('runHook', () => {
    it('returns true when no hook is configured', async () => {
      mockHasHook.mockReturnValue(false);

      const runner = new HookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

      const result = await runner.runHook('pre-analyze');

      expect(result).toBe(true);
      expect(mockExecuteHook).not.toHaveBeenCalled();
    });

    it('returns true when hook succeeds', async () => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue(['pre-analyze']);
      mockExecuteHook.mockResolvedValue({
        hook: 'pre-analyze',
        success: true,
        duration: 100,
      });

      const runner = new HookRunner(
        { 'pre-analyze': 'echo test' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      const result = await runner.runHook('pre-analyze');

      expect(result).toBe(true);
      expect(mockExecuteHook).toHaveBeenCalled();
    });

    it('returns false when critical hook fails', async () => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue(['pre-branch']);
      mockExecuteHook.mockResolvedValue({
        hook: 'pre-branch',
        success: false,
        duration: 100,
        error: 'Validation failed',
      });

      const runner = new HookRunner(
        { 'pre-branch': 'exit 1' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      const result = await runner.runHook('pre-branch');

      expect(result).toBe(false);
    });

    it('returns true when non-critical hook fails', async () => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue(['post-worktree']);
      mockExecuteHook.mockResolvedValue({
        hook: 'post-worktree',
        success: false,
        duration: 100,
        error: 'npm install failed',
      });

      const runner = new HookRunner(
        { 'post-worktree': 'npm install' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      const result = await runner.runHook('post-worktree');

      expect(result).toBe(true);
    });

    it('returns true when hook is skipped', async () => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue(['pre-analyze']);
      mockExecuteHook.mockResolvedValue({
        hook: 'pre-analyze',
        success: true,
        duration: 0,
        skipped: true,
        skipReason: 'Condition not met',
      });

      const runner = new HookRunner(
        { 'pre-analyze': { command: 'test', if: 'exists:missing.file' } },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      const result = await runner.runHook('pre-analyze');

      expect(result).toBe(true);
    });

    it('shows output when showOutput option is true', async () => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue(['post-branch']);
      mockExecuteHook.mockResolvedValue({
        hook: 'post-branch',
        success: true,
        duration: 50,
        output: 'Hook output message',
      });

      const runner = new HookRunner(
        { 'post-branch': 'echo test' },
        { repoRoot: '/test', baseBranch: 'main' },
        { showOutput: true }
      );

      await runner.runHook('post-branch');

      expect(consoleSpy).toHaveBeenCalledWith('Hook output message');
    });
  });

  describe('runCleanup', () => {
    it('runs cleanup hook with error context', async () => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue(['cleanup']);
      mockExecuteHook.mockResolvedValue({
        hook: 'cleanup',
        success: true,
        duration: 50,
      });

      const runner = new HookRunner(
        { cleanup: 'git checkout main' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      const error = new Error('Something went wrong');
      await runner.runCleanup(error);

      expect(mockExecuteHook).toHaveBeenCalledWith(
        'cleanup',
        expect.objectContaining({
          error: 'Something went wrong',
        })
      );
    });

    it('handles missing cleanup hook gracefully', async () => {
      mockHasHook.mockReturnValue(false);

      const runner = new HookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

      await expect(runner.runCleanup()).resolves.toBeUndefined();
      expect(mockExecuteHook).not.toHaveBeenCalled();
    });

    it('handles cleanup hook failure gracefully', async () => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue(['cleanup']);
      mockExecuteHook.mockResolvedValue({
        hook: 'cleanup',
        success: false,
        duration: 50,
        error: 'Cleanup failed',
      });

      const runner = new HookRunner(
        { cleanup: 'failing-command' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      // Should not throw
      await expect(runner.runCleanup()).resolves.toBeUndefined();
    });
  });

  describe('critical vs non-critical hooks', () => {
    const criticalHooks = [
      'pre-analyze',
      'pre-branch',
      'pre-commit',
      'pre-push',
      'pre-pr',
      'pre-worktree',
    ] as const;

    const nonCriticalHooks = [
      'post-analyze',
      'post-branch',
      'post-commit',
      'post-push',
      'post-pr',
      'post-worktree',
    ] as const;

    it.each(criticalHooks)('critical hook %s returns false on failure', async (hookName) => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue([hookName]);
      mockExecuteHook.mockResolvedValue({
        hook: hookName,
        success: false,
        duration: 100,
        error: 'Hook failed',
      });

      const runner = new HookRunner(
        { [hookName]: 'exit 1' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      const result = await runner.runHook(hookName);

      expect(result).toBe(false);
    });

    it.each(nonCriticalHooks)('non-critical hook %s returns true on failure', async (hookName) => {
      mockHasHook.mockReturnValue(true);
      mockGetConfiguredHooks.mockReturnValue([hookName]);
      mockExecuteHook.mockResolvedValue({
        hook: hookName,
        success: false,
        duration: 100,
        error: 'Hook failed',
      });

      const runner = new HookRunner(
        { [hookName]: 'exit 1' },
        { repoRoot: '/test', baseBranch: 'main' }
      );

      const result = await runner.runHook(hookName);

      expect(result).toBe(true);
    });
  });
});

describe('createHookRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfiguredHooks.mockReturnValue([]);
  });

  it('creates a HookRunner instance', () => {
    const runner = createHookRunner({}, { repoRoot: '/test', baseBranch: 'main' });

    expect(runner).toBeInstanceOf(HookRunner);
  });

  it('passes options to HookRunner', () => {
    const runner = createHookRunner(
      {},
      { repoRoot: '/test', baseBranch: 'main' },
      { verbose: true, dryRun: true }
    );

    expect(runner).toBeInstanceOf(HookRunner);
  });
});

describe('runLifecycleHook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfiguredHooks.mockReturnValue([]);
    mockHasHook.mockReturnValue(false);
  });

  it('returns true when runner is null', async () => {
    const result = await runLifecycleHook(null, 'pre-analyze');

    expect(result).toBe(true);
  });

  it('delegates to runner.runHook when runner exists', async () => {
    mockHasHook.mockReturnValue(true);
    mockGetConfiguredHooks.mockReturnValue(['pre-analyze']);
    mockExecuteHook.mockResolvedValue({
      hook: 'pre-analyze',
      success: true,
      duration: 50,
    });

    const runner = createHookRunner(
      { 'pre-analyze': 'echo test' },
      { repoRoot: '/test', baseBranch: 'main' }
    );

    const result = await runLifecycleHook(runner, 'pre-analyze');

    expect(result).toBe(true);
  });
});

describe('HookRunner confirmHooks', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfiguredHooks.mockReturnValue(['post-worktree']);
    mockHasHook.mockReturnValue(true);
    mockIsInteractiveEnvironment.mockReturnValue(true);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prompts for confirmation when confirmHooks is true for WORKTREE_CWD_HOOKS', async () => {
    mockPromptHookConfirmation.mockResolvedValue({ action: 'run' });
    mockExecuteHook.mockResolvedValue({
      hook: 'post-worktree',
      success: true,
      duration: 100,
    });

    const runner = new HookRunner(
      { 'post-worktree': 'npm install' },
      { repoRoot: '/test', baseBranch: 'main', worktreePath: '/test/worktree' },
      { confirmHooks: true }
    );

    await runner.runHook('post-worktree');

    expect(mockPromptHookConfirmation).toHaveBeenCalled();
    expect(mockExecuteHook).toHaveBeenCalled();
  });

  it('skips hook when user selects skip', async () => {
    mockPromptHookConfirmation.mockResolvedValue({ action: 'skip' });

    const runner = new HookRunner(
      { 'post-worktree': 'npm install' },
      { repoRoot: '/test', baseBranch: 'main', worktreePath: '/test/worktree' },
      { confirmHooks: true }
    );

    const result = await runner.runHook('post-worktree');

    expect(result).toBe(true);
    expect(mockExecuteHook).not.toHaveBeenCalled();
  });

  it('executes edited hook when user edits command', async () => {
    mockPromptHookConfirmation.mockResolvedValue({
      action: 'run',
      editedCommand: 'npm ci',
    });
    mockCreateEditedHookDefinition.mockReturnValue('npm ci');
    mockExecuteHook.mockResolvedValue({
      hook: 'post-worktree',
      success: true,
      duration: 100,
    });

    const runner = new HookRunner(
      { 'post-worktree': 'npm install' },
      { repoRoot: '/test', baseBranch: 'main', worktreePath: '/test/worktree' },
      { confirmHooks: true }
    );

    const result = await runner.runHook('post-worktree');

    expect(result).toBe(true);
    expect(mockCreateEditedHookDefinition).toHaveBeenCalledWith('npm install', 'npm ci');
    expect(mockExecuteHook).toHaveBeenCalled();
  });

  it('does not prompt when confirmHooks is false', async () => {
    mockExecuteHook.mockResolvedValue({
      hook: 'post-worktree',
      success: true,
      duration: 100,
    });

    const runner = new HookRunner(
      { 'post-worktree': 'npm install' },
      { repoRoot: '/test', baseBranch: 'main', worktreePath: '/test/worktree' },
      { confirmHooks: false }
    );

    await runner.runHook('post-worktree');

    expect(mockPromptHookConfirmation).not.toHaveBeenCalled();
    expect(mockExecuteHook).toHaveBeenCalled();
  });

  it('does not prompt for non-WORKTREE_CWD_HOOKS even with confirmHooks', async () => {
    mockGetConfiguredHooks.mockReturnValue(['pre-analyze']);
    mockExecuteHook.mockResolvedValue({
      hook: 'pre-analyze',
      success: true,
      duration: 100,
    });

    const runner = new HookRunner(
      { 'pre-analyze': 'echo test' },
      { repoRoot: '/test', baseBranch: 'main' },
      { confirmHooks: true }
    );

    await runner.runHook('pre-analyze');

    expect(mockPromptHookConfirmation).not.toHaveBeenCalled();
    expect(mockExecuteHook).toHaveBeenCalled();
  });

  it('does not prompt in non-interactive environment', async () => {
    mockIsInteractiveEnvironment.mockReturnValue(false);
    mockExecuteHook.mockResolvedValue({
      hook: 'post-worktree',
      success: true,
      duration: 100,
    });

    const runner = new HookRunner(
      { 'post-worktree': 'npm install' },
      { repoRoot: '/test', baseBranch: 'main', worktreePath: '/test/worktree' },
      { confirmHooks: true }
    );

    await runner.runHook('post-worktree');

    expect(mockPromptHookConfirmation).not.toHaveBeenCalled();
    expect(mockExecuteHook).toHaveBeenCalled();
  });

  it('prompts for post-pr hook', async () => {
    mockGetConfiguredHooks.mockReturnValue(['post-pr']);
    mockPromptHookConfirmation.mockResolvedValue({ action: 'run' });
    mockExecuteHook.mockResolvedValue({
      hook: 'post-pr',
      success: true,
      duration: 100,
    });

    const runner = new HookRunner(
      { 'post-pr': 'echo "PR created"' },
      { repoRoot: '/test', baseBranch: 'main', worktreePath: '/test/worktree' },
      { confirmHooks: true }
    );

    await runner.runHook('post-pr');

    expect(mockPromptHookConfirmation).toHaveBeenCalled();
  });

  it('prompts for post-push hook', async () => {
    mockGetConfiguredHooks.mockReturnValue(['post-push']);
    mockPromptHookConfirmation.mockResolvedValue({ action: 'run' });
    mockExecuteHook.mockResolvedValue({
      hook: 'post-push',
      success: true,
      duration: 100,
    });

    const runner = new HookRunner(
      { 'post-push': 'echo "Pushed"' },
      { repoRoot: '/test', baseBranch: 'main', worktreePath: '/test/worktree' },
      { confirmHooks: true }
    );

    await runner.runHook('post-push');

    expect(mockPromptHookConfirmation).toHaveBeenCalled();
  });
});
