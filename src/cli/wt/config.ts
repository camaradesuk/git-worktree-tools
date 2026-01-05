/**
 * wt config - Configuration management
 *
 * Wraps the wtconfig CLI tool functionality
 */

import type { CommandModule } from 'yargs';
import { runSubcommand } from './run-command.js';

interface ConfigArgs {
  subcommand?: string;
  args?: string[];
}

export const configCommand: CommandModule<object, ConfigArgs> = {
  command: ['config [subcommand] [args..]', 'cfg'],
  describe: 'Configuration management for git-worktree-tools',
  builder: (yargs) => {
    return yargs
      .positional('subcommand', {
        describe: 'Subcommand: init, show, set, get, edit, validate',
        type: 'string',
        default: 'show',
      })
      .positional('args', {
        describe: 'Additional arguments (e.g., key value for set)',
        type: 'string',
        array: true,
      })
      .example('$0 config', 'Show current configuration')
      .example('$0 cfg init', 'Run setup wizard')
      .example('$0 config set baseBranch develop', 'Set a config value')
      .example('$0 config get ai.provider', 'Get a config value')
      .example('$0 cfg edit', 'Open config in editor')
      .example('$0 config validate', 'Validate configuration');
  },
  handler: (argv) => {
    const args: string[] = [];

    if (argv.subcommand) {
      args.push(argv.subcommand);
    }

    if (argv.args && argv.args.length > 0) {
      args.push(...argv.args);
    }

    runSubcommand('wtconfig', args);
  },
};
