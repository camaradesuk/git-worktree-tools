#!/usr/bin/env node
/**
 * lswt - List git worktrees with PR status
 *
 * CLI thin wrapper - orchestration and side effects only
 */

import * as path from 'path';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as colors from '../lib/colors.js';
import { setColorEnabled } from '../lib/colors.js';
import { initializeLogger } from '../lib/logger.js';
import {
  parseArgs,
  getHelpText,
  formatTypeLabel,
  getDisplayPath,
  formatJsonOutput,
  gatherWorktreeInfo,
  createDefaultDeps,
  runInteractiveMode,
} from '../lib/lswt/index.js';
import {
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorSuggestion,
} from '../lib/json-output.js';
import type { WorktreeDisplay, ListOptions } from '../lib/lswt/index.js';
import {
  printTable as sharedPrintTable,
  printStatus,
  printError,
  errorToDisplay,
  setJsonMode,
  changeIndicator,
} from '../lib/ui/index.js';

/**
 * Check if --json flag is present in args (for early error handling)
 */
function hasJsonFlag(args: string[]): boolean {
  return args.includes('--json');
}

/**
 * Output error in JSON format for programmatic consumers
 */
function outputJsonError(code: ErrorCode, message: string): void {
  const result = createErrorResult('lswt', code, message, undefined, getErrorSuggestion(code));
  console.log(formatJsonResult(result));
}

const colorMap = {
  cyan: colors.cyan,
  green: colors.green,
  yellow: colors.yellow,
  red: colors.red,
  blue: colors.blue,
  dim: colors.dim,
} as const;

function printTable(worktrees: WorktreeDisplay[], options: ListOptions, cwd: string): void {
  if (worktrees.length === 0) {
    console.log(colors.info('No worktrees found.'));
    return;
  }

  const repoName = path.basename(worktrees[0].path.replace(/\.pr\d+$/, ''));
  console.log('');
  console.log(colors.bold(`${repoName} worktrees:`));
  console.log('');

  for (const wt of worktrees) {
    const { text, color } = formatTypeLabel(wt);
    const typeLabel = colorMap[color](text);
    const changeIndicator = wt.hasChanges ? colors.red(' *') : '';

    console.log(`  ${typeLabel}${changeIndicator}`);
    console.log(`    Branch: ${wt.branch || colors.dim('(detached)')}`);

    const displayPath = getDisplayPath(wt.path, cwd, options.verbose);
    console.log(`    Path:   ${displayPath}`);

    if (options.verbose) {
      console.log(`    Commit: ${colors.dim(wt.commit)}`);
    }
    console.log('');
  }

  // Summary
  const prCount = worktrees.filter((w) => w.type === 'pr').length;
  const openCount = worktrees.filter((w) => w.prState === 'OPEN').length;
  const changesCount = worktrees.filter((w) => w.hasChanges).length;

  const parts: string[] = [`${worktrees.length} worktrees`];
  if (prCount > 0) parts.push(`${prCount} PRs`);
  if (openCount > 0) parts.push(`${openCount} open`);
  if (changesCount > 0) parts.push(colors.red(`${changesCount} with changes`));

  console.log(colors.dim(parts.join(' · ')));
  console.log('');
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const jsonMode = hasJsonFlag(rawArgs);
  const result = parseArgs(rawArgs);

  if (result.kind === 'help') {
    console.log(getHelpText());
    process.exit(0);
  }

  if (result.kind === 'error') {
    if (jsonMode) {
      outputJsonError(ErrorCode.INVALID_ARGUMENT, result.message);
    } else {
      console.error(colors.error(result.message));
    }
    process.exit(1);
  }

  const options = result.options;

  // Initialize logger
  initializeLogger({
    verbose: options.verbose,
    quiet: options.quiet,
    noColor: options.noColor,
    json: options.json,
    commandName: 'lswt',
  });
  setJsonMode(options.json);
  if (options.noColor) {
    setColorEnabled(false);
  }

  // Check for gh cli if status requested
  if (options.showStatus && !github.isGhInstalled()) {
    if (!options.json) {
      console.error(colors.warning('GitHub CLI (gh) not installed. PR status will not be shown.'));
      console.error(colors.dim('Install: https://cli.github.com/'));
    }
    options.showStatus = false;
  }

  // Find repo root
  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    if (options.json) {
      outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not a git repository');
    } else {
      console.error(colors.error('Not a git repository.'));
      console.error(colors.dim('Run this command from within a git repository.'));
    }
    process.exit(1);
  }

  // Gather worktree info
  const deps = createDefaultDeps();
  const worktrees = await gatherWorktreeInfo(repoRoot, options, deps);

  // Determine if we should use interactive mode
  // Default to interactive if TTY and not explicitly disabled, and not JSON output
  const useInteractive =
    options.interactive === true ||
    (options.interactive === undefined && process.stdout.isTTY && !options.json);

  // Output
  if (options.json) {
    console.log(formatJsonOutput(worktrees));
  } else if (useInteractive) {
    await runInteractiveMode(worktrees, options);
  } else {
    printTable(worktrees, options, process.cwd());
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const jsonMode = hasJsonFlag(process.argv.slice(2));

  // Provide friendly message for common errors
  if (message.includes('not a git repository')) {
    if (jsonMode) {
      outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not a git repository');
    } else {
      console.error(colors.error('Not a git repository'));
      console.error(colors.dim('Run this command from within a git repository.'));
    }
  } else {
    if (jsonMode) {
      outputJsonError(ErrorCode.UNKNOWN_ERROR, message);
    } else {
      console.error(colors.error(`Error: ${message}`));
    }
  }
  process.exit(1);
});
