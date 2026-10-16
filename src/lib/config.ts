import fs from 'fs';
import path from 'path';
import {
  DEFAULT_BASE_BRANCH,
  DEFAULT_WORKTREE_PATTERN,
  DEFAULT_WORKTREE_PARENT,
  DEFAULT_WORKTREE_PARENT_ANCHOR,
  DEFAULT_BRANCH_PREFIX,
  CONFIG_FILE_NAMES,
  LogLevel,
} from './constants.js';
import type { AIConfig, AIGenerationResult, BranchContext, PRContext } from './ai/types.js';
import { DEFAULT_AI_CONFIG } from './ai/types.js';
import type { HooksConfig } from './hooks/types.js';
import { gatherRepoDocumentation } from './ai/repo-docs.js';
import {
  validateConfig,
  formatValidationErrors,
  type ValidationResult,
} from './config-validation.js';
import { readEnvOverrides, applyEnvOverrides } from './config-env.js';
import {
  loadGlobalConfig,
  findRepoConfigFile,
  findLocalConfigFile,
  getSchemaUrl,
  getConfigPaths,
  type ConfigSource,
} from './global-config.js';
import { logger } from './logger.js';
import { printStatus } from './ui/index.js';
import * as git from './git.js';

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
 * Configuration for wtlink - worktree config file linking
 *
 * Use this for full manifest control with enable/disable state tracking.
 * For simpler use cases, use the top-level syncPatterns field instead.
 */
export interface WtlinkConfig {
  /**
   * Git-ignored files to actively link between worktrees
   * These files will be hard-linked from the main worktree to feature worktrees
   * e.g., [".vscode/settings.json", ".env.local", "node_modules"]
   */
  enabled?: string[];

  /**
   * Git-ignored files tracked but not currently linked
   * These can be re-enabled via 'wtlink manage'
   * Useful for temporarily disabling files without losing track of them
   */
  disabled?: string[];
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
   * Configuration schema version for migration support
   * Increment only for breaking schema changes
   * Current version: 1
   */
  configVersion?: number;

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
   * Placeholders: {repo}, {number}, {branch}, {slug}
   * {slug} is the branch name after the first '/', filesystem-safe (e.g. "feat/my-feature" → "my-feature")
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
   * Anchor used to resolve a relative `worktreeParent`.
   * - "main-worktree" (default): anchor to the main worktree root, resolved via
   *   `getMainWorktreeRoot()`. For a bare-repository container (`.bare/` + linked
   *   worktrees) this is the container directory. Stable regardless of which
   *   worktree the command is invoked from.
   * - "repo-root": anchor to the current worktree's root (legacy behaviour, the
   *   only option before this setting existed).
   * Default: "main-worktree"
   */
  worktreeParentAnchor?: 'main-worktree' | 'repo-root';

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

  /**
   * wtlink configuration for syncing config files between worktrees
   *
   * Provides full manifest control with enable/disable state tracking.
   * Takes precedence over syncPatterns when present.
   * Files in 'enabled' will be actively linked, files in 'disabled' are
   * tracked but not linked (can be re-enabled via 'wtlink manage').
   */
  wtlink?: WtlinkConfig;

  /**
   * Auto-link config files when creating worktrees
   *
   * Controls whether tracked config files (via wtlink manifest) are automatically
   * linked from the main worktree to new feature worktrees during newpr.
   *
   * - undefined (not set): Prompt the user interactively
   * - true: Auto-link without prompting
   * - false: Skip linking without prompting
   */
  linkConfigFiles?: boolean | undefined;
}

/**
 * Resolved configuration with all defaults applied.
 * Note: linkConfigFiles can be undefined to indicate "prompt user"
 */
export type ResolvedConfig = Omit<Required<WorktreeConfig>, 'linkConfigFiles'> & {
  linkConfigFiles: boolean | undefined;
};

/**
 * Get default configuration values
 */
export function getDefaultConfig(): ResolvedConfig {
  return {
    configVersion: 1,
    sharedRepos: [],
    baseBranch: DEFAULT_BASE_BRANCH,
    draftPr: false,
    worktreePattern: DEFAULT_WORKTREE_PATTERN,
    worktreeParent: DEFAULT_WORKTREE_PARENT,
    worktreeParentAnchor: DEFAULT_WORKTREE_PARENT_ANCHOR,
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
    wtlink: {
      enabled: [],
      disabled: [],
    },
    linkConfigFiles: undefined,
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
  /** Environment to read GWT_AI_* overrides from. Defaults to process.env; override in tests. */
  env?: NodeJS.ProcessEnv;
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
  config: ResolvedConfig;
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
export function loadConfig(repoRoot?: string, options: LoadConfigOptions = {}): ResolvedConfig {
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
 * Find the checkout that owns repository-local configuration.
 *
 * Conventional repositories always use their primary checkout. Bare-container
 * layouts normally use the configured base-branch checkout; when that branch is
 * declared only in a local config, a unique self-describing checkout bootstraps
 * discovery without falling back to an arbitrary path-sorted worktree.
 */
function findCanonicalLocalConfigRoot(repoRoot: string, baseBranch: string): string {
  try {
    if (git.isBareContainerLayout(repoRoot)) {
      const selfDescribingRoots = git
        .listWorktrees(repoRoot)
        .filter((worktree) => !worktree.isBare && worktree.branch !== null)
        .filter((worktree) => {
          const localPath = findLocalConfigFile(worktree.path);
          if (!localPath) {
            return false;
          }
          const localSource = loadSingleConfigFile(localPath, 'local', false);
          return localSource?.config.baseBranch === worktree.branch;
        })
        .map((worktree) => worktree.path);

      if (selfDescribingRoots.length === 1) {
        return selfDescribingRoots[0];
      }
    }

    return git.getMainWorktree(repoRoot, baseBranch)?.path ?? repoRoot;
  } catch {
    return repoRoot;
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

    // 3. Load local config (highest priority). A gitignored local config exists
    // only in one checkout, so commands invoked from another linked worktree
    // must read it from the canonical base-branch checkout.
    const baseBranch =
      [...sources].reverse().find((source) => source.config.baseBranch !== undefined)?.config
        .baseBranch ?? defaults.baseBranch;
    const localConfigRoot = findCanonicalLocalConfigRoot(repoRoot, baseBranch);

    const localConfigPath = findLocalConfigFile(localConfigRoot);
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
  let merged: ResolvedConfig = defaults;

  for (const source of sources) {
    merged = mergeConfigs(merged, source.config);
  }

  // Apply environment-variable overrides — beats every file tier, is beaten
  // by CLI flags (applied one tier higher at the call site). Throws
  // ConfigurationError (→ INVALID_CONFIG) for an invalid value; never falls
  // back silently.
  const envOverrides = readEnvOverrides(options.env ?? process.env);
  merged = applyEnvOverrides(merged, envOverrides);

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
function mergeConfigs(base: ResolvedConfig, override: WorktreeConfig): ResolvedConfig {
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
    wtlink: {
      // Arrays replace (don't merge) across hierarchy levels - consistent with tsconfig/ESLint patterns
      enabled: override.wtlink?.enabled ?? base.wtlink.enabled,
      disabled: override.wtlink?.disabled ?? base.wtlink.disabled,
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
  options: { validate?: boolean; configPath?: string } = {}
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
  let configPath = options.configPath ?? findRepoConfigFile(repoRoot);
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
  const result = loadConfigWithValidation(repoRoot, {
    validate: false,
    warnOnErrors: false,
  });
  const repositorySources = result.sources.filter((source) => source.level !== 'global');
  return repositorySources.at(-1)?.path ?? null;
}

/**
 * Get the schema URL for IDE support
 * Uses unpkg.com to serve the schema directly from npm
 */
export { getSchemaUrl } from './global-config.js';

/**
 * Generate worktree path based on config pattern.
 *
 * A relative `worktreeParent` is resolved against `mainWorktreeRoot` (defaulting to
 * `repoRoot` when omitted, preserving pre-anchor-fix behaviour for callers that
 * haven't been updated). Set `config.worktreeParentAnchor` to "repo-root" to anchor
 * against `repoRoot` instead. Absolute `worktreeParent` values are always used as-is.
 */
export function generateWorktreePath(
  config: ResolvedConfig,
  repoRoot: string,
  repoName: string,
  prNumber: number,
  branchName?: string,
  mainWorktreeRoot?: string
): string {
  let pattern = config.worktreePattern;

  // Track whether pattern starts with {repo} to avoid stripping legitimate
  // leading separators that originate from the repo name (e.g. ".dotfiles")
  const patternStartsWithRepo = pattern.startsWith('{repo}');

  // Replace placeholders
  pattern = pattern.replace('{repo}', repoName);
  pattern = pattern.replace('{number}', String(prNumber));
  if (branchName) {
    pattern = pattern.replace('{branch}', branchName);
    // {slug}: branch after first '/', with non-filesystem-safe chars replaced by '-'
    const slugBase = branchName.includes('/')
      ? branchName.substring(branchName.indexOf('/') + 1)
      : branchName;
    const slug = slugBase.replace(/[^a-zA-Z0-9._-]/g, '-');
    pattern = pattern.replace('{slug}', slug);
  } else {
    // Strip unreplaced branch-dependent placeholders so paths stay clean
    pattern = pattern.replace('{branch}', '');
    pattern = pattern.replace('{slug}', '');
  }

  // Clean up separator artifacts from placeholder replacement
  // Remove doubled separators: pr123..foo → pr123.foo
  pattern = pattern.replace(/([.\-_]){2,}/g, '$1');
  // Remove leading separators (.pr123 → pr123), but only when the pattern did not
  // start with {repo} — a repo name like ".dotfiles" has a legitimate leading dot
  if (!patternStartsWithRepo) {
    pattern = pattern.replace(/^[.\-_]+/, '');
  }
  // Remove trailing separators: pr123. → pr123
  pattern = pattern.replace(/[.\-_]+$/, '');

  // Resolve parent directory
  let parentDir: string;
  if (path.isAbsolute(config.worktreeParent)) {
    parentDir = config.worktreeParent;
  } else {
    const anchor =
      config.worktreeParentAnchor === 'repo-root' ? repoRoot : (mainWorktreeRoot ?? repoRoot);
    const containWithinAnchor =
      config.worktreeParentAnchor !== 'repo-root' && git.isBareContainerLayout(repoRoot);
    parentDir = resolveRelativeWorktreeParent(anchor, config.worktreeParent, containWithinAnchor);
  }

  return path.join(parentDir, pattern);
}

/**
 * Resolve a relative worktree parent without silently escaping a bare-repository
 * container. This keeps legacy checkout-relative overrides such as `../pr`
 * compatible after `main-worktree` anchoring moved to the container root.
 */
export function resolveRelativeWorktreeParent(
  anchor: string,
  worktreeParent: string,
  containWithinAnchor = false
): string {
  const resolved = path.resolve(anchor, worktreeParent);

  if (!containWithinAnchor || isWithin(anchor, resolved)) {
    return resolved;
  }

  const containedSegments: string[] = [];
  for (const segment of path.normalize(worktreeParent).split(path.sep)) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      containedSegments.pop();
      continue;
    }
    containedSegments.push(segment);
  }
  const containedParent = containedSegments.join(path.sep);
  const contained = path.resolve(anchor, containedParent);

  logger.warn(
    `worktreeParent "${worktreeParent}" resolves outside the bare-repository container ` +
      `"${anchor}"; using "${contained}" instead. Update the relative parent or use an ` +
      `absolute path / worktreeParentAnchor: "repo-root" to place worktrees outside it.`
  );

  return contained;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Generate branch name from description (synchronous, rule-based)
 */
export function generateBranchName(config: ResolvedConfig, description: string): string {
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
  config: ResolvedConfig,
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
  /**
   * Restrict generation to the fields the caller actually needs.
   *
   * A caller that already has a title from a flag gains nothing from a
   * generated one (the flag wins), so requesting it only costs latency and
   * quota. Omit to generate every field enabled in config, which is the
   * historical behaviour.
   */
  needed?: { title: boolean; description: boolean };
}

/**
 * Result of PR content generation
 */
export interface PRGenerationResult {
  title: string;
  description: string;
  aiGenerated: boolean;
  /**
   * True only when a model actually produced the title.
   *
   * `aiGenerated` covers both fields at once, so it cannot distinguish "the
   * model wrote the title" from "the model wrote only the description and the
   * title is still the caller's `context.description`". Consumers reporting
   * provenance must use this per-field flag, not the truthiness of `title`.
   */
  titleGenerated?: boolean;
  /** True only when a model actually produced the description. */
  descriptionGenerated?: boolean;
  /** Provider that generated content, or null when AI did not contribute. */
  provider?: string | null;
  /** Why generation produced nothing, or null when not attempted / successful. */
  error?: string | null;
}

/**
 * Summarise per-field AI generation failures, or null if none failed.
 *
 * Used on both the total-failure path and the partial-success path, so a
 * field that failed is always reported even when its sibling succeeded.
 * Names the real provider from each result rather than any placeholder.
 */
function describeFailures(
  results: {
    titleResult?: AIGenerationResult;
    descResult?: AIGenerationResult;
  },
  prefix = 'AI generation produced no content'
): string | null {
  const reasons: string[] = [];

  if (results.titleResult) {
    reasons.push(
      `title via '${results.titleResult.provider}': ${
        results.titleResult.error ?? 'returned no content'
      }`
    );
  }
  if (results.descResult) {
    reasons.push(
      `description via '${results.descResult.provider}': ${
        results.descResult.error ?? 'returned no content'
      }`
    );
  }

  return reasons.length > 0 ? `${prefix} (${reasons.join('; ')})` : null;
}

/**
 * Generate PR title and description with AI support
 *
 * Uses AI if enabled in config, otherwise falls back to simple defaults.
 */
export async function generatePRContentAsync(
  config: ResolvedConfig,
  context: PRGenerationContext
): Promise<PRGenerationResult> {
  const defaultResult: PRGenerationResult = {
    title: context.description,
    description: '',
    aiGenerated: false,
    titleGenerated: false,
    descriptionGenerated: false,
    provider: null,
    error: null,
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
      let titleGenerated = false;
      let descriptionGenerated = false;
      let providerName = 'ai';
      let titleResult: AIGenerationResult | undefined;
      let descResult: AIGenerationResult | undefined;

      // Only generate what the caller actually needs. A field the caller has
      // already supplied by flag cannot be replaced by generation (the flag
      // wins), so requesting it would cost latency and quota for nothing.
      const wantTitle = context.needed ? context.needed.title : true;
      const wantDescription = context.needed ? context.needed.description : true;

      // Generate title if enabled
      if (config.ai.prTitle && wantTitle) {
        titleResult = await service.generatePRTitle(prContext);
        if (titleResult.success && titleResult.content) {
          title = titleResult.content;
          anyGenerated = true;
          titleGenerated = true;
          providerName = titleResult.provider;
        }
      }

      // Generate description if enabled
      if (config.ai.prDescription && wantDescription) {
        descResult = await service.generatePRDescription(prContext);
        if (descResult.success && descResult.content) {
          description = descResult.content;
          anyGenerated = true;
          descriptionGenerated = true;
          providerName = descResult.provider;
        }
      }

      if (anyGenerated) {
        // Partial success still has to report the half that failed. Without
        // this, a generated title plus a failed description yields a template
        // body and aiError: null, which a JSON caller cannot distinguish from
        // "generation wasn't needed".
        const partialFailures = describeFailures(
          {
            titleResult: titleGenerated ? undefined : titleResult,
            descResult: descriptionGenerated ? undefined : descResult,
          },
          // Not "produced no content" here — at least one field WAS generated,
          // and the caller will see titleSource/bodySource say so. A blanket
          // "no content" would contradict the provenance sitting beside it.
          'AI generation partially failed'
        );

        // A field can also be missing because its generator is switched off
        // rather than because it failed. That produces no AIGenerationResult
        // at all, so describeFailures() cannot see it — report it separately,
        // otherwise the caller gets template content with aiError: null.
        const disabledNotes: string[] = [];
        if (!titleGenerated && !titleResult && wantTitle && !config.ai.prTitle) {
          disabledNotes.push('title not generated (ai.prTitle disabled)');
        }
        if (!descriptionGenerated && !descResult && wantDescription && !config.ai.prDescription) {
          disabledNotes.push('description not generated (ai.prDescription disabled)');
        }

        const notes = [partialFailures, ...disabledNotes].filter(Boolean);

        // Name every provider that actually contributed. With a fallback
        // configured, executeWithFallback picks per operation, so the title
        // and description can come from different providers — reporting only
        // the last one assigned would credit a provider that produced nothing
        // for the other field.
        const contributors = [
          titleGenerated ? titleResult?.provider : undefined,
          descriptionGenerated ? descResult?.provider : undefined,
        ].filter((p): p is string => Boolean(p));
        const providerLabel =
          contributors.length > 0 ? [...new Set(contributors)].join(', ') : providerName;

        printStatus('info', `\u2728 AI-generated PR content (${providerLabel})`);

        return {
          title,
          description,
          aiGenerated: true,
          titleGenerated,
          descriptionGenerated,
          provider: providerLabel,
          error: notes.length > 0 ? notes.join('; ') : null,
        };
      }

      // Nothing was even attempted: every generator that could have run was
      // switched off (ai.prTitle / ai.prDescription false, or the caller only
      // needed a field whose generator is disabled). That is NOT a failure,
      // but it must not look like the "generation not needed" success case
      // either — the caller asked for content and silently got the template.
      if (!titleResult && !descResult) {
        const disabled = [
          config.ai.prTitle ? null : 'ai.prTitle',
          config.ai.prDescription ? null : 'ai.prDescription',
        ].filter(Boolean);
        const why =
          disabled.length > 0
            ? `AI generation not attempted (${disabled.join(' and ')} disabled)`
            : 'AI generation not attempted (no field required generation)';
        return { ...defaultResult, error: why };
      }

      // A provider was attempted but produced nothing. Build the diagnostic
      // from the real result(s) rather than the last-assigned providerName
      // (which is never reassigned on failure, so it would still read the
      // 'ai' placeholder and hide the actual provider/error).
      const reason =
        describeFailures({ titleResult, descResult }) ?? 'AI generation produced no content';

      printStatus('warning', `\u26a0 AI generation failed: ${reason}`);

      return {
        ...defaultResult,
        error: reason,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      printStatus('warning', `\u26A0 AI generation failed: ${reason}`);
      return { ...defaultResult, error: reason };
    }
  }

  // The AI block was skipped entirely. `provider: 'none'` is a deliberate
  // opt-out that the caller already knows about (resolvePRContent reports it),
  // but a configured provider with BOTH PR generators switched off is not
  // self-evident: the caller gets template content with no explanation, which
  // is indistinguishable from the documented "generation not needed" success
  // case. Say so.
  if (config.ai.provider !== 'none') {
    return {
      ...defaultResult,
      error: 'AI generation not attempted (ai.prTitle and ai.prDescription are both disabled)',
    };
  }

  return defaultResult;
}
