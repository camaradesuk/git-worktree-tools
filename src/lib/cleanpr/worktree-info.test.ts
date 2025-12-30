import { describe, it, expect, vi } from 'vitest';
import {
  extractPrNumber,
  gatherPrWorktreeInfo,
  createDefaultDeps,
  GatherDeps,
} from './worktree-info.js';
import type { Worktree } from '../git.js';

describe('cleanpr/worktree-info', () => {
  const makeWorktree = (overrides: Partial<Worktree> = {}): Worktree => ({
    path: '/home/user/repo',
    branch: 'main',
    commit: 'abc123',
    isMain: true,
    isBare: false,
    isLocked: false,
    isPrunable: false,
    ...overrides,
  });

  const makeDeps = (overrides: Partial<GatherDeps> = {}): GatherDeps => ({
    listWorktrees: () => [],
    hasUncommittedChanges: () => false,
    getPrState: async () => 'UNKNOWN',
    ...overrides,
  });

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

    it('extracts using custom pattern with {number}', () => {
      expect(extractPrNumber('/workspace/myrepo.pr42', '{repo}.pr{number}')).toBe(42);
    });

    it('extracts using custom pattern with different format', () => {
      expect(extractPrNumber('/workspace/myrepo-issue-99', '{repo}-issue-{number}')).toBe(99);
    });

    it('falls back to common patterns if custom pattern does not match', () => {
      expect(extractPrNumber('/home/user/repo.pr123', 'nomatch{number}')).toBe(123);
    });
  });

  describe('gatherPrWorktreeInfo', () => {
    it('returns empty array when no worktrees', async () => {
      const deps = makeDeps({ listWorktrees: () => [] });
      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);
      expect(result).toEqual([]);
    });

    it('filters out non-PR worktrees', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', branch: 'main' }),
        makeWorktree({ path: '/home/user/feature-branch', branch: 'feature' }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);
      expect(result).toHaveLength(0);
    });

    it('includes only PR worktrees', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', branch: 'main' }),
        makeWorktree({ path: '/home/user/repo.pr42', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);
      expect(result).toHaveLength(1);
      expect(result[0].prNumber).toBe(42);
    });

    it('includes prState from dependency', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrState: async () => 'MERGED',
      });

      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);
      expect(result[0].prState).toBe('MERGED');
    });

    it('includes hasChanges from dependency', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        hasUncommittedChanges: () => true,
      });

      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);
      expect(result[0].hasChanges).toBe(true);
    });

    it('sorts worktrees by PR number', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr10', branch: 'f1', isMain: false }),
        makeWorktree({ path: '/home/user/repo.pr2', branch: 'f2', isMain: false }),
        makeWorktree({ path: '/home/user/repo.pr5', branch: 'f3', isMain: false }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);
      expect(result.map((w) => w.prNumber)).toEqual([2, 5, 10]);
    });

    it('fetches PR state for each PR worktree', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'f1', isMain: false }),
        makeWorktree({ path: '/home/user/repo.pr2', branch: 'f2', isMain: false }),
      ];
      const getPrState = vi
        .fn()
        .mockResolvedValueOnce('OPEN')
        .mockResolvedValueOnce('MERGED');
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrState,
      });

      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);

      expect(getPrState).toHaveBeenCalledTimes(2);
      expect(getPrState).toHaveBeenCalledWith(1);
      expect(getPrState).toHaveBeenCalledWith(2);
      // Results are sorted by PR number
      expect(result[0].prState).toBe('OPEN');
      expect(result[1].prState).toBe('MERGED');
    });

    it('uses custom worktree pattern when provided', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo-issue-42', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherPrWorktreeInfo(
        '/home/user/repo',
        '{repo}-issue-{number}',
        deps
      );
      expect(result).toHaveLength(1);
      expect(result[0].prNumber).toBe(42);
    });

    it('includes branch and commit from worktree', async () => {
      const worktrees = [
        makeWorktree({
          path: '/home/user/repo.pr1',
          branch: 'feature-branch',
          commit: 'deadbeef',
          isMain: false,
        }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherPrWorktreeInfo('/home/user/repo', undefined, deps);
      expect(result[0].branch).toBe('feature-branch');
      expect(result[0].commit).toBe('deadbeef');
    });
  });

  describe('createDefaultDeps', () => {
    it('returns object with required methods', () => {
      const deps = createDefaultDeps();

      expect(deps).toHaveProperty('listWorktrees');
      expect(deps).toHaveProperty('hasUncommittedChanges');
      expect(deps).toHaveProperty('getPrState');
      expect(typeof deps.listWorktrees).toBe('function');
      expect(typeof deps.hasUncommittedChanges).toBe('function');
      expect(typeof deps.getPrState).toBe('function');
    });
  });
});
