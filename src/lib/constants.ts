/**
 * Centralized constants and defaults for git-worktree-tools
 */

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
 * Config file names to look for (in order of priority)
 */
export const CONFIG_FILE_NAMES = ['.worktreerc', '.worktreerc.json'];

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
