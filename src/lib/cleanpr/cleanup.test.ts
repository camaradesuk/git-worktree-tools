import { describe, it, expect, vi } from 'vitest';
import {
  groupWorktreesByState,
  getCleanableWorktrees,
  findWorktreeByPrNumber,
  canCleanWorktree,
  cleanWorktree,
  cleanWorktrees,
  formatPrState,
  summarizeResults,
  CleanupDeps,
} from './cleanup.js';
import type { CleanOptions, WorktreeInfo, CleanupResult } from './types.js';

describe('cleanpr/cleanup', () => {
  const makeWorktreeInfo = (overrides: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
    path: '/home/user/repo.pr1',
    branch: 'feature',
    commit: 'abc123',
    prNumber: 1,
    prState: 'OPEN',
    hasChanges: false,
    ...overrides,
  });

  const makeOptions = (overrides: Partial<CleanOptions> = {}): CleanOptions => ({
    deleteRemote: false,
    force: false,
    all: false,
    interactive: true,
    ...overrides,
  });

  const makeDeps = (overrides: Partial<CleanupDeps> = {}): CleanupDeps => ({
    removeWorktree: vi.fn(),
    deleteLocalBranch: vi.fn().mockReturnValue(true),
    deleteRemoteBranch: vi.fn().mockReturnValue(true),
    pruneWorktrees: vi.fn(),
    ...overrides,
  });

  describe('groupWorktreesByState', () => {
    it('groups worktrees by state', () => {
      const worktrees = [
        makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' }),
        makeWorktreeInfo({ prNumber: 2, prState: 'CLOSED' }),
        makeWorktreeInfo({ prNumber: 3, prState: 'OPEN' }),
        makeWorktreeInfo({ prNumber: 4, prState: 'UNKNOWN' }),
        makeWorktreeInfo({ prNumber: 5, prState: 'MERGED' }),
      ];

      const groups = groupWorktreesByState(worktrees);

      expect(groups.merged).toHaveLength(2);
      expect(groups.closed).toHaveLength(1);
      expect(groups.open).toHaveLength(1);
      expect(groups.unknown).toHaveLength(1);
    });

    it('returns empty arrays for missing states', () => {
      const worktrees = [makeWorktreeInfo({ prState: 'OPEN' })];

      const groups = groupWorktreesByState(worktrees);

      expect(groups.merged).toHaveLength(0);
      expect(groups.closed).toHaveLength(0);
      expect(groups.open).toHaveLength(1);
      expect(groups.unknown).toHaveLength(0);
    });

    it('handles empty array', () => {
      const groups = groupWorktreesByState([]);

      expect(groups.merged).toHaveLength(0);
      expect(groups.closed).toHaveLength(0);
      expect(groups.open).toHaveLength(0);
      expect(groups.unknown).toHaveLength(0);
    });
  });

  describe('getCleanableWorktrees', () => {
    it('returns merged and closed worktrees', () => {
      const worktrees = [
        makeWorktreeInfo({ prNumber: 1, prState: 'MERGED' }),
        makeWorktreeInfo({ prNumber: 2, prState: 'CLOSED' }),
        makeWorktreeInfo({ prNumber: 3, prState: 'OPEN' }),
        makeWorktreeInfo({ prNumber: 4, prState: 'UNKNOWN' }),
      ];

      const cleanable = getCleanableWorktrees(worktrees);

      expect(cleanable).toHaveLength(2);
      expect(cleanable.map((w) => w.prNumber)).toEqual([1, 2]);
    });

    it('returns empty array when no cleanable worktrees', () => {
      const worktrees = [
        makeWorktreeInfo({ prState: 'OPEN' }),
        makeWorktreeInfo({ prState: 'UNKNOWN' }),
      ];

      const cleanable = getCleanableWorktrees(worktrees);

      expect(cleanable).toHaveLength(0);
    });
  });

  describe('findWorktreeByPrNumber', () => {
    it('finds worktree by PR number', () => {
      const worktrees = [
        makeWorktreeInfo({ prNumber: 1 }),
        makeWorktreeInfo({ prNumber: 42 }),
        makeWorktreeInfo({ prNumber: 99 }),
      ];

      const found = findWorktreeByPrNumber(worktrees, 42);

      expect(found).toBeDefined();
      expect(found?.prNumber).toBe(42);
    });

    it('returns undefined when not found', () => {
      const worktrees = [makeWorktreeInfo({ prNumber: 1 })];

      const found = findWorktreeByPrNumber(worktrees, 999);

      expect(found).toBeUndefined();
    });
  });

  describe('canCleanWorktree', () => {
    it('returns true when no changes', () => {
      const info = makeWorktreeInfo({ hasChanges: false });
      const options = makeOptions({ force: false });

      expect(canCleanWorktree(info, options)).toBe(true);
    });

    it('returns false when has changes and not forced', () => {
      const info = makeWorktreeInfo({ hasChanges: true });
      const options = makeOptions({ force: false });

      expect(canCleanWorktree(info, options)).toBe(false);
    });

    it('returns true when has changes but forced', () => {
      const info = makeWorktreeInfo({ hasChanges: true });
      const options = makeOptions({ force: true });

      expect(canCleanWorktree(info, options)).toBe(true);
    });
  });

  describe('cleanWorktree', () => {
    it('returns failure when has uncommitted changes and not forced', () => {
      const info = makeWorktreeInfo({ prNumber: 42, hasChanges: true });
      const options = makeOptions({ force: false });
      const deps = makeDeps();

      const result = cleanWorktree(info, options, deps);

      expect(result.success).toBe(false);
      expect(result.prNumber).toBe(42);
      expect(result.message).toContain('uncommitted changes');
    });

    it('removes worktree', () => {
      const info = makeWorktreeInfo({ path: '/path/to/wt' });
      const options = makeOptions();
      const deps = makeDeps();

      cleanWorktree(info, options, deps);

      expect(deps.removeWorktree).toHaveBeenCalledWith('/path/to/wt', false);
    });

    it('removes worktree with force when option set', () => {
      const info = makeWorktreeInfo({ path: '/path/to/wt' });
      const options = makeOptions({ force: true });
      const deps = makeDeps();

      cleanWorktree(info, options, deps);

      expect(deps.removeWorktree).toHaveBeenCalledWith('/path/to/wt', true);
    });

    it('deletes local branch', () => {
      const info = makeWorktreeInfo({ branch: 'feature-branch' });
      const options = makeOptions();
      const deps = makeDeps();

      cleanWorktree(info, options, deps);

      expect(deps.deleteLocalBranch).toHaveBeenCalledWith('feature-branch');
    });

    it('does not delete local branch when null', () => {
      const info = makeWorktreeInfo({ branch: null });
      const options = makeOptions();
      const deps = makeDeps();

      cleanWorktree(info, options, deps);

      expect(deps.deleteLocalBranch).not.toHaveBeenCalled();
    });

    it('deletes remote branch when option set', () => {
      const info = makeWorktreeInfo({ branch: 'feature-branch' });
      const options = makeOptions({ deleteRemote: true });
      const deps = makeDeps();

      cleanWorktree(info, options, deps);

      expect(deps.deleteRemoteBranch).toHaveBeenCalledWith('feature-branch');
    });

    it('does not delete remote branch when option not set', () => {
      const info = makeWorktreeInfo({ branch: 'feature-branch' });
      const options = makeOptions({ deleteRemote: false });
      const deps = makeDeps();

      cleanWorktree(info, options, deps);

      expect(deps.deleteRemoteBranch).not.toHaveBeenCalled();
    });

    it('prunes worktrees after cleanup', () => {
      const info = makeWorktreeInfo();
      const options = makeOptions();
      const deps = makeDeps();

      cleanWorktree(info, options, deps);

      expect(deps.pruneWorktrees).toHaveBeenCalled();
    });

    it('returns success result on successful cleanup', () => {
      const info = makeWorktreeInfo({ prNumber: 42 });
      const options = makeOptions();
      const deps = makeDeps();

      const result = cleanWorktree(info, options, deps);

      expect(result.success).toBe(true);
      expect(result.prNumber).toBe(42);
      expect(result.message).toContain('Cleaned successfully');
    });

    it('returns failure result when removeWorktree throws', () => {
      const info = makeWorktreeInfo({ prNumber: 42 });
      const options = makeOptions();
      const deps = makeDeps({
        removeWorktree: vi.fn().mockImplementation(() => {
          throw new Error('Permission denied');
        }),
      });

      const result = cleanWorktree(info, options, deps);

      expect(result.success).toBe(false);
      expect(result.prNumber).toBe(42);
      expect(result.message).toContain('Failed to clean');
      expect(result.message).toContain('Permission denied');
    });
  });

  describe('cleanWorktrees', () => {
    it('cleans multiple worktrees', () => {
      const worktrees = [
        makeWorktreeInfo({ prNumber: 1, path: '/path1' }),
        makeWorktreeInfo({ prNumber: 2, path: '/path2' }),
      ];
      const options = makeOptions();
      const deps = makeDeps();

      const results = cleanWorktrees(worktrees, options, deps);

      expect(results).toHaveLength(2);
      expect(deps.removeWorktree).toHaveBeenCalledTimes(2);
    });

    it('returns array of results', () => {
      const worktrees = [
        makeWorktreeInfo({ prNumber: 1 }),
        makeWorktreeInfo({ prNumber: 2, hasChanges: true }),
      ];
      const options = makeOptions({ force: false });
      const deps = makeDeps();

      const results = cleanWorktrees(worktrees, options, deps);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('formatPrState', () => {
    it('formats MERGED to lowercase', () => {
      expect(formatPrState('MERGED')).toBe('merged');
    });

    it('formats CLOSED to lowercase', () => {
      expect(formatPrState('CLOSED')).toBe('closed');
    });

    it('formats OPEN to lowercase', () => {
      expect(formatPrState('OPEN')).toBe('open');
    });

    it('formats UNKNOWN to lowercase', () => {
      expect(formatPrState('UNKNOWN')).toBe('unknown');
    });
  });

  describe('summarizeResults', () => {
    it('summarizes all successful results', () => {
      const results: CleanupResult[] = [
        { success: true, prNumber: 1, message: '' },
        { success: true, prNumber: 2, message: '' },
      ];

      const summary = summarizeResults(results);

      expect(summary.total).toBe(2);
      expect(summary.cleaned).toBe(2);
      expect(summary.failed).toBe(0);
    });

    it('summarizes mixed results', () => {
      const results: CleanupResult[] = [
        { success: true, prNumber: 1, message: '' },
        { success: false, prNumber: 2, message: '' },
        { success: true, prNumber: 3, message: '' },
      ];

      const summary = summarizeResults(results);

      expect(summary.total).toBe(3);
      expect(summary.cleaned).toBe(2);
      expect(summary.failed).toBe(1);
    });

    it('handles empty results', () => {
      const summary = summarizeResults([]);

      expect(summary.total).toBe(0);
      expect(summary.cleaned).toBe(0);
      expect(summary.failed).toBe(0);
    });
  });
});
