/**
 * PR action handlers - execute actions on selected PRs
 */

import * as path from 'path';
import { execSync, spawn, spawnSync } from 'child_process';
import * as git from '../git.js';
import * as colors from '../colors.js';
import { loadConfig } from '../config.js';
import type { PrDisplayItem, PrAction, PrActionResult } from './types.js';

/**
 * Options for addWorktree
 */
export interface AddWorktreeOptions {
  createBranch?: boolean;
  startPoint?: string;
  cwd?: string;
}

/**
 * Dependencies for PR actions (injectable for testing)
 */
export interface PrActionDeps {
  /** Execute shell command */
  execCommand: (command: string, cwd?: string) => string;
  /** Spawn shell command (for interactive) */
  spawnCommand: (command: string, args: string[], cwd?: string) => void;
  /** Copy text to clipboard */
  copyToClipboard: (text: string) => boolean;
  /** Open URL in browser */
  openUrl: (url: string) => boolean;
  /** Get repo root */
  getRepoRoot: () => string;
  /** Console output */
  log: (message: string) => void;
  /** Fetch from remote (safe, no shell interpolation) */
  gitFetch: (remote: string, cwd?: string) => void;
  /** Add worktree (safe, no shell interpolation) */
  gitAddWorktree: (path: string, branch: string, options?: AddWorktreeOptions) => void;
}

/**
 * Create default action dependencies
 */
export function createDefaultActionDeps(): PrActionDeps {
  return {
    execCommand: (command: string, cwd?: string) => {
      return execSync(command, { cwd, encoding: 'utf-8' });
    },
    spawnCommand: (command: string, args: string[], cwd?: string) => {
      const child = spawn(command, args, {
        cwd,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    },
    copyToClipboard: copyToClipboard,
    openUrl: openUrl,
    getRepoRoot: git.getRepoRoot,
    log: console.log,
    gitFetch: git.fetch,
    gitAddWorktree: git.addWorktree,
  };
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      command = 'pbcopy';
      args = [];
    } else if (platform === 'win32') {
      command = 'clip';
      args = [];
    } else {
      // Linux - try xclip, then xsel
      try {
        spawnSync('which', ['xclip']);
        command = 'xclip';
        args = ['-selection', 'clipboard'];
      } catch {
        command = 'xsel';
        args = ['--clipboard', '--input'];
      }
    }

    const proc = spawnSync(command, args, {
      input: text,
      encoding: 'utf-8',
    });

    return proc.status === 0;
  } catch {
    return false;
  }
}

/**
 * Open URL in browser
 */
function openUrl(url: string): boolean {
  try {
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      command = 'open';
      args = [url];
    } else if (platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '', url];
    } else {
      // Linux - try xdg-open
      command = 'xdg-open';
      args = [url];
    }

    const proc = spawnSync(command, args, { encoding: 'utf-8' });
    return proc.status === 0;
  } catch {
    return false;
  }
}

/**
 * Create worktree for a PR
 */
export async function createWorktreeForPr(
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  try {
    const repoRoot = deps.getRepoRoot();
    const config = loadConfig(repoRoot);
    const repoName = path.basename(repoRoot);

    // Generate worktree path based on pattern
    const pattern = config.worktreePattern || '{repo}.pr{number}';
    const worktreeName = pattern
      .replace('{repo}', repoName)
      .replace('{number}', String(pr.number))
      .replace('{branch}', pr.headBranch.replace(/\//g, '-'));

    const parentDir = config.worktreeParent || '..';
    const worktreePath = path.resolve(repoRoot, parentDir, worktreeName);

    // Fetch the branch first using safe git helper (avoids shell escaping issues)
    deps.log(colors.dim(`Fetching branch ${pr.headBranch}...`));
    try {
      deps.gitFetch('origin', repoRoot);
    } catch {
      // Fetch might fail if offline, continue anyway
    }

    // Create the worktree using safe git helper
    // First try with a new branch, then fall back to using existing branch
    const branchName = `pr-${pr.number}`;
    const startPoint = `origin/${pr.headBranch}`;

    deps.log(colors.dim(`Creating worktree at ${worktreePath}...`));
    try {
      // Try to create worktree with new branch
      deps.gitAddWorktree(worktreePath, branchName, {
        createBranch: true,
        startPoint,
        cwd: repoRoot,
      });
    } catch {
      // Branch might already exist from a previous worktree
      // Try using the existing branch instead
      try {
        deps.gitAddWorktree(worktreePath, branchName, {
          createBranch: false,
          cwd: repoRoot,
        });
      } catch (retryError) {
        // If that also fails, provide a helpful error message
        throw new Error(
          `Failed to create worktree: ${retryError instanceof Error ? retryError.message : 'Unknown error'}. ` +
            `You may need to delete the existing branch 'pr-${pr.number}' first.`
        );
      }
    }

    return {
      success: true,
      message: `Created worktree at ${worktreePath}`,
      shouldRefresh: true,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create worktree',
    };
  }
}

/**
 * Check if a command exists
 */
function commandExists(cmd: string): boolean {
  try {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      encoding: 'utf-8',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Open a path in editor
 */
function openPathInEditor(targetPath: string, preferredEditor: string): boolean {
  let editorCmd: string | null = null;

  const hasVscode = commandExists('code');
  const hasCursor = commandExists('cursor');

  if (preferredEditor === 'vscode' && hasVscode) {
    editorCmd = 'code';
  } else if (preferredEditor === 'cursor' && hasCursor) {
    editorCmd = 'cursor';
  } else if (preferredEditor === 'auto') {
    if (hasVscode) editorCmd = 'code';
    else if (hasCursor) editorCmd = 'cursor';
  } else if (hasVscode) {
    editorCmd = 'code';
  } else if (hasCursor) {
    editorCmd = 'cursor';
  }

  if (!editorCmd) {
    return false;
  }

  const child = spawn(editorCmd, [targetPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return true;
}

/**
 * Open a path in terminal
 */
function openPathInTerminal(targetPath: string): boolean {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS - open Terminal.app
      const script = `tell application "Terminal" to do script "cd '${targetPath}'"`;
      spawnSync('osascript', ['-e', script]);
    } else if (platform === 'win32') {
      // Windows - open cmd or PowerShell
      spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${targetPath}"`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else {
      // Linux - try common terminal emulators
      const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
      for (const term of terminals) {
        if (commandExists(term)) {
          if (term === 'gnome-terminal') {
            spawn(term, ['--working-directory', targetPath], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          } else if (term === 'konsole') {
            spawn(term, ['--workdir', targetPath], {
              detached: true,
              stdio: 'ignore',
            }).unref();
          } else {
            spawn(term, [], {
              cwd: targetPath,
              detached: true,
              stdio: 'ignore',
            }).unref();
          }
          return true;
        }
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Open existing worktree
 */
export async function openWorktree(
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  if (!pr.worktreePath) {
    return {
      success: false,
      message: 'No worktree path available',
    };
  }

  try {
    const repoRoot = deps.getRepoRoot();
    const config = loadConfig(repoRoot);

    // Open in preferred editor
    const success = openPathInEditor(pr.worktreePath, config.preferredEditor || 'vscode');

    if (success) {
      return {
        success: true,
        message: `Opened worktree in editor`,
      };
    }

    return {
      success: false,
      message: 'No suitable editor found (tried code, cursor)',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to open worktree',
    };
  }
}

/**
 * Open PR in browser
 */
export async function openInBrowser(
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  const success = deps.openUrl(pr.url);

  if (success) {
    return {
      success: true,
      message: `Opened PR #${pr.number} in browser`,
    };
  }

  return {
    success: false,
    message: 'Failed to open browser. URL: ' + pr.url,
  };
}

/**
 * Open worktree in editor
 */
export async function openWorktreeInEditor(
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  if (!pr.worktreePath) {
    return {
      success: false,
      message: 'No worktree available for this PR',
    };
  }

  try {
    const repoRoot = deps.getRepoRoot();
    const config = loadConfig(repoRoot);
    const success = openPathInEditor(pr.worktreePath, config.preferredEditor || 'vscode');

    if (success) {
      return {
        success: true,
        message: `Opened ${pr.worktreePath} in editor`,
      };
    }

    return {
      success: false,
      message: 'No suitable editor found',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to open editor',
    };
  }
}

/**
 * Open worktree in terminal
 */
export async function openWorktreeInTerminal(
  pr: PrDisplayItem,
  _deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  if (!pr.worktreePath) {
    return {
      success: false,
      message: 'No worktree available for this PR',
    };
  }

  try {
    const success = openPathInTerminal(pr.worktreePath);

    if (success) {
      return {
        success: true,
        message: `Opened terminal in ${pr.worktreePath}`,
      };
    }

    return {
      success: false,
      message: 'No suitable terminal found',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to open terminal',
    };
  }
}

/**
 * Copy PR URL to clipboard
 */
export async function copyPrUrl(
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  const success = deps.copyToClipboard(pr.url);

  if (success) {
    return {
      success: true,
      message: `Copied URL to clipboard: ${pr.url}`,
    };
  }

  return {
    success: false,
    message: `Failed to copy to clipboard. URL: ${pr.url}`,
  };
}

/**
 * Copy PR number to clipboard
 */
export async function copyPrNumber(
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  const text = `#${pr.number}`;
  const success = deps.copyToClipboard(text);

  if (success) {
    return {
      success: true,
      message: `Copied ${text} to clipboard`,
    };
  }

  return {
    success: false,
    message: `Failed to copy to clipboard: ${text}`,
  };
}

/**
 * Execute a PR action
 */
export async function executePrAction(
  action: PrAction,
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  switch (action) {
    case 'create_worktree':
      return createWorktreeForPr(pr, deps);

    case 'open_worktree':
      return openWorktree(pr, deps);

    case 'open_browser':
      return openInBrowser(pr, deps);

    case 'open_editor':
      return openWorktreeInEditor(pr, deps);

    case 'open_terminal':
      return openWorktreeInTerminal(pr, deps);

    case 'copy_url':
      return copyPrUrl(pr, deps);

    case 'copy_number':
      return copyPrNumber(pr, deps);

    case 'show_details':
      // Detail view is handled separately
      return { success: true };

    case 'refresh':
      return { success: true, shouldRefresh: true };

    case 'back':
    case 'exit':
      return { success: true, shouldExit: true };

    default:
      return {
        success: false,
        message: `Unknown action: ${action}`,
      };
  }
}
