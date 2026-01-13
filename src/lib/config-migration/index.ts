/**
 * Config Migration System - Public API
 *
 * Provides schema versioning, detection of deprecated configurations,
 * and guided migrations for git-worktree-tools.
 *
 * @example
 * ```typescript
 * import { detectMigrationIssues, runMigration, needsMigration } from './config-migration/index.js';
 *
 * // Quick check for startup banners
 * if (needsMigration(repoRoot)) {
 *   console.log('Config migration available. Run: wtconfig migrate');
 * }
 *
 * // Full detection
 * const detection = detectMigrationIssues(repoRoot);
 * if (detection.migrationRecommended) {
 *   const result = await runMigration(repoRoot, detection, { interactive: true });
 * }
 * ```
 */

// Re-export types
export type {
  IssueSeverity,
  IssueType,
  MigrationIssue,
  MigrationAction,
  DetectionResult,
  MigrationResult,
  MigrationOptions,
  WtlinkMergeResult,
} from './types.js';

// Re-export constants
export {
  CURRENT_CONFIG_VERSION,
  MINIMUM_SUPPORTED_VERSION,
  BACKUP_DIRECTORY,
  KNOWN_CONFIG_KEYS,
  DEPRECATED_KEYS,
  VERSION_HISTORY,
} from './types.js';

// Re-export detection functions
export { detectMigrationIssues, needsMigration } from './detector.js';

// Re-export migration runner functions
export { runMigration, createConfigBackup, restoreFromBackup } from './runner.js';

// Re-export reporter functions
export {
  formatMigrationReport,
  formatMigrationReportJSON,
  formatMigrationResultReport,
  formatMigrationResultJSON,
  formatDryRunPreview,
} from './reporter.js';

// Re-export merge utility (useful for testing)
export { mergeWtlinkConfigs } from './runner.js';
