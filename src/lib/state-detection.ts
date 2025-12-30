import * as git from './git.js';
import type { CommitRelationship, WorkingTreeStatus } from './git.js';
import { DEFAULT_BASE_BRANCH } from './constants.js';

/**
 * Worktree type based on directory naming pattern
 */
export type WorktreeType = 'main_worktree' | 'pr_worktree' | 'other';

/**
 * Branch type classification
 */
export type BranchType = 'main' | 'other' | 'detached';

/**
 * Complete git state analysis
 */
export interface GitState {
  worktreeType: WorktreeType;
  branchType: BranchType;
  currentBranch: string | null;
  commitRelationship: CommitRelationship;
  workingTreeStatus: WorkingTreeStatus;
  localCommits: string[];
  stagedFiles: string[];
  unstagedFiles: string[];
  repoRoot: string;
  repoName: string;
}

/**
 * Scenario identifiers for state handling
 */
export type Scenario =
  | 'main_clean_same' // Scenario 1: On main, same as origin/main, clean
  | 'main_staged_same' // Scenario 2a: On main, same as origin/main, staged only
  | 'main_unstaged_same' // Scenario 2b: On main, same as origin/main, unstaged only
  | 'main_both_same' // Scenario 2c: On main, same as origin/main, both
  | 'main_clean_ahead' // Scenario 3: On main, ahead of origin/main, clean
  | 'main_changes_ahead' // Scenario 4: On main, ahead of origin/main, has changes
  | 'branch_same_as_main' // Scenario 5: On branch, same commit as main, clean
  | 'branch_ancestor' // Scenario 6: On branch, already merged (ancestor)
  | 'branch_divergent' // Scenario 7: On branch, divergent commits, clean
  | 'branch_with_changes' // Scenario 8: On branch, with uncommitted changes
  | 'detached_head' // Scenario 9: Detached HEAD state
  | 'pr_worktree'; // Scenario 10: Running from PR worktree

/**
 * Detect worktree type based on directory path pattern
 */
export function detectWorktreeType(repoRoot: string): WorktreeType {
  // Check if path matches PR worktree pattern: *.pr[0-9]+
  if (/\.pr\d+/.test(repoRoot)) {
    return 'pr_worktree';
  }

  // Check if this is the main worktree using git
  const worktrees = git.listWorktrees(repoRoot);
  const current = worktrees.find((w) => w.path === repoRoot);

  if (current?.isMain) {
    return 'main_worktree';
  }

  // If we're in a worktree but not main, it's a PR or other worktree
  if (git.isWorktree(repoRoot)) {
    return 'pr_worktree';
  }

  return 'main_worktree';
}

/**
 * Detect branch type
 */
export function detectBranchType(baseBranch: string, cwd?: string): BranchType {
  if (git.isDetachedHead(cwd)) {
    return 'detached';
  }

  const currentBranch = git.getCurrentBranch(cwd);
  if (currentBranch === baseBranch) {
    return 'main';
  }

  return 'other';
}

/**
 * Analyze complete git state
 */
export function analyzeGitState(baseBranch: string = DEFAULT_BASE_BRANCH, cwd?: string): GitState {
  const repoRoot = git.getRepoRoot(cwd);
  const repoName = git.getRepoName(repoRoot);

  const worktreeType = detectWorktreeType(repoRoot);
  const branchType = detectBranchType(baseBranch, cwd);
  const currentBranch = git.getCurrentBranch(cwd);
  const commitRelationship = git.getCommitRelationship(baseBranch, cwd);
  const workingTreeStatus = git.getWorkingTreeStatus(cwd);
  const localCommits = git.getCommitsAhead(baseBranch, cwd);
  const stagedFiles = git.getStagedFiles(cwd);
  const unstagedFiles = git.getUnstagedFiles(cwd);

  return {
    worktreeType,
    branchType,
    currentBranch,
    commitRelationship,
    workingTreeStatus,
    localCommits,
    stagedFiles,
    unstagedFiles,
    repoRoot,
    repoName,
  };
}

/**
 * Detect scenario from git state
 */
export function detectScenario(state: GitState): Scenario {
  const { worktreeType, branchType, commitRelationship, workingTreeStatus } = state;

  // Scenario 10: PR worktree
  if (worktreeType === 'pr_worktree') {
    return 'pr_worktree';
  }

  // Scenario 9: Detached HEAD
  if (branchType === 'detached') {
    return 'detached_head';
  }

  // On main branch scenarios (1-4)
  if (branchType === 'main') {
    if (commitRelationship === 'same' || commitRelationship === 'behind') {
      // Same as origin/main, or behind origin/main (both can branch from origin/main)
      switch (workingTreeStatus) {
        case 'clean':
          return 'main_clean_same'; // Scenario 1
        case 'staged_only':
          return 'main_staged_same'; // Scenario 2a
        case 'unstaged_only':
          return 'main_unstaged_same'; // Scenario 2b
        case 'both':
          return 'main_both_same'; // Scenario 2c
      }
    } else if (commitRelationship === 'ahead') {
      // Ahead of origin/main
      if (workingTreeStatus === 'clean') {
        return 'main_clean_ahead'; // Scenario 3
      } else {
        return 'main_changes_ahead'; // Scenario 4
      }
    } else if (commitRelationship === 'divergent') {
      // Divergent from origin/main - has both ahead and behind commits
      if (workingTreeStatus === 'clean') {
        return 'main_clean_ahead'; // Treat like ahead for user options
      } else {
        return 'main_changes_ahead'; // Scenario 4
      }
    }
    // Fallback (shouldn't reach here)
    return 'main_clean_same';
  }

  // On different branch scenarios (5-8)
  if (branchType === 'other') {
    // Has uncommitted changes
    if (workingTreeStatus !== 'clean') {
      return 'branch_with_changes'; // Scenario 8
    }

    // Clean working tree
    switch (commitRelationship) {
      case 'same':
        return 'branch_same_as_main'; // Scenario 5
      case 'ancestor':
        return 'branch_ancestor'; // Scenario 6
      case 'ahead':
      case 'divergent':
        return 'branch_divergent'; // Scenario 7
      case 'behind':
        return 'branch_same_as_main'; // Treat behind like same
    }
  }

  // Default fallback
  return 'main_clean_same';
}

/**
 * Get human-readable description of scenario
 */
export function getScenarioDescription(scenario: Scenario): string {
  switch (scenario) {
    case 'main_clean_same':
      return 'On main branch, same as origin/main, no uncommitted changes';
    case 'main_staged_same':
      return 'On main branch, same as origin/main, staged changes only';
    case 'main_unstaged_same':
      return 'On main branch, same as origin/main, unstaged changes only';
    case 'main_both_same':
      return 'On main branch, same as origin/main, both staged and unstaged changes';
    case 'main_clean_ahead':
      return 'On main branch, ahead of origin/main, no uncommitted changes';
    case 'main_changes_ahead':
      return 'On main branch, ahead of origin/main, with uncommitted changes';
    case 'branch_same_as_main':
      return 'On feature branch at same commit as main';
    case 'branch_ancestor':
      return 'On feature branch that is already merged into main';
    case 'branch_divergent':
      return 'On feature branch with commits not in main';
    case 'branch_with_changes':
      return 'On feature branch with uncommitted changes';
    case 'detached_head':
      return 'In detached HEAD state';
    case 'pr_worktree':
      return 'Running from a PR worktree';
  }
}

/**
 * Check if state has any uncommitted changes
 */
export function hasChanges(state: GitState): boolean {
  return state.workingTreeStatus !== 'clean';
}

/**
 * Check if state has local commits not pushed
 */
export function hasLocalCommits(state: GitState): boolean {
  return state.localCommits.length > 0;
}

/**
 * Format file list for display
 */
export function formatFileList(files: string[], prefix: string = ''): string {
  if (files.length === 0) {
    return '';
  }

  return files.map((f) => `${prefix}${f}`).join('\n');
}

/**
 * Format commit list for display
 */
export function formatCommitList(commits: string[]): string {
  if (commits.length === 0) {
    return '';
  }

  return commits.map((c) => `  ${c}`).join('\n');
}
