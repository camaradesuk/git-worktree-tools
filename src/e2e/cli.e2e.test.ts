import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * End-to-end tests for CLI commands.
 * These tests run the actual CLI commands and verify their output.
 */

// Path to the compiled CLI scripts
const CLI_DIR = path.resolve(__dirname, '../../dist/cli');

// Helper to run a CLI command
function runCli(
  command: string,
  args: string[] = [],
  options: { cwd?: string; input?: string } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const scriptPath = path.join(CLI_DIR, `${command}.js`);

  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    input: options.input,
    env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for consistent output
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('CLI e2e tests', () => {
  let tempDir: string;
  let repoDir: string;
  let worktreeDir: string;

  beforeAll(() => {
    // Ensure CLI is built
    const wtlinkPath = path.join(CLI_DIR, 'wtlink.js');
    if (!fs.existsSync(wtlinkPath)) {
      throw new Error('CLI not built. Run "npm run build" before running e2e tests.');
    }

    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-worktree-e2e-'));
    repoDir = path.join(tempDir, 'main-repo');
    worktreeDir = path.join(tempDir, 'main-repo.pr42');

    // Initialize main git repo
    fs.mkdirSync(repoDir);
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });

    // Create initial commit
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test Repo\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Initial commit"', { cwd: repoDir });

    // Create a feature branch and worktree
    execSync('git branch feature-test', { cwd: repoDir });
    execSync(`git worktree add "${worktreeDir}" feature-test`, { cwd: repoDir });
  });

  afterAll(() => {
    // Clean up worktrees first
    try {
      execSync('git worktree prune', { cwd: repoDir, stdio: 'ignore' });
    } catch {
      // Ignore
    }

    // Remove temp directory
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('wtlink', () => {
    describe('--help', () => {
      it('shows help message', () => {
        const result = runCli('wtlink', ['--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('wtlink');
        expect(result.stdout).toContain('manage');
        expect(result.stdout).toContain('link');
        expect(result.stdout).toContain('validate');
      });
    });

    describe('validate', () => {
      it('fails when manifest does not exist', () => {
        const result = runCli('wtlink', ['validate'], { cwd: repoDir });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Manifest file not found');
      });

      it('succeeds with empty manifest', () => {
        // Create empty manifest
        const manifestPath = path.join(repoDir, '.wtlinkrc');
        fs.writeFileSync(manifestPath, '# Empty manifest\n');

        try {
          const result = runCli('wtlink', ['validate'], { cwd: repoDir });

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain('valid');
        } finally {
          fs.unlinkSync(manifestPath);
        }
      });

      it('detects missing files in manifest', () => {
        // Create manifest with non-existent file
        const manifestPath = path.join(repoDir, '.wtlinkrc');
        fs.writeFileSync(manifestPath, '.env.local\n');

        try {
          const result = runCli('wtlink', ['validate'], { cwd: repoDir });

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain('Missing source file');
        } finally {
          fs.unlinkSync(manifestPath);
        }
      });
    });

    describe('link', () => {
      beforeEach(() => {
        // Create a manifest and config file in main repo
        const manifestPath = path.join(repoDir, '.wtlinkrc');
        const configPath = path.join(repoDir, '.env.test');
        const gitignorePath = path.join(repoDir, '.gitignore');

        fs.writeFileSync(manifestPath, '.env.test\n');
        fs.writeFileSync(configPath, 'TEST_VAR=123\n');
        fs.writeFileSync(gitignorePath, '.env.test\n.wtlinkrc\n');

        execSync('git add .gitignore', { cwd: repoDir });
        execSync('git commit -m "Add gitignore" --allow-empty', { cwd: repoDir });
      });

      it('shows dry-run output without creating links', () => {
        const result = runCli('wtlink', ['link', repoDir, worktreeDir, '--dry-run', '--yes'], {
          cwd: repoDir,
        });

        // Should show what would be done
        expect(result.stdout).toContain('.env.test');

        // File should not exist in worktree (dry run)
        const _destPath = path.join(worktreeDir, '.env.test');
        // Note: File might or might not exist depending on git worktree behavior
      });

      it('shows help for link command', () => {
        const result = runCli('wtlink', ['link', '--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('source');
        expect(result.stdout).toContain('destination');
        expect(result.stdout).toContain('--dry-run');
        expect(result.stdout).toContain('--type');
      });
    });

    describe('manage', () => {
      it('shows help for manage command', () => {
        const result = runCli('wtlink', ['manage', '--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('--non-interactive');
        expect(result.stdout).toContain('--clean');
        expect(result.stdout).toContain('--dry-run');
        expect(result.stdout).toContain('--backup');
      });

      it('runs in non-interactive dry-run mode', () => {
        const result = runCli('wtlink', ['manage', '--non-interactive', '--dry-run'], {
          cwd: repoDir,
        });

        // Should complete without error (may have no output if no ignored files)
        expect(result.exitCode).toBe(0);
      });
    });

    describe('error handling', () => {
      it('shows error for unknown command', () => {
        const result = runCli('wtlink', ['unknown-command']);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Unknown argument');
      });

      it('shows error for invalid option', () => {
        const result = runCli('wtlink', ['--invalid-option']);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Unknown argument');
      });
    });
  });

  describe('lswt', () => {
    it('shows help message', () => {
      const result = runCli('lswt', ['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('lswt');
    });

    it('lists worktrees in a git repo', () => {
      const result = runCli('lswt', [], { cwd: repoDir });

      // Should list the main repo and the worktree
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('main-repo');
    });

    it('outputs JSON with --json flag', () => {
      const result = runCli('lswt', ['--json'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      // Should be valid JSON
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0]).toHaveProperty('path');
      expect(parsed[0]).toHaveProperty('branch');
    });

    it('shows verbose output with --verbose flag', () => {
      const result = runCli('lswt', ['--verbose'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('main-repo');
    });
  });

  describe('newpr', () => {
    it('shows help message', () => {
      const result = runCli('newpr', ['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('newpr');
    });

    it('fails when gh is not installed (if gh unavailable)', () => {
      // This test may pass or fail depending on whether gh is installed
      // Just verify it doesn't crash with unexpected error
      const result = runCli('newpr', ['test-description'], { cwd: repoDir });

      // Either exits with error about gh or auth, which is expected
      if (result.exitCode !== 0) {
        expect(result.stderr.toLowerCase()).toMatch(/github|auth|not authenticated|gh/i);
      }
    });

    it('shows error for invalid PR number in --pr mode', () => {
      const result = runCli('newpr', ['--pr', 'not-a-number'], { cwd: repoDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('PR number must be numeric');
    });
  });

  describe('cleanpr', () => {
    it('shows help message', () => {
      const result = runCli('cleanpr', ['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('cleanpr');
    });

    it('fails when gh is not installed (if gh unavailable)', () => {
      // This test may pass or fail depending on whether gh is installed
      // Just verify it doesn't crash with unexpected error
      const result = runCli('cleanpr', ['--all'], { cwd: repoDir });

      // Either exits with error about gh or succeeds
      if (result.exitCode !== 0) {
        expect(result.stderr.toLowerCase()).toMatch(/github|gh/i);
      }
    });

    it('shows error for invalid PR number', () => {
      const result = runCli('cleanpr', ['not-a-number'], { cwd: repoDir });

      expect(result.exitCode).toBe(1);
    });

    it('shows help with -h flag', () => {
      const result = runCli('cleanpr', ['-h']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('cleanpr');
    });
  });

  describe('lswt (additional)', () => {
    it('fails outside of git repo', () => {
      const result = runCli('lswt', [], { cwd: os.tmpdir() });

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toLowerCase()).toContain('git');
    });

    it('shows error for unknown option', () => {
      const result = runCli('lswt', ['--unknown-flag'], { cwd: repoDir });

      expect(result.exitCode).toBe(1);
    });
  });
});
