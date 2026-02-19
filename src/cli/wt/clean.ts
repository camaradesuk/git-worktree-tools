/**
 * wt clean - Clean up merged/closed PR worktrees
 *
 * Direct library call handler - no subprocess spawning.
 * Calls gatherPrWorktreeInfo, cleanWorktree, etc. in-process.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import type { CommandModule } from 'yargs';
import * as git from '../../lib/git.js';
import * as github from '../../lib/github.js';
import * as prompts from '../../lib/prompts.js';
import { withSpinner } from '../../lib/prompts.js';
import * as colors from '../../lib/colors.js';
import { logger } from '../../lib/logger.js';
import { loadConfig } from '../../lib/config.js';
import {
  gatherPrWorktreeInfo,
  createDefaultDeps,
  groupWorktreesByState,
  getCleanableWorktrees,
  findWorktreeByPrNumber,
  cleanWorktree,
  summarizeResults,
} from '../../lib/cleanpr/index.js';
import type {
  CleanOptions,
  WorktreeInfo,
  CleanupDeps,
  CleanupResult,
} from '../../lib/cleanpr/index.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorCodeFromError,
  type CleanprResultData,
  type CleanprDryRunData,
  type CleanedWorktreeInfo,
} from '../../lib/json-output.js';
import {
  printStatus,
  printHeader,
  printDim,
  printNextSteps,
  printError,
  errorToDisplay,
  setJsonMode,
  changeIndicator,
} from '../../lib/ui/index.js';

interface CleanArgs {
  prNumber?: number;
  all?: boolean;
  'dry-run'?: boolean;
  force?: boolean;
  'delete-remote'?: boolean;
  json?: boolean;
  verbose?: number | boolean;
  quiet?: boolean;
  noColor?: boolean;
}

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
  const ci = changeIndicator(w.hasChanges);
  console.log(`    PR #${w.prNumber}: ${w.branch}${ci}`);
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
  const worktreeMap = new Map(worktrees.map((w) => [w.prNumber, w]));

  if (dryRun) {
    const wouldCleanCount = results.filter((r) => r.success).length;
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
      totalWouldClean: wouldCleanCount,
      message:
        wouldCleanCount === 0
          ? 'No PR worktrees would be cleaned.'
          : `Would clean ${wouldCleanCount} PR worktree${wouldCleanCount === 1 ? '' : 's'}.`,
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
      message:
        cleaned.length === 0 && skipped.length === 0
          ? 'No PR worktrees were cleaned.'
          : `Cleaned ${cleaned.length} PR worktree${cleaned.length === 1 ? '' : 's'}${skipped.length > 0 ? `, skipped ${skipped.length}` : ''}.`,
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
    printStatus('info', 'No PR worktrees found.');
    return;
  }

  const groups = groupWorktreesByState(worktrees);

  printHeader('PR Worktrees:');

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
    printStatus('info', 'No merged or closed PRs to clean up.');
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
    printStatus('info', 'Cancelled.');
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
    printStatus('info', 'Nothing to clean.');
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
      printStatus('success', result.message);
    } else {
      printStatus('warning', result.message);
    }
    return result;
  });

  const summary = summarizeResults(results);
  console.log('');
  printStatus('success', `Cleaned ${summary.cleaned} of ${summary.total} worktrees.`);
  if (summary.cleaned > 0) {
    printNextSteps([
      { command: 'wt list', description: 'List remaining worktrees' },
      { command: 'wt new "feature description"', description: 'Create a new PR' },
    ]);
  }
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
        message: 'No merged or closed PR worktrees to clean.',
      };
      console.log(formatJsonResult(createSuccessResult('cleanpr', data)));
    } else {
      printStatus('info', 'No merged or closed PR worktrees to clean.');
    }
    return;
  }

  if (!options.json) {
    printStatus('info', `Found ${cleanable.length} merged/closed PR worktrees.`);
    console.log('');
  }

  const deps = createCleanupDeps(repoRoot);
  const results = cleanable.map((w) => {
    const result = cleanWorktree(w, options, deps);
    if (!options.json) {
      if (result.success) {
        printStatus('success', result.message);
      } else {
        printStatus('warning', result.message);
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
      printStatus('info', `Would clean ${summary.cleaned} of ${summary.total} worktrees.`);
    } else {
      printStatus('success', `Cleaned ${summary.cleaned} of ${summary.total} worktrees.`);
      if (summary.cleaned > 0) {
        printNextSteps([
          { command: 'wt list', description: 'List remaining worktrees' },
          { command: 'wt new "feature description"', description: 'Create a new PR' },
        ]);
      }
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
      printError({
        title: `No worktree found for PR #${prNumber}`,
        detail: `Expected at: ${expectedPath}`,
        hint: 'Run "wt list" to see available worktrees.',
      });
    }
    process.exit(1);
  }

  if (!options.json) {
    printStatus('info', `Cleaning PR #${prNumber} worktree...`);
    printDim(`  Path: ${target.path}`);
    printDim(`  Branch: ${target.branch}`);
    printDim(`  State: ${target.prState}`);
    console.log('');
  }

  const deps = createCleanupDeps(repoRoot);
  const result = cleanWorktree(target, options, deps);

  if (options.json) {
    outputJsonResult([result], [target], options.dryRun);
  } else if (result.success) {
    console.log('');
    if (options.dryRun) {
      printStatus('info', result.message);
    } else {
      printStatus('success', `PR #${prNumber} worktree cleaned up successfully.`);
      printNextSteps([
        { command: 'wt list', description: 'List remaining worktrees' },
        { command: 'wt clean --all', description: 'Clean all merged/closed PRs' },
        { command: 'wt new "feature description"', description: 'Create a new PR' },
      ]);
    }
  } else {
    printStatus('warning', result.message);
    process.exit(1);
  }
}

export const cleanCommand: CommandModule<object, CleanArgs> = {
  command: ['clean [pr-number]', 'c'],
  describe: 'Clean up merged/closed PR worktrees',
  builder: (yargs) => {
    return yargs
      .positional('pr-number', {
        describe: 'Specific PR number to clean',
        type: 'number',
      })
      .option('all', {
        alias: 'a',
        type: 'boolean',
        description: 'Clean all merged/closed worktrees without prompting',
        default: false,
      })
      .option('dry-run', {
        alias: 'n',
        type: 'boolean',
        description: 'Show what would be cleaned without making changes',
        default: false,
      })
      .option('force', {
        alias: 'f',
        type: 'boolean',
        description: 'Force cleanup even with uncommitted changes',
        default: false,
      })
      .option('delete-remote', {
        alias: 'r',
        type: 'boolean',
        description: 'Delete remote branches after cleaning worktree',
        default: false,
      })
      .option('json', {
        type: 'boolean',
        description: 'Output result as JSON',
        default: false,
      })
      .example('$0 clean', 'Interactive cleanup')
      .example('$0 c --all', 'Clean all merged/closed PRs')
      .example('$0 clean 42', 'Clean worktree for PR #42')
      .example('$0 clean 42 --delete-remote', 'Also delete remote branch')
      .example('$0 clean --dry-run', 'Preview what would be cleaned');
  },
  handler: async (argv) => {
    const options: CleanOptions = {
      all: !!argv.all,
      dryRun: !!argv['dry-run'],
      force: !!argv.force,
      deleteRemote: !!argv['delete-remote'],
      json: !!argv.json,
      interactive: !argv.all && argv.prNumber === undefined,
      verbose: !!argv.verbose,
      quiet: !!argv.quiet,
      noColor: !!argv.noColor,
    };

    setJsonMode(options.json);

    // Check prerequisites
    if (!github.isGhInstalled()) {
      if (options.json) {
        outputJsonError(
          ErrorCode.GH_NOT_INSTALLED,
          'GitHub CLI (gh) is required for PR status checking'
        );
      } else {
        printError({
          title: 'GitHub CLI (gh) is required for PR status checking.',
          hint: 'Install: https://cli.github.com/',
        });
      }
      process.exit(1);
    }

    // Find repo root
    const repoRoot = git.getRepoRoot();
    if (!repoRoot) {
      if (options.json) {
        outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
      } else {
        printError({
          title: 'Not in a git repository.',
          hint: 'Run this command from within a git repository.',
        });
      }
      process.exit(1);
    }

    // Load configuration
    const config = loadConfig(repoRoot);
    logger.debug('Scanning worktrees', { repoRoot, pattern: config.worktreePattern });

    // Gather worktree info
    const gatherDeps = createDefaultDeps();
    let worktrees: WorktreeInfo[];
    if (options.json) {
      worktrees = await gatherPrWorktreeInfo(repoRoot, config.worktreePattern, gatherDeps);
    } else {
      console.log('');
      worktrees = await withSpinner('Scanning worktrees...', async () => {
        return await gatherPrWorktreeInfo(repoRoot, config.worktreePattern, gatherDeps);
      });
    }

    logger.debug('Found worktrees', { count: worktrees.length });

    if (argv.prNumber !== undefined) {
      await cleanSpecific(argv.prNumber, worktrees, repoRoot, config, options);
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
  },
};
