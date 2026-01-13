/**
 * lswt environment - detect available tools and platform capabilities
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import type { EnvironmentInfo, GitVersion } from './types.js';

/**
 * Dependencies for environment detection (injectable for testing)
 */
export interface LswtEnvironmentDeps {
  /** Check if a command exists in PATH */
  isCommandAvailable: (cmd: string) => boolean;
  /** Run a command and return output, or null on error */
  runCommand: (command: string) => string | null;
  /** Read file synchronously */
  readFile: (path: string) => string | null;
}

/**
 * Check if a command is available on the system (implementation)
 */
function isCommandAvailableImpl(cmd: string): boolean {
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
 * Run a command and return output (implementation)
 */
function runCommandImpl(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

/**
 * Read file synchronously (implementation)
 */
function readFileImpl(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Create default environment dependencies
 */
export function createDefaultLswtEnvironmentDeps(): LswtEnvironmentDeps {
  return {
    isCommandAvailable: isCommandAvailableImpl,
    runCommand: runCommandImpl,
    readFile: readFileImpl,
  };
}

// Module-level deps instance
let currentDeps: LswtEnvironmentDeps = createDefaultLswtEnvironmentDeps();

/**
 * Reset environment deps to defaults (for testing)
 */
export function resetLswtEnvironmentDeps(): void {
  currentDeps = createDefaultLswtEnvironmentDeps();
}

/**
 * Check if a command is available on the system (uses deps)
 */
export function isCommandAvailable(cmd: string): boolean {
  return currentDeps.isCommandAvailable(cmd);
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
  const output = currentDeps.runCommand('git --version');
  if (output) {
    return parseGitVersion(output);
  }
  return {
    major: 0,
    minor: 0,
    patch: 0,
    raw: 'unknown',
  };
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
    if (currentDeps.isCommandAvailable('osascript')) {
      const result = currentDeps.runCommand(
        'osascript -e \'tell application "System Events" to (name of processes) contains "iTerm2"\''
      );
      if (result === 'true') {
        return 'iTerm2';
      }
    }
    return 'Terminal';
  }

  if (platform === 'win32') {
    // Check for Windows Terminal
    if (currentDeps.isCommandAvailable('wt')) {
      return 'wt';
    }
    return 'cmd';
  }

  // Linux - check common terminals
  const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
  for (const terminal of terminals) {
    if (currentDeps.isCommandAvailable(terminal)) {
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
 * Detect if running in Windows Subsystem for Linux (WSL)
 */
export function isWSL(): boolean {
  // Only possible on Linux
  if (process.platform !== 'linux') {
    return false;
  }

  // Check environment variable (most reliable for WSL2)
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }

  // Check /proc/version for Microsoft/WSL indicators
  const procVersion = currentDeps.readFile('/proc/version');
  if (procVersion) {
    const lower = procVersion.toLowerCase();
    return lower.includes('microsoft') || lower.includes('wsl');
  }
  return false;
}

/**
 * Detect full environment information
 */
export function detectEnvironment(deps?: LswtEnvironmentDeps): EnvironmentInfo {
  if (deps) {
    currentDeps = deps;
  }
  const hasVscode = currentDeps.isCommandAvailable('code');
  const hasCursor = currentDeps.isCommandAvailable('cursor');

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
    isWSL: isWSL(),
  };
}
