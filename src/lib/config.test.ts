import { describe, it, expect } from 'vitest';
import {
  getDefaultConfig,
  generateBranchName,
  generateWorktreePath,
} from './config.js';
import * as path from 'path';

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
      const longDesc = 'This is a very long description that should be truncated to a reasonable length for a git branch name';
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
      const result = generateWorktreePath(
        config,
        '/home/user/repos/myproject',
        'myproject',
        123
      );
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
});
