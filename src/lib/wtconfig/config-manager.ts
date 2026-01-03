/**
 * Configuration Manager
 *
 * Handles reading, writing, and managing configuration files.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { WorktreeConfig } from '../config.js';
import type {
  ConfigSource,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types.js';
import { CONFIG_FILE_NAMES } from '../constants.js';

/**
 * Path to global config file
 */
export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), '.worktreerc');
}

/**
 * Find repository config file
 */
export function findRepoConfigPath(repoRoot: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = path.join(repoRoot, fileName);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Get default repo config path (preferred name)
 */
export function getDefaultRepoConfigPath(repoRoot: string): string {
  return path.join(repoRoot, '.worktreerc');
}

/**
 * Get configuration source information
 */
export function getConfigSource(repoRoot?: string): ConfigSource {
  // Check repository config
  if (repoRoot) {
    const repoConfig = findRepoConfigPath(repoRoot);
    if (repoConfig) {
      return { type: 'repository', path: repoConfig };
    }
  }

  // Check global config
  const globalPath = getGlobalConfigPath();
  if (fs.existsSync(globalPath)) {
    return { type: 'global', path: globalPath };
  }

  return { type: 'none', path: null };
}

/**
 * Load configuration from a specific path
 */
export function loadConfigFromPath(configPath: string): WorktreeConfig | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Load global configuration
 */
export function loadGlobalConfig(): WorktreeConfig | null {
  return loadConfigFromPath(getGlobalConfigPath());
}

/**
 * Load repository configuration
 */
export function loadRepoConfig(repoRoot: string): WorktreeConfig | null {
  const configPath = findRepoConfigPath(repoRoot);
  if (!configPath) return null;
  return loadConfigFromPath(configPath);
}

/**
 * Load merged configuration (global + repo + defaults)
 */
export function loadMergedConfig(repoRoot?: string): WorktreeConfig {
  const global = loadGlobalConfig() || {};
  const repo = repoRoot ? loadRepoConfig(repoRoot) || {} : {};

  // Deep merge: repo overrides global
  return deepMerge(global, repo);
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };

  for (const key in override) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      const baseValue = (base as Record<string, unknown>)[key];
      const overrideValue = override[key];

      if (
        overrideValue !== null &&
        typeof overrideValue === 'object' &&
        !Array.isArray(overrideValue) &&
        baseValue !== null &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        // Deep merge objects
        (result as Record<string, unknown>)[key] = deepMerge(
          baseValue as object,
          overrideValue as object
        );
      } else {
        (result as Record<string, unknown>)[key] = overrideValue;
      }
    }
  }

  return result;
}

/**
 * Save configuration to a file
 */
export function saveConfig(configPath: string, config: WorktreeConfig): void {
  const content = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(configPath, content, 'utf8');
}

/**
 * Save global configuration
 */
export function saveGlobalConfig(config: WorktreeConfig): void {
  saveConfig(getGlobalConfigPath(), config);
}

/**
 * Save repository configuration
 */
export function saveRepoConfig(repoRoot: string, config: WorktreeConfig): void {
  const configPath = findRepoConfigPath(repoRoot) || getDefaultRepoConfigPath(repoRoot);
  saveConfig(configPath, config);
}

/**
 * Set a single configuration value using dot notation
 *
 * @param config - Current configuration
 * @param path - Dot-notation path (e.g., "ai.provider")
 * @param value - Value to set (parsed from string)
 */
export function setConfigValue(
  config: WorktreeConfig,
  keyPath: string,
  value: string
): WorktreeConfig {
  const parts = keyPath.split('.');
  const result = { ...config };

  // Navigate to the parent object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    } else if (typeof current[part] !== 'object') {
      // Can't set nested value on non-object
      throw new Error(`Cannot set ${keyPath}: ${parts.slice(0, i + 1).join('.')} is not an object`);
    } else {
      current[part] = { ...current[part] };
    }
    current = current[part];
  }

  // Set the value
  const lastKey = parts[parts.length - 1];
  current[lastKey] = parseValue(value);

  return result;
}

/**
 * Get a configuration value using dot notation
 */
export function getConfigValue(config: WorktreeConfig, keyPath: string): unknown {
  const parts = keyPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = config;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Parse a string value to appropriate type
 */
function parseValue(value: string): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  // JSON array or object
  if (
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('{') && value.endsWith('}'))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      // Return as string
    }
  }

  // String
  return value;
}

/**
 * Validate configuration
 */
export function validateConfig(config: WorktreeConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate baseBranch
  if (config.baseBranch !== undefined && typeof config.baseBranch !== 'string') {
    errors.push({ path: 'baseBranch', message: 'Must be a string' });
  }

  // Validate draftPr
  if (config.draftPr !== undefined && typeof config.draftPr !== 'boolean') {
    errors.push({ path: 'draftPr', message: 'Must be a boolean' });
  }

  // Validate worktreePattern
  if (config.worktreePattern !== undefined) {
    if (typeof config.worktreePattern !== 'string') {
      errors.push({ path: 'worktreePattern', message: 'Must be a string' });
    } else if (
      !config.worktreePattern.includes('{number}') &&
      !config.worktreePattern.includes('{branch}')
    ) {
      warnings.push({
        path: 'worktreePattern',
        message: 'Pattern should include {number} or {branch} placeholder for uniqueness',
      });
    }
  }

  // Validate worktreeParent
  if (config.worktreeParent !== undefined && typeof config.worktreeParent !== 'string') {
    errors.push({ path: 'worktreeParent', message: 'Must be a string' });
  }

  // Validate branchPrefix
  if (config.branchPrefix !== undefined) {
    if (typeof config.branchPrefix !== 'string') {
      errors.push({ path: 'branchPrefix', message: 'Must be a string' });
    } else if (!/^[a-z][a-z0-9-]*$/.test(config.branchPrefix)) {
      warnings.push({
        path: 'branchPrefix',
        message: 'Should be lowercase alphanumeric with hyphens',
      });
    }
  }

  // Validate preferredEditor
  if (config.preferredEditor !== undefined) {
    if (!['vscode', 'cursor', 'auto'].includes(config.preferredEditor)) {
      errors.push({
        path: 'preferredEditor',
        message: 'Must be "vscode", "cursor", or "auto"',
      });
    }
  }

  // Validate sharedRepos
  if (config.sharedRepos !== undefined) {
    if (!Array.isArray(config.sharedRepos)) {
      errors.push({ path: 'sharedRepos', message: 'Must be an array' });
    } else if (!config.sharedRepos.every((r) => typeof r === 'string')) {
      errors.push({ path: 'sharedRepos', message: 'All items must be strings' });
    }
  }

  // Validate syncPatterns
  if (config.syncPatterns !== undefined) {
    if (!Array.isArray(config.syncPatterns)) {
      errors.push({ path: 'syncPatterns', message: 'Must be an array' });
    } else if (!config.syncPatterns.every((r) => typeof r === 'string')) {
      errors.push({ path: 'syncPatterns', message: 'All items must be strings' });
    }
  }

  // Validate AI config
  if (config.ai !== undefined) {
    if (typeof config.ai !== 'object' || config.ai === null) {
      errors.push({ path: 'ai', message: 'Must be an object' });
    } else {
      const validProviders = ['auto', 'claude', 'gemini', 'openai', 'ollama', 'fallback', 'none'];
      if (config.ai.provider !== undefined && !validProviders.includes(config.ai.provider)) {
        errors.push({
          path: 'ai.provider',
          message: `Must be one of: ${validProviders.join(', ')}`,
        });
      }
    }
  }

  // Validate hooks config
  if (config.hooks !== undefined) {
    if (typeof config.hooks !== 'object' || config.hooks === null) {
      errors.push({ path: 'hooks', message: 'Must be an object' });
    }
  }

  // Validate plugins
  if (config.plugins !== undefined) {
    if (!Array.isArray(config.plugins)) {
      errors.push({ path: 'plugins', message: 'Must be an array' });
    } else if (!config.plugins.every((p) => typeof p === 'string')) {
      errors.push({
        path: 'plugins',
        message: 'All items must be strings (npm package names or paths)',
      });
    }
  }

  // Validate generators
  if (config.generators !== undefined) {
    if (typeof config.generators !== 'object' || config.generators === null) {
      errors.push({ path: 'generators', message: 'Must be an object' });
    } else {
      const validKeys = ['branchName', 'prTitle', 'prDescription', 'commitMessage'];
      for (const key of Object.keys(config.generators)) {
        if (!validKeys.includes(key)) {
          warnings.push({
            path: `generators.${key}`,
            message: `Unknown generator key. Valid keys: ${validKeys.join(', ')}`,
          });
        }
        const value = config.generators[key as keyof typeof config.generators];
        if (value !== undefined && typeof value !== 'string') {
          errors.push({
            path: `generators.${key}`,
            message: 'Must be a string (path to generator script)',
          });
        }
      }
    }
  }

  // Validate integrations
  if (config.integrations !== undefined) {
    if (typeof config.integrations !== 'object' || config.integrations === null) {
      errors.push({ path: 'integrations', message: 'Must be an object' });
    } else {
      // Validate linear integration
      if (config.integrations.linear !== undefined) {
        if (typeof config.integrations.linear !== 'object' || config.integrations.linear === null) {
          errors.push({ path: 'integrations.linear', message: 'Must be an object' });
        } else {
          if (
            config.integrations.linear.teamId !== undefined &&
            typeof config.integrations.linear.teamId !== 'string'
          ) {
            errors.push({ path: 'integrations.linear.teamId', message: 'Must be a string' });
          }
          if (
            config.integrations.linear.apiKeyEnv !== undefined &&
            typeof config.integrations.linear.apiKeyEnv !== 'string'
          ) {
            errors.push({ path: 'integrations.linear.apiKeyEnv', message: 'Must be a string' });
          }
        }
      }

      // Validate jira integration
      if (config.integrations.jira !== undefined) {
        if (typeof config.integrations.jira !== 'object' || config.integrations.jira === null) {
          errors.push({ path: 'integrations.jira', message: 'Must be an object' });
        } else {
          if (
            config.integrations.jira.projectKey !== undefined &&
            typeof config.integrations.jira.projectKey !== 'string'
          ) {
            errors.push({ path: 'integrations.jira.projectKey', message: 'Must be a string' });
          }
          if (
            config.integrations.jira.baseUrl !== undefined &&
            typeof config.integrations.jira.baseUrl !== 'string'
          ) {
            errors.push({ path: 'integrations.jira.baseUrl', message: 'Must be a string' });
          }
          if (
            config.integrations.jira.apiTokenEnv !== undefined &&
            typeof config.integrations.jira.apiTokenEnv !== 'string'
          ) {
            errors.push({ path: 'integrations.jira.apiTokenEnv', message: 'Must be a string' });
          }
        }
      }

      // Validate slack integration
      if (config.integrations.slack !== undefined) {
        if (typeof config.integrations.slack !== 'object' || config.integrations.slack === null) {
          errors.push({ path: 'integrations.slack', message: 'Must be an object' });
        } else {
          if (
            config.integrations.slack.webhookUrl !== undefined &&
            typeof config.integrations.slack.webhookUrl !== 'string'
          ) {
            errors.push({ path: 'integrations.slack.webhookUrl', message: 'Must be a string' });
          }
          if (
            config.integrations.slack.channel !== undefined &&
            typeof config.integrations.slack.channel !== 'string'
          ) {
            errors.push({ path: 'integrations.slack.channel', message: 'Must be a string' });
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format configuration for display
 */
export function formatConfigDisplay(config: WorktreeConfig): string {
  return JSON.stringify(config, null, 2);
}
