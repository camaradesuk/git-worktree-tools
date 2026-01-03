/**
 * Clean worktrees API - Clean up merged/closed PR worktrees
 *
 * Wraps the cleanpr module to provide a clean programmatic interface.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import {
  gatherPrWorktreeInfo,
  createDefaultDeps,
  getCleanableWorktrees,
  findWorktreeByPrNumber,
  cleanWorktree,
  cleanWorktrees as cleanWorktreesBatch,
  summarizeResults,
  type WorktreeInfo as CleanprWorktreeInfo,
  type CleanOptions,
  type CleanupDeps,
} from '../lib/cleanpr/index.js';
import { loadConfig } from '../lib/config.js';
import {
  type CommandResult,
  type CleanprResultData,
  type CleanprDryRunData,
  createSuccessResult,
  createErrorResult,
  ErrorCode,
} from '../lib/json-output.js';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';

/**
 * Information about a cleaned worktree
 */
export interface CleanedWorktree {
  /** PR number */
  prNumber: number;
  /** Branch name */
  branch: string | null;
  /** Worktree path that was removed */
  path: string;
  /** PR state: 'MERGED', 'CLOSED', etc. */
  prState: string;
  /** Whether local branch was deleted */
  localBranchDeleted: boolean;
  /** Whether remote branch was deleted */
  remoteBranchDeleted: boolean;
}

/**
 * Options for cleaning worktrees
 */
export interface CleanWorktreesOptions {
  /** Specific PR number to clean (null = clean all cleanable) */
  prNumber?: number | null;
  /** Force remove even if PR is still open */
  force?: boolean;
  /** Also delete remote branches */
  deleteRemote?: boolean;
  /** Dry run - show what would be cleaned without doing it */
  dryRun?: boolean;
  /** Working directory (defaults to current directory) */
  cwd?: string;
}

/**
 * Result data for cleanWorktrees
 */
export type CleanWorktreesResultData = CleanprResultData | CleanprDryRunData;

/**
 * Result type for cleanWorktrees
 */
export type CleanWorktreesResult = CommandResult<CleanWorktreesResultData>;

/**
 * Create cleanup dependencies using real git operations
 */
function createCleanupDeps(repoRoot: string): CleanupDeps {
  return {
    removeWorktree: (wtPath: string, force: boolean) => {
      git.removeWorktree(wtPath, { force });
    },

    deleteLocalBranch: (branch: string): boolean => {
      try {
        execSync(`git branch -D "${branch}"`, {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return true;
      } catch {
        return false;
      }
    },

    deleteRemoteBranch: (branch: string): boolean => {
      try {
        execSync(`git push origin --delete "${branch}"`, {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return true;
      } catch {
        return false;
      }
    },

    pruneWorktrees: () => {
      git.pruneWorktrees();
    },
  };
}

/**
 * Clean up worktrees for merged or closed PRs
 *
 * @example
 * ```typescript
 * import { cleanWorktrees } from '@camaradesuk/git-worktree-tools/api';
 *
 * // Clean all merged/closed PRs
 * const result = await cleanWorktrees({ deleteRemote: true });
 *
 * // Clean a specific PR
 * const result = await cleanWorktrees({ prNumber: 42, force: true });
 *
 * // Dry run
 * const result = await cleanWorktrees({ dryRun: true });
 * ```
 */
export async function cleanWorktrees(
  options: CleanWorktreesOptions = {}
): Promise<CleanWorktreesResult> {
  const { prNumber = null, force = false, deleteRemote = false, dryRun = false, cwd } = options;

  try {
    // Verify prerequisites
    if (!github.isGhInstalled()) {
      return createErrorResult(
        'cleanpr',
        ErrorCode.GH_NOT_INSTALLED,
        'GitHub CLI (gh) is required for PR status checking'
      );
    }

    // Verify we're in a git repo
    const repoRoot = git.getRepoRoot(cwd);
    if (!repoRoot) {
      return createErrorResult('cleanpr', ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
    }

    // Load configuration
    const config = loadConfig(repoRoot);

    // Gather worktree info
    const gatherDeps = createDefaultDeps();
    const worktrees: CleanprWorktreeInfo[] = await gatherPrWorktreeInfo(
      repoRoot,
      config.worktreePattern,
      gatherDeps
    );

    // Build clean options
    const cleanOptions: CleanOptions = {
      force,
      deleteRemote,
      dryRun,
      all: prNumber === null,
      json: true,
      interactive: false, // API is never interactive
    };

    // Handle specific PR number
    if (prNumber !== null) {
      const target = findWorktreeByPrNumber(worktrees, prNumber);

      if (!target) {
        const pattern = config.worktreePattern
          .replace('{repo}', path.basename(repoRoot))
          .replace('{number}', String(prNumber));
        const expectedPath = path.join(path.dirname(repoRoot), pattern);

        return createErrorResult(
          'cleanpr',
          ErrorCode.PR_NOT_FOUND,
          `No worktree found for PR #${prNumber}`,
          {
            expectedPath,
          }
        );
      }

      if (dryRun) {
        const data: CleanprDryRunData = {
          wouldClean: [
            {
              prNumber: target.prNumber,
              branch: target.branch,
              path: target.path,
              prState: target.prState,
            },
          ],
          totalWouldClean: 1,
        };
        return createSuccessResult('cleanpr', data);
      }

      const deps = createCleanupDeps(repoRoot);
      const result = cleanWorktree(target, cleanOptions, deps);

      if (result.success) {
        // Infer branch deletion status based on options and whether worktree had a branch
        const hadBranch = target.branch !== null;
        const data: CleanprResultData = {
          cleaned: [
            {
              prNumber: target.prNumber,
              branch: target.branch,
              path: target.path,
              prState: target.prState,
              localBranchDeleted: hadBranch,
              remoteBranchDeleted: hadBranch && deleteRemote,
            },
          ],
          skipped: [],
          totalCleaned: 1,
          totalSkipped: 0,
        };
        return createSuccessResult('cleanpr', data);
      } else {
        return createErrorResult('cleanpr', ErrorCode.OPERATION_FAILED, result.message);
      }
    }

    // Clean all cleanable worktrees
    const cleanable = getCleanableWorktrees(worktrees);

    if (cleanable.length === 0) {
      const data: CleanprResultData = {
        cleaned: [],
        skipped: [],
        totalCleaned: 0,
        totalSkipped: 0,
      };
      return createSuccessResult('cleanpr', data);
    }

    if (dryRun) {
      const data: CleanprDryRunData = {
        wouldClean: cleanable.map((w) => ({
          prNumber: w.prNumber,
          branch: w.branch,
          path: w.path,
          prState: w.prState,
        })),
        totalWouldClean: cleanable.length,
      };
      return createSuccessResult('cleanpr', data);
    }

    const deps = createCleanupDeps(repoRoot);
    const results = cleanWorktreesBatch(cleanable, cleanOptions, deps);
    const summary = summarizeResults(results);

    const cleaned: CleanprResultData['cleaned'] = [];
    const skipped: CleanprResultData['skipped'] = [];

    for (let i = 0; i < cleanable.length; i++) {
      const wt = cleanable[i];
      const result = results[i];

      if (result.success) {
        const hadBranch = wt.branch !== null;
        cleaned.push({
          prNumber: wt.prNumber,
          branch: wt.branch,
          path: wt.path,
          prState: wt.prState,
          localBranchDeleted: hadBranch,
          remoteBranchDeleted: hadBranch && deleteRemote,
        });
      } else {
        skipped.push({
          prNumber: wt.prNumber,
          reason: result.message,
        });
      }
    }

    const data: CleanprResultData = {
      cleaned,
      skipped,
      totalCleaned: summary.cleaned,
      totalSkipped: summary.total - summary.cleaned,
    };

    return createSuccessResult('cleanpr', data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult('cleanpr', ErrorCode.UNKNOWN_ERROR, message);
  }
}
