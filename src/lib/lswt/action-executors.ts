/**
 * lswt action-executors - execute actions on worktrees
 */

import * as path from 'path';
import { execSync, spawn, spawnSync } from 'child_process';
import inquirer from 'inquirer';
import * as colors from '../colors.js';
import * as git from '../git.js';
import * as github from '../github.js';
import { generateWorktreePath, getDefaultConfig } from '../config.js';
import type { WorktreeConfig } from '../config.js';
import type { WorktreeDisplay, WorktreeAction, ActionResult, EnvironmentInfo } from './types.js';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';

/**
 * Dependencies for action executors (for testing)
 */
export interface ExecutorDeps {
  execCommand: (cmd: string, options?: { cwd?: string }) => void;
  spawnDetached: (cmd: string, args: string[], options?: { cwd?: string }) => void;
  copyToClipboard: (text: string) => void;
  openUrl: (url: string) => void;
  /** Convert WSL path to Windows path (for WSL interop) */
  wslPathToWindows: (linuxPath: string) => string;
}

/**
 * Create default executor dependencies
 */
export function createDefaultExecutorDeps(): ExecutorDeps {
  return {
    execCommand: (cmd: string, options?: { cwd?: string }) => {
      execSync(cmd, { cwd: options?.cwd, stdio: 'inherit' });
    },

    spawnDetached: (cmd: string, args: string[], options?: { cwd?: string }) => {
      const child = spawn(cmd, args, {
        cwd: options?.cwd,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    },

    copyToClipboard: (text: string) => {
      const platform = process.platform;
      if (platform === 'darwin') {
        execSync('pbcopy', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
      } else if (platform === 'win32') {
        execSync('clip', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
      } else {
        // Linux - try xclip first, then xsel
        try {
          execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch {
          execSync('xsel --clipboard --input', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
        }
      }
    },

    openUrl: (url: string) => {
      const platform = process.platform;
      if (platform === 'darwin') {
        execSync(`open "${url}"`);
      } else if (platform === 'win32') {
        execSync(`start "" "${url}"`);
      } else {
        execSync(`xdg-open "${url}"`);
      }
    },

    wslPathToWindows: wslPathToWindowsImpl,
  };
}

/**
 * Execute an action on a worktree
 */
export async function executeAction(
  action: WorktreeAction,
  worktree: WorktreeDisplay,
  env: EnvironmentInfo,
  config: WorktreeConfig,
  deps: ExecutorDeps = createDefaultExecutorDeps()
): Promise<ActionResult> {
  switch (action) {
    case 'open_editor':
      return openInEditor(worktree, env, config, deps);

    case 'open_terminal':
      return openTerminal(worktree, env, deps);

    case 'copy_path':
      return copyPath(worktree, deps);

    case 'show_details':
      return showDetails(worktree);

    case 'open_pr_url':
      return openPrUrl(worktree, deps);

    case 'create_pr':
      return createPr(worktree, config);

    case 'remove_worktree':
      return removeWorktree(worktree);

    case 'link_configs':
      return linkConfigs(worktree);

    case 'checkout_pr':
      return checkoutPr(worktree, config);

    case 'back':
      return { success: true };

    case 'exit':
      return { success: true, shouldExit: true };
  }
}

/**
 * Open worktree in editor
 */
async function openInEditor(
  worktree: WorktreeDisplay,
  env: EnvironmentInfo,
  config: WorktreeConfig,
  deps: ExecutorDeps
): Promise<ActionResult> {
  const preferredEditor = (config as { preferredEditor?: string }).preferredEditor || 'auto';

  let editorCmd: string | null = null;

  // Check if preferred editor is available, otherwise fall back to any available editor
  if (preferredEditor === 'vscode' && env.hasVscode) {
    editorCmd = 'code';
  } else if (preferredEditor === 'cursor' && env.hasCursor) {
    editorCmd = 'cursor';
  } else if (env.hasVscode) {
    // Fallback: use vscode if available (handles 'auto' or preferred not available)
    editorCmd = 'code';
  } else if (env.hasCursor) {
    // Fallback: use cursor if available
    editorCmd = 'cursor';
  }

  if (!editorCmd) {
    return {
      success: false,
      message: 'No editor found. Install VSCode or Cursor to use this feature.',
    };
  }

  try {
    deps.spawnDetached(editorCmd, [worktree.path]);
    return {
      success: true,
      message: `Opened ${worktree.path} in ${editorCmd === 'code' ? 'VSCode' : 'Cursor'}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to open editor: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Convert a Linux path to Windows path for WSL interop (implementation)
 */
function wslPathToWindowsImpl(linuxPath: string): string {
  // Use spawnSync with array args to avoid shell escaping issues
  const result = spawnSync('wslpath', ['-w', linuxPath], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }

  // Fallback: manual conversion for common /home paths
  // Try \\wsl.localhost\ first (Windows 11+), fall back to \\wsl$\ (Windows 10)
  const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, '\\')}`;
}

/**
 * Open terminal at worktree path
 */
async function openTerminal(
  worktree: WorktreeDisplay,
  env: EnvironmentInfo,
  deps: ExecutorDeps
): Promise<ActionResult> {
  try {
    const platform = env.platform;

    if (platform === 'darwin') {
      // macOS
      const script = `tell application "Terminal" to do script "cd '${worktree.path}'"`;
      deps.execCommand(`osascript -e '${script}'`);
    } else if (platform === 'win32') {
      // Windows
      try {
        // Try Windows Terminal first
        deps.spawnDetached('wt', ['-d', worktree.path]);
      } catch {
        // Fallback to cmd
        deps.spawnDetached('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${worktree.path}"`]);
      }
    } else if (env.isWSL) {
      // WSL - open Windows Terminal with WSL
      try {
        const windowsPath = deps.wslPathToWindows(worktree.path);
        // Use cmd.exe to launch Windows Terminal
        // wt.exe -d <path> opens a new tab at the specified directory
        deps.execCommand(`cmd.exe /c start wt.exe -d "${windowsPath}"`);
      } catch {
        // Fallback: print cd command for user to copy
        console.log('');
        console.log(colors.yellow('Could not open Windows Terminal automatically.'));
        console.log(colors.dim('Run the following command to navigate:'));
        console.log('');
        console.log(colors.cyan(`  cd "${worktree.path}"`));
        console.log('');
        return {
          success: true,
          message: 'Path printed (copy the cd command above)',
        };
      }
    } else {
      // Linux - detect terminal
      const terminals = [
        { cmd: 'gnome-terminal', args: ['--working-directory', worktree.path] },
        { cmd: 'konsole', args: ['--workdir', worktree.path] },
        { cmd: 'xfce4-terminal', args: ['--working-directory', worktree.path] },
        { cmd: 'xterm', args: ['-e', `cd "${worktree.path}" && $SHELL`] },
      ];

      let launched = false;
      for (const term of terminals) {
        try {
          deps.spawnDetached(term.cmd, term.args);
          launched = true;
          break;
        } catch {
          continue;
        }
      }

      if (!launched) {
        return {
          success: false,
          message: 'No terminal emulator found',
        };
      }
    }

    return {
      success: true,
      message: `Opened terminal at ${worktree.path}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Copy worktree path to clipboard
 */
async function copyPath(worktree: WorktreeDisplay, deps: ExecutorDeps): Promise<ActionResult> {
  try {
    deps.copyToClipboard(worktree.path);
    return {
      success: true,
      message: `Copied to clipboard: ${worktree.path}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to copy to clipboard: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Show detailed worktree information
 */
async function showDetails(worktree: WorktreeDisplay): Promise<ActionResult> {
  console.log('');
  console.log(
    colors.cyan(colors.bold('╔══════════════════════════════════════════════════════════════════╗'))
  );
  console.log(
    colors.cyan(colors.bold('║')) +
      colors.bold('  Worktree Details                                                ') +
      colors.cyan(colors.bold('║'))
  );
  console.log(
    colors.cyan(colors.bold('╚══════════════════════════════════════════════════════════════════╝'))
  );
  console.log('');

  console.log(`  ${colors.bold('Path:')}     ${worktree.path}`);
  console.log(`  ${colors.bold('Name:')}     ${worktree.name}`);
  console.log(`  ${colors.bold('Branch:')}   ${worktree.branch || colors.dim('(detached)')}`);
  console.log(`  ${colors.bold('Commit:')}   ${colors.dim(worktree.commit)}`);
  console.log(`  ${colors.bold('Type:')}     ${worktree.type}`);

  if ((worktree.type === 'pr' || worktree.type === 'remote_pr') && worktree.prNumber !== null) {
    console.log(`  ${colors.bold('PR #:')}     ${worktree.prNumber}`);
    console.log(`  ${colors.bold('PR State:')} ${worktree.prState || 'unknown'}`);
    if (worktree.isDraft) {
      console.log(`  ${colors.bold('Draft:')}    ${colors.yellow('Yes')}`);
    }

    // Show PR title for remote PRs
    if (worktree.prTitle) {
      console.log(`  ${colors.bold('Title:')}    ${worktree.prTitle}`);
    }

    // Show PR URL (use stored URL for remote PRs, or fetch for local)
    if (worktree.prUrl) {
      console.log(`  ${colors.bold('PR URL:')}   ${colors.blue(worktree.prUrl)}`);
    } else {
      try {
        const pr = github.getPr(worktree.prNumber);
        if (pr) {
          console.log(`  ${colors.bold('PR URL:')}   ${colors.blue(pr.url)}`);
        }
      } catch {
        // Ignore
      }
    }
  }

  // Skip local-only info for remote PRs (no local path)
  if (worktree.type !== 'remote_pr') {
    console.log(
      `  ${colors.bold('Changes:')}  ${worktree.hasChanges ? colors.red('Yes (uncommitted changes)') : colors.green('Clean')}`
    );

    // Show recent commits
    try {
      const logs = git.exec(['log', '--oneline', '-5'], { cwd: worktree.path, silent: true });

      if (logs) {
        console.log('');
        console.log(`  ${colors.bold('Recent commits:')}`);
        for (const line of logs.split('\n')) {
          console.log(`    ${colors.dim(line)}`);
        }
      }
    } catch {
      // Ignore
    }
  } else {
    console.log('');
    console.log(colors.dim('  (No local checkout - use "Create worktree" to checkout this PR)'));
  }

  console.log('');

  return { success: true };
}

/**
 * Open PR URL in browser
 */
async function openPrUrl(worktree: WorktreeDisplay, deps: ExecutorDeps): Promise<ActionResult> {
  if (worktree.prNumber === null) {
    return {
      success: false,
      message: 'No PR associated with this worktree',
    };
  }

  try {
    // Use stored URL for remote PRs, otherwise fetch from GitHub
    let prUrl = worktree.prUrl;
    if (!prUrl) {
      const pr = github.getPr(worktree.prNumber);
      if (!pr) {
        return {
          success: false,
          message: `Could not find PR #${worktree.prNumber}`,
        };
      }
      prUrl = pr.url;
    }

    deps.openUrl(prUrl);
    return {
      success: true,
      message: `Opened PR #${worktree.prNumber} in browser`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to open PR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create PR from branch worktree
 */
async function createPr(worktree: WorktreeDisplay, config: WorktreeConfig): Promise<ActionResult> {
  if (!worktree.branch) {
    return {
      success: false,
      message: 'Cannot create PR from detached HEAD',
    };
  }

  // Check if PR already exists for this branch
  try {
    const existingPr = github.getPrByBranch(worktree.branch, worktree.path);
    if (existingPr) {
      return {
        success: false,
        message: `PR already exists for branch ${worktree.branch}: #${existingPr.number}`,
      };
    }
  } catch {
    // Continue - no existing PR
  }

  // Prompt for PR title
  const { title } = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'PR title:',
      default: formatBranchAsTitle(worktree.branch),
    },
  ]);

  // Prompt for draft status if not configured
  let isDraft = config.draftPr ?? false;
  if (config.draftPr === undefined) {
    const { draft } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'draft',
        message: 'Create as draft PR?',
        default: false,
      },
    ]);
    isDraft = draft;
  }

  try {
    console.log(colors.dim('\nCreating PR...'));

    const pr = github.createPr(
      {
        title,
        base: config.baseBranch || 'main',
        head: worktree.branch,
        draft: isDraft,
      },
      worktree.path
    );

    console.log(colors.green(`\n✓ Created PR #${pr.number}: ${pr.url}`));

    return {
      success: true,
      message: `Created PR #${pr.number}`,
      shouldRefresh: true,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create PR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Format branch name as PR title
 * Exported for testing
 */
export function formatBranchAsTitle(branch: string): string {
  // Remove common prefixes
  let title = branch
    .replace(/^(feat|fix|chore|docs|refactor|test|style)\//, '')
    .replace(/^feature\//, '')
    .replace(/^bugfix\//, '');

  // Remove trailing random suffixes (like -abc123)
  title = title.replace(/-[a-z0-9]{6,}$/, '');

  // Replace hyphens/underscores with spaces
  title = title.replace(/[-_]/g, ' ');

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return title;
}

/**
 * Remove worktree
 */
async function removeWorktree(worktree: WorktreeDisplay): Promise<ActionResult> {
  if (worktree.type === 'main') {
    return {
      success: false,
      message: 'Cannot remove main worktree',
    };
  }

  // Warn about uncommitted changes
  if (worktree.hasChanges) {
    console.log(colors.yellow('\n⚠ This worktree has uncommitted changes!'));
  }

  // Confirm removal
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove worktree "${worktree.name}"?`,
      default: false,
    },
  ]);

  if (!confirm) {
    return {
      success: true,
      message: 'Cancelled',
    };
  }

  // Ask about branch deletion for PR worktrees
  let deleteBranch = false;
  if (worktree.branch && (worktree.prState === 'MERGED' || worktree.prState === 'CLOSED')) {
    const { shouldDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldDelete',
        message: `Also delete branch "${worktree.branch}"?`,
        default: true,
      },
    ]);
    deleteBranch = shouldDelete;
  }

  try {
    // Remove the worktree
    console.log(colors.dim('\nRemoving worktree...'));
    git.removeWorktree(worktree.path);

    // Delete branch if requested
    if (deleteBranch && worktree.branch) {
      try {
        console.log(colors.dim(`Deleting branch ${worktree.branch}...`));
        // Use main worktree root as cwd since the worktree was just removed
        const mainRoot = git.getMainWorktreeRoot();
        git.deleteBranch(worktree.branch, { force: true, cwd: mainRoot });
      } catch {
        // Branch might not exist locally
      }
    }

    return {
      success: true,
      message: `Removed worktree "${worktree.name}"`,
      shouldRefresh: true,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create worktree for a remote PR
 */
async function checkoutPr(
  worktree: WorktreeDisplay,
  config: WorktreeConfig
): Promise<ActionResult> {
  if (worktree.type !== 'remote_pr' || worktree.prNumber === null) {
    return {
      success: false,
      message: 'Can only checkout remote PRs',
    };
  }

  const prNumber = worktree.prNumber;
  const branch = worktree.branch;

  if (!branch) {
    return {
      success: false,
      message: 'PR has no associated branch',
    };
  }

  try {
    // Get repo root and name
    const repoRoot = git.getMainWorktreeRoot();
    if (!repoRoot) {
      return {
        success: false,
        message: 'Could not find repository root',
      };
    }
    const repoName = path.basename(repoRoot);

    // Generate worktree path using config
    const fullConfig = { ...getDefaultConfig(), ...config };
    const worktreePath = generateWorktreePath(fullConfig, repoRoot, repoName, prNumber, branch);

    console.log(colors.dim('\nFetching PR branch...'));

    // Fetch the PR branch from origin
    git.exec(['fetch', 'origin', `${branch}:${branch}`], { cwd: repoRoot, silent: true });

    console.log(colors.dim(`Creating worktree at ${worktreePath}...`));

    // Create the worktree
    git.addWorktree(worktreePath, branch, { cwd: repoRoot });

    console.log(colors.green(`\n✓ Created worktree for PR #${prNumber} at ${worktreePath}`));

    return {
      success: true,
      message: `Created worktree for PR #${prNumber}`,
      shouldRefresh: true,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to checkout PR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Link config files to worktree
 */
async function linkConfigs(worktree: WorktreeDisplay): Promise<ActionResult> {
  // Find main worktree to use as source
  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    return {
      success: false,
      message: 'Could not find repository root',
    };
  }

  if (worktree.type === 'main') {
    return {
      success: false,
      message: 'Cannot link configs to main worktree (it is the source)',
    };
  }

  try {
    // Import wtlink dynamically to avoid circular dependencies
    const wtlink = await import('../wtlink/link-configs.js');

    await wtlink.run({
      manifestFile: DEFAULT_MANIFEST_FILE,
      dryRun: false,
      type: 'hard',
      yes: false,
      source: repoRoot,
      destination: worktree.path,
    });

    return {
      success: true,
      message: 'Config files linked successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to link configs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
