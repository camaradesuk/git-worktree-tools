#!/usr/bin/env node
/**
 * cleanpr - Clean up PR worktrees after merge/close
 *
 * Usage:
 *   cleanpr                    # Interactive cleanup of merged/closed PRs
 *   cleanpr <PR_NUMBER>        # Clean specific PR worktree
 *   cleanpr --all              # Clean all merged/closed PRs
 *   cleanpr <PR_NUMBER> -r     # Also delete remote branch
 *   cleanpr <PR_NUMBER> -f     # Force removal with uncommitted changes
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as prompts from '../lib/prompts.js';
import * as colors from '../lib/colors.js';
import { loadConfig } from '../lib/config.js';

interface CleanOptions {
  deleteRemote: boolean;
  force: boolean;
  all: boolean;
  interactive: boolean;
}

interface WorktreeInfo {
  path: string;
  branch: string | null;
  commit: string;
  prNumber: number | null;
  prState: 'OPEN' | 'CLOSED' | 'MERGED' | 'UNKNOWN';
  hasChanges: boolean;
}

function parseArgs(): { prNumber: number | null; options: CleanOptions } {
  const args = process.argv.slice(2);
  let prNumber: number | null = null;
  const options: CleanOptions = {
    deleteRemote: false,
    force: false,
    all: false,
    interactive: true,
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
      case '-r':
      case '--remote':
        options.deleteRemote = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-a':
      case '--all':
        options.all = true;
        options.interactive = false;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(colors.error(`Unknown option: ${arg}`));
          process.exit(1);
        }
        // Must be PR number
        const num = parseInt(arg, 10);
        if (isNaN(num)) {
          console.error(colors.error(`Invalid PR number: ${arg}`));
          process.exit(1);
        }
        prNumber = num;
        options.interactive = false;
    }
    i++;
  }

  return { prNumber, options };
}

function printHelp(): void {
  console.log(`
${colors.bold('cleanpr')} - Clean up PR worktrees after merge/close

${colors.bold('USAGE')}
  cleanpr                         Interactive cleanup of merged/closed PRs
  cleanpr <PR_NUMBER>             Clean specific PR worktree
  cleanpr --all                   Clean all merged/closed PRs automatically
  cleanpr <PR_NUMBER> [options]   Clean with options

${colors.bold('OPTIONS')}
  -r, --remote    Also delete the remote branch
  -f, --force     Force removal even if worktree has uncommitted changes
  -a, --all       Clean all merged/closed PR worktrees (non-interactive)
  -h, --help      Show this help message

${colors.bold('EXAMPLES')}
  cleanpr                    # Interactive mode - select worktrees to clean
  cleanpr 2245               # Remove worktree and local branch for PR #2245
  cleanpr 2245 --remote      # Also delete remote branch
  cleanpr 2245 -f -r         # Force cleanup and delete remote
  cleanpr --all              # Clean all merged/closed PRs

${colors.bold('WHAT IT REMOVES')}
  - Git worktree directory
  - Local branch associated with the PR
  - Remote branch (with --remote flag)
`);
}

/**
 * Extract PR number from worktree path if it matches pattern
 */
function extractPrNumber(
  worktreePath: string,
  config: ReturnType<typeof loadConfig>
): number | null {
  const name = path.basename(worktreePath);

  // Match patterns like "repo.pr123" or custom patterns
  const pattern = config.worktreePattern;
  if (pattern.includes('{number}')) {
    // Build regex from pattern
    const regexStr = pattern
      .replace('{repo}', '.*')
      .replace('{number}', '(\\d+)')
      .replace('.', '\\.');
    const match = name.match(new RegExp(regexStr));
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // Fallback: try common patterns
  const patterns = [
    /\.pr(\d+)$/, // repo.pr123
    /\.pr-(\d+)$/, // repo.pr-123
    /-pr(\d+)$/, // repo-pr123
    /_pr(\d+)$/, // repo_pr123
  ];

  for (const p of patterns) {
    const match = name.match(p);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Check if a worktree has uncommitted changes
 */
function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const status = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get PR state from GitHub
 */
async function getPrState(prNumber: number): Promise<'OPEN' | 'CLOSED' | 'MERGED' | 'UNKNOWN'> {
  try {
    const pr = await github.getPr(prNumber);
    if (!pr) {
      return 'UNKNOWN';
    }

    // pr.state is already 'OPEN' | 'CLOSED' | 'MERGED'
    return pr.state;
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Get detailed info about all PR worktrees
 */
async function getWorktreeInfoList(
  repoRoot: string,
  config: ReturnType<typeof loadConfig>
): Promise<WorktreeInfo[]> {
  const worktrees = await git.listWorktrees();
  const result: WorktreeInfo[] = [];

  for (const wt of worktrees) {
    const prNumber = extractPrNumber(wt.path, config);

    // Skip non-PR worktrees
    if (prNumber === null) {
      continue;
    }

    const prState = await getPrState(prNumber);
    const hasChanges = hasUncommittedChanges(wt.path);

    result.push({
      path: wt.path,
      branch: wt.branch,
      commit: wt.commit,
      prNumber,
      prState,
      hasChanges,
    });
  }

  return result;
}

/**
 * Remove a single worktree and its branch
 */
async function cleanWorktree(
  info: WorktreeInfo,
  repoRoot: string,
  options: CleanOptions
): Promise<boolean> {
  const prLabel = `PR #${info.prNumber}`;

  // Check for uncommitted changes
  if (info.hasChanges && !options.force) {
    console.log(colors.warning(`${prLabel}: Has uncommitted changes (use --force to override)`));
    return false;
  }

  try {
    // Remove worktree
    console.log(colors.info(`${prLabel}: Removing worktree...`));
    await git.removeWorktree(info.path, { force: options.force });
    console.log(colors.success(`${prLabel}: Worktree removed`));

    // Delete local branch
    if (info.branch) {
      console.log(colors.info(`${prLabel}: Deleting local branch ${info.branch}...`));
      try {
        execSync(`git branch -D "${info.branch}"`, {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        console.log(colors.success(`${prLabel}: Local branch deleted`));
      } catch {
        console.log(
          colors.warning(`${prLabel}: Could not delete local branch (may already be deleted)`)
        );
      }

      // Delete remote branch if requested
      if (options.deleteRemote) {
        console.log(colors.info(`${prLabel}: Deleting remote branch...`));
        try {
          execSync(`git push origin --delete "${info.branch}"`, {
            cwd: repoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          console.log(colors.success(`${prLabel}: Remote branch deleted`));
        } catch {
          console.log(
            colors.warning(`${prLabel}: Could not delete remote branch (may already be deleted)`)
          );
        }
      }
    }

    // Prune worktrees
    git.pruneWorktrees();

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(colors.error(`${prLabel}: Failed to clean - ${message}`));
    return false;
  }
}

/**
 * Interactive mode - let user select worktrees to clean
 */
async function interactiveClean(
  repoRoot: string,
  config: ReturnType<typeof loadConfig>,
  options: CleanOptions
): Promise<void> {
  console.log(colors.info('Scanning worktrees...'));

  const worktrees = await getWorktreeInfoList(repoRoot, config);

  if (worktrees.length === 0) {
    console.log(colors.info('No PR worktrees found.'));
    return;
  }

  // Group by status
  const merged = worktrees.filter((w) => w.prState === 'MERGED');
  const closed = worktrees.filter((w) => w.prState === 'CLOSED');
  const open = worktrees.filter((w) => w.prState === 'OPEN');
  const unknown = worktrees.filter((w) => w.prState === 'UNKNOWN');

  console.log('');
  console.log(colors.bold('PR Worktrees:'));
  console.log('');

  if (merged.length > 0) {
    console.log(colors.yellow(`  Merged (${merged.length}):`));
    for (const w of merged) {
      const changeIndicator = w.hasChanges ? colors.red(' [has changes]') : '';
      console.log(`    PR #${w.prNumber}: ${w.branch}${changeIndicator}`);
    }
  }

  if (closed.length > 0) {
    console.log(colors.red(`  Closed (${closed.length}):`));
    for (const w of closed) {
      const changeIndicator = w.hasChanges ? colors.red(' [has changes]') : '';
      console.log(`    PR #${w.prNumber}: ${w.branch}${changeIndicator}`);
    }
  }

  if (open.length > 0) {
    console.log(colors.green(`  Open (${open.length}):`));
    for (const w of open) {
      const changeIndicator = w.hasChanges ? colors.red(' [has changes]') : '';
      console.log(`    PR #${w.prNumber}: ${w.branch}${changeIndicator}`);
    }
  }

  if (unknown.length > 0) {
    console.log(colors.dim(`  Unknown (${unknown.length}):`));
    for (const w of unknown) {
      const changeIndicator = w.hasChanges ? colors.red(' [has changes]') : '';
      console.log(`    PR #${w.prNumber}: ${w.branch}${changeIndicator}`);
    }
  }

  console.log('');

  // Build cleanup options
  const cleanable = [...merged, ...closed];
  if (cleanable.length === 0) {
    console.log(colors.info('No merged or closed PRs to clean up.'));
    return;
  }

  const choices: prompts.PromptOption<string>[] = [
    {
      label: `Clean all merged/closed (${cleanable.length})`,
      value: 'all',
    },
  ];

  if (merged.length > 0) {
    choices.push({
      label: `Clean merged only (${merged.length})`,
      value: 'merged',
    });
  }

  choices.push({
    label: 'Select individually',
    value: 'select',
  });

  choices.push({
    label: 'Cancel',
    value: 'cancel',
  });

  const action = await prompts.promptChoice('What would you like to clean?', choices);

  if (action === 'cancel') {
    console.log(colors.info('Cancelled.'));
    return;
  }

  let toClean: WorktreeInfo[] = [];

  if (action === 'all') {
    toClean = cleanable;
  } else if (action === 'merged') {
    toClean = merged;
  } else if (action === 'select') {
    // Individual selection
    for (const w of cleanable) {
      const confirm = await prompts.promptConfirm(
        `Clean PR #${w.prNumber} (${w.prState.toLowerCase()})${w.hasChanges ? ' [has changes]' : ''}?`
      );
      if (confirm) {
        toClean.push(w);
      }
    }
  }

  if (toClean.length === 0) {
    console.log(colors.info('Nothing to clean.'));
    return;
  }

  // Ask about remote deletion
  if (!options.deleteRemote) {
    const deleteRemote = await prompts.promptConfirm('Also delete remote branches?');
    options.deleteRemote = deleteRemote;
  }

  console.log('');

  // Clean selected worktrees
  let cleaned = 0;
  for (const w of toClean) {
    if (await cleanWorktree(w, repoRoot, options)) {
      cleaned++;
    }
  }

  console.log('');
  console.log(colors.success(`Cleaned ${cleaned} of ${toClean.length} worktrees.`));
}

/**
 * Clean all merged/closed PRs automatically
 */
async function cleanAll(
  repoRoot: string,
  config: ReturnType<typeof loadConfig>,
  options: CleanOptions
): Promise<void> {
  console.log(colors.info('Scanning for merged/closed PR worktrees...'));

  const worktrees = await getWorktreeInfoList(repoRoot, config);
  const cleanable = worktrees.filter((w) => w.prState === 'MERGED' || w.prState === 'CLOSED');

  if (cleanable.length === 0) {
    console.log(colors.info('No merged or closed PR worktrees found.'));
    return;
  }

  console.log(colors.info(`Found ${cleanable.length} merged/closed PR worktrees.`));
  console.log('');

  let cleaned = 0;
  for (const w of cleanable) {
    if (await cleanWorktree(w, repoRoot, options)) {
      cleaned++;
    }
  }

  console.log('');
  console.log(colors.success(`Cleaned ${cleaned} of ${cleanable.length} worktrees.`));
}

/**
 * Clean a specific PR worktree
 */
async function cleanSpecific(
  prNumber: number,
  repoRoot: string,
  config: ReturnType<typeof loadConfig>,
  options: CleanOptions
): Promise<void> {
  const worktrees = await getWorktreeInfoList(repoRoot, config);
  const target = worktrees.find((w) => w.prNumber === prNumber);

  if (!target) {
    // Try to find by pattern
    const pattern = config.worktreePattern
      .replace('{repo}', path.basename(repoRoot))
      .replace('{number}', String(prNumber));
    const expectedPath = path.join(path.dirname(repoRoot), pattern);

    console.error(colors.error(`No worktree found for PR #${prNumber}`));
    console.error(colors.dim(`Expected at: ${expectedPath}`));
    process.exit(1);
  }

  console.log(colors.info(`Cleaning PR #${prNumber} worktree...`));
  console.log(colors.dim(`  Path: ${target.path}`));
  console.log(colors.dim(`  Branch: ${target.branch}`));
  console.log(colors.dim(`  State: ${target.prState}`));
  console.log('');

  if (await cleanWorktree(target, repoRoot, options)) {
    console.log('');
    console.log(colors.success(`PR #${prNumber} worktree cleaned up successfully.`));
  } else {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { prNumber, options } = parseArgs();

  // Check prerequisites
  if (!github.isGhInstalled()) {
    console.error(colors.error('GitHub CLI (gh) is required for PR status checking.'));
    console.error(colors.dim('Install: https://cli.github.com/'));
    process.exit(1);
  }

  // Find repo root
  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig(repoRoot);

  console.log('');

  if (prNumber !== null) {
    // Clean specific PR
    await cleanSpecific(prNumber, repoRoot, config, options);
  } else if (options.all) {
    // Clean all merged/closed
    await cleanAll(repoRoot, config, options);
  } else {
    // Interactive mode
    await interactiveClean(repoRoot, config, options);
  }
}

main().catch((err) => {
  console.error(colors.error(`Error: ${err.message}`));
  process.exit(1);
});
