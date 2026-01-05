/**
 * wt link - Manage config file linking between worktrees
 *
 * Wraps the wtlink CLI tool functionality
 */

import type { CommandModule } from 'yargs';
import { runSubcommand } from './run-command.js';

interface LinkArgs {
  subcommand?: string;
  args?: string[];
}

export const linkCommand: CommandModule<object, LinkArgs> = {
  command: ['link [subcommand] [args..]', 'l'],
  describe: 'Manage config file linking between worktrees',
  builder: (yargs) => {
    return yargs
      .positional('subcommand', {
        describe: 'Subcommand: manage, link, validate (or omit for menu)',
        type: 'string',
      })
      .positional('args', {
        describe: 'Additional arguments for the subcommand',
        type: 'string',
        array: true,
      })
      .option('manifest-file', {
        type: 'string',
        description: 'Name of manifest file (default: .wtlinkrc)',
      })
      .option('json', {
        type: 'boolean',
        description: 'Output result as JSON',
        default: false,
      })
      .option('dry-run', {
        alias: 'd',
        type: 'boolean',
        description: 'Show what would happen without making changes',
        default: false,
      })
      .option('non-interactive', {
        alias: 'n',
        type: 'boolean',
        description: 'Run without prompts',
        default: false,
      })
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Show full file list instead of summary',
        default: false,
      })
      .option('yes', {
        alias: 'y',
        type: 'boolean',
        description: 'Skip confirmation prompts',
        default: false,
      })
      .example('$0 link', 'Show interactive menu')
      .example('$0 l manage', 'Manage manifest entries')
      .example('$0 link link . ../repo.pr42', 'Link configs to worktree')
      .example('$0 link validate', 'Validate manifest entries');
  },
  handler: (argv) => {
    const args: string[] = [];

    if (argv.subcommand) {
      args.push(argv.subcommand);
    }

    if (argv.args && argv.args.length > 0) {
      args.push(...argv.args);
    }

    if (argv['manifest-file']) {
      args.push('--manifest-file', argv['manifest-file'] as string);
    }

    if (argv.json) {
      args.push('--json');
    }

    if (argv['dry-run']) {
      args.push('--dry-run');
    }

    if (argv['non-interactive']) {
      args.push('--non-interactive');
    }

    if (argv.verbose) {
      args.push('--verbose');
    }

    if (argv.yes) {
      args.push('--yes');
    }

    runSubcommand('wtlink', args);
  },
};
