/**
 * Config Migration Detector
 *
 * Scans configuration files and detects migration issues including:
 * - Missing or outdated configVersion
 * - Legacy .wtlinkrc files
 * - Unknown or deprecated configuration keys
 */

import fs from 'fs';
import path from 'path';
import JSON5 from 'json5';
import { findRepoConfigFile, loadConfigFile } from '../global-config.js';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';
import { logger } from '../logger.js';
import {
  CURRENT_CONFIG_VERSION,
  MINIMUM_SUPPORTED_VERSION,
  KNOWN_CONFIG_KEYS,
  DEPRECATED_KEYS,
  type DetectionResult,
  type MigrationIssue,
  type MigrationAction,
} from './types.js';

/**
 * Calculate Levenshtein distance between two strings
 * Used for suggesting similar keys when unknown keys are found
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Find the closest matching known key for an unknown key
 * Returns the suggestion only if distance is <= threshold
 */
function findSimilarKey(unknownKey: string, threshold: number = 2): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const knownKey of KNOWN_CONFIG_KEYS) {
    const distance = levenshteinDistance(unknownKey.toLowerCase(), knownKey.toLowerCase());
    if (distance < bestDistance && distance <= threshold) {
      bestDistance = distance;
      bestMatch = knownKey;
    }
  }

  return bestMatch;
}

/**
 * Check if a legacy .wtlinkrc file exists
 */
function hasLegacyWtlinkrc(repoRoot: string): boolean {
  const legacyPath = path.join(repoRoot, DEFAULT_MANIFEST_FILE);
  return fs.existsSync(legacyPath);
}

/**
 * Get the path to the legacy .wtlinkrc file
 */
function getLegacyWtlinkrcPath(repoRoot: string): string {
  return path.join(repoRoot, DEFAULT_MANIFEST_FILE);
}

/**
 * Parse a config file, trying JSON first then JSON5 for better error handling
 */
function parseConfigFile(
  configPath: string
): { config: Record<string, unknown>; error?: string } | { config: null; error: string } {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');

    // Try standard JSON first
    try {
      return { config: JSON.parse(content) as Record<string, unknown> };
    } catch {
      // Fall back to JSON5 for better error messages and trailing comma support
      try {
        return { config: JSON5.parse(content) as Record<string, unknown> };
      } catch (json5Error) {
        const errorMessage = json5Error instanceof Error ? json5Error.message : String(json5Error);
        return { config: null, error: `Invalid JSON: ${errorMessage}` };
      }
    }
  } catch (readError) {
    const errorMessage = readError instanceof Error ? readError.message : String(readError);
    return { config: null, error: `Failed to read file: ${errorMessage}` };
  }
}

/**
 * Detect all migration issues in a repository
 *
 * @param repoRoot - Repository root path (main worktree)
 * @returns DetectionResult with all identified issues
 */
export function detectMigrationIssues(repoRoot: string): DetectionResult {
  const issues: MigrationIssue[] = [];
  const legacyFilesFound: string[] = [];
  let currentVersion: number | undefined;
  let rawConfig: Record<string, unknown> | undefined;
  let parseError: string | undefined;
  let configPath: string | undefined;

  // Find and parse the config file
  const foundConfigPath = findRepoConfigFile(repoRoot);

  if (foundConfigPath) {
    configPath = foundConfigPath;
    const parseResult = parseConfigFile(configPath);

    if (parseResult.config === null) {
      // Config file exists but couldn't be parsed
      parseError = parseResult.error;
      issues.push({
        type: 'invalid_value_type',
        severity: 'error',
        message: 'Configuration file has invalid JSON syntax',
        details: parseResult.error,
        autoFixable: false,
        suggestion: 'Fix the JSON syntax errors in your .worktreerc file manually',
      });
    } else {
      rawConfig = parseResult.config;

      // Check configVersion
      if (rawConfig.configVersion === undefined) {
        // Missing version
        issues.push({
          type: 'missing_version',
          severity: 'warning',
          message: 'Configuration file is missing configVersion field',
          keyPath: 'configVersion',
          suggestedValue: CURRENT_CONFIG_VERSION,
          autoFixable: true,
          suggestion: `Add "configVersion": ${CURRENT_CONFIG_VERSION} to your config`,
          fixAction: {
            type: 'set_key',
            keyPath: 'configVersion',
            value: CURRENT_CONFIG_VERSION,
            description: `Set configVersion to ${CURRENT_CONFIG_VERSION}`,
          },
        });
      } else if (typeof rawConfig.configVersion !== 'number') {
        // Invalid type
        const coerced = parseInt(String(rawConfig.configVersion), 10);
        if (!isNaN(coerced) && coerced >= MINIMUM_SUPPORTED_VERSION) {
          currentVersion = coerced;
          issues.push({
            type: 'invalid_value_type',
            severity: 'warning',
            message: `configVersion should be a number, found ${typeof rawConfig.configVersion}`,
            keyPath: 'configVersion',
            currentValue: rawConfig.configVersion,
            suggestedValue: coerced,
            autoFixable: true,
            fixAction: {
              type: 'set_key',
              keyPath: 'configVersion',
              value: coerced,
              description: `Convert configVersion to number: ${coerced}`,
            },
          });
        } else {
          issues.push({
            type: 'invalid_value_type',
            severity: 'error',
            message: `configVersion must be a positive integer, found: ${rawConfig.configVersion}`,
            keyPath: 'configVersion',
            currentValue: rawConfig.configVersion,
            autoFixable: false,
          });
        }
      } else {
        currentVersion = rawConfig.configVersion;

        // Check version bounds
        if (currentVersion < MINIMUM_SUPPORTED_VERSION) {
          issues.push({
            type: 'outdated_version',
            severity: 'error',
            message: `Config version ${currentVersion} is too old (minimum: ${MINIMUM_SUPPORTED_VERSION})`,
            keyPath: 'configVersion',
            currentValue: currentVersion,
            suggestedValue: CURRENT_CONFIG_VERSION,
            autoFixable: false,
            suggestion: `Backup your config and create a fresh one with version ${CURRENT_CONFIG_VERSION}`,
          });
        } else if (currentVersion < CURRENT_CONFIG_VERSION) {
          issues.push({
            type: 'outdated_version',
            severity: 'warning',
            message: `Config version ${currentVersion} can be upgraded to ${CURRENT_CONFIG_VERSION}`,
            keyPath: 'configVersion',
            currentValue: currentVersion,
            suggestedValue: CURRENT_CONFIG_VERSION,
            autoFixable: true,
            fixAction: {
              type: 'set_key',
              keyPath: 'configVersion',
              value: CURRENT_CONFIG_VERSION,
              description: `Upgrade configVersion from ${currentVersion} to ${CURRENT_CONFIG_VERSION}`,
            },
          });
        } else if (currentVersion > CURRENT_CONFIG_VERSION) {
          issues.push({
            type: 'future_version',
            severity: 'error',
            message: `Config version ${currentVersion} is newer than this tool supports (${CURRENT_CONFIG_VERSION})`,
            keyPath: 'configVersion',
            currentValue: currentVersion,
            autoFixable: false,
            suggestion:
              'Upgrade git-worktree-tools: npm install -g @camaradesuk/git-worktree-tools@latest',
          });
        }
      }

      // Check for unknown keys
      for (const key of Object.keys(rawConfig)) {
        if (!KNOWN_CONFIG_KEYS.has(key)) {
          // Check if it's a deprecated key
          if (key in DEPRECATED_KEYS) {
            const deprecation = DEPRECATED_KEYS[key];
            const fixAction: MigrationAction | undefined = deprecation.replacement
              ? {
                  type: 'rename_key',
                  oldKey: key,
                  newKey: deprecation.replacement,
                  value: deprecation.transform
                    ? deprecation.transform(rawConfig[key])
                    : rawConfig[key],
                  description: `Rename ${key} to ${deprecation.replacement}`,
                }
              : {
                  type: 'remove_key',
                  keyPath: key,
                  description: `Remove deprecated key: ${key}`,
                };

            issues.push({
              type: 'deprecated_key',
              severity: 'warning',
              message: deprecation.message,
              keyPath: key,
              currentValue: rawConfig[key],
              autoFixable: !!deprecation.replacement,
              suggestion: deprecation.replacement
                ? `Rename to "${deprecation.replacement}"`
                : 'Remove this key from your config',
              fixAction,
            });
          } else {
            // Unknown key - check for typos
            const similarKey = findSimilarKey(key);
            issues.push({
              type: 'unknown_key',
              severity: 'info',
              message: `Unknown configuration key: "${key}"`,
              keyPath: key,
              currentValue: rawConfig[key],
              autoFixable: false,
              suggestion: similarKey
                ? `Did you mean "${similarKey}"?`
                : 'This key will be ignored. Remove it if unintended.',
            });
          }
        }
      }
    }
  } else {
    // No config file found
    issues.push({
      type: 'missing_version',
      severity: 'info',
      message: 'No .worktreerc configuration file found',
      autoFixable: true,
      suggestion: "Run 'wtconfig init' to create a configuration file",
      fixAction: {
        type: 'set_key',
        keyPath: 'configVersion',
        value: CURRENT_CONFIG_VERSION,
        description: 'Create new config file with configVersion',
      },
    });
  }

  // Check for legacy .wtlinkrc file
  if (hasLegacyWtlinkrc(repoRoot)) {
    const legacyPath = getLegacyWtlinkrcPath(repoRoot);
    legacyFilesFound.push(legacyPath);

    // Check if config already has wtlink section
    const hasWtlinkInConfig =
      rawConfig?.wtlink &&
      ((rawConfig.wtlink as Record<string, unknown>).enabled ||
        (rawConfig.wtlink as Record<string, unknown>).disabled);

    issues.push({
      type: 'legacy_wtlinkrc',
      severity: 'warning',
      message: `Legacy ${DEFAULT_MANIFEST_FILE} file found`,
      details: hasWtlinkInConfig
        ? 'Both .wtlinkrc and .worktreerc wtlink section exist. Migration will merge entries.'
        : 'This file should be migrated to the wtlink section in .worktreerc',
      autoFixable: true,
      suggestion: `Run 'wtconfig migrate' to merge ${DEFAULT_MANIFEST_FILE} into .worktreerc`,
      fixAction: {
        type: 'merge_legacy_file',
        filePath: legacyPath,
        description: `Merge ${DEFAULT_MANIFEST_FILE} entries into .worktreerc wtlink section`,
      },
    });
  }

  // Calculate counts
  const autoFixableCount = issues.filter((i) => i.autoFixable).length;
  const manualFixCount = issues.filter((i) => !i.autoFixable).length;

  // Determine if migration is recommended
  const migrationRecommended =
    autoFixableCount > 0 ||
    issues.some((i) => i.severity === 'error' || i.type === 'legacy_wtlinkrc');

  logger.debug(
    `Detected ${issues.length} migration issues (${autoFixableCount} auto-fixable, ${manualFixCount} manual)`
  );

  return {
    issues,
    autoFixableCount,
    manualFixCount,
    migrationRecommended,
    currentVersion,
    targetVersion: CURRENT_CONFIG_VERSION,
    configPath,
    legacyFilesFound,
    rawConfig,
    parseError,
  };
}

/**
 * Quick check if any migration is needed
 * Useful for startup banners without full detection overhead
 *
 * @param repoRoot - Repository root path
 * @returns True if migration is recommended
 */
export function needsMigration(repoRoot: string): boolean {
  // Quick checks without full detection
  const configPath = findRepoConfigFile(repoRoot);

  if (!configPath) {
    // No config file - not urgent, don't show banner
    return false;
  }

  // Check for legacy .wtlinkrc
  if (hasLegacyWtlinkrc(repoRoot)) {
    return true;
  }

  // Check config version
  const config = loadConfigFile(configPath);

  // If config file exists but couldn't be parsed, needs migration
  if (config === null) {
    return true; // Parse error - needs attention
  }

  if (typeof config === 'object') {
    const version = (config as Record<string, unknown>).configVersion;
    if (version === undefined) {
      return true; // Missing version
    }
    if (typeof version === 'number' && version < CURRENT_CONFIG_VERSION) {
      return true; // Outdated version
    }
  }

  return false;
}
