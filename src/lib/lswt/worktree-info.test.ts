import { describe, it, expect, vi } from 'vitest';
import { gatherWorktreeInfo, createDefaultDeps, GatherDeps } from './worktree-info.js';
import type { Worktree } from '../git.js';
import type { ListOptions } from './types.js';

describe('lswt/worktree-info', () => {
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
    getPrState: async () => null,
    ...overrides,
  });

  const defaultOptions: ListOptions = {
    showStatus: false,
    json: false,
    verbose: false,
  };

  describe('gatherWorktreeInfo', () => {
    it('returns empty array when no worktrees', async () => {
      const deps = makeDeps({ listWorktrees: () => [] });
      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);
      expect(result).toEqual([]);
    });

    it('identifies main worktree', async () => {
      const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('main');
      expect(result[0].name).toBe('repo');
    });

    it('identifies PR worktree from path pattern', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', branch: 'main' }),
        makeWorktree({ path: '/home/user/repo.pr42', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('main');
      expect(result[1].type).toBe('pr');
      expect(result[1].prNumber).toBe(42);
    });

    it('identifies branch worktree', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', branch: 'main' }),
        makeWorktree({ path: '/home/user/feature-branch', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result).toHaveLength(2);
      const branchWorktree = result.find((w) => w.name === 'feature-branch');
      expect(branchWorktree?.type).toBe('branch');
    });

    it('identifies detached worktree', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', branch: 'main' }),
        makeWorktree({ path: '/home/user/detached-wt', branch: null, isMain: false }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result).toHaveLength(2);
      const detachedWorktree = result.find((w) => w.name === 'detached-wt');
      expect(detachedWorktree?.type).toBe('detached');
    });

    it('includes hasChanges from dependency', async () => {
      const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        hasUncommittedChanges: () => true,
      });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result[0].hasChanges).toBe(true);
    });

    it('does not fetch PR state when showStatus is false', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'feature', isMain: false }),
      ];
      const getPrState = vi.fn().mockResolvedValue('OPEN');
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrState,
      });

      await gatherWorktreeInfo('/home/user/other', { ...defaultOptions, showStatus: false }, deps);

      expect(getPrState).not.toHaveBeenCalled();
    });

    it('fetches PR state when showStatus is true', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'feature', isMain: false }),
      ];
      const getPrState = vi.fn().mockResolvedValue('OPEN');
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrState,
      });

      const result = await gatherWorktreeInfo(
        '/home/user/other',
        { ...defaultOptions, showStatus: true },
        deps
      );

      expect(getPrState).toHaveBeenCalledWith(1);
      expect(result[0].prState).toBe('OPEN');
    });

    it('handles null PR state', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr99', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrState: async () => null,
      });

      const result = await gatherWorktreeInfo(
        '/home/user/other',
        { ...defaultOptions, showStatus: true },
        deps
      );

      expect(result[0].prState).toBeNull();
    });

    it('returns sorted worktrees (main first, then PRs by number)', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr10', branch: 'f1', isMain: false }),
        makeWorktree({ path: '/home/user/repo.pr2', branch: 'f2', isMain: false }),
        makeWorktree({ path: '/home/user/repo', branch: 'main' }),
      ];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result[0].type).toBe('main');
      expect(result[1].prNumber).toBe(2);
      expect(result[2].prNumber).toBe(10);
    });

    it('includes commit from worktree', async () => {
      const worktrees = [makeWorktree({ path: '/home/user/repo', commit: 'deadbeef' })];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result[0].commit).toBe('deadbeef');
    });

    it('includes branch from worktree', async () => {
      const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'develop' })];
      const deps = makeDeps({ listWorktrees: () => worktrees });

      const result = await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(result[0].branch).toBe('develop');
    });

    it('calls hasUncommittedChanges for each worktree', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', branch: 'main' }),
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'f1', isMain: false }),
      ];
      const hasUncommittedChanges = vi.fn().mockReturnValue(false);
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        hasUncommittedChanges,
      });

      await gatherWorktreeInfo('/home/user/repo', defaultOptions, deps);

      expect(hasUncommittedChanges).toHaveBeenCalledTimes(2);
      expect(hasUncommittedChanges).toHaveBeenCalledWith('/home/user/repo');
      expect(hasUncommittedChanges).toHaveBeenCalledWith('/home/user/repo.pr1');
    });

    it('handles multiple PR state fetches', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'f1', isMain: false }),
        makeWorktree({ path: '/home/user/repo.pr2', branch: 'f2', isMain: false }),
        makeWorktree({ path: '/home/user/repo.pr3', branch: 'f3', isMain: false }),
      ];
      const getPrState = vi
        .fn()
        .mockResolvedValueOnce('OPEN')
        .mockResolvedValueOnce('MERGED')
        .mockResolvedValueOnce('CLOSED');
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrState,
      });

      const result = await gatherWorktreeInfo(
        '/home/user/other',
        { ...defaultOptions, showStatus: true },
        deps
      );

      expect(result[0].prState).toBe('OPEN');
      expect(result[1].prState).toBe('MERGED');
      expect(result[2].prState).toBe('CLOSED');
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
