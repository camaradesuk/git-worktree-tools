/**
 * wt state - Query git worktree state
 *
 * Wraps the wtstate CLI tool functionality
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CommandModule } from 'yargs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    // Build args array for wtstate
    const args: string[] = [];

    if (argv.verbose) {
      args.push('--verbose');
    }

    if (argv.json) {
      args.push('--json');
    }

    // Spawn wtstate with inherited stdio
    const wtstatePath = path.resolve(__dirname, '../wtstate.js');
    const result = spawnSync(process.execPath, [wtstatePath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    process.exit(result.status ?? 1);
  },
};
