/**
 * wt config - Configuration management
 *
 * Provides interactive config editing and wraps wtconfig CLI functionality.
 */

import type { CommandModule } from 'yargs';
import { runSubcommand } from './run-command.js';
import * as git from '../../lib/git.js';
import { runConfigEditor, quickEditConfig } from '../../lib/config-editor.js';
import { loadConfigWithValidation, getDefaultConfig, getConfigPath } from '../../lib/config.js';
import { formatValidationErrors } from '../../lib/config-validation.js';
import * as colors from '../../lib/colors.js';

interface ConfigArgs {
  subcommand?: string;
  args?: string[];
}

/**
 * Get repo root safely
 */
function getRepoRoot(): string | null {
  try {
    return git.getRepoRoot();
  } catch {
    return null;
  }
}

export const configCommand: CommandModule<object, ConfigArgs> = {
  command: ['config [subcommand] [args..]', 'cfg'],
  describe: 'Configuration management for git-worktree-tools',
  builder: (yargs) => {
    return yargs
      .positional('subcommand', {
        describe: 'Subcommand: interactive, init, show, set, get, edit, validate, schema',
        type: 'string',
        default: 'interactive',
      })
      .positional('args', {
        describe: 'Additional arguments (e.g., key value for set)',
        type: 'string',
        array: true,
      })
      .example('$0 config', 'Open interactive config editor')
      .example('$0 cfg i', 'Open interactive config editor')
      .example('$0 cfg init', 'Run setup wizard')
      .example('$0 config show', 'Show current configuration')
      .example('$0 config set baseBranch develop', 'Set a config value')
      .example('$0 config get ai.provider', 'Get a config value')
      .example('$0 cfg edit', 'Open config in text editor')
      .example('$0 config validate', 'Validate configuration')
      .example('$0 config schema', 'Show JSON schema URL');
  },
  handler: async (argv) => {
    const subcommand = argv.subcommand || 'interactive';
    const args = argv.args || [];

    // Handle interactive mode directly
    if (subcommand === 'interactive' || subcommand === 'i') {
      await handleInteractive();
      return;
    }

    // Handle quick set with interactive edit
    if (subcommand === 'set' && args.length === 1) {
      // Only key provided, do interactive edit for that property
      await handleQuickEdit(args[0]);
      return;
    }

    // Handle validate with our validator
    if (subcommand === 'validate') {
      await handleValidate();
      return;
    }

    // Handle schema info
    if (subcommand === 'schema') {
      handleSchema();
      return;
    }

    // Delegate other commands to wtconfig
    const wtconfigArgs: string[] = [subcommand];
    if (args.length > 0) {
      wtconfigArgs.push(...args);
    }
    runSubcommand('wtconfig', wtconfigArgs);
  },
};

/**
 * Handle interactive config editing
 */
async function handleInteractive(): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    console.log(colors.dim('Run this command from within a git repository.'));
    process.exit(1);
  }

  try {
    const result = await runConfigEditor(repoRoot);
    if (result.saved) {
      process.exit(0);
    } else {
      process.exit(0);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Handle quick edit of a single property
 */
async function handleQuickEdit(key: string): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    process.exit(1);
  }

  try {
    const result = await quickEditConfig(repoRoot, key);
    process.exit(result.saved ? 0 : 1);
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Handle config validation
 */
async function handleValidate(): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    process.exit(1);
  }

  const configPath = getConfigPath(repoRoot);

  if (!configPath) {
    console.log(colors.success('No configuration file found. Nothing to validate.'));
    console.log(colors.dim('Run "wt config" to create a configuration.'));
    return;
  }

  console.log(colors.info(`Validating: ${configPath}`));

  const { validation } = loadConfigWithValidation(repoRoot, { warnOnErrors: false });

  if (!validation) {
    console.log(colors.success('Configuration loaded successfully.'));
    return;
  }

  if (validation.valid) {
    console.log(colors.success('Configuration is valid.'));
    return;
  }

  console.log(colors.error('\nValidation errors:'));
  console.log(formatValidationErrors(validation.errors));
  process.exit(1);
}

/**
 * Handle schema info
 */
function handleSchema(): void {
  const schemaUrl =
    'https://raw.githubusercontent.com/camaradesuk/git-worktree-tools/main/schemas/worktreerc.schema.json';

  console.log(colors.info('JSON Schema for .worktreerc'));
  console.log();
  console.log(`URL: ${colors.cyan(schemaUrl)}`);
  console.log();
  console.log(colors.dim('Add this to your .worktreerc for editor support:'));
  console.log();
  console.log(
    colors.yellow(`{
  "$schema": "${schemaUrl}",
  ...
}`)
  );
}
