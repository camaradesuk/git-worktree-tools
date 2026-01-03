import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatWorktreeChoiceWithColors,
  formatTypeBadgeWithColors,
  formatStatusWithColors,
  runInteractiveMode,
  type InteractiveDeps,
} from './interactive.js';
import type { WorktreeDisplay, ListOptions, WorktreeAction } from './types.js';

// Mock git
vi.mock('../git.js', () => ({
  getRepoRoot: vi.fn(),
}));

// Mock config
vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({}),
}));

// Mock environment
vi.mock('./environment.js', () => ({
  detectEnvironment: vi.fn(() => ({
    hasVscode: true,
    hasCursor: false,
    defaultEditor: 'vscode',
    platform: 'linux',
    isInteractive: true,
    shell: '/bin/bash',
    gitVersion: { major: 2, minor: 39, patch: 0, raw: 'git version 2.39.0' },
  })),
}));

// Mock actions
vi.mock('./actions.js', () => ({
  buildActionMenu: vi.fn(() => [
    { name: 'Open in editor', value: 'open_editor', shortcut: 'e' },
    { name: 'Exit', value: 'exit', shortcut: 'q' },
  ]),
  formatShortcutLegend: vi.fn(() => '[e] editor [q] exit'),
}));

// Mock action-executors
vi.mock('./action-executors.js', () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true }),
  createDefaultExecutorDeps: vi.fn().mockReturnValue({}),
}));

// Mock worktree-info
vi.mock('./worktree-info.js', () => ({
  gatherWorktreeInfo: vi.fn().mockResolvedValue([]),
  createDefaultDeps: vi.fn().mockReturnValue({}),
}));

import * as git from '../git.js';
import { executeAction } from './action-executors.js';
import { gatherWorktreeInfo } from './worktree-info.js';

describe('lswt/interactive', () => {
  // Helper to create mock interactive deps
  const createMockDeps = (overrides: Partial<InteractiveDeps> = {}): InteractiveDeps => ({
    selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
    selectAction: vi.fn().mockResolvedValue('exit' as WorktreeAction),
    pressEnterToContinue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const makeWorktree = (overrides: Partial<WorktreeDisplay> = {}): WorktreeDisplay => ({
    path: '/home/user/repo',
    name: 'repo',
    branch: 'main',
    commit: 'abc123',
    type: 'main',
    prNumber: null,
    prState: null,
    isDraft: null,
    hasChanges: false,
    ...overrides,
  });

  describe('formatTypeBadgeWithColors', () => {
    it('formats main worktree badge', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[main]');
    });

    it('formats PR worktree badge', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[PR #42]');
    });

    it('formats draft PR badge with DRAFT indicator', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('DRAFT');
      expect(result).toContain('#42');
    });

    it('formats branch worktree badge', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[branch]');
    });

    it('formats detached worktree badge', () => {
      const worktree = makeWorktree({
        type: 'detached',
        branch: null,
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[detached]');
    });

    it('formats remote PR worktree badge', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[PR #42 REMOTE]');
    });

    it('formats remote PR draft worktree badge', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('REMOTE');
      expect(result).toContain('DRAFT');
      expect(result).toContain('#42');
    });
  });

  describe('formatStatusWithColors', () => {
    it('returns empty string when no status info', () => {
      const worktree = makeWorktree({
        type: 'branch',
        prState: null,
        hasChanges: false,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toBe('');
    });

    it('shows OPEN status for open PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'OPEN',
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('OPEN');
    });

    it('shows MERGED status for merged PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'MERGED',
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('MERGED');
    });

    it('shows CLOSED status for closed PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'CLOSED',
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('CLOSED');
    });

    it('shows has changes indicator', () => {
      const worktree = makeWorktree({
        type: 'branch',
        hasChanges: true,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('has changes');
    });

    it('shows clean status for main worktree without changes', () => {
      const worktree = makeWorktree({
        type: 'main',
        hasChanges: false,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('clean');
    });

    it('shows both PR state and changes', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'OPEN',
        hasChanges: true,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('OPEN');
      expect(result).toContain('has changes');
    });
  });

  describe('formatWorktreeChoiceWithColors', () => {
    it('includes type badge', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('[main]');
    });

    it('includes branch name', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-xyz',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('feature-xyz');
    });

    it('shows (detached) for detached worktrees', () => {
      const worktree = makeWorktree({
        type: 'detached',
        branch: null,
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('(detached)');
    });

    it('includes status for PR worktrees', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        branch: 'feat/something',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('[PR #42]');
      expect(result).toContain('feat/something');
      expect(result).toContain('OPEN');
    });

    it('includes draft indicator for draft PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
        branch: 'feat/something',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('DRAFT');
    });

    it('includes has changes indicator', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature',
        hasChanges: true,
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('has changes');
    });

    it('shows PR title for remote PRs instead of branch', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
        branch: 'feat/some-long-branch-name',
        prTitle: 'Add amazing new feature',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('Add amazing new feature');
      expect(result).toContain('[PR #42 REMOTE]');
    });

    it('truncates long PR titles for remote PRs', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
        branch: 'feat/feature',
        prTitle: 'This is a very long pull request title that should be truncated for display',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      // Title should be truncated to 30 chars with ...
      expect(result).toContain('...');
    });

    it('shows OPEN status for remote PRs', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
        prTitle: 'New feature',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('OPEN');
    });

    it('includes draft indicator for remote PR drafts', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
        prTitle: 'Draft feature',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('DRAFT');
    });
  });

  describe('runInteractiveMode', () => {
    const defaultOptions: ListOptions = {
      showStatus: false,
      json: false,
      verbose: false,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      // Mock console methods
      vi.spyOn(console, 'clear').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns early with error when not in git repository', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue(null as unknown as string);
      const deps = createMockDeps();

      await runInteractiveMode([makeWorktree()], defaultOptions, deps);

      expect(console.error).toHaveBeenCalled();
    });

    it('returns early when no worktrees provided', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const deps = createMockDeps();

      await runInteractiveMode([], defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No worktrees found'));
    });

    it('exits when user selects exit from worktree list', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
      });

      await runInteractiveMode([makeWorktree()], defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('exits when user selects exit action', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree, action: null }),
        selectAction: vi.fn().mockResolvedValue('exit' as WorktreeAction),
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('continues loop when user selects back action', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      const selectWorktreeMock = vi
        .fn()
        .mockResolvedValueOnce({ worktree, action: null }) // First loop - select worktree
        .mockResolvedValueOnce({ worktree: null, action: null }); // Second loop - exit
      const deps = createMockDeps({
        selectWorktree: selectWorktreeMock,
        selectAction: vi.fn().mockResolvedValue('back' as WorktreeAction),
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      // selectWorktree should be called 2 times (first loop, then exit)
      expect(selectWorktreeMock).toHaveBeenCalledTimes(2);
    });

    it('executes action and shows success message', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: true,
        message: 'Copied to clipboard',
      });
      const selectWorktreeMock = vi
        .fn()
        .mockResolvedValueOnce({ worktree, action: null })
        .mockResolvedValueOnce({ worktree: null, action: null });
      const deps = createMockDeps({
        selectWorktree: selectWorktreeMock,
        selectAction: vi.fn().mockResolvedValue('copy_path' as WorktreeAction),
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      expect(executeAction).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Copied to clipboard'));
    });

    it('shows error message on failed action', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: false,
        message: 'Failed to copy',
      });
      const selectWorktreeMock = vi
        .fn()
        .mockResolvedValueOnce({ worktree, action: null })
        .mockResolvedValueOnce({ worktree: null, action: null });
      const deps = createMockDeps({
        selectWorktree: selectWorktreeMock,
        selectAction: vi.fn().mockResolvedValue('copy_path' as WorktreeAction),
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Failed to copy'));
    });

    it('refreshes worktree list when action returns shouldRefresh', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      const newWorktree = makeWorktree({ name: 'updated' });
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: true,
        message: 'Worktree removed',
        shouldRefresh: true,
      });
      vi.mocked(gatherWorktreeInfo).mockResolvedValueOnce([newWorktree]);
      const selectWorktreeMock = vi
        .fn()
        .mockResolvedValueOnce({ worktree, action: null })
        .mockResolvedValueOnce({ worktree: null, action: null });
      const deps = createMockDeps({
        selectWorktree: selectWorktreeMock,
        selectAction: vi.fn().mockResolvedValue('remove_worktree' as WorktreeAction),
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      expect(gatherWorktreeInfo).toHaveBeenCalled();
    });

    it('exits when refresh results in no remaining worktrees', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: true,
        message: 'Worktree removed',
        shouldRefresh: true,
      });
      // After refresh, no worktrees remain
      vi.mocked(gatherWorktreeInfo).mockResolvedValueOnce([]);
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree, action: null }),
        selectAction: vi.fn().mockResolvedValue('remove_worktree' as WorktreeAction),
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No worktrees remaining'));
    });

    it('exits immediately when action returns shouldExit', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: true,
        shouldExit: true,
      });
      const selectWorktreeMock = vi.fn().mockResolvedValue({ worktree, action: null });
      const deps = createMockDeps({
        selectWorktree: selectWorktreeMock,
        selectAction: vi.fn().mockResolvedValue('open_editor' as WorktreeAction),
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      // selectWorktree should only be called once since shouldExit is true
      expect(selectWorktreeMock).toHaveBeenCalledTimes(1);
    });

    it('handles worktree header display correctly', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main' }),
        makeWorktree({
          path: '/home/user/repo.pr1',
          type: 'pr',
          prNumber: 1,
          prState: 'OPEN',
          hasChanges: true,
        }),
      ];
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
      });

      await runInteractiveMode(worktrees, defaultOptions, deps);

      // Should display header with worktree count
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 worktrees'));
    });

    it('displays PR count in header', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktrees = [
        makeWorktree({ type: 'main' }),
        makeWorktree({ type: 'pr', prNumber: 1, prState: 'OPEN' }),
        makeWorktree({ type: 'pr', prNumber: 2, prState: 'MERGED' }),
      ];
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
      });

      await runInteractiveMode(worktrees, defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 local PRs'));
    });

    it('displays changes count in header', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktrees = [
        makeWorktree({ type: 'main', hasChanges: true }),
        makeWorktree({ type: 'branch', hasChanges: true }),
      ];
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
      });

      await runInteractiveMode(worktrees, defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 with changes'));
    });

    it('displays remote PR count in header', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktrees = [
        makeWorktree({ type: 'main' }),
        makeWorktree({ type: 'pr', prNumber: 1, prState: 'OPEN' }),
        makeWorktree({ type: 'remote_pr', prNumber: 10, prState: 'OPEN', prTitle: 'Remote PR 1' }),
        makeWorktree({ type: 'remote_pr', prNumber: 20, prState: 'OPEN', prTitle: 'Remote PR 2' }),
        makeWorktree({ type: 'remote_pr', prNumber: 30, prState: 'OPEN', prTitle: 'Remote PR 3' }),
      ];
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
      });

      await runInteractiveMode(worktrees, defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('3 remote PRs'));
    });

    it('shows worktree shortcut in header when remote PRs are present', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktrees = [
        makeWorktree({ type: 'main' }),
        makeWorktree({ type: 'remote_pr', prNumber: 42, prState: 'OPEN', prTitle: 'Remote PR' }),
      ];
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
      });

      await runInteractiveMode(worktrees, defaultOptions, deps);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[w]'));
    });

    it('displays correct local worktree count (excluding remote PRs)', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktrees = [
        makeWorktree({ type: 'main' }),
        makeWorktree({ type: 'pr', prNumber: 1, prState: 'OPEN' }),
        makeWorktree({ type: 'remote_pr', prNumber: 10, prState: 'OPEN', prTitle: 'Remote PR' }),
      ];
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree: null, action: null }),
      });

      await runInteractiveMode(worktrees, defaultOptions, deps);

      // Should show "2 worktrees" (main + local PR), not 3
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 worktrees'));
    });

    it('executes shortcut action directly when provided with selection', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: true,
        shouldExit: true,
      });
      // Simulate shortcut key press - returns both worktree and action
      const selectActionMock = vi.fn();
      const deps = createMockDeps({
        selectWorktree: vi.fn().mockResolvedValue({ worktree, action: 'open_editor' }),
        selectAction: selectActionMock,
      });

      await runInteractiveMode([worktree], defaultOptions, deps);

      // executeAction should be called with the shortcut action as first arg
      expect(executeAction).toHaveBeenCalled();
      const callArgs = vi.mocked(executeAction).mock.calls[0];
      expect(callArgs[0]).toBe('open_editor');
      expect(callArgs[1]).toEqual(worktree);
      // selectAction should NOT be called since action was provided via shortcut
      expect(selectActionMock).not.toHaveBeenCalled();
    });
  });
});
