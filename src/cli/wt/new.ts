/**
 * wt new - Create a new PR with worktree
 *
 * Wraps the newpr CLI tool functionality
 */

import type { CommandModule } from 'yargs';
import { runSubcommand } from './run-command.js';

interface NewArgs {
  description?: string;
  pr?: number;
  branch?: string;
  base?: string;
  install?: boolean;
  code?: boolean;
  ready?: boolean;
  'no-wtlink'?: boolean;
  'no-hooks'?: boolean;
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
      .option('branch', {
        alias: 'B',
        type: 'string',
        description: 'Create PR for existing branch',
      })
      .option('base', {
        alias: 'b',
        type: 'string',
        description: 'Base branch for PR (default: main)',
      })
      .option('install', {
        alias: 'i',
        type: 'boolean',
        description: 'Install dependencies after setup',
        default: false,
      })
      .option('code', {
        alias: 'c',
        type: 'boolean',
        description: 'Open editor to the new worktree',
        default: false,
      })
      .option('ready', {
        alias: 'r',
        type: 'boolean',
        description: 'Create PR as ready for review (default: draft)',
        default: false,
      })
      .option('no-wtlink', {
        type: 'boolean',
        description: 'Skip wtlink config sync',
        default: false,
      })
      .option('no-hooks', {
        type: 'boolean',
        description: 'Disable lifecycle hooks',
        default: false,
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
      .example('$0 new --branch feat/my-feature', 'Create PR for existing branch')
      .example('$0 new "Feature" --ready', 'Create as ready (not draft) PR');
  },
  handler: (argv) => {
    const args: string[] = [];

    if (argv.description) {
      args.push(argv.description);
    }

    if (argv.pr !== undefined) {
      args.push('--pr', String(argv.pr));
    }

    if (argv.branch) {
      args.push('--branch', argv.branch);
    }

    if (argv.base) {
      args.push('--base', argv.base);
    }

    if (argv.install) {
      args.push('--install');
    }

    if (argv.code) {
      args.push('--code');
    }

    if (argv.ready) {
      args.push('--ready');
    }

    if (argv['no-wtlink']) {
      args.push('--no-wtlink');
    }

    if (argv['no-hooks']) {
      args.push('--no-hooks');
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

    runSubcommand('newpr', args);
  },
};
