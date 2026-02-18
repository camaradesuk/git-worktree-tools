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
  'base-branch'?: string;
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
      .option('base-branch', {
        alias: 'b',
        type: 'string',
        description: 'Base branch to compare against (default: from .worktreerc or main)',
      })
      .example('$0 state', 'Show current worktree state')
      .example('$0 s -v', 'Verbose state output')
      .example('$0 state --json', 'JSON output for AI agents')
      .example('$0 state --base-branch develop', 'Compare against develop branch');
  },
  handler: (argv) => {
    const args: string[] = [];

    if (argv.verbose) {
      args.push('--verbose');
    }

    if (argv.json) {
      args.push('--json');
    }

    if (argv['base-branch']) {
      args.push('--base', argv['base-branch']);
    }

    runSubcommand('wtstate', args);
  },
};
