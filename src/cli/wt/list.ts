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
  'no-status'?: boolean;
  'no-interactive'?: boolean;
  filter?: string;
}

export const listCommand: CommandModule<object, ListArgs> = {
  command: ['list', 'ls'],
  describe: 'List worktrees with PR status',
  builder: (yargs) => {
    return yargs
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Show full paths and commit hashes',
        default: false,
      })
      .option('json', {
        type: 'boolean',
        description: 'Output as JSON',
        default: false,
      })
      .option('no-status', {
        alias: 's',
        type: 'boolean',
        description: 'Skip GitHub PR status lookup',
        default: false,
      })
      .option('no-interactive', {
        alias: 'n',
        type: 'boolean',
        description: 'Disable interactive mode',
        default: false,
      })
      .option('filter', {
        alias: 'f',
        type: 'string',
        description: 'Filter worktrees by type (pr, main, feature)',
      })
      .example('$0 list', 'List all worktrees')
      .example('$0 ls -v', 'Verbose output with full paths')
      .example('$0 list --json', 'JSON output for scripting')
      .example('$0 ls -n', 'Non-interactive (no menu)');
  },
  handler: (argv) => {
    const args: string[] = [];

    if (argv.verbose) {
      args.push('--verbose');
    }

    if (argv.json) {
      args.push('--json');
    }

    if (argv['no-status']) {
      args.push('--no-status');
    }

    if (argv['no-interactive']) {
      args.push('--no-interactive');
    }

    if (argv.filter) {
      args.push('--filter', argv.filter);
    }

    runSubcommand('lswt', args);
  },
};
