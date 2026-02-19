#!/usr/bin/env node
/**
 * lswt - List git worktrees with PR status
 *
 * CLI thin wrapper - orchestration and side effects only
 */

import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import { setColorEnabled } from '../lib/colors.js';
import { initializeLogger } from '../lib/logger.js';
import {
  parseArgs,
  getHelpText,
  formatJsonOutput,
  gatherWorktreeInfo,
  createDefaultDeps,
  runInteractiveMode,
  printWorktreeTable,
} from '../lib/lswt/index.js';
import {
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorSuggestion,
} from '../lib/json-output.js';
import { printStatus, printDim, printError, errorToDisplay, setJsonMode } from '../lib/ui/index.js';

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
      printError({ title: result.message });
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
      printStatus('warning', 'GitHub CLI (gh) not installed. PR status will not be shown.');
      printDim('Install: https://cli.github.com/');
    }
    options.showStatus = false;
  }

  // Find repo root
  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    if (options.json) {
      outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not a git repository');
    } else {
      printError({
        title: 'Not a git repository.',
        hint: 'Run this command from within a git repository.',
      });
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
    printWorktreeTable(worktrees, options, process.cwd());
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
      printError({
        title: 'Not a git repository',
        hint: 'Run this command from within a git repository.',
      });
    }
  } else {
    if (jsonMode) {
      outputJsonError(ErrorCode.UNKNOWN_ERROR, message);
    } else {
      const display = errorToDisplay(err);
      printError(display);
    }
  }
  process.exit(1);
});
