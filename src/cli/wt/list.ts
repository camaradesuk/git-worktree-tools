/**
 * wt list - List worktrees with PR status
 *
 * Direct library call handler - no subprocess spawning.
 * Calls gatherWorktreeInfo, printWorktreeTable, etc. in-process.
 */

import type { CommandModule } from 'yargs';
import {
  gatherWorktreeInfo,
  createDefaultDeps,
  formatJsonOutput,
  runInteractiveMode,
  printWorktreeTable,
} from '../../lib/lswt/index.js';
import * as git from '../../lib/git.js';
import * as github from '../../lib/github.js';
import {
  setJsonMode,
  printStatus,
  printDim,
  printError,
  errorToDisplay,
} from '../../lib/ui/index.js';
import {
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorSuggestion,
} from '../../lib/json-output.js';
import type { ListOptions } from '../../lib/lswt/index.js';

interface ListArgs {
  verbose?: boolean;
  json?: boolean;
  status?: boolean;
  interactive?: boolean;
  'no-interactive'?: boolean;
  quiet?: boolean;
  noColor?: boolean;
}

/**
 * Output error in JSON format for programmatic consumers
 */
function outputJsonError(code: ErrorCode, message: string): void {
  const result = createErrorResult('lswt', code, message, undefined, getErrorSuggestion(code));
  console.log(formatJsonResult(result));
}

export const listCommand: CommandModule<object, ListArgs> = {
  command: ['list', 'ls'],
  describe: 'List worktrees with PR status',
  builder: (yargs) => {
    return yargs
      .option('verbose', {
        type: 'boolean',
        description: 'Show full paths and commit hashes',
        default: false,
      })
      .option('json', {
        alias: 'j',
        type: 'boolean',
        description: 'Output as JSON',
        default: false,
      })
      .option('status', {
        alias: 's',
        type: 'boolean',
        description: 'Include PR status from GitHub (open/merged/closed)',
        default: false,
      })
      .option('interactive', {
        alias: 'i',
        type: 'boolean',
        description: 'Enable interactive mode (default in TTY)',
      })
      .option('no-interactive', {
        type: 'boolean',
        description: 'Disable interactive mode',
        default: false,
      })
      .example('$0 list', 'List all worktrees (interactive in terminal)')
      .example('$0 ls --verbose', 'Verbose output with full paths')
      .example('$0 list --json', 'JSON output for scripting')
      .example('$0 ls --status', 'Include PR status from GitHub')
      .example('$0 ls --no-interactive', 'Non-interactive (no menu)');
  },
  handler: async (argv) => {
    const options: ListOptions = {
      verbose: !!argv.verbose,
      json: !!argv.json,
      showStatus: !!argv.status,
      interactive: argv.interactive,
      noColor: !!argv.noColor,
      quiet: !!argv.quiet,
    };

    setJsonMode(options.json);

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

    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('not a git repository')) {
        if (options.json) {
          outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not a git repository');
        } else {
          printError({
            title: 'Not a git repository',
            hint: 'Run this command from within a git repository.',
          });
        }
      } else {
        if (options.json) {
          outputJsonError(ErrorCode.UNKNOWN_ERROR, message);
        } else {
          const display = errorToDisplay(error);
          printError(display);
        }
      }
      process.exit(1);
    }
  },
};
