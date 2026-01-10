/**
 * Tests for PR data layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultDataDeps,
  clearPrCache,
  isCacheValid,
  getCachedPrs,
  fetchPrList,
  correlatePrsWithWorktrees,
  applyFilters,
  fetchPrsWithWorktrees,
  getCacheAge,
  formatCacheAge,
} from './data.js';
import { createDefaultFilterState } from './types.js';
import type { PrListItem, PrDisplayItem, PrDataDeps, PrFilterState } from './types.js';

/** Create a mock PR for testing */
function createMockPr(overrides: Partial<PrListItem> = {}): PrListItem {
  return {
    number: 1,
    title: 'Test PR',
    state: 'OPEN',
    url: 'https://github.com/test/repo/pull/1',
    headBranch: 'feat/test',
    baseBranch: 'main',
    isDraft: false,
    author: 'testuser',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T12:00:00Z',
    labels: [],
    reviewDecision: null,
    approvalCount: 0,
    reviewCount: 0,
    checksStatus: null,
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    ...overrides,
  };
}

/** Create mock dependencies for testing */
function createMockDeps(overrides: Partial<PrDataDeps> = {}, prs: PrListItem[] = []): PrDataDeps {
  let currentTime = 1000000;
  return {
    fetchPrs: () => prs,
    getWorktrees: () => [],
    now: () => currentTime++,
    ...overrides,
  };
}

describe('PR Data Layer', () => {
  beforeEach(() => {
    clearPrCache();
  });

  describe('createDefaultDataDeps', () => {
    it('creates dependencies object with required functions', () => {
      const deps = createDefaultDataDeps();
      expect(typeof deps.fetchPrs).toBe('function');
      expect(typeof deps.getWorktrees).toBe('function');
      expect(typeof deps.now).toBe('function');
    });

    it('now() returns current timestamp', () => {
      const deps = createDefaultDataDeps();
      const before = Date.now();
      const result = deps.now();
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });

  describe('clearPrCache', () => {
    it('clears the cache', () => {
      const deps = createMockDeps({}, [createMockPr()]);

      // Populate cache
      fetchPrList({}, deps);
      expect(getCachedPrs(deps)).not.toBeNull();

      // Clear and verify
      clearPrCache();
      expect(getCachedPrs(deps)).toBeNull();
    });
  });

  describe('isCacheValid', () => {
    it('returns false when no cache exists', () => {
      const deps = createMockDeps();
      expect(isCacheValid(deps)).toBe(false);
    });

    it('returns true when cache is fresh', () => {
      const time = 1000000;
      const deps = createMockDeps(
        {
          now: () => time,
        },
        [createMockPr()]
      );

      fetchPrList({}, deps);
      expect(isCacheValid(deps)).toBe(true);
    });

    it('returns false when cache has expired', () => {
      let time = 1000000;
      const deps = createMockDeps(
        {
          now: () => time,
        },
        [createMockPr()]
      );

      fetchPrList({}, deps);

      // Advance time past TTL (60 seconds)
      time += 61000;
      expect(isCacheValid(deps)).toBe(false);
    });
  });

  describe('fetchPrList', () => {
    it('fetches PRs and caches them', () => {
      const prs = [createMockPr({ number: 1 }), createMockPr({ number: 2 })];
      let fetchCount = 0;
      const deps = createMockDeps({
        fetchPrs: () => {
          fetchCount++;
          return prs;
        },
      });

      const result1 = fetchPrList({}, deps);
      expect(result1).toHaveLength(2);
      expect(fetchCount).toBe(1);

      // Second call should use cache
      const result2 = fetchPrList({}, deps);
      expect(result2).toHaveLength(2);
      expect(fetchCount).toBe(1); // Still 1 - no new fetch
    });

    it('respects forceRefresh parameter', () => {
      const prs = [createMockPr()];
      let fetchCount = 0;
      const deps = createMockDeps({
        fetchPrs: () => {
          fetchCount++;
          return prs;
        },
      });

      fetchPrList({}, deps);
      expect(fetchCount).toBe(1);

      // Force refresh should bypass cache
      fetchPrList({}, deps, true);
      expect(fetchCount).toBe(2);
    });

    it('passes options to fetchPrs', () => {
      let receivedOptions: any = null;
      const deps = createMockDeps({
        fetchPrs: (options) => {
          receivedOptions = options;
          return [];
        },
      });

      fetchPrList({ state: 'closed', author: 'testuser', limit: 50 }, deps);

      expect(receivedOptions).toEqual({
        state: 'closed',
        author: 'testuser',
        limit: 50,
      });
    });
  });

  describe('correlatePrsWithWorktrees', () => {
    it('marks PRs with matching branch worktrees', () => {
      const prs = [
        createMockPr({ number: 1, headBranch: 'feat/one' }),
        createMockPr({ number: 2, headBranch: 'feat/two' }),
      ];
      const deps = createMockDeps({
        getWorktrees: () => [{ path: '/path/to/repo.pr1', branch: 'feat/one' }],
      });

      const result = correlatePrsWithWorktrees(prs, deps);

      expect(result[0].hasWorktree).toBe(true);
      expect(result[0].worktreePath).toBe('/path/to/repo.pr1');
      expect(result[1].hasWorktree).toBe(false);
      expect(result[1].worktreePath).toBeNull();
    });

    it('matches by worktree path pattern (*.prN)', () => {
      const prs = [createMockPr({ number: 42, headBranch: 'feat/other' })];
      const deps = createMockDeps({
        getWorktrees: () => [{ path: '/path/to/myrepo.pr42', branch: 'different-branch' }],
      });

      const result = correlatePrsWithWorktrees(prs, deps);

      expect(result[0].hasWorktree).toBe(true);
      expect(result[0].worktreePath).toBe('/path/to/myrepo.pr42');
    });

    it('handles Windows-style paths', () => {
      const prs = [createMockPr({ number: 123, headBranch: 'feat/test' })];
      const deps = createMockDeps({
        getWorktrees: () => [{ path: 'C:\\Users\\test\\repo.pr123', branch: null }],
      });

      const result = correlatePrsWithWorktrees(prs, deps);

      expect(result[0].hasWorktree).toBe(true);
    });

    it('prefers branch match over path pattern', () => {
      const prs = [createMockPr({ number: 1, headBranch: 'feat/test' })];
      const deps = createMockDeps({
        getWorktrees: () => [
          { path: '/path/to/repo.pr1', branch: 'different-branch' },
          { path: '/path/to/other', branch: 'feat/test' },
        ],
      });

      const result = correlatePrsWithWorktrees(prs, deps);

      expect(result[0].hasWorktree).toBe(true);
      expect(result[0].worktreePath).toBe('/path/to/other');
    });
  });

  describe('applyFilters', () => {
    const createDisplayItem = (overrides: Partial<PrDisplayItem> = {}): PrDisplayItem => ({
      ...createMockPr(),
      hasWorktree: false,
      worktreePath: null,
      ...overrides,
    });

    it('filters by state', () => {
      const prs = [
        createDisplayItem({ number: 1, state: 'OPEN' }),
        createDisplayItem({ number: 2, state: 'MERGED' }),
        createDisplayItem({ number: 3, state: 'CLOSED' }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        states: new Set(['OPEN', 'CLOSED']),
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.number)).toEqual([1, 3]);
    });

    it('filters by draft status - exclude drafts', () => {
      const prs = [
        createDisplayItem({ number: 1, isDraft: false }),
        createDisplayItem({ number: 2, isDraft: true }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: false,
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(1);
    });

    it('filters by draft status - only drafts', () => {
      const prs = [
        createDisplayItem({ number: 1, isDraft: false }),
        createDisplayItem({ number: 2, isDraft: true }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: 'only',
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(2);
    });

    it('filters by labels (OR logic)', () => {
      const prs = [
        createDisplayItem({ number: 1, labels: ['bug', 'urgent'] }),
        createDisplayItem({ number: 2, labels: ['enhancement'] }),
        createDisplayItem({ number: 3, labels: ['bug'] }),
        createDisplayItem({ number: 4, labels: [] }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        labels: ['bug'],
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.number)).toEqual([1, 3]);
    });

    it('filters by author', () => {
      const prs = [
        createDisplayItem({ number: 1, author: 'alice' }),
        createDisplayItem({ number: 2, author: 'bob' }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        author: 'alice',
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('alice');
    });

    it('filters by author with @ prefix', () => {
      const prs = [
        createDisplayItem({ number: 1, author: 'alice' }),
        createDisplayItem({ number: 2, author: 'bob' }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        author: '@alice',
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('alice');
    });

    it('filters by worktree presence - only with worktree', () => {
      const prs = [
        createDisplayItem({ number: 1, hasWorktree: true }),
        createDisplayItem({ number: 2, hasWorktree: false }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        hasWorktree: true,
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(1);
    });

    it('filters by worktree presence - only without worktree', () => {
      const prs = [
        createDisplayItem({ number: 1, hasWorktree: true }),
        createDisplayItem({ number: 2, hasWorktree: false }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        hasWorktree: false,
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(2);
    });

    it('filters by search query', () => {
      const prs = [
        createDisplayItem({ number: 42, title: 'Fix login bug', author: 'alice' }),
        createDisplayItem({ number: 43, title: 'Add dark mode', author: 'bob' }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        searchQuery: 'login',
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(42);
    });

    it('search query matches PR number', () => {
      const prs = [
        createDisplayItem({ number: 42, title: 'Some PR' }),
        createDisplayItem({ number: 43, title: 'Other PR' }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        searchQuery: '#42',
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(42);
    });

    it('search query matches author', () => {
      const prs = [
        createDisplayItem({ number: 1, author: 'alice' }),
        createDisplayItem({ number: 2, author: 'bob' }),
      ];
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        searchQuery: '@bob',
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('bob');
    });

    it('combines multiple filters', () => {
      const prs = [
        createDisplayItem({ number: 1, state: 'OPEN', isDraft: false, author: 'alice' }),
        createDisplayItem({ number: 2, state: 'OPEN', isDraft: true, author: 'alice' }),
        createDisplayItem({ number: 3, state: 'MERGED', isDraft: false, author: 'alice' }),
        createDisplayItem({ number: 4, state: 'OPEN', isDraft: false, author: 'bob' }),
      ];
      const filters: PrFilterState = {
        states: new Set(['OPEN']),
        showDrafts: false,
        labels: [],
        author: 'alice',
        hasWorktree: null,
        searchQuery: '',
      };

      const result = applyFilters(prs, filters);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(1);
    });
  });

  describe('fetchPrsWithWorktrees', () => {
    it('fetches and correlates PRs in one call', () => {
      const prs = [createMockPr({ number: 1, headBranch: 'feat/test' })];
      const deps = createMockDeps({
        fetchPrs: () => prs,
        getWorktrees: () => [{ path: '/path/to/repo.pr1', branch: 'feat/test' }],
      });

      const result = fetchPrsWithWorktrees({}, deps);

      expect(result).toHaveLength(1);
      expect(result[0].hasWorktree).toBe(true);
      expect(result[0].worktreePath).toBe('/path/to/repo.pr1');
    });
  });

  describe('getCacheAge', () => {
    it('returns null when no cache', () => {
      const deps = createMockDeps();
      expect(getCacheAge(deps)).toBeNull();
    });

    it('returns age in milliseconds', () => {
      let time = 1000000;
      const deps = createMockDeps(
        {
          now: () => time,
        },
        [createMockPr()]
      );

      fetchPrList({}, deps);
      time += 5000; // 5 seconds later

      const age = getCacheAge(deps);
      expect(age).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('formatCacheAge', () => {
    it('returns "not cached" when no cache', () => {
      const deps = createMockDeps();
      expect(formatCacheAge(deps)).toBe('not cached');
    });

    it('formats seconds', () => {
      let time = 1000000;
      const deps = createMockDeps(
        {
          now: () => time,
        },
        [createMockPr()]
      );

      fetchPrList({}, deps);
      time += 30000; // 30 seconds

      expect(formatCacheAge(deps)).toMatch(/^\d+s ago$/);
    });

    it('formats minutes', () => {
      let time = 1000000;
      const deps = createMockDeps(
        {
          now: () => time,
        },
        [createMockPr()]
      );

      fetchPrList({}, deps);
      time += 120000; // 2 minutes

      expect(formatCacheAge(deps)).toMatch(/^\d+m ago$/);
    });
  });
});
