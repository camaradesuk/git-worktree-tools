/**
 * Config Migration System - Types and Constants
 *
 * Provides schema versioning, detection of deprecated configurations,
 * and guided migrations for git-worktree-tools.
 */

/**
 * Current schema version - increment ONLY for breaking changes
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * Minimum version that can be migrated (older versions unsupported)
 */
export const MINIMUM_SUPPORTED_VERSION = 1;

/**
 * Default backup directory name
 */
export const BACKUP_DIRECTORY = '.worktree-backups';

/**
 * Issue severity levels
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Types of migration issues that can be detected
 */
export type IssueType =
  | 'missing_version' // No configVersion field present
  | 'outdated_version' // configVersion < CURRENT_CONFIG_VERSION
  | 'future_version' // configVersion > CURRENT (needs tool upgrade)
  | 'legacy_wtlinkrc' // Separate .wtlinkrc file exists
  | 'deprecated_key' // Key scheduled for removal
  | 'unknown_key' // Unrecognised key (possible typo)
  | 'invalid_value_type'; // Value has wrong type

/**
 * Represents a single detected issue
 */
export interface MigrationIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  details?: string;
  keyPath?: string; // e.g., 'hooks.post-worktree'
  currentValue?: unknown;
  suggestedValue?: unknown;
  suggestion?: string; // Human-readable fix suggestion
  autoFixable: boolean;
  fixAction?: MigrationAction;
}

/**
 * Action to execute during migration
 */
export interface MigrationAction {
  type:
    | 'set_key' // Set or update a key
    | 'remove_key' // Remove a key
    | 'rename_key' // Rename a key
    | 'merge_legacy_file' // Merge .wtlinkrc into config
    | 'delete_file'; // Delete a file (legacy cleanup)

  keyPath?: string;
  oldKey?: string; // For rename operations
  newKey?: string; // For rename operations
  value?: unknown; // For set operations
  filePath?: string; // For file operations
  description: string; // Human-readable description
}

/**
 * Result of running detection
 */
export interface DetectionResult {
  issues: MigrationIssue[];
  autoFixableCount: number;
  manualFixCount: number;
  migrationRecommended: boolean;
  currentVersion?: number;
  targetVersion: number;
  configPath?: string;
  legacyFilesFound: string[];
  /** Raw config object for inspection */
  rawConfig?: Record<string, unknown>;
  /** Parse error if config couldn't be parsed */
  parseError?: string;
}

/**
 * Result of running migration
 */
export interface MigrationResult {
  success: boolean;
  actionsExecuted: MigrationAction[];
  actionsSkipped: MigrationAction[];
  errors: string[];
  backupPath?: string;
  newConfigPath?: string;
}

/**
 * Options for migration execution
 */
export interface MigrationOptions {
  dryRun?: boolean;
  deleteLegacyFiles?: boolean;
  createBackup?: boolean; // Default: true
  interactive?: boolean; // Default: true
}

/**
 * Result of merging wtlink configurations
 */
export interface WtlinkMergeResult {
  enabled: string[];
  disabled: string[];
  conflicts: string[];
}

/**
 * Registry of known configuration keys
 * This must match KNOWN_TOP_LEVEL_KEYS in config-validation.ts
 */
export const KNOWN_CONFIG_KEYS = new Set([
  '$schema',
  'configVersion',
  'baseBranch',
  'draftPr',
  'worktreePattern',
  'worktreeParent',
  'branchPrefix',
  'sharedRepos',
  'syncPatterns',
  'previewLabel',
  'preferredEditor',
  'hooks',
  'hookDefaults',
  'wtlink',
  'ai',
  'plugins',
  'generators',
  'integrations',
  'logging',
  'global',
]);

/**
 * Deprecated keys with migration guidance
 */
export const DEPRECATED_KEYS: Record<
  string,
  {
    message: string;
    replacement?: string;
    transform?: (value: unknown) => unknown;
  }
> = {
  // Future deprecations would be registered here
  // Example:
  // 'oldKeyName': {
  //   message: 'oldKeyName is deprecated, use newKeyName instead',
  //   replacement: 'newKeyName',
  // },
};

/**
 * Version history for documentation and migration paths
 */
export const VERSION_HISTORY: Record<
  number,
  {
    released: string;
    description: string;
    breakingChanges: string[];
  }
> = {
  1: {
    released: '2026-01-13',
    description: 'Initial versioned configuration format',
    breakingChanges: [
      'wtlink configuration now integrated into .worktreerc',
      'Hooks system added',
      'AI configuration section added',
    ],
  },
};
