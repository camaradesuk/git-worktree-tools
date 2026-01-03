import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Scenario } from '../../lib/state-detection.js';

/**
 * Result of creating a scenario
 */
export interface ScenarioSetup {
  /** The scenario that was created */
  scenario: Scenario;
  /** Path to the main working repository */
  repoPath: string;
  /** Path to the bare origin repository */
  originPath: string;
  /** Path to the temp directory (parent of repoPath and originPath) */
  tempDir: string;
  /** Path to a PR worktree (only for pr_worktree scenario) */
  worktreePath?: string;
  /** Clean up all created directories */
  cleanup: () => void;
}

/**
 * Options for creating a scenario
 */
export interface ScenarioOptions {
  /** Base branch name (default: 'main') */
  baseBranch?: string;
  /** User email for git config */
  userEmail?: string;
  /** User name for git config */
  userName?: string;
}

const DEFAULT_OPTIONS: Required<ScenarioOptions> = {
  baseBranch: 'main',
  userEmail: 'test@test.com',
  userName: 'Test User',
};

/**
 * Execute a git command in a directory
 */
function git(args: string, cwd: string, options: { stdio?: 'pipe' | 'ignore' } = {}): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: options.stdio || 'pipe',
    }).trim();
  } catch (error) {
    if (options.stdio === 'ignore') {
      return '';
    }
    throw error;
  }
}

/**
 * Create base repository structure with origin
 */
function createBaseRepo(
  tempDir: string,
  options: Required<ScenarioOptions>
): {
  repoPath: string;
  originPath: string;
} {
  const originPath = path.join(tempDir, 'origin.git');
  const repoPath = path.join(tempDir, 'main-repo');

  // Create bare origin
  fs.mkdirSync(originPath);
  git('init --bare', originPath);

  // Create working repo
  fs.mkdirSync(repoPath);
  git('init', repoPath);
  git(`config user.email "${options.userEmail}"`, repoPath);
  git(`config user.name "${options.userName}"`, repoPath);

  // Create initial commit
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Repository\n');
  git('add .', repoPath);
  git('commit -m "Initial commit"', repoPath);

  // Rename to main branch
  git(`branch -M ${options.baseBranch}`, repoPath, { stdio: 'ignore' });

  // Add origin and push
  git(`remote add origin "${originPath}"`, repoPath);
  git(`push -u origin ${options.baseBranch}`, repoPath, { stdio: 'ignore' });

  return { repoPath, originPath };
}

/**
 * Create Scenario 1: main_clean_same
 * On main, same as origin/main, clean working tree
 */
function createMainCleanSame(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  return {
    scenario: 'main_clean_same',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 2a: main_staged_same
 * On main, same as origin/main, has staged changes
 */
function createMainStagedSame(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create and stage a new file
  fs.writeFileSync(path.join(repoPath, 'staged-file.ts'), 'export const x = 1;\n');
  git('add staged-file.ts', repoPath);

  return {
    scenario: 'main_staged_same',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 2b: main_unstaged_same
 * On main, same as origin/main, has unstaged changes
 */
function createMainUnstagedSame(
  tempDir: string,
  options: Required<ScenarioOptions>
): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create an untracked file
  fs.mkdirSync(path.join(repoPath, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'docs', 'new-file.md'), '# New documentation\n');

  return {
    scenario: 'main_unstaged_same',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 2c: main_both_same
 * On main, same as origin/main, has both staged and unstaged changes
 */
function createMainBothSame(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create and stage one file
  fs.writeFileSync(path.join(repoPath, 'staged-file.ts'), 'export const staged = true;\n');
  git('add staged-file.ts', repoPath);

  // Create an untracked file
  fs.writeFileSync(path.join(repoPath, 'unstaged-file.ts'), 'export const unstaged = true;\n');

  return {
    scenario: 'main_both_same',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 3: main_clean_ahead
 * On main, ahead of origin/main, clean working tree
 */
function createMainCleanAhead(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create a local commit (not pushed)
  fs.writeFileSync(path.join(repoPath, 'local-feature.ts'), 'export const feature = 1;\n');
  git('add .', repoPath);
  git('commit -m "Add local feature"', repoPath);

  return {
    scenario: 'main_clean_ahead',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 4: main_changes_ahead
 * On main, ahead of origin/main, has uncommitted changes
 */
function createMainChangesAhead(
  tempDir: string,
  options: Required<ScenarioOptions>
): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create a local commit (not pushed)
  fs.writeFileSync(path.join(repoPath, 'local-feature.ts'), 'export const feature = 1;\n');
  git('add .', repoPath);
  git('commit -m "Add local feature"', repoPath);

  // Create uncommitted changes
  fs.writeFileSync(path.join(repoPath, 'work-in-progress.ts'), 'export const wip = true;\n');

  return {
    scenario: 'main_changes_ahead',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 5: branch_same_as_main
 * On feature branch at same commit as main, clean
 */
function createBranchSameAsMain(
  tempDir: string,
  options: Required<ScenarioOptions>
): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create a branch at the same commit as main
  git('checkout -b feature-branch', repoPath);

  return {
    scenario: 'branch_same_as_main',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 6: branch_ancestor
 * On feature branch that is already merged into main (ancestor)
 */
function createBranchAncestor(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create a feature branch
  git('checkout -b old-feature', repoPath);

  // Go back to main and add commits that include this branch's point
  git(`checkout ${options.baseBranch}`, repoPath);
  fs.writeFileSync(path.join(repoPath, 'new-main-feature.ts'), 'export const newer = 1;\n');
  git('add .', repoPath);
  git('commit -m "Add newer feature on main"', repoPath);

  // Go back to the old feature branch (which is now an ancestor of main)
  git('checkout old-feature', repoPath);

  return {
    scenario: 'branch_ancestor',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 7: branch_divergent
 * On feature branch with commits not in main
 */
function createBranchDivergent(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create a feature branch with unique commits
  git('checkout -b divergent-feature', repoPath);
  fs.writeFileSync(path.join(repoPath, 'feature.ts'), 'export const feature = 1;\n');
  git('add .', repoPath);
  git('commit -m "Add feature"', repoPath);

  return {
    scenario: 'branch_divergent',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 8: branch_with_changes
 * On feature branch with uncommitted changes
 */
function createBranchWithChanges(
  tempDir: string,
  options: Required<ScenarioOptions>
): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create a feature branch with a commit
  git('checkout -b feature-with-changes', repoPath);
  fs.writeFileSync(path.join(repoPath, 'feature.ts'), 'export const feature = 1;\n');
  git('add .', repoPath);
  git('commit -m "Add feature"', repoPath);

  // Add uncommitted changes
  fs.writeFileSync(path.join(repoPath, 'wip.ts'), 'export const wip = true;\n');

  return {
    scenario: 'branch_with_changes',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 9: detached_head
 * In detached HEAD state
 */
function createDetachedHead(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Get current commit SHA
  const sha = git('rev-parse HEAD', repoPath);

  // Checkout the SHA directly (detached HEAD)
  git(`checkout ${sha}`, repoPath, { stdio: 'ignore' });

  return {
    scenario: 'detached_head',
    repoPath,
    originPath,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/**
 * Create Scenario 10: pr_worktree
 * Running from a PR worktree
 */
function createPrWorktree(tempDir: string, options: Required<ScenarioOptions>): ScenarioSetup {
  const { repoPath, originPath } = createBaseRepo(tempDir, options);

  // Create a feature branch
  git('checkout -b pr-feature', repoPath);
  fs.writeFileSync(path.join(repoPath, 'feature.ts'), 'export const feature = 1;\n');
  git('add .', repoPath);
  git('commit -m "Add feature"', repoPath);

  // Go back to main
  git(`checkout ${options.baseBranch}`, repoPath);

  // Create a worktree with PR naming pattern
  const worktreePath = path.join(tempDir, 'main-repo.pr42');
  git(`worktree add "${worktreePath}" pr-feature`, repoPath);

  return {
    scenario: 'pr_worktree',
    repoPath,
    originPath,
    tempDir,
    worktreePath,
    cleanup: () => {
      // Remove worktree first
      try {
        git('worktree prune', repoPath, { stdio: 'ignore' });
      } catch {
        // Ignore
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

/**
 * Create a git repository in a specific scenario state
 *
 * @param scenario - The scenario to create
 * @param options - Configuration options
 * @returns Setup information with cleanup function
 */
export function createScenario(scenario: Scenario, options: ScenarioOptions = {}): ScenarioSetup {
  const opts: Required<ScenarioOptions> = { ...DEFAULT_OPTIONS, ...options };

  // Create temp directory with proper path resolution for cross-platform
  const tempDir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), `e2e-scenario-${scenario}-`))
  );

  const creators: Record<
    Scenario,
    (tempDir: string, opts: Required<ScenarioOptions>) => ScenarioSetup
  > = {
    main_clean_same: createMainCleanSame,
    main_staged_same: createMainStagedSame,
    main_unstaged_same: createMainUnstagedSame,
    main_both_same: createMainBothSame,
    main_clean_ahead: createMainCleanAhead,
    main_changes_ahead: createMainChangesAhead,
    branch_same_as_main: createBranchSameAsMain,
    branch_ancestor: createBranchAncestor,
    branch_divergent: createBranchDivergent,
    branch_with_changes: createBranchWithChanges,
    detached_head: createDetachedHead,
    pr_worktree: createPrWorktree,
  };

  const creator = creators[scenario];
  if (!creator) {
    throw new Error(`Unknown scenario: ${scenario}`);
  }

  return creator(tempDir, opts);
}

/**
 * All available scenarios
 */
export const ALL_SCENARIOS: readonly Scenario[] = [
  'main_clean_same',
  'main_staged_same',
  'main_unstaged_same',
  'main_both_same',
  'main_clean_ahead',
  'main_changes_ahead',
  'branch_same_as_main',
  'branch_ancestor',
  'branch_divergent',
  'branch_with_changes',
  'detached_head',
  'pr_worktree',
] as const;

/**
 * Create all scenarios at once (useful for parallel testing)
 *
 * @param options - Configuration options
 * @returns Map of scenario to setup
 */
export function createAllScenarios(options: ScenarioOptions = {}): Map<Scenario, ScenarioSetup> {
  const setups = new Map<Scenario, ScenarioSetup>();

  for (const scenario of ALL_SCENARIOS) {
    setups.set(scenario, createScenario(scenario, options));
  }

  return setups;
}

/**
 * Clean up all scenarios from a map
 *
 * @param setups - Map of scenario setups to clean
 */
export function cleanupAllScenarios(setups: Map<Scenario, ScenarioSetup>): void {
  for (const setup of setups.values()) {
    setup.cleanup();
  }
}
