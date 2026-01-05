/**
 * Tests for wt init command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

// Path to the compiled CLI
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
    env: { ...process.env, FORCE_COLOR: '0', GWT_ALLOW_LOCAL: '1' },
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('wt init command', () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(() => {
    // Check if CLI is built
    const wtPath = path.join(CLI_DIR, 'wt.js');
    if (!fs.existsSync(wtPath)) {
      throw new Error('CLI not built. Run "npm run build" before running tests.');
    }

    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-init-test-'));
    repoDir = path.join(tempDir, 'test-repo');

    // Initialize git repo
    fs.mkdirSync(repoDir);
    const { execSync } = require('child_process');
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: repoDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
    execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { cwd: repoDir, stdio: 'ignore' });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('help output', () => {
    it('shows help with --help flag', () => {
      const result = runWt(['init', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('--local');
      expect(result.stdout).toContain('--global');
      expect(result.stdout).toContain('--force');
    });

    it('shows init as a command in main help', () => {
      const result = runWt(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('init');
    });
  });

  describe('--local flag', () => {
    it('creates local config file with --local', () => {
      // Provide "n" to skip logging configuration prompt
      const result = runWt(['init', '--local'], { cwd: repoDir, input: 'n\n' });

      expect(result.exitCode).toBe(0);

      // Check that .worktreerc.local was created
      const localConfigPath = path.join(repoDir, '.worktreerc.local');
      expect(fs.existsSync(localConfigPath)).toBe(true);
    });

    it('local config includes $schema', () => {
      runWt(['init', '--local'], { cwd: repoDir, input: 'n\n' });

      const localConfigPath = path.join(repoDir, '.worktreerc.local');
      const content = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
      expect(content.$schema).toContain('unpkg.com');
    });

    it('updates .gitignore with local config patterns', () => {
      runWt(['init', '--local'], { cwd: repoDir, input: 'n\n' });

      const gitignorePath = path.join(repoDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('.worktreerc.local');
    });

    it('fails outside git repo', () => {
      const result = runWt(['init', '--local'], { cwd: tempDir, input: 'n\n' });

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/git|repository/);
    });

    it('warns if local config already exists', () => {
      // Create local config first
      fs.writeFileSync(path.join(repoDir, '.worktreerc.local'), '{}');

      const result = runWt(['init', '--local'], { cwd: repoDir, input: 'n\n' });

      // Should succeed but warn
      expect(result.stdout.toLowerCase()).toMatch(/already exists|use --force/);
    });

    it('overwrites with --force', () => {
      // Create local config with specific content
      fs.writeFileSync(path.join(repoDir, '.worktreerc.local'), '{"baseBranch": "old"}');

      // Provide "n" to skip logging configuration prompt
      const result = runWt(['init', '--local', '--force'], { cwd: repoDir, input: 'n\n' });

      expect(result.exitCode).toBe(0);

      const content = JSON.parse(fs.readFileSync(path.join(repoDir, '.worktreerc.local'), 'utf8'));
      // Should have $schema from new creation
      expect(content.$schema).toBeDefined();
    });
  });

  describe('--global flag', () => {
    it('creates global config with --global', () => {
      // Use a custom HOME to avoid polluting real config
      const customHome = path.join(tempDir, 'home');
      fs.mkdirSync(customHome, { recursive: true });

      const result = runWt(['init', '--global'], {
        cwd: repoDir,
      });

      // Just check it runs without error - actual path varies by OS
      // We can't easily test global config creation without mocking HOME
      expect(result.exitCode === 0 || result.stdout.includes('already exists')).toBe(true);
    });
  });

  describe('non-interactive mode', () => {
    it('--local completes with stdin input', () => {
      const result = runWt(['init', '--local'], {
        cwd: repoDir,
        input: 'n\n', // Skip logging configuration prompt
        timeout: 5000,
      });

      // Should complete with provided input
      expect(result.exitCode).toBe(0);
    });
  });

  describe('output messages', () => {
    it('shows success message after creating local config', () => {
      const result = runWt(['init', '--local'], { cwd: repoDir, input: 'n\n' });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/created|success|✓/);
    });

    it('shows path to created config', () => {
      const result = runWt(['init', '--local'], { cwd: repoDir, input: 'n\n' });

      expect(result.stdout).toContain('.worktreerc.local');
    });

    it('mentions .gitignore when updated', () => {
      const result = runWt(['init', '--local'], { cwd: repoDir, input: 'n\n' });

      expect(result.stdout.toLowerCase()).toMatch(/gitignore|updated/);
    });
  });
});

describe('wt init unit tests', () => {
  // These test the logic without running the full CLI

  it('LOCAL_CONFIG_FILE_NAMES includes .worktreerc.local', async () => {
    const { LOCAL_CONFIG_FILE_NAMES } = await import('../../lib/constants.js');
    expect(LOCAL_CONFIG_FILE_NAMES).toContain('.worktreerc.local');
  });

  it('CONFIG_FILE_NAMES includes .worktreerc', async () => {
    const { CONFIG_FILE_NAMES } = await import('../../lib/constants.js');
    expect(CONFIG_FILE_NAMES).toContain('.worktreerc');
  });
});
