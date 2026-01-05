/**
 * wt list - List worktrees with PR status
 *
 * Wraps the lswt CLI tool functionality
 */

import type { CommandModule } from 'yargs';
import { runSubcommand } from './run-command.js';

interface ListArgs {
  verbose?: boolean;
  json?: boolean;
  status?: boolean;
  interactive?: boolean;
  'no-interactive'?: boolean;
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
  handler: (argv) => {
    const args: string[] = [];

    if (argv.verbose) {
      args.push('--verbose');
    }

    if (argv.json) {
      args.push('--json');
    }

    if (argv.status) {
      args.push('--status');
    }

    if (argv.interactive) {
      args.push('--interactive');
    }

    if (argv['no-interactive']) {
      args.push('--no-interactive');
    }

    runSubcommand('lswt', args);
  },
};
