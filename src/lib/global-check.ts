/**
 * Global installation check for git-worktree-tools
 *
 * Checks if the package is installed globally and optionally warns if not.
 * This is recommended because git-worktree-tools is designed as a
 * system-wide CLI tool for managing worktrees across all repositories.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { yellow, gray } from './colors.js';

/**
 * Result of global installation check
 */
export interface GlobalCheckResult {
  /** Whether the package appears to be installed globally */
  isGlobal: boolean;
  /** The installation path */
  installPath: string;
  /** The global node_modules path (if detectable) */
  globalPath: string | null;
  /** Any warning message to display */
  warning?: string;
}

/**
 * Get the global node_modules path
 */
function getGlobalNodeModulesPath(): string | null {
  try {
    // Try npm first
    const npmGlobalPath = execSync('npm root -g', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return npmGlobalPath;
  } catch {
    // Ignore npm errors
  }

  try {
    // Try yarn global
    const yarnGlobalPath = execSync('yarn global dir', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return path.join(yarnGlobalPath, 'node_modules');
  } catch {
    // Ignore yarn errors
  }

  return null;
}

/**
 * Get the installation path of this package
 */
function getInstallPath(): string {
  // Get the directory where this module is installed
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Walk up to find the package root (where package.json is)
  let current = __dirname;
  while (current !== path.dirname(current)) {
    const packageJsonPath = path.join(current, 'package.json');
    try {
      // Check if this directory has our package.json
      const content = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8'));
      if (content.name === '@camaradesuk/git-worktree-tools') {
        return current;
      }
    } catch {
      // Not our package.json, continue
    }
    current = path.dirname(current);
  }

  return __dirname;
}

/**
 * Check if the package is installed globally
 */
export function checkGlobalInstall(): GlobalCheckResult {
  const installPath = getInstallPath();
  const globalPath = getGlobalNodeModulesPath();

  // Check if install path is within global node_modules
  let isGlobal = false;

  if (globalPath) {
    // Normalize paths for comparison
    const normalizedInstall = path.normalize(installPath).toLowerCase();
    const normalizedGlobal = path.normalize(globalPath).toLowerCase();
    isGlobal = normalizedInstall.startsWith(normalizedGlobal);
  }

  // Also check common global installation patterns
  if (!isGlobal) {
    const patterns = [
      '/usr/local/lib/node_modules',
      '/usr/lib/node_modules',
      'node_modules/.pnpm', // pnpm global
      path.join(process.env.HOME || '', '.npm-global'),
      path.join(process.env.HOME || '', '.nvm'),
      path.join(process.env.APPDATA || '', 'npm'),
      path.join(process.env.LOCALAPPDATA || '', 'npm'),
    ];

    const normalizedInstall = path.normalize(installPath).toLowerCase();
    isGlobal = patterns.some((p) => normalizedInstall.includes(path.normalize(p).toLowerCase()));
  }

  // Check for environment variable bypass
  if (process.env.GWT_ALLOW_LOCAL === '1' || process.env.GWT_ALLOW_LOCAL === 'true') {
    // Allow local install without warning
    return { isGlobal: true, installPath, globalPath };
  }

  const result: GlobalCheckResult = {
    isGlobal,
    installPath,
    globalPath,
  };

  if (!isGlobal) {
    result.warning =
      'git-worktree-tools is designed to be installed globally. ' +
      'Run: npm install -g @camaradesuk/git-worktree-tools';
  }

  return result;
}

/**
 * Warn if not installed globally (based on config setting)
 */
export function warnIfNotGlobal(warnEnabled: boolean = true): void {
  if (!warnEnabled) {
    return;
  }

  const result = checkGlobalInstall();

  if (!result.isGlobal && result.warning) {
    // Use console.warn directly to ensure visibility even at low log levels
    console.warn(yellow('⚠ Warning:'), result.warning);
    console.warn(gray('  Set GWT_ALLOW_LOCAL=1 to suppress this warning.'));
    logger.debug(`Install path: ${result.installPath}`);
    logger.debug(`Global path: ${result.globalPath}`);
  }
}

/**
 * Check and warn about global installation
 * Call this early in CLI initialization
 */
export function checkAndWarnGlobalInstall(config?: { global?: { warnNotGlobal?: boolean } }): void {
  const warnEnabled = config?.global?.warnNotGlobal ?? true;
  warnIfNotGlobal(warnEnabled);
}
