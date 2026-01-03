import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Full flow E2E tests for newpr CLI with uncommitted files.
 *
 * These tests verify the complete workflow:
 * 1. User has uncommitted files in main worktree
 * 2. User runs `newpr "description"` and selects option to commit files
 * 3. Files are moved to new PR branch and worktree is created
 *
 * GitHub CLI calls are mocked via NEWPR_MOCK_GITHUB=1 environment variable.
 */

const CLI_DIR = path.resolve(__dirname, '../../dist/cli');

// Helper to run a CLI command with simulated input
function runCli(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string;
    input?: string;
    env?: Record<string, string>;
  } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const scriptPath = path.join(CLI_DIR, `${command}.js`);

  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    input: options.input,
    env: {
      ...process.env,
      FORCE_COLOR: '0', // Disable colors for consistent output
      NEWPR_MOCK_GITHUB: '1', // Enable GitHub mock mode
      ...options.env,
    },
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

// Helper to run git commands (using spawnSync for proper argument handling)
function git(args: string[], cwd: string): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return (result.stdout || '').trim();
}

describe('newpr full flow e2e tests', () => {
  let tempDir: string;
  let mainRepoDir: string;
  let bareOriginDir: string;

  beforeAll(() => {
    // Ensure CLI is built
    const newprPath = path.join(CLI_DIR, 'newpr.js');
    if (!fs.existsSync(newprPath)) {
      throw new Error('CLI not built. Run "npm run build" before running e2e tests.');
    }
  });

  beforeEach(() => {
    // Create fresh temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newpr-fullflow-'));

    // Create bare origin repository (simulates GitHub remote)
    // Name it 'main-repo.git' so getRepoName extracts 'main-repo'
    bareOriginDir = path.join(tempDir, 'main-repo.git');
    fs.mkdirSync(bareOriginDir);
    git(['init', '--bare'], bareOriginDir);

    // Create main repository
    mainRepoDir = path.join(tempDir, 'main-repo');
    fs.mkdirSync(mainRepoDir);
    git(['init', '-b', 'main'], mainRepoDir);
    git(['config', 'user.email', 'test@test.com'], mainRepoDir);
    git(['config', 'user.name', 'Test User'], mainRepoDir);

    // Add remote pointing to bare origin
    git(['remote', 'add', 'origin', bareOriginDir], mainRepoDir);

    // Create initial commit
    fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Test Repo\n');
    git(['add', '.'], mainRepoDir);
    git(['commit', '-m', 'Initial commit'], mainRepoDir);

    // Push to origin and set up tracking
    git(['push', '-u', 'origin', 'main'], mainRepoDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('main_unstaged_same scenario', () => {
    it('stages and commits uncommitted files when user selects option 1', () => {
      // Create an uncommitted file
      const featureFile = path.join(mainRepoDir, 'feature.ts');
      fs.writeFileSync(featureFile, 'export const feature = () => "hello";\n');

      // Verify initial state - file is untracked
      const statusBefore = git(['status', '--porcelain'], mainRepoDir);
      expect(statusBefore).toContain('?? feature.ts');

      // Run newpr with simulated input "1\n" to select option 1
      // Option 1 = "Stage all and commit to the new PR branch"
      const result = runCli('newpr', ['my-new-feature'], {
        cwd: mainRepoDir,
        input: '1\n',
      });

      // Should succeed
      expect(result.exitCode).toBe(0);

      // Verify PR was "created" (mocked)
      expect(result.stdout).toMatch(/PR #\d+/);
      expect(result.stdout).toContain('worktree ready');

      // Verify a worktree was created
      const worktreePath = path.join(tempDir, 'main-repo.pr1');
      expect(fs.existsSync(worktreePath)).toBe(true);

      // Verify the feature file exists in the worktree
      const worktreeFeatureFile = path.join(worktreePath, 'feature.ts');
      expect(fs.existsSync(worktreeFeatureFile)).toBe(true);
      expect(fs.readFileSync(worktreeFeatureFile, 'utf-8')).toContain('export const feature');
    });

    it('preserves file content through the entire workflow', () => {
      // Create multiple uncommitted files
      fs.mkdirSync(path.join(mainRepoDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(mainRepoDir, 'src/index.ts'), 'export * from "./utils";\n');
      fs.writeFileSync(
        path.join(mainRepoDir, 'src/utils.ts'),
        'export const utils = { version: "1.0.0" };\n'
      );
      fs.writeFileSync(
        path.join(mainRepoDir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2)
      );

      // Run newpr with option 1
      const result = runCli('newpr', ['add-utils-module'], {
        cwd: mainRepoDir,
        input: '1\n',
      });

      expect(result.exitCode).toBe(0);

      // Verify all files exist in the worktree with correct content
      const worktreePath = path.join(tempDir, 'main-repo.pr1');

      const indexContent = fs.readFileSync(path.join(worktreePath, 'src/index.ts'), 'utf-8');
      expect(indexContent).toBe('export * from "./utils";\n');

      const utilsContent = fs.readFileSync(path.join(worktreePath, 'src/utils.ts'), 'utf-8');
      expect(utilsContent).toBe('export const utils = { version: "1.0.0" };\n');

      const pkgContent = JSON.parse(
        fs.readFileSync(path.join(worktreePath, 'package.json'), 'utf-8')
      );
      expect(pkgContent.name).toBe('test');
    });
  });

  describe('main_staged_same scenario', () => {
    it('commits already staged files when user selects option 1', () => {
      // Create and stage a file
      const featureFile = path.join(mainRepoDir, 'staged-feature.ts');
      fs.writeFileSync(featureFile, 'export const staged = true;\n');
      git(['add', 'staged-feature.ts'], mainRepoDir);

      // Verify file is staged
      const statusBefore = git(['status', '--porcelain'], mainRepoDir);
      expect(statusBefore).toContain('A  staged-feature.ts');

      // Run newpr with option 1
      // Option 1 for staged = "Commit staged changes to the new PR branch"
      const result = runCli('newpr', ['staged-feature'], {
        cwd: mainRepoDir,
        input: '1\n',
      });

      expect(result.exitCode).toBe(0);

      // Verify worktree has the file
      const worktreePath = path.join(tempDir, 'main-repo.pr1');
      const worktreeFile = path.join(worktreePath, 'staged-feature.ts');
      expect(fs.existsSync(worktreeFile)).toBe(true);
      expect(fs.readFileSync(worktreeFile, 'utf-8')).toBe('export const staged = true;\n');
    });
  });

  describe('main_both_same scenario', () => {
    it('stages all and commits when user selects option 2', () => {
      // Create one staged file
      const stagedFile = path.join(mainRepoDir, 'staged.ts');
      fs.writeFileSync(stagedFile, 'export const staged = 1;\n');
      git(['add', 'staged.ts'], mainRepoDir);

      // Create one unstaged file
      const unstagedFile = path.join(mainRepoDir, 'unstaged.ts');
      fs.writeFileSync(unstagedFile, 'export const unstaged = 2;\n');

      // Verify initial state
      const statusBefore = git(['status', '--porcelain'], mainRepoDir);
      expect(statusBefore).toContain('A  staged.ts');
      expect(statusBefore).toContain('?? unstaged.ts');

      // Run newpr with option 2 ("Stage all and commit everything to the new PR branch")
      // Options for main_both_same:
      // 1. Commit staged to PR branch, move unstaged to new worktree
      // 2. Stage all and commit everything to the new PR branch
      // 3. Leave all changes here and continue with empty initial commit
      // 4. Stash all changes (will restore after)
      // 5. Cancel
      const result = runCli('newpr', ['both-changes'], {
        cwd: mainRepoDir,
        input: '2\n',
      });

      expect(result.exitCode).toBe(0);

      // Verify both files exist in worktree
      const worktreePath = path.join(tempDir, 'main-repo.pr1');
      expect(fs.existsSync(path.join(worktreePath, 'staged.ts'))).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, 'unstaged.ts'))).toBe(true);
    });
  });

  describe('origin/main ahead scenario (bug regression)', () => {
    it('preserves staged changes when origin/main has moved ahead', () => {
      // Push an upstream commit (simulating origin/main moving ahead)
      const tempClone = path.join(tempDir, 'temp-clone');
      git(['clone', '-b', 'main', bareOriginDir, 'temp-clone'], tempDir);
      git(['config', 'user.email', 'upstream@test.com'], tempClone);
      git(['config', 'user.name', 'Upstream User'], tempClone);
      fs.writeFileSync(path.join(tempClone, 'upstream-change.txt'), 'upstream content\n');
      git(['add', '.'], tempClone);
      git(['commit', '-m', 'Upstream commit'], tempClone);
      git(['push', 'origin', 'main'], tempClone);
      fs.rmSync(tempClone, { recursive: true, force: true });

      // Fetch in main repo so origin/main is ahead
      git(['fetch', 'origin'], mainRepoDir);

      // Verify origin/main is ahead
      const localHead = git(['rev-parse', 'HEAD'], mainRepoDir);
      const originHead = git(['rev-parse', 'origin/main'], mainRepoDir);
      expect(localHead).not.toBe(originHead);

      // Create an uncommitted file in main repo
      const featureFile = path.join(mainRepoDir, 'my-feature.ts');
      fs.writeFileSync(featureFile, 'export const myFeature = () => {};\n');

      // Run newpr with option 1
      const result = runCli('newpr', ['feature-with-origin-ahead'], {
        cwd: mainRepoDir,
        input: '1\n',
      });

      expect(result.exitCode).toBe(0);

      // KEY ASSERTION: The file should exist in the worktree
      // This verifies the fix for branchFrom: 'head' instead of 'origin_main'
      const worktreePath = path.join(tempDir, 'main-repo.pr1');
      const worktreeFeatureFile = path.join(worktreePath, 'my-feature.ts');
      expect(fs.existsSync(worktreeFeatureFile)).toBe(true);
      expect(fs.readFileSync(worktreeFeatureFile, 'utf-8')).toContain('myFeature');
    });
  });

  describe('running from subdirectory', () => {
    it('stages all files when run from a subdirectory', () => {
      // Create files in different directories
      fs.mkdirSync(path.join(mainRepoDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(mainRepoDir, 'docs'), { recursive: true });

      fs.writeFileSync(path.join(mainRepoDir, 'src/code.ts'), 'export const code = 1;\n');
      fs.writeFileSync(path.join(mainRepoDir, 'docs/README.md'), '# Docs\n');
      fs.writeFileSync(path.join(mainRepoDir, 'root-file.txt'), 'root content\n');

      // Run newpr from src/ subdirectory
      const srcDir = path.join(mainRepoDir, 'src');
      const result = runCli('newpr', ['subdir-test'], {
        cwd: srcDir, // Running from subdirectory!
        input: '1\n',
      });

      expect(result.exitCode).toBe(0);

      // Verify ALL files exist in worktree (not just files in src/)
      const worktreePath = path.join(tempDir, 'main-repo.pr1');
      expect(fs.existsSync(path.join(worktreePath, 'src/code.ts'))).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, 'docs/README.md'))).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, 'root-file.txt'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles cancel option gracefully', () => {
      // Create uncommitted file
      fs.writeFileSync(path.join(mainRepoDir, 'test.ts'), 'test\n');

      // Run newpr and select the cancel option (last option)
      // For main_unstaged_same, options are:
      // 1. Stage all and commit to the new PR branch
      // 2. Leave changes here and continue with empty initial commit
      // 3. Stash changes (will restore after)
      // 4. Cancel
      const result = runCli('newpr', ['cancel-test'], {
        cwd: mainRepoDir,
        input: '4\n', // Select cancel (option 4)
      });

      // Should exit with error (aborted by user)
      expect(result.exitCode).toBe(1);
      // Abort message may be in stdout or stderr
      const output = (result.stdout + result.stderr).toLowerCase();
      expect(output).toContain('abort');
    });
  });
});
