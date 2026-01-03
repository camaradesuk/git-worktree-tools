/**
 * newpr types - CLI options and result types
 */

import type { StateActionKey } from '../json-output.js';

/**
 * CLI operation mode
 */
export type Mode = 'new' | 'pr' | 'branch';

/**
 * CLI options
 */
export interface Options {
  mode: Mode;
  description?: string;
  prNumber?: number;
  branchName?: string;
  baseBranch: string;
  draft: boolean;
  installDeps: boolean;
  openEditor: boolean;
  runWtlink: boolean;

  // AI-friendly options (Phase 1)
  /** Output result as JSON for programmatic parsing */
  json: boolean;
  /** Skip all interactive prompts, use defaults/specified action */
  nonInteractive: boolean;
  /** Pre-specify action for scenario (use with --non-interactive) */
  action?: StateActionKey;
  /** Disable lifecycle hooks (for security-conscious environments) */
  noHooks: boolean;
}

/**
 * Branch source for creating new branches
 */
export type BranchFrom = 'origin_main' | 'head';

/**
 * Action type from scenario handling
 */
export type ActionType =
  | 'empty_commit'
  | 'commit_staged'
  | 'commit_all'
  | 'stash_and_empty'
  | 'use_commits'
  | 'push_then_branch'
  | 'use_commits_and_commit_all'
  | 'use_commits_and_stash'
  | 'create_pr_for_branch'
  | 'pr_for_branch_commit_all'
  | 'pr_for_branch_stash'
  | 'branch_from_detached';

/**
 * State action result from scenario handling
 */
export interface StateAction {
  action: ActionType;
  branchFrom: BranchFrom;
  stashUnstaged: boolean;
}

/**
 * Parse result - discriminated union for parseArgs
 */
export type ParseResult =
  | { kind: 'success'; options: Options }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

/**
 * Action execution result
 */
export interface ActionResult {
  success: boolean;
  stashRef: string | null;
  message?: string;
}

/**
 * Scenario prompt choice - data structure for prompt options
 */
export interface ScenarioChoice {
  label: string;
  action: StateAction | null;
}

/**
 * Scenario handler result - either choices to prompt or cancelled
 */
export type ScenarioResult =
  | { kind: 'choices'; message: string; choices: ScenarioChoice[] }
  | { kind: 'delegate'; scenario: string };
