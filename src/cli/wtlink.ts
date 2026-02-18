#!/usr/bin/env node
/**
 * wtlink - Worktree Config Link Manager
 *
 * Manages linking of configuration files between git worktrees using hard links.
 * Config is stored in the wtlink section of .worktreerc (recommended) or legacy .wtlinkrc file.
 *
 * Commands:
 *   wtlink              Show interactive main menu
 *   wtlink manage       Discover and manage the config manifest
 *   wtlink link         Link config files between worktrees
 *   wtlink validate     Validate manifest entries
 *   wtlink migrate      Migrate legacy .wtlinkrc to .worktreerc
 */

import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as colors from '../lib/colors.js';
import { setColorEnabled } from '../lib/colors.js';
import { initializeLogger } from '../lib/logger.js';
import { printError, setJsonMode } from '../lib/ui/index.js';
import { ManifestError } from '../lib/errors.js';
import * as manage from '../lib/wtlink/manage-manifest.js';
import * as link from '../lib/wtlink/link-configs.js';
import * as validate from '../lib/wtlink/validate-manifest.js';
import { hasLegacyManifest } from '../lib/wtlink/config-manifest.js';
import * as git from '../lib/git.js';
import { DEFAULT_MANIFEST_FILE } from '../lib/constants.js';
import {
  detectMigrationIssues,
  runMigration,
  formatMigrationReport,
} from '../lib/config-migration/index.js';

// Define interfaces for command arguments for type safety
interface GlobalOptions {
  manifestFile: string;
  /** Output result as JSON for programmatic parsing */
  json: boolean;
  /** Enable verbose debug output */
  verbose: boolean;
  /** Suppress all output except errors */
  quiet: boolean;
  /** Disable colored output */
  noColor: boolean;
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

interface MigrateArgv extends GlobalOptions {
  deleteLegacy: boolean;
  dryRun: boolean;
}

yargs(hideBin(process.argv))
  .scriptName('wtlink')
  .pkgConf('wtlink')
  .usage('$0 [command] [options]')
  .option('manifest-file', {
    description: '[Deprecated] The name of the manifest file. Config is now stored in .worktreerc.',
    type: 'string',
    default: DEFAULT_MANIFEST_FILE,
    hidden: true, // Hide from help since it's deprecated
  })
  .option('json', {
    description: 'Output result as JSON for programmatic parsing (AI/automation)',
    type: 'boolean',
    default: false,
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Enable verbose debug output',
    default: false,
    global: true,
  })
  .option('quiet', {
    type: 'boolean',
    description: 'Suppress all output except errors',
    default: false,
    global: true,
  })
  .option('no-color', {
    type: 'boolean',
    description: 'Disable colored output',
    default: false,
    global: true,
  })
  .middleware((argv) => {
    initializeLogger({
      verbose: argv.verbose as boolean,
      quiet: argv.quiet as boolean,
      noColor: (argv['no-color'] as boolean) || (argv.noColor as boolean),
      json: argv.json as boolean,
      commandName: 'wtlink',
    });
    setJsonMode(argv.json as boolean);
    if (argv['no-color'] || argv.noColor) {
      setColorEnabled(false);
    }
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
    async (argv) => {
      await manage.run(argv);
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
    async (argv) => {
      await link.run(argv as ArgumentsCamelCase<LinkArgv>); // Cast because positional() doesn't type argv well
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
    async (argv) => {
      await validate.run(argv as ArgumentsCamelCase<ValidateArgv>);
    }
  )
  .command<MigrateArgv>(
    'migrate',
    '[Deprecated] Migrate config - use "wtconfig migrate" instead',
    (yargs) => {
      return yargs
        .option('delete-legacy', {
          type: 'boolean',
          description: 'Delete the legacy .wtlinkrc file after successful migration',
          default: false,
        })
        .option('dry-run', {
          alias: 'd',
          type: 'boolean',
          description: 'Show what would be migrated without making changes',
          default: false,
        });
    },
    async (argv) => {
      // Show deprecation notice
      console.log(colors.yellow('Note: "wtlink migrate" is deprecated.'));
      console.log(colors.dim('Please use "wtconfig migrate" for all migration tasks.'));
      console.log();

      const mainWorktreeRoot = git.getMainWorktreeRoot();

      // Use new migration system for detection
      const detection = detectMigrationIssues(mainWorktreeRoot);

      // Filter to only legacy .wtlinkrc issues for backward compatibility
      const legacyIssues = detection.issues.filter((i) => i.type === 'legacy_wtlinkrc');

      if (legacyIssues.length === 0 && !hasLegacyManifest(mainWorktreeRoot)) {
        console.log(colors.yellow(`No legacy ${DEFAULT_MANIFEST_FILE} file found.`));
        console.log(
          colors.dim('Your config is already using .worktreerc or no manifest exists yet.')
        );
        console.log(colors.dim("Run 'wtlink manage' to create or modify your manifest."));
        return;
      }

      // Dry run mode - show report
      if (argv.dryRun) {
        console.log(formatMigrationReport(detection, { verbose: true }));
        console.log();
        console.log(colors.cyan('[DRY RUN] No changes were made.'));
        return;
      }

      // Run migration using new system
      const result = await runMigration(mainWorktreeRoot, detection, {
        deleteLegacyFiles: argv.deleteLegacy,
      });

      if (result.success) {
        console.log(colors.green('Migration completed successfully!'));
        if (result.backupPath) {
          console.log(colors.dim(`Backup created: ${result.backupPath}`));
        }
      } else {
        console.log(colors.yellow('Migration completed with issues:'));
        for (const error of result.errors) {
          console.log(colors.red(`  ${error}`));
        }
      }
    }
  )
  .wrap(Math.max(40, Math.min(100, process.stdout.columns ?? 100)))
  .help()
  .alias('h', 'help')
  .strict()
  .fail((msg, err) => {
    if (err) {
      const detail =
        err instanceof ManifestError && err.issues
          ? err.issues.map((p) => `  - ${p}`).join('\n')
          : undefined;
      printError({ title: err.message, detail, hint: getWtlinkHint(err.message) });
    } else {
      printError({ title: msg });
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
    const message = err instanceof Error ? err.message : String(err);
    const detail =
      err instanceof ManifestError && err.issues
        ? err.issues.map((p) => `  - ${p}`).join('\n')
        : undefined;
    printError({ title: message, detail, hint: getWtlinkHint(message) });
    process.exit(1);
  });

/**
 * Map error messages to contextual hints for wtlink commands
 */
function getWtlinkHint(message: string): string | undefined {
  if (message.includes('Unable to detect an alternate worktree')) {
    return (
      'You are running from the main worktree with only one worktree available.\n' +
      'To link config files, you need at least two worktrees.\n\n' +
      'To fix:\n' +
      '  1. Create a PR worktree: newpr "My feature"\n' +
      '  2. Then link configs: wtlink link . ../my-repo.pr42'
    );
  }
  if (message.includes('Failed to inspect git worktrees')) {
    return 'Specify the source path explicitly:\n  wtlink link /path/to/source /path/to/dest';
  }
  if (message.includes('not a git repository')) {
    return 'Run this command from within a git repository.';
  }
  if (message.includes('Manifest file not found')) {
    return 'Create a manifest first:\n  wtlink manage';
  }
  if (message.includes('Manifest validation failed')) {
    return 'Run "wtlink manage" to fix manifest issues.';
  }
  return undefined;
}
