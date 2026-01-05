/**
 * Interactive Config Editor
 *
 * Provides a TUI for editing .worktreerc configuration with current value detection.
 */

import {
  promptChoice,
  promptInput,
  promptConfirm,
  UserNavigatedBack,
  type PromptOption,
} from './prompts.js';
import { green, dim, cyan, yellow, red, bold } from './colors.js';
import {
  loadConfigWithValidation,
  saveConfig,
  getDefaultConfig,
  type WorktreeConfig,
} from './config.js';
import { validateConfig } from './config-validation.js';
import type { AIConfig } from './ai/types.js';
import type { HooksConfig } from './hooks/types.js';

/**
 * Result from the config editor
 */
export interface ConfigEditorResult {
  saved: boolean;
  configPath?: string;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown, defaultValue?: unknown): string {
  if (value === undefined || value === null) {
    return dim('(not set)');
  }

  const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

  if (defaultValue !== undefined && JSON.stringify(value) === JSON.stringify(defaultValue)) {
    return `${valueStr} ${dim('(default)')}`;
  }

  return green(valueStr);
}

/**
 * Get a nested value from an object by dot-separated path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a nested value in an object by dot-separated path
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Config property definition
 */
interface ConfigProperty {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'boolean' | 'number' | 'array' | 'enum' | 'object';
  enumValues?: string[];
  defaultValue?: unknown;
}

/**
 * Config category definition
 */
interface ConfigCategory {
  key: string;
  label: string;
  description: string;
  properties: ConfigProperty[];
}

/**
 * Define all config categories and properties
 */
const CONFIG_CATEGORIES: ConfigCategory[] = [
  {
    key: 'basic',
    label: 'Basic Settings',
    description: 'Core worktree and branch settings',
    properties: [
      {
        key: 'baseBranch',
        label: 'Base Branch',
        description: 'Default base branch for PRs (e.g., main, develop)',
        type: 'string',
        defaultValue: 'main',
      },
      {
        key: 'branchPrefix',
        label: 'Branch Prefix',
        description: 'Prefix for auto-generated branch names (e.g., feat, fix)',
        type: 'string',
        defaultValue: 'feat',
      },
      {
        key: 'draftPr',
        label: 'Draft PRs',
        description: 'Create PRs as drafts by default',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'preferredEditor',
        label: 'Preferred Editor',
        description: 'Editor for "Open in editor" action',
        type: 'enum',
        enumValues: ['vscode', 'cursor', 'auto'],
        defaultValue: 'vscode',
      },
    ],
  },
  {
    key: 'worktree',
    label: 'Worktree Settings',
    description: 'Control worktree location and naming',
    properties: [
      {
        key: 'worktreePattern',
        label: 'Naming Pattern',
        description: 'Pattern for worktree directory names ({repo}, {number}, {branch})',
        type: 'string',
        defaultValue: '{repo}.pr{number}',
      },
      {
        key: 'worktreeParent',
        label: 'Parent Directory',
        description: 'Where to create worktrees (relative or absolute path)',
        type: 'string',
        defaultValue: '..',
      },
      {
        key: 'sharedRepos',
        label: 'Shared Repos',
        description: 'Sibling repos to also create worktrees for',
        type: 'array',
        defaultValue: [],
      },
      {
        key: 'syncPatterns',
        label: 'Sync Patterns',
        description: 'Gitignored files to sync via hard links',
        type: 'array',
        defaultValue: [],
      },
    ],
  },
  {
    key: 'ai',
    label: 'AI Settings',
    description: 'AI content generation configuration',
    properties: [
      {
        key: 'ai.provider',
        label: 'Provider',
        description: 'AI provider to use',
        type: 'enum',
        enumValues: ['auto', 'claude', 'gemini', 'openai', 'ollama', 'script', 'none'],
        defaultValue: 'none',
      },
      {
        key: 'ai.fallback',
        label: 'Fallback Provider',
        description: 'Fallback if primary fails',
        type: 'enum',
        enumValues: ['auto', 'claude', 'gemini', 'openai', 'ollama', 'script', 'none'],
        defaultValue: undefined,
      },
      {
        key: 'ai.branchName',
        label: 'Branch Names',
        description: 'Use AI for branch name generation',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'ai.prTitle',
        label: 'PR Titles',
        description: 'Use AI for PR title generation',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'ai.prDescription',
        label: 'PR Descriptions',
        description: 'Use AI for PR description generation',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'ai.commitMessage',
        label: 'Commit Messages',
        description: 'Use AI for commit message generation',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'ai.planDocument',
        label: 'Plan Documents',
        description: 'Use AI for plan document generation',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'ai.branchStyle',
        label: 'Branch Style',
        description: 'Branch naming style',
        type: 'enum',
        enumValues: ['conventional', 'kebab', 'snake'],
        defaultValue: 'kebab',
      },
      {
        key: 'ai.commitStyle',
        label: 'Commit Style',
        description: 'Commit message style',
        type: 'enum',
        enumValues: ['conventional', 'gitmoji', 'simple'],
        defaultValue: 'conventional',
      },
    ],
  },
  {
    key: 'hooks',
    label: 'Lifecycle Hooks',
    description: 'Commands to run at various workflow stages',
    properties: [
      {
        key: 'hooks.pre-analyze',
        label: 'Pre-Analyze',
        description: 'Run before git state analysis',
        type: 'string',
      },
      {
        key: 'hooks.post-analyze',
        label: 'Post-Analyze',
        description: 'Run after git state analysis',
        type: 'string',
      },
      {
        key: 'hooks.pre-branch',
        label: 'Pre-Branch',
        description: 'Run before branch creation',
        type: 'string',
      },
      {
        key: 'hooks.post-branch',
        label: 'Post-Branch',
        description: 'Run after branch creation',
        type: 'string',
      },
      {
        key: 'hooks.pre-commit',
        label: 'Pre-Commit',
        description: 'Run before commit',
        type: 'string',
      },
      {
        key: 'hooks.post-commit',
        label: 'Post-Commit',
        description: 'Run after commit',
        type: 'string',
      },
      {
        key: 'hooks.pre-push',
        label: 'Pre-Push',
        description: 'Run before push',
        type: 'string',
      },
      {
        key: 'hooks.post-push',
        label: 'Post-Push',
        description: 'Run after push',
        type: 'string',
      },
      {
        key: 'hooks.pre-pr',
        label: 'Pre-PR',
        description: 'Run before PR creation',
        type: 'string',
      },
      {
        key: 'hooks.post-pr',
        label: 'Post-PR',
        description: 'Run after PR creation',
        type: 'string',
      },
      {
        key: 'hooks.pre-worktree',
        label: 'Pre-Worktree',
        description: 'Run before worktree creation',
        type: 'string',
      },
      {
        key: 'hooks.post-worktree',
        label: 'Post-Worktree',
        description: 'Run after worktree creation (e.g., npm install)',
        type: 'string',
      },
      {
        key: 'hooks.cleanup',
        label: 'Cleanup',
        description: 'Run during cleanup operations',
        type: 'string',
      },
    ],
  },
  {
    key: 'hookDefaults',
    label: 'Hook Defaults',
    description: 'Default settings for hook execution',
    properties: [
      {
        key: 'hookDefaults.timeout',
        label: 'Default Timeout',
        description: 'Default timeout in milliseconds (30000)',
        type: 'number',
        defaultValue: 30000,
      },
      {
        key: 'hookDefaults.maxTimeout',
        label: 'Max Timeout',
        description: 'Maximum timeout in milliseconds (60000)',
        type: 'number',
        defaultValue: 60000,
      },
    ],
  },
  {
    key: 'generators',
    label: 'Custom Generators',
    description: 'Custom scripts for content generation',
    properties: [
      {
        key: 'generators.branchName',
        label: 'Branch Name',
        description: 'Script path for branch name generation',
        type: 'string',
      },
      {
        key: 'generators.prTitle',
        label: 'PR Title',
        description: 'Script path for PR title generation',
        type: 'string',
      },
      {
        key: 'generators.prDescription',
        label: 'PR Description',
        description: 'Script path for PR description generation',
        type: 'string',
      },
      {
        key: 'generators.commitMessage',
        label: 'Commit Message',
        description: 'Script path for commit message generation',
        type: 'string',
      },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    description: 'Third-party service integrations',
    properties: [
      {
        key: 'integrations.linear.teamId',
        label: 'Linear Team ID',
        description: 'Linear team ID for issue linking',
        type: 'string',
      },
      {
        key: 'integrations.linear.apiKeyEnv',
        label: 'Linear API Key Env',
        description: 'Environment variable for Linear API key',
        type: 'string',
        defaultValue: 'LINEAR_API_KEY',
      },
      {
        key: 'integrations.jira.projectKey',
        label: 'Jira Project Key',
        description: 'Jira project key (e.g., PROJ)',
        type: 'string',
      },
      {
        key: 'integrations.jira.baseUrl',
        label: 'Jira Base URL',
        description: 'Jira instance base URL',
        type: 'string',
      },
      {
        key: 'integrations.jira.apiTokenEnv',
        label: 'Jira API Token Env',
        description: 'Environment variable for Jira API token',
        type: 'string',
        defaultValue: 'JIRA_API_TOKEN',
      },
      {
        key: 'integrations.slack.webhookUrl',
        label: 'Slack Webhook URL',
        description: 'Slack webhook URL or env var name',
        type: 'string',
      },
      {
        key: 'integrations.slack.channel',
        label: 'Slack Channel',
        description: 'Default Slack channel for notifications',
        type: 'string',
      },
    ],
  },
  {
    key: 'plugins',
    label: 'Plugins',
    description: 'Plugin packages to load',
    properties: [
      {
        key: 'plugins',
        label: 'Plugin List',
        description: 'npm packages or local plugin file paths',
        type: 'array',
        defaultValue: [],
      },
    ],
  },
];

/**
 * Main interactive config editor
 */
export async function runConfigEditor(repoRoot: string): Promise<ConfigEditorResult> {
  console.log();
  console.log(bold(cyan('Configuration Editor')));
  console.log();

  // Load current config
  const {
    config: currentConfig,
    configPath,
    validation,
  } = loadConfigWithValidation(repoRoot, {
    warnOnErrors: false,
  });

  const defaults = getDefaultConfig();

  // Track modifications
  const modifiedConfig: WorktreeConfig = {};
  let hasChanges = false;

  // Show config source
  if (configPath) {
    console.log(dim(`Editing: ${configPath}`));
  } else {
    console.log(dim('No config file found. Changes will create a new .worktreerc'));
  }

  // Show validation warnings if any
  if (validation && !validation.valid) {
    console.log(yellow('\nValidation warnings:'));
    for (const error of validation.errors.slice(0, 3)) {
      console.log(yellow(`  ${error.path}: ${error.message}`));
    }
    if (validation.errors.length > 3) {
      console.log(yellow(`  ... and ${validation.errors.length - 3} more`));
    }
  }

  console.log();

  // Main menu loop
  try {
    while (true) {
      const categoryOptions: PromptOption<string>[] = CONFIG_CATEGORIES.map((cat) => {
        // Count configured properties in this category
        const configuredCount = cat.properties.filter((prop) => {
          const value = getNestedValue(currentConfig as Record<string, unknown>, prop.key);
          return value !== undefined && value !== null;
        }).length;

        const countStr = configuredCount > 0 ? ` (${configuredCount} set)` : '';

        return {
          label: `${cat.label}${countStr}`,
          description: cat.description,
          value: cat.key,
        };
      });

      // Add save and exit options
      categoryOptions.push({
        label: hasChanges ? green('Save and Exit') : 'Exit',
        description: hasChanges ? 'Save changes to config file' : 'Exit without changes',
        value: '__exit__',
      });

      if (hasChanges) {
        categoryOptions.push({
          label: 'Discard Changes',
          description: 'Exit without saving',
          value: '__discard__',
        });
      }

      const categoryChoice = await promptChoice('Select a category to configure:', categoryOptions);

      if (categoryChoice === '__exit__') {
        if (hasChanges) {
          // Save changes
          try {
            const result = saveConfig(repoRoot, modifiedConfig);
            console.log(green(`\nConfiguration saved to ${result.configPath}`));
            return { saved: true, configPath: result.configPath };
          } catch (error) {
            console.log(
              red(`\nFailed to save: ${error instanceof Error ? error.message : String(error)}`)
            );
            continue;
          }
        }
        return { saved: false };
      }

      if (categoryChoice === '__discard__') {
        console.log(dim('\nChanges discarded.'));
        return { saved: false };
      }

      // Edit category
      const category = CONFIG_CATEGORIES.find((c) => c.key === categoryChoice);
      if (category) {
        const changed = await editCategory(category, currentConfig, modifiedConfig, defaults);
        if (changed) {
          hasChanges = true;
        }
      }
    }
  } catch (error) {
    if (error instanceof UserNavigatedBack) {
      // User backed out of main menu
      if (hasChanges) {
        const save = await promptConfirm('Save changes before exiting?', true);
        if (save) {
          try {
            const result = saveConfig(repoRoot, modifiedConfig);
            console.log(green(`\nConfiguration saved to ${result.configPath}`));
            return { saved: true, configPath: result.configPath };
          } catch (saveError) {
            console.log(
              red(
                `\nFailed to save: ${saveError instanceof Error ? saveError.message : String(saveError)}`
              )
            );
          }
        }
      }
      return { saved: false };
    }
    throw error;
  }
}

/**
 * Edit a config category
 */
async function editCategory(
  category: ConfigCategory,
  currentConfig: Required<WorktreeConfig>,
  modifiedConfig: WorktreeConfig,
  defaults: Required<WorktreeConfig>
): Promise<boolean> {
  let hasChanges = false;

  try {
    while (true) {
      console.log();
      console.log(bold(category.label));
      console.log(dim(category.description));
      console.log();

      const propertyOptions: PromptOption<string>[] = category.properties.map((prop) => {
        const currentValue = getNestedValue(currentConfig as Record<string, unknown>, prop.key);
        const defaultValue = getNestedValue(defaults as Record<string, unknown>, prop.key);
        const modifiedValue = getNestedValue(modifiedConfig as Record<string, unknown>, prop.key);

        const displayValue = modifiedValue !== undefined ? modifiedValue : currentValue;
        const valueStr = formatValue(displayValue, defaultValue);

        return {
          label: `${prop.label}: ${valueStr}`,
          description: prop.description,
          value: prop.key,
        };
      });

      propertyOptions.push({
        label: '← Back',
        description: 'Return to main menu',
        value: '__back__',
      });

      const propertyChoice = await promptChoice('Select a property to edit:', propertyOptions);

      if (propertyChoice === '__back__') {
        return hasChanges;
      }

      const property = category.properties.find((p) => p.key === propertyChoice);
      if (property) {
        const currentValue = getNestedValue(currentConfig as Record<string, unknown>, property.key);
        const changed = await editProperty(property, currentValue, modifiedConfig);
        if (changed) {
          hasChanges = true;
          // Update currentConfig to reflect the change for display
          setNestedValue(
            currentConfig as Record<string, unknown>,
            property.key,
            getNestedValue(modifiedConfig as Record<string, unknown>, property.key)
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof UserNavigatedBack) {
      return hasChanges;
    }
    throw error;
  }
}

/**
 * Edit a single property
 */
async function editProperty(
  property: ConfigProperty,
  currentValue: unknown,
  modifiedConfig: WorktreeConfig
): Promise<boolean> {
  console.log();
  console.log(bold(property.label));
  console.log(dim(property.description));
  if (property.defaultValue !== undefined) {
    console.log(dim(`Default: ${JSON.stringify(property.defaultValue)}`));
  }
  console.log();

  try {
    let newValue: unknown;

    switch (property.type) {
      case 'boolean': {
        const current = currentValue as boolean | undefined;
        newValue = await promptConfirm(`Enable ${property.label}?`, current ?? false);
        break;
      }

      case 'enum': {
        const options: PromptOption<string | undefined>[] = (property.enumValues || []).map(
          (v) => ({
            label: v,
            description: v === currentValue ? '(current)' : undefined,
            value: v,
          })
        );

        // Add option to clear/unset
        options.push({
          label: dim('(clear value)'),
          description: 'Remove this setting',
          value: undefined,
        });

        newValue = await promptChoice(`Select ${property.label}:`, options);
        break;
      }

      case 'number': {
        const input = await promptInput(
          `Enter ${property.label}:`,
          currentValue !== undefined ? String(currentValue) : undefined
        );

        if (input === '' || input === undefined) {
          newValue = undefined;
        } else {
          const num = parseInt(input, 10);
          if (isNaN(num)) {
            console.log(red('Invalid number. Value not changed.'));
            return false;
          }
          newValue = num;
        }
        break;
      }

      case 'array': {
        const currentArray = Array.isArray(currentValue) ? currentValue : [];
        console.log(
          `Current values: ${currentArray.length > 0 ? currentArray.join(', ') : dim('(none)')}`
        );

        const input = await promptInput(
          'Enter values (comma-separated, empty to clear):',
          currentArray.join(', ')
        );

        if (input === '' || input === undefined) {
          newValue = [];
        } else {
          newValue = input
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        }
        break;
      }

      case 'string':
      default: {
        const input = await promptInput(
          `Enter ${property.label}:`,
          currentValue !== undefined ? String(currentValue) : undefined
        );

        newValue = input === '' ? undefined : input;
        break;
      }
    }

    // Check if value actually changed
    if (JSON.stringify(newValue) === JSON.stringify(currentValue)) {
      console.log(dim('Value unchanged.'));
      return false;
    }

    // Set the new value
    setNestedValue(modifiedConfig as Record<string, unknown>, property.key, newValue);

    // Validate the change
    const validation = validateConfig(modifiedConfig);
    if (!validation.valid) {
      const relevantErrors = validation.errors.filter((e) => e.path.startsWith(property.key));
      if (relevantErrors.length > 0) {
        console.log(yellow('\nWarning: This value may cause issues:'));
        for (const error of relevantErrors) {
          console.log(yellow(`  ${error.message}`));
        }
      }
    }

    console.log(green(`\n${property.label} updated.`));
    return true;
  } catch (error) {
    if (error instanceof UserNavigatedBack) {
      return false;
    }
    throw error;
  }
}

/**
 * Quick config value editor - for single value changes
 */
export async function quickEditConfig(
  repoRoot: string,
  key: string,
  value?: string
): Promise<ConfigEditorResult> {
  const { config: currentConfig } = loadConfigWithValidation(repoRoot, { warnOnErrors: false });

  // Find the property definition
  let property: ConfigProperty | undefined;
  for (const category of CONFIG_CATEGORIES) {
    property = category.properties.find((p) => p.key === key);
    if (property) break;
  }

  if (!property) {
    console.log(red(`Unknown config key: ${key}`));
    console.log(dim('Use "wt config edit" to see available options.'));
    return { saved: false };
  }

  const currentValue = getNestedValue(currentConfig as Record<string, unknown>, key);
  const modifiedConfig: WorktreeConfig = {};

  // If value is provided, use it directly
  if (value !== undefined) {
    let parsedValue: unknown;

    switch (property.type) {
      case 'boolean':
        parsedValue = value.toLowerCase() === 'true' || value === '1';
        break;
      case 'number':
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue as number)) {
          console.log(red('Invalid number value.'));
          return { saved: false };
        }
        break;
      case 'array':
        parsedValue = value
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        break;
      default:
        parsedValue = value;
    }

    setNestedValue(modifiedConfig as Record<string, unknown>, key, parsedValue);
  } else {
    // Interactive edit
    const changed = await editProperty(property, currentValue, modifiedConfig);
    if (!changed) {
      return { saved: false };
    }
  }

  // Save
  try {
    const result = saveConfig(repoRoot, modifiedConfig);
    console.log(green(`Saved to ${result.configPath}`));
    return { saved: true, configPath: result.configPath };
  } catch (error) {
    console.log(red(`Failed to save: ${error instanceof Error ? error.message : String(error)}`));
    return { saved: false };
  }
}
