import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseWorktreeList,
  parseManifest,
  isAlreadyLinked,
  detectConflicts,
  updateManifest,
  isBaseBranch,
} from './link-configs.js';

describe('wtlink/link-configs', () => {
  describe('parseWorktreeList', () => {
    it('should parse empty worktree list', () => {
      const raw = '';
      const entries = parseWorktreeList(raw);
      expect(entries).toEqual([]);
    });

    it('should parse single worktree entry', () => {
      const raw = `worktree /home/user/project
HEAD abc123
branch refs/heads/main

`;
      const entries = parseWorktreeList(raw);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({
        path: '/home/user/project',
        branch: 'refs/heads/main',
        isBare: false,
      });
    });

    it('should parse multiple worktree entries', () => {
      const raw = `worktree /home/user/project
HEAD abc123
branch refs/heads/main

worktree /home/user/project.pr42
HEAD def456
branch refs/heads/feature/auth

`;
      const entries = parseWorktreeList(raw);
      expect(entries).toHaveLength(2);
      expect(entries[0].path).toBe('/home/user/project');
      expect(entries[0].branch).toBe('refs/heads/main');
      expect(entries[1].path).toBe('/home/user/project.pr42');
      expect(entries[1].branch).toBe('refs/heads/feature/auth');
    });

    it('should parse bare worktree entry', () => {
      const raw = `worktree /home/user/project.git
bare

`;
      const entries = parseWorktreeList(raw);
      expect(entries).toHaveLength(1);
      expect(entries[0].isBare).toBe(true);
    });

    it('should handle worktree without branch (detached HEAD)', () => {
      const raw = `worktree /home/user/project
HEAD abc123
detached

`;
      const entries = parseWorktreeList(raw);
      expect(entries).toHaveLength(1);
      expect(entries[0].branch).toBeUndefined();
    });

    it('should handle worktree entry without trailing newlines', () => {
      const raw = `worktree /home/user/project
HEAD abc123
branch refs/heads/main`;
      const entries = parseWorktreeList(raw);
      expect(entries).toHaveLength(1);
      expect(entries[0].path).toBe('/home/user/project');
    });
  });

  describe('parseManifest', () => {
    it('should parse active entries', () => {
      const manifest = `.env
.vscode/settings.json
config/local.json`;
      const entries = parseManifest(manifest);
      expect(entries.active).toEqual(['.env', '.vscode/settings.json', 'config/local.json']);
      expect(entries.commented).toEqual([]);
    });

    it('should parse commented entries', () => {
      const manifest = `# .env.local
# .vscode/launch.json`;
      const entries = parseManifest(manifest);
      expect(entries.active).toEqual([]);
      expect(entries.commented).toEqual(['.env.local', '.vscode/launch.json']);
    });

    it('should handle mixed entries', () => {
      const manifest = `.env
# .env.local
.vscode/settings.json
# .vscode/launch.json
`;
      const entries = parseManifest(manifest);
      expect(entries.active).toEqual(['.env', '.vscode/settings.json']);
      expect(entries.commented).toEqual(['.env.local', '.vscode/launch.json']);
    });

    it('should skip blank lines', () => {
      const manifest = `.env

.vscode/settings.json

`;
      const entries = parseManifest(manifest);
      expect(entries.active).toEqual(['.env', '.vscode/settings.json']);
    });

    it('should handle header comments (multiple #)', () => {
      const manifest = `## Configuration Files
# This is a comment about the manifest
.env
# .env.local`;
      const entries = parseManifest(manifest);
      // Lines starting with ## are header comments, not file entries
      // "This is a comment about the manifest" doesn't look like a file path, so skipped
      expect(entries.active).toEqual(['.env']);
      expect(entries.commented).toEqual(['.env.local']);
    });

    it('should detect file paths with extensions', () => {
      const manifest = `# config.yaml
# data.json`;
      const entries = parseManifest(manifest);
      expect(entries.commented).toEqual(['config.yaml', 'data.json']);
    });

    it('should skip descriptive comments', () => {
      const manifest = `# This is just a regular comment
# Remember to update this file
.env`;
      const entries = parseManifest(manifest);
      expect(entries.active).toEqual(['.env']);
      expect(entries.commented).toEqual([]);
    });
  });

  describe('isAlreadyLinked', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-configs-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return false when dest does not exist', () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      fs.writeFileSync(sourcePath, 'content');

      expect(isAlreadyLinked(sourcePath, destPath)).toBe(false);
    });

    it('should return true for hard-linked files', () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      fs.writeFileSync(sourcePath, 'content');
      fs.linkSync(sourcePath, destPath);

      expect(isAlreadyLinked(sourcePath, destPath)).toBe(true);
    });

    it('should return true for symbolic links pointing to source', () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      fs.writeFileSync(sourcePath, 'content');
      fs.symlinkSync(sourcePath, destPath);

      expect(isAlreadyLinked(sourcePath, destPath)).toBe(true);
    });

    it('should return false for different files with same content', () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      fs.writeFileSync(sourcePath, 'content');
      fs.writeFileSync(destPath, 'content');

      expect(isAlreadyLinked(sourcePath, destPath)).toBe(false);
    });

    it('should return false for different files', () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      fs.writeFileSync(sourcePath, 'source content');
      fs.writeFileSync(destPath, 'dest content');

      expect(isAlreadyLinked(sourcePath, destPath)).toBe(false);
    });

    it('should return false on error', () => {
      // Non-existent paths should return false, not throw
      expect(isAlreadyLinked('/nonexistent/source', '/nonexistent/dest')).toBe(false);
    });
  });

  describe('detectConflicts', () => {
    let tempDir: string;
    let sourceDir: string;
    let destDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-configs-test-'));
      sourceDir = path.join(tempDir, 'source');
      destDir = path.join(tempDir, 'dest');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should detect safe files (no conflict)', () => {
      fs.writeFileSync(path.join(sourceDir, 'file.txt'), 'content');

      const report = detectConflicts(['file.txt'], sourceDir, destDir);

      expect(report.safe).toHaveLength(1);
      expect(report.safe[0].file).toBe('file.txt');
      expect(report.alreadyLinked).toHaveLength(0);
      expect(report.conflicts).toHaveLength(0);
    });

    it('should detect already linked files', () => {
      const sourceFile = path.join(sourceDir, 'file.txt');
      const destFile = path.join(destDir, 'file.txt');
      fs.writeFileSync(sourceFile, 'content');
      fs.linkSync(sourceFile, destFile);

      const report = detectConflicts(['file.txt'], sourceDir, destDir);

      expect(report.safe).toHaveLength(0);
      expect(report.alreadyLinked).toHaveLength(1);
      expect(report.alreadyLinked[0].file).toBe('file.txt');
      expect(report.conflicts).toHaveLength(0);
    });

    it('should detect conflicts', () => {
      fs.writeFileSync(path.join(sourceDir, 'file.txt'), 'source content');
      fs.writeFileSync(path.join(destDir, 'file.txt'), 'different content');

      const report = detectConflicts(['file.txt'], sourceDir, destDir);

      expect(report.safe).toHaveLength(0);
      expect(report.alreadyLinked).toHaveLength(0);
      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0].file).toBe('file.txt');
    });

    it('should skip files that do not exist in source', () => {
      const report = detectConflicts(['nonexistent.txt'], sourceDir, destDir);

      expect(report.safe).toHaveLength(0);
      expect(report.alreadyLinked).toHaveLength(0);
      expect(report.conflicts).toHaveLength(0);
    });

    it('should handle multiple files with mixed states', () => {
      // Safe file
      fs.writeFileSync(path.join(sourceDir, 'safe.txt'), 'content');

      // Already linked file
      const linkedSource = path.join(sourceDir, 'linked.txt');
      const linkedDest = path.join(destDir, 'linked.txt');
      fs.writeFileSync(linkedSource, 'linked content');
      fs.linkSync(linkedSource, linkedDest);

      // Conflict file
      fs.writeFileSync(path.join(sourceDir, 'conflict.txt'), 'source');
      fs.writeFileSync(path.join(destDir, 'conflict.txt'), 'dest');

      const report = detectConflicts(
        ['safe.txt', 'linked.txt', 'conflict.txt'],
        sourceDir,
        destDir
      );

      expect(report.safe).toHaveLength(1);
      expect(report.safe[0].file).toBe('safe.txt');
      expect(report.alreadyLinked).toHaveLength(1);
      expect(report.alreadyLinked[0].file).toBe('linked.txt');
      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0].file).toBe('conflict.txt');
    });
  });

  describe('updateManifest', () => {
    let tempDir: string;
    let manifestPath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-configs-test-'));
      manifestPath = path.join(tempDir, '.wtlink');
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should remove specified files from manifest', () => {
      fs.writeFileSync(
        manifestPath,
        `.env
.vscode/settings.json
config/local.json`
      );

      updateManifest(manifestPath, ['.vscode/settings.json']);

      const result = fs.readFileSync(manifestPath, 'utf-8');
      expect(result).toBe(`.env
config/local.json`);
    });

    it('should keep empty lines and header comments', () => {
      fs.writeFileSync(
        manifestPath,
        `## Header
.env

.vscode/settings.json`
      );

      updateManifest(manifestPath, ['.vscode/settings.json']);

      const result = fs.readFileSync(manifestPath, 'utf-8');
      expect(result).toBe(`## Header
.env
`);
    });

    it('should remove commented entries when they match', () => {
      fs.writeFileSync(
        manifestPath,
        `.env
# .env.local
.vscode/settings.json`
      );

      updateManifest(manifestPath, ['.env.local']);

      const result = fs.readFileSync(manifestPath, 'utf-8');
      expect(result).toBe(`.env
.vscode/settings.json`);
    });

    it('should handle entries with TRACKED/DELETED/STALE prefixes', () => {
      fs.writeFileSync(
        manifestPath,
        `.env
# TRACKED: old-file.txt
# DELETED: removed.txt
.vscode/settings.json`
      );

      updateManifest(manifestPath, ['old-file.txt', 'removed.txt']);

      const result = fs.readFileSync(manifestPath, 'utf-8');
      expect(result).toBe(`.env
.vscode/settings.json`);
    });

    it('should handle empty removal list', () => {
      const original = `.env
.vscode/settings.json`;
      fs.writeFileSync(manifestPath, original);

      updateManifest(manifestPath, []);

      const result = fs.readFileSync(manifestPath, 'utf-8');
      expect(result).toBe(original);
    });
  });

  describe('isBaseBranch', () => {
    it('should return true for main branch', () => {
      expect(isBaseBranch('main')).toBe(true);
    });

    it('should return true for master branch', () => {
      expect(isBaseBranch('master')).toBe(true);
    });

    it('should return true for develop branch', () => {
      expect(isBaseBranch('develop')).toBe(true);
    });

    it('should return false for feature branches', () => {
      expect(isBaseBranch('feature/auth')).toBe(false);
      expect(isBaseBranch('feature-123')).toBe(false);
    });

    it('should return false for PR branches', () => {
      expect(isBaseBranch('feat/fix-issue-123')).toBe(false);
      expect(isBaseBranch('pr-42')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isBaseBranch(null)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isBaseBranch('')).toBe(false);
    });
  });
});
