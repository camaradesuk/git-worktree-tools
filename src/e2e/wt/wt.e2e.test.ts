/**
 * End-to-end tests for the unified `wt` command
 *
 * Tests the wt command entry point and its subcommands.
 * Note: Interactive menu tests are covered in integration tests since
 * e2e testing of interactive TUI requires more complex setup.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Path to the compiled CLI scripts
const CLI_DIR = path.resolve(__dirname, '../../../dist/cli');

// Helper to run the wt CLI command
function runWt(
  args: string[] = [],
  options: { cwd?: string; input?: string; timeout?: number } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const scriptPath = path.join(CLI_DIR, 'wt.js');

  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    input: options.input,
    timeout: options.timeout || 30000,
    env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for consistent output
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('wt command e2e tests', () => {
  let tempDir: string;
  let repoDir: string;
  let worktreeDir: string;

  beforeAll(() => {
    // Ensure CLI is built
    const wtPath = path.join(CLI_DIR, 'wt.js');
    if (!fs.existsSync(wtPath)) {
      throw new Error('CLI not built. Run "npm run build" before running e2e tests.');
    }

    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-e2e-'));
    repoDir = path.join(tempDir, 'test-repo');
    worktreeDir = path.join(tempDir, 'test-repo.pr99');

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

  describe('help and version', () => {
    it('shows help with --help flag', () => {
      const result = runWt(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wt');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('new');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('clean');
      expect(result.stdout).toContain('state');
      expect(result.stdout).toContain('config');
      expect(result.stdout).toContain('link');
    });

    it('shows help with -h flag', () => {
      const result = runWt(['-h']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wt');
    });

    it('shows version with --version flag', () => {
      const result = runWt(['--version']);

      expect(result.exitCode).toBe(0);
      // Should output a version number
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('wt list (ls)', () => {
    it('lists worktrees', () => {
      const result = runWt(['list'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-repo');
    });

    it('works with ls alias', () => {
      const result = runWt(['ls'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-repo');
    });

    it('outputs JSON with --json flag', () => {
      const result = runWt(['list', '--json'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('shows verbose output with --verbose flag', () => {
      const result = runWt(['list', '--verbose'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-repo');
    });

    it('fails outside git repo', () => {
      const result = runWt(['list'], { cwd: os.tmpdir() });

      expect(result.exitCode).toBe(1);
    });
  });

  describe('wt state (s)', () => {
    it('shows git state', () => {
      const result = runWt(['state'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      // Should show some state information
      expect(result.stdout.toLowerCase()).toMatch(/branch|clean|state/i);
    });

    it('works with s alias', () => {
      const result = runWt(['s'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
    });

    it('outputs JSON with --json flag', () => {
      const result = runWt(['state', '--json'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      // JSON output is wrapped in { success, command, data } structure
      expect(parsed).toHaveProperty('success');
      expect(parsed).toHaveProperty('data');
      expect(parsed.data).toHaveProperty('scenario');
      expect(parsed.data).toHaveProperty('currentBranch');
    });

    it('shows verbose output with --verbose flag', () => {
      const result = runWt(['state', '--verbose'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('wt new (n)', () => {
    it('shows help', () => {
      const result = runWt(['new', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('description');
      expect(result.stdout).toContain('--pr');
      expect(result.stdout).toContain('--branch');
      expect(result.stdout).toContain('--base');
      expect(result.stdout).toContain('--ready');
      expect(result.stdout).toContain('--install');
      expect(result.stdout).toContain('--code');
    });

    it('requires description or --pr flag', () => {
      const result = runWt(['new'], { cwd: repoDir });

      // Should fail asking for description (or show error about GitHub)
      expect(result.exitCode).toBe(1);
    });

    it('validates PR number for --pr flag', () => {
      const result = runWt(['new', '--pr', 'not-a-number'], { cwd: repoDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('PR number must be a positive integer');
    });
  });

  describe('wt clean (c)', () => {
    it('shows help', () => {
      const result = runWt(['clean', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('pr-number');
      expect(result.stdout).toContain('--all');
      expect(result.stdout).toContain('--dry-run');
      expect(result.stdout).toContain('--force');
    });

    it('validates PR number', () => {
      const result = runWt(['clean', 'not-a-number'], { cwd: repoDir });

      expect(result.exitCode).toBe(1);
    });

    it('supports --dry-run flag', () => {
      // Dry run should succeed and just show what would be done
      const result = runWt(['clean', '--all', '--dry-run'], { cwd: repoDir });

      // May fail if gh not available, but shouldn't crash
      // Accept either success or gh-related error
      if (result.exitCode !== 0) {
        expect(result.stderr.toLowerCase()).toMatch(/github|gh|not authenticated/i);
      }
    });
  });

  describe('wt config (cfg)', () => {
    it('shows help', () => {
      const result = runWt(['config', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('subcommand');
    });

    it('shows current config with show subcommand', () => {
      const result = runWt(['config', 'show'], { cwd: repoDir });

      // Should show default config or indicate no config
      expect(result.exitCode).toBe(0);
    });

    it('works with cfg alias', () => {
      const result = runWt(['cfg', 'show'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('wt link (l)', () => {
    it('shows help', () => {
      const result = runWt(['link', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--dry-run');
      expect(result.stdout).toContain('--yes');
    });

    it('validates manifest', () => {
      // Create a test manifest
      const manifestPath = path.join(repoDir, '.wtlinkrc');
      fs.writeFileSync(manifestPath, '# empty manifest\n');

      try {
        const result = runWt(['link', 'validate'], { cwd: repoDir });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('valid');
      } finally {
        fs.unlinkSync(manifestPath);
      }
    });

    it('works with l alias', () => {
      const result = runWt(['l', '--help']);

      expect(result.exitCode).toBe(0);
    });

    it('shows list of linked files', () => {
      // Create a manifest
      const manifestPath = path.join(repoDir, '.wtlinkrc');
      fs.writeFileSync(manifestPath, '# empty\n');

      try {
        const result = runWt(['link', 'list'], { cwd: repoDir });

        // The list command may succeed with empty output or show a message
        // Just check it doesn't crash unexpectedly
        // Exit code 0 or 1 are both acceptable (1 if no files to list)
        expect([0, 1]).toContain(result.exitCode);
      } finally {
        fs.unlinkSync(manifestPath);
      }
    });
  });

  describe('subcommand argument passing', () => {
    it('passes description to newpr', () => {
      // This will fail because of GitHub auth, but we can verify the error
      // message shows that the description was passed correctly
      const result = runWt(['new', 'Add feature X'], { cwd: repoDir });

      // Should fail with GitHub error, not argument parsing error
      if (result.exitCode !== 0) {
        // The error should be about GitHub, not about missing description
        expect(result.stderr).not.toContain('Description required');
      }
    });

    it('passes --base flag correctly', () => {
      const result = runWt(['new', 'Test', '--base', 'develop'], { cwd: repoDir });

      // Should fail with GitHub error, not argument error
      if (result.exitCode !== 0) {
        expect(result.stderr).not.toContain('Unknown argument: base');
      }
    });

    it('passes multiple flags correctly', () => {
      const result = runWt(['new', 'Test', '--base', 'develop', '--ready', '--install'], {
        cwd: repoDir,
      });

      // Should fail with GitHub error, not argument error
      if (result.exitCode !== 0) {
        expect(result.stderr).not.toContain('Unknown argument');
      }
    });
  });

  describe('error handling', () => {
    it('shows error for unknown command', () => {
      const result = runWt(['unknown-command']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown argument');
    });

    it('shows error for invalid option', () => {
      const result = runWt(['list', '--invalid-option']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown argument');
    });

    it('handles missing repo gracefully', () => {
      const result = runWt(['list'], { cwd: os.tmpdir() });

      expect(result.exitCode).toBe(1);
      // Should show git-related error
      expect(result.stderr.toLowerCase()).toMatch(/git|repository/i);
    });
  });

  describe('shell completion', () => {
    it('generates bash completion', () => {
      const result = runWt(['completion', 'bash']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('_wt');
    });

    it('generates zsh completion', () => {
      const result = runWt(['completion', 'zsh']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wt');
    });
  });

  describe('non-interactive mode', () => {
    it('list command with --no-interactive runs without prompts', () => {
      const result = runWt(['list', '--no-interactive'], { cwd: repoDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-repo');
    });

    it('respects TERM=dumb for non-interactive mode', () => {
      const result = spawnSync('node', [path.join(CLI_DIR, 'wt.js'), 'list'], {
        cwd: repoDir,
        encoding: 'utf-8',
        env: { ...process.env, TERM: 'dumb', FORCE_COLOR: '0' },
      });

      expect(result.status).toBe(0);
    });
  });
});

describe('wt worktree directory detection', () => {
  let tempDir: string;
  let mainRepoDir: string;
  let worktreeDir: string;

  beforeAll(() => {
    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-worktree-e2e-'));
    mainRepoDir = path.join(tempDir, 'main-repo');
    worktreeDir = path.join(tempDir, 'main-repo.pr123');

    // Initialize main git repo
    fs.mkdirSync(mainRepoDir);
    execSync('git init', { cwd: mainRepoDir });
    execSync('git config user.email "test@test.com"', { cwd: mainRepoDir });
    execSync('git config user.name "Test User"', { cwd: mainRepoDir });

    // Create initial commit
    fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Test Repo\n');
    execSync('git add .', { cwd: mainRepoDir });
    execSync('git commit -m "Initial commit"', { cwd: mainRepoDir });

    // Create a feature branch and worktree
    execSync('git branch feature/pr-123', { cwd: mainRepoDir });
    execSync(`git worktree add "${worktreeDir}" feature/pr-123`, { cwd: mainRepoDir });
  });

  afterAll(() => {
    // Clean up
    try {
      execSync('git worktree prune', { cwd: mainRepoDir, stdio: 'ignore' });
    } catch {
      // Ignore
    }

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('wt list works from worktree directory', () => {
    const result = runWt(['list', '--json'], { cwd: worktreeDir });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
  });

  it('wt state works from worktree directory', () => {
    const result = runWt(['state', '--json'], { cwd: worktreeDir });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // JSON output is wrapped in { success, data } structure
    expect(parsed).toHaveProperty('success');
    expect(parsed).toHaveProperty('data');
    expect(parsed.data).toHaveProperty('scenario');
  });

  it('identifies worktree correctly', () => {
    const result = runWt(['state', '--json'], { cwd: worktreeDir });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // Should detect we're in a worktree, not main repo
    // JSON output is wrapped in { success, data } structure
    expect(parsed.data.currentBranch).toContain('feature/pr-123');
  });
});
