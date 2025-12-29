#!/usr/bin/env node
/**
 * newpr - Create or setup a PR with a dedicated worktree
 *
 * Usage:
 *   newpr "feature description"     Create new branch + PR + worktree
 *   newpr --pr <NUMBER>             Setup worktree for existing PR
 *   newpr --branch <NAME>           Create PR for existing branch + worktree
 */

import path from 'path';
import fs from 'fs';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as colors from '../lib/colors.js';
import { promptChoiceIndex, promptConfirm } from '../lib/prompts.js';
import {
  loadConfig,
  generateBranchName,
  generateWorktreePath,
  type WorktreeConfig,
} from '../lib/config.js';
import {
  analyzeGitState,
  detectScenario,
  type GitState,
  type Scenario,
} from '../lib/state-detection.js';

// CLI options
interface Options {
  mode: 'new' | 'pr' | 'branch';
  description?: string;
  prNumber?: number;
  branchName?: string;
  baseBranch: string;
  draft: boolean;
  installDeps: boolean;
  openEditor: boolean;
  runWtlink: boolean;
}

// State action result from scenario handling
interface StateAction {
  action: string;
  branchFrom: 'origin_main' | 'head';
  stashUnstaged: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): Options {
  const options: Options = {
    mode: 'new',
    baseBranch: 'main',
    draft: true,
    installDeps: false,
    openEditor: false,
    runWtlink: true,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;

      case '--pr':
      case '-p':
        options.mode = 'pr';
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          console.error(colors.error('--pr requires a PR number'));
          process.exit(1);
        }
        options.prNumber = parseInt(args[i], 10);
        if (isNaN(options.prNumber)) {
          console.error(colors.error('PR number must be numeric'));
          process.exit(1);
        }
        break;

      case '--branch':
      case '-B':
        options.mode = 'branch';
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          console.error(colors.error('--branch requires a branch name'));
          process.exit(1);
        }
        options.branchName = args[i];
        break;

      case '-b':
      case '--base':
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          console.error(colors.error('--base requires a branch name'));
          process.exit(1);
        }
        options.baseBranch = args[i];
        break;

      case '-i':
      case '--install':
        options.installDeps = true;
        break;

      case '-c':
      case '--code':
        options.openEditor = true;
        break;

      case '-r':
      case '--ready':
        options.draft = false;
        break;

      case '--no-wtlink':
        options.runWtlink = false;
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(colors.error(`Unknown option: ${arg}`));
          process.exit(1);
        }
        // Positional argument = description
        if (!options.description && options.mode === 'new') {
          options.description = arg;
        } else {
          console.error(colors.error(`Unexpected argument: ${arg}`));
          process.exit(1);
        }
    }
    i++;
  }

  // Validate
  if (options.mode === 'new' && !options.description) {
    console.error(colors.error('Description required. Usage: newpr "feature description"'));
    process.exit(1);
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
${colors.bold('newpr')} - Create or setup a PR with a dedicated worktree

${colors.bold('Usage:')}
  newpr "description"           Create new branch + PR + worktree
  newpr --pr <NUMBER>           Setup worktree for existing PR
  newpr --branch <NAME>         Create PR for existing branch + worktree

${colors.bold('Options:')}
  -b, --base BRANCH     Base branch for PR (default: main)
  -i, --install         Install dependencies after setup
  -c, --code            Open editor to the new worktree
  -r, --ready           Create PR as ready for review (default: draft)
  --no-wtlink           Skip wtlink config sync
  -h, --help            Show this help message

${colors.bold('Examples:')}
  newpr "Add user authentication"
  newpr "Fix login bug" --install --code
  newpr --pr 1234
  newpr --branch feat/my-feature
`);
}

/**
 * Check prerequisites
 */
function checkPrerequisites(): void {
  console.log(colors.info('Checking prerequisites...'));

  // Check gh CLI
  if (!github.isGhInstalled()) {
    console.error(colors.error('GitHub CLI (gh) is required. See: https://cli.github.com'));
    process.exit(1);
  }

  // Check gh auth
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
async function handleScenario(
  scenario: Scenario,
  state: GitState,
  baseBranch: string
): Promise<StateAction | null> {
  const defaultAction: StateAction = {
    action: 'empty_commit',
    branchFrom: 'origin_main',
    stashUnstaged: false,
  };

  switch (scenario) {
    case 'main_clean_same': {
      // Scenario 1: On main, same as origin/main, clean
      console.log(colors.warning('No changes detected from main branch.'));
      console.log();
      console.log("You are on 'main' with no local commits or uncommitted changes.");
      console.log('A PR requires at least one commit difference from the base branch.');

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Continue with empty initial commit',
        "Cancel - I'll make some changes first",
      ]);

      if (choice === 1) {
        return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
      }
      return null;
    }

    case 'main_staged_same': {
      // Scenario 2a: On main, same as origin/main, staged changes only
      console.log(colors.info('You have staged changes ready to commit:'));
      showStagedChanges();

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Commit staged changes to the new PR branch',
        'Leave changes here and continue with empty initial commit',
        'Cancel',
      ]);

      switch (choice) {
        case 1:
          return { action: 'commit_staged', branchFrom: 'origin_main', stashUnstaged: false };
        case 2:
          return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
        default:
          return null;
      }
    }

    case 'main_unstaged_same': {
      // Scenario 2b: On main, same as origin/main, unstaged changes only
      console.log(colors.info('You have unstaged changes:'));
      showUncommittedChanges();

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Stage all and commit to the new PR branch',
        'Leave changes here and continue with empty initial commit',
        'Stash changes (will restore after)',
        'Cancel',
      ]);

      switch (choice) {
        case 1:
          return { action: 'commit_all', branchFrom: 'origin_main', stashUnstaged: false };
        case 2:
          return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
        case 3:
          return { action: 'stash_and_empty', branchFrom: 'origin_main', stashUnstaged: false };
        default:
          return null;
      }
    }

    case 'main_both_same': {
      // Scenario 2c: On main, same as origin/main, both staged and unstaged
      console.log(colors.info('You have both staged and unstaged changes:'));
      showStagedChanges();
      showUnstagedChanges();

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Commit staged to PR branch, move unstaged to new worktree',
        'Stage all and commit everything to the new PR branch',
        'Leave all changes here and continue with empty initial commit',
        'Stash all changes (will restore after)',
        'Cancel',
      ]);

      switch (choice) {
        case 1:
          return { action: 'commit_staged', branchFrom: 'origin_main', stashUnstaged: true };
        case 2:
          return { action: 'commit_all', branchFrom: 'origin_main', stashUnstaged: false };
        case 3:
          return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
        case 4:
          return { action: 'stash_and_empty', branchFrom: 'origin_main', stashUnstaged: false };
        default:
          return null;
      }
    }

    case 'main_clean_ahead': {
      // Scenario 3: On main, ahead of origin/main, clean
      console.log(colors.info("You have local commits on 'main' not yet pushed:"));
      showLocalCommits(baseBranch);
      console.log();
      console.log('These commits will NOT be included in the new PR branch by default.');

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Use these commits for the PR (create branch from HEAD)',
        'Push commits to origin/main first, then create PR branch',
        'Start fresh from origin/main (ignore local commits)',
        'Cancel',
      ]);

      switch (choice) {
        case 1:
          return { action: 'use_commits', branchFrom: 'head', stashUnstaged: false };
        case 2:
          return { action: 'push_then_branch', branchFrom: 'origin_main', stashUnstaged: false };
        case 3:
          return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
        default:
          return null;
      }
    }

    case 'main_changes_ahead': {
      // Scenario 4: On main, ahead of origin/main, has changes
      console.log(colors.info('You have local commits AND uncommitted changes:'));
      console.log();
      console.log('Local commits (not pushed):');
      showLocalCommits(baseBranch);
      console.log();
      console.log('Uncommitted changes:');
      showUncommittedChanges();

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Include commits + commit uncommitted changes to PR branch',
        'Include commits only, stash uncommitted changes',
        'Start fresh from origin/main (ignore all local work)',
        'Cancel',
      ]);

      switch (choice) {
        case 1:
          return { action: 'use_commits_and_commit_all', branchFrom: 'head', stashUnstaged: false };
        case 2:
          return { action: 'use_commits_and_stash', branchFrom: 'head', stashUnstaged: false };
        case 3:
          return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
        default:
          return null;
      }
    }

    case 'branch_same_as_main': {
      // Scenario 5: On different branch, same commit as main
      const branch = state.currentBranch || 'unknown';
      console.log(colors.warning(`Branch '${branch}' is at the same commit as main.`));
      console.log();
      console.log('No divergent commits detected. A PR requires at least one commit difference.');

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Continue with empty initial commit (new branch from main)',
        'Cancel',
      ]);

      if (choice === 1) {
        return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
      }
      return null;
    }

    case 'branch_ancestor': {
      // Scenario 6: On different branch, already merged
      const branch = state.currentBranch || 'unknown';
      const shortSha = git.getShortCommit();
      console.log(colors.warning(`Branch '${branch}' appears to be already merged into main.`));
      console.log();
      console.log(`Current commit (${shortSha}) is an ancestor of origin/main.`);
      console.log('Creating a PR would result in no changes.');

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Continue with empty initial commit (new branch from main)',
        "Cancel - I'll check the branch status first",
      ]);

      if (choice === 1) {
        return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
      }
      return null;
    }

    case 'branch_divergent': {
      // Scenario 7: On different branch, divergent commits
      const branch = state.currentBranch || 'unknown';
      console.log(colors.info(`You are on branch '${branch}' with commits not in main:`));
      showLocalCommits(baseBranch);

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        `Create PR for THIS branch (${branch} → main)`,
        "Create NEW branch from main (ignore current branch's commits)",
        'Cancel',
      ]);

      switch (choice) {
        case 1:
          return { action: 'create_pr_for_branch', branchFrom: 'head', stashUnstaged: false };
        case 2:
          return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
        default:
          return null;
      }
    }

    case 'branch_with_changes': {
      // Scenario 8: On different branch with uncommitted changes
      const branch = state.currentBranch || 'unknown';
      console.log(colors.info(`You are on branch '${branch}' with uncommitted changes:`));
      showUncommittedChanges();

      // Check if branch has divergent commits
      const hasDivergent = state.localCommits.length > 0;

      if (hasDivergent) {
        console.log();
        console.log('Branch also has commits not in main:');
        showLocalCommits(baseBranch);

        const choice = await promptChoiceIndex('How would you like to proceed?', [
          'Create PR for THIS branch, commit changes first',
          'Create PR for THIS branch, stash uncommitted changes',
          'Create NEW branch from main (ignore current branch)',
          'Cancel',
        ]);

        switch (choice) {
          case 1:
            return { action: 'pr_for_branch_commit_all', branchFrom: 'head', stashUnstaged: false };
          case 2:
            return { action: 'pr_for_branch_stash', branchFrom: 'head', stashUnstaged: false };
          case 3:
            return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
          default:
            return null;
        }
      } else {
        const choice = await promptChoiceIndex('How would you like to proceed?', [
          'Stage all and commit to a new PR branch',
          'Leave changes and continue with empty initial commit',
          'Stash changes (will restore after)',
          'Cancel',
        ]);

        switch (choice) {
          case 1:
            return { action: 'commit_all', branchFrom: 'origin_main', stashUnstaged: false };
          case 2:
            return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
          case 3:
            return { action: 'stash_and_empty', branchFrom: 'origin_main', stashUnstaged: false };
          default:
            return null;
        }
      }
    }

    case 'detached_head': {
      // Scenario 9: Detached HEAD
      const shortSha = git.getShortCommit();
      console.log(colors.warning(`You are in detached HEAD state at commit ${shortSha}.`));

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        'Create branch from this commit',
        'Create branch from origin/main',
        'Cancel',
      ]);

      switch (choice) {
        case 1:
          return { action: 'branch_from_detached', branchFrom: 'head', stashUnstaged: false };
        case 2:
          return { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false };
        default:
          return null;
      }
    }

    case 'pr_worktree': {
      // Scenario 10: Running from PR worktree
      console.log(colors.warning('You are in a PR worktree, not the main worktree.'));
      console.log();
      console.log('Creating a new PR is best done from the main worktree.');

      const choice = await promptChoiceIndex('How would you like to proceed?', [
        "Continue anyway (create PR from this worktree's state)",
        "Cancel - I'll switch to the main worktree",
      ]);

      if (choice === 1) {
        // Analyze actual state and recurse
        const newState = analyzeGitState(baseBranch);
        const newScenario = detectScenario(newState);
        return handleScenario(newScenario, newState, baseBranch);
      }
      return null;
    }

    default:
      return defaultAction;
  }
}

/**
 * Execute state action
 */
function executeStateAction(
  action: StateAction,
  description: string,
  branchName: string,
  cwd?: string
): string | null {
  let stashRef: string | null = null;

  switch (action.action) {
    case 'empty_commit':
      // No action needed before branch creation
      break;

    case 'commit_staged':
      // Will commit staged changes after creating branch
      break;

    case 'commit_all':
      console.log(colors.info('Staging all changes...'));
      git.add('.', cwd);
      break;

    case 'stash_and_empty':
      console.log(colors.info('Stashing all changes...'));
      stashRef = git.stash({ message: `newpr: auto-stash before creating ${branchName}` }, cwd);
      break;

    case 'use_commits':
    case 'branch_from_detached':
      // Branch from HEAD instead of origin/main
      break;

    case 'use_commits_and_commit_all':
      console.log(colors.info('Staging all uncommitted changes...'));
      git.add('.', cwd);
      break;

    case 'use_commits_and_stash':
      console.log(colors.info('Stashing uncommitted changes...'));
      stashRef = git.stash({ message: `newpr: auto-stash before creating ${branchName}` }, cwd);
      break;

    case 'push_then_branch':
      console.log(colors.info('Pushing local commits to origin/main...'));
      git.push({ remote: 'origin', branch: 'main' }, cwd);
      break;

    case 'pr_for_branch_commit_all':
      console.log(colors.info('Staging and committing all changes to current branch...'));
      git.add('.', cwd);
      git.commit({ message: 'chore: work in progress\n\n🤖 Committed with newpr' }, cwd);
      break;

    case 'pr_for_branch_stash':
      console.log(colors.info('Stashing uncommitted changes...'));
      stashRef = git.stash({ message: 'newpr: auto-stash before creating PR' }, cwd);
      break;
  }

  return stashRef;
}

/**
 * Setup worktree (symlinks, wtlink, deps)
 */
async function setupWorktree(
  worktreePath: string,
  config: Required<WorktreeConfig>,
  options: Options
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

  // TODO: Run wtlink if available
  // if (options.runWtlink) { ... }

  // TODO: Install dependencies if requested
  // if (options.installDeps) { ... }

  // TODO: Open editor if requested
  // if (options.openEditor) { ... }
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

  // Get PR info
  const pr = github.getPr(prNumber);
  if (!pr) {
    console.error(colors.error(`Could not find PR #${prNumber}`));
    process.exit(1);
  }

  if (pr.state !== 'OPEN') {
    console.log(colors.warning(`PR #${prNumber} is ${pr.state}`));
  }

  console.log(colors.info(`PR branch: ${pr.headBranch}`));

  // Generate worktree path
  const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber);

  if (fs.existsSync(worktreePath)) {
    console.error(colors.error(`Worktree already exists: ${worktreePath}`));
    process.exit(1);
  }

  // Fetch the branch
  console.log(colors.info('Fetching branch from origin...'));
  git.fetch('origin');

  // Create worktree
  console.log(colors.info(`Creating worktree at ${worktreePath}...`));
  try {
    git.addWorktree(worktreePath, pr.headBranch, {
      createBranch: true,
      startPoint: `origin/${pr.headBranch}`,
    });
  } catch {
    // Branch might already exist locally
    git.addWorktree(worktreePath, pr.headBranch);
  }

  console.log(colors.success(`Created worktree: ${worktreePath}`));

  // Setup worktree
  await setupWorktree(worktreePath, config, options);

  // Print summary
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

  // Fetch latest
  console.log(colors.info('Fetching latest from origin...'));
  git.fetch('origin');

  // Check if branch exists on remote
  if (!git.remoteBranchExists(branchName)) {
    // Check if it exists locally
    if (git.branchExists(branchName)) {
      console.log(colors.info('Branch exists locally, pushing to origin...'));
      git.push({ setUpstream: true, remote: 'origin', branch: branchName });
    } else {
      console.error(colors.error(`Branch '${branchName}' does not exist locally or on remote`));
      process.exit(1);
    }
  }

  // Check if PR already exists
  const existingPr = github.getPrByBranch(branchName);
  if (existingPr) {
    console.log(colors.info(`PR #${existingPr.number} already exists for branch ${branchName}`));
    await modeExistingPr(existingPr.number, options);
    return;
  }

  // Create PR
  console.log(colors.info('Creating pull request...'));

  // Generate title from branch name
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

  // Generate worktree path
  const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);

  // Create worktree
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

  // Setup worktree
  await setupWorktree(worktreePath, config, options);

  // Print summary
  printSummary(pr.number, branchName, worktreePath, pr.url);
}

/**
 * Mode: Create new branch + PR + worktree
 */
async function modeNewFeature(description: string, options: Options): Promise<void> {
  const repoRoot = git.getRepoRoot();
  const repoName = git.getRepoName(repoRoot);
  const config = loadConfig(repoRoot);

  // Generate branch name
  const branchName = generateBranchName(config, description);

  // Fetch latest
  console.log(colors.info('Fetching latest from origin...'));
  try {
    git.fetch('origin');
  } catch {
    console.log(colors.warning('Could not fetch from origin (network unavailable?)'));
  }

  // Analyze git state
  const state = analyzeGitState(options.baseBranch);
  const scenario = detectScenario(state);

  // Handle scenario and get action
  const action = await handleScenario(scenario, state, options.baseBranch);
  if (!action) {
    console.log(colors.error('Aborted by user.'));
    process.exit(1);
  }

  // Handle special case: create PR for existing branch
  if (
    action.action === 'create_pr_for_branch' ||
    action.action === 'pr_for_branch_commit_all' ||
    action.action === 'pr_for_branch_stash'
  ) {
    const currentBranch = state.currentBranch;
    if (!currentBranch) {
      console.error(colors.error('Cannot determine current branch'));
      process.exit(1);
    }

    // Execute action for current branch
    executeStateAction(action, description, currentBranch);

    // Push if needed
    if (!git.remoteBranchExists(currentBranch)) {
      console.log(colors.info('Pushing branch to origin...'));
      git.push({ setUpstream: true, remote: 'origin', branch: currentBranch });
    }

    // Delegate to existing branch mode
    await modeExistingBranch(currentBranch, options);
    return;
  }

  console.log(colors.info(`Creating feature branch: ${branchName}`));

  // Check if branch already exists on remote
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

  // Save original branch
  const originalBranch = git.getCurrentBranch() || 'main';

  // Execute pre-branch actions
  const stashRef = executeStateAction(action, description, branchName);

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
    // Determine branch point
    const branchFrom = action.branchFrom === 'head' ? 'HEAD' : `origin/${options.baseBranch}`;
    console.log(colors.info(`Creating branch from ${branchFrom}...`));

    // Create and checkout new branch
    git.exec(['checkout', '-b', branchName, branchFrom]);

    // Create initial commit
    const stagedFiles = git.getStagedFiles();
    if (stagedFiles.length > 0) {
      console.log(colors.info('Committing staged changes...'));
      git.commit({ message: `feat: ${description}\n\n🤖 Created with newpr` });
    } else if (action.branchFrom === 'origin_main') {
      // No commits ahead and no staged changes - create empty commit
      console.log(colors.info('Creating initial commit (required for PR creation)...'));
      git.commit({
        message: `chore: initialize ${branchName}\n\nBranch created for: ${description}\n\n🤖 Created with newpr`,
        allowEmpty: true,
      });
    }

    // Push branch
    console.log(colors.info('Pushing branch to origin...'));
    git.push({ setUpstream: true, remote: 'origin', branch: branchName });

    // Switch back to original branch
    git.checkout(originalBranch);

    // Create PR
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

    // Generate worktree path
    const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);

    // Create worktree
    console.log(colors.info(`Creating worktree at ${worktreePath}...`));
    git.addWorktree(worktreePath, branchName);

    console.log(colors.success(`Created worktree: ${worktreePath}`));

    // Apply unstaged changes to worktree if we stashed them
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

    // Setup worktree
    await setupWorktree(worktreePath, config, options);

    // Print summary
    printSummary(pr.number, branchName, worktreePath, pr.url);
  } catch (error) {
    // Restore stashed changes on failure
    if (stashRef) {
      console.log(colors.info('Restoring stashed changes...'));
      try {
        git.stashPop(stashRef);
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
  const args = process.argv.slice(2);
  const options = parseArgs(args);

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
