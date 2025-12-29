import { execSync, ExecSyncOptions } from 'child_process';
import path from 'path';
import os from 'os';

/**
 * Commit relationship to base branch
 */
export type CommitRelationship = 'same' | 'ahead' | 'behind' | 'divergent' | 'ancestor';

/**
 * Working tree status
 */
export type WorkingTreeStatus = 'clean' | 'staged_only' | 'unstaged_only' | 'both';

/**
 * Worktree information
 */
export interface Worktree {
  path: string;
  branch: string | null;
  commit: string;
  isMain: boolean;
  isBare: boolean;
  isLocked: boolean;
  isPrunable: boolean;
}

/**
 * Stash options
 */
export interface StashOptions {
  keepIndex?: boolean;
  message?: string;
  includeUntracked?: boolean;
}

/**
 * Commit options
 */
export interface CommitOptions {
  all?: boolean;
  allowEmpty?: boolean;
  message: string;
}

/**
 * Push options
 */
export interface PushOptions {
  setUpstream?: boolean;
  force?: boolean;
  remote?: string;
  branch?: string;
}

/**
 * Shell-escape a string for use in a command
 */
function shellEscape(str: string): string {
  // If string contains spaces or special chars, wrap in quotes and escape internal quotes
  if (/[\s"'\\]/.test(str)) {
    return `"${str.replace(/["\\]/g, '\\$&')}"`;
  }
  return str;
}

/**
 * Execute a git command and return output
 */
export function exec(args: string[], options: { cwd?: string; silent?: boolean } = {}): string {
  const escapedArgs = args.map(shellEscape);
  const cmd = `git ${escapedArgs.join(' ')}`;
  const execOptions: ExecSyncOptions = {
    encoding: 'utf8',
    cwd: options.cwd,
    stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
  };

  try {
    const result = execSync(cmd, execOptions) as string;
    // Use trimEnd to preserve leading whitespace (significant in git status output)
    return result.trimEnd();
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      const stderr = (error as { stderr?: Buffer | string }).stderr;
      if (stderr) {
        throw new Error(`Git command failed: ${cmd}\n${stderr.toString()}`);
      }
    }
    throw error;
  }
}

/**
 * Execute a git command, returning null on failure instead of throwing
 */
export function execSafe(args: string[], options: { cwd?: string } = {}): string | null {
  try {
    return exec(args, { ...options, silent: true });
  } catch {
    return null;
  }
}

/**
 * Get the root directory of the current git repository
 */
export function getRepoRoot(cwd?: string): string {
  const result = exec(['rev-parse', '--show-toplevel'], { cwd, silent: true });
  // Normalize path for cross-platform compatibility
  return path.normalize(result);
}

/**
 * Get repository name from remote URL or directory name
 */
export function getRepoName(repoRoot: string): string {
  const remoteUrl = execSafe(['remote', 'get-url', 'origin'], { cwd: repoRoot });

  if (remoteUrl) {
    // Extract repo name from SSH or HTTPS URL
    // git@github.com:org/repo.git -> repo
    // https://github.com/org/repo.git -> repo
    const match = remoteUrl.match(/[/:]([^/]+?)(?:\.git)?$/);
    if (match) {
      return match[1];
    }
  }

  // Fall back to directory name
  return path.basename(repoRoot);
}

/**
 * Get the current branch name, or null if detached HEAD
 */
export function getCurrentBranch(cwd?: string): string | null {
  const result = exec(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, silent: true });
  return result === 'HEAD' ? null : result;
}

/**
 * Check if in detached HEAD state
 */
export function isDetachedHead(cwd?: string): boolean {
  return getCurrentBranch(cwd) === null;
}

/**
 * Get the current commit SHA
 */
export function getHeadCommit(cwd?: string): string {
  return exec(['rev-parse', 'HEAD'], { cwd, silent: true });
}

/**
 * Get short commit SHA
 */
export function getShortCommit(cwd?: string, ref: string = 'HEAD'): string {
  return exec(['rev-parse', '--short', ref], { cwd, silent: true });
}

/**
 * Check if a remote exists
 */
export function hasRemote(remote: string = 'origin', cwd?: string): boolean {
  const result = execSafe(['remote', 'get-url', remote], { cwd });
  return result !== null;
}

/**
 * Fetch from remote
 */
export function fetch(remote: string = 'origin', cwd?: string): void {
  exec(['fetch', remote], { cwd, silent: true });
}

/**
 * Get the commit SHA of a ref
 */
export function getRefCommit(ref: string, cwd?: string): string | null {
  return execSafe(['rev-parse', ref], { cwd });
}

/**
 * Determine commit relationship to base branch
 */
export function getCommitRelationship(
  baseBranch: string = 'main',
  cwd?: string
): CommitRelationship {
  const remote = 'origin';
  const baseRef = `${remote}/${baseBranch}`;

  const headCommit = getHeadCommit(cwd);
  const baseCommit = getRefCommit(baseRef, cwd);

  if (!baseCommit) {
    // Base branch doesn't exist, assume divergent
    return 'divergent';
  }

  if (headCommit === baseCommit) {
    return 'same';
  }

  // Check if HEAD is an ancestor of base (already merged)
  const isAncestor = execSafe(['merge-base', '--is-ancestor', 'HEAD', baseRef], { cwd });
  if (isAncestor !== null) {
    return 'ancestor';
  }

  // Check if base is an ancestor of HEAD (we're ahead)
  const baseIsAncestor = execSafe(['merge-base', '--is-ancestor', baseRef, 'HEAD'], { cwd });
  if (baseIsAncestor !== null) {
    return 'ahead';
  }

  // Check if HEAD is behind base
  const mergeBase = execSafe(['merge-base', 'HEAD', baseRef], { cwd });
  if (mergeBase === headCommit) {
    return 'behind';
  }

  return 'divergent';
}

/**
 * Get list of commits ahead of base
 */
export function getCommitsAhead(
  baseBranch: string = 'main',
  cwd?: string
): string[] {
  const remote = 'origin';
  const baseRef = `${remote}/${baseBranch}`;

  const result = execSafe(['rev-list', `${baseRef}..HEAD`, '--oneline'], { cwd });
  if (!result) {
    return [];
  }

  return result.split('\n').filter(Boolean);
}

/**
 * Get working tree status
 */
export function getWorkingTreeStatus(cwd?: string): WorkingTreeStatus {
  const status = exec(['status', '--porcelain'], { cwd, silent: true });

  if (!status) {
    return 'clean';
  }

  const lines = status.split('\n').filter(Boolean);

  let hasStaged = false;
  let hasUnstaged = false;

  for (const line of lines) {
    const indexStatus = line[0];
    const worktreeStatus = line[1];

    // Staged changes: first char is not ' ' or '?'
    if (indexStatus !== ' ' && indexStatus !== '?') {
      hasStaged = true;
    }

    // Unstaged changes: second char is not ' ' or untracked files
    if (worktreeStatus !== ' ' || indexStatus === '?') {
      hasUnstaged = true;
    }
  }

  if (hasStaged && hasUnstaged) {
    return 'both';
  } else if (hasStaged) {
    return 'staged_only';
  } else if (hasUnstaged) {
    return 'unstaged_only';
  }

  return 'clean';
}

/**
 * Get staged files
 */
export function getStagedFiles(cwd?: string): string[] {
  const result = execSafe(['diff', '--cached', '--name-only'], { cwd });
  if (!result) {
    return [];
  }
  return result.split('\n').filter(Boolean);
}

/**
 * Get unstaged files (modified + untracked)
 */
export function getUnstagedFiles(cwd?: string): string[] {
  const status = exec(['status', '--porcelain'], { cwd, silent: true });

  if (!status) {
    return [];
  }

  const files: string[] = [];
  const lines = status.split('\n').filter(Boolean);

  for (const line of lines) {
    const worktreeStatus = line[1];
    const indexStatus = line[0];

    // Unstaged changes or untracked files
    if (worktreeStatus !== ' ' || indexStatus === '?') {
      // Extract filename (starts at position 3)
      files.push(line.substring(3));
    }
  }

  return files;
}

/**
 * Get git status output (for display)
 */
export function getStatusOutput(cwd?: string): string {
  return exec(['status', '--porcelain'], { cwd, silent: true });
}

/**
 * List all worktrees
 */
export function listWorktrees(cwd?: string): Worktree[] {
  const result = exec(['worktree', 'list', '--porcelain'], { cwd, silent: true });

  if (!result) {
    return [];
  }

  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of result.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        worktrees.push(current as Worktree);
      }
      current = {
        path: line.substring(9),
        branch: null,
        commit: '',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      };
    } else if (line.startsWith('HEAD ')) {
      current.commit = line.substring(5);
    } else if (line.startsWith('branch ')) {
      // refs/heads/branch-name -> branch-name
      current.branch = line.substring(7).replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.isBare = true;
      current.isMain = true;
    } else if (line === 'locked') {
      current.isLocked = true;
    } else if (line === 'prunable') {
      current.isPrunable = true;
    } else if (line === '' && current.path) {
      // Empty line marks end of entry
    }
  }

  // Don't forget the last entry
  if (current.path) {
    worktrees.push(current as Worktree);
  }

  // Mark the first non-bare worktree as main
  const firstNonBare = worktrees.find((w) => !w.isBare);
  if (firstNonBare) {
    firstNonBare.isMain = true;
  }

  return worktrees;
}

/**
 * Find the main worktree
 */
export function getMainWorktree(cwd?: string): Worktree | null {
  const worktrees = listWorktrees(cwd);
  return worktrees.find((w) => w.isMain && !w.isBare) || null;
}

/**
 * Check if current directory is a worktree (not main)
 */
export function isWorktree(cwd?: string): boolean {
  const repoRoot = getRepoRoot(cwd);
  const worktrees = listWorktrees(cwd);
  const current = worktrees.find(
    (w) => path.normalize(w.path) === path.normalize(repoRoot)
  );
  return current ? !current.isMain : false;
}

/**
 * Add a new worktree
 */
export function addWorktree(
  worktreePath: string,
  branch: string,
  options: { createBranch?: boolean; startPoint?: string; cwd?: string } = {}
): void {
  const args = ['worktree', 'add'];

  if (options.createBranch) {
    args.push('-b', branch);
    args.push(worktreePath);
    if (options.startPoint) {
      args.push(options.startPoint);
    }
  } else {
    args.push(worktreePath, branch);
  }

  exec(args, { cwd: options.cwd });
}

/**
 * Remove a worktree
 */
export function removeWorktree(
  worktreePath: string,
  options: { force?: boolean; cwd?: string } = {}
): void {
  const args = ['worktree', 'remove'];
  if (options.force) {
    args.push('--force');
  }
  args.push(worktreePath);

  exec(args, { cwd: options.cwd });
}

/**
 * Prune worktrees
 */
export function pruneWorktrees(cwd?: string): void {
  exec(['worktree', 'prune'], { cwd });
}

/**
 * Create a new branch
 */
export function createBranch(
  name: string,
  startPoint?: string,
  cwd?: string
): void {
  const args = ['branch', name];
  if (startPoint) {
    args.push(startPoint);
  }
  exec(args, { cwd });
}

/**
 * Delete a branch
 */
export function deleteBranch(
  name: string,
  options: { force?: boolean; cwd?: string } = {}
): void {
  const flag = options.force ? '-D' : '-d';
  exec(['branch', flag, name], { cwd: options.cwd });
}

/**
 * Checkout a branch or commit
 */
export function checkout(ref: string, cwd?: string): void {
  exec(['checkout', ref], { cwd });
}

/**
 * Stage files
 */
export function add(paths: string[] | string = '.', cwd?: string): void {
  const pathList = Array.isArray(paths) ? paths : [paths];
  exec(['add', ...pathList], { cwd });
}

/**
 * Create a commit
 */
export function commit(options: CommitOptions, cwd?: string): string {
  const args = ['commit'];

  if (options.all) {
    args.push('-a');
  }

  if (options.allowEmpty) {
    args.push('--allow-empty');
  }

  args.push('-m', options.message);

  exec(args, { cwd });

  // Return the new commit SHA
  return getHeadCommit(cwd);
}

/**
 * Push to remote
 */
export function push(options: PushOptions = {}, cwd?: string): void {
  const args = ['push'];

  if (options.setUpstream) {
    args.push('-u');
  }

  if (options.force) {
    args.push('--force');
  }

  if (options.remote) {
    args.push(options.remote);
  }

  if (options.branch) {
    args.push(options.branch);
  }

  exec(args, { cwd });
}

/**
 * Stash changes
 * Returns stash reference if created, null if nothing to stash
 */
export function stash(options: StashOptions = {}, cwd?: string): string | null {
  const args = ['stash', 'push'];

  if (options.keepIndex) {
    args.push('--keep-index');
  }

  if (options.includeUntracked) {
    args.push('--include-untracked');
  }

  if (options.message) {
    args.push('-m', options.message);
  }

  const result = exec(args, { cwd });

  // Check if anything was stashed
  if (result.includes('No local changes to save')) {
    return null;
  }

  // Return stash reference
  return 'stash@{0}';
}

/**
 * Apply stashed changes
 */
export function stashApply(stashRef: string = 'stash@{0}', cwd?: string): void {
  exec(['stash', 'apply', stashRef], { cwd });
}

/**
 * Drop a stash entry
 */
export function stashDrop(stashRef: string = 'stash@{0}', cwd?: string): void {
  exec(['stash', 'drop', stashRef], { cwd });
}

/**
 * Pop stashed changes (apply + drop)
 */
export function stashPop(stashRef: string = 'stash@{0}', cwd?: string): void {
  exec(['stash', 'pop', stashRef], { cwd });
}

/**
 * Get commit log
 */
export function getLog(
  range: string,
  options: { format?: string; maxCount?: number; cwd?: string } = {}
): string[] {
  const args = ['log', '--oneline'];

  if (options.format) {
    args.push(`--format=${options.format}`);
  }

  if (options.maxCount) {
    args.push(`-n${options.maxCount}`);
  }

  args.push(range);

  const result = execSafe(args, { cwd: options.cwd });
  if (!result) {
    return [];
  }

  return result.split('\n').filter(Boolean);
}

/**
 * Check if a branch exists locally
 */
export function branchExists(name: string, cwd?: string): boolean {
  const result = execSafe(['rev-parse', '--verify', `refs/heads/${name}`], { cwd });
  return result !== null;
}

/**
 * Check if a branch exists on remote
 */
export function remoteBranchExists(
  name: string,
  remote: string = 'origin',
  cwd?: string
): boolean {
  const result = execSafe(['rev-parse', '--verify', `refs/remotes/${remote}/${name}`], { cwd });
  return result !== null;
}
