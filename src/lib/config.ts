import fs from 'fs';
import path from 'path';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_WORKTREE_PATTERN,
  DEFAULT_WORKTREE_PARENT,
  DEFAULT_BRANCH_PREFIX,
  CONFIG_FILE_NAMES,
} from './constants.js';

/**
 * Configuration for git-worktree-tools
 */
export interface WorktreeConfig {
  /**
   * Sibling repos to also create worktrees for
   * e.g., ["cluster-gitops", "infrastructure"]
   */
  sharedRepos?: string[];

  /**
   * Base branch for new PRs (default: "main")
   */
  baseBranch?: string;

  /**
   * Create PRs as drafts by default
   */
  draftPr?: boolean;

  /**
   * Worktree directory naming pattern
   * Placeholders: {repo}, {number}, {branch}
   * Default: "{repo}.pr{number}"
   */
  worktreePattern?: string;

  /**
   * Parent directory for worktrees
   * Can be absolute or relative to repo root
   * Default: ".." (sibling to main repo)
   */
  worktreeParent?: string;

  /**
   * Files/directories to sync between worktrees using symlinks
   * e.g., ["node_modules", ".env.local"]
   */
  syncPatterns?: string[];

  /**
   * Branch name prefix for auto-generated branches
   * Default: "feat"
   */
  branchPrefix?: string;
}

/**
 * Get default configuration values
 */
export function getDefaultConfig(): Required<WorktreeConfig> {
  return {
    sharedRepos: [],
    baseBranch: DEFAULT_BASE_BRANCH,
    draftPr: false,
    worktreePattern: DEFAULT_WORKTREE_PATTERN,
    worktreeParent: DEFAULT_WORKTREE_PARENT,
    syncPatterns: [],
    branchPrefix: DEFAULT_BRANCH_PREFIX,
  };
}

/**
 * Find config file in repository
 */
function findConfigFile(repoRoot: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = path.join(repoRoot, fileName);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Load configuration from repository
 * Merges with defaults, repo config takes precedence
 */
export function loadConfig(repoRoot: string): Required<WorktreeConfig> {
  const defaults = getDefaultConfig();
  const configPath = findConfigFile(repoRoot);

  if (!configPath) {
    return defaults;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const userConfig: WorktreeConfig = JSON.parse(content);

    // Merge with defaults
    return {
      ...defaults,
      ...userConfig,
    };
  } catch (error) {
    // If config file exists but is invalid, warn but continue with defaults
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Failed to parse ${configPath}: ${message}`);
    return defaults;
  }
}

/**
 * Generate worktree path based on config pattern
 */
export function generateWorktreePath(
  config: Required<WorktreeConfig>,
  repoRoot: string,
  repoName: string,
  prNumber: number,
  branchName?: string
): string {
  let pattern = config.worktreePattern;

  // Replace placeholders
  pattern = pattern.replace('{repo}', repoName);
  pattern = pattern.replace('{number}', String(prNumber));
  if (branchName) {
    pattern = pattern.replace('{branch}', branchName);
  }

  // Resolve parent directory
  let parentDir: string;
  if (path.isAbsolute(config.worktreeParent)) {
    parentDir = config.worktreeParent;
  } else {
    parentDir = path.resolve(repoRoot, config.worktreeParent);
  }

  return path.join(parentDir, pattern);
}

/**
 * Generate branch name from description
 */
export function generateBranchName(config: Required<WorktreeConfig>, description: string): string {
  // Convert to lowercase, replace spaces and special chars with hyphens
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length

  // Generate a short random suffix for uniqueness
  const suffix = Math.random().toString(36).substring(2, 8);

  return `${config.branchPrefix}/${slug}-${suffix}`;
}
