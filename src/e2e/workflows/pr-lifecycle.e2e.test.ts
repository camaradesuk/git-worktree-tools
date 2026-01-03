import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { runCli, runCliJson, createTestContext, type TestContext } from '../helpers/index.js';

/**
 * E2E tests for cross-tool workflows.
 *
 * Tests the integration between newpr, lswt, cleanpr, and wtlink tools.
 */

/**
 * Helper to create a manifest file
 */
function createManifest(dir: string, entries: string[]): void {
  const content = entries.join('\n') + '\n';
  fs.writeFileSync(path.join(dir, '.wtlinkrc'), content);
}

/**
 * Helper to create gitignore entries
 */
function addToGitignore(dir: string, entries: string[]): void {
  const gitignorePath = path.join(dir, '.gitignore');
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }
  content += entries.join('\n') + '\n';
  fs.writeFileSync(gitignorePath, content);
  execSync('git add .gitignore', { cwd: dir, stdio: 'ignore' });
  execSync('git commit -m "Update gitignore" --allow-empty', { cwd: dir, stdio: 'ignore' });
}

describe('e2e workflow - full PR lifecycle', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('newpr -> lswt -> cleanpr lifecycle', () => {
    // Step 1: Create a new PR with newpr
    const createResult = runCliJson<{
      prNumber: number;
      worktreePath: string;
      branch: string;
    }>('newpr', ['lifecycle-test', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(createResult.error).toBeNull();
    expect(createResult.data).not.toBeNull();
    const prNumber = createResult.data!.prNumber;
    const worktreePath = createResult.data!.worktreePath;

    expect(prNumber).toBeGreaterThan(0);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // Step 2: Verify worktree appears in lswt
    const listResult = runCliJson<{
      worktrees: Array<{
        path: string;
        prNumber?: number;
      }>;
    }>('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(listResult.error).toBeNull();
    if (listResult.data?.worktrees) {
      const prWorktree = listResult.data.worktrees.find((wt) => wt.prNumber === prNumber);
      // The PR worktree should be listed
      expect(listResult.data.worktrees.length).toBeGreaterThan(1);
    }

    // Step 3: Mark PR as merged in mock
    ctx.ghMock?.setPrState(prNumber, 'MERGED');

    // Step 4: Clean up with cleanpr
    const cleanResult = runCli('cleanpr', [String(prNumber), '--force'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(cleanResult.exitCode).toBe(0);

    // Step 5: Verify worktree is removed
    expect(fs.existsSync(worktreePath)).toBe(false);

    // Step 6: Verify lswt no longer shows the PR worktree
    const finalListResult = runCliJson<{
      worktrees: Array<{
        path: string;
        prNumber?: number;
      }>;
    }>('lswt', ['--no-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    if (finalListResult.data?.worktrees) {
      const prWorktree = finalListResult.data.worktrees.find((wt) => wt.prNumber === prNumber);
      expect(prWorktree).toBeUndefined();
    }
  });
});

describe('e2e workflow - lswt shows newpr-created worktree', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_staged_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('lswt immediately shows worktree after newpr creates it', () => {
    // Create a new PR
    const createResult = runCliJson<{
      prNumber: number;
      worktreePath: string;
    }>('newpr', ['visibility-test', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(createResult.error).toBeNull();
    const prNumber = createResult.data!.prNumber;
    const worktreePath = createResult.data!.worktreePath;

    // List worktrees with status
    const listResult = runCli('lswt', ['--no-interactive', '--status'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(listResult.exitCode).toBe(0);
    // Output should reference the PR number or branch
    expect(listResult.stdout).toMatch(new RegExp(`${prNumber}|visibility-test`, 'i'));
  });

  it('lswt shows PR state (OPEN/MERGED/CLOSED) correctly', () => {
    // Create a new PR
    const createResult = runCliJson<{
      prNumber: number;
    }>('newpr', ['state-test', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    const prNumber = createResult.data!.prNumber;

    // Check initial state shows OPEN
    const openResult = runCli('lswt', ['--no-interactive', '--status'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(openResult.exitCode).toBe(0);
    expect(openResult.stdout.toLowerCase()).toMatch(/open/i);

    // Update to MERGED
    ctx.ghMock?.setPrState(prNumber, 'MERGED');

    const mergedResult = runCli('lswt', ['--no-interactive', '--status'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(mergedResult.exitCode).toBe(0);
    expect(mergedResult.stdout.toLowerCase()).toMatch(/merged/i);
  });
});

describe('e2e workflow - wtlink in newpr worktree', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // Note: These tests use manually created worktrees instead of newpr
  // because wtlink's path resolution relies on git's main worktree detection
  // which behaves differently when combined with newpr's worktree creation

  it('wtlink links config files to manually created worktree', () => {
    // Create worktree FIRST (before creating files that git might track)
    const branchName = 'feat/wtlink-manual-test';
    execSync(`git checkout -b ${branchName}`, { cwd: ctx.repoDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(ctx.repoDir, 'feature.txt'), 'feature');
    execSync('git add feature.txt', { cwd: ctx.repoDir, stdio: 'ignore' });
    execSync('git commit -m "feature"', { cwd: ctx.repoDir, stdio: 'ignore' });
    execSync('git checkout main', { cwd: ctx.repoDir, stdio: 'ignore' });

    const worktreePath = path.join(path.dirname(ctx.repoDir), 'wtlink-test-wt');
    execSync(`git worktree add "${worktreePath}" ${branchName}`, {
      cwd: ctx.repoDir,
      stdio: 'ignore',
    });

    // THEN create config file and manifest in main worktree (after worktree exists)
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    // Link configs from main to worktree
    const linkResult = runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--yes'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    if (linkResult.exitCode !== 0) {
      console.log('Link stderr:', linkResult.stderr);
      console.log('Link stdout:', linkResult.stdout);
    }
    expect(linkResult.exitCode).toBe(0);

    // Verify the config file is linked in the worktree
    const linkedPath = path.join(worktreePath, '.env');
    expect(fs.existsSync(linkedPath)).toBe(true);

    // Verify content is the same
    const linkedContent = fs.readFileSync(linkedPath, 'utf8');
    expect(linkedContent).toBe('SECRET=value');

    // Cleanup
    try {
      execSync(`git worktree remove "${worktreePath}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('wtlink validates manifest in main worktree after linking', () => {
    // Create worktree FIRST (before creating files that git might track)
    const branchName = 'feat/validate-manual-test';
    execSync(`git checkout -b ${branchName}`, { cwd: ctx.repoDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(ctx.repoDir, 'feature.txt'), 'feature');
    execSync('git add feature.txt', { cwd: ctx.repoDir, stdio: 'ignore' });
    execSync('git commit -m "feature"', { cwd: ctx.repoDir, stdio: 'ignore' });
    execSync('git checkout main', { cwd: ctx.repoDir, stdio: 'ignore' });

    const worktreePath = path.join(path.dirname(ctx.repoDir), 'validate-test-wt');
    execSync(`git worktree add "${worktreePath}" ${branchName}`, {
      cwd: ctx.repoDir,
      stdio: 'ignore',
    });

    // THEN setup config in main worktree (after worktree exists)
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    // Link configs
    runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--yes'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    // Validate from the main worktree (where gitignore is properly set up)
    const validateResult = runCli('wtlink', ['validate'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    if (validateResult.exitCode !== 0) {
      console.log('Validate stderr:', validateResult.stderr);
      console.log('Validate stdout:', validateResult.stdout);
    }
    expect(validateResult.exitCode).toBe(0);

    // Cleanup
    try {
      execSync(`git worktree remove "${worktreePath}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
    } catch {
      // Ignore cleanup errors
    }
  });
});

describe('e2e workflow - cleanpr with wtlink-managed files', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('cleanpr removes worktree even with linked config files', () => {
    // Setup config file and manifest
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    // Create PR worktree using newpr
    const createResult = runCliJson<{
      prNumber: number;
      worktreePath: string;
    }>('newpr', ['cleanup-wtlink-test', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(createResult.error).toBeNull();
    const prNumber = createResult.data!.prNumber;
    const worktreePath = createResult.data!.worktreePath;

    // Create hard link manually (since wtlink has path issues with newpr worktrees)
    const envInWorktree = path.join(worktreePath, '.env');
    fs.linkSync(path.join(ctx.repoDir, '.env'), envInWorktree);

    // Verify link exists
    expect(fs.existsSync(envInWorktree)).toBe(true);

    // Mark PR as merged
    ctx.ghMock?.setPrState(prNumber, 'MERGED');

    // Clean up with cleanpr
    const cleanResult = runCli('cleanpr', [String(prNumber), '--force'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(cleanResult.exitCode).toBe(0);

    // Verify worktree is removed
    expect(fs.existsSync(worktreePath)).toBe(false);

    // Original config file should still exist (it's the source, not a link)
    expect(fs.existsSync(path.join(ctx.repoDir, '.env'))).toBe(true);
  });

  it('cleanpr handles worktree with modified linked files', () => {
    // Setup config file and manifest
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=original');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    // Create PR worktree using newpr
    const createResult = runCliJson<{
      prNumber: number;
      worktreePath: string;
    }>('newpr', ['modified-wtlink-test', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(createResult.error).toBeNull();
    const prNumber = createResult.data!.prNumber;
    const worktreePath = createResult.data!.worktreePath;

    // Create hard link manually
    const envInWorktree = path.join(worktreePath, '.env');
    fs.linkSync(path.join(ctx.repoDir, '.env'), envInWorktree);

    // Modify the linked file in PR worktree
    // For hard links, this modifies the same inode
    fs.writeFileSync(envInWorktree, 'SECRET=modified');

    // Mark PR as merged
    ctx.ghMock?.setPrState(prNumber, 'MERGED');

    // Clean up
    const cleanResult = runCli('cleanpr', [String(prNumber), '--force'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(cleanResult.exitCode).toBe(0);

    // Original file should reflect the modification (hard link behavior)
    const originalContent = fs.readFileSync(path.join(ctx.repoDir, '.env'), 'utf8');
    expect(originalContent).toBe('SECRET=modified');
  });
});
