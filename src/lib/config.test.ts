import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDefaultConfig, generateBranchName, generateWorktreePath, loadConfig } from './config.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Helper to normalize paths for cross-platform testing
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^[A-Z]:/, '');
}

describe('config', () => {
  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const config = getDefaultConfig();

      expect(config.baseBranch).toBe('main');
      expect(config.draftPr).toBe(false);
      expect(config.worktreePattern).toBe('{repo}.pr{number}');
      expect(config.worktreeParent).toBe('..');
      expect(config.sharedRepos).toEqual([]);
      expect(config.syncPatterns).toEqual([]);
      expect(config.branchPrefix).toBe('claude');
    });
  });

  describe('generateBranchName', () => {
    const config = getDefaultConfig();

    it('should generate branch name from description', () => {
      const branch = generateBranchName(config, 'Add user authentication feature');
      expect(branch).toMatch(/^claude\/add-user-authentication-feature-[a-z0-9]+$/);
    });

    it('should handle uppercase in description', () => {
      const branch = generateBranchName(config, 'Fix BUG in API');
      expect(branch).toMatch(/^claude\/fix-bug-in-api-[a-z0-9]+$/);
    });

    it('should handle special characters', () => {
      const branch = generateBranchName(config, "Add user's profile (v2)!");
      expect(branch).toMatch(/^claude\/add-user-s-profile-v2-[a-z0-9]+$/);
    });

    it('should truncate long descriptions', () => {
      const longDesc =
        'This is a very long description that should be truncated to a reasonable length for a git branch name';
      const branch = generateBranchName(config, longDesc);
      // Branch name should not exceed ~100 chars total
      expect(branch.length).toBeLessThan(100);
    });

    it('should handle empty description', () => {
      const branch = generateBranchName(config, '');
      // Empty description results in empty slug, so branch is prefix/-suffix
      expect(branch).toMatch(/^claude\/-[a-z0-9]+$/);
    });

    it('should use custom branch prefix', () => {
      const customConfig = { ...config, branchPrefix: 'feature' };
      const branch = generateBranchName(customConfig, 'new feature');
      expect(branch).toMatch(/^feature\/new-feature-[a-z0-9]+$/);
    });
  });

  describe('generateWorktreePath', () => {
    const config = getDefaultConfig();

    it('should generate worktree path with default pattern', () => {
      const result = generateWorktreePath(config, '/home/user/repos/myproject', 'myproject', 123);
      // Normalize paths for cross-platform comparison
      expect(normalizePath(result)).toBe('/home/user/repos/myproject.pr123');
    });

    it('should use custom worktree pattern', () => {
      const customConfig = {
        ...config,
        worktreePattern: '{repo}-pr-{number}',
      };
      const result = generateWorktreePath(
        customConfig,
        '/home/user/repos/myproject',
        'myproject',
        456
      );
      expect(normalizePath(result)).toBe('/home/user/repos/myproject-pr-456');
    });

    it('should use custom parent directory', () => {
      const customConfig = {
        ...config,
        worktreeParent: '/tmp/worktrees',
      };
      const result = generateWorktreePath(
        customConfig,
        '/home/user/repos/myproject',
        'myproject',
        789
      );
      expect(normalizePath(result)).toBe('/tmp/worktrees/myproject.pr789');
    });

    it('should include branch name when pattern uses it', () => {
      const customConfig = {
        ...config,
        worktreePattern: '{repo}.{branch}',
      };
      const result = generateWorktreePath(
        customConfig,
        '/home/user/repos/myproject',
        'myproject',
        123,
        'feature-x'
      );
      expect(normalizePath(result)).toBe('/home/user/repos/myproject.feature-x');
    });
  });

  describe('loadConfig', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return defaults when no config file exists', () => {
      const config = loadConfig(tempDir);
      expect(config).toEqual(getDefaultConfig());
    });

    it('should load config from .worktreerc', () => {
      const configContent = JSON.stringify({
        baseBranch: 'develop',
        draftPr: true,
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.baseBranch).toBe('develop');
      expect(config.draftPr).toBe(true);
      // Other values should be defaults
      expect(config.worktreePattern).toBe('{repo}.pr{number}');
    });

    it('should load config from .worktreerc.json', () => {
      const configContent = JSON.stringify({
        branchPrefix: 'feature',
        sharedRepos: ['other-repo'],
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc.json'), configContent);

      const config = loadConfig(tempDir);
      expect(config.branchPrefix).toBe('feature');
      expect(config.sharedRepos).toEqual(['other-repo']);
    });

    it('should prefer .worktreerc over .worktreerc.json', () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ baseBranch: 'main-from-worktreerc' })
      );
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc.json'),
        JSON.stringify({ baseBranch: 'main-from-json' })
      );

      const config = loadConfig(tempDir);
      expect(config.baseBranch).toBe('main-from-worktreerc');
    });

    it('should return defaults with warning for invalid JSON', () => {
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), 'invalid json {{{');

      // Mock console.warn to capture the warning
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg: string) => warnings.push(msg);

      try {
        const config = loadConfig(tempDir);
        expect(config).toEqual(getDefaultConfig());
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]).toContain('Warning');
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should merge user config with defaults', () => {
      const configContent = JSON.stringify({
        baseBranch: 'develop',
        // Only setting one property
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      // User setting
      expect(config.baseBranch).toBe('develop');
      // All other values should be defaults
      expect(config.draftPr).toBe(false);
      expect(config.worktreePattern).toBe('{repo}.pr{number}');
      expect(config.worktreeParent).toBe('..');
      expect(config.sharedRepos).toEqual([]);
      expect(config.syncPatterns).toEqual([]);
      expect(config.branchPrefix).toBe('claude');
    });
  });
});
