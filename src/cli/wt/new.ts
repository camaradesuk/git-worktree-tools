/**
 * wt new - Create a new PR with worktree
 *
 * Wraps the newpr CLI tool functionality
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CommandModule } from 'yargs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface NewArgs {
  description?: string;
  pr?: number;
  draft?: boolean;
  json?: boolean;
  'non-interactive'?: boolean;
  action?: string;
  'stash-untracked'?: boolean;
}

export const newCommand: CommandModule<object, NewArgs> = {
  command: ['new [description]', 'n'],
  describe: 'Create a new PR with a dedicated worktree',
  builder: (yargs) => {
    return yargs
      .positional('description', {
        describe: 'PR description/title',
        type: 'string',
      })
      .option('pr', {
        alias: 'p',
        type: 'number',
        description: 'Existing PR number to create worktree for',
      })
      .option('draft', {
        alias: 'd',
        type: 'boolean',
        description: 'Create as draft PR',
      })
      .option('json', {
        type: 'boolean',
        description: 'Output result as JSON',
        default: false,
      })
      .option('non-interactive', {
        alias: 'n',
        type: 'boolean',
        description: 'Run without prompts (requires explicit options)',
        default: false,
      })
      .option('action', {
        alias: 'a',
        type: 'string',
        description: 'Action to take (for non-interactive mode)',
      })
      .option('stash-untracked', {
        type: 'boolean',
        description: 'Also stash untracked files when stashing',
        default: false,
      })
      .example('$0 new "Add dark mode"', 'Create a new PR')
      .example('$0 n "Fix bug #123"', 'Short alias')
      .example('$0 new --pr 42', 'Create worktree for existing PR #42')
      .example('$0 new "WIP" --draft', 'Create as draft PR');
  },
  handler: (argv) => {
    // Build args array for newpr
    const args: string[] = [];

    if (argv.description) {
      args.push(argv.description);
    }

    if (argv.pr !== undefined) {
      args.push('--pr', String(argv.pr));
    }

    if (argv.draft) {
      args.push('--draft');
    }

    if (argv.json) {
      args.push('--json');
    }

    if (argv['non-interactive']) {
      args.push('--non-interactive');
    }

    if (argv.action) {
      args.push('--action', argv.action);
    }

    if (argv['stash-untracked']) {
      args.push('--stash-untracked');
    }

    // Spawn newpr with inherited stdio
    const newprPath = path.resolve(__dirname, '../newpr.js');
    const result = spawnSync(process.execPath, [newprPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    process.exit(result.status ?? 1);
  },
};
