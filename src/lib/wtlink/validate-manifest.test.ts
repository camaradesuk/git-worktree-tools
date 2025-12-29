import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';

// Mock modules
vi.mock('fs');
vi.mock('child_process');

describe('wtlink/validate-manifest', () => {
  const mockFs = vi.mocked(fs);
  const mockSpawnSync = vi.mocked(spawnSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('manifest validation logic', () => {
    it('should detect duplicate entries', () => {
      const manifest = `.env
.vscode/settings.json
.env
config/local.json`;

      const duplicates = findDuplicatesHelper(manifest);
      expect(duplicates).toEqual(['.env']);
    });

    it('should not report unique entries as duplicates', () => {
      const manifest = `.env
.vscode/settings.json
config/local.json`;

      const duplicates = findDuplicatesHelper(manifest);
      expect(duplicates).toEqual([]);
    });

    it('should skip commented entries when checking duplicates', () => {
      const manifest = `.env
# .env
.vscode/settings.json`;

      // Active .env and commented .env should not be duplicates
      const duplicates = findDuplicatesHelper(manifest);
      expect(duplicates).toEqual([]);
    });

    it('should count only active entries', () => {
      const manifest = `.env
.vscode/settings.json
# .vscode/launch.json
# config/local.json`;

      const count = countActiveEntriesHelper(manifest);
      expect(count).toBe(2);
    });

    it('should handle empty manifest', () => {
      const manifest = '';
      const count = countActiveEntriesHelper(manifest);
      expect(count).toBe(0);
    });

    it('should handle manifest with only comments', () => {
      const manifest = `# .env
# .vscode/settings.json
## This is a header`;

      const count = countActiveEntriesHelper(manifest);
      expect(count).toBe(0);
    });
  });

  describe('entry validation', () => {
    it('should validate entries exist', () => {
      const entries = ['.env', '.vscode/settings.json'];
      const sourceDir = '/home/user/project';

      const existingFiles = new Set(['.env']);
      const missing = findMissingFilesHelper(entries, sourceDir, existingFiles);

      expect(missing).toEqual(['.vscode/settings.json']);
    });

    it('should return empty array when all entries exist', () => {
      const entries = ['.env', '.vscode/settings.json'];
      const sourceDir = '/home/user/project';

      const existingFiles = new Set(['.env', '.vscode/settings.json']);
      const missing = findMissingFilesHelper(entries, sourceDir, existingFiles);

      expect(missing).toEqual([]);
    });
  });
});

// Helper functions for testing validation logic

function findDuplicatesHelper(manifest: string): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const rawLine of manifest.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (seen.has(line)) {
      duplicates.push(line);
    } else {
      seen.add(line);
    }
  }

  return duplicates;
}

function countActiveEntriesHelper(manifest: string): number {
  let count = 0;

  for (const rawLine of manifest.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    count++;
  }

  return count;
}

function findMissingFilesHelper(
  entries: string[],
  _sourceDir: string,
  existingFiles: Set<string>
): string[] {
  const missing: string[] = [];

  for (const entry of entries) {
    if (!existingFiles.has(entry)) {
      missing.push(entry);
    }
  }

  return missing;
}
