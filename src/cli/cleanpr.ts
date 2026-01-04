#!/usr/bin/env node
/**
 * cleanpr - Clean up PR worktrees after merge/close
 *
 * CLI thin wrapper - orchestration and side effects only
 */

import { execSync } from 'child_process';
import * as path from 'path';

import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as prompts from '../lib/prompts.js';
import * as colors from '../lib/colors.js';
import { loadConfig } from '../lib/config.js';
import {
  parseArgs,
  getHelpText,
  gatherPrWorktreeInfo,
  createDefaultDeps,
  groupWorktreesByState,
  getCleanableWorktrees,
  findWorktreeByPrNumber,
  cleanWorktree,
  summarizeResults,
} from '../lib/cleanpr/index.js';
import type {
  CleanOptions,
  WorktreeInfo,
  CleanupDeps,
  CleanupResult,
} from '../lib/cleanpr/index.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorCodeFromError,
  getErrorSuggestion,
  type CleanprResultData,
  type CleanprDryRunData,
  type CleanedWorktreeInfo,
} from '../lib/json-output.js';

/**
 * Create cleanup dependencies using real git operations
 */
function createCleanupDeps(repoRoot: string): CleanupDeps {
  return {
    removeWorktree: (wtPath: string, force: boolean) => {
      git.removeWorktree(wtPath, { force });
    },

    deleteLocalBranch: (branch: string): boolean => {
      try {
        execSync(`git branch -D "${branch}"`, {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return true;
      } catch {
        return false;
      }
    },

    deleteRemoteBranch: (branch: string): boolean => {
      try {
        execSync(`git push origin --delete "${branch}"`, {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return true;
      } catch {
        return false;
      }
    },

    pruneWorktrees: () => {
      git.pruneWorktrees();
    },
  };
}

/**
 * Print worktree with status indicator
 */
function printWorktree(w: WorktreeInfo): void {
  const changeIndicator = w.hasChanges ? colors.red(' [has changes]') : '';
  console.log(`    PR #${w.prNumber}: ${w.branch}${changeIndicator}`);
}

/**
 * Convert cleanup result to JSON-friendly format
 */
function resultToCleanedInfo(result: CleanupResult, worktree: WorktreeInfo): CleanedWorktreeInfo {
  return {
    prNumber: result.prNumber,
    branch: worktree.branch,
    path: worktree.path,
    prState: worktree.prState,
    localBranchDeleted: result.localBranchDeleted,
    remoteBranchDeleted: result.remoteBranchDeleted,
  };
}

/**
 * Output JSON result for cleanup operation
 */
function outputJsonResult(
  results: CleanupResult[],
  worktrees: WorktreeInfo[],
  dryRun: boolean
): void {
  // Create a map for quick lookup
  const worktreeMap = new Map(worktrees.map((w) => [w.prNumber, w]));

  if (dryRun) {
    const data: CleanprDryRunData = {
      wouldClean: results
        .filter((r) => r.success)
        .map((r) => {
          const w = worktreeMap.get(r.prNumber)!;
          return {
            prNumber: r.prNumber,
            branch: w.branch,
            path: w.path,
            prState: w.prState,
          };
        }),
      totalWouldClean: results.filter((r) => r.success).length,
    };
    console.log(formatJsonResult(createSuccessResult('cleanpr', data)));
  } else {
    const cleaned: CleanedWorktreeInfo[] = [];
    const skipped: Array<{ prNumber: number; reason: string }> = [];

    for (const result of results) {
      const w = worktreeMap.get(result.prNumber);
      if (!w) continue;

      if (result.success) {
        cleaned.push(resultToCleanedInfo(result, w));
      } else {
        skipped.push({ prNumber: result.prNumber, reason: result.message });
      }
    }

    const data: CleanprResultData = {
      cleaned,
      skipped,
      totalCleaned: cleaned.length,
      totalSkipped: skipped.length,
    };
    console.log(formatJsonResult(createSuccessResult('cleanpr', data)));
  }
}

/**
 * Output JSON error
 */
function outputJsonError(code: ErrorCode, message: string): void {
  console.log(formatJsonResult(createErrorResult('cleanpr', code, message)));
}

/**
 * Interactive mode - let user select worktrees to clean
 */
async function interactiveClean(
  worktrees: WorktreeInfo[],
  repoRoot: string,
  options: CleanOptions
): Promise<void> {
  if (worktrees.length === 0) {
    console.log(colors.info('No PR worktrees found.'));
    return;
  }

  const groups = groupWorktreesByState(worktrees);

  console.log('');
  console.log(colors.bold('PR Worktrees:'));
  console.log('');

  if (groups.merged.length > 0) {
    console.log(colors.yellow(`  Merged (${groups.merged.length}):`));
    groups.merged.forEach(printWorktree);
  }

  if (groups.closed.length > 0) {
    console.log(colors.red(`  Closed (${groups.closed.length}):`));
    groups.closed.forEach(printWorktree);
  }

  if (groups.open.length > 0) {
    console.log(colors.green(`  Open (${groups.open.length}):`));
    groups.open.forEach(printWorktree);
  }

  if (groups.unknown.length > 0) {
    console.log(colors.dim(`  Unknown (${groups.unknown.length}):`));
    groups.unknown.forEach(printWorktree);
  }

  console.log('');

  const cleanable = getCleanableWorktrees(worktrees);
  if (cleanable.length === 0) {
    console.log(colors.info('No merged or closed PRs to clean up.'));
    return;
  }

  const choices: prompts.PromptOption<string>[] = [
    { label: `Clean all merged/closed (${cleanable.length})`, value: 'all' },
  ];

  if (groups.merged.length > 0) {
    choices.push({ label: `Clean merged only (${groups.merged.length})`, value: 'merged' });
  }

  choices.push({ label: 'Select individually', value: 'select' });
  choices.push({ label: 'Cancel', value: 'cancel' });

  const action = await prompts.promptChoice('What would you like to clean?', choices);

  if (action === 'cancel') {
    console.log(colors.info('Cancelled.'));
    return;
  }

  let toClean: WorktreeInfo[] = [];

  if (action === 'all') {
    toClean = cleanable;
  } else if (action === 'merged') {
    toClean = groups.merged;
  } else if (action === 'select') {
    for (const w of cleanable) {
      const stateLabel = w.prState.toLowerCase();
      const changesLabel = w.hasChanges ? ' [has changes]' : '';
      const confirm = await prompts.promptConfirm(
        `Clean PR #${w.prNumber} (${stateLabel})${changesLabel}?`
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
    options.deleteRemote = await prompts.promptConfirm('Also delete remote branches?');
  }

  console.log('');

  const deps = createCleanupDeps(repoRoot);
  const results = toClean.map((w) => {
    const result = cleanWorktree(w, options, deps);
    if (result.success) {
      console.log(colors.success(result.message));
    } else {
      console.log(colors.warning(result.message));
    }
    return result;
  });

  const summary = summarizeResults(results);
  console.log('');
  console.log(colors.success(`Cleaned ${summary.cleaned} of ${summary.total} worktrees.`));
}

/**
 * Clean all merged/closed PRs automatically
 */
async function cleanAll(
  worktrees: WorktreeInfo[],
  repoRoot: string,
  options: CleanOptions
): Promise<void> {
  const cleanable = getCleanableWorktrees(worktrees);

  if (cleanable.length === 0) {
    if (options.json) {
      const data: CleanprResultData = {
        cleaned: [],
        skipped: [],
        totalCleaned: 0,
        totalSkipped: 0,
      };
      console.log(formatJsonResult(createSuccessResult('cleanpr', data)));
    } else {
      console.log(colors.info('No merged or closed PR worktrees found.'));
    }
    return;
  }

  if (!options.json) {
    console.log(colors.info(`Found ${cleanable.length} merged/closed PR worktrees.`));
    console.log('');
  }

  const deps = createCleanupDeps(repoRoot);
  const results = cleanable.map((w) => {
    const result = cleanWorktree(w, options, deps);
    if (!options.json) {
      if (result.success) {
        console.log(colors.success(result.message));
      } else {
        console.log(colors.warning(result.message));
      }
    }
    return result;
  });

  if (options.json) {
    outputJsonResult(results, cleanable, options.dryRun);
  } else {
    const summary = summarizeResults(results);
    console.log('');
    if (options.dryRun) {
      console.log(colors.info(`Would clean ${summary.cleaned} of ${summary.total} worktrees.`));
    } else {
      console.log(colors.success(`Cleaned ${summary.cleaned} of ${summary.total} worktrees.`));
    }
  }
}

/**
 * Clean a specific PR worktree
 */
async function cleanSpecific(
  prNumber: number,
  worktrees: WorktreeInfo[],
  repoRoot: string,
  config: ReturnType<typeof loadConfig>,
  options: CleanOptions
): Promise<void> {
  const target = findWorktreeByPrNumber(worktrees, prNumber);

  if (!target) {
    const pattern = config.worktreePattern
      .replace('{repo}', path.basename(repoRoot))
      .replace('{number}', String(prNumber));
    const expectedPath = path.join(path.dirname(repoRoot), pattern);

    if (options.json) {
      outputJsonError(ErrorCode.PR_NOT_FOUND, `No worktree found for PR #${prNumber}`);
    } else {
      console.error(colors.error(`No worktree found for PR #${prNumber}`));
      console.error(colors.dim(`Expected at: ${expectedPath}`));
    }
    process.exit(1);
  }

  if (!options.json) {
    console.log(colors.info(`Cleaning PR #${prNumber} worktree...`));
    console.log(colors.dim(`  Path: ${target.path}`));
    console.log(colors.dim(`  Branch: ${target.branch}`));
    console.log(colors.dim(`  State: ${target.prState}`));
    console.log('');
  }

  const deps = createCleanupDeps(repoRoot);
  const result = cleanWorktree(target, options, deps);

  if (options.json) {
    outputJsonResult([result], [target], options.dryRun);
  } else if (result.success) {
    console.log('');
    if (options.dryRun) {
      console.log(colors.info(result.message));
    } else {
      console.log(colors.success(`PR #${prNumber} worktree cleaned up successfully.`));
    }
  } else {
    console.log(colors.warning(result.message));
    process.exit(1);
  }
}

/**
 * Check if --json flag was passed (for error handling before parsing completes)
 */
function hasJsonFlag(args: string[]): boolean {
  return args.includes('--json');
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const useJson = hasJsonFlag(rawArgs);
  const parseResult = parseArgs(rawArgs);

  if (parseResult.kind === 'help') {
    console.log(getHelpText());
    process.exit(0);
  }

  if (parseResult.kind === 'error') {
    if (useJson) {
      outputJsonError(ErrorCode.INVALID_ARGUMENT, parseResult.message);
    } else {
      console.error(colors.error(parseResult.message));
    }
    process.exit(1);
  }

  const { prNumber, options } = parseResult;

  // Check prerequisites
  if (!github.isGhInstalled()) {
    if (options.json) {
      outputJsonError(
        ErrorCode.GH_NOT_INSTALLED,
        'GitHub CLI (gh) is required for PR status checking'
      );
    } else {
      console.error(colors.error('GitHub CLI (gh) is required for PR status checking.'));
      console.error(colors.dim('Install: https://cli.github.com/'));
    }
    process.exit(1);
  }

  // Find repo root
  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    if (options.json) {
      outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
    } else {
      console.error(colors.error('Not in a git repository.'));
    }
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig(repoRoot);

  if (!options.json) {
    console.log('');
    console.log(colors.info('Scanning worktrees...'));
  }

  // Gather worktree info
  const gatherDeps = createDefaultDeps();
  const worktrees = await gatherPrWorktreeInfo(repoRoot, config.worktreePattern, gatherDeps);

  if (prNumber !== null) {
    await cleanSpecific(prNumber, worktrees, repoRoot, config, options);
  } else if (options.all) {
    await cleanAll(worktrees, repoRoot, options);
  } else {
    // Interactive mode with JSON not supported
    if (options.json) {
      outputJsonError(
        ErrorCode.INVALID_ARGUMENT,
        'Interactive mode not supported with --json. Use --all or specify a PR number.'
      );
      process.exit(1);
    }
    await interactiveClean(worktrees, repoRoot, options);
  }
}

main().catch((err) => {
  const useJson = hasJsonFlag(process.argv.slice(2));
  const message = err instanceof Error ? err.message : String(err);
  const code = getErrorCodeFromError(err);
  const suggestion = getErrorSuggestion(code);

  if (useJson) {
    outputJsonError(code, message);
  } else {
    console.error(colors.error(`Error: ${message}`));
    if (suggestion) {
      console.error('');
      console.error(colors.dim(suggestion));
    }
  }
  process.exit(1);
});
