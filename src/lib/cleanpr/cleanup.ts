/**
 * cleanpr cleanup - core cleanup logic with dependency injection
 */

import type { CleanOptions, WorktreeInfo, CleanupResult, PrState } from './types.js';

/**
 * Dependencies interface for cleanup operations
 */
export interface CleanupDeps {
  removeWorktree: (path: string, force: boolean) => void;
  deleteLocalBranch: (branch: string) => boolean;
  deleteRemoteBranch: (branch: string) => boolean;
  pruneWorktrees: () => void;
}

/**
 * Group worktrees by their PR state
 */
export interface GroupedWorktrees {
  merged: WorktreeInfo[];
  closed: WorktreeInfo[];
  open: WorktreeInfo[];
  unknown: WorktreeInfo[];
}

/**
 * Group worktrees by PR state - pure function
 */
export function groupWorktreesByState(worktrees: WorktreeInfo[]): GroupedWorktrees {
  return {
    merged: worktrees.filter((w) => w.prState === 'MERGED'),
    closed: worktrees.filter((w) => w.prState === 'CLOSED'),
    open: worktrees.filter((w) => w.prState === 'OPEN'),
    unknown: worktrees.filter((w) => w.prState === 'UNKNOWN'),
  };
}

/**
 * Get worktrees that are cleanable (merged or closed)
 */
export function getCleanableWorktrees(worktrees: WorktreeInfo[]): WorktreeInfo[] {
  return worktrees.filter((w) => w.prState === 'MERGED' || w.prState === 'CLOSED');
}

/**
 * Find a specific worktree by PR number
 */
export function findWorktreeByPrNumber(
  worktrees: WorktreeInfo[],
  prNumber: number
): WorktreeInfo | undefined {
  return worktrees.find((w) => w.prNumber === prNumber);
}

/**
 * Check if a worktree can be cleaned based on options
 */
export function canCleanWorktree(info: WorktreeInfo, options: CleanOptions): boolean {
  if (info.hasChanges && !options.force) {
    return false;
  }
  return true;
}

/**
 * Clean a single worktree - returns result object
 * Uses dependency injection for git operations
 */
export function cleanWorktree(
  info: WorktreeInfo,
  options: CleanOptions,
  deps: CleanupDeps
): CleanupResult {
  const prLabel = `PR #${info.prNumber}`;

  // Check for uncommitted changes
  if (!canCleanWorktree(info, options)) {
    return {
      success: false,
      prNumber: info.prNumber,
      message: `${prLabel}: Has uncommitted changes (use --force to override)`,
    };
  }

  try {
    // Remove worktree
    deps.removeWorktree(info.path, options.force);

    // Delete local branch
    if (info.branch) {
      deps.deleteLocalBranch(info.branch);

      // Delete remote branch if requested
      if (options.deleteRemote) {
        deps.deleteRemoteBranch(info.branch);
      }
    }

    // Prune worktrees
    deps.pruneWorktrees();

    return {
      success: true,
      prNumber: info.prNumber,
      message: `${prLabel}: Cleaned successfully`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      prNumber: info.prNumber,
      message: `${prLabel}: Failed to clean - ${message}`,
    };
  }
}

/**
 * Clean multiple worktrees - returns array of results
 */
export function cleanWorktrees(
  worktrees: WorktreeInfo[],
  options: CleanOptions,
  deps: CleanupDeps
): CleanupResult[] {
  return worktrees.map((w) => cleanWorktree(w, options, deps));
}

/**
 * Format PR state for display - pure function
 */
export function formatPrState(state: PrState): string {
  return state.toLowerCase();
}

/**
 * Create summary of cleanup results
 */
export interface CleanupSummary {
  total: number;
  cleaned: number;
  failed: number;
}

export function summarizeResults(results: CleanupResult[]): CleanupSummary {
  return {
    total: results.length,
    cleaned: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };
}
