/**
 * Config-Manifest Adapter Layer
 *
 * Provides a unified interface for loading and saving wtlink manifest data,
 * supporting both the new .worktreerc-based config and the legacy .wtlinkrc file.
 *
 * Migration path:
 * 1. Check .worktreerc for wtlink.enabled/disabled
 * 2. If not found, fall back to .wtlinkrc file
 * 3. If neither, return empty manifest
 *
 * When saving, always writes to .worktreerc
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';
import { loadConfig, saveConfig, type WorktreeConfig } from '../config.js';
import { parseManifest } from './link-configs.js';
import { logger } from '../logger.js';

/**
 * Data structure for manifest entries
 */
export interface ManifestData {
  /** Files actively linked between worktrees */
  enabled: string[];
  /** Files tracked but not currently linked */
  disabled: string[];
  /** Source of the manifest data */
  source: 'config' | 'legacy-file' | 'empty';
}

/**
 * Result of a migration operation
 */
export interface MigrationResult {
  migrated: boolean;
  message: string;
  /** Files that were migrated */
  enabledCount?: number;
  disabledCount?: number;
}

/**
 * Load manifest data from config or legacy file
 *
 * Priority:
 * 1. .worktreerc wtlink section (if has entries)
 * 2. .wtlinkrc legacy file
 * 3. Empty manifest
 *
 * @param repoRoot - Repository root path (main worktree)
 * @returns Manifest data with source indicator
 */
export function loadManifestData(repoRoot: string): ManifestData {
  // 1. Try loading from .worktreerc config
  const config = loadConfig(repoRoot, { validate: true, warnOnErrors: false });

  if (config.wtlink) {
    const hasEnabled = config.wtlink.enabled && config.wtlink.enabled.length > 0;
    const hasDisabled = config.wtlink.disabled && config.wtlink.disabled.length > 0;

    if (hasEnabled || hasDisabled) {
      logger.debug('Loaded manifest from .worktreerc config');
      return {
        enabled: config.wtlink.enabled || [],
        disabled: config.wtlink.disabled || [],
        source: 'config',
      };
    }
  }

  // 2. Fall back to legacy .wtlinkrc file
  const legacyPath = path.join(repoRoot, DEFAULT_MANIFEST_FILE);
  if (fs.existsSync(legacyPath)) {
    try {
      const content = fs.readFileSync(legacyPath, 'utf-8');
      const { active, commented } = parseManifest(content);

      logger.debug('Loaded manifest from legacy .wtlinkrc file');
      logger.warn(
        `Using legacy ${DEFAULT_MANIFEST_FILE} format. Run 'wtlink migrate' to move to .worktreerc (recommended)`
      );

      return {
        enabled: active,
        disabled: commented,
        source: 'legacy-file',
      };
    } catch (error) {
      logger.warn(
        `Failed to parse legacy manifest at ${legacyPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // 3. Return empty manifest
  logger.debug('No manifest found, returning empty');
  return {
    enabled: [],
    disabled: [],
    source: 'empty',
  };
}

/**
 * Save manifest data to .worktreerc config
 *
 * @param repoRoot - Repository root path
 * @param enabled - Files to actively link
 * @param disabled - Files tracked but not linked
 */
export function saveManifestData(repoRoot: string, enabled: string[], disabled: string[]): void {
  const wtlinkConfig: WorktreeConfig = {
    wtlink: {
      enabled: enabled.length > 0 ? enabled : [],
      disabled: disabled.length > 0 ? disabled : [],
    },
  };

  saveConfig(repoRoot, wtlinkConfig, { validate: false });
  logger.debug(
    `Saved manifest to .worktreerc: ${enabled.length} enabled, ${disabled.length} disabled`
  );
}

/**
 * Check if a legacy .wtlinkrc file exists
 *
 * @param repoRoot - Repository root path
 * @returns True if legacy file exists
 */
export function hasLegacyManifest(repoRoot: string): boolean {
  const legacyPath = path.join(repoRoot, DEFAULT_MANIFEST_FILE);
  return fs.existsSync(legacyPath);
}

/**
 * Get the path to the legacy manifest file
 *
 * @param repoRoot - Repository root path
 * @returns Path to legacy .wtlinkrc file
 */
export function getLegacyManifestPath(repoRoot: string): string {
  return path.join(repoRoot, DEFAULT_MANIFEST_FILE);
}

/**
 * Check if manifest data already exists in .worktreerc config
 *
 * @param repoRoot - Repository root path
 * @returns True if config has wtlink section with entries
 */
export function hasConfigManifest(repoRoot: string): boolean {
  const config = loadConfig(repoRoot, { validate: false, warnOnErrors: false });

  if (config.wtlink) {
    const hasEnabled = (config.wtlink.enabled?.length ?? 0) > 0;
    const hasDisabled = (config.wtlink.disabled?.length ?? 0) > 0;
    return hasEnabled || hasDisabled;
  }

  return false;
}

/**
 * Migrate legacy .wtlinkrc to .worktreerc config
 *
 * @param repoRoot - Repository root path
 * @param options - Migration options
 * @returns Migration result
 */
export function migrateLegacyManifest(
  repoRoot: string,
  options: { deleteLegacy?: boolean; dryRun?: boolean } = {}
): MigrationResult {
  const { deleteLegacy = false, dryRun = false } = options;
  const legacyPath = path.join(repoRoot, DEFAULT_MANIFEST_FILE);

  // Check if legacy file exists
  if (!fs.existsSync(legacyPath)) {
    return {
      migrated: false,
      message: `No legacy ${DEFAULT_MANIFEST_FILE} file found`,
    };
  }

  // Check if config already has manifest data
  if (hasConfigManifest(repoRoot)) {
    return {
      migrated: false,
      message: `Config already has wtlink section. Use 'wtlink manage' to modify it, or manually delete ${DEFAULT_MANIFEST_FILE} if no longer needed.`,
    };
  }

  // Parse legacy file
  let enabled: string[];
  let disabled: string[];
  try {
    const content = fs.readFileSync(legacyPath, 'utf-8');
    const parsed = parseManifest(content);
    enabled = parsed.active;
    disabled = parsed.commented;
  } catch (error) {
    return {
      migrated: false,
      message: `Failed to parse ${DEFAULT_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (dryRun) {
    return {
      migrated: false,
      message: `[DRY RUN] Would migrate ${enabled.length} enabled and ${disabled.length} disabled files to .worktreerc`,
      enabledCount: enabled.length,
      disabledCount: disabled.length,
    };
  }

  // Save to config
  saveManifestData(repoRoot, enabled, disabled);

  // Optionally delete legacy file
  if (deleteLegacy) {
    try {
      fs.unlinkSync(legacyPath);
      return {
        migrated: true,
        message: `Migrated ${enabled.length} enabled and ${disabled.length} disabled files to .worktreerc and deleted ${DEFAULT_MANIFEST_FILE}`,
        enabledCount: enabled.length,
        disabledCount: disabled.length,
      };
    } catch (error) {
      return {
        migrated: true,
        message: `Migrated to .worktreerc but failed to delete ${DEFAULT_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`,
        enabledCount: enabled.length,
        disabledCount: disabled.length,
      };
    }
  }

  return {
    migrated: true,
    message: `Migrated ${enabled.length} enabled and ${disabled.length} disabled files to .worktreerc. Legacy ${DEFAULT_MANIFEST_FILE} preserved (run with --delete-legacy to remove).`,
    enabledCount: enabled.length,
    disabledCount: disabled.length,
  };
}

/**
 * Get list of enabled files only (convenience function for link operations)
 *
 * @param repoRoot - Repository root path
 * @returns Array of enabled file paths
 */
export function getEnabledFiles(repoRoot: string): string[] {
  const { enabled } = loadManifestData(repoRoot);
  return enabled;
}

/**
 * Check if manifest is empty (no enabled or disabled entries)
 *
 * @param repoRoot - Repository root path
 * @returns True if manifest has no entries
 */
export function isManifestEmpty(repoRoot: string): boolean {
  const { enabled, disabled } = loadManifestData(repoRoot);
  return enabled.length === 0 && disabled.length === 0;
}
