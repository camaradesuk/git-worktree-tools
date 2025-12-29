import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// We need to test internal functions, so we'll import the module
// and use vi.mock to access internals where needed

describe('wtlink/link-configs', () => {
  describe('parseWorktreeList', () => {
    // Since parseWorktreeList is not exported, we test it indirectly
    // by testing the behavior of functions that use it
    // or we create a separate testable module

    // For now, let's document the expected parsing behavior
    it('should parse empty worktree list', () => {
      const raw = '';
      const entries = parseWorktreeListHelper(raw);
      expect(entries).toEqual([]);
    });

    it('should parse single worktree entry', () => {
      const raw = `worktree /home/user/project
HEAD abc123
branch refs/heads/main

`;
      const entries = parseWorktreeListHelper(raw);
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
      const entries = parseWorktreeListHelper(raw);
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
      const entries = parseWorktreeListHelper(raw);
      expect(entries).toHaveLength(1);
      expect(entries[0].isBare).toBe(true);
    });

    it('should handle worktree without branch (detached HEAD)', () => {
      const raw = `worktree /home/user/project
HEAD abc123
detached

`;
      const entries = parseWorktreeListHelper(raw);
      expect(entries).toHaveLength(1);
      expect(entries[0].branch).toBeUndefined();
    });
  });

  describe('manifest parsing', () => {
    it('should parse active entries', () => {
      const manifest = `.env
.vscode/settings.json
config/local.json`;
      const entries = parseManifestHelper(manifest);
      expect(entries.active).toEqual([
        '.env',
        '.vscode/settings.json',
        'config/local.json',
      ]);
      expect(entries.commented).toEqual([]);
    });

    it('should parse commented entries', () => {
      const manifest = `# .env.local
# .vscode/launch.json`;
      const entries = parseManifestHelper(manifest);
      expect(entries.active).toEqual([]);
      expect(entries.commented).toEqual(['.env.local', '.vscode/launch.json']);
    });

    it('should handle mixed entries', () => {
      const manifest = `.env
# .env.local
.vscode/settings.json
# .vscode/launch.json
`;
      const entries = parseManifestHelper(manifest);
      expect(entries.active).toEqual(['.env', '.vscode/settings.json']);
      expect(entries.commented).toEqual(['.env.local', '.vscode/launch.json']);
    });

    it('should skip blank lines', () => {
      const manifest = `.env

.vscode/settings.json

`;
      const entries = parseManifestHelper(manifest);
      expect(entries.active).toEqual(['.env', '.vscode/settings.json']);
    });

    it('should handle header comments (multiple #)', () => {
      const manifest = `## Configuration Files
# This is a comment about the manifest
.env
# .env.local`;
      const entries = parseManifestHelper(manifest);
      // Lines starting with ## are header comments, not file entries
      expect(entries.active).toEqual(['.env']);
      expect(entries.commented).toEqual(['.env.local']);
    });
  });
});

// Helper functions that mirror the internal implementations for testing
// These should be kept in sync with the actual implementations

interface WorktreeEntry {
  path: string;
  branch?: string;
  isBare: boolean;
}

function parseWorktreeListHelper(raw: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  const lines = raw.split('\n');
  let current: WorktreeEntry | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (current && current.path) {
        entries.push(current);
      }
      current = null;
      continue;
    }

    if (!current) {
      current = { path: '', isBare: false };
    }

    if (line.startsWith('worktree ')) {
      current.path = line.substring('worktree '.length).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring('branch '.length).trim();
    } else if (line === 'bare') {
      current.isBare = true;
    }
  }

  if (current && current.path) {
    entries.push(current);
  }

  return entries;
}

function parseManifestHelper(content: string): { active: string[]; commented: string[] } {
  const active: string[] = [];
  const commented: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    // Skip header comments (lines starting with ##)
    if (line.startsWith('##')) {
      continue;
    }

    if (line.startsWith('#')) {
      // Extract file path from comment
      const filePath = line.substring(1).trim();

      // Skip if it's another comment marker or empty
      if (!filePath || filePath.startsWith('#')) {
        continue;
      }

      // Only count as a commented file entry if it looks like a file path
      // (starts with . or / or contains / or has a file extension)
      if (filePath.startsWith('.') || filePath.startsWith('/') ||
          filePath.includes('/') || /\.\w+$/.test(filePath)) {
        commented.push(filePath);
      }
      // Otherwise it's a descriptive comment, skip it
    } else {
      active.push(line);
    }
  }

  return { active, commented };
}
