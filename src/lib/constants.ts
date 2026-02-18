/**
 * Centralized constants and defaults for git-worktree-tools
 */

import os from 'os';
import path from 'path';

/**
 * Package name for config directories and logging
 */
export const PACKAGE_NAME = 'git-worktree-tools';

/**
 * Default remote name for git operations
 */
export const DEFAULT_REMOTE = 'origin';

/**
 * Default base branch for PRs and comparisons
 */
export const DEFAULT_BASE_BRANCH = 'main';

/**
 * Common base branch names to prefer when auto-detecting
 */
export const COMMON_BASE_BRANCHES = ['main', 'master', 'develop'];

/**
 * Default manifest file name for wtlink
 */
export const DEFAULT_MANIFEST_FILE = '.wtlinkrc';

/**
 * Config file names to look for in repo (in order of priority)
 * These are "shared" configs that can be checked into version control
 */
export const CONFIG_FILE_NAMES = ['.worktreerc', '.worktreerc.json'];

/**
 * Local config file names (gitignored, highest priority)
 * These override shared repo configs
 */
export const LOCAL_CONFIG_FILE_NAMES = ['.worktreerc.local', '.worktreerc.local.json'];

/**
 * Global config file name (in user config directory)
 */
export const GLOBAL_CONFIG_FILE_NAME = 'config.json';

/**
 * Get the global config directory path
 * - Linux/macOS: $XDG_CONFIG_HOME/git-worktree-tools or ~/.config/git-worktree-tools
 * - Windows: %APPDATA%/git-worktree-tools
 */
export function getGlobalConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, PACKAGE_NAME);
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, PACKAGE_NAME);
}

/**
 * Get the global log directory path
 * - Linux/macOS: $XDG_STATE_HOME/git-worktree-tools/logs or ~/.local/state/git-worktree-tools/logs
 * - Windows: %LOCALAPPDATA%/git-worktree-tools/logs
 */
export function getGlobalLogDir(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, PACKAGE_NAME, 'logs');
  }
  const xdgState = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(xdgState, PACKAGE_NAME, 'logs');
}

/**
 * Get the global data directory path (for audit logs)
 * - Linux: $XDG_DATA_HOME/git-worktree-tools or ~/.local/share/git-worktree-tools
 * - macOS: ~/Library/Application Support/git-worktree-tools
 * - Windows: %APPDATA%/git-worktree-tools
 */
export function getGlobalDataDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, PACKAGE_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', PACKAGE_NAME);
  }
  // Linux and others: XDG_DATA_HOME
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, PACKAGE_NAME);
}

/**
 * Default worktree naming pattern
 * Placeholders: {repo}, {number}, {branch}
 */
export const DEFAULT_WORKTREE_PATTERN = '{repo}.pr{number}';

/**
 * Default parent directory for worktrees (sibling to main repo)
 */
export const DEFAULT_WORKTREE_PARENT = '..';

/**
 * Default branch name prefix for auto-generated branches
 */
export const DEFAULT_BRANCH_PREFIX = 'feat';

/**
 * Log levels for the logging system
 * Values are aligned with consola numeric levels
 */
export enum LogLevel {
  SILENT = -999,
  ERROR = 0,
  WARN = 1,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

/**
 * Default log level
 */
export const DEFAULT_LOG_LEVEL = LogLevel.INFO;

/**
 * Maximum log file size before rotation (10MB)
 */
export const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Number of log files to keep during rotation
 */
export const MAX_LOG_FILES = 3;
