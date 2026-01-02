import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import * as github from './github.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe('github', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isGhInstalled', () => {
    it('returns true when gh is available', () => {
      mockExecSync.mockReturnValue('gh version 2.40.0');
      expect(github.isGhInstalled()).toBe(true);
    });

    it('returns false when gh is not installed', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found: gh');
      });
      expect(github.isGhInstalled()).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('returns true when authenticated', () => {
      mockExecSync.mockReturnValue('Logged in to github.com as user');
      expect(github.isAuthenticated()).toBe(true);
    });

    it('returns false when not authenticated', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('You are not logged in');
      });
      expect(github.isAuthenticated()).toBe(false);
    });
  });

  describe('getRepoInfo', () => {
    it('returns repo info from gh', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          owner: { login: 'myorg' },
          name: 'myrepo',
          defaultBranchRef: { name: 'main' },
          url: 'https://github.com/myorg/myrepo',
        })
      );

      const result = github.getRepoInfo();
      expect(result).toEqual({
        owner: 'myorg',
        name: 'myrepo',
        defaultBranch: 'main',
        url: 'https://github.com/myorg/myrepo',
      });
    });

    it('returns null when not in a repo', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const result = github.getRepoInfo();
      expect(result).toBeNull();
    });

    it('defaults to main when no defaultBranchRef', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          owner: { login: 'myorg' },
          name: 'myrepo',
          defaultBranchRef: null,
          url: 'https://github.com/myorg/myrepo',
        })
      );

      const result = github.getRepoInfo();
      expect(result?.defaultBranch).toBe('main');
    });

    it('returns null on invalid JSON', () => {
      mockExecSync.mockReturnValue('not valid json');

      const result = github.getRepoInfo();
      expect(result).toBeNull();
    });
  });

  describe('createPr', () => {
    it('creates PR and fetches details via pr view', () => {
      // First call: gh pr create returns URL
      // Second call: gh pr view returns JSON details
      mockExecSync.mockReturnValueOnce('https://github.com/org/repo/pull/42\n').mockReturnValueOnce(
        JSON.stringify({
          number: 42,
          title: 'My PR',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/42',
          headRefName: 'feature/test',
          baseRefName: 'main',
          isDraft: false,
        })
      );

      const result = github.createPr({ title: 'My PR' });

      // Verify pr create was called without --json
      expect(mockExecSync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('gh pr create --title "My PR"'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenNthCalledWith(
        1,
        expect.not.stringContaining('--json'),
        expect.any(Object)
      );

      // Verify pr view was called with --json to get details
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('gh pr view 42 --json'),
        expect.any(Object)
      );

      expect(result).toEqual({
        number: 42,
        title: 'My PR',
        state: 'OPEN',
        url: 'https://github.com/org/repo/pull/42',
        headBranch: 'feature/test',
        baseBranch: 'main',
        isDraft: false,
      });
    });

    it('creates PR with all options', () => {
      mockExecSync.mockReturnValueOnce('https://github.com/org/repo/pull/43\n').mockReturnValueOnce(
        JSON.stringify({
          number: 43,
          title: 'Draft PR',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/43',
          headRefName: 'feature/draft',
          baseRefName: 'develop',
          isDraft: true,
        })
      );

      const result = github.createPr({
        title: 'Draft PR',
        body: 'PR description',
        base: 'develop',
        head: 'feature/draft',
        draft: true,
        repo: 'org/repo',
      });

      expect(mockExecSync).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /--title "Draft PR".*--body "PR description".*--base develop.*--head "feature\/draft".*--draft.*--repo "org\/repo"/
        ),
        expect.any(Object)
      );

      expect(result).toEqual({
        number: 43,
        title: 'Draft PR',
        state: 'OPEN',
        url: 'https://github.com/org/repo/pull/43',
        headBranch: 'feature/draft',
        baseBranch: 'develop',
        isDraft: true,
      });
    });

    it('falls back to options when pr view fails', () => {
      // First call: gh pr create returns URL
      // Second call: gh pr view fails
      mockExecSync
        .mockReturnValueOnce('https://github.com/org/repo/pull/44\n')
        .mockImplementationOnce(() => {
          throw new Error('Could not find pull request');
        });

      const result = github.createPr({
        title: 'Test PR',
        base: 'main',
        head: 'feature/test',
        draft: true,
      });

      expect(result).toEqual({
        number: 44,
        title: 'Test PR',
        state: 'OPEN',
        url: 'https://github.com/org/repo/pull/44',
        headBranch: 'feature/test',
        baseBranch: 'main',
        isDraft: true,
      });
    });

    it('throws error when URL cannot be parsed from response', () => {
      mockExecSync.mockReturnValueOnce('PR created successfully');

      expect(() => github.createPr({ title: 'Test PR' })).toThrow(
        'Failed to parse PR creation response'
      );
    });
  });

  describe('getPr', () => {
    it('returns PR info by number', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 42,
          title: 'My PR',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/42',
          headRefName: 'feature/test',
          baseRefName: 'main',
          isDraft: false,
        })
      );

      const result = github.getPr(42);

      expect(result).toEqual({
        number: 42,
        title: 'My PR',
        state: 'OPEN',
        url: 'https://github.com/org/repo/pull/42',
        headBranch: 'feature/test',
        baseBranch: 'main',
        isDraft: false,
      });
    });

    it('returns null when PR not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Could not find pull request');
      });

      const result = github.getPr(999);
      expect(result).toBeNull();
    });

    it('returns null on invalid JSON response', () => {
      mockExecSync.mockReturnValue('not valid json');

      const result = github.getPr(42);
      expect(result).toBeNull();
    });
  });

  describe('getPrByBranch', () => {
    it('returns PR info by branch name', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 42,
          title: 'Feature PR',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/42',
          headRefName: 'feature/test',
          baseRefName: 'main',
          isDraft: false,
        })
      );

      const result = github.getPrByBranch('feature/test');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('gh pr view "feature/test"'),
        expect.any(Object)
      );
      expect(result?.number).toBe(42);
    });

    it('returns null when no PR for branch', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('no pull requests found');
      });

      const result = github.getPrByBranch('feature/no-pr');
      expect(result).toBeNull();
    });

    it('returns null on invalid JSON response', () => {
      mockExecSync.mockReturnValue('not valid json');

      const result = github.getPrByBranch('feature/bad-json');
      expect(result).toBeNull();
    });
  });

  describe('listPrs', () => {
    it('lists PRs with default options', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify([
          {
            number: 1,
            title: 'PR 1',
            state: 'OPEN',
            url: 'https://github.com/org/repo/pull/1',
            headRefName: 'feature/1',
            baseRefName: 'main',
            isDraft: false,
          },
          {
            number: 2,
            title: 'PR 2',
            state: 'OPEN',
            url: 'https://github.com/org/repo/pull/2',
            headRefName: 'feature/2',
            baseRefName: 'main',
            isDraft: true,
          },
        ])
      );

      const result = github.listPrs();

      expect(result).toHaveLength(2);
      expect(result[0].number).toBe(1);
      expect(result[1].isDraft).toBe(true);
    });

    it('lists PRs with state filter', () => {
      mockExecSync.mockReturnValue('[]');

      github.listPrs({ state: 'closed' });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--state closed'),
        expect.any(Object)
      );
    });

    it('lists PRs with author filter', () => {
      mockExecSync.mockReturnValue('[]');

      github.listPrs({ author: '@me' });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--author @me'),
        expect.any(Object)
      );
    });

    it('lists PRs with limit', () => {
      mockExecSync.mockReturnValue('[]');

      github.listPrs({ limit: 10 });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--limit 10'),
        expect.any(Object)
      );
    });

    it('returns empty array on error', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not authenticated');
      });

      const result = github.listPrs();
      expect(result).toEqual([]);
    });

    it('returns empty array on invalid JSON', () => {
      mockExecSync.mockReturnValue('not valid json');

      const result = github.listPrs();
      expect(result).toEqual([]);
    });
  });

  describe('checkoutPr', () => {
    it('checks out PR by number', () => {
      mockExecSync.mockReturnValue('');

      github.checkoutPr(42);

      expect(mockExecSync).toHaveBeenCalledWith('gh pr checkout 42', expect.any(Object));
    });
  });

  describe('getCurrentUser', () => {
    it('returns current username', () => {
      mockExecSync.mockReturnValue('myusername');

      const result = github.getCurrentUser();
      expect(result).toBe('myusername');
    });

    it('returns null when not authenticated', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not authenticated');
      });

      const result = github.getCurrentUser();
      expect(result).toBeNull();
    });
  });

  describe('extractPrNumberFromPath', () => {
    it('extracts PR number from worktree path', () => {
      expect(github.extractPrNumberFromPath('/home/user/repo.pr42')).toBe(42);
      expect(github.extractPrNumberFromPath('/home/user/repo.pr123/')).toBe(123);
      expect(github.extractPrNumberFromPath('myrepo.pr1')).toBe(1);
    });

    it('returns null for paths without PR pattern', () => {
      expect(github.extractPrNumberFromPath('/home/user/repo')).toBeNull();
      expect(github.extractPrNumberFromPath('/home/user/repo-pr42')).toBeNull();
      expect(github.extractPrNumberFromPath('/home/user/pr42')).toBeNull();
    });
  });
});
