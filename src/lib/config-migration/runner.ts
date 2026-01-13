/**
 * Config Migration Runner
 *
 * Executes migration actions with:
 * - Atomic writes (temp file + rename)
 * - Backup creation before modifications
 * - Rollback on failure
 * - Legacy file merging
 */

import fs from 'fs';
import path from 'path';
import { findRepoConfigFile, getSchemaUrl } from '../global-config.js';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';
import { parseManifest } from '../wtlink/link-configs.js';
import { validateConfig } from '../config-validation.js';
import { logger } from '../logger.js';
import {
  BACKUP_DIRECTORY,
  CURRENT_CONFIG_VERSION,
  type DetectionResult,
  type MigrationAction,
  type MigrationOptions,
  type MigrationResult,
  type WtlinkMergeResult,
} from './types.js';

/**
 * Normalize a file path for consistent comparison
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Merge wtlink configurations from existing config and legacy file
 * Uses "enabled wins" conflict resolution
 */
export function mergeWtlinkConfigs(
  existing: { enabled?: string[]; disabled?: string[] } | undefined,
  legacy: { enabled: string[]; disabled: string[] }
): WtlinkMergeResult {
  const enabledSet = new Set<string>();
  const disabledSet = new Set<string>();
  const conflicts: string[] = [];

  // Add existing entries
  for (const file of existing?.enabled ?? []) {
    enabledSet.add(normalizePath(file));
  }
  for (const file of existing?.disabled ?? []) {
    disabledSet.add(normalizePath(file));
  }

  // Merge legacy entries
  for (const file of legacy.enabled) {
    const norm = normalizePath(file);
    if (disabledSet.has(norm)) {
      // Conflict: file is disabled in config but enabled in legacy
      conflicts.push(`${file}: enabled in .wtlinkrc but disabled in .worktreerc`);
      // Resolution: enabled wins (more recent intent)
      disabledSet.delete(norm);
    }
    enabledSet.add(norm);
  }

  for (const file of legacy.disabled) {
    const norm = normalizePath(file);
    if (!enabledSet.has(norm)) {
      disabledSet.add(norm);
    }
    // If already enabled, skip (enabled takes precedence)
  }

  return {
    enabled: Array.from(enabledSet).sort(),
    disabled: Array.from(disabledSet).sort(),
    conflicts,
  };
}

/**
 * Create a backup of the current config file
 *
 * @param configPath - Path to the config file to backup
 * @param repoRoot - Repository root for backup directory
 * @returns Path to the backup file
 */
export function createConfigBackup(configPath: string, repoRoot: string): string {
  const backupDir = path.join(repoRoot, BACKUP_DIRECTORY);

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    logger.debug(`Created backup directory: ${backupDir}`);
  }

  const timestamp = Date.now();
  // Add random suffix to ensure uniqueness even in same millisecond
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const configName = path.basename(configPath);
  const backupName = `${configName}.backup.${timestamp}.${randomSuffix}`;
  const backupPath = path.join(backupDir, backupName);

  fs.copyFileSync(configPath, backupPath);
  logger.info(`Created backup: ${backupPath}`);

  return backupPath;
}

/**
 * Restore config from a backup file
 *
 * @param backupPath - Path to the backup file
 * @param configPath - Path to restore to
 */
export function restoreFromBackup(backupPath: string, configPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  fs.copyFileSync(backupPath, configPath);
  logger.info(`Restored config from backup: ${backupPath}`);
}

/**
 * Write config atomically using temp file + rename pattern
 * This ensures the config file is never in an inconsistent state
 */
async function atomicWriteConfig(
  configPath: string,
  config: Record<string, unknown>
): Promise<void> {
  const tempPath = `${configPath}.tmp.${process.pid}.${Date.now()}`;

  // Ensure config has $schema
  const configWithSchema = {
    $schema: getSchemaUrl(),
    ...config,
  };

  const content = JSON.stringify(configWithSchema, null, 2) + '\n';

  try {
    // 1. Write to temporary file
    await fs.promises.writeFile(tempPath, content, { encoding: 'utf-8', mode: 0o644 });

    // 2. Sync to ensure data is on disk
    const fd = await fs.promises.open(tempPath, 'r');
    await fd.sync();
    await fd.close();

    // 3. On Windows, file handles may not be released immediately after close()
    // Small delay to allow the OS to release the handle
    if (process.platform === 'win32') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // 4. Atomic rename (POSIX guarantees atomicity)
    await fs.promises.rename(tempPath, configPath);

    logger.debug(`Atomically wrote config to: ${configPath}`);
  } catch (error) {
    // Clean up temp file on any failure
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Parse legacy .wtlinkrc file and return enabled/disabled entries
 */
function parseLegacyWtlinkrc(legacyPath: string): { enabled: string[]; disabled: string[] } {
  const content = fs.readFileSync(legacyPath, 'utf-8');
  const { active, commented } = parseManifest(content);
  return { enabled: active, disabled: commented };
}

/**
 * Execute migration with given options
 *
 * @param repoRoot - Repository root path
 * @param detection - Detection result from detectMigrationIssues
 * @param options - Migration options
 * @returns Migration result
 */
export async function runMigration(
  repoRoot: string,
  detection: DetectionResult,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const {
    dryRun = false,
    deleteLegacyFiles = false,
    createBackup: shouldBackup = true,
    // interactive option is handled by the CLI layer
  } = options;

  const actionsExecuted: MigrationAction[] = [];
  const actionsSkipped: MigrationAction[] = [];
  const errors: string[] = [];
  let backupPath: string | undefined;

  // Filter to only auto-fixable issues
  const autoFixableIssues = detection.issues.filter(
    (issue) => issue.autoFixable && issue.fixAction
  );

  if (autoFixableIssues.length === 0) {
    return {
      success: true,
      actionsExecuted: [],
      actionsSkipped: [],
      errors: [],
    };
  }

  // Dry run - just report what would be done
  if (dryRun) {
    return {
      success: true,
      actionsExecuted: [],
      actionsSkipped: autoFixableIssues.map((i) => i.fixAction!),
      errors: [],
    };
  }

  // Get or create config path
  let configPath = detection.configPath;
  if (!configPath) {
    configPath = path.join(repoRoot, '.worktreerc');
  }

  // Load current config (or start with empty)
  const config: Record<string, unknown> = detection.rawConfig ?? {};

  // Create backup before making changes
  if (shouldBackup && fs.existsSync(configPath)) {
    try {
      backupPath = createConfigBackup(configPath, repoRoot);
    } catch (error) {
      errors.push(
        `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        success: false,
        actionsExecuted,
        actionsSkipped: autoFixableIssues.map((i) => i.fixAction!),
        errors,
      };
    }
  }

  // Execute each action
  for (const issue of autoFixableIssues) {
    const action = issue.fixAction!;

    try {
      switch (action.type) {
        case 'set_key': {
          if (action.keyPath) {
            config[action.keyPath] = action.value;
            actionsExecuted.push(action);
            logger.debug(`Set ${action.keyPath} = ${JSON.stringify(action.value)}`);
          }
          break;
        }

        case 'remove_key': {
          if (action.keyPath && action.keyPath in config) {
            delete config[action.keyPath];
            actionsExecuted.push(action);
            logger.debug(`Removed key: ${action.keyPath}`);
          }
          break;
        }

        case 'rename_key': {
          if (action.oldKey && action.newKey && action.oldKey in config) {
            config[action.newKey] = action.value ?? config[action.oldKey];
            delete config[action.oldKey];
            actionsExecuted.push(action);
            logger.debug(`Renamed ${action.oldKey} to ${action.newKey}`);
          }
          break;
        }

        case 'merge_legacy_file': {
          if (action.filePath && fs.existsSync(action.filePath)) {
            try {
              const legacyData = parseLegacyWtlinkrc(action.filePath);
              const existingWtlink = config.wtlink as
                | { enabled?: string[]; disabled?: string[] }
                | undefined;
              const merged = mergeWtlinkConfigs(existingWtlink, legacyData);

              config.wtlink = {
                enabled: merged.enabled,
                disabled: merged.disabled,
              };

              actionsExecuted.push(action);

              if (merged.conflicts.length > 0) {
                logger.warn(
                  `Merge conflicts resolved (enabled wins):\n  ${merged.conflicts.join('\n  ')}`
                );
              }

              logger.debug(
                `Merged legacy wtlinkrc: ${merged.enabled.length} enabled, ${merged.disabled.length} disabled`
              );
            } catch (parseError) {
              errors.push(
                `Failed to parse legacy file: ${parseError instanceof Error ? parseError.message : String(parseError)}`
              );
              actionsSkipped.push(action);
            }
          }
          break;
        }

        case 'delete_file': {
          // Only delete if explicitly requested
          if (deleteLegacyFiles && action.filePath && fs.existsSync(action.filePath)) {
            fs.unlinkSync(action.filePath);
            actionsExecuted.push(action);
            logger.debug(`Deleted file: ${action.filePath}`);
          } else {
            actionsSkipped.push(action);
          }
          break;
        }
      }
    } catch (error) {
      errors.push(
        `Failed to execute ${action.type}: ${error instanceof Error ? error.message : String(error)}`
      );
      actionsSkipped.push(action);
    }
  }

  // Ensure configVersion is set
  if (!config.configVersion) {
    config.configVersion = CURRENT_CONFIG_VERSION;
  }

  // Write the updated config
  try {
    await atomicWriteConfig(configPath, config);
  } catch (writeError) {
    errors.push(
      `Failed to write config: ${writeError instanceof Error ? writeError.message : String(writeError)}`
    );

    // Try to rollback
    if (backupPath) {
      try {
        restoreFromBackup(backupPath, configPath);
        logger.info('Rolled back to backup after write failure');
      } catch (rollbackError) {
        errors.push(
          `Failed to rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
    }

    return {
      success: false,
      actionsExecuted,
      actionsSkipped,
      errors,
      backupPath,
    };
  }

  // Validate the migrated config
  const validationResult = validateConfig(config);
  if (!validationResult.valid) {
    const validationErrors = validationResult.errors.map((e) => `${e.path}: ${e.message}`);
    logger.warn(`Migrated config has validation warnings:\n  ${validationErrors.join('\n  ')}`);
    // Don't fail on validation warnings - the config is still usable
  }

  // Optionally delete legacy files after successful migration
  if (deleteLegacyFiles) {
    for (const legacyPath of detection.legacyFilesFound) {
      try {
        if (fs.existsSync(legacyPath)) {
          fs.unlinkSync(legacyPath);
          logger.info(`Deleted legacy file: ${legacyPath}`);
        }
      } catch (deleteError) {
        errors.push(
          `Failed to delete legacy file ${legacyPath}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`
        );
      }
    }
  }

  return {
    success: errors.length === 0,
    actionsExecuted,
    actionsSkipped,
    errors,
    backupPath,
    newConfigPath: configPath,
  };
}
