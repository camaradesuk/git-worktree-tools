/**
 * wt config - Configuration management
 *
 * Wraps the wtconfig CLI tool functionality
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CommandModule } from 'yargs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    // Build args array for wtconfig
    const args: string[] = [];

    // Add subcommand (defaults to 'show')
    if (argv.subcommand) {
      args.push(argv.subcommand);
    }

    // Add additional positional args (like key value for set)
    if (argv.args && argv.args.length > 0) {
      args.push(...argv.args);
    }

    // Spawn wtconfig with inherited stdio
    const wtconfigPath = path.resolve(__dirname, '../wtconfig.js');
    const result = spawnSync(process.execPath, [wtconfigPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    process.exit(result.status ?? 1);
  },
};
