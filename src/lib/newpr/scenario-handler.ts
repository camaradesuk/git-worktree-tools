/**
 * newpr scenario handler - pure functions for scenario decision logic
 *
 * Separates the "what choices to present" logic from the interactive prompts.
 * CLI layer handles the actual prompting; this module provides the choices.
 */

import type { StateAction, ScenarioChoice } from './types.js';
import type { GitState, Scenario } from '../state-detection.js';

/**
 * Scenario context with message and available choices
 */
export interface ScenarioContext {
  message: string;
  subMessage?: string;
  choices: ScenarioChoice[];
}

/**
 * Create a StateAction with defaults
 */
function action(
  actionType: StateAction['action'],
  overrides: Partial<StateAction> = {}
): StateAction {
  return {
    action: actionType,
    branchFrom: 'origin_main',
    stashUnstaged: false,
    ...overrides,
  };
}

/**
 * Get scenario context with message and choices - pure function
 * Returns null for scenarios that need special handling (pr_worktree delegates)
 */
export function getScenarioContext(
  scenario: Scenario,
  state: GitState,
  _baseBranch: string
): ScenarioContext | null {
  switch (scenario) {
    case 'main_clean_same':
      return {
        message: 'No changes detected from main branch.',
        subMessage:
          "You are on 'main' with no local commits or uncommitted changes.\nA PR requires at least one commit difference from the base branch.",
        choices: [
          { label: 'Continue with empty initial commit', action: action('empty_commit') },
          { label: "Cancel - I'll make some changes first", action: null },
        ],
      };

    case 'main_staged_same':
      return {
        message: 'You have staged changes ready to commit.',
        choices: [
          {
            label: 'Commit staged changes to the new PR branch',
            action: action('commit_staged', { branchFrom: 'head' }),
          },
          {
            label: 'Leave changes here and continue with empty initial commit',
            action: action('empty_commit'),
          },
          { label: 'Cancel', action: null },
        ],
      };

    case 'main_unstaged_same':
      return {
        message: 'You have unstaged changes.',
        choices: [
          {
            label: 'Stage all and commit to the new PR branch',
            action: action('commit_all', { branchFrom: 'head' }),
          },
          {
            label: 'Leave changes here and continue with empty initial commit',
            action: action('empty_commit'),
          },
          { label: 'Stash changes (will restore after)', action: action('stash_and_empty') },
          { label: 'Cancel', action: null },
        ],
      };

    case 'main_both_same':
      return {
        message: 'You have both staged and unstaged changes.',
        choices: [
          {
            label: 'Commit staged to PR branch, move unstaged to new worktree',
            action: action('commit_staged', { stashUnstaged: true, branchFrom: 'head' }),
          },
          {
            label: 'Stage all and commit everything to the new PR branch',
            action: action('commit_all', { branchFrom: 'head' }),
          },
          {
            label: 'Leave all changes here and continue with empty initial commit',
            action: action('empty_commit'),
          },
          { label: 'Stash all changes (will restore after)', action: action('stash_and_empty') },
          { label: 'Cancel', action: null },
        ],
      };

    case 'main_clean_ahead':
      return {
        message: "You have local commits on 'main' not yet pushed.",
        subMessage: 'These commits will NOT be included in the new PR branch by default.',
        choices: [
          {
            label: 'Use these commits for the PR (create branch from HEAD)',
            action: action('use_commits', { branchFrom: 'head' }),
          },
          {
            label: 'Push commits to origin/main first, then create PR branch',
            action: action('push_then_branch'),
          },
          {
            label: 'Start fresh from origin/main (ignore local commits)',
            action: action('empty_commit'),
          },
          { label: 'Cancel', action: null },
        ],
      };

    case 'main_changes_ahead':
      return {
        message: 'You have local commits AND uncommitted changes.',
        choices: [
          {
            label: 'Include commits + commit uncommitted changes to PR branch',
            action: action('use_commits_and_commit_all', { branchFrom: 'head' }),
          },
          {
            label: 'Include commits only, stash uncommitted changes',
            action: action('use_commits_and_stash', { branchFrom: 'head' }),
          },
          {
            label: 'Start fresh from origin/main (ignore all local work)',
            action: action('empty_commit'),
          },
          { label: 'Cancel', action: null },
        ],
      };

    case 'branch_same_as_main': {
      const branch = state.currentBranch || 'unknown';
      return {
        message: `Branch '${branch}' is at the same commit as main.`,
        subMessage: 'No divergent commits detected. A PR requires at least one commit difference.',
        choices: [
          {
            label: 'Continue with empty initial commit (new branch from main)',
            action: action('empty_commit'),
          },
          { label: 'Cancel', action: null },
        ],
      };
    }

    case 'branch_ancestor': {
      const branch = state.currentBranch || 'unknown';
      return {
        message: `Branch '${branch}' appears to be already merged into main.`,
        subMessage: 'Creating a PR would result in no changes.',
        choices: [
          {
            label: 'Continue with empty initial commit (new branch from main)',
            action: action('empty_commit'),
          },
          { label: "Cancel - I'll check the branch status first", action: null },
        ],
      };
    }

    case 'branch_divergent': {
      const branch = state.currentBranch || 'unknown';
      return {
        message: `You are on branch '${branch}' with commits not in main.`,
        choices: [
          {
            label: `Create PR for THIS branch (${branch} → main)`,
            action: action('create_pr_for_branch', { branchFrom: 'head' }),
          },
          {
            label: "Create NEW branch from main (ignore current branch's commits)",
            action: action('empty_commit'),
          },
          { label: 'Cancel', action: null },
        ],
      };
    }

    case 'branch_with_changes': {
      const branch = state.currentBranch || 'unknown';
      const hasDivergent = state.localCommits.length > 0;

      if (hasDivergent) {
        return {
          message: `You are on branch '${branch}' with uncommitted changes.`,
          subMessage: 'Branch also has commits not in main.',
          choices: [
            {
              label: 'Create PR for THIS branch, commit changes first',
              action: action('pr_for_branch_commit_all', { branchFrom: 'head' }),
            },
            {
              label: 'Create PR for THIS branch, stash uncommitted changes',
              action: action('pr_for_branch_stash', { branchFrom: 'head' }),
            },
            {
              label: 'Create NEW branch from main (ignore current branch)',
              action: action('empty_commit'),
            },
            { label: 'Cancel', action: null },
          ],
        };
      } else {
        return {
          message: `You are on branch '${branch}' with uncommitted changes.`,
          choices: [
            {
              label: 'Stage all and commit to a new PR branch',
              action: action('commit_all', { branchFrom: 'head' }),
            },
            {
              label: 'Leave changes and continue with empty initial commit',
              action: action('empty_commit'),
            },
            { label: 'Stash changes (will restore after)', action: action('stash_and_empty') },
            { label: 'Cancel', action: null },
          ],
        };
      }
    }

    case 'detached_head':
      return {
        message: 'You are in detached HEAD state.',
        choices: [
          {
            label: 'Create branch from this commit',
            action: action('branch_from_detached', { branchFrom: 'head' }),
          },
          { label: 'Create branch from origin/main', action: action('empty_commit') },
          { label: 'Cancel', action: null },
        ],
      };

    case 'pr_worktree':
      // This scenario requires special handling - delegate back to CLI
      // The CLI should analyze actual state and call getScenarioContext again
      return null;

    default:
      // Default case for any unhandled scenarios
      return {
        message: 'Ready to create PR.',
        choices: [
          { label: 'Continue with empty initial commit', action: action('empty_commit') },
          { label: 'Cancel', action: null },
        ],
      };
  }
}

/**
 * Check if a scenario is the pr_worktree scenario that needs delegation
 */
export function isPrWorktreeScenario(scenario: Scenario): boolean {
  return scenario === 'pr_worktree';
}

/**
 * Check if an action is for creating PR for existing branch
 * These actions need special handling in the workflow
 */
export function isExistingBranchAction(action: StateAction): boolean {
  return (
    action.action === 'create_pr_for_branch' ||
    action.action === 'pr_for_branch_commit_all' ||
    action.action === 'pr_for_branch_stash'
  );
}

/**
 * Check if action should branch from HEAD instead of origin/main
 */
export function shouldBranchFromHead(action: StateAction): boolean {
  return action.branchFrom === 'head';
}

/**
 * Get the display message for a scenario warning level
 */
export type MessageLevel = 'info' | 'warning' | 'error';

export function getScenarioMessageLevel(scenario: Scenario): MessageLevel {
  switch (scenario) {
    case 'main_clean_same':
    case 'branch_same_as_main':
    case 'branch_ancestor':
    case 'detached_head':
    case 'pr_worktree':
      return 'warning';

    default:
      return 'info';
  }
}
