/**
 * cleanpr worktree-info - gather worktree information with dependency injection
 */

import * as path from 'path';
import { execSync } from 'child_process';
import * as git from '../git.js';
import * as github from '../github.js';
import type { Worktree } from '../git.js';
import type { PrState, WorktreeInfo } from './types.js';

/**
 * Dependencies interface for testing
 */
export interface GatherDeps {
  listWorktrees: (cwd?: string) => Worktree[];
  hasUncommittedChanges: (worktreePath: string) => boolean;
  getPrState: (prNumber: number) => Promise<PrState>;
}

/**
 * Extract PR number from worktree path - pure function
 */
export function extractPrNumber(worktreePath: string, worktreePattern?: string): number | null {
  const name = path.basename(worktreePath);

  // Try pattern-based extraction if pattern provided
  if (worktreePattern?.includes('{number}')) {
    const regexStr = worktreePattern
      .replace('{repo}', '.*')
      .replace('{number}', '(\\d+)')
      .replace('.', '\\.');
    const match = name.match(new RegExp(regexStr));
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // Fallback: try common patterns
  const patterns = [/\.pr(\d+)$/, /\.pr-(\d+)$/, /-pr(\d+)$/, /_pr(\d+)$/];

  for (const p of patterns) {
    const match = name.match(p);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Gather worktree information for PR worktrees only
 * Uses dependency injection for testability
 */
export async function gatherPrWorktreeInfo(
  repoRoot: string,
  worktreePattern: string | undefined,
  deps: GatherDeps
): Promise<WorktreeInfo[]> {
  const worktrees = deps.listWorktrees(repoRoot);
  const result: WorktreeInfo[] = [];

  for (const wt of worktrees) {
    const prNumber = extractPrNumber(wt.path, worktreePattern);

    // Skip non-PR worktrees
    if (prNumber === null) {
      continue;
    }

    const prState = await deps.getPrState(prNumber);
    const hasChanges = deps.hasUncommittedChanges(wt.path);

    result.push({
      path: wt.path,
      branch: wt.branch,
      commit: wt.commit,
      prNumber,
      prState,
      hasChanges,
    });
  }

  // Sort by PR number
  result.sort((a, b) => a.prNumber - b.prNumber);

  return result;
}

/**
 * Create default dependencies using real implementations
 */
export function createDefaultDeps(): GatherDeps {
  return {
    listWorktrees: (cwd?: string) => git.listWorktrees(cwd),

    hasUncommittedChanges: (worktreePath: string): boolean => {
      try {
        const status = execSync('git status --porcelain', {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        return status.length > 0;
      } catch {
        return false;
      }
    },

    getPrState: async (prNumber: number): Promise<PrState> => {
      try {
        const pr = github.getPr(prNumber);
        if (!pr) {
          return 'UNKNOWN';
        }
        return pr.state;
      } catch {
        return 'UNKNOWN';
      }
    },
  };
}
