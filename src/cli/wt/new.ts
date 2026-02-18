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
  draft?: boolean;
  'no-wtlink'?: boolean;
  'no-hooks'?: boolean;
  'confirm-hooks'?: boolean;
  plan?: boolean;
  'no-plan'?: boolean;
  json?: boolean;
  'non-interactive'?: boolean;
  action?: string;
  verbose?: number | boolean;
  quiet?: boolean;
  noColor?: boolean;
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
      .option('draft', {
        alias: 'd',
        type: 'boolean',
        description: 'Create PR as draft',
      })
      .option('no-wtlink', {
        type: 'boolean',
        description: 'Skip wtlink config sync',
        default: false,
      })
      .option('no-hooks', {
        type: 'boolean',
        description: 'Disable lifecycle hooks (for security)',
        default: false,
      })
      .option('confirm-hooks', {
        type: 'boolean',
        description: 'Prompt before running post-* hooks',
        default: false,
      })
      .option('plan', {
        type: 'boolean',
        description: 'Generate AI plan document for the PR',
      })
      .option('no-plan', {
        type: 'boolean',
        description: 'Skip plan generation even if configured',
      })
      .option('json', {
        type: 'boolean',
        description: 'Output result as JSON',
        default: false,
      })
      .option('non-interactive', {
        alias: ['n', 'y', 'yes'],
        type: 'boolean',
        description: 'Run without prompts (requires explicit options)',
        default: false,
      })
      .option('action', {
        alias: 'a',
        type: 'string',
        description: 'Action to take (for non-interactive mode)',
        choices: [
          'empty_commit',
          'commit_staged',
          'commit_all',
          'stash_and_empty',
          'use_commits',
          'push_then_branch',
          'use_commits_and_commit_all',
          'use_commits_and_stash',
          'create_pr_for_branch',
          'pr_for_branch_commit_all',
          'pr_for_branch_stash',
          'branch_from_detached',
        ],
      })
      .example('$0 new "Add dark mode"', 'Create a new PR')
      .example('$0 n "Fix bug #123"', 'Short alias')
      .example('$0 new --pr 42', 'Create worktree for existing PR #42')
      .example('$0 new --branch feat/my-feature', 'Create PR for existing branch')
      .example('$0 new "Feature" --ready', 'Create as ready (not draft) PR')
      .example('$0 new "Feature" --draft', 'Create as draft PR')
      .example('$0 new "Fix" --non-interactive --json', 'Automation mode')
      .example('$0 new "Fix" -y --action=commit_staged', 'Non-interactive with explicit action');
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

    if (argv.draft) {
      args.push('--draft');
    }

    if (argv['no-wtlink']) {
      args.push('--no-wtlink');
    }

    if (argv['no-hooks']) {
      args.push('--no-hooks');
    }

    if (argv['confirm-hooks']) {
      args.push('--confirm-hooks');
    }

    if (argv.plan) {
      args.push('--plan');
    }

    if (argv['no-plan']) {
      args.push('--no-plan');
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

    // Forward global logging flags to child process
    if (argv.verbose) {
      args.push('--verbose');
    }
    if (argv.quiet) {
      args.push('--quiet');
    }
    if (argv.noColor) {
      args.push('--no-color');
    }

    // Belt-and-suspenders: also set env vars for child process
    const envOverrides: Record<string, string> = {};
    if (argv.verbose) {
      envOverrides.GWT_LOG_LEVEL = 'debug';
    }
    if (argv.quiet) {
      envOverrides.GWT_LOG_LEVEL = 'error';
    }
    if (argv.noColor) {
      envOverrides.NO_COLOR = '1';
    }

    runSubcommand('newpr', args, envOverrides);
  },
};
