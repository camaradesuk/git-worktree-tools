/**
 * Environment Detection
 *
 * Detects installed tools and environment configuration for the setup wizard.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { EnvironmentInfo } from './types.js';

/**
 * Check if a command exists in PATH
 */
function commandExists(command: string): boolean {
  try {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const result = spawnSync('where', [command], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.status === 0;
    } else {
      const result = spawnSync('which', [command], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.status === 0;
    }
  } catch {
    return false;
  }
}

/**
 * Run a command and return output, or null on error
 */
function runCommand(command: string, args: string[]): string | null {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect operating system
 *
 * Note: Non-Windows/macOS platforms (e.g., FreeBSD, OpenBSD) are treated as Linux.
 * This is a reasonable assumption since they share similar POSIX tooling and conventions.
 */
function detectOS(): 'windows' | 'macos' | 'linux' {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    default:
      // Treat all other POSIX-compatible platforms as Linux
      return 'linux';
  }
}

/**
 * Detect git installation and configuration
 */
function detectGit(): EnvironmentInfo['git'] {
  const version = runCommand('git', ['--version']);
  if (!version) {
    return {
      version: null,
      configured: false,
      user: null,
      email: null,
    };
  }

  // Extract version number (e.g., "git version 2.43.0" -> "2.43.0")
  const versionMatch = version.match(/git version (\d+\.\d+\.\d+)/);
  const versionNumber = versionMatch ? versionMatch[1] : version;

  const user = runCommand('git', ['config', '--global', 'user.name']);
  const email = runCommand('git', ['config', '--global', 'user.email']);

  return {
    version: versionNumber,
    configured: !!(user && email),
    user,
    email,
  };
}

/**
 * Detect GitHub CLI installation and authentication
 */
function detectGitHub(): EnvironmentInfo['github'] {
  const installed = commandExists('gh');
  if (!installed) {
    return {
      installed: false,
      authenticated: false,
      user: null,
    };
  }

  // Check authentication status
  const authStatus = runCommand('gh', ['auth', 'status']);
  const authenticated = authStatus !== null;

  // Get authenticated user
  let user: string | null = null;
  if (authenticated) {
    try {
      const userJson = runCommand('gh', ['api', 'user', '-q', '.login']);
      user = userJson;
    } catch {
      // Ignore
    }
  }

  return {
    installed,
    authenticated,
    user,
  };
}

/**
 * Detect AI tool availability
 */
function detectAI(): EnvironmentInfo['ai'] {
  return {
    claudeCode: commandExists('claude'),
    geminiCLI: commandExists('gemini'),
    ollama: commandExists('ollama'),
    openaiKey: !!process.env.OPENAI_API_KEY,
  };
}

/**
 * Detect package manager
 */
function detectPackageManager(cwd?: string): 'npm' | 'pnpm' | 'yarn' | 'bun' | null {
  const workDir = cwd || process.cwd();

  // Check for lock files
  if (fs.existsSync(path.join(workDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(workDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(workDir, 'bun.lockb'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(workDir, 'package-lock.json'))) {
    return 'npm';
  }

  // Check for installed package managers
  if (commandExists('pnpm')) return 'pnpm';
  if (commandExists('yarn')) return 'yarn';
  if (commandExists('bun')) return 'bun';
  if (commandExists('npm')) return 'npm';

  return null;
}

/**
 * Detect IDE availability
 */
function detectIDE(): EnvironmentInfo['ide'] {
  return {
    vscode: commandExists('code'),
    cursor: commandExists('cursor'),
  };
}

/**
 * Detect default branch from git config or common conventions
 */
export function detectDefaultBranch(repoRoot?: string): string {
  // Try to get from git config
  const initDefaultBranch = runCommand('git', ['config', '--global', 'init.defaultBranch']);
  if (initDefaultBranch) {
    return initDefaultBranch;
  }

  // If in a repo, check what exists
  if (repoRoot) {
    const mainExists = runCommand('git', ['-C', repoRoot, 'rev-parse', '--verify', 'main']);
    if (mainExists !== null) return 'main';

    const masterExists = runCommand('git', ['-C', repoRoot, 'rev-parse', '--verify', 'master']);
    if (masterExists !== null) return 'master';
  }

  // Default to main (modern convention)
  return 'main';
}

/**
 * Detect full environment information
 */
export function detectEnvironment(cwd?: string): EnvironmentInfo {
  return {
    os: detectOS(),
    git: detectGit(),
    github: detectGitHub(),
    ai: detectAI(),
    packageManager: detectPackageManager(cwd),
    ide: detectIDE(),
  };
}

/**
 * Get install command for detected package manager
 */
export function getInstallCommand(packageManager: EnvironmentInfo['packageManager']): string {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn install';
    case 'bun':
      return 'bun install';
    case 'npm':
    default:
      return 'npm install';
  }
}

/**
 * Get editor open command
 */
export function getEditorCommand(
  ide: EnvironmentInfo['ide'],
  preferred: 'vscode' | 'cursor' | 'auto'
): string | null {
  if (preferred === 'cursor' && ide.cursor) return 'cursor .';
  if (preferred === 'vscode' && ide.vscode) return 'code .';
  if (preferred === 'auto') {
    if (ide.cursor) return 'cursor .';
    if (ide.vscode) return 'code .';
  }
  return null;
}
