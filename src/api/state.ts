/**
 * State query API - Query git state for programmatic use
 *
 * Wraps the wtstate module to provide a clean programmatic interface.
 */

import { analyzeState, type WtstateResult } from '../lib/wtstate/index.js';
import {
  type CommandResult,
  type WtstateResultData,
  createSuccessResult,
  createErrorResult,
  ErrorCode,
} from '../lib/json-output.js';
import * as git from '../lib/git.js';

/**
 * Options for querying git state
 */
export interface QueryStateOptions {
  /** Base branch to compare against (default: 'main') */
  baseBranch?: string;
  /** Include detailed file lists and commit info */
  verbose?: boolean;
  /** Working directory (defaults to current directory) */
  cwd?: string;
}

/**
 * Result type for queryState
 */
export type QueryStateResult = CommandResult<WtstateResultData>;

/**
 * Query the current git state
 *
 * Returns structured information about the repository state including:
 * - Current scenario (e.g., 'main_clean_same', 'branch_with_changes')
 * - Branch information
 * - Uncommitted changes
 * - Available actions and recommended action
 *
 * @example
 * ```typescript
 * import { queryState } from '@camaradesuk/git-worktree-tools/api';
 *
 * const result = await queryState({ baseBranch: 'main' });
 * if (result.success) {
 *   console.log(`Scenario: ${result.data.scenario}`);
 *   console.log(`Recommended: ${result.data.recommendedAction}`);
 * }
 * ```
 */
export function queryState(options: QueryStateOptions = {}): QueryStateResult {
  const { baseBranch = 'main', verbose = false, cwd } = options;

  try {
    // Verify we're in a git repo
    const repoRoot = git.getRepoRoot(cwd);
    if (!repoRoot) {
      return createErrorResult('wtstate', ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
    }

    // Use the wtstate analyze function
    const result: WtstateResult = analyzeState({
      baseBranch,
      verbose,
      json: true, // We always want structured output
    });

    // Map to WtstateResultData
    const data: WtstateResultData = {
      scenario: result.scenario,
      scenarioDescription: result.scenarioDescription,
      currentBranch: result.currentBranch,
      baseBranch: result.baseBranch,
      worktreeType: result.worktreeType,
      hasChanges: result.hasChanges,
      hasStagedChanges: result.hasStagedChanges,
      hasUnstagedChanges: result.hasUnstagedChanges,
      localCommits: result.localCommits,
      stagedFiles: verbose ? result.stagedFiles : [],
      unstagedFiles: verbose ? result.unstagedFiles : [],
      availableActions: result.availableActions.map((a) => ({
        key: a.key,
        label: a.label,
        description: a.description,
      })),
      recommendedAction: result.recommendedAction,
    };

    return createSuccessResult('wtstate', data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult('wtstate', ErrorCode.UNKNOWN_ERROR, message);
  }
}
