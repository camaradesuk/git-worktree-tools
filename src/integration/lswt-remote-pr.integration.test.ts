import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  gatherWorktreeInfo,
  createDefaultDeps,
  type GatherDeps,
} from '../lib/lswt/worktree-info.js';
import type { ListOptions } from '../lib/lswt/types.js';

/**
 * Integration tests for lswt remote PR functionality.
 * These tests create a real git repository and test worktree gathering
 * with mocked GitHub PR data.
 */

/**
 * Normalize a path for cross-platform comparison.
 */
function normalizePath(p: string): string {
  try {
    return path.normalize(fs.realpathSync.native(p)).toLowerCase();
  } catch {
    return path.normalize(p).toLowerCase();
  }
}

describe('lswt remote PR integration', () => {
  let tempDir: string;
  let repoDir: string;
  let worktreeDir: string;
  const defaultOptions: ListOptions = {
    json: false,
    verbose: false,
    showStatus: true, // Enable to get remote PRs
    interactive: false,
  };

  // Create temp directory and git repo before all tests
  beforeAll(() => {
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'lswt-remote-pr-test-'))
    );
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

    // Create a branch that we'll use for a "local PR"
    execSync('git checkout -b feat/local-pr-1', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'feature1.txt'), 'Feature 1\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Add feature 1"', { cwd: repoDir });

    // Go back to main/master before creating worktree
    execSync('git checkout master', { cwd: repoDir });

    // Create worktree directory for the branch
    worktreeDir = path.join(tempDir, 'test-repo.pr1');
    execSync(`git worktree add "${worktreeDir}" feat/local-pr-1`, { cwd: repoDir });
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

  describe('gatherWorktreeInfo with remote PRs', () => {
    it('lists local worktrees correctly', async () => {
      const deps = createDefaultDeps();

      const worktrees = await gatherWorktreeInfo(repoDir, defaultOptions, deps);

      expect(worktrees.length).toBeGreaterThanOrEqual(2); // main + PR worktree

      // Find main worktree
      const main = worktrees.find((w) => normalizePath(w.path) === normalizePath(repoDir));
      expect(main).toBeDefined();
      expect(main?.type).toBe('main');

      // Find PR worktree
      const prWorktree = worktrees.find(
        (w) => normalizePath(w.path) === normalizePath(worktreeDir)
      );
      expect(prWorktree).toBeDefined();
      // It could be 'pr' or 'branch' depending on whether status was fetched
    });

    it('includes remote PRs when listOpenPrs returns data', async () => {
      // Create deps with mocked listOpenPrs
      const deps: GatherDeps = {
        ...createDefaultDeps(),
        listOpenPrs: async () => [
          {
            number: 42,
            title: 'Remote PR Feature',
            headBranch: 'feat/remote-feature',
            url: 'https://github.com/test/repo/pull/42',
            isDraft: false,
          },
          {
            number: 99,
            title: 'Another Remote PR',
            headBranch: 'fix/remote-fix',
            url: 'https://github.com/test/repo/pull/99',
            isDraft: true,
          },
        ],
      };

      const worktrees = await gatherWorktreeInfo(repoDir, defaultOptions, deps);

      // Should have local worktrees + remote PRs
      expect(worktrees.length).toBeGreaterThanOrEqual(4); // main + local PR + 2 remote PRs

      // Find remote PRs
      const remotePrs = worktrees.filter((w) => w.type === 'remote_pr');
      expect(remotePrs.length).toBe(2);

      // Check remote PR properties
      const remotePr42 = remotePrs.find((w) => w.prNumber === 42);
      expect(remotePr42).toBeDefined();
      expect(remotePr42?.prTitle).toBe('Remote PR Feature');
      expect(remotePr42?.branch).toBe('feat/remote-feature');
      expect(remotePr42?.isDraft).toBe(false);

      const remotePr99 = remotePrs.find((w) => w.prNumber === 99);
      expect(remotePr99).toBeDefined();
      expect(remotePr99?.prTitle).toBe('Another Remote PR');
      expect(remotePr99?.isDraft).toBe(true);
    });

    it('filters out remote PRs that have local worktrees', async () => {
      // Create deps with mocked listOpenPrs that includes a PR that has a local worktree
      const deps: GatherDeps = {
        ...createDefaultDeps(),
        listOpenPrs: async () => [
          {
            // This should be filtered out because we have a worktree for feat/local-pr-1
            number: 1,
            title: 'Local PR Feature',
            headBranch: 'feat/local-pr-1',
            url: 'https://github.com/test/repo/pull/1',
            isDraft: false,
          },
          {
            // This should be included
            number: 42,
            title: 'Remote Only PR',
            headBranch: 'feat/remote-only',
            url: 'https://github.com/test/repo/pull/42',
            isDraft: false,
          },
        ],
      };

      const worktrees = await gatherWorktreeInfo(repoDir, defaultOptions, deps);

      // Find remote PRs
      const remotePrs = worktrees.filter((w) => w.type === 'remote_pr');

      // Should only have remote PRs for branches without local worktrees
      expect(remotePrs.length).toBe(1);
      expect(remotePrs[0].prNumber).toBe(42);
      expect(remotePrs[0].branch).toBe('feat/remote-only');
    });

    it('does not include remote PRs when showStatus is false', async () => {
      const deps: GatherDeps = {
        ...createDefaultDeps(),
        listOpenPrs: async () => [
          {
            number: 42,
            title: 'Remote PR Feature',
            headBranch: 'feat/remote-feature',
            url: 'https://github.com/test/repo/pull/42',
            isDraft: false,
          },
        ],
      };

      const optionsWithoutStatus = { ...defaultOptions, showStatus: false };
      const worktrees = await gatherWorktreeInfo(repoDir, optionsWithoutStatus, deps);

      // Should only have local worktrees
      const remotePrs = worktrees.filter((w) => w.type === 'remote_pr');
      expect(remotePrs.length).toBe(0);
    });

    it('handles listOpenPrs errors gracefully', async () => {
      const deps: GatherDeps = {
        ...createDefaultDeps(),
        listOpenPrs: async () => {
          throw new Error('GitHub API error');
        },
      };

      const worktrees = await gatherWorktreeInfo(repoDir, defaultOptions, deps);

      // Should still return local worktrees
      expect(worktrees.length).toBeGreaterThanOrEqual(2);

      // Should have no remote PRs (error handled gracefully)
      const remotePrs = worktrees.filter((w) => w.type === 'remote_pr');
      expect(remotePrs.length).toBe(0);
    });

    it('correctly sorts worktrees with remote PRs', async () => {
      const deps: GatherDeps = {
        ...createDefaultDeps(),
        listOpenPrs: async () => [
          {
            number: 99,
            title: 'Remote PR 99',
            headBranch: 'feat/remote-99',
            url: 'https://github.com/test/repo/pull/99',
            isDraft: false,
          },
          {
            number: 42,
            title: 'Remote PR 42',
            headBranch: 'feat/remote-42',
            url: 'https://github.com/test/repo/pull/42',
            isDraft: false,
          },
        ],
      };

      const worktrees = await gatherWorktreeInfo(repoDir, defaultOptions, deps);

      // Get remote PRs
      const remotePrs = worktrees.filter((w) => w.type === 'remote_pr');
      expect(remotePrs.length).toBe(2);

      // Remote PRs should be sorted by PR number
      expect(remotePrs[0].prNumber).toBe(42);
      expect(remotePrs[1].prNumber).toBe(99);

      // Main should be first
      expect(worktrees[0].type).toBe('main');

      // Remote PRs should come after local worktrees but be in order
      const remotePrIndices = worktrees
        .map((w, i) => (w.type === 'remote_pr' ? i : -1))
        .filter((i) => i >= 0);
      expect(remotePrIndices[0]).toBeLessThan(remotePrIndices[1]);
    });
  });
});
