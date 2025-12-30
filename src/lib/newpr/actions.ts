/**
 * newpr actions - git operations with dependency injection
 *
 * Executes state actions based on scenario handler decisions.
 * Uses dependency injection for testability.
 */

import type { StateAction, ActionResult } from './types.js';

/**
 * Dependencies interface for action execution
 */
export interface ActionDeps {
  gitAdd: (path: string, cwd?: string) => void;
  gitStash: (options: { message?: string; keepIndex?: boolean }, cwd?: string) => string | null;
  gitPush: (
    options: { remote: string; branch: string; setUpstream?: boolean },
    cwd?: string
  ) => void;
  gitCommit: (options: { message: string; allowEmpty?: boolean }, cwd?: string) => void;
}

/**
 * Execute a state action and return result
 * Pure function with injected dependencies
 */
export function executeStateAction(
  action: StateAction,
  _description: string,
  branchName: string,
  deps: ActionDeps,
  cwd?: string
): ActionResult {
  let stashRef: string | null = null;

  try {
    switch (action.action) {
      case 'empty_commit':
        // No action needed before branch creation
        break;

      case 'commit_staged':
        // Will commit staged changes after creating branch
        break;

      case 'commit_all':
        deps.gitAdd('.', cwd);
        break;

      case 'stash_and_empty':
        stashRef = deps.gitStash(
          { message: `newpr: auto-stash before creating ${branchName}` },
          cwd
        );
        break;

      case 'use_commits':
      case 'branch_from_detached':
        // Branch from HEAD instead of origin/main - no pre-action needed
        break;

      case 'use_commits_and_commit_all':
        deps.gitAdd('.', cwd);
        break;

      case 'use_commits_and_stash':
        stashRef = deps.gitStash(
          { message: `newpr: auto-stash before creating ${branchName}` },
          cwd
        );
        break;

      case 'push_then_branch':
        deps.gitPush({ remote: 'origin', branch: 'main' }, cwd);
        break;

      case 'pr_for_branch_commit_all':
        deps.gitAdd('.', cwd);
        deps.gitCommit({ message: 'chore: work in progress\n\n🤖 Committed with newpr' }, cwd);
        break;

      case 'pr_for_branch_stash':
        stashRef = deps.gitStash({ message: 'newpr: auto-stash before creating PR' }, cwd);
        break;

      case 'create_pr_for_branch':
        // No pre-action needed - will delegate to existing branch mode
        break;
    }

    return {
      success: true,
      stashRef,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      stashRef,
      message,
    };
  }
}

/**
 * Get the git branch point for an action
 */
export function getBranchPoint(action: StateAction, baseBranch: string): string {
  return action.branchFrom === 'head' ? 'HEAD' : `origin/${baseBranch}`;
}

/**
 * Check if action requires staging all changes
 */
export function requiresStageAll(action: StateAction): boolean {
  return action.action === 'commit_all' || action.action === 'use_commits_and_commit_all';
}

/**
 * Check if action involves stashing
 */
export function involvesStashing(action: StateAction): boolean {
  return (
    action.action === 'stash_and_empty' ||
    action.action === 'use_commits_and_stash' ||
    action.action === 'pr_for_branch_stash'
  );
}

/**
 * Check if action needs to push to origin/main first
 */
export function needsPushToMain(action: StateAction): boolean {
  return action.action === 'push_then_branch';
}

/**
 * Check if action commits to current branch before PR
 */
export function commitsToCurrentBranch(action: StateAction): boolean {
  return action.action === 'pr_for_branch_commit_all';
}

/**
 * Get the action description for logging
 */
export function getActionDescription(action: StateAction): string {
  switch (action.action) {
    case 'empty_commit':
      return 'Creating empty initial commit';
    case 'commit_staged':
      return 'Committing staged changes';
    case 'commit_all':
      return 'Staging and committing all changes';
    case 'stash_and_empty':
      return 'Stashing changes and creating empty commit';
    case 'use_commits':
      return 'Using existing commits for PR';
    case 'push_then_branch':
      return 'Pushing to main before creating branch';
    case 'use_commits_and_commit_all':
      return 'Using commits and staging all changes';
    case 'use_commits_and_stash':
      return 'Using commits and stashing uncommitted changes';
    case 'create_pr_for_branch':
      return 'Creating PR for current branch';
    case 'pr_for_branch_commit_all':
      return 'Committing changes to current branch for PR';
    case 'pr_for_branch_stash':
      return 'Stashing changes before creating PR';
    case 'branch_from_detached':
      return 'Creating branch from detached HEAD';
    default:
      return 'Executing action';
  }
}
