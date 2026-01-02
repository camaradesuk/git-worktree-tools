/**
 * lswt worktree-info - gather worktree information with dependency injection
 */

import * as path from 'path';
import { execSync } from 'child_process';
import * as git from '../git.js';
import * as github from '../github.js';
import type { Worktree } from '../git.js';
import type { ListOptions, WorktreeDisplay } from './types.js';
import { extractPrNumber, isMainWorktree, sortWorktrees } from './formatters.js';

/**
 * PR info returned by dependency
 */
export interface PrInfoResult {
  state: 'OPEN' | 'CLOSED' | 'MERGED' | null;
  isDraft: boolean | null;
}

/**
 * Dependencies interface for testing
 */
export interface GatherDeps {
  listWorktrees: (cwd?: string) => Worktree[];
  hasUncommittedChanges: (worktreePath: string) => boolean;
  getPrInfo: (prNumber: number) => Promise<PrInfoResult>;
}

/**
 * Gather worktree information - core business logic
 * Uses dependency injection for testability
 */
export async function gatherWorktreeInfo(
  repoRoot: string,
  options: ListOptions,
  deps: GatherDeps
): Promise<WorktreeDisplay[]> {
  const worktrees = deps.listWorktrees(repoRoot);
  const result: WorktreeDisplay[] = [];

  for (const wt of worktrees) {
    const name = path.basename(wt.path);
    const prNumber = extractPrNumber(wt.path);
    const isMain = isMainWorktree(wt.path, repoRoot);
    const hasChanges = deps.hasUncommittedChanges(wt.path);

    let type: WorktreeDisplay['type'];
    let prState: WorktreeDisplay['prState'] = null;
    let isDraft: boolean | null = null;

    if (isMain) {
      type = 'main';
    } else if (prNumber !== null) {
      type = 'pr';
      if (options.showStatus) {
        const prInfo = await deps.getPrInfo(prNumber);
        prState = prInfo.state;
        isDraft = prInfo.isDraft;
      }
    } else if (wt.branch) {
      type = 'branch';
    } else {
      type = 'detached';
    }

    result.push({
      path: wt.path,
      name,
      branch: wt.branch,
      commit: wt.commit,
      type,
      prNumber,
      prState,
      isDraft,
      hasChanges,
    });
  }

  return sortWorktrees(result);
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

    getPrInfo: async (prNumber: number): Promise<PrInfoResult> => {
      try {
        const pr = github.getPr(prNumber);
        if (pr) {
          return {
            state: pr.state,
            isDraft: pr.isDraft,
          };
        }
        return { state: null, isDraft: null };
      } catch {
        return { state: null, isDraft: null };
      }
    },
  };
}
