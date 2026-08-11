import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as github from './github.js';
import { readFileSync, statSync, existsSync } from 'fs';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

/**
 * Extract the --body-file path from a built `gh` command line.
 *
 * shellEscape quotes the path and escapes `\`, `"`, `$` and backticks inside
 * it, so on Windows `C:\Users\X\Temp\f.md` reaches the command line as
 * `"C:\\Users\\X\\Temp\\f.md"`. Capturing the quoted span is not enough —
 * the escaping has to be reversed or the path won't open.
 */
function bodyFilePathFrom(cmd: unknown): string | undefined {
  const m = /--body-file (?:"([^"]+)"|(\S+))/.exec(String(cmd));
  if (!m) return undefined;
  const raw = m[1] ?? m[2];
  // Undo shellEscape's `str.replace(/["\\$`]/g, '\\$&')`.
  return m[1] !== undefined ? raw.replace(/\\(["\\$`])/g, '$1') : raw;
}

describe('github', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mock mode functions', () => {
    afterEach(() => {
      github.disableMockMode();
      delete process.env.NEWPR_MOCK_GITHUB;
    });

    it('enableMockMode enables mock mode', () => {
      expect(github.isMockModeEnabled()).toBe(false);
      github.enableMockMode();
      expect(github.isMockModeEnabled()).toBe(true);
    });

    it('disableMockMode disables mock mode', () => {
      github.enableMockMode();
      expect(github.isMockModeEnabled()).toBe(true);
      github.disableMockMode();
      expect(github.isMockModeEnabled()).toBe(false);
    });

    it('isMockModeEnabled returns true when NEWPR_MOCK_GITHUB env is set', () => {
      expect(github.isMockModeEnabled()).toBe(false);
      process.env.NEWPR_MOCK_GITHUB = '1';
      expect(github.isMockModeEnabled()).toBe(true);
    });

    it('getMockState returns the mock state', () => {
      github.enableMockMode();
      const state = github.getMockState();
      expect(state.enabled).toBe(true);
      expect(state.prCounter).toBe(1);
      expect(state.createdPrs).toEqual([]);
      expect(state.existingPrs.size).toBe(0);
    });

    it('resetMockState resets counter and clears PRs', () => {
      github.enableMockMode();
      // Create a PR to modify state
      github.createPr({ title: 'Test PR', head: 'feature/test' });

      const stateBefore = github.getMockState();
      expect(stateBefore.prCounter).toBe(2);
      expect(stateBefore.createdPrs.length).toBe(1);
      expect(stateBefore.existingPrs.size).toBe(1);

      github.resetMockState();

      const stateAfter = github.getMockState();
      expect(stateAfter.prCounter).toBe(1);
      expect(stateAfter.createdPrs.length).toBe(0);
      expect(stateAfter.existingPrs.size).toBe(0);
    });
  });

  describe('mock mode behavior', () => {
    beforeEach(() => {
      github.enableMockMode();
    });

    afterEach(() => {
      github.disableMockMode();
    });

    it('isGhInstalled returns true in mock mode', () => {
      expect(github.isGhInstalled()).toBe(true);
      // Verify execSync was not called
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('isAuthenticated returns true in mock mode', () => {
      expect(github.isAuthenticated()).toBe(true);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('getRepoInfo returns mock repo info', () => {
      const result = github.getRepoInfo();
      expect(result).toEqual({
        owner: 'mock-owner',
        name: 'mock-repo',
        defaultBranch: 'main',
        url: 'https://github.com/mock-owner/mock-repo',
      });
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('createPr creates mock PR and increments counter', () => {
      const pr1 = github.createPr({ title: 'PR 1', head: 'feature/1' });
      expect(pr1.number).toBe(1);
      expect(pr1.title).toBe('PR 1');
      expect(pr1.url).toBe('https://github.com/mock-owner/mock-repo/pull/1');

      const pr2 = github.createPr({ title: 'PR 2', head: 'feature/2', draft: true });
      expect(pr2.number).toBe(2);
      expect(pr2.isDraft).toBe(true);

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('createPr stores PR in existingPrs map', () => {
      github.createPr({ title: 'Test PR', head: 'feature/test' });

      const state = github.getMockState();
      expect(state.existingPrs.has('feature/test')).toBe(true);
    });

    it('getPr returns mock PR by number', () => {
      github.createPr({ title: 'Test PR', head: 'feature/test' });

      const result = github.getPr(1);
      expect(result?.number).toBe(1);
      expect(result?.title).toBe('Test PR');
    });

    it('getPr returns null for non-existent PR', () => {
      const result = github.getPr(999);
      expect(result).toBeNull();
    });

    it('getPrByBranch returns mock PR by branch', () => {
      github.createPr({ title: 'Test PR', head: 'feature/test' });

      const result = github.getPrByBranch('feature/test');
      expect(result?.number).toBe(1);
    });

    it('getPrByBranch returns null for non-existent branch', () => {
      const result = github.getPrByBranch('feature/nonexistent');
      expect(result).toBeNull();
    });

    it('listPrs returns all mock PRs', () => {
      github.createPr({ title: 'PR 1', head: 'feature/1' });
      github.createPr({ title: 'PR 2', head: 'feature/2' });

      const result = github.listPrs();
      expect(result.length).toBe(2);
    });

    it('listPrs filters by state', () => {
      github.createPr({ title: 'PR 1', head: 'feature/1' });
      // All mock PRs are OPEN by default

      const openPrs = github.listPrs({ state: 'open' });
      expect(openPrs.length).toBe(1);

      const closedPrs = github.listPrs({ state: 'closed' });
      expect(closedPrs.length).toBe(0);
    });

    it('listPrs respects limit', () => {
      github.createPr({ title: 'PR 1', head: 'feature/1' });
      github.createPr({ title: 'PR 2', head: 'feature/2' });
      github.createPr({ title: 'PR 3', head: 'feature/3' });

      const result = github.listPrs({ limit: 2 });
      expect(result.length).toBe(2);
    });
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

      // The body is handed to gh through a temp file, never inlined into the
      // command, so its size and quoting cannot break the invocation.
      expect(mockExecSync).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /--title "Draft PR".*--body-file .*--base develop.*--head "feature\/draft".*--draft.*--repo "org\/repo"/
        ),
        expect.any(Object)
      );
      const cmd1 = mockExecSync.mock.calls[0][0] as string;
      expect(cmd1).not.toContain('--body "PR description"');

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

    it('still emits --body when body is an explicit empty string (options.body !== undefined, not truthy check)', () => {
      mockExecSync.mockReturnValueOnce('https://github.com/org/repo/pull/45\n').mockReturnValueOnce(
        JSON.stringify({
          number: 45,
          title: 'Empty body PR',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/45',
          headRefName: 'feature/empty-body',
          baseRefName: 'main',
          isDraft: false,
        })
      );

      github.createPr({ title: 'Empty body PR', body: '', head: 'feature/empty-body' });

      // Before the fix, `if (options.body)` was falsy for '' and silently
      // dropped the body from the command entirely. An explicit empty body is
      // now still passed, via --body-file, so gh receives a real (empty) body
      // rather than the next flag being swallowed as the body value.
      const cmd = mockExecSync.mock.calls[0][0] as string;
      expect(cmd).toContain('--body-file');
      expect(cmd).not.toMatch(/--body\s+--/);
    });

    it('keeps a large multi-line body out of the command line entirely', () => {
      // The case this exists for: cmd.exe caps the command line near 8191
      // chars, so a big --body-file inlined as --body would fail on Windows
      // AFTER the branch was already committed and pushed. Passing gh a file
      // means body size never reaches the shell.
      const bigBody = [
        '# Heading',
        '',
        'x'.repeat(20000),
        '',
        '`backticks` $(whoami) "quotes"',
      ].join('\n');

      let capturedBody: string | undefined;
      mockExecSync
        .mockImplementationOnce((cmd) => {
          // Read the temp file while it still exists (createPr deletes it in
          // a finally block once gh returns).
          // Match the quoted form FIRST and allow spaces inside it: on
          // Windows os.tmpdir() is routinely something like
          // C:\Users\User Name\Temp, and shellEscape always quotes the path
          // (it contains : / or \). A \S+ pattern would truncate at the space.
          const p = bodyFilePathFrom(cmd);
          if (p) capturedBody = readFileSync(p, 'utf8');
          return 'https://github.com/org/repo/pull/47\n';
        })
        .mockReturnValueOnce(
          JSON.stringify({
            number: 47,
            title: 'Big body PR',
            state: 'OPEN',
            url: 'https://github.com/org/repo/pull/47',
            headRefName: 'feature/big',
            baseRefName: 'main',
            isDraft: false,
          })
        );

      github.createPr({ title: 'Big body PR', body: bigBody, head: 'feature/big' });

      const cmd = mockExecSync.mock.calls[0][0] as string;
      // The 20k body must not appear in the command at all.
      expect(cmd).not.toContain('x'.repeat(100));
      expect(cmd.length).toBeLessThan(500);
      expect(cmd).toContain('--body-file');
      // ...and gh must still receive it byte-for-byte.
      expect(capturedBody).toBe(bigBody);
    });

    it('creates the temp body file owner-only (0600)', () => {
      // Under a typical 022 umask an unqualified write would be 0644, exposing
      // the PR body to every local user for as long as gh runs.
      let mode: number | undefined;
      mockExecSync
        .mockImplementationOnce((cmd) => {
          const p = bodyFilePathFrom(cmd);
          if (p) mode = statSync(p).mode & 0o777;
          return 'https://github.com/org/repo/pull/48\n';
        })
        .mockReturnValueOnce(
          JSON.stringify({
            number: 48,
            title: 'Perms PR',
            state: 'OPEN',
            url: 'https://github.com/org/repo/pull/48',
            headRefName: 'feature/perms',
            baseRefName: 'main',
            isDraft: false,
          })
        );

      github.createPr({ title: 'Perms PR', body: 'secret body', head: 'feature/perms' });

      // Windows does not model POSIX permission bits; assert only where it means something.
      if (process.platform !== 'win32') {
        expect(mode).toBe(0o600);
      }
    });

    it('removes the temp body file even when gh fails', () => {
      let bodyPath: string | undefined;
      mockExecSync.mockImplementationOnce((cmd) => {
        bodyPath = bodyFilePathFrom(cmd);
        throw new Error('gh exploded');
      });

      expect(() =>
        github.createPr({ title: 'Doomed PR', body: 'body', head: 'feature/doomed' })
      ).toThrow();

      expect(bodyPath).toBeDefined();
      expect(existsSync(bodyPath as string)).toBe(false);
    });

    it('omits --body entirely when body is undefined', () => {
      mockExecSync.mockReturnValueOnce('https://github.com/org/repo/pull/46\n').mockReturnValueOnce(
        JSON.stringify({
          number: 46,
          title: 'No body PR',
          state: 'OPEN',
          url: 'https://github.com/org/repo/pull/46',
          headRefName: 'feature/no-body',
          baseRefName: 'main',
          isDraft: false,
        })
      );

      github.createPr({ title: 'No body PR', head: 'feature/no-body' });

      expect(mockExecSync).toHaveBeenNthCalledWith(
        1,
        expect.not.stringContaining('--body'),
        expect.any(Object)
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
