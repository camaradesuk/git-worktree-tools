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
 * Remote PR info for PRs without local worktrees
 */
export interface RemotePrInfo {
  number: number;
  title: string;
  headBranch: string;
  url: string;
  isDraft: boolean;
}

/**
 * Dependencies interface for testing
 */
export interface GatherDeps {
  listWorktrees: (cwd?: string) => Worktree[];
  hasUncommittedChanges: (worktreePath: string) => boolean;
  getPrInfo: (prNumber: number) => Promise<PrInfoResult>;
  listOpenPrs: () => Promise<RemotePrInfo[]>;
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

  // Gather remote PRs when status checking is enabled
  if (options.showStatus) {
    const localPrNumbers = new Set(
      result.filter((w) => w.type === 'pr' && w.prNumber !== null).map((w) => w.prNumber!)
    );

    const remotePrs = await gatherRemotePrs(localPrNumbers, deps);
    result.push(...remotePrs);
  }

  return sortWorktrees(result);
}

/**
 * Gather remote PRs that don't have local worktrees
 */
async function gatherRemotePrs(
  localPrNumbers: Set<number>,
  deps: GatherDeps
): Promise<WorktreeDisplay[]> {
  try {
    const openPrs = await deps.listOpenPrs();

    return openPrs
      .filter((pr) => !localPrNumbers.has(pr.number))
      .map((pr) => ({
        path: '',
        name: `PR #${pr.number}`,
        branch: pr.headBranch,
        commit: '',
        type: 'remote_pr' as const,
        prNumber: pr.number,
        prState: 'OPEN' as const,
        isDraft: pr.isDraft,
        hasChanges: false,
        prTitle: pr.title,
        prUrl: pr.url,
      }));
  } catch {
    // Gracefully return empty array if fetching fails
    return [];
  }
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

    listOpenPrs: async (): Promise<RemotePrInfo[]> => {
      try {
        const prs = github.listPrs({ state: 'open' });
        return prs.map((pr) => ({
          number: pr.number,
          title: pr.title,
          headBranch: pr.headBranch,
          url: pr.url,
          isDraft: pr.isDraft,
        }));
      } catch {
        return [];
      }
    },
  };
}
