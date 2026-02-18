/**
 * wt prs - Browse repository pull requests
 *
 * Lists all PRs with useful info including worktree status.
 * Uses the shared runPrsCommand from src/lib/prs/command.ts.
 */

import type { CommandModule } from 'yargs';
import { runPrsCommand } from '../../lib/prs/command.js';
import type { PrsCommandOptions } from '../../lib/prs/types.js';

interface PrsArgs {
  state?: 'open' | 'closed' | 'merged' | 'all';
  author?: string;
  label?: string[];
  draft?: boolean;
  'no-draft'?: boolean;
  'with-worktree'?: boolean;
  limit?: number;
  json?: boolean;
  interactive?: boolean;
  refresh?: boolean;
}

export const prsCommand: CommandModule<object, PrsArgs> = {
  command: ['prs', 'pr list'],
  describe: 'Browse repository pull requests',
  builder: (yargs) => {
    return yargs
      .option('state', {
        alias: 's',
        type: 'string',
        choices: ['open', 'closed', 'merged', 'all'] as const,
        description: 'Filter by PR state (default: open)',
      })
      .option('author', {
        alias: 'a',
        type: 'string',
        description: 'Filter by author (use @me for yourself)',
      })
      .option('label', {
        alias: 'l',
        type: 'array',
        string: true,
        description: 'Filter by label (can be repeated)',
      })
      .option('draft', {
        type: 'boolean',
        description: 'Show only draft PRs',
      })
      .option('no-draft', {
        type: 'boolean',
        description: 'Exclude draft PRs',
      })
      .option('with-worktree', {
        type: 'boolean',
        description: 'Show only PRs that have local worktrees',
      })
      .option('limit', {
        alias: 'n',
        type: 'number',
        description: 'Maximum PRs to fetch',
        default: 50,
      })
      .option('json', {
        alias: 'j',
        type: 'boolean',
        description: 'Output as JSON',
        default: false,
      })
      .option('interactive', {
        alias: 'i',
        type: 'boolean',
        description: 'Enable interactive mode (use --no-interactive to disable)',
        default: true,
      })
      .option('refresh', {
        alias: 'r',
        type: 'boolean',
        description: 'Force refresh from GitHub (bypass cache)',
        default: false,
      })
      .example('$0 prs', 'List open PRs (interactive)')
      .example('$0 prs --state=all', 'List all PRs')
      .example('$0 prs --author=@me', 'List your PRs')
      .example('$0 prs --label=preview', 'List PRs with preview label')
      .example('$0 prs --draft', 'List only draft PRs')
      .example('$0 prs --with-worktree', 'List PRs that have local worktrees')
      .example('$0 prs --json', 'JSON output for scripting');
  },
  handler: async (argv) => {
    const options: PrsCommandOptions = {
      state: (argv.state as 'open' | 'closed' | 'merged' | 'all') || 'open',
      author: argv.author,
      label: argv.label,
      draft: argv.draft,
      noDraft: argv['no-draft'],
      withWorktree: argv['with-worktree'],
      limit: argv.limit || 50,
      json: argv.json,
      noInteractive: argv.interactive === false,
      refresh: argv.refresh,
    };

    await runPrsCommand(options);
  },
};
