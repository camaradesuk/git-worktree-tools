import { describe, it, expect, vi } from 'vitest';
import { extractPrNumber } from './worktree-utils.js';
import { DEFAULT_WORKTREE_PATTERN } from './constants.js';

describe('extractPrNumber', () => {
  describe('pattern-based extraction', () => {
    it('should extract PR number using configured pattern', () => {
      const result = extractPrNumber('/worktrees/myproject.pr42', {
        worktreePattern: '{repo}.pr{number}',
      });
      expect(result).toBe(42);
    });

    it('should extract PR number from slug pattern', () => {
      const result = extractPrNumber('/worktrees/pr2301.mongodb-change-streams', {
        worktreePattern: 'pr{number}.{slug}',
      });
      expect(result).toBe(2301);
    });

    it('should extract PR number from branch pattern', () => {
      const result = extractPrNumber('/worktrees/myproject-pr123-feat-login', {
        worktreePattern: '{repo}-pr{number}-{branch}',
      });
      expect(result).toBe(123);
    });

    it('should return null for non-matching path', () => {
      const result = extractPrNumber('/worktrees/random-directory', {
        worktreePattern: '{repo}.pr{number}',
      });
      expect(result).toBeNull();
    });
  });

  describe('default pattern fallback', () => {
    it('should use default pattern when no config pattern provided', () => {
      const result = extractPrNumber('/worktrees/myproject.pr99');
      expect(result).toBe(99);
    });

    it('should use default pattern when config pattern does not match', () => {
      const result = extractPrNumber('/worktrees/myproject.pr99', {
        worktreePattern: 'pr{number}.{slug}',
      });
      // Doesn't match pr{number}.{slug} pattern but matches default {repo}.pr{number}
      expect(result).toBe(99);
    });
  });

  describe('edge cases', () => {
    it('should handle patterns with special regex characters', () => {
      const result = extractPrNumber('/worktrees/my.project.pr5', {
        worktreePattern: '{repo}.pr{number}',
      });
      expect(result).toBe(5);
    });

    it('should return null for empty path', () => {
      const result = extractPrNumber('');
      expect(result).toBeNull();
    });
  });
});
