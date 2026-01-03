import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, execSync, type SpawnSyncReturns } from 'child_process';
import * as path from 'path';
import * as git from './git.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));

const mockSpawnSync = vi.mocked(spawnSync);
const mockExecSync = vi.mocked(execSync);

/**
 * Helper to create a successful spawnSync result
 */
function mockSpawnSuccess(stdout: string): SpawnSyncReturns<string> {
  return {
    status: 0,
    signal: null,
    output: ['', stdout, ''],
    pid: 123,
    stdout,
    stderr: '',
    error: undefined,
  };
}

/**
 * Helper to create a failed spawnSync result
 */
function mockSpawnFailure(stderr: string): SpawnSyncReturns<string> {
  return {
    status: 1,
    signal: null,
    output: ['', '', stderr],
    pid: 123,
    stdout: '',
    stderr,
    error: undefined,
  };
}

describe('git', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exec', () => {
    it('executes git command and returns output with trailing whitespace trimmed', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('output with trailing whitespace  \n'));
      const result = git.exec(['status']);
      // Leading whitespace is preserved (important for git status), trailing is trimmed
      expect(result).toBe('output with trailing whitespace');
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['status'], expect.any(Object));
    });

    it('preserves leading whitespace in output', () => {
      // Leading spaces are significant in git status --porcelain output
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(' M file.txt\n'));
      const result = git.exec(['status', '--porcelain']);
      expect(result).toBe(' M file.txt');
    });

    it('passes cwd option correctly', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('output'));
      git.exec(['status'], { cwd: '/some/path' });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['status'],
        expect.objectContaining({ cwd: '/some/path' })
      );
    });

    it('throws error with stderr message on failure', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('fatal: not a git repository'));

      expect(() => git.exec(['status'])).toThrow('Git command failed');
    });
  });

  describe('execSafe', () => {
    it('returns output on success', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('output'));
      const result = git.execSafe(['status']);
      expect(result).toBe('output');
    });

    it('returns null on failure', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('Command failed'));
      const result = git.execSafe(['status']);
      expect(result).toBeNull();
    });
  });

  describe('getRepoRoot', () => {
    it('returns normalized path from git rev-parse', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('/home/user/repo\n'));
      const result = git.getRepoRoot();
      expect(result).toContain('repo');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--show-toplevel'],
        expect.any(Object)
      );
    });
  });

  describe('getRepoName', () => {
    it('extracts name from SSH remote URL', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('git@github.com:org/my-repo.git'));
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('extracts name from HTTPS remote URL', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('https://github.com/org/my-repo.git'));
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('extracts name from URL without .git suffix', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('https://github.com/org/my-repo'));
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('falls back to directory name when no remote', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('No remote'));
      const result = git.getRepoName('/home/user/my-project');
      expect(result).toBe('my-project');
    });

    it('extracts name from Unix local path with .git suffix', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('/path/to/my-repo.git'));
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('extracts name from Windows local path with .git suffix', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('C:\\Users\\test\\repos\\my-repo.git'));
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('extracts name from Windows local path without .git suffix', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('C:\\Users\\test\\repos\\my-repo'));
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('extracts name from Windows short path format', () => {
      mockSpawnSync.mockReturnValue(
        mockSpawnSuccess('C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\main-repo.git')
      );
      const result = git.getRepoName('/repo');
      expect(result).toBe('main-repo');
    });
  });

  describe('getCurrentBranch', () => {
    it('returns branch name', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('feature/my-branch'));
      const result = git.getCurrentBranch();
      expect(result).toBe('feature/my-branch');
    });

    it('returns null for detached HEAD', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('HEAD'));
      const result = git.getCurrentBranch();
      expect(result).toBeNull();
    });
  });

  describe('isDetachedHead', () => {
    it('returns true when in detached HEAD state', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('HEAD'));
      expect(git.isDetachedHead()).toBe(true);
    });

    it('returns false when on a branch', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('main'));
      expect(git.isDetachedHead()).toBe(false);
    });
  });

  describe('getWorkingTreeStatus', () => {
    it('returns clean for empty status', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      expect(git.getWorkingTreeStatus()).toBe('clean');
    });

    it('returns staged_only for staged changes', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('M  file.txt'));
      expect(git.getWorkingTreeStatus()).toBe('staged_only');
    });

    it('returns unstaged_only for unstaged changes', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(' M file.txt'));
      expect(git.getWorkingTreeStatus()).toBe('unstaged_only');
    });

    it('returns unstaged_only for untracked files', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('?? newfile.txt'));
      expect(git.getWorkingTreeStatus()).toBe('unstaged_only');
    });

    it('returns both for staged and unstaged changes', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('MM file.txt'));
      expect(git.getWorkingTreeStatus()).toBe('both');
    });

    it('returns both for staged changes and untracked files', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('M  staged.txt\n?? untracked.txt'));
      expect(git.getWorkingTreeStatus()).toBe('both');
    });
  });

  describe('getStagedFiles', () => {
    it('returns list of staged files', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('file1.txt\nfile2.txt\n'));
      const result = git.getStagedFiles();
      expect(result).toEqual(['file1.txt', 'file2.txt']);
    });

    it('returns empty array when nothing staged', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('No staged files'));
      const result = git.getStagedFiles();
      expect(result).toEqual([]);
    });
  });

  describe('getUnstagedFiles', () => {
    it('returns list of unstaged and untracked files', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(' M modified.txt\n?? untracked.txt'));
      const result = git.getUnstagedFiles();
      expect(result).toEqual(['modified.txt', 'untracked.txt']);
    });

    it('excludes staged-only files', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('M  staged.txt\n M both.txt'));
      const result = git.getUnstagedFiles();
      expect(result).toEqual(['both.txt']);
    });

    it('returns empty array when working tree is clean', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      const result = git.getUnstagedFiles();
      expect(result).toEqual([]);
    });
  });

  describe('listWorktrees', () => {
    it('parses worktree list porcelain output', () => {
      mockSpawnSync.mockReturnValue(
        mockSpawnSuccess(
          'worktree /home/user/repo\n' +
            'HEAD abc123def456\n' +
            'branch refs/heads/main\n' +
            '\n' +
            'worktree /home/user/repo.pr42\n' +
            'HEAD def456abc123\n' +
            'branch refs/heads/feature/test\n' +
            '\n'
        )
      );

      const result = git.listWorktrees();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: '/home/user/repo',
        commit: 'abc123def456',
        branch: 'main',
        isMain: true,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      });
      expect(result[1]).toEqual({
        path: '/home/user/repo.pr42',
        commit: 'def456abc123',
        branch: 'feature/test',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      });
    });

    it('handles bare repository', () => {
      mockSpawnSync.mockReturnValue(
        mockSpawnSuccess('worktree /home/user/repo.git\n' + 'bare\n' + '\n')
      );

      const result = git.listWorktrees();
      expect(result[0].isBare).toBe(true);
      expect(result[0].isMain).toBe(true);
    });

    it('handles locked and prunable worktrees', () => {
      mockSpawnSync.mockReturnValue(
        mockSpawnSuccess(
          'worktree /home/user/repo.pr1\n' +
            'HEAD abc123\n' +
            'branch refs/heads/test\n' +
            'locked\n' +
            'prunable\n' +
            '\n'
        )
      );

      const result = git.listWorktrees();
      expect(result[0].isLocked).toBe(true);
      expect(result[0].isPrunable).toBe(true);
    });

    it('handles detached HEAD in worktree', () => {
      mockSpawnSync.mockReturnValue(
        mockSpawnSuccess('worktree /home/user/repo\n' + 'HEAD abc123\n' + 'detached\n' + '\n')
      );

      const result = git.listWorktrees();
      expect(result[0].branch).toBeNull();
    });
  });

  describe('getCommitRelationship', () => {
    it('returns same when HEAD equals base', () => {
      mockSpawnSync
        .mockReturnValueOnce(mockSpawnSuccess('abc123')) // getHeadCommit
        .mockReturnValueOnce(mockSpawnSuccess('abc123')); // getRefCommit

      const result = git.getCommitRelationship('main');
      expect(result).toBe('same');
    });

    it('returns divergent when base branch does not exist', () => {
      mockSpawnSync
        .mockReturnValueOnce(mockSpawnSuccess('abc123')) // getHeadCommit
        .mockReturnValueOnce(mockSpawnFailure('unknown revision')); // getRefCommit fails

      const result = git.getCommitRelationship('main');
      expect(result).toBe('divergent');
    });
  });

  describe('getCommitsAhead', () => {
    it('returns list of commits ahead of base', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('abc123 First commit\ndef456 Second commit'));
      const result = git.getCommitsAhead('main');
      expect(result).toEqual(['abc123 First commit', 'def456 Second commit']);
    });

    it('returns empty array when not ahead', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('No commits'));
      const result = git.getCommitsAhead('main');
      expect(result).toEqual([]);
    });
  });

  describe('addWorktree', () => {
    it('creates worktree with existing branch', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.addWorktree('/path/to/worktree', 'feature-branch');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '/path/to/worktree', 'feature-branch'],
        expect.any(Object)
      );
    });

    it('creates worktree with new branch', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.addWorktree('/path/to/worktree', 'new-branch', { createBranch: true });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '-b', 'new-branch', '/path/to/worktree'],
        expect.any(Object)
      );
    });

    it('creates worktree with new branch from start point', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.addWorktree('/path/to/worktree', 'new-branch', {
        createBranch: true,
        startPoint: 'origin/main',
      });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '-b', 'new-branch', '/path/to/worktree', 'origin/main'],
        expect.any(Object)
      );
    });
  });

  describe('removeWorktree', () => {
    it('removes worktree', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.removeWorktree('/path/to/worktree');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/path/to/worktree'],
        expect.any(Object)
      );
    });

    it('force removes worktree', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.removeWorktree('/path/to/worktree', { force: true });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '--force', '/path/to/worktree'],
        expect.any(Object)
      );
    });
  });

  describe('createBranch', () => {
    it('creates branch from HEAD', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.createBranch('new-branch');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['branch', 'new-branch'],
        expect.any(Object)
      );
    });

    it('creates branch from start point', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.createBranch('new-branch', 'origin/main');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['branch', 'new-branch', 'origin/main'],
        expect.any(Object)
      );
    });
  });

  describe('deleteBranch', () => {
    it('deletes branch with -d flag', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.deleteBranch('old-branch');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['branch', '-d', 'old-branch'],
        expect.any(Object)
      );
    });

    it('force deletes branch with -D flag', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.deleteBranch('old-branch', { force: true });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['branch', '-D', 'old-branch'],
        expect.any(Object)
      );
    });
  });

  describe('commit', () => {
    it('creates commit with message', () => {
      mockSpawnSync
        .mockReturnValueOnce(mockSpawnSuccess('')) // commit
        .mockReturnValueOnce(mockSpawnSuccess('abc123')); // getHeadCommit
      const result = git.commit({ message: 'Test commit' });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'Test commit'],
        expect.any(Object)
      );
      expect(result).toBe('abc123');
    });

    it('creates commit with all flag', () => {
      mockSpawnSync
        .mockReturnValueOnce(mockSpawnSuccess(''))
        .mockReturnValueOnce(mockSpawnSuccess('abc123'));
      git.commit({ message: 'Test commit', all: true });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['commit', '-a', '-m', 'Test commit'],
        expect.any(Object)
      );
    });

    it('creates empty commit when allowed', () => {
      mockSpawnSync
        .mockReturnValueOnce(mockSpawnSuccess(''))
        .mockReturnValueOnce(mockSpawnSuccess('abc123'));
      git.commit({ message: 'Empty commit', allowEmpty: true });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['commit', '--allow-empty', '-m', 'Empty commit'],
        expect.any(Object)
      );
    });
  });

  describe('push', () => {
    it('pushes to remote', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.push();
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['push'], expect.any(Object));
    });

    it('pushes with upstream flag', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.push({ setUpstream: true, remote: 'origin', branch: 'feature' });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['push', '-u', 'origin', 'feature'],
        expect.any(Object)
      );
    });

    it('force pushes', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      git.push({ force: true });
      expect(mockSpawnSync).toHaveBeenCalledWith('git', ['push', '--force'], expect.any(Object));
    });
  });

  describe('stash', () => {
    it('creates stash and returns reference', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('Saved working directory'));
      const result = git.stash();
      expect(result).toBe('stash@{0}');
    });

    it('returns null when nothing to stash', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('No local changes to save'));
      const result = git.stash();
      expect(result).toBeNull();
    });

    it('stashes with keep-index flag', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('Saved'));
      git.stash({ keepIndex: true });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['stash', 'push', '--keep-index'],
        expect.any(Object)
      );
    });

    it('stashes with message', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('Saved'));
      git.stash({ message: 'WIP: feature' });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['stash', 'push', '-m', 'WIP: feature'],
        expect.any(Object)
      );
    });

    it('stashes untracked files', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('Saved'));
      git.stash({ includeUntracked: true });
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['stash', 'push', '--include-untracked'],
        expect.any(Object)
      );
    });
  });

  describe('branchExists', () => {
    it('returns true when branch exists', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('abc123'));
      expect(git.branchExists('main')).toBe(true);
    });

    it('returns false when branch does not exist', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('unknown revision'));
      expect(git.branchExists('nonexistent')).toBe(false);
    });
  });

  describe('remoteBranchExists', () => {
    it('returns true when remote branch exists', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('abc123'));
      expect(git.remoteBranchExists('main')).toBe(true);
    });

    it('returns false when remote branch does not exist', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('unknown revision'));
      expect(git.remoteBranchExists('nonexistent')).toBe(false);
    });

    it('checks specific remote', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('abc123'));
      git.remoteBranchExists('main', 'upstream');
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--verify', 'refs/remotes/upstream/main'],
        expect.any(Object)
      );
    });
  });

  describe('getMainWorktreeRoot', () => {
    it('returns repo root when in main worktree', () => {
      // Use path.join to create platform-appropriate paths
      const repoPath = path.join('/home', 'user', 'repo');
      const gitDir = path.join(repoPath, '.git');
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(gitDir));
      const result = git.getMainWorktreeRoot(repoPath);
      expect(result).toBe(path.resolve(repoPath));
    });

    it('returns main worktree root when in linked worktree', () => {
      const mainRepo = path.join('/home', 'user', 'main-repo');
      const worktreeGitDir = path.join(mainRepo, '.git', 'worktrees', 'feature-branch');
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(worktreeGitDir));
      const result = git.getMainWorktreeRoot(path.join('/home', 'user', 'main-repo.pr42'));
      expect(result).toBe(path.resolve(mainRepo));
    });

    it('falls back to getRepoRoot when commonDir is null', () => {
      const fallbackPath = path.join('/fallback', 'root');
      // First call (git-common-dir) fails, second call (show-toplevel) succeeds
      mockSpawnSync
        .mockReturnValueOnce(mockSpawnFailure('failed'))
        .mockReturnValueOnce(mockSpawnSuccess(fallbackPath));
      const result = git.getMainWorktreeRoot();
      expect(result).toContain('fallback');
    });
  });

  describe('isGitIgnored', () => {
    it('returns true when file is ignored', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess('node_modules/'));
      expect(git.isGitIgnored('node_modules/')).toBe(true);
    });

    it('returns false when file is not ignored', () => {
      mockSpawnSync.mockReturnValue(mockSpawnFailure('no output for unignored files'));
      expect(git.isGitIgnored('src/index.ts')).toBe(false);
    });

    it('returns false when check-ignore returns empty', () => {
      mockSpawnSync.mockReturnValue(mockSpawnSuccess(''));
      expect(git.isGitIgnored('src/index.ts')).toBe(false);
    });
  });

  describe('checkGitInstalled', () => {
    it('returns true when git is installed', () => {
      mockExecSync.mockReturnValue('git version 2.39.0');
      expect(git.checkGitInstalled()).toBe(true);
    });

    it('returns false when git is not installed', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found: git');
      });
      expect(git.checkGitInstalled()).toBe(false);
    });
  });
});
