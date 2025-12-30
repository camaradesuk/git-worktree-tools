import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  findDuplicates,
  countActiveEntries,
  getActiveEntries,
  findMissingFiles,
  validateManifestContent,
} from './validate-manifest.js';

describe('wtlink/validate-manifest', () => {
  describe('findDuplicates', () => {
    it('should detect duplicate entries', () => {
      const manifest = `.env
.vscode/settings.json
.env
config/local.json`;

      const duplicates = findDuplicates(manifest);
      expect(duplicates).toEqual(['.env']);
    });

    it('should not report unique entries as duplicates', () => {
      const manifest = `.env
.vscode/settings.json
config/local.json`;

      const duplicates = findDuplicates(manifest);
      expect(duplicates).toEqual([]);
    });

    it('should skip commented entries when checking duplicates', () => {
      const manifest = `.env
# .env
.vscode/settings.json`;

      // Active .env and commented .env should not be duplicates
      const duplicates = findDuplicates(manifest);
      expect(duplicates).toEqual([]);
    });

    it('should detect multiple duplicates', () => {
      const manifest = `.env
.env
.vscode/settings.json
.vscode/settings.json
.env`;

      const duplicates = findDuplicates(manifest);
      expect(duplicates).toEqual(['.env', '.vscode/settings.json', '.env']);
    });

    it('should handle empty manifest', () => {
      const duplicates = findDuplicates('');
      expect(duplicates).toEqual([]);
    });
  });

  describe('countActiveEntries', () => {
    it('should count only active entries', () => {
      const manifest = `.env
.vscode/settings.json
# .vscode/launch.json
# config/local.json`;

      const count = countActiveEntries(manifest);
      expect(count).toBe(2);
    });

    it('should handle empty manifest', () => {
      const count = countActiveEntries('');
      expect(count).toBe(0);
    });

    it('should handle manifest with only comments', () => {
      const manifest = `# .env
# .vscode/settings.json
## This is a header`;

      const count = countActiveEntries(manifest);
      expect(count).toBe(0);
    });

    it('should skip blank lines', () => {
      const manifest = `.env

.vscode/settings.json

`;

      const count = countActiveEntries(manifest);
      expect(count).toBe(2);
    });
  });

  describe('getActiveEntries', () => {
    it('should return only active entries', () => {
      const manifest = `.env
# comment
.vscode/settings.json

## header
config/local.json`;

      const entries = getActiveEntries(manifest);
      expect(entries).toEqual(['.env', '.vscode/settings.json', 'config/local.json']);
    });

    it('should return empty array for empty manifest', () => {
      const entries = getActiveEntries('');
      expect(entries).toEqual([]);
    });

    it('should return empty array for comments-only manifest', () => {
      const entries = getActiveEntries('# comment\n## header');
      expect(entries).toEqual([]);
    });
  });

  describe('findMissingFiles', () => {
    it('should find missing files', () => {
      const entries = ['.env', '.vscode/settings.json'];
      const sourceDir = '/home/user/project';

      // Build a Set of absolute paths that "exist" using path.join for cross-platform compatibility
      const existingFiles = new Set([path.join(sourceDir, '.env')]);
      const fileExists = (p: string) => existingFiles.has(p);
      const missing = findMissingFiles(entries, sourceDir, fileExists);

      expect(missing).toEqual(['.vscode/settings.json']);
    });

    it('should return empty array when all entries exist', () => {
      const entries = ['.env', '.vscode/settings.json'];
      const sourceDir = '/home/user/project';

      // Build a Set of absolute paths that "exist" using path.join for cross-platform compatibility
      const existingFiles = new Set([
        path.join(sourceDir, '.env'),
        path.join(sourceDir, '.vscode/settings.json'),
      ]);
      const fileExists = (p: string) => existingFiles.has(p);
      const missing = findMissingFiles(entries, sourceDir, fileExists);

      expect(missing).toEqual([]);
    });

    it('should return all entries when none exist', () => {
      const entries = ['.env', '.vscode/settings.json'];
      const sourceDir = '/home/user/project';

      const fileExists = () => false;
      const missing = findMissingFiles(entries, sourceDir, fileExists);

      expect(missing).toEqual(['.env', '.vscode/settings.json']);
    });

    it('should handle empty entries array', () => {
      const missing = findMissingFiles([], '/home/user/project', () => false);
      expect(missing).toEqual([]);
    });
  });

  describe('validateManifestContent', () => {
    it('should detect duplicates', () => {
      const manifest = `.env
.env`;
      const sourceDir = '/home/user/project';
      const fileExists = () => true;
      const isGitIgnored = () => true;

      const result = validateManifestContent(manifest, sourceDir, fileExists, isGitIgnored);

      expect(result.duplicates).toEqual(['.env']);
      expect(result.problems).toContainEqual(expect.stringContaining('Duplicate'));
    });

    it('should detect missing files', () => {
      const manifest = `.env
.vscode/settings.json`;
      const sourceDir = '/home/user/project';
      // Use path.join for cross-platform compatibility
      const existingFiles = new Set([path.join(sourceDir, '.env')]);
      const fileExists = (p: string) => existingFiles.has(p);
      const isGitIgnored = () => true;

      const result = validateManifestContent(manifest, sourceDir, fileExists, isGitIgnored);

      expect(result.missingFiles).toEqual(['.vscode/settings.json']);
      expect(result.problems).toContainEqual(expect.stringContaining('Missing'));
    });

    it('should detect files not ignored by git', () => {
      const manifest = `.env
.vscode/settings.json`;
      const sourceDir = '/home/user/project';
      const fileExists = () => true;
      // Use path.join for cross-platform compatibility
      const ignoredFiles = new Set([path.join(sourceDir, '.env')]);
      const isGitIgnored = (p: string) => ignoredFiles.has(p);

      const result = validateManifestContent(manifest, sourceDir, fileExists, isGitIgnored);

      expect(result.notIgnored).toEqual(['.vscode/settings.json']);
      expect(result.problems).toContainEqual(expect.stringContaining('not ignored'));
    });

    it('should return valid result for correct manifest', () => {
      const manifest = `.env
.vscode/settings.json`;
      const sourceDir = '/home/user/project';
      const fileExists = () => true;
      const isGitIgnored = () => true;

      const result = validateManifestContent(manifest, sourceDir, fileExists, isGitIgnored);

      expect(result.problems).toEqual([]);
      expect(result.checkedCount).toBe(2);
      expect(result.duplicates).toEqual([]);
      expect(result.missingFiles).toEqual([]);
      expect(result.notIgnored).toEqual([]);
    });

    it('should skip commented entries during validation', () => {
      const manifest = `.env
# .env.local
.vscode/settings.json`;
      const sourceDir = '/home/user/project';
      const fileExists = () => true;
      const isGitIgnored = () => true;

      const result = validateManifestContent(manifest, sourceDir, fileExists, isGitIgnored);

      expect(result.checkedCount).toBe(2); // Only .env and .vscode/settings.json
      expect(result.problems).toEqual([]);
    });

    it('should handle empty manifest', () => {
      const result = validateManifestContent(
        '',
        '/home/user/project',
        () => true,
        () => true
      );

      expect(result.problems).toEqual([]);
      expect(result.checkedCount).toBe(0);
    });

    it('should count unique entries only', () => {
      const manifest = `.env
.env
.vscode/settings.json`;
      const sourceDir = '/home/user/project';
      const fileExists = () => true;
      const isGitIgnored = () => true;

      const result = validateManifestContent(manifest, sourceDir, fileExists, isGitIgnored);

      expect(result.checkedCount).toBe(2); // Only 2 unique entries
    });

    it('should not check missing files for git ignored status', () => {
      const manifest = `.env
missing-file.txt`;
      const sourceDir = '/home/user/project';
      // Use path.join for cross-platform compatibility
      const envPath = path.join(sourceDir, '.env');
      const existingFiles = new Set([envPath]);
      const fileExists = (p: string) => existingFiles.has(p);
      const gitIgnoredCalls: string[] = [];
      const isGitIgnored = (p: string) => {
        gitIgnoredCalls.push(p);
        return true;
      };

      validateManifestContent(manifest, sourceDir, fileExists, isGitIgnored);

      // Only .env should be checked for git ignored (not missing-file.txt)
      expect(gitIgnoredCalls).toEqual([envPath]);
    });
  });
});
