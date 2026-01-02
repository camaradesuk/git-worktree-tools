/**
 * wtstate analyze - core analysis logic
 */

import type { WtstateResult, WorktreeType, WtstateOptions } from './types.js';
import type { GitState, Scenario } from '../state-detection.js';
import type { AvailableAction, StateActionKey } from '../json-output.js';
import { analyzeGitState, detectScenario } from '../state-detection.js';
import { getScenarioContext } from '../newpr/scenario-handler.js';

/**
 * Scenario descriptions for human-readable output
 */
const SCENARIO_DESCRIPTIONS: Record<Scenario, string> = {
  main_clean_same: 'On main branch, same as origin/main, no changes',
  main_staged_same: 'On main branch, same as origin/main, staged changes only',
  main_unstaged_same: 'On main branch, same as origin/main, unstaged changes only',
  main_both_same: 'On main branch, same as origin/main, both staged and unstaged changes',
  main_clean_ahead: 'On main branch, ahead of origin/main, no uncommitted changes',
  main_changes_ahead: 'On main branch, ahead of origin/main, with uncommitted changes',
  branch_same_as_main: 'On feature branch at same commit as main (no divergent commits)',
  branch_ancestor: 'On feature branch that is an ancestor of main (already merged)',
  branch_divergent: 'On feature branch with commits not in main',
  branch_with_changes: 'On feature branch with uncommitted changes',
  detached_head: 'In detached HEAD state',
  pr_worktree: 'In a PR worktree (not the main worktree)',
};

/**
 * Get the recommended action for a scenario
 */
function getRecommendedAction(scenario: Scenario): StateActionKey | null {
  switch (scenario) {
    case 'main_clean_same':
      return 'empty_commit';
    case 'main_staged_same':
      return 'commit_staged';
    case 'main_unstaged_same':
      return 'commit_all';
    case 'main_both_same':
      return 'commit_staged'; // Commit staged, unstaged go to worktree
    case 'main_clean_ahead':
      return 'use_commits';
    case 'main_changes_ahead':
      return 'use_commits_and_commit_all';
    case 'branch_divergent':
      return 'create_pr_for_branch';
    case 'branch_with_changes':
      return 'pr_for_branch_commit_all';
    case 'detached_head':
      return 'branch_from_detached';
    case 'branch_same_as_main':
    case 'branch_ancestor':
      return 'empty_commit';
    case 'pr_worktree':
      return null; // Special case - needs re-analysis
    default:
      return null;
  }
}

/**
 * Convert scenario choices to available actions
 */
function getAvailableActions(scenario: Scenario, state: GitState, baseBranch: string): AvailableAction[] {
  const context = getScenarioContext(scenario, state, baseBranch);
  if (!context) {
    return [];
  }

  return context.choices
    .filter((choice) => choice.action !== null)
    .map((choice) => ({
      key: choice.action!.action,
      label: choice.label,
      description: undefined,
    }));
}

/**
 * Detect worktree type
 */
function detectWorktreeType(state: GitState): WorktreeType {
  if (state.worktreeType === 'main_worktree') {
    return 'main_worktree';
  } else if (state.worktreeType === 'pr_worktree') {
    return 'pr_worktree';
  }
  return 'other';
}

/**
 * Analyze current git state and return structured result
 */
export function analyzeState(options: WtstateOptions): WtstateResult {
  const state = analyzeGitState(options.baseBranch);
  const scenario = detectScenario(state);

  const worktreeType = detectWorktreeType(state);
  const hasChanges = state.stagedFiles.length > 0 || state.unstagedFiles.length > 0;
  const hasStagedChanges = state.stagedFiles.length > 0;
  const hasUnstagedChanges = state.unstagedFiles.length > 0;

  const availableActions = getAvailableActions(scenario, state, options.baseBranch);
  const recommendedAction = getRecommendedAction(scenario);

  return {
    scenario,
    scenarioDescription: SCENARIO_DESCRIPTIONS[scenario] || 'Unknown scenario',
    currentBranch: state.currentBranch,
    baseBranch: options.baseBranch,
    worktreeType,
    hasChanges,
    hasStagedChanges,
    hasUnstagedChanges,
    localCommits: state.localCommits,
    stagedFiles: options.verbose ? state.stagedFiles : [],
    unstagedFiles: options.verbose ? state.unstagedFiles : [],
    availableActions,
    recommendedAction,
  };
}

/**
 * Format result as human-readable text
 */
export function formatText(result: WtstateResult, verbose: boolean): string {
  const lines: string[] = [];

  lines.push(`Scenario: ${result.scenario}`);
  lines.push(`  ${result.scenarioDescription}`);
  lines.push('');
  lines.push(`Branch: ${result.currentBranch || '(detached HEAD)'}`);
  lines.push(`Base: ${result.baseBranch}`);
  lines.push(`Worktree type: ${result.worktreeType}`);
  lines.push('');
  lines.push(`Changes:`);
  lines.push(`  Staged: ${result.hasStagedChanges ? 'yes' : 'no'}`);
  lines.push(`  Unstaged: ${result.hasUnstagedChanges ? 'yes' : 'no'}`);
  lines.push(`  Local commits: ${result.localCommits.length}`);

  if (verbose && result.stagedFiles.length > 0) {
    lines.push('');
    lines.push('Staged files:');
    for (const file of result.stagedFiles) {
      lines.push(`  ${file}`);
    }
  }

  if (verbose && result.unstagedFiles.length > 0) {
    lines.push('');
    lines.push('Unstaged files:');
    for (const file of result.unstagedFiles) {
      lines.push(`  ${file}`);
    }
  }

  if (verbose && result.localCommits.length > 0) {
    lines.push('');
    lines.push('Local commits:');
    for (const commit of result.localCommits.slice(0, 10)) {
      lines.push(`  ${commit}`);
    }
    if (result.localCommits.length > 10) {
      lines.push(`  ... and ${result.localCommits.length - 10} more`);
    }
  }

  if (result.availableActions.length > 0) {
    lines.push('');
    lines.push('Available actions:');
    for (const action of result.availableActions) {
      const recommended = action.key === result.recommendedAction ? ' (recommended)' : '';
      lines.push(`  ${action.key}: ${action.label}${recommended}`);
    }
  }

  if (result.recommendedAction) {
    lines.push('');
    lines.push(`Recommended: ${result.recommendedAction}`);
  }

  return lines.join('\n');
}
