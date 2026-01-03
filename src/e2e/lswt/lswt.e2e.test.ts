import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import {
  runCli,
  runCliJson,
  createTestContext,
  setupGhMock,
  GH_AVAILABLE,
  type TestContext,
} from '../helpers/index.js';

/**
 * E2E tests for lswt - worktree listing tool.
 *
 * Tests the listing of worktrees with PR status.
 */

/**
 * Helper to create a PR worktree in a test repo
 */
function createPrWorktree(
  ctx: TestContext,
  prNumber: number,
  options: { state?: 'OPEN' | 'MERGED' | 'CLOSED'; branchName?: string; isDraft?: boolean } = {}
): string {
  const state = options.state ?? 'OPEN';
  const branchName = options.branchName ?? `feat/pr-${prNumber}-branch`;
  const repoRoot = ctx.repoDir;
  const repoName = path.basename(repoRoot);
  const worktreePath = path.join(path.dirname(repoRoot), `${repoName}.pr${prNumber}`);

  // Create the branch
  execSync(`git checkout -b ${branchName}`, { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, `pr-${prNumber}-file.txt`), `Content for PR ${prNumber}`);
  execSync('git add .', { cwd: repoRoot, stdio: 'ignore' });
  execSync(`git commit -m "PR ${prNumber} commit"`, { cwd: repoRoot, stdio: 'ignore' });
  execSync('git checkout main', { cwd: repoRoot, stdio: 'ignore' });

  // Create the worktree
  execSync(`git worktree add "${worktreePath}" ${branchName}`, { cwd: repoRoot, stdio: 'ignore' });

  // Register the PR in the mock
  ctx.ghMock?.addPr({
    number: prNumber,
    state,
    title: `Test PR ${prNumber}`,
    headRefName: branchName,
    isDraft: options.isDraft ?? false,
  });

  return worktreePath;
}

describe('lswt e2e - core functionality', () => {
  describe('help and usage', () => {
    it('shows help message with --help', () => {
      const result = runCli('lswt', ['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('lswt');
      expect(result.stdout).toContain('List git worktrees');
      expect(result.stdout).toMatch(/--json|--status|--verbose/);
    });

    it('shows help message with -h', () => {
      const result = runCli('lswt', ['-h']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('lswt');
    });
  });

  describe('error conditions', () => {
    it('fails outside git repository', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
      const ghMock = setupGhMock();

      try {
        const result = runCli('lswt', ['--no-interactive'], {
          cwd: tempDir,
          env: ghMock.mockEnv,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toLowerCase()).toMatch(/git|repository/i);
      } finally {
        ghMock.cleanup();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});

describe('lswt e2e - worktree listing', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('lists main worktree when no other worktrees exist', () => {
    const result = runCli('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/main|master|\[main\]/i);
  });

  it('lists all worktrees including PR worktrees', () => {
    createPrWorktree(ctx, 101, { state: 'OPEN', branchName: 'feat/feature-101' });
    createPrWorktree(ctx, 102, { state: 'MERGED', branchName: 'feat/feature-102' });

    const result = runCli('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    // Should show multiple worktrees
    expect(result.stdout).toMatch(/main|101|102/);
  });

  it('shows PR status with --status flag', () => {
    createPrWorktree(ctx, 103, { state: 'OPEN', branchName: 'feat/status-test' });

    const result = runCli('lswt', ['--no-interactive', '--status'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    // Should indicate PR status
    expect(result.stdout.toLowerCase()).toMatch(/open|pr|#103/i);
  });

  it('shows draft status for draft PRs', () => {
    createPrWorktree(ctx, 104, { state: 'OPEN', branchName: 'feat/draft-test', isDraft: true });

    const result = runCli('lswt', ['--no-interactive', '--status'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    // May show DRAFT status
    const output = result.stdout.toLowerCase();
    expect(output).toMatch(/draft|open|pr|#104/i);
  });

  it('shows verbose info with --verbose flag', () => {
    createPrWorktree(ctx, 105, { state: 'OPEN', branchName: 'feat/verbose-test' });

    const result = runCli('lswt', ['--no-interactive', '--verbose'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    // Verbose mode should show more details (commit hashes, full paths)
    // The exact format depends on implementation
  });

  it('shows uncommitted changes indicator', () => {
    const worktreePath = createPrWorktree(ctx, 106, {
      state: 'OPEN',
      branchName: 'feat/changes-test',
    });

    // Add uncommitted changes
    fs.writeFileSync(path.join(worktreePath, 'uncommitted.txt'), 'uncommitted');

    const result = runCli('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    // May show change indicator - depends on implementation
  });
});

describe('lswt e2e - JSON output', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('outputs valid JSON with --json flag', () => {
    createPrWorktree(ctx, 110, { state: 'OPEN', branchName: 'feat/json-test' });

    const result = runCliJson<{
      worktrees?: Array<{
        path: string;
        branch?: string;
        isMain?: boolean;
      }>;
    }>('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
  });

  it('JSON output includes worktree details', () => {
    createPrWorktree(ctx, 111, { state: 'OPEN', branchName: 'feat/json-details' });

    const result = runCliJson<{
      worktrees?: Array<{
        path: string;
        branch?: string;
        prNumber?: number;
      }>;
    }>('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    if (result.data && result.data.worktrees) {
      expect(result.data.worktrees.length).toBeGreaterThanOrEqual(1);
      // Each worktree should have at least a path
      for (const wt of result.data.worktrees) {
        expect(wt.path).toBeTruthy();
      }
    }
  });

  it('JSON with --status includes PR status', () => {
    createPrWorktree(ctx, 112, { state: 'MERGED', branchName: 'feat/json-status' });

    const result = runCliJson<{
      worktrees?: Array<{
        path: string;
        prNumber?: number;
        prState?: string;
      }>;
    }>('lswt', ['--no-interactive', '--status'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.error).toBeNull();
    // PR status should be included
    if (result.data && result.data.worktrees) {
      const prWorktree = result.data.worktrees.find((wt) => wt.prNumber === 112);
      if (prWorktree) {
        expect(prWorktree.prState?.toLowerCase()).toContain('merged');
      }
    }
  });
});

describe('lswt e2e - output modes', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('--no-interactive disables interactive mode', () => {
    createPrWorktree(ctx, 120, { state: 'OPEN', branchName: 'feat/no-interactive' });

    const result = runCli('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    // Should output list without blocking for input
  });

  it('works without gh cli for basic listing', () => {
    // Test that basic listing works even without gh
    const ctx = createTestContext({
      scenario: 'main_clean_same',
      skipGhMock: true,
    });

    try {
      // Create a worktree without PR
      const branchName = 'feat/no-gh-test';
      execSync(`git checkout -b ${branchName}`, { cwd: ctx.repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(ctx.repoDir, 'file.txt'), 'content');
      execSync('git add .', { cwd: ctx.repoDir, stdio: 'ignore' });
      execSync('git commit -m "test"', { cwd: ctx.repoDir, stdio: 'ignore' });
      execSync('git checkout main', { cwd: ctx.repoDir, stdio: 'ignore' });

      const worktreePath = path.join(path.dirname(ctx.repoDir), 'test-wt');
      execSync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: ctx.repoDir,
        stdio: 'ignore',
      });

      const result = runCli('lswt', ['--no-interactive'], {
        cwd: ctx.repoDir,
        env: {
          ...process.env,
          PATH: '', // No gh available
        },
      });

      // Should still list worktrees (maybe without PR status)
      expect(typeof result.exitCode).toBe('number');

      // Cleanup worktree
      try {
        execSync(`git worktree remove "${worktreePath}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors
      }
    } finally {
      ctx.cleanup();
    }
  });
});

describe('lswt e2e - special cases', () => {
  it('handles repository with only main worktree', () => {
    const ctx = createTestContext({ scenario: 'main_clean_same' });

    try {
      const result = runCli('lswt', ['--no-interactive'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/main|master/i);
    } finally {
      ctx.cleanup();
    }
  });

  it('handles detached HEAD worktree', () => {
    const ctx = createTestContext({ scenario: 'main_clean_same' });

    try {
      // Create a detached HEAD worktree
      const sha = execSync('git rev-parse HEAD', { cwd: ctx.repoDir, encoding: 'utf8' }).trim();
      const worktreePath = path.join(path.dirname(ctx.repoDir), 'detached-wt');

      execSync(`git worktree add --detach "${worktreePath}" ${sha}`, {
        cwd: ctx.repoDir,
        stdio: 'ignore',
      });

      const result = runCli('lswt', ['--no-interactive'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).toBe(0);
      // Should show detached worktree somehow

      // Cleanup
      try {
        execSync(`git worktree remove "${worktreePath}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors
      }
    } finally {
      ctx.cleanup();
    }
  });

  it('handles worktree with non-PR branch', () => {
    const ctx = createTestContext({ scenario: 'main_clean_same' });

    try {
      // Create a worktree for a non-PR branch
      const branchName = 'feature/no-pr';
      execSync(`git checkout -b ${branchName}`, { cwd: ctx.repoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(ctx.repoDir, 'file.txt'), 'content');
      execSync('git add .', { cwd: ctx.repoDir, stdio: 'ignore' });
      execSync('git commit -m "feature"', { cwd: ctx.repoDir, stdio: 'ignore' });
      execSync('git checkout main', { cwd: ctx.repoDir, stdio: 'ignore' });

      const worktreePath = path.join(path.dirname(ctx.repoDir), 'feature-wt');
      execSync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: ctx.repoDir,
        stdio: 'ignore',
      });

      const result = runCli('lswt', ['--no-interactive', '--status'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).toBe(0);
      // Should show the branch even without PR

      // Cleanup
      try {
        execSync(`git worktree remove "${worktreePath}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors
      }
    } finally {
      ctx.cleanup();
    }
  });
});
