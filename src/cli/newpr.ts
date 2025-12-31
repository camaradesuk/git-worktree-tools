#!/usr/bin/env node
/**
 * newpr - Create or setup a PR with a dedicated worktree
 *
 * CLI thin wrapper - orchestration and side effects only
 */

import path from 'path';
import fs from 'fs';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as colors from '../lib/colors.js';
import { promptChoiceIndex } from '../lib/prompts.js';
import {
  loadConfig,
  generateBranchName,
  generateWorktreePath,
  type WorktreeConfig,
} from '../lib/config.js';
import { analyzeGitState, detectScenario, type GitState } from '../lib/state-detection.js';
import {
  parseArgs,
  getHelpText,
  getScenarioContext,
  isPrWorktreeScenario,
  isExistingBranchAction,
  executeStateAction,
  getBranchPoint,
  getScenarioMessageLevel,
  type Options,
  type StateAction,
  type ActionDeps,
} from '../lib/newpr/index.js';

/**
 * Debug logging - enabled with DEBUG=newpr or DEBUG=*
 */
const DEBUG_ENABLED =
  process.env.DEBUG === 'newpr' || process.env.DEBUG === '*' || process.env.DEBUG === '1';

function debug(message: string, data?: Record<string, unknown>): void {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString();
  console.error(colors.dim(`[DEBUG ${timestamp}] ${message}`));
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      console.error(colors.dim(`  ${key}: ${JSON.stringify(value)}`));
    }
  }
}

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
 * Check prerequisites
 */
function checkPrerequisites(): void {
  console.log(colors.info('Checking prerequisites...'));

  if (!github.isGhInstalled()) {
    console.error(colors.error('GitHub CLI (gh) is required. See: https://cli.github.com'));
    process.exit(1);
  }

  if (!github.isAuthenticated()) {
    console.error(colors.error('GitHub CLI not authenticated. Run: gh auth login'));
    process.exit(1);
  }

  console.log(colors.success('Prerequisites OK'));
}

/**
 * Show local commits not in base branch
 */
function showLocalCommits(baseBranch: string, cwd?: string): void {
  const commits = git.getCommitsAhead(baseBranch, cwd);
  if (commits.length > 0) {
    console.log();
    for (const commit of commits.slice(0, 10)) {
      console.log(`  ${commit}`);
    }
    if (commits.length > 10) {
      console.log(`  ... and ${commits.length - 10} more commits`);
    }
  }
}

/**
 * Show uncommitted changes
 */
function showUncommittedChanges(cwd?: string): void {
  const status = git.getStatusOutput(cwd);
  if (status) {
    console.log();
    console.log(status);
  }
}

/**
 * Show staged changes
 */
function showStagedChanges(cwd?: string): void {
  const files = git.getStagedFiles(cwd);
  if (files.length > 0) {
    console.log();
    console.log('Staged:');
    for (const file of files) {
      console.log(`   ${file}`);
    }
  }
}

/**
 * Show unstaged changes
 */
function showUnstagedChanges(cwd?: string): void {
  const files = git.getUnstagedFiles(cwd);
  if (files.length > 0) {
    console.log();
    console.log('Unstaged:');
    for (const file of files) {
      console.log(` ${file}`);
    }
  }
}

/**
 * Handle scenario and return action to take
 */
async function handleScenario(state: GitState, baseBranch: string): Promise<StateAction | null> {
  let scenario = detectScenario(state);

  // Handle pr_worktree scenario - re-analyze after warning
  if (isPrWorktreeScenario(scenario)) {
    console.log(colors.warning('You are in a PR worktree, not the main worktree.'));
    console.log();
    console.log('Creating a new PR is best done from the main worktree.');

    const choice = await promptChoiceIndex('How would you like to proceed?', [
      "Continue anyway (create PR from this worktree's state)",
      "Cancel - I'll switch to the main worktree",
    ]);

    if (choice === 1) {
      // Re-analyze and get new scenario
      const newState = analyzeGitState(baseBranch);
      scenario = detectScenario(newState);
    } else {
      return null;
    }
  }

  const context = getScenarioContext(scenario, state, baseBranch);
  if (!context) {
    // Shouldn't happen if pr_worktree is handled above
    return null;
  }

  // Display scenario message
  const level = getScenarioMessageLevel(scenario);
  if (level === 'warning') {
    console.log(colors.warning(context.message));
  } else {
    console.log(colors.info(context.message));
  }

  if (context.subMessage) {
    console.log();
    console.log(context.subMessage);
  }

  // Show relevant changes based on scenario
  if (scenario === 'main_staged_same') {
    showStagedChanges();
  } else if (scenario === 'main_unstaged_same') {
    showUncommittedChanges();
  } else if (scenario === 'main_both_same') {
    showStagedChanges();
    showUnstagedChanges();
  } else if (scenario === 'main_clean_ahead' || scenario === 'branch_divergent') {
    showLocalCommits(baseBranch);
  } else if (scenario === 'main_changes_ahead') {
    console.log();
    console.log('Local commits (not pushed):');
    showLocalCommits(baseBranch);
    console.log();
    console.log('Uncommitted changes:');
    showUncommittedChanges();
  } else if (scenario === 'branch_with_changes') {
    showUncommittedChanges();
    if (state.localCommits.length > 0) {
      console.log();
      console.log('Branch also has commits not in main:');
      showLocalCommits(baseBranch);
    }
  }

  // Prompt user for choice
  const choiceLabels = context.choices.map((c) => c.label);
  const choiceIndex = await promptChoiceIndex('How would you like to proceed?', choiceLabels);

  return context.choices[choiceIndex].action;
}

/**
 * Setup worktree (symlinks, wtlink, deps)
 */
async function setupWorktree(
  worktreePath: string,
  config: Required<WorktreeConfig>,
  _options: Options
): Promise<void> {
  const repoRoot = git.getRepoRoot();
  const parentDir = path.dirname(repoRoot);

  // Create symlinks for shared repos
  if (config.sharedRepos.length > 0) {
    console.log(colors.info('Creating symlinks for shared repositories...'));
    for (const repo of config.sharedRepos) {
      const target = path.join(parentDir, repo);
      const link = path.join(worktreePath, repo);

      if (fs.existsSync(target)) {
        if (!fs.existsSync(link)) {
          try {
            fs.symlinkSync(target, link, 'dir');
            console.log(colors.success(`Linked ${repo}`));
          } catch (error) {
            console.log(colors.warning(`Failed to link ${repo}: ${error}`));
          }
        } else {
          console.log(colors.warning(`${repo} already exists in worktree`));
        }
      } else {
        console.log(colors.warning(`${repo} not found at ${target}`));
      }
    }
  }
}

/**
 * Print summary
 */
function printSummary(
  prNumber: number,
  branchName: string,
  worktreePath: string,
  prUrl: string
): void {
  console.log();
  console.log(colors.green('════════════════════════════════════════════════════════════'));
  console.log(colors.green(`  PR #${prNumber} worktree ready!`));
  console.log(colors.green('════════════════════════════════════════════════════════════'));
  console.log();
  console.log(`  Branch:    ${branchName}`);
  console.log(`  Worktree:  ${worktreePath}`);
  console.log(`  PR URL:    ${prUrl}`);
  console.log();
  console.log('  Next steps:');
  console.log(`    cd ${worktreePath}`);
  console.log();
}

/**
 * Mode: Setup worktree for existing PR
 */
async function modeExistingPr(prNumber: number, options: Options): Promise<void> {
  console.log(colors.info(`Setting up worktree for existing PR #${prNumber}...`));

  const repoRoot = git.getRepoRoot();
  const repoName = git.getRepoName(repoRoot);
  const config = loadConfig(repoRoot);

  const pr = github.getPr(prNumber);
  if (!pr) {
    console.error(colors.error(`Could not find PR #${prNumber}`));
    process.exit(1);
  }

  if (pr.state !== 'OPEN') {
    console.log(colors.warning(`PR #${prNumber} is ${pr.state}`));
  }

  console.log(colors.info(`PR branch: ${pr.headBranch}`));

  const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber);

  if (fs.existsSync(worktreePath)) {
    console.error(colors.error(`Worktree already exists: ${worktreePath}`));
    process.exit(1);
  }

  console.log(colors.info('Fetching branch from origin...'));
  git.fetch('origin');

  console.log(colors.info(`Creating worktree at ${worktreePath}...`));
  try {
    git.addWorktree(worktreePath, pr.headBranch, {
      createBranch: true,
      startPoint: `origin/${pr.headBranch}`,
    });
  } catch {
    git.addWorktree(worktreePath, pr.headBranch);
  }

  console.log(colors.success(`Created worktree: ${worktreePath}`));

  await setupWorktree(worktreePath, config, options);
  printSummary(prNumber, pr.headBranch, worktreePath, pr.url);
}

/**
 * Mode: Create PR for existing branch
 */
async function modeExistingBranch(branchName: string, options: Options): Promise<void> {
  console.log(colors.info(`Creating PR for existing branch: ${branchName}...`));

  const repoRoot = git.getRepoRoot();
  const repoName = git.getRepoName(repoRoot);
  const config = loadConfig(repoRoot);

  console.log(colors.info('Fetching latest from origin...'));
  git.fetch('origin');

  if (!git.remoteBranchExists(branchName)) {
    if (git.branchExists(branchName)) {
      console.log(colors.info('Branch exists locally, pushing to origin...'));
      git.push({ setUpstream: true, remote: 'origin', branch: branchName });
    } else {
      console.error(colors.error(`Branch '${branchName}' does not exist locally or on remote`));
      process.exit(1);
    }
  }

  const existingPr = github.getPrByBranch(branchName);
  if (existingPr) {
    console.log(colors.info(`PR #${existingPr.number} already exists for branch ${branchName}`));
    await modeExistingPr(existingPr.number, options);
    return;
  }

  console.log(colors.info('Creating pull request...'));

  const title = branchName
    .replace(/^(feat|fix|chore)\//, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const pr = github.createPr({
    title,
    body: `## Summary

PR created from existing branch: \`${branchName}\`

## Changes

-

## Test Plan

- [ ]

---
🤖 PR created with \`newpr --branch\``,
    base: options.baseBranch,
    head: branchName,
    draft: options.draft,
  });

  console.log(colors.success(`Created PR #${pr.number}: ${pr.url}`));

  const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);

  console.log(colors.info(`Creating worktree at ${worktreePath}...`));
  try {
    git.addWorktree(worktreePath, branchName, {
      createBranch: true,
      startPoint: `origin/${branchName}`,
    });
  } catch {
    git.addWorktree(worktreePath, branchName);
  }

  console.log(colors.success(`Created worktree: ${worktreePath}`));

  await setupWorktree(worktreePath, config, options);
  printSummary(pr.number, branchName, worktreePath, pr.url);
}

/**
 * Mode: Create new branch + PR + worktree
 */
async function modeNewFeature(description: string, options: Options): Promise<void> {
  const repoRoot = git.getRepoRoot();
  const repoName = git.getRepoName(repoRoot);
  const config = loadConfig(repoRoot);
  const branchName = generateBranchName(config, description);

  console.log(colors.info('Fetching latest from origin...'));
  try {
    git.fetch('origin');
  } catch {
    console.log(colors.warning('Could not fetch from origin (network unavailable?)'));
  }

  const state = analyzeGitState(options.baseBranch);
  const scenario = detectScenario(state);

  debug('State analysis complete', {
    scenario,
    branchType: state.branchType,
    currentBranch: state.currentBranch,
    commitRelationship: state.commitRelationship,
    workingTreeStatus: state.workingTreeStatus,
    stagedFiles: state.stagedFiles,
    unstagedFiles: state.unstagedFiles,
    repoRoot: state.repoRoot,
  });

  const action = await handleScenario(state, options.baseBranch);

  if (!action) {
    console.log(colors.error('Aborted by user.'));
    process.exit(1);
  }

  debug('User selected action', {
    action: action.action,
    branchFrom: action.branchFrom,
    stashUnstaged: action.stashUnstaged,
  });

  // Handle special case: create PR for existing branch
  if (isExistingBranchAction(action)) {
    const currentBranch = state.currentBranch;
    if (!currentBranch) {
      console.error(colors.error('Cannot determine current branch'));
      process.exit(1);
    }

    const deps = createActionDeps();
    executeStateAction(action, description, currentBranch, deps);

    if (!git.remoteBranchExists(currentBranch)) {
      console.log(colors.info('Pushing branch to origin...'));
      git.push({ setUpstream: true, remote: 'origin', branch: currentBranch });
    }

    await modeExistingBranch(currentBranch, options);
    return;
  }

  console.log(colors.info(`Creating feature branch: ${branchName}`));

  if (git.remoteBranchExists(branchName)) {
    console.log(colors.warning(`Branch ${branchName} already exists on remote`));
    const existingPr = github.getPrByBranch(branchName);
    if (existingPr) {
      console.log(colors.info(`PR #${existingPr.number} already exists, setting up worktree...`));
      await modeExistingPr(existingPr.number, options);
    } else {
      console.log(colors.info('No PR exists, creating one...'));
      await modeExistingBranch(branchName, options);
    }
    return;
  }

  const originalBranch = git.getCurrentBranch() || 'main';
  const deps = createActionDeps();

  debug('Before executeStateAction', {
    originalBranch,
    branchName,
    stagedFilesBefore: git.getStagedFiles(),
    unstagedFilesBefore: git.getUnstagedFiles(),
  });

  const actionResult = executeStateAction(action, description, branchName, deps);

  debug('After executeStateAction', {
    success: actionResult.success,
    stashRef: actionResult.stashRef,
    stagedFilesAfter: git.getStagedFiles(),
    unstagedFilesAfter: git.getUnstagedFiles(),
  });

  if (!actionResult.success) {
    console.error(colors.error(`Action failed: ${actionResult.message}`));
    process.exit(1);
  }

  // Stash unstaged changes if needed
  let unstagedStashRef: string | null = null;
  if (action.stashUnstaged) {
    console.log(colors.info('Stashing unstaged changes (will move to worktree)...'));
    unstagedStashRef = git.stash({
      keepIndex: true,
      message: 'newpr: unstaged changes for worktree',
    });
  }

  try {
    const branchFrom = getBranchPoint(action, options.baseBranch);
    console.log(colors.info(`Creating branch from ${branchFrom}...`));

    debug('Before checkout', {
      branchFrom,
      branchName,
      currentBranch: git.getCurrentBranch(),
      stagedFilesBeforeCheckout: git.getStagedFiles(),
    });

    try {
      git.exec(['checkout', '-b', branchName, branchFrom]);
    } catch (checkoutError) {
      // When checkout fails (e.g., due to conflicting changes), git preserves
      // the staged files in the index - no data is lost. Provide a helpful message.
      const errorMessage =
        checkoutError instanceof Error ? checkoutError.message : String(checkoutError);
      if (errorMessage.includes('overwritten') || errorMessage.includes('conflict')) {
        console.error(colors.error('Checkout failed due to conflicting changes.'));
        console.error(colors.info('Your staged changes are preserved. To resolve this, either:'));
        console.error(colors.info('  1. Commit your changes first, then run newpr again'));
        console.error(colors.info('  2. Stash your changes: git stash push'));
        console.error(
          colors.info('  3. Use a different branch point (e.g., HEAD instead of origin/main)')
        );
      }
      throw checkoutError;
    }

    const stagedFiles = git.getStagedFiles();

    debug('After checkout', {
      newBranch: git.getCurrentBranch(),
      stagedFilesAfterCheckout: stagedFiles,
      stagedFilesCount: stagedFiles.length,
      willCommit: stagedFiles.length > 0,
      willCreateEmpty: stagedFiles.length === 0 && action.branchFrom === 'origin_main',
    });

    if (stagedFiles.length > 0) {
      console.log(colors.info('Committing staged changes...'));
      git.commit({ message: `feat: ${description}\n\n🤖 Created with newpr` });
      debug('Committed staged changes');
    } else if (action.branchFrom === 'origin_main') {
      console.log(colors.info('Creating initial commit (required for PR creation)...'));
      git.commit({
        message: `chore: initialize ${branchName}\n\nBranch created for: ${description}\n\n🤖 Created with newpr`,
        allowEmpty: true,
      });
      debug('Created empty commit (no staged files found)');
    }

    console.log(colors.info('Pushing branch to origin...'));
    git.push({ setUpstream: true, remote: 'origin', branch: branchName });

    git.checkout(originalBranch);

    console.log(colors.info('Creating pull request...'));

    const pr = github.createPr({
      title: description,
      body: `## Summary

${description}

## Changes

-

## Test Plan

- [ ]

---
🤖 PR created with \`newpr\``,
      base: options.baseBranch,
      head: branchName,
      draft: options.draft,
    });

    console.log(colors.success(`Created PR #${pr.number}: ${pr.url}`));

    const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);

    console.log(colors.info(`Creating worktree at ${worktreePath}...`));
    git.addWorktree(worktreePath, branchName);

    console.log(colors.success(`Created worktree: ${worktreePath}`));

    if (unstagedStashRef) {
      console.log(colors.info('Moving unstaged changes to worktree...'));
      try {
        git.stashApply(unstagedStashRef, worktreePath);
        console.log(colors.success('Unstaged changes applied to worktree'));
        git.stashDrop(unstagedStashRef);
      } catch {
        console.log(colors.warning('Failed to apply unstaged changes to worktree.'));
        console.log(colors.warning("Run 'git stash pop' in main worktree to recover them."));
      }
    }

    await setupWorktree(worktreePath, config, options);
    printSummary(pr.number, branchName, worktreePath, pr.url);
  } catch (error) {
    if (actionResult.stashRef) {
      console.log(colors.info('Restoring stashed changes...'));
      try {
        git.stashPop(actionResult.stashRef);
      } catch {
        console.log(colors.warning("Failed to restore stash. Run 'git stash pop' manually."));
      }
    }
    throw error;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const result = parseArgs(process.argv.slice(2));

  if (result.kind === 'help') {
    console.log(getHelpText());
    process.exit(0);
  }

  if (result.kind === 'error') {
    console.error(colors.error(result.message));
    process.exit(1);
  }

  const { options } = result;

  checkPrerequisites();

  switch (options.mode) {
    case 'pr':
      await modeExistingPr(options.prNumber!, options);
      break;

    case 'branch':
      await modeExistingBranch(options.branchName!, options);
      break;

    case 'new':
      await modeNewFeature(options.description!, options);
      break;
  }
}

main().catch((error) => {
  console.error(colors.error(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
