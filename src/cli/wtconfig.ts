#!/usr/bin/env node

/**
 * wtconfig - Configuration management for git-worktree-tools
 *
 * Commands:
 *   wtconfig init           - Run interactive setup wizard
 *   wtconfig show           - Show current configuration
 *   wtconfig set <key> <val> - Set a configuration value
 *   wtconfig get <key>      - Get a configuration value
 *   wtconfig edit           - Open config in editor
 *   wtconfig validate       - Validate configuration
 */

import { execSync } from 'child_process';
import inquirer from 'inquirer';
import * as colors from '../lib/colors.js';
import * as git from '../lib/git.js';
import { getDefaultConfig } from '../lib/config.js';

/**
 * Safely get repository root, returning null if not in a git repo
 */
function findRepoRoot(): string | null {
  try {
    return git.getRepoRoot();
  } catch {
    return null;
  }
}
import {
  detectEnvironment,
  detectDefaultBranch,
  getInstallCommand,
  getEditorCommand,
  getConfigSource,
  loadMergedConfig,
  loadRepoConfig,
  loadGlobalConfig,
  saveRepoConfig,
  saveGlobalConfig,
  setConfigValue,
  getConfigValue,
  validateConfig,
  formatConfigDisplay,
  getGlobalConfigPath,
  getDefaultRepoConfigPath,
  type EnvironmentInfo,
  type WizardState,
} from '../lib/wtconfig/index.js';
import type { WorktreeConfig } from '../lib/config.js';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'show';

// Entry point
main().catch((error) => {
  console.error(colors.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});

async function main(): Promise<void> {
  switch (command) {
    case 'init':
    case 'wizard':
      await runWizard();
      break;

    case 'show':
      await showConfig();
      break;

    case 'set':
      await setConfig(args[1], args[2]);
      break;

    case 'get':
      await getConfig(args[1]);
      break;

    case 'edit':
      await editConfig();
      break;

    case 'validate':
      await validateCurrentConfig();
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    default:
      console.error(colors.error(`Unknown command: ${command}`));
      showHelp();
      process.exit(1);
  }
}

function showHelp(): void {
  console.log(`
${colors.info('wtconfig')} - Configuration management for git-worktree-tools

${colors.warning('Usage:')}
  wtconfig init             Run interactive setup wizard
  wtconfig show             Show current configuration
  wtconfig set <key> <val>  Set a configuration value (e.g., "baseBranch main")
  wtconfig get <key>        Get a configuration value (e.g., "ai.provider")
  wtconfig edit             Open config in default editor
  wtconfig validate         Validate current configuration
  wtconfig help             Show this help message

${colors.warning('Configuration Locations:')}
  Global:     ~/.worktreerc (applies to all repos)
  Repository: .worktreerc or .worktreerc.json (repo-specific)

${colors.warning('Examples:')}
  wtconfig init                          # Start interactive setup
  wtconfig set baseBranch develop        # Set base branch
  wtconfig set ai.provider claude        # Set AI provider
  wtconfig set hooks.post-worktree "npm install"
  wtconfig get ai.provider               # Get AI provider setting
  wtconfig validate                      # Check for configuration errors
`);
}

async function showConfig(): Promise<void> {
  const repoRoot = findRepoRoot();
  const source = getConfigSource(repoRoot ?? undefined);
  const config = loadMergedConfig(repoRoot ?? undefined);
  const defaults = getDefaultConfig();

  console.log(colors.info('Current Configuration'));
  console.log();

  if (source.type === 'none') {
    console.log(colors.dim('No configuration file found. Using defaults.'));
    console.log(colors.dim(`Run 'wtconfig init' to create a configuration file.`));
    console.log();
  } else {
    console.log(colors.dim(`Source: ${source.path}`));
    console.log();
  }

  // Show merged config with sources indicated
  const mergedDisplay = formatConfigWithDefaults(config, defaults, source.type !== 'none');
  console.log(mergedDisplay);
}

function formatConfigWithDefaults(
  config: WorktreeConfig,
  defaults: Required<WorktreeConfig>,
  hasUserConfig: boolean
): string {
  const lines: string[] = [];

  const addLine = (key: string, value: unknown, defaultValue: unknown) => {
    const isDefault = JSON.stringify(value) === JSON.stringify(defaultValue);
    const valueStr = JSON.stringify(value);

    if (isDefault && !hasUserConfig) {
      lines.push(`  ${colors.dim(`${key}:`)} ${colors.dim(valueStr)} ${colors.dim('(default)')}`);
    } else if (isDefault) {
      lines.push(`  ${key}: ${valueStr} ${colors.dim('(default)')}`);
    } else {
      lines.push(`  ${colors.success(key + ':')} ${valueStr}`);
    }
  };

  lines.push('{');
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

  if (config.syncPatterns && config.syncPatterns.length > 0) {
    addLine('syncPatterns', config.syncPatterns, defaults.syncPatterns);
  }

  // AI config
  if (config.ai) {
    lines.push(`  ${colors.info('ai:')} {`);
    const ai = config.ai;
    const defAi = defaults.ai;
    if (ai.provider !== undefined) addLine('    provider', ai.provider, defAi.provider);
    if (ai.branchName !== undefined) addLine('    branchName', ai.branchName, defAi.branchName);
    if (ai.prTitle !== undefined) addLine('    prTitle', ai.prTitle, defAi.prTitle);
    if (ai.prDescription !== undefined)
      addLine('    prDescription', ai.prDescription, defAi.prDescription);
    lines.push('  }');
  }

  // Hooks config
  if (config.hooks && Object.keys(config.hooks).length > 0) {
    lines.push(`  ${colors.info('hooks:')} {`);
    for (const [hookName, hookDef] of Object.entries(config.hooks)) {
      const hookStr = typeof hookDef === 'string' ? `"${hookDef}"` : JSON.stringify(hookDef);
      lines.push(`    ${hookName}: ${hookStr}`);
    }
    lines.push('  }');
  }

  // Plugins
  if (config.plugins && config.plugins.length > 0) {
    addLine('plugins', config.plugins, defaults.plugins);
  }

  // Generators
  if (config.generators && Object.keys(config.generators).length > 0) {
    lines.push(`  ${colors.info('generators:')} {`);
    for (const [genName, genPath] of Object.entries(config.generators)) {
      lines.push(`    ${genName}: "${genPath}"`);
    }
    lines.push('  }');
  }

  // Integrations
  if (config.integrations && Object.keys(config.integrations).length > 0) {
    lines.push(`  ${colors.info('integrations:')} {`);
    for (const [intName, intConfig] of Object.entries(config.integrations)) {
      lines.push(`    ${intName}: ${JSON.stringify(intConfig)}`);
    }
    lines.push('  }');
  }

  lines.push('}');

  return lines.join('\n');
}

async function setConfig(key: string | undefined, value: string | undefined): Promise<void> {
  if (!key) {
    console.error(colors.error('Usage: wtconfig set <key> <value>'));
    console.error(colors.dim('Example: wtconfig set baseBranch develop'));
    process.exit(1);
  }

  if (value === undefined) {
    console.error(colors.error(`Missing value for key: ${key}`));
    process.exit(1);
  }

  // Determine scope
  const repoRoot = findRepoRoot();
  const { saveLocation } = await inquirer.prompt<{ saveLocation: 'repo' | 'global' }>([
    {
      type: 'list',
      name: 'saveLocation',
      message: 'Where should this setting be saved?',
      choices: [
        { name: 'Repository (.worktreerc)', value: 'repo', disabled: !repoRoot },
        { name: 'Global (~/.worktreerc)', value: 'global' },
      ],
      default: repoRoot ? 'repo' : 'global',
    },
  ]);

  const currentConfig =
    saveLocation === 'repo' && repoRoot ? loadRepoConfig(repoRoot) || {} : loadGlobalConfig() || {};

  try {
    const newConfig = setConfigValue(currentConfig, key, value);

    // Validate before saving
    const validation = validateConfig(newConfig);
    if (!validation.valid) {
      console.error(colors.error('Configuration validation failed:'));
      for (const error of validation.errors) {
        console.error(colors.error(`  ${error.path}: ${error.message}`));
      }
      process.exit(1);
    }

    // Show warnings
    for (const warning of validation.warnings) {
      console.warn(colors.warning(`Warning: ${warning.path}: ${warning.message}`));
    }

    // Save
    if (saveLocation === 'repo' && repoRoot) {
      saveRepoConfig(repoRoot, newConfig);
      console.log(colors.success(`Set ${key} = ${value} in .worktreerc`));
    } else {
      saveGlobalConfig(newConfig);
      console.log(colors.success(`Set ${key} = ${value} in ~/.worktreerc`));
    }
  } catch (error) {
    console.error(
      colors.error(`Failed to set value: ${error instanceof Error ? error.message : String(error)}`)
    );
    process.exit(1);
  }
}

async function getConfig(key: string | undefined): Promise<void> {
  if (!key) {
    console.error(colors.error('Usage: wtconfig get <key>'));
    console.error(colors.dim('Example: wtconfig get ai.provider'));
    process.exit(1);
  }

  const repoRoot = findRepoRoot();
  const config = loadMergedConfig(repoRoot ?? undefined);
  const defaults = getDefaultConfig();

  // Get value from merged config or defaults
  let value = getConfigValue(config, key);
  if (value === undefined) {
    value = getConfigValue(defaults, key);
  }

  if (value === undefined) {
    console.error(colors.error(`Unknown configuration key: ${key}`));
    process.exit(1);
  }

  if (typeof value === 'object') {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

async function editConfig(): Promise<void> {
  const repoRoot = findRepoRoot();

  // Determine which file to edit
  const { editLocation } = await inquirer.prompt<{ editLocation: 'repo' | 'global' }>([
    {
      type: 'list',
      name: 'editLocation',
      message: 'Which configuration file would you like to edit?',
      choices: [
        { name: 'Repository (.worktreerc)', value: 'repo', disabled: !repoRoot },
        { name: 'Global (~/.worktreerc)', value: 'global' },
      ],
      default: repoRoot ? 'repo' : 'global',
    },
  ]);

  const configPath =
    editLocation === 'repo' && repoRoot
      ? getDefaultRepoConfigPath(repoRoot)
      : getGlobalConfigPath();

  // Create file with defaults if it doesn't exist
  const fs = await import('fs');
  if (!fs.existsSync(configPath)) {
    const { create } = await inquirer.prompt<{ create: boolean }>([
      {
        type: 'confirm',
        name: 'create',
        message: `${configPath} does not exist. Create it?`,
        default: true,
      },
    ]);

    if (!create) {
      console.log(colors.dim('Cancelled.'));
      return;
    }

    fs.writeFileSync(configPath, '{\n  \n}\n', 'utf8');
  }

  // Open in editor
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  console.log(colors.dim(`Opening ${configPath} in ${editor}...`));

  try {
    execSync(`${editor} "${configPath}"`, { stdio: 'inherit' });
  } catch {
    console.error(colors.error('Failed to open editor'));
    process.exit(1);
  }
}

async function validateCurrentConfig(): Promise<void> {
  const repoRoot = findRepoRoot();
  const source = getConfigSource(repoRoot ?? undefined);

  if (source.type === 'none') {
    console.log(colors.success('No configuration file found. Nothing to validate.'));
    return;
  }

  console.log(colors.info(`Validating: ${source.path}`));

  const config = loadMergedConfig(repoRoot ?? undefined);
  const result = validateConfig(config);

  if (result.valid && result.warnings.length === 0) {
    console.log(colors.success('Configuration is valid.'));
    return;
  }

  if (result.errors.length > 0) {
    console.log(colors.error('\nErrors:'));
    for (const error of result.errors) {
      console.log(colors.error(`  ${error.path}: ${error.message}`));
    }
  }

  if (result.warnings.length > 0) {
    console.log(colors.warning('\nWarnings:'));
    for (const warning of result.warnings) {
      console.log(colors.warning(`  ${warning.path}: ${warning.message}`));
    }
  }

  if (!result.valid) {
    process.exit(1);
  }
}

async function runWizard(): Promise<void> {
  console.log();
  console.log(colors.info('┌' + '─'.repeat(56) + '┐'));
  console.log(
    colors.info('│') + '           git-worktree-tools Setup Wizard           ' + colors.info('│')
  );
  console.log(colors.info('└' + '─'.repeat(56) + '┘'));
  console.log();

  // Detect environment
  console.log(colors.dim('Detecting your environment...'));
  console.log();

  const repoRoot = findRepoRoot();
  const env = detectEnvironment(repoRoot ?? undefined);

  // Show detected environment
  displayEnvironment(env);

  // Run wizard steps
  const state = await runWizardSteps(env, repoRoot);

  // Build configuration
  const config = buildConfigFromState(state, env);

  // Preview configuration
  console.log();
  console.log(colors.info('Configuration Preview:'));
  console.log();
  console.log(formatConfigDisplay(config));
  console.log();

  // Confirm save
  const { saveChoice } = await inquirer.prompt<{ saveChoice: 'repo' | 'global' | 'cancel' }>([
    {
      type: 'list',
      name: 'saveChoice',
      message: 'Save configuration?',
      choices: [
        { name: 'Save to repository (.worktreerc)', value: 'repo', disabled: !repoRoot },
        { name: 'Save globally (~/.worktreerc)', value: 'global' },
        { name: 'Cancel', value: 'cancel' },
      ],
      default: repoRoot ? 'repo' : 'global',
    },
  ]);

  if (saveChoice === 'cancel') {
    console.log(colors.dim('Setup cancelled.'));
    return;
  }

  // Save configuration
  if (saveChoice === 'repo' && repoRoot) {
    saveRepoConfig(repoRoot, config);
    console.log();
    console.log(colors.success(`Configuration saved to ${getDefaultRepoConfigPath(repoRoot)}`));
  } else {
    saveGlobalConfig(config);
    console.log();
    console.log(colors.success(`Configuration saved to ${getGlobalConfigPath()}`));
  }

  // Show quick start
  console.log();
  console.log(colors.info('Quick Start:'));
  console.log(`  ${colors.warning('newpr "Add feature"')}     Create a new PR`);
  console.log(`  ${colors.warning('lswt')}                    List worktrees`);
  console.log(`  ${colors.warning('cleanpr')}                 Clean merged PRs`);
  console.log();
}

function displayEnvironment(env: EnvironmentInfo): void {
  const check = colors.success('✓');
  const cross = colors.error('✗');
  const warn = colors.warning('○');

  // Git
  if (env.git.version) {
    if (env.git.configured) {
      console.log(`${check} Git ${env.git.version} configured (${env.git.email})`);
    } else {
      console.log(
        `${warn} Git ${env.git.version} (not configured - run: git config --global user.name/email)`
      );
    }
  } else {
    console.log(`${cross} Git not found`);
  }

  // GitHub CLI
  if (env.github.installed) {
    if (env.github.authenticated) {
      console.log(
        `${check} GitHub CLI authenticated${env.github.user ? ` (${env.github.user})` : ''}`
      );
    } else {
      console.log(`${warn} GitHub CLI installed but not authenticated (run: gh auth login)`);
    }
  } else {
    console.log(
      `${cross} GitHub CLI not installed (optional, install from: https://cli.github.com)`
    );
  }

  // AI tools
  const aiTools: string[] = [];
  if (env.ai.claudeCode) aiTools.push('Claude Code');
  if (env.ai.geminiCLI) aiTools.push('Gemini CLI');
  if (env.ai.ollama) aiTools.push('Ollama');
  if (env.ai.openaiKey) aiTools.push('OpenAI API');

  if (aiTools.length > 0) {
    console.log(`${check} AI tools: ${aiTools.join(', ')}`);
  } else {
    console.log(`${colors.dim('○')} No AI tools detected (optional)`);
  }

  // Package manager
  if (env.packageManager) {
    console.log(`${check} Package manager: ${env.packageManager}`);
  }

  // IDE
  const ides: string[] = [];
  if (env.ide.vscode) ides.push('VS Code');
  if (env.ide.cursor) ides.push('Cursor');

  if (ides.length > 0) {
    console.log(`${check} IDE: ${ides.join(', ')}`);
  }

  console.log();
}

async function runWizardSteps(env: EnvironmentInfo, repoRoot: string | null): Promise<WizardState> {
  // Step 1: Base Configuration
  console.log(colors.info('Step 1/4: Base Configuration'));
  console.log();

  const defaultBranch = repoRoot ? detectDefaultBranch(repoRoot) : 'main';

  const step1 = await inquirer.prompt<{
    baseBranch: string;
    draftPr: boolean;
    branchPrefix: string;
  }>([
    {
      type: 'list',
      name: 'baseBranch',
      message: 'Default base branch for PRs?',
      choices: [
        { name: `${defaultBranch} (detected)`, value: defaultBranch },
        ...(defaultBranch !== 'main' ? [{ name: 'main', value: 'main' }] : []),
        ...(defaultBranch !== 'master' ? [{ name: 'master', value: 'master' }] : []),
        { name: 'develop', value: 'develop' },
        { name: 'Other...', value: '__other__' },
      ],
      default: defaultBranch,
    },
    {
      type: 'confirm',
      name: 'draftPr',
      message: 'Create PRs as drafts by default?',
      default: false,
    },
    {
      type: 'list',
      name: 'branchPrefix',
      message: 'Branch name prefix?',
      choices: [
        { name: 'feat (feature branches)', value: 'feat' },
        { name: 'feature (feature branches)', value: 'feature' },
        { name: 'fix (bug fixes)', value: 'fix' },
        { name: 'None (no prefix)', value: '' },
      ],
      default: 'feat',
    },
  ]);

  let baseBranch = step1.baseBranch;
  if (baseBranch === '__other__') {
    const { customBranch } = await inquirer.prompt<{ customBranch: string }>([
      {
        type: 'input',
        name: 'customBranch',
        message: 'Enter custom base branch name:',
        validate: (input) => input.trim().length > 0 || 'Branch name is required',
      },
    ]);
    baseBranch = customBranch;
  }

  // Step 2: Worktree Location
  console.log();
  console.log(colors.info('Step 2/4: Worktree Location'));
  console.log();

  const step2 = await inquirer.prompt<{
    worktreeLocation: 'sibling' | 'inside' | 'custom';
    worktreePattern: string;
  }>([
    {
      type: 'list',
      name: 'worktreeLocation',
      message: 'Where should worktrees be created?',
      choices: [
        { name: 'Sibling to main repo (../repo.pr42)', value: 'sibling' },
        { name: 'Inside .worktrees folder (.worktrees/pr42)', value: 'inside' },
        { name: 'Custom location...', value: 'custom' },
      ],
      default: 'sibling',
    },
    {
      type: 'list',
      name: 'worktreePattern',
      message: 'Worktree naming pattern?',
      choices: [
        { name: '{repo}.pr{number} (e.g., myapp.pr42)', value: '{repo}.pr{number}' },
        { name: 'pr-{number} (e.g., pr-42)', value: 'pr-{number}' },
        { name: '{branch} (e.g., feat-dark-mode)', value: '{branch}' },
      ],
      default: '{repo}.pr{number}',
    },
  ]);

  let worktreeParent = '..';
  if (step2.worktreeLocation === 'inside') {
    worktreeParent = '.worktrees';
  } else if (step2.worktreeLocation === 'custom') {
    const { customParent } = await inquirer.prompt<{ customParent: string }>([
      {
        type: 'input',
        name: 'customParent',
        message: 'Enter worktree parent directory (absolute or relative to repo):',
        default: '..',
      },
    ]);
    worktreeParent = customParent;
  }

  // Step 3: AI Integration
  console.log();
  console.log(colors.info('Step 3/4: AI Integration'));
  console.log();

  let aiEnabled = false;
  let aiProvider: WizardState['aiProvider'] = 'none';
  let aiBranchName = false;
  let aiPrDescription = false;

  const hasAI = env.ai.claudeCode || env.ai.geminiCLI || env.ai.ollama || env.ai.openaiKey;

  if (hasAI) {
    const detectedProvider = env.ai.claudeCode
      ? 'Claude Code'
      : env.ai.geminiCLI
        ? 'Gemini CLI'
        : env.ai.ollama
          ? 'Ollama'
          : 'OpenAI';

    const step3a = await inquirer.prompt<{ aiChoice: 'yes' | 'configure' | 'no' }>([
      {
        type: 'list',
        name: 'aiChoice',
        message: `${detectedProvider} detected! Enable AI content generation?`,
        choices: [
          { name: `Yes - Use detected provider (${detectedProvider})`, value: 'yes' },
          { name: 'Yes - Configure manually', value: 'configure' },
          { name: 'No - Skip AI features', value: 'no' },
        ],
        default: 'yes',
      },
    ]);

    if (step3a.aiChoice !== 'no') {
      aiEnabled = true;

      if (step3a.aiChoice === 'yes') {
        aiProvider = env.ai.claudeCode
          ? 'auto'
          : env.ai.geminiCLI
            ? 'gemini'
            : env.ai.ollama
              ? 'ollama'
              : 'openai';
      } else {
        const { manualProvider } = await inquirer.prompt<{
          manualProvider: WizardState['aiProvider'];
        }>([
          {
            type: 'list',
            name: 'manualProvider',
            message: 'Select AI provider:',
            choices: [
              { name: 'Auto-detect', value: 'auto' },
              { name: 'Claude', value: 'claude' },
              { name: 'Gemini', value: 'gemini' },
              { name: 'OpenAI', value: 'openai' },
              { name: 'Ollama (local)', value: 'ollama' },
            ],
          },
        ]);
        aiProvider = manualProvider;
      }

      const step3b = await inquirer.prompt<{ aiFeatures: string[] }>([
        {
          type: 'checkbox',
          name: 'aiFeatures',
          message: 'Which AI features would you like to enable?',
          choices: [
            { name: 'Generate branch names from description', value: 'branchName', checked: true },
            {
              name: 'Generate PR descriptions from changes',
              value: 'prDescription',
              checked: true,
            },
          ],
        },
      ]);

      aiBranchName = step3b.aiFeatures.includes('branchName');
      aiPrDescription = step3b.aiFeatures.includes('prDescription');
    }
  } else {
    console.log(colors.dim('No AI tools detected. Skipping AI configuration.'));
    console.log(colors.dim('Install Claude Code, Gemini CLI, or Ollama to enable AI features.'));
  }

  // Step 4: Automation Hooks
  console.log();
  console.log(colors.info('Step 4/4: Automation Hooks'));
  console.log();

  const hookChoices: { name: string; value: string; checked: boolean }[] = [];

  if (env.packageManager) {
    hookChoices.push({
      name: `auto-deps: Run "${getInstallCommand(env.packageManager)}" after worktree creation`,
      value: 'autoDeps',
      checked: true,
    });
  }

  const editorCmd = getEditorCommand(env.ide, 'auto');
  if (editorCmd) {
    const editorName = editorCmd.startsWith('cursor') ? 'Cursor' : 'VS Code';
    hookChoices.push({
      name: `open-editor: Open worktree in ${editorName}`,
      value: 'openEditor',
      checked: false,
    });
  }

  let autoDeps = false;
  let openEditor = false;
  let preferredEditor: 'vscode' | 'cursor' | 'auto' = 'auto';

  if (hookChoices.length > 0) {
    const step4 = await inquirer.prompt<{ hooks: string[] }>([
      {
        type: 'checkbox',
        name: 'hooks',
        message: 'Install automation hooks?',
        choices: hookChoices,
      },
    ]);

    autoDeps = step4.hooks.includes('autoDeps');
    openEditor = step4.hooks.includes('openEditor');

    if (openEditor && env.ide.cursor && env.ide.vscode) {
      const { editorChoice } = await inquirer.prompt<{
        editorChoice: 'vscode' | 'cursor' | 'auto';
      }>([
        {
          type: 'list',
          name: 'editorChoice',
          message: 'Preferred editor?',
          choices: [
            { name: 'VS Code', value: 'vscode' },
            { name: 'Cursor', value: 'cursor' },
            { name: 'Auto-detect', value: 'auto' },
          ],
        },
      ]);
      preferredEditor = editorChoice;
    } else if (env.ide.cursor) {
      preferredEditor = 'cursor';
    } else {
      preferredEditor = 'vscode';
    }
  } else {
    console.log(colors.dim('No automation hooks available for your environment.'));
  }

  // Step 5: Advanced Configuration (optional)
  console.log();
  const { configureAdvanced } = await inquirer.prompt<{ configureAdvanced: boolean }>([
    {
      type: 'confirm',
      name: 'configureAdvanced',
      message: 'Configure advanced settings (plugins, generators, integrations)?',
      default: false,
    },
  ]);

  let plugins: string[] = [];
  const generators: WizardState['generators'] = {};
  const integrations: WizardState['integrations'] = {};

  if (configureAdvanced) {
    console.log();
    console.log(colors.info('Step 5: Advanced Configuration'));
    console.log();

    // Plugins
    const { addPlugins } = await inquirer.prompt<{ addPlugins: boolean }>([
      {
        type: 'confirm',
        name: 'addPlugins',
        message: 'Add plugins (npm packages or local scripts)?',
        default: false,
      },
    ]);

    if (addPlugins) {
      const { pluginList } = await inquirer.prompt<{ pluginList: string }>([
        {
          type: 'input',
          name: 'pluginList',
          message: 'Enter plugin names/paths (comma-separated):',
          default: '',
        },
      ]);
      plugins = pluginList
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    }

    // Custom generators
    const { useGenerators } = await inquirer.prompt<{ useGenerators: boolean }>([
      {
        type: 'confirm',
        name: 'useGenerators',
        message: 'Use custom generator scripts (instead of built-in AI)?',
        default: false,
      },
    ]);

    if (useGenerators) {
      const genPrompts = await inquirer.prompt<{
        branchNameGen: string;
        prTitleGen: string;
        prDescGen: string;
        commitMsgGen: string;
      }>([
        {
          type: 'input',
          name: 'branchNameGen',
          message: 'Branch name generator script path (leave empty to skip):',
          default: '',
        },
        {
          type: 'input',
          name: 'prTitleGen',
          message: 'PR title generator script path (leave empty to skip):',
          default: '',
        },
        {
          type: 'input',
          name: 'prDescGen',
          message: 'PR description generator script path (leave empty to skip):',
          default: '',
        },
        {
          type: 'input',
          name: 'commitMsgGen',
          message: 'Commit message generator script path (leave empty to skip):',
          default: '',
        },
      ]);

      if (genPrompts.branchNameGen) generators.branchName = genPrompts.branchNameGen;
      if (genPrompts.prTitleGen) generators.prTitle = genPrompts.prTitleGen;
      if (genPrompts.prDescGen) generators.prDescription = genPrompts.prDescGen;
      if (genPrompts.commitMsgGen) generators.commitMessage = genPrompts.commitMsgGen;
    }

    // Integrations
    const { integrationsToAdd } = await inquirer.prompt<{ integrationsToAdd: string[] }>([
      {
        type: 'checkbox',
        name: 'integrationsToAdd',
        message: 'Configure integrations?',
        choices: [
          { name: 'Linear (issue tracker)', value: 'linear' },
          { name: 'Jira (issue tracker)', value: 'jira' },
          { name: 'Slack (notifications)', value: 'slack' },
        ],
      },
    ]);

    if (integrationsToAdd.includes('linear')) {
      const linearConfig = await inquirer.prompt<{ teamId: string; apiKeyEnv: string }>([
        {
          type: 'input',
          name: 'teamId',
          message: 'Linear team ID:',
          default: '',
        },
        {
          type: 'input',
          name: 'apiKeyEnv',
          message: 'Environment variable for Linear API key:',
          default: 'LINEAR_API_KEY',
        },
      ]);
      integrations.linear = {
        teamId: linearConfig.teamId || undefined,
        apiKeyEnv: linearConfig.apiKeyEnv || undefined,
      };
    }

    if (integrationsToAdd.includes('jira')) {
      const jiraConfig = await inquirer.prompt<{
        projectKey: string;
        baseUrl: string;
        apiTokenEnv: string;
      }>([
        {
          type: 'input',
          name: 'projectKey',
          message: 'Jira project key (e.g., PROJ):',
          default: '',
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Jira base URL:',
          default: '',
        },
        {
          type: 'input',
          name: 'apiTokenEnv',
          message: 'Environment variable for Jira API token:',
          default: 'JIRA_API_TOKEN',
        },
      ]);
      integrations.jira = {
        projectKey: jiraConfig.projectKey || undefined,
        baseUrl: jiraConfig.baseUrl || undefined,
        apiTokenEnv: jiraConfig.apiTokenEnv || undefined,
      };
    }

    if (integrationsToAdd.includes('slack')) {
      const slackConfig = await inquirer.prompt<{ webhookUrl: string; channel: string }>([
        {
          type: 'input',
          name: 'webhookUrl',
          message: 'Slack webhook URL (or env var name):',
          default: 'SLACK_WEBHOOK_URL',
        },
        {
          type: 'input',
          name: 'channel',
          message: 'Default Slack channel:',
          default: '',
        },
      ]);
      integrations.slack = {
        webhookUrl: slackConfig.webhookUrl || undefined,
        channel: slackConfig.channel || undefined,
      };
    }
  }

  return {
    baseBranch,
    draftPr: step1.draftPr,
    worktreeLocation: step2.worktreeLocation,
    worktreePattern: step2.worktreePattern,
    worktreeParent,
    branchPrefix: step1.branchPrefix,
    preferredEditor,
    aiEnabled,
    aiProvider,
    aiBranchName,
    aiPrDescription,
    hooks: {
      autoDeps,
      openEditor,
    },
    plugins,
    generators,
    integrations,
  };
}

function buildConfigFromState(state: WizardState, env: EnvironmentInfo): WorktreeConfig {
  const config: WorktreeConfig = {};

  // Only include non-default values
  const defaults = getDefaultConfig();

  if (state.baseBranch !== defaults.baseBranch) {
    config.baseBranch = state.baseBranch;
  }

  if (state.draftPr !== defaults.draftPr) {
    config.draftPr = state.draftPr;
  }

  if (state.branchPrefix !== defaults.branchPrefix) {
    config.branchPrefix = state.branchPrefix;
  }

  if (state.worktreePattern !== defaults.worktreePattern) {
    config.worktreePattern = state.worktreePattern;
  }

  if (state.worktreeParent !== defaults.worktreeParent) {
    config.worktreeParent = state.worktreeParent;
  }

  if (state.preferredEditor !== defaults.preferredEditor) {
    config.preferredEditor = state.preferredEditor;
  }

  // AI configuration
  if (state.aiEnabled) {
    config.ai = {
      provider: state.aiProvider,
      branchName: state.aiBranchName,
      prDescription: state.aiPrDescription,
    };
  }

  // Hooks
  const hooks: string[] = [];

  if (state.hooks.autoDeps && env.packageManager) {
    hooks.push(getInstallCommand(env.packageManager));
  }

  if (state.hooks.openEditor) {
    const editorCmd = getEditorCommand(env.ide, state.preferredEditor);
    if (editorCmd) {
      hooks.push(editorCmd);
    }
  }

  if (hooks.length > 0) {
    config.hooks = {
      'post-worktree': hooks.length === 1 ? hooks[0] : hooks,
    };
  }

  // Phase 8: Advanced configuration
  // Plugins
  if (state.plugins && state.plugins.length > 0) {
    config.plugins = state.plugins;
  }

  // Custom generators
  if (state.generators && Object.keys(state.generators).length > 0) {
    config.generators = state.generators;
  }

  // Integrations
  if (state.integrations && Object.keys(state.integrations).length > 0) {
    config.integrations = state.integrations;
  }

  return config;
}
