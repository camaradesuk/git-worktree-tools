/**
 * Tests for Config Migration Reporter
 */

import { describe, it, expect } from 'vitest';
import {
  formatMigrationReport,
  formatMigrationReportJSON,
  formatMigrationResultReport,
  formatMigrationResultJSON,
  formatDryRunPreview,
} from './reporter.js';
import type { DetectionResult, MigrationResult, MigrationIssue } from './types.js';
import { CURRENT_CONFIG_VERSION } from './types.js';

describe('Config Migration Reporter', () => {
  describe('formatMigrationReport', () => {
    it('formats issues grouped by severity', () => {
      const detection: DetectionResult = {
        issues: [
          {
            type: 'future_version',
            severity: 'error',
            message: 'Config version is too new',
            autoFixable: false,
          },
          {
            type: 'missing_version',
            severity: 'warning',
            message: 'Missing configVersion',
            autoFixable: true,
            fixAction: {
              type: 'set_key',
              keyPath: 'configVersion',
              value: 1,
              description: 'Set configVersion to 1',
            },
          },
          {
            type: 'unknown_key',
            severity: 'info',
            message: 'Unknown key: foo',
            autoFixable: false,
          },
        ],
        autoFixableCount: 1,
        manualFixCount: 2,
        migrationRecommended: true,
        targetVersion: CURRENT_CONFIG_VERSION,
        legacyFilesFound: [],
      };

      const output = formatMigrationReport(detection);

      expect(output).toContain('Config Migration Report');
      expect(output).toContain('Errors:');
      expect(output).toContain('Warnings:');
      expect(output).toContain('Info:');
      expect(output).toContain('1 auto-fixable');
      expect(output).toContain('2 manual');
    });

    it('includes auto-fix indicators', () => {
      const detection: DetectionResult = {
        issues: [
          {
            type: 'missing_version',
            severity: 'warning',
            message: 'Missing configVersion',
            autoFixable: true,
            fixAction: {
              type: 'set_key',
              keyPath: 'configVersion',
              value: 1,
              description: 'Set configVersion',
            },
          },
        ],
        autoFixableCount: 1,
        manualFixCount: 0,
        migrationRecommended: true,
        targetVersion: CURRENT_CONFIG_VERSION,
        legacyFilesFound: [],
      };

      const output = formatMigrationReport(detection);

      expect(output).toContain('[auto-fix available]');
    });

    it('shows success message for empty issues', () => {
      const detection: DetectionResult = {
        issues: [],
        autoFixableCount: 0,
        manualFixCount: 0,
        migrationRecommended: false,
        targetVersion: CURRENT_CONFIG_VERSION,
        legacyFilesFound: [],
      };

      const output = formatMigrationReport(detection);

      expect(output).toContain('No migration issues found');
      expect(output).toContain('up to date');
    });

    it('includes suggestions when present', () => {
      const detection: DetectionResult = {
        issues: [
          {
            type: 'unknown_key',
            severity: 'info',
            message: 'Unknown key: baseBranhc',
            keyPath: 'baseBranhc',
            suggestion: 'Did you mean "baseBranch"?',
            autoFixable: false,
          },
        ],
        autoFixableCount: 0,
        manualFixCount: 1,
        migrationRecommended: false,
        targetVersion: CURRENT_CONFIG_VERSION,
        legacyFilesFound: [],
      };

      const output = formatMigrationReport(detection);

      expect(output).toContain('Did you mean "baseBranch"?');
    });
  });

  describe('formatMigrationReportJSON', () => {
    it('returns JSON-serializable object matching schema', () => {
      const detection: DetectionResult = {
        issues: [
          {
            type: 'missing_version',
            severity: 'warning',
            message: 'Missing configVersion',
            keyPath: 'configVersion',
            suggestedValue: 1,
            autoFixable: true,
            fixAction: {
              type: 'set_key',
              keyPath: 'configVersion',
              value: 1,
              description: 'Set configVersion to 1',
            },
          },
        ],
        autoFixableCount: 1,
        manualFixCount: 0,
        migrationRecommended: true,
        currentVersion: undefined,
        targetVersion: CURRENT_CONFIG_VERSION,
        configPath: '/path/to/.worktreerc',
        legacyFilesFound: ['/path/to/.wtlinkrc'],
      };

      const json = formatMigrationReportJSON(detection);

      expect(json).toHaveProperty('summary');
      expect(json).toHaveProperty('issues');
      expect(json).toHaveProperty('configPath');
      expect(json).toHaveProperty('legacyFilesFound');

      const summary = (json as { summary: Record<string, unknown> }).summary;
      expect(summary.totalIssues).toBe(1);
      expect(summary.autoFixableCount).toBe(1);
      expect(summary.migrationRecommended).toBe(true);
      expect(summary.targetVersion).toBe(CURRENT_CONFIG_VERSION);

      const issues = (json as { issues: unknown[] }).issues;
      expect(issues).toHaveLength(1);
      expect(issues[0]).toHaveProperty('type', 'missing_version');
      expect(issues[0]).toHaveProperty('fixAction');
    });

    it('serializes to valid JSON', () => {
      const detection: DetectionResult = {
        issues: [],
        autoFixableCount: 0,
        manualFixCount: 0,
        migrationRecommended: false,
        targetVersion: CURRENT_CONFIG_VERSION,
        legacyFilesFound: [],
      };

      const json = formatMigrationReportJSON(detection);
      const serialized = JSON.stringify(json);
      const parsed = JSON.parse(serialized);

      expect(parsed).toEqual(json);
    });
  });

  describe('formatMigrationResultReport', () => {
    it('formats successful migration with actions', () => {
      const result: MigrationResult = {
        success: true,
        actionsExecuted: [
          {
            type: 'set_key',
            keyPath: 'configVersion',
            value: 1,
            description: 'Set configVersion to 1',
          },
          { type: 'merge_legacy_file', filePath: '.wtlinkrc', description: 'Merged .wtlinkrc' },
        ],
        actionsSkipped: [],
        errors: [],
        backupPath: '/path/to/.worktree-backups/.worktreerc.backup.123',
        newConfigPath: '/path/to/.worktreerc',
      };

      const output = formatMigrationResultReport(result);

      expect(output).toContain('Migration complete');
      expect(output).toContain('2 action(s) applied');
      expect(output).toContain('Set configVersion to 1');
      expect(output).toContain('Merged .wtlinkrc');
      expect(output).toContain('Backup saved to');
    });

    it('formats successful migration with no changes', () => {
      const result: MigrationResult = {
        success: true,
        actionsExecuted: [],
        actionsSkipped: [],
        errors: [],
      };

      const output = formatMigrationResultReport(result);

      expect(output).toContain('already up to date');
      expect(output).toContain('No changes needed');
    });

    it('formats failed migration with errors', () => {
      const result: MigrationResult = {
        success: false,
        actionsExecuted: [
          { type: 'set_key', keyPath: 'configVersion', value: 1, description: 'Set configVersion' },
        ],
        actionsSkipped: [
          { type: 'merge_legacy_file', filePath: '.wtlinkrc', description: 'Merge .wtlinkrc' },
        ],
        errors: ['Failed to write config: Permission denied'],
        backupPath: '/path/to/backup',
      };

      const output = formatMigrationResultReport(result);

      expect(output).toContain('Migration failed');
      expect(output).toContain('Permission denied');
      expect(output).toContain('Backup available');
      expect(output).toContain('Actions completed before failure');
      expect(output).toContain('Actions skipped');
    });
  });

  describe('formatMigrationResultJSON', () => {
    it('returns JSON-serializable object', () => {
      const result: MigrationResult = {
        success: true,
        actionsExecuted: [
          { type: 'set_key', keyPath: 'configVersion', value: 1, description: 'Set configVersion' },
        ],
        actionsSkipped: [],
        errors: [],
        backupPath: '/path/to/backup',
        newConfigPath: '/path/to/.worktreerc',
      };

      const json = formatMigrationResultJSON(result);

      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('backupPath');
      expect(json).toHaveProperty('actionsExecuted');
      expect((json as { actionsExecuted: unknown[] }).actionsExecuted).toHaveLength(1);
    });
  });

  describe('formatDryRunPreview', () => {
    it('lists actions that would be taken', () => {
      const detection: DetectionResult = {
        issues: [
          {
            type: 'missing_version',
            severity: 'warning',
            message: 'Missing configVersion',
            autoFixable: true,
            fixAction: {
              type: 'set_key',
              keyPath: 'configVersion',
              value: 1,
              description: 'Set configVersion to 1',
            },
          },
          {
            type: 'legacy_wtlinkrc',
            severity: 'warning',
            message: 'Legacy file found',
            autoFixable: true,
            fixAction: {
              type: 'merge_legacy_file',
              filePath: '.wtlinkrc',
              description: 'Merge .wtlinkrc into config',
            },
          },
        ],
        autoFixableCount: 2,
        manualFixCount: 0,
        migrationRecommended: true,
        targetVersion: CURRENT_CONFIG_VERSION,
        legacyFilesFound: [],
      };

      const output = formatDryRunPreview(detection);

      expect(output).toContain('[DRY RUN]');
      expect(output).toContain('Preview');
      expect(output).toContain('Set configVersion to 1');
      expect(output).toContain('Merge .wtlinkrc into config');
      expect(output).toContain('No files were modified');
    });

    it('shows message when no auto-fixable changes', () => {
      const detection: DetectionResult = {
        issues: [
          {
            type: 'unknown_key',
            severity: 'info',
            message: 'Unknown key',
            autoFixable: false,
          },
        ],
        autoFixableCount: 0,
        manualFixCount: 1,
        migrationRecommended: false,
        targetVersion: CURRENT_CONFIG_VERSION,
        legacyFilesFound: [],
      };

      const output = formatDryRunPreview(detection);

      expect(output).toContain('No auto-fixable changes to make');
    });
  });
});
