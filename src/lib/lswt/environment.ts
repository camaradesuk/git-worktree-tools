/**
 * lswt environment - detect available tools and platform capabilities
 */

import { execSync } from 'child_process';
import type { EnvironmentInfo, GitVersion } from './types.js';

/**
 * Check if a command is available on the system
 */
export function isCommandAvailable(cmd: string): boolean {
  try {
    const checkCmd =
      process.platform === 'win32' ? `where ${cmd} 2>nul` : `command -v ${cmd} 2>/dev/null`;

    execSync(checkCmd, { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse git version string into components
 */
export function parseGitVersion(versionString: string): GitVersion {
  // Handle various formats:
  // "git version 2.39.0"
  // "git version 2.39.0.windows.1"
  // "git version 2.37.1 (Apple Git-137.1)"
  const match = versionString.match(/git version (\d+)\.(\d+)\.(\d+)/);

  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      raw: versionString.trim(),
    };
  }

  // Fallback for unexpected format
  return {
    major: 0,
    minor: 0,
    patch: 0,
    raw: versionString.trim(),
  };
}

/**
 * Get the installed git version
 */
export function getGitVersion(): GitVersion {
  try {
    const output = execSync('git --version', { encoding: 'utf8', stdio: 'pipe' });
    return parseGitVersion(output);
  } catch {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      raw: 'unknown',
    };
  }
}

/**
 * Check if git version is at least the specified version
 */
export function isGitVersionAtLeast(
  current: GitVersion,
  required: { major: number; minor: number }
): boolean {
  if (current.major > required.major) return true;
  if (current.major < required.major) return false;
  return current.minor >= required.minor;
}

/**
 * Minimum git version for worktree move command
 */
export const WORKTREE_MOVE_MIN_VERSION = { major: 2, minor: 17 };

/**
 * Get the default terminal emulator for the current platform
 */
export function getDefaultTerminal(): string {
  const platform = process.platform;

  if (platform === 'darwin') {
    // Check for iTerm2 first
    if (isCommandAvailable('osascript')) {
      try {
        const result = execSync(
          'osascript -e \'tell application "System Events" to (name of processes) contains "iTerm2"\'',
          { encoding: 'utf8', stdio: 'pipe' }
        ).trim();
        if (result === 'true') {
          return 'iTerm2';
        }
      } catch {
        // Fall through
      }
    }
    return 'Terminal';
  }

  if (platform === 'win32') {
    // Check for Windows Terminal
    if (isCommandAvailable('wt')) {
      return 'wt';
    }
    return 'cmd';
  }

  // Linux - check common terminals
  const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
  for (const terminal of terminals) {
    if (isCommandAvailable(terminal)) {
      return terminal;
    }
  }

  return 'xterm';
}

/**
 * Get shell from environment
 */
export function getShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

/**
 * Detect full environment information
 */
export function detectEnvironment(): EnvironmentInfo {
  const hasVscode = isCommandAvailable('code');
  const hasCursor = isCommandAvailable('cursor');

  let defaultEditor: 'vscode' | 'cursor' | null = null;
  if (hasVscode) {
    defaultEditor = 'vscode';
  } else if (hasCursor) {
    defaultEditor = 'cursor';
  }

  const platform = process.platform as 'win32' | 'darwin' | 'linux';

  return {
    hasVscode,
    hasCursor,
    defaultEditor,
    platform: platform === 'win32' || platform === 'darwin' ? platform : 'linux',
    isInteractive: process.stdout.isTTY ?? false,
    shell: getShell(),
    gitVersion: getGitVersion(),
  };
}
