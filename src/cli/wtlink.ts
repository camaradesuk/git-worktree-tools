#!/usr/bin/env node
/**
 * wtlink - Worktree Config Link Manager
 *
 * Manages linking of configuration files between git worktrees using hard links.
 * Uses a .wtlinkrc manifest file to track which files should be linked.
 *
 * Commands:
 *   wtlink              Show interactive main menu
 *   wtlink manage       Discover and manage the config manifest
 *   wtlink link         Link config files between worktrees
 *   wtlink validate     Validate manifest entries
 */

import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as colors from '../lib/colors.js';
import * as manage from '../lib/wtlink/manage-manifest.js';
import * as link from '../lib/wtlink/link-configs.js';
import * as validate from '../lib/wtlink/validate-manifest.js';
import { DEFAULT_MANIFEST_FILE } from '../lib/constants.js';

// Define interfaces for command arguments for type safety
interface GlobalOptions {
  manifestFile: string;
  /** Output result as JSON for programmatic parsing */
  json: boolean;
}

interface ManageArgv extends GlobalOptions {
  nonInteractive: boolean;
  clean: boolean;
  dryRun: boolean;
  backup: boolean;
}

interface LinkArgv extends GlobalOptions {
  source?: string;
  destination?: string;
  dryRun: boolean;
  type: 'hard' | 'symbolic';
  yes: boolean;
}

interface ValidateArgv extends GlobalOptions {
  source?: string;
}

yargs(hideBin(process.argv))
  .scriptName('wtlink')
  .pkgConf('wtlink')
  .usage('$0 [command] [options]')
  .option('manifest-file', {
    description: 'The name of the manifest file.',
    type: 'string',
    default: DEFAULT_MANIFEST_FILE,
  })
  .option('json', {
    description: 'Output result as JSON for programmatic parsing (AI/automation)',
    type: 'boolean',
    default: false,
  })
  .command<ManageArgv>(
    'manage',
    'Discover and manage the worktree config manifest',
    (yargs) => {
      return yargs
        .option('non-interactive', {
          alias: 'n',
          type: 'boolean',
          description: 'Run in non-interactive mode, adding new files as commented out',
          default: false,
        })
        .option('clean', {
          alias: 'c',
          type: 'boolean',
          description: 'Run in clean mode, removing stale entries automatically',
          default: false,
        })
        .option('dry-run', {
          alias: 'd',
          type: 'boolean',
          description: 'Show what changes would be made without writing any files',
          default: false,
        })
        .option('backup', {
          alias: 'b',
          type: 'boolean',
          description: 'Create a backup of the manifest before updating',
          default: false,
        });
    },
    (argv) => {
      manage.run(argv);
    }
  )
  .command<LinkArgv>(
    'link [source] [destination]',
    'Link config files from a source worktree to a destination',
    (yargs) => {
      return yargs
        .positional('source', {
          describe: 'The source worktree directory containing the real config files',
          type: 'string',
        })
        .positional('destination', {
          describe: 'The destination worktree directory to link the files into',
          type: 'string',
        })
        .option('dry-run', {
          alias: 'd',
          type: 'boolean',
          description: 'Show what links would be created without modifying the filesystem',
          default: false,
        })
        .option('type', {
          description: 'The type of link to create',
          type: 'string',
          choices: ['hard', 'symbolic'] as const,
          default: 'hard' as const,
        })
        .option('yes', {
          alias: 'y',
          type: 'boolean',
          description: 'Skip confirmation prompt and proceed with linking',
          default: false,
        });
    },
    (argv) => {
      link.run(argv as ArgumentsCamelCase<LinkArgv>); // Cast because positional() doesn't type argv well
    }
  )
  .command<ValidateArgv>(
    'validate [source]',
    'Validate that manifest entries exist and are safely ignored',
    (yargs) => {
      return yargs.positional('source', {
        describe: 'Optional source worktree to validate against (defaults to current worktree)',
        type: 'string',
      });
    },
    (argv) => {
      validate.run(argv as ArgumentsCamelCase<ValidateArgv>);
    }
  )
  .help()
  .alias('h', 'help')
  .strict()
  .fail((msg, err) => {
    if (err) {
      // An error thrown from a command
      console.error(colors.red('Error:'), err.message);
    } else {
      // A yargs validation error
      console.error(colors.red(msg));
    }
    process.exit(1);
  })
  .parseAsync()
  .then(async (argv) => {
    // If no command was provided, show main menu
    if (argv._.length === 0) {
      const { showMainMenu } = await import('../lib/wtlink/main-menu.js');
      await showMainMenu();
    }
  })
  .catch((err) => {
    console.error(colors.red('Error:'), err.message);
    process.exit(1);
  });
