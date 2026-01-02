/**
 * Create PR API - Create PRs with worktrees
 *
 * Wraps the newpr module to provide a clean programmatic interface.
 */

import * as fs from 'fs';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import { loadConfig, generateBranchName, generateWorktreePath } from '../lib/config.js';
import { analyzeGitState, detectScenario, type Scenario } from '../lib/state-detection.js';
import {
  getScenarioContext,
  isExistingBranchAction,
  executeStateAction,
  getBranchPoint,
  type StateAction,
  type ActionDeps,
} from '../lib/newpr/index.js';
import {
  type CommandResult,
  type NewprResultData,
  type StateActionKey,
  isValidStateActionKey,
  createSuccessResult,
  createErrorResult,
  ErrorCode,
} from '../lib/json-output.js';

/**
 * Options for creating a new PR
 */
export interface CreatePrOptions {
  /** Description/title for the PR */
  description: string;
  /** Action to take for the current state (from wtstate query) */
  action?: StateActionKey;
  /** Create as draft PR */
  draft?: boolean;
  /** Base branch for PR (default: 'main') */
  baseBranch?: string;
  /** Custom branch name (auto-generated if not provided) */
  branchName?: string;
  /** Working directory (defaults to current directory) */
  cwd?: string;
}

/**
 * Options for setting up a worktree for an existing PR
 */
export interface SetupPrWorktreeOptions {
  /** PR number to set up worktree for */
  prNumber: number;
  /** Working directory (defaults to current directory) */
  cwd?: string;
}

/**
 * Result data for createPr
 */
export interface CreatePrResultData extends NewprResultData {
  /** Whether the PR was newly created or already existed */
  created: boolean;
}

/**
 * Result type for createPr
 */
export type CreatePrResult = CommandResult<CreatePrResultData>;

/**
 * Create action dependencies using real git operations
 */
function createActionDeps(cwd?: string): ActionDeps {
  return {
    gitAdd: (addPath: string, cwdPath?: string) => git.add(addPath, cwdPath ?? cwd),
    gitStash: (options, cwdPath?) =>
      git.stash({ message: options.message, keepIndex: options.keepIndex }, cwdPath ?? cwd),
    gitPush: (options, cwdPath?) =>
      git.push(
        { remote: options.remote, branch: options.branch, setUpstream: options.setUpstream },
        cwdPath ?? cwd
      ),
    gitCommit: (options, cwdPath?) =>
      git.commit({ message: options.message, allowEmpty: options.allowEmpty }, cwdPath ?? cwd),
  };
}

/**
 * Find action from available actions by key
 */
function findActionByKey(
  scenario: Scenario,
  baseBranch: string,
  actionKey: StateActionKey
): StateAction | null {
  const state = analyzeGitState(baseBranch);
  const context = getScenarioContext(scenario, state, baseBranch);

  if (!context) {
    return null;
  }

  for (const choice of context.choices) {
    if (choice.action && choice.action.action === actionKey) {
      return choice.action;
    }
  }

  return null;
}

/**
 * Setup worktree for existing PR
 *
 * @example
 * ```typescript
 * import { setupPrWorktree } from '@camaradesuk/git-worktree-tools/api';
 *
 * const result = await setupPrWorktree({ prNumber: 42 });
 * if (result.success) {
 *   console.log(`Worktree at: ${result.data.worktreePath}`);
 * }
 * ```
 */
export async function setupPrWorktree(
  options: SetupPrWorktreeOptions
): Promise<CreatePrResult> {
  const { prNumber, cwd } = options;
  const warnings: string[] = [];

  try {
    // Verify prerequisites
    if (!github.isGhInstalled()) {
      return createErrorResult(
        'newpr',
        ErrorCode.GH_NOT_INSTALLED,
        'GitHub CLI (gh) is required'
      );
    }

    if (!github.isAuthenticated()) {
      return createErrorResult(
        'newpr',
        ErrorCode.GH_NOT_AUTHENTICATED,
        'GitHub CLI not authenticated. Run: gh auth login'
      );
    }

    // Verify we're in a git repo
    const repoRoot = git.getRepoRoot(cwd);
    if (!repoRoot) {
      return createErrorResult('newpr', ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
    }

    const repoName = git.getRepoName(repoRoot);
    const config = loadConfig(repoRoot);

    // Get PR info
    const pr = github.getPr(prNumber);
    if (!pr) {
      return createErrorResult('newpr', ErrorCode.PR_NOT_FOUND, `Could not find PR #${prNumber}`);
    }

    if (pr.state !== 'OPEN') {
      warnings.push(`PR #${prNumber} is ${pr.state}`);
    }

    // Generate worktree path
    const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber);

    if (fs.existsSync(worktreePath)) {
      return createErrorResult(
        'newpr',
        ErrorCode.WORKTREE_EXISTS,
        `Worktree already exists: ${worktreePath}`
      );
    }

    // Fetch and create worktree
    git.fetch('origin');

    try {
      git.addWorktree(worktreePath, pr.headBranch, {
        createBranch: true,
        startPoint: `origin/${pr.headBranch}`,
      });
    } catch {
      git.addWorktree(worktreePath, pr.headBranch);
    }

    const data: CreatePrResultData = {
      prNumber,
      prUrl: pr.url,
      branch: pr.headBranch,
      worktreePath,
      draft: pr.isDraft,
      created: false,
    };

    return createSuccessResult('newpr', data, warnings.length > 0 ? warnings : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult('newpr', ErrorCode.UNKNOWN_ERROR, message);
  }
}

/**
 * Create a new PR with a dedicated worktree
 *
 * This is the programmatic equivalent of `newpr "description" --non-interactive`.
 * For interactive usage or when you need user choices, use the CLI directly.
 *
 * @example
 * ```typescript
 * import { createPr, queryState } from '@camaradesuk/git-worktree-tools/api';
 *
 * // First query state to get recommended action
 * const state = queryState({ baseBranch: 'main' });
 * if (!state.success) {
 *   throw new Error(state.error?.message);
 * }
 *
 * // Then create PR with the recommended action
 * const result = await createPr({
 *   description: 'Add dark mode support',
 *   action: state.data.recommendedAction ?? 'empty_commit',
 *   draft: true,
 * });
 *
 * if (result.success) {
 *   console.log(`Created PR #${result.data.prNumber}`);
 *   console.log(`Worktree at: ${result.data.worktreePath}`);
 * }
 * ```
 */
export async function createPr(options: CreatePrOptions): Promise<CreatePrResult> {
  const {
    description,
    action: actionKey,
    draft = false,
    baseBranch = 'main',
    branchName: customBranchName,
    cwd,
  } = options;

  const warnings: string[] = [];

  try {
    // Verify prerequisites
    if (!github.isGhInstalled()) {
      return createErrorResult(
        'newpr',
        ErrorCode.GH_NOT_INSTALLED,
        'GitHub CLI (gh) is required'
      );
    }

    if (!github.isAuthenticated()) {
      return createErrorResult(
        'newpr',
        ErrorCode.GH_NOT_AUTHENTICATED,
        'GitHub CLI not authenticated. Run: gh auth login'
      );
    }

    // Verify we're in a git repo
    const repoRoot = git.getRepoRoot(cwd);
    if (!repoRoot) {
      return createErrorResult('newpr', ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
    }

    const repoName = git.getRepoName(repoRoot);
    const config = loadConfig(repoRoot);
    const branchName = customBranchName ?? generateBranchName(config, description);

    // Fetch latest
    try {
      git.fetch('origin');
    } catch {
      warnings.push('Could not fetch from origin (network unavailable?)');
    }

    // Analyze state and detect scenario
    const state = analyzeGitState(baseBranch);
    const scenario = detectScenario(state);

    // Check for pr_worktree scenario
    if (scenario === 'pr_worktree') {
      return createErrorResult(
        'newpr',
        ErrorCode.INVALID_ARGUMENT,
        'Cannot create PR from a PR worktree. Switch to the main worktree first.'
      );
    }

    // Get action - either from specified key or use recommended
    let action: StateAction | null = null;

    if (actionKey) {
      if (!isValidStateActionKey(actionKey)) {
        return createErrorResult(
          'newpr',
          ErrorCode.INVALID_ACTION,
          `Invalid action key: ${actionKey}`
        );
      }

      action = findActionByKey(scenario, baseBranch, actionKey);
      if (!action) {
        const context = getScenarioContext(scenario, state, baseBranch);
        const availableKeys = context?.choices.map((c) => c.action?.action).filter(Boolean) ?? [];
        return createErrorResult(
          'newpr',
          ErrorCode.INVALID_ACTION,
          `Action '${actionKey}' is not available for scenario '${scenario}'`,
          { availableActions: availableKeys }
        );
      }
    } else {
      // Use first available action (recommended) or fail
      const context = getScenarioContext(scenario, state, baseBranch);
      if (!context || context.choices.length === 0) {
        return createErrorResult(
          'newpr',
          ErrorCode.INVALID_ARGUMENT,
          `No actions available for scenario '${scenario}'. Use --action to specify or run interactively.`
        );
      }
      action = context.choices[0].action;
      if (!action) {
        return createErrorResult(
          'newpr',
          ErrorCode.INVALID_ARGUMENT,
          'Could not determine action for current state'
        );
      }
    }

    // Handle existing branch action
    if (isExistingBranchAction(action)) {
      const currentBranch = state.currentBranch;
      if (!currentBranch) {
        return createErrorResult(
          'newpr',
          ErrorCode.DETACHED_HEAD,
          'Cannot determine current branch for existing branch action'
        );
      }

      // Execute pre-action
      const deps = createActionDeps(repoRoot);
      const actionResult = executeStateAction(action, description, currentBranch, deps, repoRoot);

      if (!actionResult.success) {
        return createErrorResult(
          'newpr',
          ErrorCode.OPERATION_FAILED,
          `Action failed: ${actionResult.message}`
        );
      }

      // Push if not on remote
      if (!git.remoteBranchExists(currentBranch)) {
        git.push({ setUpstream: true, remote: 'origin', branch: currentBranch });
      }

      // Check if PR already exists
      const existingPr = github.getPrByBranch(currentBranch);
      if (existingPr) {
        const worktreePath = generateWorktreePath(config, repoRoot, repoName, existingPr.number);

        // Create worktree if it doesn't exist
        if (!fs.existsSync(worktreePath)) {
          try {
            git.addWorktree(worktreePath, currentBranch, {
              createBranch: true,
              startPoint: `origin/${currentBranch}`,
            });
          } catch {
            git.addWorktree(worktreePath, currentBranch);
          }
        }

        const data: CreatePrResultData = {
          prNumber: existingPr.number,
          prUrl: existingPr.url,
          branch: currentBranch,
          worktreePath,
          draft: existingPr.isDraft,
          scenario,
          actionTaken: action.action,
          created: false,
        };

        return createSuccessResult('newpr', data, warnings.length > 0 ? warnings : undefined);
      }

      // Create PR for existing branch
      const title = currentBranch
        .replace(/^(feat|fix|chore)\//, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const pr = github.createPr({
        title,
        body: `## Summary\n\nPR created from existing branch: \`${currentBranch}\`\n\n## Changes\n\n-\n\n## Test Plan\n\n- [ ]\n\n---\n🤖 PR created with \`newpr\``,
        base: baseBranch,
        head: currentBranch,
        draft,
      });

      const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);

      try {
        git.addWorktree(worktreePath, currentBranch, {
          createBranch: true,
          startPoint: `origin/${currentBranch}`,
        });
      } catch {
        git.addWorktree(worktreePath, currentBranch);
      }

      const data: CreatePrResultData = {
        prNumber: pr.number,
        prUrl: pr.url,
        branch: currentBranch,
        worktreePath,
        draft,
        scenario,
        actionTaken: action.action,
        created: true,
      };

      return createSuccessResult('newpr', data, warnings.length > 0 ? warnings : undefined);
    }

    // Check if branch already exists on remote
    if (git.remoteBranchExists(branchName)) {
      const existingPr = github.getPrByBranch(branchName);
      if (existingPr) {
        return setupPrWorktree({ prNumber: existingPr.number, cwd });
      }

      return createErrorResult(
        'newpr',
        ErrorCode.BRANCH_EXISTS,
        `Branch ${branchName} already exists on remote but has no PR`
      );
    }

    // Execute the state action
    const originalBranch = git.getCurrentBranch() || 'main';
    const deps = createActionDeps(repoRoot);
    const actionResult = executeStateAction(action, description, branchName, deps, repoRoot);

    if (!actionResult.success) {
      return createErrorResult(
        'newpr',
        ErrorCode.OPERATION_FAILED,
        `Action failed: ${actionResult.message}`
      );
    }

    // Stash unstaged changes if needed
    let unstagedStashRef: string | null = null;
    if (action.stashUnstaged) {
      unstagedStashRef = git.stash({
        keepIndex: true,
        message: 'newpr: unstaged changes for worktree',
      });
    }

    try {
      // Create branch
      const branchFrom = getBranchPoint(action, baseBranch);

      try {
        git.exec(['checkout', '-b', branchName, branchFrom]);
      } catch (checkoutError) {
        // Restore stash if checkout failed
        if (actionResult.stashRef) {
          try {
            git.stashPop(actionResult.stashRef);
          } catch {
            // Ignore stash restore errors
          }
        }
        throw checkoutError;
      }

      // Commit if we have staged files
      const stagedFiles = git.getStagedFiles();
      if (stagedFiles.length > 0) {
        git.commit({ message: `feat: ${description}\n\n🤖 Created with newpr` });
      } else if (action.branchFrom === 'origin_main') {
        git.commit({
          message: `chore: initialize ${branchName}\n\nBranch created for: ${description}\n\n🤖 Created with newpr`,
          allowEmpty: true,
        });
      }

      // Push to origin
      git.push({ setUpstream: true, remote: 'origin', branch: branchName });

      // Return to original branch
      git.checkout(originalBranch);

      // Create PR
      const pr = github.createPr({
        title: description,
        body: `## Summary\n\n${description}\n\n## Changes\n\n-\n\n## Test Plan\n\n- [ ]\n\n---\n🤖 PR created with \`newpr\``,
        base: baseBranch,
        head: branchName,
        draft,
      });

      // Create worktree
      const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);
      git.addWorktree(worktreePath, branchName);

      // Apply unstaged changes to worktree
      if (unstagedStashRef) {
        try {
          git.stashApply(unstagedStashRef, worktreePath);
          git.stashDrop(unstagedStashRef);
        } catch {
          warnings.push('Failed to apply unstaged changes to worktree. Run "git stash pop" to recover.');
        }
      }

      const data: CreatePrResultData = {
        prNumber: pr.number,
        prUrl: pr.url,
        branch: branchName,
        worktreePath,
        draft,
        scenario,
        actionTaken: action.action,
        created: true,
      };

      return createSuccessResult('newpr', data, warnings.length > 0 ? warnings : undefined);
    } catch (error) {
      // Restore stash on error
      if (actionResult.stashRef) {
        try {
          git.stashPop(actionResult.stashRef);
        } catch {
          // Ignore stash restore errors
        }
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult('newpr', ErrorCode.UNKNOWN_ERROR, message);
  }
}
