/**
 * Worktree parent directory auto-setup
 *
 * When worktreeParent resolves to a path inside the repo, automatically:
 * 1. Create the directory (with confirmation in interactive mode)
 * 2. Add it to .gitignore
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { promptConfirm } from './prompts.js';

export interface EnsureWorktreeParentOptions {
  /** Resolved absolute path of the worktree parent directory */
  resolvedParentDir: string;
  /** Repository root path */
  repoRoot: string;
  /** Whether to prompt for confirmation (false = auto-proceed) */
  interactive: boolean;
}

export interface EnsureWorktreeParentResult {
  /** Whether the directory was created */
  created: boolean;
  /** Whether .gitignore was updated */
  gitignoreUpdated: boolean;
  /** Whether the user declined (only in interactive mode) */
  declined: boolean;
}

/**
 * Check if a path is inside the repo root
 */
function isInsideRepo(dirPath: string, repoRoot: string): boolean {
  let resolved = path.resolve(dirPath);
  let resolvedRoot = path.resolve(repoRoot);
  if (process.platform === 'win32') {
    resolved = resolved.toLowerCase();
    resolvedRoot = resolvedRoot.toLowerCase();
  }
  return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
}

/**
 * Get the relative path from repo root for gitignore entry
 */
function getGitignoreEntry(dirPath: string, repoRoot: string): string {
  return path.relative(repoRoot, dirPath);
}

/**
 * Check if a gitignore entry already exists
 */
function gitignoreContains(gitignorePath: string, entry: string): boolean {
  if (!fs.existsSync(gitignorePath)) {
    return false;
  }
  const content = fs.readFileSync(gitignorePath, 'utf8');
  const regex = new RegExp(`^\\/?${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  return regex.test(content);
}

/**
 * Add an entry to .gitignore
 */
function addToGitignore(gitignorePath: string, entry: string): void {
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }

  const addition = `# git-worktree-tools worktree directory\n${entry}\n`;
  const trimmed = content.trimEnd();
  content = trimmed ? trimmed + '\n\n' + addition : addition;
  fs.writeFileSync(gitignorePath, content, 'utf8');
}

/**
 * Ensure the worktree parent directory exists and is gitignored (if inside repo).
 *
 * Only acts when the resolved parent dir is inside the repo root.
 * In interactive mode, prompts for confirmation before making changes.
 * In non-interactive mode, proceeds automatically.
 */
export async function ensureWorktreeParentDir(
  options: EnsureWorktreeParentOptions
): Promise<EnsureWorktreeParentResult> {
  const { resolvedParentDir, repoRoot, interactive } = options;

  const result: EnsureWorktreeParentResult = {
    created: false,
    gitignoreUpdated: false,
    declined: false,
  };

  // Only act for in-repo directories
  if (!isInsideRepo(resolvedParentDir, repoRoot)) {
    return result;
  }

  const dirExists = fs.existsSync(resolvedParentDir);
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const gitignoreEntry = getGitignoreEntry(resolvedParentDir, repoRoot);
  const alreadyIgnored = gitignoreContains(gitignorePath, gitignoreEntry);

  // Nothing to do
  if (dirExists && alreadyIgnored) {
    return result;
  }

  // Prompt in interactive mode
  if (interactive && (!dirExists || !alreadyIgnored)) {
    const actions: string[] = [];
    if (!dirExists) {
      actions.push(`create \`${gitignoreEntry}/\``);
    }
    if (!alreadyIgnored) {
      actions.push(`add \`${gitignoreEntry}\` to .gitignore`);
    }

    const confirmed = await promptConfirm(`Will ${actions.join(' and ')}. Continue?`, true);

    if (!confirmed) {
      result.declined = true;
      return result;
    }
  }

  // Create directory
  if (!dirExists) {
    fs.mkdirSync(resolvedParentDir, { recursive: true });
    result.created = true;
    logger.info(`Created worktree directory: ${gitignoreEntry}/`);
  }

  // Update .gitignore
  if (!alreadyIgnored) {
    addToGitignore(gitignorePath, gitignoreEntry);
    result.gitignoreUpdated = true;
    logger.info(`Added ${gitignoreEntry} to .gitignore`);
  }

  return result;
}
