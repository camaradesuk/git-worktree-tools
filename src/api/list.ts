/**
 * List worktrees API - List git worktrees with PR status
 *
 * Wraps the lswt module to provide a clean programmatic interface.
 */

import {
  gatherWorktreeInfo,
  createDefaultDeps,
  type WorktreeDisplay,
  type ListOptions,
} from '../lib/lswt/index.js';
import {
  type CommandResult,
  createSuccessResult,
  createErrorResult,
  ErrorCode,
} from '../lib/json-output.js';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';

/**
 * Information about a single worktree
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree */
  path: string;
  /** Display name for the worktree */
  name: string;
  /** Current branch (null if detached HEAD) */
  branch: string | null;
  /** Short commit hash */
  commit: string;
  /** Type of worktree: 'main', 'pr', 'branch', 'detached', or 'remote_pr' */
  type: 'main' | 'pr' | 'branch' | 'detached' | 'remote_pr';
  /** PR number if this is a PR worktree */
  prNumber: number | null;
  /** PR state: 'OPEN', 'MERGED', 'CLOSED', or null if not a PR */
  prState: 'OPEN' | 'MERGED' | 'CLOSED' | null;
  /** Whether the PR is a draft (null for non-PR worktrees) */
  isDraft: boolean | null;
  /** Whether the worktree has uncommitted changes */
  hasChanges: boolean;
  /** PR title (for remote PRs that have no local worktree) */
  prTitle?: string;
  /** PR URL (for remote PRs) */
  prUrl?: string;
}

/**
 * Options for listing worktrees
 */
export interface ListWorktreesOptions {
  /** Include PR status from GitHub (requires gh CLI) */
  showStatus?: boolean;
  /** Working directory (defaults to current directory) */
  cwd?: string;
}

/**
 * Result data for listWorktrees
 */
export interface ListWorktreesResultData {
  /** List of worktrees */
  worktrees: WorktreeInfo[];
  /** Total number of worktrees */
  total: number;
  /** Number of local PR worktrees */
  prCount: number;
  /** Number of remote PRs without local worktrees */
  remotePrCount: number;
  /** Number of open PRs (local and remote) */
  openCount: number;
  /** Number of worktrees with uncommitted changes */
  changesCount: number;
}

/**
 * Result type for listWorktrees
 */
export type ListWorktreesResult = CommandResult<ListWorktreesResultData>;

/**
 * List all git worktrees with optional PR status
 *
 * @example
 * ```typescript
 * import { listWorktrees } from '@camaradesuk/git-worktree-tools/api';
 *
 * const result = await listWorktrees({ showStatus: true });
 * if (result.success) {
 *   for (const wt of result.data.worktrees) {
 *     console.log(`${wt.path}: ${wt.branch} (${wt.type})`);
 *   }
 * }
 * ```
 */
export async function listWorktrees(
  options: ListWorktreesOptions = {}
): Promise<ListWorktreesResult> {
  const { showStatus = false, cwd } = options;
  const warnings: string[] = [];

  try {
    // Verify we're in a git repo
    const repoRoot = git.getRepoRoot(cwd);
    if (!repoRoot) {
      return createErrorResult('lswt', ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
    }

    // Check if gh is available when status is requested
    let effectiveShowStatus = showStatus;
    if (showStatus && !github.isGhInstalled()) {
      warnings.push('GitHub CLI (gh) not installed. PR status will not be shown.');
      effectiveShowStatus = false;
    }

    // Build options for the lib function
    const listOptions: ListOptions = {
      json: true, // We always want structured output
      verbose: true, // Include all info
      showStatus: effectiveShowStatus,
      interactive: false, // Never interactive for API
    };

    // Gather worktree info
    const deps = createDefaultDeps();
    const worktreeDisplays: WorktreeDisplay[] = await gatherWorktreeInfo(
      repoRoot,
      listOptions,
      deps
    );

    // Map to our API type (include prTitle and prUrl for remote PRs)
    const worktrees: WorktreeInfo[] = worktreeDisplays.map((wt) => ({
      path: wt.path,
      name: wt.name,
      branch: wt.branch,
      commit: wt.commit,
      type: wt.type,
      prNumber: wt.prNumber,
      prState: wt.prState,
      isDraft: wt.isDraft,
      hasChanges: wt.hasChanges,
      ...(wt.prTitle && { prTitle: wt.prTitle }),
      ...(wt.prUrl && { prUrl: wt.prUrl }),
    }));

    // Calculate summary stats
    const prCount = worktrees.filter((w) => w.type === 'pr').length;
    const remotePrCount = worktrees.filter((w) => w.type === 'remote_pr').length;
    const openCount = worktrees.filter((w) => w.prState === 'OPEN').length;
    const changesCount = worktrees.filter((w) => w.hasChanges).length;

    const data: ListWorktreesResultData = {
      worktrees,
      total: worktrees.length,
      prCount,
      remotePrCount,
      openCount,
      changesCount,
    };

    return createSuccessResult('lswt', data, warnings.length > 0 ? warnings : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult('lswt', ErrorCode.UNKNOWN_ERROR, message);
  }
}
