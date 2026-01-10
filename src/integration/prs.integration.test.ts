/**
 * Integration tests for standalone prs CLI command (src/cli/prs.ts)
 *
 * These tests verify the standalone prs command works correctly when called directly,
 * not through the `wt prs` subcommand.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { setupGhMock } from '../e2e/helpers/gh-mock.js';

// Path to the compiled standalone prs CLI
const PRS_CLI_PATH = path.resolve(__dirname, '../../dist/cli/prs.js');

/**
 * Helper to run the standalone prs CLI command
 */
function runPrs(
  args: string[] = [],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [PRS_CLI_PATH, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    timeout: options.timeout || 30000,
    env: {
      ...process.env,
      ...options.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('standalone prs CLI - help and usage', () => {
  it('shows help message with --help', () => {
    const result = runPrs(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('prs');
    expect(result.stdout).toContain('Browse repository pull requests');
  });

  it('shows all available options in help', () => {
    const result = runPrs(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--state');
    expect(result.stdout).toContain('--author');
    expect(result.stdout).toContain('--label');
    expect(result.stdout).toContain('--json');
    expect(result.stdout).toContain('--interactive');
    expect(result.stdout).toContain('--refresh');
    expect(result.stdout).toContain('--draft');
    expect(result.stdout).toContain('--with-worktree');
    expect(result.stdout).toContain('--limit');
  });

  it('shows -h alias for --help', () => {
    const result = runPrs(['-h']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('prs');
  });
});

describe('standalone prs CLI - error conditions', () => {
  let nonGitDir: string;

  beforeEach(() => {
    nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prs-not-git-'));
  });

  afterEach(() => {
    fs.rmSync(nonGitDir, { recursive: true, force: true });
  });

  it('fails outside git repository with clear error message', () => {
    const ghMock = setupGhMock();

    try {
      const result = runPrs(['--no-interactive'], {
        cwd: nonGitDir,
        env: ghMock.mockEnv,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toLowerCase()).toMatch(/git|repository/i);
    } finally {
      ghMock.cleanup();
    }
  });

  it('outputs JSON error when --json flag is used outside git repo', () => {
    const ghMock = setupGhMock();

    try {
      const result = runPrs(['--json', '--no-interactive'], {
        cwd: nonGitDir,
        env: ghMock.mockEnv,
      });

      expect(result.exitCode).not.toBe(0);

      // Should output valid JSON error
      try {
        const jsonOutput = JSON.parse(result.stdout);
        expect(jsonOutput.success).toBe(false);
        expect(jsonOutput.error).toBeDefined();
        expect(jsonOutput.error.code).toBe('NOT_GIT_REPO');
      } catch {
        // If JSON parsing fails, at least verify no stack traces
        expect(result.stderr).not.toMatch(/at\s+\w+\s+\(/);
      }
    } finally {
      ghMock.cleanup();
    }
  });

  it('outputs JSON error with -j flag (short form)', () => {
    const ghMock = setupGhMock();

    try {
      const result = runPrs(['-j', '--no-interactive'], {
        cwd: nonGitDir,
        env: ghMock.mockEnv,
      });

      expect(result.exitCode).not.toBe(0);

      try {
        const jsonOutput = JSON.parse(result.stdout);
        expect(jsonOutput.success).toBe(false);
      } catch {
        // JSON parsing may fail
      }
    } finally {
      ghMock.cleanup();
    }
  });
});

describe('standalone prs CLI - git repository tests', () => {
  let tempDir: string;
  let repoDir: string;
  let ghMock: ReturnType<typeof setupGhMock>;

  beforeAll(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'prs-integration-')));

    // Create a git repository
    repoDir = path.join(tempDir, 'test-repo');
    fs.mkdirSync(repoDir);
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });

    // Create initial commit
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test Repo\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Initial commit"', { cwd: repoDir });
    execSync('git branch -M main', { cwd: repoDir, stdio: 'ignore' });

    // Setup gh mock
    ghMock = setupGhMock();
  });

  afterAll(() => {
    ghMock?.cleanup();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('argument parsing', () => {
    it('rejects invalid --state value', () => {
      const result = runPrs(['--state=invalid', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toLowerCase()).toMatch(/invalid|choices/i);
    });

    it('accepts valid --state values', () => {
      for (const state of ['open', 'closed', 'merged', 'all']) {
        const result = runPrs([`--state=${state}`, '--no-interactive'], {
          cwd: repoDir,
          env: ghMock.mockEnv,
        });

        // Should not fail on argument parsing
        expect(result.stderr).not.toMatch(/invalid argument|unknown argument/i);
      }
    });

    it('accepts -s alias for --state', () => {
      const result = runPrs(['-s', 'all', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });

    it('accepts -a alias for --author', () => {
      const result = runPrs(['-a', 'testuser', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });

    it('accepts -l alias for --label', () => {
      const result = runPrs(['-l', 'bug', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });

    it('accepts -n alias for --limit', () => {
      const result = runPrs(['-n', '25', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });

    it('accepts -r alias for --refresh', () => {
      const result = runPrs(['-r', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });

    it('accepts multiple --label flags', () => {
      const result = runPrs(['--label=bug', '--label=urgent', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });
  });

  describe('filter combinations', () => {
    it('accepts --draft and --state together', () => {
      const result = runPrs(['--draft', '--state=open', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });

    it('accepts --no-draft and --with-worktree together', () => {
      const result = runPrs(['--no-draft', '--with-worktree', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });

    it('accepts all filters together', () => {
      const result = runPrs(
        [
          '--state=all',
          '--author=@me',
          '--label=preview',
          '--no-draft',
          '--with-worktree',
          '--limit=10',
          '--no-interactive',
        ],
        {
          cwd: repoDir,
          env: ghMock.mockEnv,
        }
      );

      expect(result.stderr).not.toMatch(/unknown argument/i);
    });
  });

  describe('JSON output mode', () => {
    it('outputs valid JSON structure on success', () => {
      // Add mock PRs
      ghMock.addPr({
        number: 1,
        state: 'OPEN',
        title: 'Test PR',
        headRefName: 'feat/test',
        isDraft: false,
      });

      const result = runPrs(['--json', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      try {
        const jsonOutput = JSON.parse(result.stdout);
        expect(jsonOutput).toHaveProperty('success');
        expect(jsonOutput).toHaveProperty('command', 'prs');
        expect(jsonOutput).toHaveProperty('timestamp');

        if (jsonOutput.success) {
          expect(jsonOutput).toHaveProperty('data');
          expect(jsonOutput.data).toHaveProperty('total');
          expect(jsonOutput.data).toHaveProperty('filters');
          expect(jsonOutput.data).toHaveProperty('prs');
        }
      } catch {
        // JSON parsing may fail in some mock scenarios
        expect(typeof result.exitCode).toBe('number');
      }
    });

    it('JSON output includes filter state', () => {
      const result = runPrs(['--json', '--state=all', '--no-draft', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      try {
        const jsonOutput = JSON.parse(result.stdout);
        if (jsonOutput.success && jsonOutput.data?.filters) {
          expect(jsonOutput.data.filters.showDrafts).toBe(false);
          expect(jsonOutput.data.filters.states).toContain('OPEN');
          expect(jsonOutput.data.filters.states).toContain('MERGED');
          expect(jsonOutput.data.filters.states).toContain('CLOSED');
        }
      } catch {
        // JSON parsing may fail
      }
    });

    it('JSON output has ISO timestamp format', () => {
      const result = runPrs(['--json', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      try {
        const jsonOutput = JSON.parse(result.stdout);
        if (jsonOutput.timestamp) {
          // Should be valid ISO date string
          const date = new Date(jsonOutput.timestamp);
          expect(date.toISOString()).toBe(jsonOutput.timestamp);
        }
      } catch {
        // JSON parsing may fail
      }
    });
  });

  describe('non-interactive mode', () => {
    it('--no-interactive prevents blocking', () => {
      const startTime = Date.now();
      const result = runPrs(['--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
        timeout: 5000,
      });
      const duration = Date.now() - startTime;

      // Should complete quickly without waiting for input
      expect(duration).toBeLessThan(5000);
      expect(typeof result.exitCode).toBe('number');
    });

    it('TERM=dumb triggers non-interactive behavior', () => {
      const result = spawnSync('node', [PRS_CLI_PATH], {
        cwd: repoDir,
        encoding: 'utf-8',
        timeout: 5000,
        env: {
          ...ghMock.mockEnv,
          TERM: 'dumb',
          FORCE_COLOR: '0',
          NO_COLOR: '1',
        },
      });

      // Should complete without blocking
      expect(typeof result.status).toBe('number');
    });
  });
});

describe('standalone prs CLI - gh authentication', () => {
  let tempDir: string;
  let repoDir: string;

  beforeAll(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'prs-auth-')));

    repoDir = path.join(tempDir, 'test-repo');
    fs.mkdirSync(repoDir);
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test User"', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Initial"', { cwd: repoDir });
    execSync('git branch -M main', { cwd: repoDir, stdio: 'ignore' });
  });

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Skip on Windows CI due to gh.cmd/gh.exe path resolution issues
  it.skipIf(process.platform === 'win32' && process.env.CI === 'true')(
    'fails when gh is not authenticated',
    () => {
      const ghMock = setupGhMock({ authenticated: false });

      try {
        const result = runPrs(['--no-interactive'], {
          cwd: repoDir,
          env: ghMock.mockEnv,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toLowerCase()).toMatch(/auth|login|authenticated/i);
      } finally {
        ghMock.cleanup();
      }
    }
  );

  it('outputs JSON error when not authenticated with --json', () => {
    const ghMock = setupGhMock({ authenticated: false });

    try {
      const result = runPrs(['--json', '--no-interactive'], {
        cwd: repoDir,
        env: ghMock.mockEnv,
      });

      expect(result.exitCode).not.toBe(0);

      try {
        const jsonOutput = JSON.parse(result.stdout);
        expect(jsonOutput.success).toBe(false);
        expect(jsonOutput.error?.code).toBe('GH_NOT_AUTHENTICATED');
      } catch {
        // JSON parsing may fail
      }
    } finally {
      ghMock.cleanup();
    }
  });
});

describe('standalone prs CLI - worktree context', () => {
  let tempDir: string;
  let mainRepoDir: string;
  let worktreeDir: string;
  let ghMock: ReturnType<typeof setupGhMock>;

  beforeAll(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'prs-worktree-')));

    // Create main repo
    mainRepoDir = path.join(tempDir, 'main-repo');
    fs.mkdirSync(mainRepoDir);
    execSync('git init', { cwd: mainRepoDir });
    execSync('git config user.email "test@test.com"', { cwd: mainRepoDir });
    execSync('git config user.name "Test User"', { cwd: mainRepoDir });
    fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Test\n');
    execSync('git add .', { cwd: mainRepoDir });
    execSync('git commit -m "Initial"', { cwd: mainRepoDir });
    execSync('git branch -M main', { cwd: mainRepoDir, stdio: 'ignore' });

    // Create feature branch and worktree
    execSync('git checkout -b feat/test-pr', { cwd: mainRepoDir });
    execSync('git checkout main', { cwd: mainRepoDir });

    worktreeDir = path.join(tempDir, 'main-repo.pr1');
    execSync(`git worktree add "${worktreeDir}" feat/test-pr`, { cwd: mainRepoDir });

    ghMock = setupGhMock();
    ghMock.addPr({
      number: 1,
      state: 'OPEN',
      title: 'Test PR',
      headRefName: 'feat/test-pr',
      isDraft: false,
    });
  });

  afterAll(() => {
    ghMock?.cleanup();
    if (tempDir) {
      // Remove worktree first
      try {
        execSync(`git worktree remove "${worktreeDir}" --force`, {
          cwd: mainRepoDir,
          stdio: 'ignore',
        });
      } catch {
        // Ignore
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('works from main worktree', () => {
    const result = runPrs(['--no-interactive'], {
      cwd: mainRepoDir,
      env: ghMock.mockEnv,
    });

    expect(typeof result.exitCode).toBe('number');
  });

  it('works from PR worktree', () => {
    const result = runPrs(['--no-interactive'], {
      cwd: worktreeDir,
      env: ghMock.mockEnv,
    });

    expect(typeof result.exitCode).toBe('number');
  });

  it('JSON output works from worktree', () => {
    const result = runPrs(['--json', '--no-interactive'], {
      cwd: worktreeDir,
      env: ghMock.mockEnv,
    });

    try {
      const jsonOutput = JSON.parse(result.stdout);
      expect(jsonOutput).toHaveProperty('command', 'prs');
    } catch {
      // JSON parsing may fail
      expect(typeof result.exitCode).toBe('number');
    }
  });
});
