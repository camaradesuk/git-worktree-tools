import { describe, it, expect } from 'vitest';
import {
  extractPrNumber,
  isMainWorktree,
  formatTypeLabel,
  sortWorktrees,
  getDisplayPath,
  formatJsonOutput,
} from './formatters.js';
import type { WorktreeDisplay } from './types.js';

describe('lswt/formatters', () => {
  describe('extractPrNumber', () => {
    it('extracts PR number from .pr123 pattern', () => {
      expect(extractPrNumber('/home/user/repo.pr123')).toBe(123);
    });

    it('extracts PR number from .pr-123 pattern', () => {
      expect(extractPrNumber('/home/user/repo.pr-42')).toBe(42);
    });

    it('extracts PR number from -pr123 pattern', () => {
      expect(extractPrNumber('/home/user/repo-pr99')).toBe(99);
    });

    it('extracts PR number from _pr123 pattern', () => {
      expect(extractPrNumber('/home/user/repo_pr5')).toBe(5);
    });

    it('returns null for non-PR path', () => {
      expect(extractPrNumber('/home/user/repo')).toBeNull();
    });

    it('returns null for path with pr in middle', () => {
      expect(extractPrNumber('/home/user/project-name')).toBeNull();
    });

    it('extracts from nested path', () => {
      expect(extractPrNumber('/workspace/projects/myrepo.pr42')).toBe(42);
    });
  });

  describe('isMainWorktree', () => {
    it('returns true when paths match', () => {
      expect(isMainWorktree('/home/user/repo', '/home/user/repo')).toBe(true);
    });

    it('returns false when paths differ', () => {
      expect(isMainWorktree('/home/user/repo.pr1', '/home/user/repo')).toBe(false);
    });

    it('handles trailing slashes', () => {
      expect(isMainWorktree('/home/user/repo/', '/home/user/repo')).toBe(true);
    });

    it('resolves relative paths', () => {
      expect(isMainWorktree('/home/user/../user/repo', '/home/user/repo')).toBe(true);
    });
  });

  describe('formatTypeLabel', () => {
    const makeDisplay = (overrides: Partial<WorktreeDisplay> = {}): WorktreeDisplay => ({
      path: '/repo',
      name: 'repo',
      branch: 'main',
      commit: 'abc123',
      type: 'main',
      prNumber: null,
      prState: null,
      hasChanges: false,
      ...overrides,
    });

    it('formats main worktree', () => {
      const display = makeDisplay({ type: 'main' });
      expect(formatTypeLabel(display)).toEqual({ text: '[main]', color: 'cyan' });
    });

    it('formats PR with OPEN state', () => {
      const display = makeDisplay({ type: 'pr', prNumber: 1, prState: 'OPEN' });
      expect(formatTypeLabel(display)).toEqual({ text: '[PR #1 OPEN]', color: 'green' });
    });

    it('formats PR with MERGED state', () => {
      const display = makeDisplay({ type: 'pr', prNumber: 2, prState: 'MERGED' });
      expect(formatTypeLabel(display)).toEqual({ text: '[PR #2 MERGED]', color: 'yellow' });
    });

    it('formats PR with CLOSED state', () => {
      const display = makeDisplay({ type: 'pr', prNumber: 3, prState: 'CLOSED' });
      expect(formatTypeLabel(display)).toEqual({ text: '[PR #3 CLOSED]', color: 'red' });
    });

    it('formats PR with unknown state', () => {
      const display = makeDisplay({ type: 'pr', prNumber: 4, prState: null });
      expect(formatTypeLabel(display)).toEqual({ text: '[PR #4]', color: 'dim' });
    });

    it('formats branch type', () => {
      const display = makeDisplay({ type: 'branch' });
      expect(formatTypeLabel(display)).toEqual({ text: '[branch]', color: 'blue' });
    });

    it('formats detached type', () => {
      const display = makeDisplay({ type: 'detached', branch: null });
      expect(formatTypeLabel(display)).toEqual({ text: '[detached]', color: 'dim' });
    });
  });

  describe('sortWorktrees', () => {
    const makeWorktree = (
      type: WorktreeDisplay['type'],
      prNumber: number | null,
      name: string
    ): WorktreeDisplay => ({
      path: `/path/${name}`,
      name,
      branch: 'b',
      commit: 'c',
      type,
      prNumber,
      prState: null,
      hasChanges: false,
    });

    it('puts main first', () => {
      const worktrees = [makeWorktree('pr', 1, 'repo.pr1'), makeWorktree('main', null, 'repo')];
      const sorted = sortWorktrees(worktrees);
      expect(sorted[0].type).toBe('main');
    });

    it('sorts PRs by number', () => {
      const worktrees = [
        makeWorktree('pr', 10, 'repo.pr10'),
        makeWorktree('pr', 2, 'repo.pr2'),
        makeWorktree('pr', 5, 'repo.pr5'),
      ];
      const sorted = sortWorktrees(worktrees);
      expect(sorted.map((w) => w.prNumber)).toEqual([2, 5, 10]);
    });

    it('puts PRs before branches', () => {
      const worktrees = [
        makeWorktree('branch', null, 'feature'),
        makeWorktree('pr', 1, 'repo.pr1'),
      ];
      const sorted = sortWorktrees(worktrees);
      expect(sorted[0].type).toBe('pr');
    });

    it('sorts branches alphabetically', () => {
      const worktrees = [
        makeWorktree('branch', null, 'zebra'),
        makeWorktree('branch', null, 'alpha'),
      ];
      const sorted = sortWorktrees(worktrees);
      expect(sorted.map((w) => w.name)).toEqual(['alpha', 'zebra']);
    });

    it('does not mutate original array', () => {
      const worktrees = [makeWorktree('pr', 1, 'a'), makeWorktree('main', null, 'b')];
      const originalFirst = worktrees[0];
      sortWorktrees(worktrees);
      expect(worktrees[0]).toBe(originalFirst);
    });

    it('handles empty array', () => {
      expect(sortWorktrees([])).toEqual([]);
    });

    it('handles single item', () => {
      const worktrees = [makeWorktree('main', null, 'repo')];
      const sorted = sortWorktrees(worktrees);
      expect(sorted).toHaveLength(1);
    });
  });

  describe('getDisplayPath', () => {
    it('returns full path in verbose mode', () => {
      expect(getDisplayPath('/home/user/repo', '/home/user', true)).toBe('/home/user/repo');
    });

    it('returns relative path when in same directory', () => {
      expect(getDisplayPath('/home/user/repo.pr1', '/home/user/repo', false)).toBe('../repo.pr1');
    });

    it('returns dot for current directory', () => {
      expect(getDisplayPath('/home/user/repo', '/home/user/repo', false)).toBe('.');
    });

    it('returns relative path when in parent directory', () => {
      expect(getDisplayPath('/home/user/repo.pr1', '/home/user', false)).toBe('repo.pr1');
    });

    it('returns full path when not related', () => {
      expect(getDisplayPath('/other/path/repo', '/home/user/repo', false)).toBe('/other/path/repo');
    });
  });

  describe('formatJsonOutput', () => {
    it('formats empty array', () => {
      expect(formatJsonOutput([])).toBe('[]');
    });

    it('formats worktrees as JSON', () => {
      const worktrees: WorktreeDisplay[] = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main',
          prNumber: null,
          prState: null,
          hasChanges: false,
        },
      ];
      const json = formatJsonOutput(worktrees);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].path).toBe('/repo');
      expect(parsed[0].type).toBe('main');
    });

    it('includes all fields', () => {
      const worktrees: WorktreeDisplay[] = [
        {
          path: '/repo.pr1',
          name: 'repo.pr1',
          branch: 'feature',
          commit: 'def456',
          type: 'pr',
          prNumber: 1,
          prState: 'OPEN',
          hasChanges: true,
        },
      ];
      const json = formatJsonOutput(worktrees);
      const parsed = JSON.parse(json);
      expect(parsed[0]).toEqual({
        path: '/repo.pr1',
        name: 'repo.pr1',
        branch: 'feature',
        commit: 'def456',
        type: 'pr',
        prNumber: 1,
        prState: 'OPEN',
        hasChanges: true,
      });
    });

    it('formats multiple worktrees', () => {
      const worktrees: WorktreeDisplay[] = [
        {
          path: '/repo',
          name: 'repo',
          branch: 'main',
          commit: 'a',
          type: 'main',
          prNumber: null,
          prState: null,
          hasChanges: false,
        },
        {
          path: '/repo.pr1',
          name: 'repo.pr1',
          branch: 'f',
          commit: 'b',
          type: 'pr',
          prNumber: 1,
          prState: 'OPEN',
          hasChanges: true,
        },
      ];
      const json = formatJsonOutput(worktrees);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
    });
  });
});
