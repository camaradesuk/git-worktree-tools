/**
 * wt clean - Clean up merged/closed PR worktrees
 *
 * Wraps the cleanpr CLI tool functionality
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CommandModule } from 'yargs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CleanArgs {
  prNumber?: number;
  all?: boolean;
  'dry-run'?: boolean;
  force?: boolean;
  json?: boolean;
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
        alias: 'd',
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
      .option('json', {
        type: 'boolean',
        description: 'Output result as JSON',
        default: false,
      })
      .example('$0 clean', 'Interactive cleanup')
      .example('$0 c --all', 'Clean all merged/closed PRs')
      .example('$0 clean 42', 'Clean worktree for PR #42')
      .example('$0 clean --dry-run', 'Preview what would be cleaned');
  },
  handler: (argv) => {
    // Build args array for cleanpr
    const args: string[] = [];

    if (argv.prNumber !== undefined) {
      args.push(String(argv.prNumber));
    }

    if (argv.all) {
      args.push('--all');
    }

    if (argv['dry-run']) {
      args.push('--dry-run');
    }

    if (argv.force) {
      args.push('--force');
    }

    if (argv.json) {
      args.push('--json');
    }

    // Spawn cleanpr with inherited stdio
    const cleanprPath = path.resolve(__dirname, '../cleanpr.js');
    const result = spawnSync(process.execPath, [cleanprPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    process.exit(result.status ?? 1);
  },
};
