/**
 * PR data layer - fetching, caching, and worktree correlation
 */

import * as git from '../git.js';
import { listPrsExtended } from '../github.js';
import type {
  PrListItem,
  PrDisplayItem,
  PrFilterState,
  ListPrsExtendedOptions,
  PrDataDeps,
  PrCacheEntry,
} from './types.js';

/** Default cache TTL in milliseconds (60 seconds) */
const DEFAULT_CACHE_TTL = 60 * 1000;

/** In-memory PR cache */
let prCache: PrCacheEntry | null = null;

/**
 * Create default dependencies for PR data operations
 */
export function createDefaultDataDeps(): PrDataDeps {
  return {
    fetchPrs: listPrsExtended,
    getWorktrees: (cwd?: string) => {
      const worktrees = git.listWorktrees(cwd);
      return worktrees.map((wt) => ({
        path: wt.path,
        branch: wt.branch,
      }));
    },
    now: () => Date.now(),
  };
}

/**
 * Clear the PR cache
 */
export function clearPrCache(): void {
  prCache = null;
}

/**
 * Check if cache is valid
 */
export function isCacheValid(deps: PrDataDeps = createDefaultDataDeps()): boolean {
  if (!prCache) return false;
  const age = deps.now() - prCache.timestamp;
  return age < prCache.ttl;
}

/**
 * Get cached PRs if available and valid
 */
export function getCachedPrs(deps: PrDataDeps = createDefaultDataDeps()): PrListItem[] | null {
  if (prCache && isCacheValid(deps)) {
    return prCache.prs;
  }
  return null;
}

/**
 * Fetch PRs from GitHub with caching
 */
export function fetchPrList(
  options: ListPrsExtendedOptions,
  deps: PrDataDeps = createDefaultDataDeps(),
  forceRefresh = false,
  cwd?: string
): PrListItem[] {
  // Check cache first (unless force refresh)
  if (!forceRefresh && prCache) {
    const age = deps.now() - prCache.timestamp;
    if (age < prCache.ttl) {
      return prCache.prs;
    }
  }

  // Fetch from GitHub
  const prs = deps.fetchPrs(options, cwd);

  // Update cache
  prCache = {
    prs,
    timestamp: deps.now(),
    ttl: DEFAULT_CACHE_TTL,
  };

  return prs;
}

/**
 * Correlate PRs with existing worktrees
 * Matches by:
 * 1. Branch name match (pr.headBranch === worktree.branch)
 * 2. Worktree path pattern match (*.prN where N is PR number)
 */
export function correlatePrsWithWorktrees(
  prs: PrListItem[],
  deps: PrDataDeps = createDefaultDataDeps(),
  cwd?: string
): PrDisplayItem[] {
  const worktrees = deps.getWorktrees(cwd);

  return prs.map((pr) => {
    // Check for branch name match
    let matchingWorktree = worktrees.find((wt) => wt.branch === pr.headBranch);

    // If no branch match, check for path pattern match (*.prN)
    if (!matchingWorktree) {
      const prPattern = new RegExp(`\\.pr${pr.number}(?:[/\\\\]|$)`);
      matchingWorktree = worktrees.find((wt) => prPattern.test(wt.path));
    }

    return {
      ...pr,
      hasWorktree: !!matchingWorktree,
      worktreePath: matchingWorktree?.path ?? null,
    };
  });
}

/**
 * Apply client-side filters to PR list
 */
export function applyFilters(prs: PrDisplayItem[], filters: PrFilterState): PrDisplayItem[] {
  return prs.filter((pr) => {
    // Filter by state
    if (!filters.states.has(pr.state)) {
      return false;
    }

    // Filter by draft status
    if (filters.showDrafts === false && pr.isDraft) {
      return false;
    }
    if (filters.showDrafts === 'only' && !pr.isDraft) {
      return false;
    }

    // Filter by labels (OR logic - must have at least one)
    if (filters.labels.length > 0) {
      const hasMatchingLabel = filters.labels.some((filterLabel) =>
        pr.labels.some((prLabel) => prLabel.toLowerCase() === filterLabel.toLowerCase())
      );
      if (!hasMatchingLabel) {
        return false;
      }
    }

    // Filter by author
    if (filters.author !== null) {
      const authorMatch =
        pr.author.toLowerCase() === filters.author.toLowerCase() ||
        pr.author.toLowerCase() === filters.author.replace(/^@/, '').toLowerCase();
      if (!authorMatch) {
        return false;
      }
    }

    // Filter by worktree presence
    if (filters.hasWorktree === true && !pr.hasWorktree) {
      return false;
    }
    if (filters.hasWorktree === false && pr.hasWorktree) {
      return false;
    }

    // Filter by search query (fuzzy match on title, number, author)
    if (filters.searchQuery.length > 0) {
      const query = filters.searchQuery.toLowerCase();
      const searchable = `#${pr.number} ${pr.title} @${pr.author}`.toLowerCase();
      if (!searchable.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Fetch and correlate PRs with worktrees in one call
 */
export function fetchPrsWithWorktrees(
  options: ListPrsExtendedOptions,
  deps: PrDataDeps = createDefaultDataDeps(),
  forceRefresh = false,
  cwd?: string
): PrDisplayItem[] {
  const prs = fetchPrList(options, deps, forceRefresh, cwd);
  return correlatePrsWithWorktrees(prs, deps, cwd);
}

/**
 * Get cache age in milliseconds (or null if no cache)
 */
export function getCacheAge(deps: PrDataDeps = createDefaultDataDeps()): number | null {
  if (!prCache) return null;
  return deps.now() - prCache.timestamp;
}

/**
 * Format cache age for display
 */
export function formatCacheAge(deps: PrDataDeps = createDefaultDataDeps()): string {
  const age = getCacheAge(deps);
  if (age === null) return 'not cached';

  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
