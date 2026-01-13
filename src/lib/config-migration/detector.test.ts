/**
 * Tests for Config Migration Detector
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectMigrationIssues, needsMigration } from './detector.js';
import { CURRENT_CONFIG_VERSION } from './types.js';

describe('Config Migration Detector', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-migration-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectMigrationIssues', () => {
    describe('version checking', () => {
      it('detects missing configVersion in empty config', () => {
        fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({}));

        const result = detectMigrationIssues(tempDir);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].type).toBe('missing_version');
        expect(result.issues[0].severity).toBe('warning');
        expect(result.issues[0].autoFixable).toBe(true);
        expect(result.issues[0].fixAction?.type).toBe('set_key');
        expect(result.issues[0].fixAction?.value).toBe(CURRENT_CONFIG_VERSION);
      });

      it('detects missing configVersion in populated config', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({ baseBranch: 'develop', draftPr: true })
        );

        const result = detectMigrationIssues(tempDir);

        const versionIssue = result.issues.find((i) => i.type === 'missing_version');
        expect(versionIssue).toBeDefined();
        expect(versionIssue?.autoFixable).toBe(true);
      });

      it('detects outdated configVersion', () => {
        // This test will only be relevant when CURRENT_CONFIG_VERSION > 1
        // For now, skip if version is 1
        if (CURRENT_CONFIG_VERSION <= 1) {
          return;
        }

        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION - 1 })
        );

        const result = detectMigrationIssues(tempDir);

        const versionIssue = result.issues.find((i) => i.type === 'outdated_version');
        expect(versionIssue).toBeDefined();
        expect(versionIssue?.autoFixable).toBe(true);
      });

      it('detects future configVersion', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION + 1 })
        );

        const result = detectMigrationIssues(tempDir);

        const versionIssue = result.issues.find((i) => i.type === 'future_version');
        expect(versionIssue).toBeDefined();
        expect(versionIssue?.severity).toBe('error');
        expect(versionIssue?.autoFixable).toBe(false);
        expect(versionIssue?.suggestion).toContain('Upgrade');
      });

      it('returns no version issues for up-to-date config', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION, baseBranch: 'main' })
        );

        const result = detectMigrationIssues(tempDir);

        const versionIssues = result.issues.filter(
          (i) =>
            i.type === 'missing_version' ||
            i.type === 'outdated_version' ||
            i.type === 'future_version'
        );
        expect(versionIssues).toHaveLength(0);
      });

      it('handles non-integer configVersion as string', () => {
        fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({ configVersion: '1' }));

        const result = detectMigrationIssues(tempDir);

        const typeIssue = result.issues.find((i) => i.type === 'invalid_value_type');
        expect(typeIssue).toBeDefined();
        expect(typeIssue?.autoFixable).toBe(true);
        expect(typeIssue?.fixAction?.value).toBe(1);
      });
    });

    describe('legacy file detection', () => {
      it('detects legacy .wtlinkrc file existence', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION })
        );
        fs.writeFileSync(path.join(tempDir, '.wtlinkrc'), '.env.local\n.vscode/settings.json');

        const result = detectMigrationIssues(tempDir);

        const legacyIssue = result.issues.find((i) => i.type === 'legacy_wtlinkrc');
        expect(legacyIssue).toBeDefined();
        expect(legacyIssue?.autoFixable).toBe(true);
        expect(result.legacyFilesFound).toHaveLength(1);
        expect(result.legacyFilesFound[0]).toContain('.wtlinkrc');
      });

      it('does not flag legacy if config has wtlink section', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({
            configVersion: CURRENT_CONFIG_VERSION,
            wtlink: { enabled: ['.env.local'], disabled: [] },
          })
        );
        fs.writeFileSync(path.join(tempDir, '.wtlinkrc'), '.env.local');

        const result = detectMigrationIssues(tempDir);

        // Should still detect the legacy file but note the merge scenario
        const legacyIssue = result.issues.find((i) => i.type === 'legacy_wtlinkrc');
        expect(legacyIssue).toBeDefined();
        expect(legacyIssue?.details).toContain('merge');
      });
    });

    describe('unknown key detection', () => {
      it('detects unknown keys', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({
            configVersion: CURRENT_CONFIG_VERSION,
            unknownProperty: 'value',
          })
        );

        const result = detectMigrationIssues(tempDir);

        const unknownIssue = result.issues.find((i) => i.type === 'unknown_key');
        expect(unknownIssue).toBeDefined();
        expect(unknownIssue?.keyPath).toBe('unknownProperty');
        expect(unknownIssue?.severity).toBe('info');
        expect(unknownIssue?.autoFixable).toBe(false);
      });

      it('suggests similar key for typos (Levenshtein)', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({
            configVersion: CURRENT_CONFIG_VERSION,
            baseBranhc: 'main', // Typo: baseBranch
          })
        );

        const result = detectMigrationIssues(tempDir);

        const unknownIssue = result.issues.find((i) => i.keyPath === 'baseBranhc');
        expect(unknownIssue).toBeDefined();
        expect(unknownIssue?.suggestion).toContain('baseBranch');
      });

      it('detects multiple issues simultaneously', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({
            // Missing configVersion
            baseBranch: 'main',
            unknownKey: 'value',
            anotherUnknown: 123,
          })
        );
        fs.writeFileSync(path.join(tempDir, '.wtlinkrc'), '.env');

        const result = detectMigrationIssues(tempDir);

        expect(result.issues.length).toBeGreaterThanOrEqual(3);
        expect(result.issues.some((i) => i.type === 'missing_version')).toBe(true);
        expect(result.issues.some((i) => i.type === 'unknown_key')).toBe(true);
        expect(result.issues.some((i) => i.type === 'legacy_wtlinkrc')).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('handles non-existent config gracefully', () => {
        const result = detectMigrationIssues(tempDir);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].type).toBe('missing_version');
        expect(result.issues[0].severity).toBe('info');
        expect(result.configPath).toBeUndefined();
      });

      it('handles invalid JSON config', () => {
        fs.writeFileSync(path.join(tempDir, '.worktreerc'), '{ invalid json }');

        const result = detectMigrationIssues(tempDir);

        expect(result.parseError).toBeDefined();
        expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
      });

      it('handles JSON with trailing commas via JSON5', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          `{
            "configVersion": 1,
            "baseBranch": "main",
          }`
        );

        const result = detectMigrationIssues(tempDir);

        // Should parse successfully with JSON5
        expect(result.parseError).toBeUndefined();
        expect(result.rawConfig?.configVersion).toBe(1);
      });

      it('returns correct autoFixable counts', () => {
        fs.writeFileSync(
          path.join(tempDir, '.worktreerc'),
          JSON.stringify({ baseBranch: 'main' }) // Missing version - auto-fixable
        );
        fs.writeFileSync(path.join(tempDir, '.wtlinkrc'), '.env'); // Legacy - auto-fixable

        const result = detectMigrationIssues(tempDir);

        expect(result.autoFixableCount).toBeGreaterThanOrEqual(2);
        expect(result.migrationRecommended).toBe(true);
      });
    });
  });

  describe('needsMigration', () => {
    it('returns false when no config file exists', () => {
      const result = needsMigration(tempDir);
      expect(result).toBe(false);
    });

    it('returns true when legacy .wtlinkrc exists', () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION })
      );
      fs.writeFileSync(path.join(tempDir, '.wtlinkrc'), '.env');

      const result = needsMigration(tempDir);
      expect(result).toBe(true);
    });

    it('returns true when configVersion is missing', () => {
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({ baseBranch: 'main' }));

      const result = needsMigration(tempDir);
      expect(result).toBe(true);
    });

    it('returns false when config is up-to-date', () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION, baseBranch: 'main' })
      );

      const result = needsMigration(tempDir);
      expect(result).toBe(false);
    });

    it('returns true when config has parse errors', () => {
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), '{ invalid }');

      const result = needsMigration(tempDir);
      expect(result).toBe(true);
    });
  });
});
