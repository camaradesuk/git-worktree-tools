import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPrNumber, extractPrNumberAsync } from './worktree-utils.js';
import { DEFAULT_WORKTREE_PATTERN } from './constants.js';
import * as github from './github.js';
import * as git from './git.js';

vi.mock('./github.js');
vi.mock('./git.js');

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

describe('extractPrNumberAsync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return sync result when pattern matches', async () => {
    const result = await extractPrNumberAsync('/worktrees/myproject.pr42', {
      worktreePattern: '{repo}.pr{number}',
    });
    expect(result).toBe(42);
    expect(git.listWorktrees).not.toHaveBeenCalled();
  });

  it('should fall back to gh CLI when pattern does not match', async () => {
    vi.mocked(git.listWorktrees).mockReturnValue([
      {
        path: '/worktrees/some-random-name',
        branch: 'feat/my-feature',
        commit: 'abc123',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      },
    ]);
    vi.mocked(github.getPrByBranch).mockReturnValue({
      number: 77,
      title: 'My Feature',
      state: 'OPEN',
      url: 'https://github.com/org/repo/pull/77',
      headBranch: 'feat/my-feature',
      baseBranch: 'main',
      isDraft: false,
    });

    const result = await extractPrNumberAsync('/worktrees/some-random-name', {
      worktreePattern: '{repo}.pr{number}',
    });
    expect(result).toBe(77);
    expect(github.getPrByBranch).toHaveBeenCalledWith('feat/my-feature', undefined);
  });

  it('should return null when gh CLI finds no PR', async () => {
    vi.mocked(git.listWorktrees).mockReturnValue([
      {
        path: '/worktrees/some-name',
        branch: 'feat/no-pr',
        commit: 'abc123',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      },
    ]);
    vi.mocked(github.getPrByBranch).mockReturnValue(null);

    const result = await extractPrNumberAsync('/worktrees/some-name');
    expect(result).toBeNull();
  });

  it('should return null when worktree has no branch', async () => {
    vi.mocked(git.listWorktrees).mockReturnValue([
      {
        path: '/worktrees/detached',
        branch: null,
        commit: 'abc123',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      },
    ]);

    const result = await extractPrNumberAsync('/worktrees/detached');
    expect(result).toBeNull();
  });
});
