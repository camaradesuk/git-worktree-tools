/**
 * wtstate types - CLI options and result types
 */

import type { Scenario } from '../state-detection.js';
import type { AvailableAction, StateActionKey } from '../json-output.js';

/**
 * CLI options for wtstate command
 */
export interface WtstateOptions {
  /** Output as JSON (always true for AI usage, but can be false for human-readable) */
  json: boolean;
  /** Base branch for comparison (default: main) */
  baseBranch: string;
  /** Show verbose output including file lists */
  verbose: boolean;
}

/**
 * Parse result - discriminated union for parseArgs
 */
export type ParseResult =
  | { kind: 'success'; options: WtstateOptions }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

/**
 * Worktree type classification
 */
export type WorktreeType = 'main_worktree' | 'pr_worktree' | 'other';

/**
 * Result of wtstate analysis
 */
export interface WtstateResult {
  /** The detected scenario key */
  scenario: Scenario;
  /** Human-readable description of the scenario */
  scenarioDescription: string;
  /** Current branch name (null if detached HEAD) */
  currentBranch: string | null;
  /** Base branch being compared against */
  baseBranch: string;
  /** Type of worktree */
  worktreeType: WorktreeType;
  /** Whether there are any uncommitted changes */
  hasChanges: boolean;
  /** Whether there are staged changes */
  hasStagedChanges: boolean;
  /** Whether there are unstaged changes */
  hasUnstagedChanges: boolean;
  /** List of local commits not in base branch */
  localCommits: string[];
  /** List of staged files */
  stagedFiles: string[];
  /** List of unstaged files */
  unstagedFiles: string[];
  /** Available actions for this scenario */
  availableActions: AvailableAction[];
  /** Recommended action for AI agents (null if no recommendation) */
  recommendedAction: StateActionKey | null;
}
