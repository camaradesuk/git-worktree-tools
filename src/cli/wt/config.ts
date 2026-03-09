/**
 * wt config - Configuration management
 *
 * Direct library call handler - no subprocess spawning.
 * Handles all config subcommands in-process via library imports.
 */

import * as fs from 'fs';
import { spawnSync } from 'child_process';
import type { CommandModule } from 'yargs';
import * as git from '../../lib/git.js';
import { runConfigEditor, quickEditConfig } from '../../lib/config-editor.js';
import { loadConfigWithValidation, getConfigPath, getDefaultConfig } from '../../lib/config.js';
import { formatValidationErrors } from '../../lib/config-validation.js';
import { getSchemaUrl } from '../../lib/global-config.js';
import * as colors from '../../lib/colors.js';
import {
  getConfigSource,
  loadMergedConfig,
  getConfigValue,
  setConfigValue,
  validateConfig,
  loadRepoConfig,
  loadGlobalConfig,
  saveRepoConfig,
  saveGlobalConfig,
  getDefaultRepoConfigPath,
  getGlobalConfigPath,
  findRepoConfigPath,
} from '../../lib/wtconfig/index.js';
import {
  detectMigrationIssues,
  runMigration,
  formatMigrationReport,
  formatMigrationReportJSON,
} from '../../lib/config-migration/index.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
} from '../../lib/json-output.js';
import {
  setJsonMode,
  print,
  printErr,
  printDim,
  printError,
  printStatus,
} from '../../lib/ui/index.js';

interface ConfigArgs {
  subcommand?: string;
  args?: string[];
  json?: boolean;
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
        describe: 'Subcommand: interactive, init, show, set, get, edit, validate, migrate, schema',
        type: 'string',
        default: 'interactive',
      })
      .positional('args', {
        describe: 'Additional arguments (e.g., key value for set)',
        type: 'string',
        array: true,
      })
      .option('json', {
        type: 'boolean',
        description: 'Output as JSON (for show, get, validate, migrate)',
        default: false,
      })
      .example('$0 config', 'Open interactive config editor')
      .example('$0 cfg i', 'Open interactive config editor')
      .example('$0 cfg init', 'Run setup wizard')
      .example('$0 config show', 'Show current configuration')
      .example('$0 config set baseBranch develop', 'Set a config value')
      .example('$0 config get ai.provider', 'Get a config value')
      .example('$0 cfg edit', 'Open config in text editor')
      .example('$0 config validate', 'Validate configuration')
      .example('$0 config migrate', 'Migrate legacy config to latest version')
      .example('$0 config migrate --json', 'Migrate with JSON output');
  },
  handler: async (argv) => {
    const subcommand = argv.subcommand || 'interactive';
    const args = argv.args || [];
    setJsonMode(!!argv.json);

    switch (subcommand) {
      case 'interactive':
      case 'i':
        await handleInteractive();
        return;
      case 'show':
        handleShow(!!argv.json);
        return;
      case 'get':
        handleGet(args, !!argv.json);
        return;
      case 'set':
        if (args.length === 1) {
          await handleQuickEdit(args[0]);
        } else {
          handleSet(args);
        }
        return;
      case 'edit':
        handleEdit();
        return;
      case 'init':
        handleInit();
        return;
      case 'validate':
        handleValidate(!!argv.json);
        return;
      case 'migrate':
        await handleMigrate(!!argv.json);
        return;
      case 'schema':
        handleSchema();
        return;
      default:
        printError({ title: `Unknown config subcommand: ${subcommand}` });
        process.exit(1);
    }
  },
};

/**
 * Handle interactive config editing
 */
async function handleInteractive(): Promise<void> {
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    printError({ title: 'Not in a git repository.' });
    printDim('Run this command from within a git repository.');
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
 * Handle show subcommand - display current configuration
 */
function handleShow(json: boolean): void {
  const repoRoot = getRepoRoot();
  const source = getConfigSource(repoRoot ?? undefined);
  const config = loadMergedConfig(repoRoot ?? undefined);
  if (json) {
    const result = createSuccessResult('wtconfig', {
      subcommand: 'show',
      source: source.type === 'none' ? null : source.path,
      config,
    });
    console.log(formatJsonResult(result));
    return;
  }
  const defaults = getDefaultConfig();
  printStatus('info', 'Current Configuration');
  print('');
  if (source.type === 'none') {
    printDim('No configuration file found. Using defaults.');
    printDim('Run "wt init" to create a configuration file.');
    print('');
  } else {
    printDim(`Source: ${source.path}`);
    print('');
  }
  const lines: string[] = ['{'];
  const addLine = (key: string, value: unknown, defaultValue: unknown) => {
    const isDefault = JSON.stringify(value) === JSON.stringify(defaultValue);
    const valueStr = JSON.stringify(value);
    if (isDefault) {
      lines.push(`  ${key}: ${valueStr} ${colors.dim('(default)')}`);
    } else {
      lines.push(`  ${colors.success(key + ':')} ${valueStr}`);
    }
  };
  addLine('baseBranch', config.baseBranch ?? defaults.baseBranch, defaults.baseBranch);
  addLine('draftPr', config.draftPr ?? defaults.draftPr, defaults.draftPr);
  addLine('branchPrefix', config.branchPrefix ?? defaults.branchPrefix, defaults.branchPrefix);
  addLine(
    'worktreePattern',
    config.worktreePattern ?? defaults.worktreePattern,
    defaults.worktreePattern
  );
  addLine(
    'worktreeParent',
    config.worktreeParent ?? defaults.worktreeParent,
    defaults.worktreeParent
  );
  addLine(
    'preferredEditor',
    config.preferredEditor ?? defaults.preferredEditor,
    defaults.preferredEditor
  );
  if (config.sharedRepos && config.sharedRepos.length > 0) {
    addLine('sharedRepos', config.sharedRepos, defaults.sharedRepos);
  }
  if (config.ai) {
    lines.push(`  ${colors.info('ai:')} ${JSON.stringify(config.ai)}`);
  }
  if (config.hooks && Object.keys(config.hooks).length > 0) {
    lines.push(`  ${colors.info('hooks:')} ${JSON.stringify(config.hooks)}`);
  }
  lines.push('}');
  print(lines.join('\n'));
}

/**
 * Handle get subcommand - get a specific config value
 */
function handleGet(args: string[], json: boolean): void {
  if (args.length === 0) {
    printError({ title: 'Missing key argument', hint: 'Usage: wt config get <key>' });
    process.exit(1);
  }
  const key = args[0];
  const repoRoot = getRepoRoot();
  const config = loadMergedConfig(repoRoot ?? undefined);
  const defaults = getDefaultConfig();
  let value = getConfigValue(config, key);
  if (value === undefined) {
    value = getConfigValue(defaults, key);
  }
  if (value === undefined) {
    if (json) {
      const errorResult = createErrorResult(
        'wtconfig',
        ErrorCode.INVALID_ARGUMENT,
        `Unknown configuration key: ${key}`
      );
      console.log(formatJsonResult(errorResult));
    } else {
      printError({ title: `Key "${key}" not found in configuration` });
    }
    process.exit(1);
  }
  if (json) {
    const result = createSuccessResult('wtconfig', { subcommand: 'get', key, value });
    console.log(formatJsonResult(result));
    return;
  }
  if (typeof value === 'object') {
    print(JSON.stringify(value, null, 2));
  } else {
    print(String(value));
  }
}

/**
 * Handle set subcommand with key and value
 */
function handleSet(args: string[]): void {
  if (args.length < 2) {
    printError({ title: 'Usage: wt config set <key> <value>' });
    process.exit(1);
  }
  const key = args[0];
  const value = args[1];
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    printError({ title: 'Not in a git repository.' });
    process.exit(1);
  }
  const currentConfig = loadRepoConfig(repoRoot) || {};
  try {
    const newConfig = setConfigValue(currentConfig, key, value);
    const validation = validateConfig(newConfig);
    if (!validation.valid) {
      printError({ title: 'Configuration validation failed:' });
      for (const error of validation.errors) {
        printErr(colors.error(`  ${error.path}: ${error.message}`));
      }
      process.exit(1);
    }
    for (const warning of validation.warnings) {
      printErr(colors.warning(`Warning: ${warning.path}: ${warning.message}`));
    }
    saveRepoConfig(repoRoot, newConfig);
    printStatus('success', `Set ${key} = ${value}`);
  } catch (error) {
    printError({
      title: `Failed to set value: ${error instanceof Error ? error.message : String(error)}`,
    });
    process.exit(1);
  }
}

/**
 * Handle quick edit of a single property
 */
async function handleQuickEdit(key: string): Promise<void> {
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    printError({ title: 'Not in a git repository.' });
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
 * Handle edit subcommand - open config in editor
 */
function handleEdit(): void {
  const repoRoot = getRepoRoot();
  const configPath = repoRoot ? findRepoConfigPath(repoRoot) : null;
  if (!configPath) {
    const globalPath = getGlobalConfigPath();
    if (fs.existsSync(globalPath)) {
      openInEditor(globalPath);
      return;
    }
    printError({ title: 'No configuration file found.', hint: 'Run "wt init" to create one.' });
    process.exit(1);
  }
  openInEditor(configPath);
}

/**
 * Open a file in the system editor
 */
function openInEditor(filePath: string): void {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  printDim(`Opening ${filePath} in ${editor}...`);
  try {
    spawnSync(editor, [filePath], { stdio: 'inherit' });
  } catch {
    printError({ title: 'Failed to open editor' });
    process.exit(1);
  }
}

/**
 * Handle init subcommand - redirect to wt init
 */
function handleInit(): void {
  printStatus('info', 'Use "wt init" to initialize git-worktree-tools configuration.');
  print('');
  printDim('Examples:');
  printDim('  wt init          Interactive initialization');
  printDim('  wt init --local   Create local config (gitignored)');
  printDim('  wt init --global  Create global config');
}

/**
 * Handle validate subcommand
 */
function handleValidate(json: boolean): void {
  if (json) {
    const repoRoot = getRepoRoot();
    const source = getConfigSource(repoRoot ?? undefined);
    if (source.type === 'none') {
      const result = createSuccessResult('wtconfig', {
        subcommand: 'validate',
        valid: true,
        source: null,
        errors: [],
        warnings: [],
      });
      console.log(formatJsonResult(result));
      return;
    }
    const config = loadMergedConfig(repoRoot ?? undefined);
    const validationResult = validateConfig(config);
    const result = createSuccessResult('wtconfig', {
      subcommand: 'validate',
      valid: validationResult.valid,
      source: source.path,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
    });
    console.log(formatJsonResult(result));
    if (!validationResult.valid) {
      process.exit(1);
    }
    return;
  }
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    printError({ title: 'Not in a git repository.' });
    process.exit(1);
  }
  const configPath = getConfigPath(repoRoot);
  if (!configPath) {
    printStatus('success', 'No configuration file found. Nothing to validate.');
    printDim('Run "wt config" to create a configuration.');
    return;
  }
  printStatus('info', `Validating: ${configPath}`);
  const { validation } = loadConfigWithValidation(repoRoot, { warnOnErrors: false });
  if (!validation) {
    printStatus('success', 'Configuration loaded successfully.');
    return;
  }
  if (validation.valid) {
    printStatus('success', 'Configuration is valid.');
    return;
  }
  printErr(colors.error('\nValidation errors:'));
  printErr(formatValidationErrors(validation.errors));
  process.exit(1);
}

/**
 * Handle migrate subcommand
 */
async function handleMigrate(json: boolean): Promise<void> {
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    if (json) {
      const errorResult = createErrorResult(
        'wtconfig',
        ErrorCode.NOT_GIT_REPO,
        'Not in a git repository'
      );
      console.log(formatJsonResult(errorResult));
    } else {
      printError({
        title: 'Error: Not in a git repository',
        hint: 'Run this command from within a git repository.',
      });
    }
    process.exit(1);
  }
  const detection = detectMigrationIssues(repoRoot);
  if (detection.issues.length === 0) {
    if (json) {
      const result = createSuccessResult('wtconfig', {
        migrated: false,
        message: 'No migration needed',
      });
      console.log(formatJsonResult(result));
    } else {
      printStatus('success', 'No migration needed.');
    }
    return;
  }
  if (json) {
    const result = await runMigration(repoRoot, detection, { deleteLegacyFiles: false });
    console.log(
      formatJsonResult(
        createSuccessResult('wtconfig', {
          success: result.success,
          backupPath: result.backupPath,
          configPath: result.newConfigPath,
          actionsApplied: result.actionsExecuted.length,
          errors: result.errors,
        })
      )
    );
    if (!result.success) {
      process.exit(1);
    }
    return;
  }
  print(formatMigrationReport(detection, { verbose: true }));
  print('');
  const result = await runMigration(repoRoot, detection, { deleteLegacyFiles: false });
  if (result.success) {
    print('');
    printStatus('success', 'Migration completed successfully!');
    if (result.backupPath) {
      printDim(`Backup created: ${result.backupPath}`);
    }
    printDim(`Config updated: ${result.newConfigPath}`);
  } else {
    print('');
    printError({ title: 'Migration failed:' });
    for (const err of result.errors) {
      printErr(colors.error(`  ${err}`));
    }
    process.exit(1);
  }
}

/**
 * Handle schema info
 */
function handleSchema(): void {
  const schemaUrl = getSchemaUrl();
  printStatus('info', 'JSON Schema for .worktreerc');
  print('');
  print(`URL: ${colors.cyan(schemaUrl)}`);
  print('');
  printDim('Add this to any config file for editor support:');
  printDim('  .worktreerc (repo shared)');
  printDim('  .worktreerc.local (personal, gitignored)');
  printDim('  ~/.config/git-worktree-tools/config.json (global)');
  print('');
  print(
    colors.yellow(`{
  "$schema": "${schemaUrl}",
  ...
}`)
  );
}
