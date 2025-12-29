import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as git from '../lib/git.js';

/**
 * Integration tests for git operations using a real git repository.
 * These tests create a temporary git repo and perform actual git operations.
 */

describe('git integration', () => {
  let tempDir: string;
  let repoDir: string;

  // Create temp directory and git repo before all tests
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-worktree-tools-test-'));
    repoDir = path.join(tempDir, 'test-repo');
    fs.mkdirSync(repoDir);

    // Initialize git repo
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });

    // Create initial commit
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test Repo\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Initial commit"', { cwd: repoDir });
  });

  // Clean up after all tests
  afterAll(() => {
    // Remove worktrees first
    try {
      execSync('git worktree prune', { cwd: repoDir, stdio: 'ignore' });
    } catch {
      // Ignore errors
    }

    // Remove temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getRepoRoot', () => {
    it('returns repo root directory', () => {
      const result = git.getRepoRoot(repoDir);
      expect(path.normalize(result)).toBe(path.normalize(repoDir));
    });

    it('works from subdirectory', () => {
      const subDir = path.join(repoDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });

      const result = git.getRepoRoot(subDir);
      expect(path.normalize(result)).toBe(path.normalize(repoDir));
    });

    it('throws for non-repo directory', () => {
      expect(() => git.getRepoRoot(tempDir)).toThrow();
    });
  });

  describe('getRepoName', () => {
    it('returns directory name when no remote', () => {
      const result = git.getRepoName(repoDir);
      expect(result).toBe('test-repo');
    });
  });

  describe('getCurrentBranch', () => {
    it('returns current branch name', () => {
      // Ensure we're on a known branch
      try {
        execSync('git checkout -b main 2>/dev/null || git checkout main', {
          cwd: repoDir,
          stdio: 'ignore',
        });
      } catch {
        // Branch might already exist
      }

      const result = git.getCurrentBranch(repoDir);
      // Could be 'main' or 'master' depending on git default
      expect(result).toMatch(/^(main|master)$/);
    });
  });

  describe('getWorkingTreeStatus', () => {
    beforeEach(() => {
      // Reset working tree
      execSync('git checkout -- .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git clean -fd', { cwd: repoDir, stdio: 'ignore' });
    });

    it('returns clean for clean working tree', () => {
      const result = git.getWorkingTreeStatus(repoDir);
      expect(result).toBe('clean');
    });

    it('returns staged_only for staged changes', () => {
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Updated\n');
      execSync('git add README.md', { cwd: repoDir });

      const result = git.getWorkingTreeStatus(repoDir);
      expect(result).toBe('staged_only');

      // Reset
      execSync('git reset HEAD README.md', { cwd: repoDir, stdio: 'ignore' });
      execSync('git checkout -- README.md', { cwd: repoDir, stdio: 'ignore' });
    });

    it('returns unstaged_only for unstaged changes', () => {
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Modified\n');

      const result = git.getWorkingTreeStatus(repoDir);
      expect(result).toBe('unstaged_only');

      // Reset
      execSync('git checkout -- README.md', { cwd: repoDir, stdio: 'ignore' });
    });

    it('returns unstaged_only for untracked files', () => {
      fs.writeFileSync(path.join(repoDir, 'new-file.txt'), 'content');

      const result = git.getWorkingTreeStatus(repoDir);
      expect(result).toBe('unstaged_only');

      // Clean up
      fs.unlinkSync(path.join(repoDir, 'new-file.txt'));
    });

    it('returns both for staged and unstaged changes', () => {
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# First change\n');
      execSync('git add README.md', { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Second change\n');

      const result = git.getWorkingTreeStatus(repoDir);
      expect(result).toBe('both');

      // Reset
      execSync('git reset HEAD README.md', { cwd: repoDir, stdio: 'ignore' });
      execSync('git checkout -- README.md', { cwd: repoDir, stdio: 'ignore' });
    });
  });

  describe('getStagedFiles and getUnstagedFiles', () => {
    beforeEach(() => {
      execSync('git checkout -- .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git clean -fd', { cwd: repoDir, stdio: 'ignore' });
    });

    it('returns staged files correctly', () => {
      fs.writeFileSync(path.join(repoDir, 'staged.txt'), 'content');
      execSync('git add staged.txt', { cwd: repoDir });

      const result = git.getStagedFiles(repoDir);
      expect(result).toContain('staged.txt');

      // Clean up
      execSync('git reset HEAD staged.txt', { cwd: repoDir, stdio: 'ignore' });
      fs.unlinkSync(path.join(repoDir, 'staged.txt'));
    });

    it('returns unstaged files correctly', () => {
      fs.writeFileSync(path.join(repoDir, 'unstaged.txt'), 'content');

      const result = git.getUnstagedFiles(repoDir);
      expect(result).toContain('unstaged.txt');

      // Clean up
      fs.unlinkSync(path.join(repoDir, 'unstaged.txt'));
    });
  });

  describe('branch operations', () => {
    it('creates and deletes branches', () => {
      git.createBranch('test-branch', undefined, repoDir);
      expect(git.branchExists('test-branch', repoDir)).toBe(true);

      git.deleteBranch('test-branch', { cwd: repoDir });
      expect(git.branchExists('test-branch', repoDir)).toBe(false);
    });

    it('checks if branch exists', () => {
      expect(git.branchExists('nonexistent-branch', repoDir)).toBe(false);
    });
  });

  describe('commit operations', () => {
    beforeEach(() => {
      execSync('git checkout -- .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git clean -fd', { cwd: repoDir, stdio: 'ignore' });
    });

    it('creates commit with message', () => {
      fs.writeFileSync(path.join(repoDir, 'commit-test.txt'), 'test content');
      execSync('git add commit-test.txt', { cwd: repoDir });

      const sha = git.commit({ message: 'Test commit message' }, repoDir);

      expect(sha).toMatch(/^[a-f0-9]{40}$/);

      // Verify commit exists
      const log = execSync('git log --oneline -1', { cwd: repoDir, encoding: 'utf8' });
      expect(log).toContain('Test commit message');
    });

    it('creates empty commit when allowed', () => {
      const beforeSha = git.getHeadCommit(repoDir);
      const afterSha = git.commit({ message: 'Empty commit', allowEmpty: true }, repoDir);

      expect(afterSha).not.toBe(beforeSha);
    });
  });

  describe('worktree operations', () => {
    let worktreePath: string;

    beforeEach(() => {
      worktreePath = path.join(tempDir, 'worktree-test');
    });

    afterEach(() => {
      // Clean up worktree
      try {
        execSync(`git worktree remove --force "${worktreePath}"`, {
          cwd: repoDir,
          stdio: 'ignore',
        });
      } catch {
        // Ignore errors
      }

      // Also try to delete the branch
      try {
        execSync('git branch -D worktree-branch', { cwd: repoDir, stdio: 'ignore' });
      } catch {
        // Ignore errors
      }
    });

    it('lists worktrees', () => {
      const worktrees = git.listWorktrees(repoDir);

      expect(worktrees.length).toBeGreaterThanOrEqual(1);
      expect(worktrees[0].isMain).toBe(true);
      expect(path.normalize(worktrees[0].path)).toBe(path.normalize(repoDir));
    });

    it('creates and removes worktree', () => {
      git.addWorktree(worktreePath, 'worktree-branch', {
        createBranch: true,
        cwd: repoDir,
      });

      // Verify worktree exists
      expect(fs.existsSync(worktreePath)).toBe(true);

      const worktrees = git.listWorktrees(repoDir);
      const newWorktree = worktrees.find(
        (w) => path.normalize(w.path) === path.normalize(worktreePath)
      );
      expect(newWorktree).toBeDefined();
      expect(newWorktree?.branch).toBe('worktree-branch');

      // Remove worktree
      git.removeWorktree(worktreePath, { cwd: repoDir });

      // Verify worktree removed
      const afterWorktrees = git.listWorktrees(repoDir);
      const removed = afterWorktrees.find(
        (w) => path.normalize(w.path) === path.normalize(worktreePath)
      );
      expect(removed).toBeUndefined();
    });

    it('gets main worktree', () => {
      const mainWorktree = git.getMainWorktree(repoDir);

      expect(mainWorktree).toBeDefined();
      expect(mainWorktree?.isMain).toBe(true);
      expect(path.normalize(mainWorktree!.path)).toBe(path.normalize(repoDir));
    });

    it('detects if current directory is a worktree', () => {
      // Main repo should not be considered "a worktree" (it's the main worktree)
      expect(git.isWorktree(repoDir)).toBe(false);

      // Create a secondary worktree
      git.addWorktree(worktreePath, 'worktree-branch', {
        createBranch: true,
        cwd: repoDir,
      });

      // Secondary worktree should be detected as a worktree
      expect(git.isWorktree(worktreePath)).toBe(true);
    });
  });

  describe('stash operations', () => {
    beforeEach(() => {
      // Reset index and working tree completely
      execSync('git reset HEAD', { cwd: repoDir, stdio: 'ignore' });
      execSync('git checkout -- .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git clean -fd', { cwd: repoDir, stdio: 'ignore' });
      // Clear any existing stashes
      try {
        execSync('git stash clear', { cwd: repoDir, stdio: 'ignore' });
      } catch {
        // Ignore
      }
    });

    it('stashes changes and returns reference', () => {
      fs.writeFileSync(path.join(repoDir, 'stash-test.txt'), 'stash content');
      execSync('git add stash-test.txt', { cwd: repoDir });

      const stashRef = git.stash({}, repoDir);

      expect(stashRef).toBe('stash@{0}');

      // Verify file is no longer present
      expect(fs.existsSync(path.join(repoDir, 'stash-test.txt'))).toBe(false);

      // Clean up - apply and reset
      git.stashPop(stashRef!, repoDir);
      execSync('git reset HEAD stash-test.txt', { cwd: repoDir, stdio: 'ignore' });
      fs.unlinkSync(path.join(repoDir, 'stash-test.txt'));
    });

    it('returns null when nothing to stash', () => {
      const stashRef = git.stash({}, repoDir);
      expect(stashRef).toBeNull();
    });

    it('stashes with keep-index', () => {
      // Create a staged file
      fs.writeFileSync(path.join(repoDir, 'staged.txt'), 'staged content');
      execSync('git add staged.txt', { cwd: repoDir });

      // Create an unstaged modification to a tracked file
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Modified README\n');

      git.stash({ keepIndex: true }, repoDir);

      // Staged file should still be present (keep-index preserves staged changes)
      expect(fs.existsSync(path.join(repoDir, 'staged.txt'))).toBe(true);

      // README should be reverted to its last committed state (unstaged changes stashed)
      const readmeContent = fs.readFileSync(path.join(repoDir, 'README.md'), 'utf8');
      expect(readmeContent).toBe('# Test Repo\n');

      // Clean up
      git.stashDrop(undefined, repoDir);
      execSync('git reset HEAD', { cwd: repoDir, stdio: 'ignore' });
      execSync('git checkout -- .', { cwd: repoDir, stdio: 'ignore' });
      if (fs.existsSync(path.join(repoDir, 'staged.txt'))) {
        fs.unlinkSync(path.join(repoDir, 'staged.txt'));
      }
    });
  });

  describe('checkout', () => {
    beforeEach(() => {
      execSync('git checkout -- .', { cwd: repoDir, stdio: 'ignore' });
    });

    it('switches branches', () => {
      git.createBranch('checkout-test', undefined, repoDir);

      git.checkout('checkout-test', repoDir);
      expect(git.getCurrentBranch(repoDir)).toBe('checkout-test');

      // Switch back
      git.checkout('main', repoDir);

      // Clean up
      git.deleteBranch('checkout-test', { cwd: repoDir });
    });
  });

  describe('getHeadCommit and getShortCommit', () => {
    it('returns full commit SHA', () => {
      const sha = git.getHeadCommit(repoDir);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    });

    it('returns short commit SHA', () => {
      const shortSha = git.getShortCommit(repoDir);
      expect(shortSha).toMatch(/^[a-f0-9]{7,8}$/);
    });
  });
});
