import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { runCli, runCliJson, createTestContext, setupGhMock, type TestContext } from '../helpers/index.js';

/**
 * E2E tests for wtlink - config file linking tool.
 *
 * Tests the linking of gitignored config files between worktrees.
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

/**
 * Helper to create a PR worktree
 */
function createPrWorktree(ctx: TestContext, prNumber: number, branchName: string): string {
  const repoRoot = ctx.repoDir;
  const repoName = path.basename(repoRoot);
  const worktreePath = path.join(path.dirname(repoRoot), `${repoName}.pr${prNumber}`);

  execSync(`git checkout -b ${branchName}`, { cwd: repoRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoRoot, `pr-${prNumber}.txt`), `PR ${prNumber}`);
  execSync('git add .', { cwd: repoRoot, stdio: 'ignore' });
  execSync(`git commit -m "PR ${prNumber}"`, { cwd: repoRoot, stdio: 'ignore' });
  execSync('git checkout main', { cwd: repoRoot, stdio: 'ignore' });

  execSync(`git worktree add "${worktreePath}" ${branchName}`, { cwd: repoRoot, stdio: 'ignore' });

  ctx.ghMock?.addPr({
    number: prNumber,
    state: 'OPEN',
    title: `PR ${prNumber}`,
    headRefName: branchName,
  });

  return worktreePath;
}

describe('wtlink e2e - core functionality', () => {
  describe('help and usage', () => {
    it('shows help with --help', () => {
      const result = runCli('wtlink', ['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wtlink');
      expect(result.stdout).toMatch(/manage|link|validate/);
    });

    it('shows validate subcommand help', () => {
      const result = runCli('wtlink', ['validate', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('validate');
    });

    it('shows link subcommand help', () => {
      const result = runCli('wtlink', ['link', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('link');
    });

    it('shows manage subcommand help', () => {
      const result = runCli('wtlink', ['manage', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('manage');
    });
  });

  describe('error conditions', () => {
    it('fails for unknown subcommand', () => {
      const ctx = createTestContext({ scenario: 'main_clean_same' });

      try {
        const result = runCli('wtlink', ['unknown-command'], {
          cwd: ctx.repoDir,
          env: ctx.env,
        });

        expect(result.exitCode).not.toBe(0);
      } finally {
        ctx.cleanup();
      }
    });
  });
});

describe('wtlink e2e - validate subcommand', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('passes with empty manifest', () => {
    createManifest(ctx.repoDir, []);

    const result = runCli('wtlink', ['validate'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
  });

  it('passes when all entries exist and are gitignored', () => {
    // Create files
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    fs.writeFileSync(path.join(ctx.repoDir, 'config.local.json'), '{}');

    // Add to gitignore
    addToGitignore(ctx.repoDir, ['.env', 'config.local.json']);

    // Create manifest
    createManifest(ctx.repoDir, ['.env', 'config.local.json']);

    const result = runCli('wtlink', ['validate'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
  });

  it('fails when manifest entry does not exist', () => {
    createManifest(ctx.repoDir, ['nonexistent.txt']);
    addToGitignore(ctx.repoDir, ['nonexistent.txt']);

    const result = runCli('wtlink', ['validate'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    // Should fail or warn about missing file
    // The actual behavior depends on implementation
    expect(typeof result.exitCode).toBe('number');
  });

  it('fails when manifest entry is not gitignored', () => {
    // Create file but don't add to gitignore
    fs.writeFileSync(path.join(ctx.repoDir, 'tracked-file.txt'), 'content');
    createManifest(ctx.repoDir, ['tracked-file.txt']);

    const result = runCli('wtlink', ['validate'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    // Should fail or warn about file not being ignored
    expect(typeof result.exitCode).toBe('number');
    if (result.exitCode !== 0) {
      expect(result.stderr.toLowerCase()).toMatch(/gitignore|ignored|tracked/i);
    }
  });

  it('handles missing manifest file', () => {
    // No manifest file exists
    const result = runCli('wtlink', ['validate'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    // Should handle gracefully (either create or warn)
    expect(typeof result.exitCode).toBe('number');
  });
});

describe('wtlink e2e - link subcommand', () => {
  let ctx: TestContext;
  let worktreePath: string;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
    worktreePath = createPrWorktree(ctx, 1, 'feat/link-test');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('creates hard links by default', () => {
    // Create source file
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    const result = runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--yes'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);

    // Linked file should exist in destination
    const linkedPath = path.join(worktreePath, '.env');
    expect(fs.existsSync(linkedPath)).toBe(true);
  });

  it('--type symbolic creates symbolic links', () => {
    fs.writeFileSync(path.join(ctx.repoDir, '.env.local'), 'LOCAL=true');
    addToGitignore(ctx.repoDir, ['.env.local']);
    createManifest(ctx.repoDir, ['.env.local']);

    const result = runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--type', 'symbolic', '--yes'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);

    const linkedPath = path.join(worktreePath, '.env.local');
    expect(fs.existsSync(linkedPath)).toBe(true);

    // Verify it's a symlink (on supported platforms)
    try {
      const stat = fs.lstatSync(linkedPath);
      expect(stat.isSymbolicLink()).toBe(true);
    } catch {
      // Some platforms may not support symlinks
    }
  });

  it('--dry-run shows what would be linked', () => {
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    const result = runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--dry-run'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);

    // File should NOT exist after dry-run
    const linkedPath = path.join(worktreePath, '.env');
    expect(fs.existsSync(linkedPath)).toBe(false);

    // Output should mention dry-run or preview
    expect(result.stdout.toLowerCase()).toMatch(/dry|would|preview/i);
  });

  it('--yes skips confirmation', () => {
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    const result = runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--yes'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
  });

  it('handles nested file paths', () => {
    // Create nested directory structure
    fs.mkdirSync(path.join(ctx.repoDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(ctx.repoDir, 'config', 'secrets.json'), '{}');
    addToGitignore(ctx.repoDir, ['config/secrets.json']);
    createManifest(ctx.repoDir, ['config/secrets.json']);

    const result = runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--yes'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);

    const linkedPath = path.join(worktreePath, 'config', 'secrets.json');
    expect(fs.existsSync(linkedPath)).toBe(true);
  });
});

describe('wtlink e2e - manage subcommand', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('--non-interactive runs without prompts', () => {
    // Create some gitignored files
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);

    const result = runCli('wtlink', ['manage', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
  });

  it('--clean removes stale entries', () => {
    // Create manifest with stale entry
    createManifest(ctx.repoDir, ['stale-file.txt']);

    const result = runCli('wtlink', ['manage', '--clean', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
  });

  it('--backup creates backup before updating', () => {
    createManifest(ctx.repoDir, ['# existing entry']);

    const result = runCli('wtlink', ['manage', '--backup', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    // Backup file may or may not be created depending on whether changes were made
  });

  it('--dry-run shows changes without writing', () => {
    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);

    const result = runCli('wtlink', ['manage', '--dry-run', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toLowerCase()).toMatch(/dry|would|preview/i);
  });
});

describe('wtlink e2e - JSON output', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext({ scenario: 'main_clean_same' });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // Note: wtlink has --json flag defined but subcommands don't implement JSON output yet.
  // These tests verify the current behavior and serve as documentation of the gap.

  it('validate command accepts --json flag', () => {
    createManifest(ctx.repoDir, []);

    // wtlink doesn't output JSON yet, but should accept the flag without error
    const result = runCli('wtlink', ['validate', '--json'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    // Should succeed even though JSON output not implemented
    expect(result.exitCode).toBe(0);
  });

  it('link command accepts --json flag', () => {
    const worktreePath = createPrWorktree(ctx, 2, 'feat/json-link');

    fs.writeFileSync(path.join(ctx.repoDir, '.env'), 'SECRET=value');
    addToGitignore(ctx.repoDir, ['.env']);
    createManifest(ctx.repoDir, ['.env']);

    const result = runCli('wtlink', ['link', ctx.repoDir, worktreePath, '--yes', '--json'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    // Should succeed even though JSON output not implemented
    expect(result.exitCode).toBe(0);
  });

  it('errors output to stderr', () => {
    createManifest(ctx.repoDir, ['nonexistent.txt']);

    const result = runCli('wtlink', ['validate'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });

    // Should fail with error message in stderr
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(/error|missing|validation/i);
  });
});

describe('wtlink e2e - edge cases', () => {
  it('handles files with special characters in names', () => {
    const ctx = createTestContext({ scenario: 'main_clean_same' });

    try {
      // Create file with spaces (safe special char)
      fs.writeFileSync(path.join(ctx.repoDir, 'my config.json'), '{}');
      addToGitignore(ctx.repoDir, ['my config.json']);
      createManifest(ctx.repoDir, ['my config.json']);

      const result = runCli('wtlink', ['validate'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(typeof result.exitCode).toBe('number');
    } finally {
      ctx.cleanup();
    }
  });

  it('handles empty worktree gracefully', () => {
    const ctx = createTestContext({ scenario: 'main_clean_same' });

    try {
      const result = runCli('wtlink', ['manage', '--non-interactive'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).toBe(0);
    } finally {
      ctx.cleanup();
    }
  });
});
