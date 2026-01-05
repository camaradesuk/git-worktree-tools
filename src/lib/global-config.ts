/**
 * Global and local configuration support for git-worktree-tools
 *
 * Implements a three-tier configuration hierarchy:
 * 1. Local config (.worktreerc.local) - gitignored, highest priority
 * 2. Repo config (.worktreerc) - checked in, shared with team
 * 3. Global config (~/.config/git-worktree-tools/config.json) - user-wide defaults
 *
 * The merge order is: defaults ← global ← repo ← local
 */

import fs from 'fs';
import path from 'path';
import {
  getGlobalConfigDir,
  GLOBAL_CONFIG_FILE_NAME,
  CONFIG_FILE_NAMES,
  LOCAL_CONFIG_FILE_NAMES,
} from './constants.js';
import type { WorktreeConfig } from './config.js';
import { logger } from './logger.js';

/**
 * Configuration source information
 */
export interface ConfigSource {
  /** File path */
  path: string;
  /** Config level */
  level: 'global' | 'repo' | 'local';
  /** Whether the file exists */
  exists: boolean;
}

/**
 * Result of finding all config files
 */
export interface ConfigPaths {
  global: ConfigSource;
  repo: ConfigSource | null;
  local: ConfigSource | null;
}

/**
 * Get the global config file path
 */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), GLOBAL_CONFIG_FILE_NAME);
}

/**
 * Find the repo-level config file
 */
export function findRepoConfigFile(repoRoot: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = path.join(repoRoot, fileName);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Find the local (gitignored) config file
 */
export function findLocalConfigFile(repoRoot: string): string | null {
  for (const fileName of LOCAL_CONFIG_FILE_NAMES) {
    const configPath = path.join(repoRoot, fileName);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Get all config file paths and their existence status
 */
export function getConfigPaths(repoRoot?: string): ConfigPaths {
  const globalPath = getGlobalConfigPath();

  const result: ConfigPaths = {
    global: {
      path: globalPath,
      level: 'global',
      exists: fs.existsSync(globalPath),
    },
    repo: null,
    local: null,
  };

  if (repoRoot) {
    const repoConfigPath = findRepoConfigFile(repoRoot);
    if (repoConfigPath) {
      result.repo = {
        path: repoConfigPath,
        level: 'repo',
        exists: true,
      };
    } else {
      // Return default path even if doesn't exist
      result.repo = {
        path: path.join(repoRoot, CONFIG_FILE_NAMES[0]),
        level: 'repo',
        exists: false,
      };
    }

    const localConfigPath = findLocalConfigFile(repoRoot);
    if (localConfigPath) {
      result.local = {
        path: localConfigPath,
        level: 'local',
        exists: true,
      };
    } else {
      // Return default path even if doesn't exist
      result.local = {
        path: path.join(repoRoot, LOCAL_CONFIG_FILE_NAMES[0]),
        level: 'local',
        exists: false,
      };
    }
  }

  return result;
}

/**
 * Load a config file and parse it
 * Returns null if file doesn't exist or can't be parsed
 */
export function loadConfigFile(filePath: string): WorktreeConfig | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as WorktreeConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to parse config file ${filePath}: ${message}`);
    return null;
  }
}

/**
 * Load the global config file
 */
export function loadGlobalConfig(): WorktreeConfig | null {
  const configPath = getGlobalConfigPath();
  return loadConfigFile(configPath);
}

/**
 * Save the global config file
 */
export function saveGlobalConfig(config: WorktreeConfig): void {
  const configPath = getGlobalConfigPath();
  const configDir = path.dirname(configPath);

  // Ensure directory exists
  fs.mkdirSync(configDir, { recursive: true });

  // Add $schema for IDE support
  const configWithSchema = {
    $schema: getSchemaUrl(),
    ...config,
  };

  // Write with pretty printing
  const content = JSON.stringify(configWithSchema, null, 2);
  fs.writeFileSync(configPath, content + '\n', 'utf8');
  logger.debug(`Saved global config to ${configPath}`);
}

/**
 * Create a local config file (gitignored)
 */
export function createLocalConfig(repoRoot: string, config: WorktreeConfig = {}): string {
  const configPath = path.join(repoRoot, LOCAL_CONFIG_FILE_NAMES[0]);

  // Add $schema for IDE support
  const configWithSchema = {
    $schema: getSchemaUrl(),
    ...config,
  };

  // Write with pretty printing
  const content = JSON.stringify(configWithSchema, null, 2);
  fs.writeFileSync(configPath, content + '\n', 'utf8');
  logger.debug(`Created local config at ${configPath}`);

  return configPath;
}

/**
 * Ensure local config files are in .gitignore
 */
export function ensureLocalConfigInGitignore(repoRoot: string): boolean {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const patterns = LOCAL_CONFIG_FILE_NAMES.map((name) => name);

  let content = '';
  let existingContent = '';

  if (fs.existsSync(gitignorePath)) {
    existingContent = fs.readFileSync(gitignorePath, 'utf8');
    content = existingContent;
  }

  const linesToAdd: string[] = [];

  for (const pattern of patterns) {
    // Check if pattern is already in gitignore (with possible leading slash or glob)
    const regex = new RegExp(`^\\/?${pattern.replace('.', '\\.')}\\s*$`, 'm');
    if (!regex.test(existingContent)) {
      linesToAdd.push(pattern);
    }
  }

  if (linesToAdd.length === 0) {
    logger.debug('Local config patterns already in .gitignore');
    return false;
  }

  // Add a section for git-worktree-tools local config
  const addition = `
# git-worktree-tools local config (user-specific overrides)
${linesToAdd.join('\n')}
`;

  content = content.trimEnd() + '\n' + addition;
  fs.writeFileSync(gitignorePath, content, 'utf8');
  logger.info(`Added local config patterns to .gitignore`);

  return true;
}

/**
 * Initialize local config in a repository
 * Creates .worktreerc.local and updates .gitignore
 */
export function initializeLocalConfig(
  repoRoot: string,
  initialConfig: WorktreeConfig = {}
): { configPath: string; gitignoreUpdated: boolean } {
  const configPath = createLocalConfig(repoRoot, initialConfig);
  const gitignoreUpdated = ensureLocalConfigInGitignore(repoRoot);

  return { configPath, gitignoreUpdated };
}

/**
 * Get the JSON Schema URL for config files
 * Uses unpkg.com to serve the schema directly from npm
 */
export function getSchemaUrl(): string {
  return 'https://unpkg.com/@camaradesuk/git-worktree-tools@latest/schemas/worktreerc.schema.json';
}

/**
 * Check if global config exists
 */
export function globalConfigExists(): boolean {
  return fs.existsSync(getGlobalConfigPath());
}

/**
 * Check if local config exists in repo
 */
export function localConfigExists(repoRoot: string): boolean {
  return findLocalConfigFile(repoRoot) !== null;
}

/**
 * Check if repo config exists
 */
export function repoConfigExists(repoRoot: string): boolean {
  return findRepoConfigFile(repoRoot) !== null;
}

/**
 * Get a summary of which config files are present
 */
export function getConfigSummary(repoRoot?: string): {
  global: boolean;
  repo: boolean;
  local: boolean;
  paths: ConfigPaths;
} {
  const paths = getConfigPaths(repoRoot);

  return {
    global: paths.global.exists,
    repo: paths.repo?.exists ?? false,
    local: paths.local?.exists ?? false,
    paths,
  };
}
