import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import type { Scenario } from '../../lib/state-detection.js';
import { setupGhMock, type GhMockSetup, type GhMockOptions } from './gh-mock.js';
import { createScenario, type ScenarioSetup, type ScenarioOptions } from './scenario-harness.js';
import { ensureCliBuildSync } from './cli-runner.js';

/**
 * Options for creating a test context
 */
export interface TestContextOptions {
  /** Scenario to create (if provided, creates a scenario-specific repo) */
  scenario?: Scenario;
  /** Options for the scenario */
  scenarioOptions?: ScenarioOptions;
  /** Options for the gh mock */
  ghMockOptions?: GhMockOptions;
  /** Skip the gh mock (for tests that don't need it) */
  skipGhMock?: boolean;
  /** Create a bare minimum repo instead of a full scenario */
  minimalRepo?: boolean;
}

/**
 * Test context containing all test resources
 */
export interface TestContext {
  /** Temp directory containing all test resources */
  tempDir: string;
  /** Path to the test repository */
  repoDir: string;
  /** Path to the origin (bare) repository */
  originDir?: string;
  /** Path to worktree (if created) */
  worktreeDir?: string;
  /** The scenario that was created (if any) */
  scenario?: Scenario;
  /** The gh mock setup */
  ghMock?: GhMockSetup;
  /** Environment variables to use when running CLI commands */
  env: NodeJS.ProcessEnv;
  /** Clean up all resources */
  cleanup: () => void;
  /** Reset the repo to a clean state */
  reset: () => void;
}

/**
 * Create a minimal git repository for testing
 */
function createMinimalRepo(tempDir: string): { repoDir: string; originDir: string } {
  const originDir = path.join(tempDir, 'origin.git');
  const repoDir = path.join(tempDir, 'repo');

  // Create bare origin
  fs.mkdirSync(originDir);
  execSync('git init --bare', { cwd: originDir, stdio: 'ignore' });

  // Create working repo
  fs.mkdirSync(repoDir);
  execSync('git init', { cwd: repoDir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: repoDir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'ignore' });

  // Create initial commit
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test\n');
  execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
  execSync('git commit -m "Initial commit"', { cwd: repoDir, stdio: 'ignore' });
  execSync('git branch -M main', { cwd: repoDir, stdio: 'ignore' });

  // Add origin and push
  execSync(`git remote add origin "${originDir}"`, { cwd: repoDir, stdio: 'ignore' });
  execSync('git push -u origin main', { cwd: repoDir, stdio: 'ignore' });

  return { repoDir, originDir };
}

/**
 * Create a test context with isolated resources
 *
 * @param options - Context options
 * @returns Test context with cleanup
 */
export function createTestContext(options: TestContextOptions = {}): TestContext {
  // Ensure CLI is built
  ensureCliBuildSync();

  let tempDir: string;
  let repoDir: string;
  let originDir: string | undefined;
  let worktreeDir: string | undefined;
  let scenarioSetup: ScenarioSetup | undefined;
  let ghMock: GhMockSetup | undefined;

  // Create scenario or minimal repo
  if (options.scenario) {
    scenarioSetup = createScenario(options.scenario, options.scenarioOptions);
    tempDir = scenarioSetup.tempDir;
    repoDir = scenarioSetup.repoPath;
    originDir = scenarioSetup.originPath;
    worktreeDir = scenarioSetup.worktreePath;
  } else if (options.minimalRepo === false) {
    // Create just a temp directory (no repo)
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-context-'))
    );
    repoDir = tempDir;
  } else {
    // Create minimal repo by default
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-context-'))
    );
    const repos = createMinimalRepo(tempDir);
    repoDir = repos.repoDir;
    originDir = repos.originDir;
  }

  // Set up gh mock
  if (!options.skipGhMock) {
    ghMock = setupGhMock(options.ghMockOptions);
  }

  // Build environment
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(ghMock?.mockEnv || {}),
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  };

  const cleanup = () => {
    // Clean up gh mock first
    ghMock?.cleanup();

    // Clean up scenario or temp dir
    if (scenarioSetup) {
      scenarioSetup.cleanup();
    } else {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  };

  const reset = () => {
    // Reset to clean state on main
    try {
      execSync('git checkout main', { cwd: repoDir, stdio: 'ignore' });
      execSync('git reset --hard origin/main', { cwd: repoDir, stdio: 'ignore' });
      execSync('git clean -fd', { cwd: repoDir, stdio: 'ignore' });
    } catch {
      // Ignore reset errors
    }
  };

  return {
    tempDir,
    repoDir,
    originDir,
    worktreeDir,
    scenario: options.scenario,
    ghMock,
    env,
    cleanup,
    reset,
  };
}

/**
 * Vitest fixture factory for test contexts
 *
 * Usage:
 * ```typescript
 * describe('my tests', () => {
 *   let ctx: TestContext;
 *
 *   beforeAll(() => {
 *     ctx = createTestContext({ scenario: 'main_clean_same' });
 *   });
 *
 *   afterAll(() => {
 *     ctx.cleanup();
 *   });
 *
 *   beforeEach(() => {
 *     ctx.reset();
 *   });
 * });
 * ```
 */
export function useTestContext(options: TestContextOptions = {}): {
  create: () => TestContext;
  cleanup: (ctx: TestContext) => void;
  reset: (ctx: TestContext) => void;
} {
  return {
    create: () => createTestContext(options),
    cleanup: (ctx: TestContext) => ctx.cleanup(),
    reset: (ctx: TestContext) => ctx.reset(),
  };
}

/**
 * Create multiple test contexts for different scenarios
 *
 * @param scenarios - List of scenarios to create
 * @param options - Common options for all contexts
 * @returns Map of scenario to context
 */
export function createMultiScenarioContexts(
  scenarios: Scenario[],
  options: Omit<TestContextOptions, 'scenario'> = {}
): Map<Scenario, TestContext> {
  const contexts = new Map<Scenario, TestContext>();

  for (const scenario of scenarios) {
    contexts.set(scenario, createTestContext({ ...options, scenario }));
  }

  return contexts;
}

/**
 * Clean up all contexts from a map
 *
 * @param contexts - Map of contexts to clean up
 */
export function cleanupAllContexts(contexts: Map<Scenario, TestContext>): void {
  for (const ctx of contexts.values()) {
    ctx.cleanup();
  }
}

/**
 * Helper to add a file to the test repo
 */
export function addFile(
  ctx: TestContext,
  relativePath: string,
  content: string,
  options: { stage?: boolean; commit?: boolean; message?: string } = {}
): void {
  const fullPath = path.join(ctx.repoDir, relativePath);
  const dir = path.dirname(fullPath);

  // Create directory if needed
  fs.mkdirSync(dir, { recursive: true });

  // Write file
  fs.writeFileSync(fullPath, content);

  // Stage if requested
  if (options.stage || options.commit) {
    execSync(`git add "${relativePath}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
  }

  // Commit if requested
  if (options.commit) {
    const message = options.message || `Add ${relativePath}`;
    execSync(`git commit -m "${message}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
  }
}

/**
 * Helper to create a branch in the test repo
 */
export function createBranch(
  ctx: TestContext,
  branchName: string,
  options: { checkout?: boolean; from?: string } = {}
): void {
  if (options.from) {
    execSync(`git branch "${branchName}" "${options.from}"`, {
      cwd: ctx.repoDir,
      stdio: 'ignore',
    });
  } else {
    execSync(`git branch "${branchName}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
  }

  if (options.checkout) {
    execSync(`git checkout "${branchName}"`, { cwd: ctx.repoDir, stdio: 'ignore' });
  }
}

/**
 * Helper to create a worktree in the test repo
 */
export function createWorktree(
  ctx: TestContext,
  worktreePath: string,
  branchName: string,
  options: { create?: boolean } = {}
): string {
  const fullPath = path.isAbsolute(worktreePath)
    ? worktreePath
    : path.join(ctx.tempDir, worktreePath);

  if (options.create) {
    execSync(`git worktree add -b "${branchName}" "${fullPath}"`, {
      cwd: ctx.repoDir,
      stdio: 'ignore',
    });
  } else {
    execSync(`git worktree add "${fullPath}" "${branchName}"`, {
      cwd: ctx.repoDir,
      stdio: 'ignore',
    });
  }

  return fullPath;
}

/**
 * Helper to get git status info
 */
export function getGitStatus(ctx: TestContext): {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
} {
  const branch = execSync('git branch --show-current', {
    cwd: ctx.repoDir,
    encoding: 'utf8',
  }).trim();

  const status = execSync('git status --porcelain', {
    cwd: ctx.repoDir,
    encoding: 'utf8',
  });

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of status.split('\n')) {
    if (!line) continue;
    const indexStatus = line[0];
    const workStatus = line[1];
    const file = line.slice(3);

    if (indexStatus === '?' && workStatus === '?') {
      untracked.push(file);
    } else {
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push(file);
      }
      if (workStatus !== ' ' && workStatus !== '?') {
        unstaged.push(file);
      }
    }
  }

  return { branch, staged, unstaged, untracked };
}
