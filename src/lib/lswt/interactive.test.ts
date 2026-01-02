import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatWorktreeChoiceWithColors,
  formatTypeBadgeWithColors,
  formatStatusWithColors,
  runInteractiveMode,
} from './interactive.js';
import type { WorktreeDisplay, ListOptions } from './types.js';

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
    Separator: vi.fn().mockImplementation(() => ({ type: 'separator' })),
  },
}));

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

import inquirer from 'inquirer';
import * as git from '../git.js';
import { executeAction } from './action-executors.js';
import { gatherWorktreeInfo } from './worktree-info.js';

describe('lswt/interactive', () => {
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

      await runInteractiveMode([makeWorktree()], defaultOptions);

      expect(console.error).toHaveBeenCalled();
    });

    it('returns early when no worktrees provided', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');

      await runInteractiveMode([], defaultOptions);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No worktrees found'));
    });

    it('exits when user selects exit from worktree list', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ selected: null }); // Exit selection

      await runInteractiveMode([makeWorktree()], defaultOptions);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('exits when user selects exit action', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selected: worktree }) // Select worktree
        .mockResolvedValueOnce({ action: 'exit' }); // Select exit action

      await runInteractiveMode([worktree], defaultOptions);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('continues loop when user selects back action', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selected: worktree }) // First loop - select worktree
        .mockResolvedValueOnce({ action: 'back' }) // First loop - go back
        .mockResolvedValueOnce({ selected: null }); // Second loop - exit

      await runInteractiveMode([worktree], defaultOptions);

      // Prompt should be called 3 times
      expect(inquirer.prompt).toHaveBeenCalledTimes(3);
    });

    it('executes action and shows success message', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: true,
        message: 'Copied to clipboard',
      });
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selected: worktree }) // Select worktree
        .mockResolvedValueOnce({ action: 'copy_path' }) // Select action
        .mockResolvedValueOnce({ continue: '' }) // Press enter to continue
        .mockResolvedValueOnce({ selected: null }); // Exit

      await runInteractiveMode([worktree], defaultOptions);

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
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selected: worktree }) // Select worktree
        .mockResolvedValueOnce({ action: 'copy_path' }) // Select action
        .mockResolvedValueOnce({ continue: '' }) // Press enter to continue
        .mockResolvedValueOnce({ selected: null }); // Exit

      await runInteractiveMode([worktree], defaultOptions);

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
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selected: worktree }) // Select worktree
        .mockResolvedValueOnce({ action: 'remove_worktree' }) // Select action
        .mockResolvedValueOnce({ continue: '' }) // Press enter to continue
        .mockResolvedValueOnce({ selected: null }); // Exit

      await runInteractiveMode([worktree], defaultOptions);

      expect(gatherWorktreeInfo).toHaveBeenCalled();
    });

    it('exits immediately when action returns shouldExit', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktree = makeWorktree();
      vi.mocked(executeAction).mockResolvedValueOnce({
        success: true,
        shouldExit: true,
      });
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ selected: worktree }) // Select worktree
        .mockResolvedValueOnce({ action: 'open_editor' }); // Select action

      await runInteractiveMode([worktree], defaultOptions);

      // Should not prompt for continue since shouldExit is true
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
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
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ selected: null }); // Exit immediately

      await runInteractiveMode(worktrees, defaultOptions);

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
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ selected: null }); // Exit immediately

      await runInteractiveMode(worktrees, defaultOptions);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 PRs'));
    });

    it('displays changes count in header', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');
      const worktrees = [
        makeWorktree({ type: 'main', hasChanges: true }),
        makeWorktree({ type: 'branch', hasChanges: true }),
      ];
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ selected: null }); // Exit immediately

      await runInteractiveMode(worktrees, defaultOptions);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 with changes'));
    });
  });
});
