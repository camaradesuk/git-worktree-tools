/**
 * wt link - Manage config file linking between worktrees
 *
 * Calls wtlink library functions directly (in-process, no subprocess spawning)
 */

import type { CommandModule } from 'yargs';
import * as git from '../../lib/git.js';
import * as colors from '../../lib/colors.js';
import * as manage from '../../lib/wtlink/manage-manifest.js';
import * as link from '../../lib/wtlink/link-configs.js';
import * as validate from '../../lib/wtlink/validate-manifest.js';
import { hasLegacyManifest } from '../../lib/wtlink/config-manifest.js';
import { DEFAULT_MANIFEST_FILE } from '../../lib/constants.js';
import {
  detectMigrationIssues,
  runMigration,
  formatMigrationReport,
} from '../../lib/config-migration/index.js';
import {
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorCodeFromError,
} from '../../lib/json-output.js';
import { ManifestError } from '../../lib/errors.js';
import { setJsonMode, isJsonMode, printError } from '../../lib/ui/index.js';
import { showMainMenu } from '../../lib/wtlink/main-menu.js';

interface LinkArgs {
  subcommand?: string;
  args?: string[];
  'manifest-file'?: string;
  json?: boolean;
  'dry-run'?: boolean;
  'non-interactive'?: boolean;
  verbose?: boolean;
  yes?: boolean;
  clean?: boolean;
  backup?: boolean;
  type?: string;
  quiet?: boolean;
  noColor?: boolean;
}

export const linkCommand: CommandModule<object, LinkArgs> = {
  command: ['link [subcommand] [args..]', 'l'],
  describe: 'Manage config file linking between worktrees',
  builder: (yargs) => {
    return yargs
      .positional('subcommand', {
        describe:
          'Subcommand: manage, link, validate, migrate (deprecated: use "wt config migrate")',
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
      .option('clean', {
        alias: 'c',
        type: 'boolean',
        description: 'Remove stale entries automatically (manage subcommand)',
        default: false,
      })
      .option('backup', {
        alias: 'b',
        type: 'boolean',
        description: 'Create a backup of the manifest before updating',
        default: false,
      })
      .option('type', {
        type: 'string',
        description: 'Link type: hard or symbolic (link subcommand)',
        choices: ['hard', 'symbolic'],
      })
      .example('$0 link', 'Show interactive menu')
      .example('$0 l manage', 'Manage manifest entries')
      .example('$0 link manage --clean', 'Remove stale entries')
      .example('$0 link link . ../repo.pr42', 'Link configs to worktree')
      .example('$0 link validate', 'Validate manifest entries')
      .example('$0 link migrate', '[Deprecated] Use "wt config migrate" instead');
  },
  handler: async (argv) => {
    setJsonMode(!!argv.json);

    const sub = argv.subcommand || '';
    const manifestFile = argv['manifest-file'] || DEFAULT_MANIFEST_FILE;

    try {
      switch (sub) {
        case '': {
          // No subcommand: show interactive main menu
          await showMainMenu();
          return;
        }

        case 'manage': {
          await manage.run({
            nonInteractive: !!argv['non-interactive'],
            clean: !!argv.clean,
            dryRun: !!argv['dry-run'],
            manifestFile,
            backup: !!argv.backup,
            verbose: !!argv.verbose,
          });
          return;
        }

        case 'link': {
          const linkArgs = argv.args || [];
          await link.run({
            source: linkArgs[0],
            destination: linkArgs[1],
            dryRun: !!argv['dry-run'],
            manifestFile,
            type: (argv.type as 'hard' | 'symbolic') || 'hard',
            yes: !!argv.yes,
          });
          return;
        }

        case 'validate': {
          const validateArgs = argv.args || [];
          validate.run({
            manifestFile,
            source: validateArgs[0],
          });
          return;
        }

        case 'migrate': {
          // Show deprecation notice
          console.log(colors.yellow('Note: "wt link migrate" is deprecated.'));
          console.log(colors.dim('Please use "wt config migrate" for all migration tasks.'));
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
          if (argv['dry-run']) {
            console.log(formatMigrationReport(detection, { verbose: true }));
            console.log();
            console.log(colors.cyan('[DRY RUN] No changes were made.'));
            return;
          }

          // Run migration
          const result = await runMigration(mainWorktreeRoot, detection, {
            deleteLegacyFiles: false,
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
          return;
        }

        default: {
          // Unknown subcommand
          const msg = `Unknown subcommand: ${sub}`;
          if (isJsonMode()) {
            console.log(
              formatJsonResult(createErrorResult('wtlink', ErrorCode.INVALID_ARGUMENT, msg))
            );
          } else {
            printError({ title: msg, hint: 'Available: manage, link, validate, migrate' });
          }
          process.exit(1);
        }
      }
    } catch (err) {
      if (isJsonMode()) {
        const errorResult = createErrorResult(
          'wtlink',
          err ? getErrorCodeFromError(err) : ErrorCode.UNKNOWN_ERROR,
          err instanceof Error ? err.message : String(err)
        );
        console.log(formatJsonResult(errorResult));
      } else if (err instanceof ManifestError && err.issues) {
        const detail = err.issues.map((p) => `  - ${p}`).join('\n');
        printError({ title: err.message, detail });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        printError({ title: message });
      }
      process.exit(1);
    }
  },
};
