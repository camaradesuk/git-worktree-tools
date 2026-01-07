import fs from 'fs';
import path from 'path';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_WORKTREE_PATTERN,
  DEFAULT_WORKTREE_PARENT,
  DEFAULT_BRANCH_PREFIX,
  CONFIG_FILE_NAMES,
  LogLevel,
} from './constants.js';
import type { AIConfig, BranchContext, PRContext } from './ai/types.js';
import { DEFAULT_AI_CONFIG } from './ai/types.js';
import type { HooksConfig } from './hooks/types.js';
import { gatherRepoDocumentation } from './ai/repo-docs.js';
import {
  validateConfig,
  formatValidationErrors,
  type ValidationResult,
} from './config-validation.js';
import {
  loadGlobalConfig,
  findRepoConfigFile,
  findLocalConfigFile,
  getSchemaUrl,
  getConfigPaths,
  type ConfigSource,
} from './global-config.js';
import { logger } from './logger.js';

/**
 * Hook execution defaults configuration
 */
export interface HookDefaultsConfig {
  /**
   * Default timeout for individual hook execution (in milliseconds)
   * Default: 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Maximum timeout allowed for any hook (in milliseconds)
   * Default: 60000 (60 seconds)
   */
  maxTimeout?: number;
}

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
 * Logging configuration
 */
export interface LoggingConfig {
  /**
   * Log level threshold
   * Options: "silent", "error", "warn", "info", "debug", "trace"
   * Default: "info"
   */
  level?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  /**
   * Path to log file for persistent logging
   * If set, logs will be written to this file in addition to console
   * Supports ~ for home directory
   */
  logFile?: string;

  /**
   * Enable timestamps in log output
   * Default: true
   */
  timestamps?: boolean;
}

/**
 * Global settings that typically live in the global config
 */
export interface GlobalSettings {
  /**
   * Warn if the package is not installed globally
   * Default: true
   */
  warnNotGlobal?: boolean;

  /**
   * Logging configuration (also applies to repo/local configs)
   */
  logging?: LoggingConfig;
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
   * Gitignored config files to sync between worktrees via hard links
   * e.g., [".env.local", ".vscode/settings.json"]
   */
  syncPatterns?: string[];

  /**
   * Branch name prefix for auto-generated branches
   * Default: "feat"
   */
  branchPrefix?: string;

  /**
   * Label name to highlight in PR list
   * Default: "preview"
   */
  previewLabel?: string;

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
   * Default settings for hook execution
   * Allows customizing timeout values for hooks
   */
  hookDefaults?: HookDefaultsConfig;

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

  /**
   * Logging configuration
   * Controls verbosity and log file output
   */
  logging?: LoggingConfig;

  /**
   * Global settings
   * These are typically set in the global config file
   */
  global?: GlobalSettings;
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
    previewLabel: 'preview',
    preferredEditor: 'vscode',
    ai: DEFAULT_AI_CONFIG,
    hooks: {},
    hookDefaults: {
      timeout: 30000,
      maxTimeout: 60000,
    },
    plugins: [],
    generators: {},
    integrations: {},
    logging: {
      level: 'info',
      timestamps: true,
    },
    global: {
      warnNotGlobal: true,
    },
  };
}

// Note: findConfigFile functionality moved to global-config.ts (findRepoConfigFile, findLocalConfigFile)

/**
 * Options for loading configuration
 */
export interface LoadConfigOptions {
  /** Whether to validate the config (default: true) */
  validate?: boolean;
  /** Whether to warn on validation errors (default: true) */
  warnOnErrors?: boolean;
}

/**
 * Information about a loaded config source
 */
export interface LoadedConfigSource {
  path: string;
  level: 'global' | 'repo' | 'local';
  config: WorktreeConfig;
  validation: ValidationResult | null;
}

/**
 * Result of loading and validating config
 */
export interface LoadConfigResult {
  config: Required<WorktreeConfig>;
  /** Primary config path (for backward compatibility - now refers to highest priority loaded config) */
  configPath: string | null;
  /** Validation result for the merged config */
  validation: ValidationResult | null;
  /** All config sources that were loaded */
  sources: LoadedConfigSource[];
}

/**
 * Load configuration from repository (or global config only if no repoRoot)
 * Implements three-tier hierarchy: defaults ← global ← repo ← local
 */
export function loadConfig(
  repoRoot?: string,
  options: LoadConfigOptions = {}
): Required<WorktreeConfig> {
  const result = loadConfigWithValidation(repoRoot, options);
  return result.config;
}

/**
 * Load a single config file and validate it
 */
function loadSingleConfigFile(
  filePath: string,
  level: 'global' | 'repo' | 'local',
  validate: boolean
): LoadedConfigSource | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config: WorktreeConfig = JSON.parse(content);

    let validation: ValidationResult | null = null;
    if (validate) {
      validation = validateConfig(config);
    }

    return { path: filePath, level, config, validation };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to parse config file ${filePath}: ${message}`);
    return {
      path: filePath,
      level,
      config: {},
      validation: { valid: false, errors: [{ path: '', message: `Parse error: ${message}` }] },
    };
  }
}

/**
 * Load configuration with full validation result
 * Implements three-tier hierarchy: defaults ← global ← repo ← local
 */
export function loadConfigWithValidation(
  repoRoot?: string,
  options: LoadConfigOptions = {}
): LoadConfigResult {
  const { validate = true, warnOnErrors = true } = options;
  const defaults = getDefaultConfig();
  const sources: LoadedConfigSource[] = [];

  // 1. Load global config (lowest priority after defaults)
  const globalConfig = loadGlobalConfig();
  if (globalConfig) {
    const globalPath = getConfigPaths().global.path;
    let validation: ValidationResult | null = null;
    if (validate) {
      validation = validateConfig(globalConfig);
      if (!validation.valid && warnOnErrors) {
        logger.warn(
          `Global config has validation errors: ${formatValidationErrors(validation.errors)}`
        );
      }
    }
    sources.push({ path: globalPath, level: 'global', config: globalConfig, validation });
    logger.debug(`Loaded global config from ${globalPath}`);
  }

  // 2. Load repo config (medium priority)
  if (repoRoot) {
    const repoConfigPath = findRepoConfigFile(repoRoot);
    if (repoConfigPath) {
      const repoSource = loadSingleConfigFile(repoConfigPath, 'repo', validate);
      if (repoSource) {
        if (!repoSource.validation?.valid && warnOnErrors && repoSource.validation) {
          logger.warn(
            `Repo config has validation errors: ${formatValidationErrors(repoSource.validation.errors)}`
          );
        }
        sources.push(repoSource);
        logger.debug(`Loaded repo config from ${repoConfigPath}`);
      }
    }

    // 3. Load local config (highest priority)
    const localConfigPath = findLocalConfigFile(repoRoot);
    if (localConfigPath) {
      const localSource = loadSingleConfigFile(localConfigPath, 'local', validate);
      if (localSource) {
        if (!localSource.validation?.valid && warnOnErrors && localSource.validation) {
          logger.warn(
            `Local config has validation errors: ${formatValidationErrors(localSource.validation.errors)}`
          );
        }
        sources.push(localSource);
        logger.debug(`Loaded local config from ${localConfigPath}`);
      }
    }
  }

  // Merge configs in order: defaults ← global ← repo ← local
  let merged: Required<WorktreeConfig> = defaults;

  for (const source of sources) {
    merged = mergeConfigs(merged, source.config);
  }

  // Determine primary config path (highest priority loaded)
  const primarySource = sources.length > 0 ? sources[sources.length - 1] : null;
  const configPath = primarySource?.path ?? null;

  // Aggregate validation errors
  const allErrors = sources
    .filter((s) => s.validation && !s.validation.valid)
    .flatMap((s) => s.validation!.errors.map((e) => ({ ...e, source: s.path })));

  const validation: ValidationResult | null =
    allErrors.length > 0 ? { valid: false, errors: allErrors } : { valid: true, errors: [] };

  return { config: merged, configPath, validation, sources };
}

/**
 * Merge two configs with deep merging for nested objects
 */
function mergeConfigs(
  base: Required<WorktreeConfig>,
  override: WorktreeConfig
): Required<WorktreeConfig> {
  return {
    ...base,
    ...override,
    sharedRepos: override.sharedRepos ?? base.sharedRepos,
    syncPatterns: override.syncPatterns ?? base.syncPatterns,
    plugins: override.plugins ?? base.plugins,
    ai: {
      ...base.ai,
      ...override.ai,
    },
    hooks: {
      ...base.hooks,
      ...override.hooks,
    },
    hookDefaults: {
      ...base.hookDefaults,
      ...override.hookDefaults,
    },
    generators: {
      ...base.generators,
      ...override.generators,
    },
    integrations: {
      ...base.integrations,
      ...override.integrations,
      linear: override.integrations?.linear
        ? { ...base.integrations?.linear, ...override.integrations.linear }
        : base.integrations?.linear,
      jira: override.integrations?.jira
        ? { ...base.integrations?.jira, ...override.integrations.jira }
        : base.integrations?.jira,
      slack: override.integrations?.slack
        ? { ...base.integrations?.slack, ...override.integrations.slack }
        : base.integrations?.slack,
    },
    logging: {
      ...base.logging,
      ...override.logging,
    },
    global: {
      ...base.global,
      ...override.global,
      logging: override.global?.logging
        ? { ...base.global?.logging, ...override.global.logging }
        : base.global?.logging,
    },
  };
}

/**
 * Save configuration to repository
 *
 * @param repoRoot - Repository root path
 * @param config - Configuration to save (partial config, will preserve existing values)
 * @param options - Save options
 * @returns Path to saved config file
 */
export function saveConfig(
  repoRoot: string,
  config: WorktreeConfig,
  options: { validate?: boolean } = {}
): { configPath: string; validation: ValidationResult | null } {
  const { validate = true } = options;

  // Validate before saving if requested
  let validation: ValidationResult | null = null;
  if (validate) {
    validation = validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Config validation failed:\n${formatValidationErrors(validation.errors)}`);
    }
  }

  // Find existing config or use default name
  let configPath = findRepoConfigFile(repoRoot);
  if (!configPath) {
    configPath = path.join(repoRoot, CONFIG_FILE_NAMES[0]); // Use .worktreerc
  }

  // Load existing config to merge with
  let existingConfig: WorktreeConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      existingConfig = JSON.parse(content);
    } catch (error) {
      // If existing config is invalid, start fresh
      logger.debug(
        'Failed to parse existing config at %s, starting fresh: %s',
        configPath,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Deep merge the configs
  const mergedConfig = deepMergeConfigs(existingConfig, config);

  // Write with pretty printing
  const content = JSON.stringify(mergedConfig, null, 2);
  fs.writeFileSync(configPath, content + '\n', 'utf8');

  return { configPath, validation };
}

/**
 * Deep merge two config objects
 */
function deepMergeConfigs(base: WorktreeConfig, override: WorktreeConfig): WorktreeConfig {
  const result: WorktreeConfig = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;

    const baseValue = (base as Record<string, unknown>)[key];

    // Deep merge objects (but not arrays)
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMergeConfigs(
        baseValue as WorktreeConfig,
        value as WorktreeConfig
      );
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

/**
 * Get config file path for a repository (or null if none exists)
 * Returns the highest priority config that exists (local > repo)
 */
export function getConfigPath(repoRoot: string): string | null {
  // Check local config first (highest priority)
  const localPath = findLocalConfigFile(repoRoot);
  if (localPath) return localPath;

  // Then check repo config
  const repoPath = findRepoConfigFile(repoRoot);
  if (repoPath) return repoPath;

  return null;
}

/**
 * Get the schema URL for IDE support
 * Uses unpkg.com to serve the schema directly from npm
 */
export { getSchemaUrl } from './global-config.js';

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
 * @param repoRoot - Repository root path for documentation gathering (optional)
 */
export async function generateBranchNameAsync(
  config: Required<WorktreeConfig>,
  description: string,
  repoName = 'repo',
  repoRoot?: string
): Promise<string> {
  // If AI is enabled for branch names, try to use it
  if (config.ai.provider !== 'none' && config.ai.branchName) {
    try {
      const { createAIGenerationService } = await import('./ai/index.js');
      const service = createAIGenerationService(config.ai);

      // Gather repository documentation for context
      const repoDocumentation = repoRoot
        ? gatherRepoDocumentation(repoRoot, { maxReadmeLength: 1000 })
        : undefined;

      const context: BranchContext = {
        description,
        repoName,
        branchPrefix: config.branchPrefix,
        existingBranches: [], // Could be populated for smarter suggestions
        repoDocumentation,
      };

      const result = await service.generateBranchName(context);
      if (result.success && result.content) {
        return result.content;
      }
      // Fall through to rule-based on failure
      logger.debug('AI branch name generation returned unsuccessful result, using rule-based');
    } catch (error) {
      // Fall through to rule-based on error
      logger.debug(
        'AI branch name generation failed, using rule-based: %s',
        error instanceof Error ? error.message : String(error)
      );
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
  /** Repository root path for documentation gathering */
  repoRoot?: string;
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

      // Gather repository documentation for context
      const repoDocumentation = context.repoRoot
        ? gatherRepoDocumentation(context.repoRoot, { maxReadmeLength: 2000 })
        : undefined;

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
        repoDocumentation,
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
    } catch (error) {
      // Fall through to defaults on error
      logger.debug(
        'AI PR content generation failed, using defaults: %s',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return defaultResult;
}
