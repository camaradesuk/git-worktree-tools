import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as git from './git.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe('git', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exec', () => {
    it('executes git command and returns output with trailing whitespace trimmed', () => {
      mockExecSync.mockReturnValue('output with trailing whitespace  \n');
      const result = git.exec(['status']);
      // Leading whitespace is preserved (important for git status), trailing is trimmed
      expect(result).toBe('output with trailing whitespace');
      expect(mockExecSync).toHaveBeenCalledWith('git status', expect.any(Object));
    });

    it('preserves leading whitespace in output', () => {
      // Leading spaces are significant in git status --porcelain output
      mockExecSync.mockReturnValue(' M file.txt\n');
      const result = git.exec(['status', '--porcelain']);
      expect(result).toBe(' M file.txt');
    });

    it('passes cwd option correctly', () => {
      mockExecSync.mockReturnValue('output');
      git.exec(['status'], { cwd: '/some/path' });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git status',
        expect.objectContaining({ cwd: '/some/path' })
      );
    });

    it('throws error with stderr message on failure', () => {
      const error = new Error('Command failed') as Error & { stderr: Buffer };
      error.stderr = Buffer.from('fatal: not a git repository');
      mockExecSync.mockImplementation(() => {
        throw error;
      });

      expect(() => git.exec(['status'])).toThrow('Git command failed');
    });
  });

  describe('execSafe', () => {
    it('returns output on success', () => {
      mockExecSync.mockReturnValue('output');
      const result = git.execSafe(['status']);
      expect(result).toBe('output');
    });

    it('returns null on failure', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });
      const result = git.execSafe(['status']);
      expect(result).toBeNull();
    });
  });

  describe('getRepoRoot', () => {
    it('returns normalized path from git rev-parse', () => {
      mockExecSync.mockReturnValue('/home/user/repo\n');
      const result = git.getRepoRoot();
      expect(result).toContain('repo');
      expect(mockExecSync).toHaveBeenCalledWith(
        'git rev-parse --show-toplevel',
        expect.any(Object)
      );
    });
  });

  describe('getRepoName', () => {
    it('extracts name from SSH remote URL', () => {
      mockExecSync.mockReturnValue('git@github.com:org/my-repo.git');
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('extracts name from HTTPS remote URL', () => {
      mockExecSync.mockReturnValue('https://github.com/org/my-repo.git');
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('extracts name from URL without .git suffix', () => {
      mockExecSync.mockReturnValue('https://github.com/org/my-repo');
      const result = git.getRepoName('/repo');
      expect(result).toBe('my-repo');
    });

    it('falls back to directory name when no remote', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('No remote');
      });
      const result = git.getRepoName('/home/user/my-project');
      expect(result).toBe('my-project');
    });
  });

  describe('getCurrentBranch', () => {
    it('returns branch name', () => {
      mockExecSync.mockReturnValue('feature/my-branch');
      const result = git.getCurrentBranch();
      expect(result).toBe('feature/my-branch');
    });

    it('returns null for detached HEAD', () => {
      mockExecSync.mockReturnValue('HEAD');
      const result = git.getCurrentBranch();
      expect(result).toBeNull();
    });
  });

  describe('isDetachedHead', () => {
    it('returns true when in detached HEAD state', () => {
      mockExecSync.mockReturnValue('HEAD');
      expect(git.isDetachedHead()).toBe(true);
    });

    it('returns false when on a branch', () => {
      mockExecSync.mockReturnValue('main');
      expect(git.isDetachedHead()).toBe(false);
    });
  });

  describe('getWorkingTreeStatus', () => {
    it('returns clean for empty status', () => {
      mockExecSync.mockReturnValue('');
      expect(git.getWorkingTreeStatus()).toBe('clean');
    });

    it('returns staged_only for staged changes', () => {
      mockExecSync.mockReturnValue('M  file.txt');
      expect(git.getWorkingTreeStatus()).toBe('staged_only');
    });

    it('returns unstaged_only for unstaged changes', () => {
      mockExecSync.mockReturnValue(' M file.txt');
      expect(git.getWorkingTreeStatus()).toBe('unstaged_only');
    });

    it('returns unstaged_only for untracked files', () => {
      mockExecSync.mockReturnValue('?? newfile.txt');
      expect(git.getWorkingTreeStatus()).toBe('unstaged_only');
    });

    it('returns both for staged and unstaged changes', () => {
      mockExecSync.mockReturnValue('MM file.txt');
      expect(git.getWorkingTreeStatus()).toBe('both');
    });

    it('returns both for staged changes and untracked files', () => {
      mockExecSync.mockReturnValue('M  staged.txt\n?? untracked.txt');
      expect(git.getWorkingTreeStatus()).toBe('both');
    });
  });

  describe('getStagedFiles', () => {
    it('returns list of staged files', () => {
      mockExecSync.mockReturnValue('file1.txt\nfile2.txt\n');
      const result = git.getStagedFiles();
      expect(result).toEqual(['file1.txt', 'file2.txt']);
    });

    it('returns empty array when nothing staged', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('No staged files');
      });
      const result = git.getStagedFiles();
      expect(result).toEqual([]);
    });
  });

  describe('getUnstagedFiles', () => {
    it('returns list of unstaged and untracked files', () => {
      mockExecSync.mockReturnValue(' M modified.txt\n?? untracked.txt');
      const result = git.getUnstagedFiles();
      expect(result).toEqual(['modified.txt', 'untracked.txt']);
    });

    it('excludes staged-only files', () => {
      mockExecSync.mockReturnValue('M  staged.txt\n M both.txt');
      const result = git.getUnstagedFiles();
      expect(result).toEqual(['both.txt']);
    });

    it('returns empty array when working tree is clean', () => {
      mockExecSync.mockReturnValue('');
      const result = git.getUnstagedFiles();
      expect(result).toEqual([]);
    });
  });

  describe('listWorktrees', () => {
    it('parses worktree list porcelain output', () => {
      mockExecSync.mockReturnValue(
        'worktree /home/user/repo\n' +
          'HEAD abc123def456\n' +
          'branch refs/heads/main\n' +
          '\n' +
          'worktree /home/user/repo.pr42\n' +
          'HEAD def456abc123\n' +
          'branch refs/heads/feature/test\n' +
          '\n'
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
      mockExecSync.mockReturnValue('worktree /home/user/repo.git\n' + 'bare\n' + '\n');

      const result = git.listWorktrees();
      expect(result[0].isBare).toBe(true);
      expect(result[0].isMain).toBe(true);
    });

    it('handles locked and prunable worktrees', () => {
      mockExecSync.mockReturnValue(
        'worktree /home/user/repo.pr1\n' +
          'HEAD abc123\n' +
          'branch refs/heads/test\n' +
          'locked\n' +
          'prunable\n' +
          '\n'
      );

      const result = git.listWorktrees();
      expect(result[0].isLocked).toBe(true);
      expect(result[0].isPrunable).toBe(true);
    });

    it('handles detached HEAD in worktree', () => {
      mockExecSync.mockReturnValue(
        'worktree /home/user/repo\n' + 'HEAD abc123\n' + 'detached\n' + '\n'
      );

      const result = git.listWorktrees();
      expect(result[0].branch).toBeNull();
    });
  });

  describe('getCommitRelationship', () => {
    it('returns same when HEAD equals base', () => {
      mockExecSync
        .mockReturnValueOnce('abc123') // getHeadCommit
        .mockReturnValueOnce('abc123'); // getRefCommit

      const result = git.getCommitRelationship('main');
      expect(result).toBe('same');
    });

    it('returns divergent when base branch does not exist', () => {
      mockExecSync
        .mockReturnValueOnce('abc123') // getHeadCommit
        .mockImplementationOnce(() => {
          throw new Error('unknown revision');
        }); // getRefCommit fails

      const result = git.getCommitRelationship('main');
      expect(result).toBe('divergent');
    });
  });

  describe('getCommitsAhead', () => {
    it('returns list of commits ahead of base', () => {
      mockExecSync.mockReturnValue('abc123 First commit\ndef456 Second commit');
      const result = git.getCommitsAhead('main');
      expect(result).toEqual(['abc123 First commit', 'def456 Second commit']);
    });

    it('returns empty array when not ahead', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('No commits');
      });
      const result = git.getCommitsAhead('main');
      expect(result).toEqual([]);
    });
  });

  describe('addWorktree', () => {
    it('creates worktree with existing branch', () => {
      mockExecSync.mockReturnValue('');
      git.addWorktree('/path/to/worktree', 'feature-branch');
      expect(mockExecSync).toHaveBeenCalledWith(
        'git worktree add "/path/to/worktree" feature-branch',
        expect.any(Object)
      );
    });

    it('creates worktree with new branch', () => {
      mockExecSync.mockReturnValue('');
      git.addWorktree('/path/to/worktree', 'new-branch', { createBranch: true });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git worktree add -b new-branch "/path/to/worktree"',
        expect.any(Object)
      );
    });

    it('creates worktree with new branch from start point', () => {
      mockExecSync.mockReturnValue('');
      git.addWorktree('/path/to/worktree', 'new-branch', {
        createBranch: true,
        startPoint: 'origin/main',
      });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git worktree add -b new-branch "/path/to/worktree" "origin/main"',
        expect.any(Object)
      );
    });
  });

  describe('removeWorktree', () => {
    it('removes worktree', () => {
      mockExecSync.mockReturnValue('');
      git.removeWorktree('/path/to/worktree');
      expect(mockExecSync).toHaveBeenCalledWith(
        'git worktree remove "/path/to/worktree"',
        expect.any(Object)
      );
    });

    it('force removes worktree', () => {
      mockExecSync.mockReturnValue('');
      git.removeWorktree('/path/to/worktree', { force: true });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git worktree remove --force "/path/to/worktree"',
        expect.any(Object)
      );
    });
  });

  describe('createBranch', () => {
    it('creates branch from HEAD', () => {
      mockExecSync.mockReturnValue('');
      git.createBranch('new-branch');
      expect(mockExecSync).toHaveBeenCalledWith('git branch new-branch', expect.any(Object));
    });

    it('creates branch from start point', () => {
      mockExecSync.mockReturnValue('');
      git.createBranch('new-branch', 'origin/main');
      expect(mockExecSync).toHaveBeenCalledWith(
        'git branch new-branch "origin/main"',
        expect.any(Object)
      );
    });
  });

  describe('deleteBranch', () => {
    it('deletes branch with -d flag', () => {
      mockExecSync.mockReturnValue('');
      git.deleteBranch('old-branch');
      expect(mockExecSync).toHaveBeenCalledWith('git branch -d old-branch', expect.any(Object));
    });

    it('force deletes branch with -D flag', () => {
      mockExecSync.mockReturnValue('');
      git.deleteBranch('old-branch', { force: true });
      expect(mockExecSync).toHaveBeenCalledWith('git branch -D old-branch', expect.any(Object));
    });
  });

  describe('commit', () => {
    it('creates commit with message', () => {
      mockExecSync
        .mockReturnValueOnce('') // commit
        .mockReturnValueOnce('abc123'); // getHeadCommit
      const result = git.commit({ message: 'Test commit' });
      expect(mockExecSync).toHaveBeenCalledWith('git commit -m "Test commit"', expect.any(Object));
      expect(result).toBe('abc123');
    });

    it('creates commit with all flag', () => {
      mockExecSync.mockReturnValueOnce('').mockReturnValueOnce('abc123');
      git.commit({ message: 'Test commit', all: true });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git commit -a -m "Test commit"',
        expect.any(Object)
      );
    });

    it('creates empty commit when allowed', () => {
      mockExecSync.mockReturnValueOnce('').mockReturnValueOnce('abc123');
      git.commit({ message: 'Empty commit', allowEmpty: true });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git commit --allow-empty -m "Empty commit"',
        expect.any(Object)
      );
    });
  });

  describe('push', () => {
    it('pushes to remote', () => {
      mockExecSync.mockReturnValue('');
      git.push();
      expect(mockExecSync).toHaveBeenCalledWith('git push', expect.any(Object));
    });

    it('pushes with upstream flag', () => {
      mockExecSync.mockReturnValue('');
      git.push({ setUpstream: true, remote: 'origin', branch: 'feature' });
      expect(mockExecSync).toHaveBeenCalledWith('git push -u origin feature', expect.any(Object));
    });

    it('force pushes', () => {
      mockExecSync.mockReturnValue('');
      git.push({ force: true });
      expect(mockExecSync).toHaveBeenCalledWith('git push --force', expect.any(Object));
    });
  });

  describe('stash', () => {
    it('creates stash and returns reference', () => {
      mockExecSync.mockReturnValue('Saved working directory');
      const result = git.stash();
      expect(result).toBe('stash@{0}');
    });

    it('returns null when nothing to stash', () => {
      mockExecSync.mockReturnValue('No local changes to save');
      const result = git.stash();
      expect(result).toBeNull();
    });

    it('stashes with keep-index flag', () => {
      mockExecSync.mockReturnValue('Saved');
      git.stash({ keepIndex: true });
      expect(mockExecSync).toHaveBeenCalledWith('git stash push --keep-index', expect.any(Object));
    });

    it('stashes with message', () => {
      mockExecSync.mockReturnValue('Saved');
      git.stash({ message: 'WIP: feature' });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git stash push -m "WIP: feature"',
        expect.any(Object)
      );
    });

    it('stashes untracked files', () => {
      mockExecSync.mockReturnValue('Saved');
      git.stash({ includeUntracked: true });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git stash push --include-untracked',
        expect.any(Object)
      );
    });
  });

  describe('branchExists', () => {
    it('returns true when branch exists', () => {
      mockExecSync.mockReturnValue('abc123');
      expect(git.branchExists('main')).toBe(true);
    });

    it('returns false when branch does not exist', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('unknown revision');
      });
      expect(git.branchExists('nonexistent')).toBe(false);
    });
  });

  describe('remoteBranchExists', () => {
    it('returns true when remote branch exists', () => {
      mockExecSync.mockReturnValue('abc123');
      expect(git.remoteBranchExists('main')).toBe(true);
    });

    it('returns false when remote branch does not exist', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('unknown revision');
      });
      expect(git.remoteBranchExists('nonexistent')).toBe(false);
    });

    it('checks specific remote', () => {
      mockExecSync.mockReturnValue('abc123');
      git.remoteBranchExists('main', 'upstream');
      expect(mockExecSync).toHaveBeenCalledWith(
        'git rev-parse --verify "refs/remotes/upstream/main"',
        expect.any(Object)
      );
    });
  });
});
