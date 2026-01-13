/**
 * Tests for Config Migration Runner
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  runMigration,
  createConfigBackup,
  restoreFromBackup,
  mergeWtlinkConfigs,
} from './runner.js';
import { detectMigrationIssues } from './detector.js';
import { BACKUP_DIRECTORY, CURRENT_CONFIG_VERSION } from './types.js';

describe('Config Migration Runner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-migration-runner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('mergeWtlinkConfigs', () => {
    it('merges empty existing with legacy entries', () => {
      const result = mergeWtlinkConfigs(undefined, {
        enabled: ['.env.local', '.vscode/settings.json'],
        disabled: ['.env.test'],
      });

      expect(result.enabled).toEqual(['.env.local', '.vscode/settings.json']);
      expect(result.disabled).toEqual(['.env.test']);
      expect(result.conflicts).toHaveLength(0);
    });

    it('merges existing enabled with legacy entries', () => {
      const result = mergeWtlinkConfigs(
        { enabled: ['.env.local'], disabled: [] },
        { enabled: ['.vscode/settings.json'], disabled: ['.env.test'] }
      );

      expect(result.enabled).toContain('.env.local');
      expect(result.enabled).toContain('.vscode/settings.json');
      expect(result.disabled).toContain('.env.test');
    });

    it('resolves conflicts with enabled winning', () => {
      const result = mergeWtlinkConfigs(
        { enabled: [], disabled: ['.env.local'] },
        { enabled: ['.env.local'], disabled: [] }
      );

      expect(result.enabled).toContain('.env.local');
      expect(result.disabled).not.toContain('.env.local');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toContain('.env.local');
    });

    it('normalizes paths with backslashes', () => {
      const result = mergeWtlinkConfigs(
        { enabled: ['.vscode\\settings.json'], disabled: [] },
        { enabled: [], disabled: [] }
      );

      expect(result.enabled).toContain('.vscode/settings.json');
    });

    it('removes leading ./ from paths', () => {
      const result = mergeWtlinkConfigs(
        { enabled: ['./.env.local'], disabled: [] },
        { enabled: [], disabled: [] }
      );

      expect(result.enabled).toContain('.env.local');
    });

    it('deduplicates entries', () => {
      const result = mergeWtlinkConfigs(
        { enabled: ['.env.local'], disabled: [] },
        { enabled: ['.env.local'], disabled: [] }
      );

      expect(result.enabled.filter((e) => e === '.env.local')).toHaveLength(1);
    });
  });

  describe('createConfigBackup', () => {
    it('creates backup in .worktree-backups directory', () => {
      const configPath = path.join(tempDir, '.worktreerc');
      fs.writeFileSync(configPath, JSON.stringify({ baseBranch: 'main' }));

      const backupPath = createConfigBackup(configPath, tempDir);

      expect(backupPath).toContain(BACKUP_DIRECTORY);
      expect(fs.existsSync(backupPath)).toBe(true);

      const backupContent = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      expect(backupContent.baseBranch).toBe('main');
    });

    it('creates backup directory if it does not exist', () => {
      const configPath = path.join(tempDir, '.worktreerc');
      fs.writeFileSync(configPath, '{}');

      const backupDir = path.join(tempDir, BACKUP_DIRECTORY);
      expect(fs.existsSync(backupDir)).toBe(false);

      createConfigBackup(configPath, tempDir);

      expect(fs.existsSync(backupDir)).toBe(true);
    });

    it('creates unique backup filenames with timestamps', () => {
      const configPath = path.join(tempDir, '.worktreerc');
      fs.writeFileSync(configPath, '{}');

      const backup1 = createConfigBackup(configPath, tempDir);

      // Small delay to ensure different timestamp
      const backup2 = createConfigBackup(configPath, tempDir);

      expect(backup1).not.toBe(backup2);
    });
  });

  describe('restoreFromBackup', () => {
    it('restores config from backup', () => {
      const configPath = path.join(tempDir, '.worktreerc');
      const backupDir = path.join(tempDir, BACKUP_DIRECTORY);
      fs.mkdirSync(backupDir);

      const backupPath = path.join(backupDir, '.worktreerc.backup.123');
      fs.writeFileSync(backupPath, JSON.stringify({ baseBranch: 'develop' }));

      // Write different content to config
      fs.writeFileSync(configPath, JSON.stringify({ baseBranch: 'main' }));

      restoreFromBackup(backupPath, configPath);

      const restoredContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(restoredContent.baseBranch).toBe('develop');
    });

    it('throws error if backup file does not exist', () => {
      const backupPath = path.join(tempDir, 'nonexistent.backup');
      const configPath = path.join(tempDir, '.worktreerc');

      expect(() => restoreFromBackup(backupPath, configPath)).toThrow('Backup file not found');
    });
  });

  describe('runMigration', () => {
    it('sets configVersion when missing', async () => {
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({ baseBranch: 'main' }));

      const detection = detectMigrationIssues(tempDir);
      const result = await runMigration(tempDir, detection);

      expect(result.success).toBe(true);
      expect(result.actionsExecuted.length).toBeGreaterThan(0);

      const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.worktreerc'), 'utf-8'));
      expect(config.configVersion).toBe(CURRENT_CONFIG_VERSION);
    });

    it('creates backup before migration', async () => {
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({ baseBranch: 'main' }));

      const detection = detectMigrationIssues(tempDir);
      const result = await runMigration(tempDir, detection);

      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);
    });

    it('merges legacy .wtlinkrc enabled entries', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION })
      );
      fs.writeFileSync(
        path.join(tempDir, '.wtlinkrc'),
        '.env.local\n.vscode/settings.json\n# .env.test'
      );

      const detection = detectMigrationIssues(tempDir);
      const result = await runMigration(tempDir, detection);

      expect(result.success).toBe(true);

      const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.worktreerc'), 'utf-8'));
      expect(config.wtlink.enabled).toContain('.env.local');
      expect(config.wtlink.enabled).toContain('.vscode/settings.json');
    });

    it('merges legacy .wtlinkrc disabled entries', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION })
      );
      fs.writeFileSync(path.join(tempDir, '.wtlinkrc'), '# .env.test\n# .env.staging');

      const detection = detectMigrationIssues(tempDir);
      const result = await runMigration(tempDir, detection);

      expect(result.success).toBe(true);

      const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.worktreerc'), 'utf-8'));
      expect(config.wtlink.disabled).toContain('.env.test');
      expect(config.wtlink.disabled).toContain('.env.staging');
    });

    it('handles merge conflicts with enabled winning', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({
          configVersion: CURRENT_CONFIG_VERSION,
          wtlink: { enabled: [], disabled: ['.env.local'] },
        })
      );
      fs.writeFileSync(path.join(tempDir, '.wtlinkrc'), '.env.local');

      const detection = detectMigrationIssues(tempDir);
      const result = await runMigration(tempDir, detection);

      expect(result.success).toBe(true);

      const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.worktreerc'), 'utf-8'));
      expect(config.wtlink.enabled).toContain('.env.local');
      expect(config.wtlink.disabled).not.toContain('.env.local');
    });

    it('deletes legacy file with deleteLegacyFiles option', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION })
      );
      const legacyPath = path.join(tempDir, '.wtlinkrc');
      fs.writeFileSync(legacyPath, '.env.local');

      const detection = detectMigrationIssues(tempDir);
      await runMigration(tempDir, detection, { deleteLegacyFiles: true });

      expect(fs.existsSync(legacyPath)).toBe(false);
    });

    it('preserves legacy file without deleteLegacyFiles flag', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION })
      );
      const legacyPath = path.join(tempDir, '.wtlinkrc');
      fs.writeFileSync(legacyPath, '.env.local');

      const detection = detectMigrationIssues(tempDir);
      await runMigration(tempDir, detection, { deleteLegacyFiles: false });

      expect(fs.existsSync(legacyPath)).toBe(true);
    });

    it('dry-run makes no changes', async () => {
      const configPath = path.join(tempDir, '.worktreerc');
      const originalContent = JSON.stringify({ baseBranch: 'main' });
      fs.writeFileSync(configPath, originalContent);

      const detection = detectMigrationIssues(tempDir);
      const result = await runMigration(tempDir, detection, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.actionsExecuted).toHaveLength(0);
      expect(result.actionsSkipped.length).toBeGreaterThan(0);

      // Verify file unchanged
      const currentContent = fs.readFileSync(configPath, 'utf-8');
      expect(currentContent).toBe(originalContent);

      // Verify no backup created
      const backupDir = path.join(tempDir, BACKUP_DIRECTORY);
      expect(fs.existsSync(backupDir)).toBe(false);
    });

    it('adds $schema to migrated config', async () => {
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({ baseBranch: 'main' }));

      const detection = detectMigrationIssues(tempDir);
      await runMigration(tempDir, detection);

      const config = JSON.parse(fs.readFileSync(path.join(tempDir, '.worktreerc'), 'utf-8'));
      expect(config.$schema).toBeDefined();
      expect(config.$schema).toContain('worktreerc.schema.json');
    });

    it('returns success with no actions when nothing to migrate', async () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION, baseBranch: 'main' })
      );

      const detection = detectMigrationIssues(tempDir);
      const result = await runMigration(tempDir, detection);

      expect(result.success).toBe(true);
      expect(result.actionsExecuted).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('handles permission errors gracefully', async () => {
      // Skip this test on Windows where permission handling is different
      if (process.platform === 'win32') {
        return;
      }

      const configPath = path.join(tempDir, '.worktreerc');
      fs.writeFileSync(configPath, JSON.stringify({ baseBranch: 'main' }));

      // Make the directory read-only
      fs.chmodSync(tempDir, 0o444);

      try {
        const detection = detectMigrationIssues(tempDir);
        const result = await runMigration(tempDir, detection);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(tempDir, 0o755);
      }
    });
  });
});
