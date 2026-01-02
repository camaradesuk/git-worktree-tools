import fs from 'fs';
import path from 'path';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_WORKTREE_PATTERN,
  DEFAULT_WORKTREE_PARENT,
  DEFAULT_BRANCH_PREFIX,
  CONFIG_FILE_NAMES,
} from './constants.js';
import type { AIConfig, BranchContext, PRContext } from './ai/types.js';
import { DEFAULT_AI_CONFIG } from './ai/types.js';
import type { HooksConfig } from './hooks/types.js';

/**
 * Custom generator scripts configuration
 * Paths to scripts that generate content instead of using built-in AI
 */
export interface GeneratorsConfig {
  /**
   * Path to custom branch name generator script
   * Script receives context and should return the branch name
   */
  branchName?: string;

  /**
   * Path to custom PR title generator script
   */
  prTitle?: string;

  /**
   * Path to custom PR description generator script
   */
  prDescription?: string;

  /**
   * Path to custom commit message generator script
   */
  commitMessage?: string;
}

/**
 * Linear integration configuration
 */
export interface LinearIntegration {
  /**
   * Linear team ID for issue linking
   */
  teamId?: string;

  /**
   * API key environment variable name (default: LINEAR_API_KEY)
   */
  apiKeyEnv?: string;
}

/**
 * Jira integration configuration
 */
export interface JiraIntegration {
  /**
   * Jira project key (e.g., "PROJ")
   */
  projectKey?: string;

  /**
   * Jira base URL
   */
  baseUrl?: string;

  /**
   * API token environment variable name (default: JIRA_API_TOKEN)
   */
  apiTokenEnv?: string;
}

/**
 * Slack integration configuration
 */
export interface SlackIntegration {
  /**
   * Slack webhook URL for notifications
   * Can also be an environment variable name (e.g., "SLACK_WEBHOOK_URL")
   */
  webhookUrl?: string;

  /**
   * Default channel for notifications
   */
  channel?: string;
}

/**
 * Third-party integrations configuration
 */
export interface IntegrationsConfig {
  /**
   * Linear issue tracker integration
   */
  linear?: LinearIntegration;

  /**
   * Jira issue tracker integration
   */
  jira?: JiraIntegration;

  /**
   * Slack notification integration
   */
  slack?: SlackIntegration;
}

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

  /**
   * Preferred editor for "Open in editor" action in lswt interactive mode
   * Options: "vscode" | "cursor" | "auto"
   * Default: "vscode"
   */
  preferredEditor?: 'vscode' | 'cursor' | 'auto';

  /**
   * AI content generation configuration
   */
  ai?: AIConfig;

  /**
   * Lifecycle hooks configuration
   *
   * Define shell commands or scripts to run at various points in the workflow.
   * Available hooks: pre-analyze, post-analyze, pre-branch, post-branch,
   * pre-commit, post-commit, pre-push, post-push, pre-pr, post-pr,
   * pre-worktree, post-worktree, cleanup
   */
  hooks?: HooksConfig;

  /**
   * Plugin packages to load
   * Can be npm package names or paths to local plugin files
   * e.g., ["@worktree-tools/plugin-linear", "./plugins/custom.js"]
   */
  plugins?: string[];

  /**
   * Custom generator scripts configuration
   * Paths to scripts that generate content instead of using built-in AI
   */
  generators?: GeneratorsConfig;

  /**
   * Third-party integrations configuration
   */
  integrations?: IntegrationsConfig;
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
    preferredEditor: 'vscode',
    ai: DEFAULT_AI_CONFIG,
    hooks: {},
    plugins: [],
    generators: {},
    integrations: {},
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

    // Merge with defaults (deep merge for nested config objects)
    return {
      ...defaults,
      ...userConfig,
      ai: {
        ...defaults.ai,
        ...userConfig.ai,
      },
      hooks: {
        ...defaults.hooks,
        ...userConfig.hooks,
      },
      plugins: userConfig.plugins ?? defaults.plugins,
      generators: {
        ...defaults.generators,
        ...userConfig.generators,
      },
      integrations: {
        ...defaults.integrations,
        ...userConfig.integrations,
        // Deep merge nested integration configs
        linear: userConfig.integrations?.linear
          ? { ...defaults.integrations?.linear, ...userConfig.integrations.linear }
          : defaults.integrations?.linear,
        jira: userConfig.integrations?.jira
          ? { ...defaults.integrations?.jira, ...userConfig.integrations.jira }
          : defaults.integrations?.jira,
        slack: userConfig.integrations?.slack
          ? { ...defaults.integrations?.slack, ...userConfig.integrations.slack }
          : defaults.integrations?.slack,
      },
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
 * Generate branch name from description (synchronous, rule-based)
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

/**
 * Generate branch name from description with AI support
 *
 * Uses AI if enabled in config, otherwise falls back to rule-based generation.
 *
 * @param config - The worktree configuration
 * @param description - User-provided description for the branch
 * @param repoName - Repository name (optional, defaults to 'repo')
 */
export async function generateBranchNameAsync(
  config: Required<WorktreeConfig>,
  description: string,
  repoName = 'repo'
): Promise<string> {
  // If AI is enabled for branch names, try to use it
  if (config.ai.provider !== 'none' && config.ai.branchName) {
    try {
      const { createAIGenerationService } = await import('./ai/index.js');
      const service = createAIGenerationService(config.ai);

      const context: BranchContext = {
        description,
        repoName,
        branchPrefix: config.branchPrefix,
        existingBranches: [], // Could be populated for smarter suggestions
      };

      const result = await service.generateBranchName(context);
      if (result.success && result.content) {
        return result.content;
      }
      // Fall through to rule-based on failure
    } catch {
      // Fall through to rule-based on error
    }
  }

  // Fall back to rule-based generation
  return generateBranchName(config, description);
}

/**
 * Context for generating PR content
 */
export interface PRGenerationContext {
  description: string;
  branchName: string;
  baseBranch?: string;
  diff?: string;
  changedFiles?: string[];
  commitMessages?: string[];
}

/**
 * Result of PR content generation
 */
export interface PRGenerationResult {
  title: string;
  description: string;
  aiGenerated: boolean;
}

/**
 * Generate PR title and description with AI support
 *
 * Uses AI if enabled in config, otherwise falls back to simple defaults.
 */
export async function generatePRContentAsync(
  config: Required<WorktreeConfig>,
  context: PRGenerationContext
): Promise<PRGenerationResult> {
  const defaultResult: PRGenerationResult = {
    title: context.description,
    description: '',
    aiGenerated: false,
  };

  // If AI is enabled for PR content, try to use it
  if (config.ai.provider !== 'none' && (config.ai.prTitle || config.ai.prDescription)) {
    try {
      const { createAIGenerationService } = await import('./ai/index.js');
      const service = createAIGenerationService(config.ai);

      const prContext: PRContext = {
        description: context.description,
        branchName: context.branchName,
        baseBranch: context.baseBranch || config.baseBranch,
        diff: context.diff,
        changedFiles: context.changedFiles || [],
        commits: (context.commitMessages || []).map((msg) => ({
          message: msg,
          hash: '',
        })),
      };

      let title = context.description;
      let description = '';
      let anyGenerated = false;

      // Generate title if enabled
      if (config.ai.prTitle) {
        const titleResult = await service.generatePRTitle(prContext);
        if (titleResult.success && titleResult.content) {
          title = titleResult.content;
          anyGenerated = true;
        }
      }

      // Generate description if enabled
      if (config.ai.prDescription) {
        const descResult = await service.generatePRDescription(prContext);
        if (descResult.success && descResult.content) {
          description = descResult.content;
          anyGenerated = true;
        }
      }

      if (anyGenerated) {
        return { title, description, aiGenerated: true };
      }
    } catch {
      // Fall through to defaults on error
    }
  }

  return defaultResult;
}
