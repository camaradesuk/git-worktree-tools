/**
 * wt state - Query git worktree state
 *
 * Wraps the wtstate CLI tool functionality
 */

import type { CommandModule } from 'yargs';
import { runSubcommand } from './run-command.js';

interface StateArgs {
  verbose?: boolean;
  json?: boolean;
}

export const stateCommand: CommandModule<object, StateArgs> = {
  command: ['state', 's'],
  describe: 'Query git worktree state for AI agents',
  builder: (yargs) => {
    return yargs
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Show detailed state information',
        default: false,
      })
      .option('json', {
        type: 'boolean',
        description: 'Output as JSON (for AI/automation)',
        default: false,
      })
      .example('$0 state', 'Show current worktree state')
      .example('$0 s -v', 'Verbose state output')
      .example('$0 state --json', 'JSON output for AI agents');
  },
  handler: (argv) => {
    const args: string[] = [];

    if (argv.verbose) {
      args.push('--verbose');
    }

    if (argv.json) {
      args.push('--json');
    }

    runSubcommand('wtstate', args);
  },
};
