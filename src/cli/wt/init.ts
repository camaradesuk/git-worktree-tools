/**
 * wt init - Initialize git-worktree-tools configuration
 *
 * Creates config files and ensures proper .gitignore entries.
 */

import type { CommandModule } from 'yargs';
import * as git from '../../lib/git.js';
import * as colors from '../../lib/colors.js';
import {
  initializeLocalConfig,
  saveGlobalConfig,
  getConfigSummary,
} from '../../lib/global-config.js';
import type { WorktreeConfig, LoggingConfig } from '../../lib/config.js';
import { promptChoice, promptConfirm, promptInput, type PromptOption } from '../../lib/prompts.js';

interface InitArgs {
  local?: boolean;
  global?: boolean;
  force?: boolean;
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

export const initCommand: CommandModule<object, InitArgs> = {
  command: 'init',
  describe: 'Initialize git-worktree-tools configuration',
  builder: (yargs) => {
    return yargs
      .option('local', {
        alias: 'l',
        type: 'boolean',
        description: 'Create local config (.worktreerc.local) - gitignored, for personal settings',
      })
      .option('global', {
        alias: 'g',
        type: 'boolean',
        description: 'Create global config (~/.config/git-worktree-tools/config.json)',
      })
      .option('force', {
        alias: 'f',
        type: 'boolean',
        description: 'Overwrite existing config files',
        default: false,
      })
      .example('$0 init', 'Interactive initialization')
      .example('$0 init --local', 'Create local config (gitignored)')
      .example('$0 init --global', 'Create global config');
  },
  handler: async (argv) => {
    const repoRoot = getRepoRoot();
    const summary = getConfigSummary(repoRoot ?? undefined);

    // If no flags specified, show interactive menu
    if (!argv.local && !argv.global) {
      await handleInteractiveInit(repoRoot, summary, argv.force ?? false);
      return;
    }

    // Handle specific init types
    if (argv.local) {
      if (!repoRoot) {
        console.error(colors.error('Not in a git repository.'));
        console.log(
          colors.dim('Run this command from within a git repository to create local config.')
        );
        process.exit(1);
      }

      if (summary.local && !argv.force) {
        console.log(colors.warning('Local config already exists: ') + summary.paths.local?.path);
        console.log(colors.dim('Use --force to overwrite.'));
        return;
      }

      await createLocalConfig(repoRoot);
    }

    if (argv.global) {
      if (summary.global && !argv.force) {
        console.log(colors.warning('Global config already exists: ') + summary.paths.global.path);
        console.log(colors.dim('Use --force to overwrite.'));
        return;
      }

      await createGlobalConfig();
    }
  },
};

/**
 * Interactive initialization
 */
async function handleInteractiveInit(
  repoRoot: string | null,
  summary: ReturnType<typeof getConfigSummary>,
  force: boolean
): Promise<void> {
  console.log(colors.bold('\n🔧 git-worktree-tools Configuration Setup\n'));

  // Show current status
  console.log(colors.info('Current configuration status:'));
  console.log(
    `  ${summary.global ? colors.success('✓') : colors.dim('○')} Global: ${summary.paths.global.path}`
  );
  if (repoRoot) {
    console.log(
      `  ${summary.repo ? colors.success('✓') : colors.dim('○')} Repo:   ${summary.paths.repo?.path ?? 'N/A'}`
    );
    console.log(
      `  ${summary.local ? colors.success('✓') : colors.dim('○')} Local:  ${summary.paths.local?.path ?? 'N/A'}`
    );
  } else {
    console.log(colors.dim('  (Not in a git repository - repo/local configs unavailable)'));
  }
  console.log();

  // Build choices based on context
  const choices: PromptOption<string>[] = [];

  if (!summary.global || force) {
    choices.push({
      label: `Create global config (applies to all repos for this user)`,
      value: 'global',
    });
  }

  if (repoRoot) {
    if (!summary.local || force) {
      choices.push({
        label: `Create local config (personal settings, gitignored)`,
        value: 'local',
      });
    }

    if (summary.local && !summary.repo) {
      choices.push({
        label: `Update .gitignore with local config patterns`,
        value: 'gitignore',
      });
    }
  }

  choices.push({ label: 'Cancel', value: 'cancel' });

  if (choices.length === 1) {
    console.log(colors.success('All configuration files are already set up!'));
    console.log(colors.dim('\nConfig priority: local > repo > global'));
    console.log(colors.dim('Use "wt config" to edit configuration.'));
    return;
  }

  const action = await promptChoice('What would you like to do?', choices);

  switch (action) {
    case 'global':
      await createGlobalConfig();
      break;
    case 'local':
      if (repoRoot) {
        await createLocalConfig(repoRoot);
      }
      break;
    case 'gitignore':
      if (repoRoot) {
        const { ensureLocalConfigInGitignore } = await import('../../lib/global-config.js');
        const updated = ensureLocalConfigInGitignore(repoRoot);
        if (updated) {
          console.log(colors.success('✓ Updated .gitignore'));
        } else {
          console.log(colors.dim('No changes needed to .gitignore'));
        }
      }
      break;
    case 'cancel':
      console.log(colors.dim('Cancelled.'));
      break;
  }
}

/**
 * Create local config file
 */
async function createLocalConfig(repoRoot: string): Promise<void> {
  console.log(colors.info('Creating local config...'));

  // Ask for initial settings
  const includeLogging = await promptConfirm('Include logging configuration?', false);

  const initialConfig: WorktreeConfig = {};

  if (includeLogging) {
    const logLevelOptions: PromptOption<LoggingConfig['level']>[] = [
      { label: 'silent', value: 'silent' },
      { label: 'error', value: 'error' },
      { label: 'warn', value: 'warn' },
      { label: 'info (default)', value: 'info' },
      { label: 'debug', value: 'debug' },
      { label: 'trace', value: 'trace' },
    ];
    const logLevel = await promptChoice('Default log level:', logLevelOptions);
    initialConfig.logging = {
      level: logLevel,
    };
  }

  const result = initializeLocalConfig(repoRoot, initialConfig);

  console.log(colors.success(`✓ Created local config: ${result.configPath}`));
  if (result.gitignoreUpdated) {
    console.log(colors.success('✓ Updated .gitignore with local config patterns'));
  }

  console.log();
  console.log(
    colors.dim('Local config is for personal settings that override repo/global configs.')
  );
  console.log(colors.dim('Edit with: wt config edit'));
}

/**
 * Create global config file
 */
async function createGlobalConfig(): Promise<void> {
  console.log(colors.info('Creating global config...'));

  // Ask for initial settings
  const warnNotGlobal = await promptConfirm(
    'Warn if git-worktree-tools is not installed globally?',
    true
  );

  const defaultBaseBranch = await promptInput('Default base branch:', 'main');

  const editorOptions: PromptOption<'vscode' | 'cursor' | 'auto'>[] = [
    { label: 'VS Code', value: 'vscode' },
    { label: 'Cursor', value: 'cursor' },
    { label: 'Auto-detect', value: 'auto' },
  ];
  const preferredEditor = await promptChoice('Preferred editor:', editorOptions);

  const config: WorktreeConfig = {
    baseBranch: defaultBaseBranch !== 'main' ? defaultBaseBranch : undefined,
    preferredEditor: preferredEditor !== 'vscode' ? preferredEditor : undefined,
    global: {
      warnNotGlobal,
    },
  };

  saveGlobalConfig(config);

  const { getGlobalConfigPath } = await import('../../lib/global-config.js');
  console.log(colors.success(`✓ Created global config: ${getGlobalConfigPath()}`));
  console.log();
  console.log(colors.dim('Global config provides defaults for all repositories.'));
  console.log(colors.dim('Edit with: wt config edit --global'));
}
