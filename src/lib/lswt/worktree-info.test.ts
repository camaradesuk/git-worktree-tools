import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gatherWorktreeInfo, createDefaultDeps, GatherDeps } from './worktree-info.js';
import type { Worktree } from '../git.js';
import type { ListOptions } from './types.js';

// Mock git
vi.mock('../git.js', () => ({
  listWorktrees: vi.fn(),
  getStatusOutput: vi.fn(),
}));

// Mock github
vi.mock('../github.js', () => ({
  getPr: vi.fn(),
}));

import * as git from '../git.js';
import * as github from '../github.js';

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
    getPrInfo: async () => ({ state: null, isDraft: null }),
    listOpenPrs: async () => [],
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
      const getPrInfo = vi.fn().mockResolvedValue({ state: 'OPEN', isDraft: false });
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrInfo,
      });

      await gatherWorktreeInfo('/home/user/other', { ...defaultOptions, showStatus: false }, deps);

      expect(getPrInfo).not.toHaveBeenCalled();
    });

    it('fetches PR state when showStatus is true', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr1', branch: 'feature', isMain: false }),
      ];
      const getPrInfo = vi.fn().mockResolvedValue({ state: 'OPEN', isDraft: false });
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrInfo,
      });

      const result = await gatherWorktreeInfo(
        '/home/user/other',
        { ...defaultOptions, showStatus: true },
        deps
      );

      expect(getPrInfo).toHaveBeenCalledWith(1);
      expect(result[0].prState).toBe('OPEN');
      expect(result[0].isDraft).toBe(false);
    });

    it('handles null PR state', async () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo.pr99', branch: 'feature', isMain: false }),
      ];
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrInfo: async () => ({ state: null, isDraft: null }),
      });

      const result = await gatherWorktreeInfo(
        '/home/user/other',
        { ...defaultOptions, showStatus: true },
        deps
      );

      expect(result[0].prState).toBeNull();
      expect(result[0].isDraft).toBeNull();
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
      const getPrInfo = vi
        .fn()
        .mockResolvedValueOnce({ state: 'OPEN', isDraft: false })
        .mockResolvedValueOnce({ state: 'MERGED', isDraft: false })
        .mockResolvedValueOnce({ state: 'CLOSED', isDraft: true });
      const deps = makeDeps({
        listWorktrees: () => worktrees,
        getPrInfo,
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

    describe('remote PRs', () => {
      it('includes remote PRs when showStatus is enabled', async () => {
        const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
        const remotePrs = [
          {
            number: 42,
            title: 'Add new feature',
            headBranch: 'feat/new-feature',
            url: 'https://github.com/owner/repo/pull/42',
            isDraft: false,
          },
        ];
        const deps = makeDeps({
          listWorktrees: () => worktrees,
          listOpenPrs: async () => remotePrs,
        });

        const result = await gatherWorktreeInfo(
          '/home/user/repo',
          { ...defaultOptions, showStatus: true },
          deps
        );

        expect(result).toHaveLength(2);
        const remotePr = result.find((w) => w.type === 'remote_pr');
        expect(remotePr).toBeDefined();
        expect(remotePr?.prNumber).toBe(42);
        expect(remotePr?.prTitle).toBe('Add new feature');
        expect(remotePr?.branch).toBe('feat/new-feature');
        expect(remotePr?.prUrl).toBe('https://github.com/owner/repo/pull/42');
        expect(remotePr?.prState).toBe('OPEN');
      });

      it('does not include remote PRs when showStatus is false', async () => {
        const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
        const listOpenPrs = vi.fn().mockResolvedValue([
          {
            number: 42,
            title: 'Add new feature',
            headBranch: 'feat/new-feature',
            url: 'https://github.com/owner/repo/pull/42',
            isDraft: false,
          },
        ]);
        const deps = makeDeps({
          listWorktrees: () => worktrees,
          listOpenPrs,
        });

        const result = await gatherWorktreeInfo(
          '/home/user/repo',
          { ...defaultOptions, showStatus: false },
          deps
        );

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('main');
        expect(listOpenPrs).not.toHaveBeenCalled();
      });

      it('filters out PRs that have local worktrees', async () => {
        const worktrees = [
          makeWorktree({ path: '/home/user/repo', branch: 'main' }),
          makeWorktree({ path: '/home/user/repo.pr42', branch: 'feat/existing', isMain: false }),
        ];
        const remotePrs = [
          {
            number: 42,
            title: 'Existing PR (has worktree)',
            headBranch: 'feat/existing',
            url: 'https://github.com/owner/repo/pull/42',
            isDraft: false,
          },
          {
            number: 99,
            title: 'Remote PR (no worktree)',
            headBranch: 'feat/remote',
            url: 'https://github.com/owner/repo/pull/99',
            isDraft: false,
          },
        ];
        const deps = makeDeps({
          listWorktrees: () => worktrees,
          listOpenPrs: async () => remotePrs,
          getPrInfo: async () => ({ state: 'OPEN', isDraft: false }),
        });

        const result = await gatherWorktreeInfo(
          '/home/user/repo',
          { ...defaultOptions, showStatus: true },
          deps
        );

        // Should have main, local PR #42, and remote PR #99
        expect(result).toHaveLength(3);
        const remotePr = result.find((w) => w.type === 'remote_pr');
        expect(remotePr?.prNumber).toBe(99);
        expect(result.find((w) => w.type === 'remote_pr' && w.prNumber === 42)).toBeUndefined();
      });

      it('returns empty remote PRs when listOpenPrs throws error', async () => {
        const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
        const deps = makeDeps({
          listWorktrees: () => worktrees,
          listOpenPrs: async () => {
            throw new Error('Network error');
          },
        });

        const result = await gatherWorktreeInfo(
          '/home/user/repo',
          { ...defaultOptions, showStatus: true },
          deps
        );

        // Should only have main worktree, no remote PRs
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('main');
      });

      it('includes draft status for remote PRs', async () => {
        const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
        const remotePrs = [
          {
            number: 42,
            title: 'Draft PR',
            headBranch: 'feat/draft',
            url: 'https://github.com/owner/repo/pull/42',
            isDraft: true,
          },
        ];
        const deps = makeDeps({
          listWorktrees: () => worktrees,
          listOpenPrs: async () => remotePrs,
        });

        const result = await gatherWorktreeInfo(
          '/home/user/repo',
          { ...defaultOptions, showStatus: true },
          deps
        );

        const remotePr = result.find((w) => w.type === 'remote_pr');
        expect(remotePr?.isDraft).toBe(true);
      });

      it('sets correct defaults for remote PR fields', async () => {
        const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
        const remotePrs = [
          {
            number: 42,
            title: 'Test PR',
            headBranch: 'feat/test',
            url: 'https://github.com/owner/repo/pull/42',
            isDraft: false,
          },
        ];
        const deps = makeDeps({
          listWorktrees: () => worktrees,
          listOpenPrs: async () => remotePrs,
        });

        const result = await gatherWorktreeInfo(
          '/home/user/repo',
          { ...defaultOptions, showStatus: true },
          deps
        );

        const remotePr = result.find((w) => w.type === 'remote_pr');
        expect(remotePr?.path).toBe('');
        expect(remotePr?.commit).toBe('');
        expect(remotePr?.hasChanges).toBe(false);
        expect(remotePr?.name).toBe('PR #42');
      });

      it('handles multiple remote PRs', async () => {
        const worktrees = [makeWorktree({ path: '/home/user/repo', branch: 'main' })];
        const remotePrs = [
          {
            number: 10,
            title: 'First PR',
            headBranch: 'feat/first',
            url: 'https://github.com/owner/repo/pull/10',
            isDraft: false,
          },
          {
            number: 20,
            title: 'Second PR',
            headBranch: 'feat/second',
            url: 'https://github.com/owner/repo/pull/20',
            isDraft: true,
          },
          {
            number: 30,
            title: 'Third PR',
            headBranch: 'feat/third',
            url: 'https://github.com/owner/repo/pull/30',
            isDraft: false,
          },
        ];
        const deps = makeDeps({
          listWorktrees: () => worktrees,
          listOpenPrs: async () => remotePrs,
        });

        const result = await gatherWorktreeInfo(
          '/home/user/repo',
          { ...defaultOptions, showStatus: true },
          deps
        );

        const remotePrs2 = result.filter((w) => w.type === 'remote_pr');
        expect(remotePrs2).toHaveLength(3);
        expect(remotePrs2.map((p) => p.prNumber)).toEqual([10, 20, 30]);
      });
    });
  });

  describe('createDefaultDeps', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns object with required methods', () => {
      const deps = createDefaultDeps();

      expect(deps).toHaveProperty('listWorktrees');
      expect(deps).toHaveProperty('hasUncommittedChanges');
      expect(deps).toHaveProperty('getPrInfo');
      expect(typeof deps.listWorktrees).toBe('function');
      expect(typeof deps.hasUncommittedChanges).toBe('function');
      expect(typeof deps.getPrInfo).toBe('function');
    });

    describe('listWorktrees', () => {
      it('calls git.listWorktrees with provided cwd', () => {
        const mockWorktrees = [{ path: '/repo', branch: 'main', commit: 'abc', isMain: true }];
        vi.mocked(git.listWorktrees).mockReturnValue(mockWorktrees as Worktree[]);

        const deps = createDefaultDeps();
        const result = deps.listWorktrees('/some/path');

        expect(git.listWorktrees).toHaveBeenCalledWith('/some/path');
        expect(result).toEqual(mockWorktrees);
      });
    });

    describe('hasUncommittedChanges', () => {
      it('returns true when git status has output', () => {
        vi.mocked(git.getStatusOutput).mockReturnValue(' M file.txt\n');

        const deps = createDefaultDeps();
        const result = deps.hasUncommittedChanges('/some/path');

        expect(result).toBe(true);
        expect(git.getStatusOutput).toHaveBeenCalledWith('/some/path');
      });

      it('returns false when git status has no output', () => {
        vi.mocked(git.getStatusOutput).mockReturnValue('');

        const deps = createDefaultDeps();
        const result = deps.hasUncommittedChanges('/some/path');

        expect(result).toBe(false);
      });

      it('returns false when git status throws error', () => {
        vi.mocked(git.getStatusOutput).mockImplementation(() => {
          throw new Error('git error');
        });

        const deps = createDefaultDeps();
        const result = deps.hasUncommittedChanges('/some/path');

        expect(result).toBe(false);
      });
    });

    describe('getPrInfo', () => {
      it('returns PR state and isDraft when PR exists', async () => {
        vi.mocked(github.getPr).mockReturnValue({
          number: 42,
          state: 'OPEN',
          isDraft: false,
          url: 'https://github.com/owner/repo/pull/42',
          title: 'Test PR',
          headBranch: 'feature-42',
          baseBranch: 'main',
        });

        const deps = createDefaultDeps();
        const result = await deps.getPrInfo(42);

        expect(github.getPr).toHaveBeenCalledWith(42);
        expect(result).toEqual({ state: 'OPEN', isDraft: false });
      });

      it('returns draft status for draft PRs', async () => {
        vi.mocked(github.getPr).mockReturnValue({
          number: 42,
          state: 'OPEN',
          isDraft: true,
          url: 'https://github.com/owner/repo/pull/42',
          title: 'Test PR',
          headBranch: 'feature-42',
          baseBranch: 'main',
        });

        const deps = createDefaultDeps();
        const result = await deps.getPrInfo(42);

        expect(result).toEqual({ state: 'OPEN', isDraft: true });
      });

      it('returns null state when PR not found', async () => {
        vi.mocked(github.getPr).mockReturnValue(null);

        const deps = createDefaultDeps();
        const result = await deps.getPrInfo(99);

        expect(result).toEqual({ state: null, isDraft: null });
      });

      it('returns null state when getPr throws error', async () => {
        vi.mocked(github.getPr).mockImplementation(() => {
          throw new Error('gh error');
        });

        const deps = createDefaultDeps();
        const result = await deps.getPrInfo(42);

        expect(result).toEqual({ state: null, isDraft: null });
      });

      it('handles MERGED PR state', async () => {
        vi.mocked(github.getPr).mockReturnValue({
          number: 42,
          state: 'MERGED',
          isDraft: false,
          url: 'https://github.com/owner/repo/pull/42',
          title: 'Test PR',
          headBranch: 'feature-42',
          baseBranch: 'main',
        });

        const deps = createDefaultDeps();
        const result = await deps.getPrInfo(42);

        expect(result).toEqual({ state: 'MERGED', isDraft: false });
      });

      it('handles CLOSED PR state', async () => {
        vi.mocked(github.getPr).mockReturnValue({
          number: 42,
          state: 'CLOSED',
          isDraft: false,
          url: 'https://github.com/owner/repo/pull/42',
          title: 'Test PR',
          headBranch: 'feature-42',
          baseBranch: 'main',
        });

        const deps = createDefaultDeps();
        const result = await deps.getPrInfo(42);

        expect(result).toEqual({ state: 'CLOSED', isDraft: false });
      });
    });
  });
});
