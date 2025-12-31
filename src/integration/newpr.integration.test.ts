import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as git from '../lib/git.js';
import { analyzeGitState, detectScenario } from '../lib/state-detection.js';
import { executeStateAction, getBranchPoint, type ActionDeps } from '../lib/newpr/index.js';
import type { StateAction } from '../lib/newpr/types.js';

/**
 * Integration tests for newpr flow - specifically testing that uncommitted changes
 * are correctly transferred to new branches created from origin/main.
 *
 * These tests verify the ACTUAL git behavior, not just mocked dependencies.
 */

describe('newpr integration - uncommitted changes transfer', () => {
  let tempDir: string;
  let mainRepoDir: string;
  let bareRepoDir: string;

  // Create temp directory structure with a bare repo to simulate origin
  beforeAll(() => {
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'newpr-integration-test-'))
    );

    // Create a bare repo to act as origin
    bareRepoDir = path.join(tempDir, 'origin.git');
    fs.mkdirSync(bareRepoDir);
    execSync('git init --bare', { cwd: bareRepoDir });

    // Create the main working repo
    mainRepoDir = path.join(tempDir, 'main-repo');
    fs.mkdirSync(mainRepoDir);
    execSync('git init', { cwd: mainRepoDir });
    execSync('git config user.email "test@test.com"', { cwd: mainRepoDir });
    execSync('git config user.name "Test User"', { cwd: mainRepoDir });

    // Create initial commit
    fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Test Repo\n');
    execSync('git add .', { cwd: mainRepoDir });
    execSync('git commit -m "Initial commit"', { cwd: mainRepoDir });

    // Rename branch to 'main' for consistency
    execSync('git branch -M main', { cwd: mainRepoDir, stdio: 'ignore' });

    // Add origin and push
    execSync(`git remote add origin "${bareRepoDir}"`, { cwd: mainRepoDir });
    execSync('git push -u origin main', { cwd: mainRepoDir, stdio: 'ignore' });
  });

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up any test branches first (before checkout to avoid errors)
    const branchesToClean = [
      'test-feature',
      'test-feature-staged',
      'test-feature-both',
      'test-feature-behind',
      'test-feature-existing-file',
      'test-feature-full-flow',
      'test-feature-from-head',
    ];
    for (const branch of branchesToClean) {
      try {
        execSync(`git branch -D ${branch} 2>/dev/null`, {
          cwd: mainRepoDir,
          stdio: 'ignore',
        });
      } catch {
        // Ignore
      }
    }

    // Reset to clean state on main
    execSync('git checkout main', { cwd: mainRepoDir, stdio: 'ignore' });
    execSync('git reset --hard origin/main', { cwd: mainRepoDir, stdio: 'ignore' });
    execSync('git clean -fd', { cwd: mainRepoDir, stdio: 'ignore' });
  });

  /**
   * Create real ActionDeps using actual git operations
   */
  function createRealDeps(cwd: string): ActionDeps {
    return {
      gitAdd: (addPath: string, cwdPath?: string) => git.add(addPath, cwdPath ?? cwd),
      gitStash: (options, cwdPath?) =>
        git.stash({ message: options.message, keepIndex: options.keepIndex }, cwdPath ?? cwd),
      gitPush: (options, cwdPath?) =>
        git.push(
          { remote: options.remote, branch: options.branch, setUpstream: options.setUpstream },
          cwdPath ?? cwd
        ),
      gitCommit: (options, cwdPath?) =>
        git.commit({ message: options.message, allowEmpty: options.allowEmpty }, cwdPath ?? cwd),
    };
  }

  /**
   * Helper to get the base branch name - we use 'main' in this test suite
   */
  function getBaseBranch(): string {
    return 'main';
  }

  describe('Scenario 2b: main_unstaged_same - unstaged changes on main', () => {
    it('detects scenario correctly', () => {
      const baseBranch = getBaseBranch();

      // Create an unstaged file (new, untracked)
      fs.mkdirSync(path.join(mainRepoDir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(mainRepoDir, 'docs', 'AI-TOOLING-PLAN.md'), '# Plan\n');

      const state = analyzeGitState(baseBranch, mainRepoDir);
      const scenario = detectScenario(state);

      expect(scenario).toBe('main_unstaged_same');
      // Git may report 'docs/' for untracked directories
      expect(state.unstagedFiles.some((f) => f.includes('docs'))).toBe(true);
    });

    it('commit_all action commits unstaged file to new branch from origin/main', () => {
      const baseBranch = getBaseBranch();
      const branchName = 'test-feature';

      // Create an unstaged file (simulating the user's scenario)
      fs.mkdirSync(path.join(mainRepoDir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(mainRepoDir, 'docs', 'AI-TOOLING-PLAN.md'), '# Plan\n');

      // Verify initial state
      const initialState = analyzeGitState(baseBranch, mainRepoDir);
      expect(detectScenario(initialState)).toBe('main_unstaged_same');

      // Create the action: "Stage all and commit to the new PR branch"
      const action: StateAction = {
        action: 'commit_all',
        branchFrom: 'origin_main',
        stashUnstaged: false,
      };

      // Execute the action (this stages files)
      const deps = createRealDeps(mainRepoDir);
      const actionResult = executeStateAction(
        action,
        'Test feature',
        branchName,
        deps,
        mainRepoDir
      );
      expect(actionResult.success).toBe(true);

      // Verify files are staged
      const stagedAfterAction = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterAction).toContain('docs/AI-TOOLING-PLAN.md');

      // Create new branch from origin/main (this is what newpr.ts does)
      const branchPoint = getBranchPoint(action, baseBranch);
      expect(branchPoint).toBe(`origin/${baseBranch}`);

      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files persist after checkout from origin/main.
      // When origin/main equals HEAD (same commit), git preserves the index.
      const stagedAfterCheckout = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterCheckout).toContain('docs/AI-TOOLING-PLAN.md');

      // If staged files existed, commit them
      if (stagedAfterCheckout.length > 0) {
        git.commit({ message: 'feat: Test feature' }, mainRepoDir);
      }

      // Verify the file is in the commit history
      const log = execSync('git log --oneline -1', {
        cwd: mainRepoDir,
        encoding: 'utf8',
      });

      // This SHOULD contain our commit message, but with the bug it won't
      expect(log).toContain('Test feature');

      // Verify the file actually exists in the new branch
      expect(fs.existsSync(path.join(mainRepoDir, 'docs', 'AI-TOOLING-PLAN.md'))).toBe(true);
    });
  });

  describe('Scenario 2a: main_staged_same - staged changes on main', () => {
    it('commit_staged action commits staged file to new branch from origin/main', () => {
      const baseBranch = getBaseBranch();
      const branchName = 'test-feature-staged';

      // Create and stage a file
      fs.mkdirSync(path.join(mainRepoDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(mainRepoDir, 'src', 'feature.ts'), 'export const x = 1;\n');
      execSync('git add src/feature.ts', { cwd: mainRepoDir });

      // Verify initial state
      const initialState = analyzeGitState(baseBranch, mainRepoDir);
      expect(detectScenario(initialState)).toBe('main_staged_same');
      expect(initialState.stagedFiles).toContain('src/feature.ts');

      // Create the action: "Commit staged changes to the new PR branch"
      const action: StateAction = {
        action: 'commit_staged',
        branchFrom: 'origin_main',
        stashUnstaged: false,
      };

      // Execute the action (this does nothing for commit_staged)
      const deps = createRealDeps(mainRepoDir);
      const actionResult = executeStateAction(
        action,
        'Test feature staged',
        branchName,
        deps,
        mainRepoDir
      );
      expect(actionResult.success).toBe(true);

      // Verify files are staged before checkout
      const stagedBefore = git.getStagedFiles(mainRepoDir);
      expect(stagedBefore).toContain('src/feature.ts');

      // Create new branch from origin/main
      const branchPoint = getBranchPoint(action, baseBranch);
      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files persist after checkout from origin/main.
      // When origin/main equals HEAD (same commit), git preserves the index.
      const stagedAfterCheckout = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterCheckout).toContain('src/feature.ts');
    });
  });

  describe('Scenario 2c: main_both_same - both staged and unstaged changes', () => {
    it('commit_staged with stashUnstaged preserves staged and transfers unstaged', () => {
      const baseBranch = getBaseBranch();
      const branchName = 'test-feature-both';

      // Create staged file
      fs.mkdirSync(path.join(mainRepoDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(mainRepoDir, 'src', 'staged.ts'), 'export const staged = 1;\n');
      execSync('git add src/staged.ts', { cwd: mainRepoDir });

      // Create unstaged file
      fs.writeFileSync(
        path.join(mainRepoDir, 'src', 'unstaged.ts'),
        'export const unstaged = 2;\n'
      );

      // Verify initial state
      const initialState = analyzeGitState(baseBranch, mainRepoDir);
      expect(detectScenario(initialState)).toBe('main_both_same');
      expect(initialState.stagedFiles).toContain('src/staged.ts');
      expect(initialState.unstagedFiles).toContain('src/unstaged.ts');

      // Create the action: "Commit staged to PR branch, move unstaged to new worktree"
      const action: StateAction = {
        action: 'commit_staged',
        branchFrom: 'origin_main',
        stashUnstaged: true,
      };

      // Execute the action
      const deps = createRealDeps(mainRepoDir);
      const actionResult = executeStateAction(
        action,
        'Test feature both',
        branchName,
        deps,
        mainRepoDir
      );
      expect(actionResult.success).toBe(true);

      // Verify staged files are still staged before checkout
      const stagedBefore = git.getStagedFiles(mainRepoDir);
      expect(stagedBefore).toContain('src/staged.ts');

      // Create new branch from origin/main
      const branchPoint = getBranchPoint(action, baseBranch);
      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files persist after checkout from origin/main.
      // When origin/main equals HEAD (same commit), git preserves the index.
      const stagedAfterCheckout = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterCheckout).toContain('src/staged.ts');
    });
  });

  describe('Scenario: main branch BEHIND origin/main (ancestor relationship)', () => {
    it('commit_all when local main is behind origin/main preserves staged files', () => {
      const baseBranch = getBaseBranch();
      const branchName = 'test-feature-behind';

      // Simulate origin/main being ahead by adding a commit to the bare repo
      // Create a temporary clone, add a commit, push
      const tempClone = path.join(tempDir, 'temp-clone');
      execSync(`git clone "${bareRepoDir}" "${tempClone}"`, { stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempClone });
      execSync('git config user.name "Test User"', { cwd: tempClone });
      // Checkout origin/main to properly track (clone warning about nonexistent ref)
      execSync('git checkout -B main origin/main', { cwd: tempClone, stdio: 'ignore' });
      fs.writeFileSync(path.join(tempClone, 'upstream-change.txt'), 'upstream change\n');
      execSync('git add .', { cwd: tempClone });
      execSync('git commit -m "Upstream change"', { cwd: tempClone });
      execSync('git push origin main', { cwd: tempClone, stdio: 'ignore' });
      fs.rmSync(tempClone, { recursive: true, force: true });

      // Fetch in main repo to get the new origin/main
      execSync('git fetch origin', { cwd: mainRepoDir, stdio: 'ignore' });

      // Now local main is BEHIND origin/main
      const behindCheck = execSync('git rev-list HEAD..origin/main --count', {
        cwd: mainRepoDir,
        encoding: 'utf8',
      }).trim();
      expect(parseInt(behindCheck)).toBeGreaterThan(0);

      // Create an unstaged file (simulating the user's scenario)
      const docsDir = path.join(mainRepoDir, 'docs');
      const planFile = path.join(docsDir, 'AI-TOOLING-PLAN.md');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(planFile, '# Plan\n');

      // Debug: verify file exists
      expect(fs.existsSync(planFile)).toBe(true);

      // Verify initial state
      const initialState = analyzeGitState(baseBranch, mainRepoDir);

      // The relationship is 'ancestor' (HEAD is an ancestor of origin/main)
      // which semantically means "behind" - local main is behind origin/main
      expect(initialState.commitRelationship).toBe('ancestor');
      expect(initialState.workingTreeStatus).toBe('unstaged_only');

      // After fix: detectScenario now handles 'ancestor' for main branch
      expect(detectScenario(initialState)).toBe('main_unstaged_same');

      // Create the action: "Stage all and commit to the new PR branch"
      const action: StateAction = {
        action: 'commit_all',
        branchFrom: 'origin_main',
        stashUnstaged: false,
      };

      // Execute the action (this stages files)
      const deps = createRealDeps(mainRepoDir);
      const actionResult = executeStateAction(
        action,
        'Test feature',
        branchName,
        deps,
        mainRepoDir
      );
      expect(actionResult.success).toBe(true);

      // Verify files are staged
      const stagedAfterAction = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterAction).toContain('docs/AI-TOOLING-PLAN.md');

      // Create new branch from origin/main (this is what newpr.ts does)
      const branchPoint = getBranchPoint(action, baseBranch);
      expect(branchPoint).toBe(`origin/${baseBranch}`);

      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files persist after checkout from origin/main.
      // For NEW files that don't exist in origin/main, git preserves them
      // in the index even when the checkout updates the working tree.
      const stagedAfterCheckout = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterCheckout).toContain('docs/AI-TOOLING-PLAN.md');
    });
  });

  describe('Edge case: modifying EXISTING file when behind origin/main', () => {
    it('git refuses checkout when staged changes conflict with upstream', () => {
      const baseBranch = getBaseBranch();
      const branchName = 'test-feature-existing-file';

      // Simulate origin/main being ahead by adding a commit to the bare repo
      const tempClone = path.join(tempDir, 'temp-clone-2');
      execSync(`git clone "${bareRepoDir}" "${tempClone}"`, { stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: tempClone });
      execSync('git config user.name "Test User"', { cwd: tempClone });
      execSync('git checkout -B main origin/main', { cwd: tempClone, stdio: 'ignore' });
      // Modify the README (which exists in both local and origin)
      fs.appendFileSync(path.join(tempClone, 'README.md'), '\n## Upstream changes\n');
      execSync('git add .', { cwd: tempClone });
      execSync('git commit -m "Upstream README change"', { cwd: tempClone });
      execSync('git push origin main', { cwd: tempClone, stdio: 'ignore' });
      fs.rmSync(tempClone, { recursive: true, force: true });

      // Fetch in main repo to get the new origin/main
      execSync('git fetch origin', { cwd: mainRepoDir, stdio: 'ignore' });

      // Verify local main is behind
      const behindCheck = execSync('git rev-list HEAD..origin/main --count', {
        cwd: mainRepoDir,
        encoding: 'utf8',
      }).trim();
      expect(parseInt(behindCheck)).toBeGreaterThan(0);

      // Modify README.md locally (an existing file that also changed in origin)
      // This simulates the user making changes to a file that has upstream changes
      fs.appendFileSync(path.join(mainRepoDir, 'README.md'), '\n## Local changes\n');

      // Stage the change
      execSync('git add README.md', { cwd: mainRepoDir });

      // Verify it's staged
      const stagedBefore = git.getStagedFiles(mainRepoDir);
      expect(stagedBefore).toContain('README.md');

      // Create the action
      const action: StateAction = {
        action: 'commit_staged',
        branchFrom: 'origin_main',
        stashUnstaged: false,
      };

      // Execute the action (nothing to do for commit_staged)
      const deps = createRealDeps(mainRepoDir);
      const actionResult = executeStateAction(
        action,
        'Test feature',
        branchName,
        deps,
        mainRepoDir
      );
      expect(actionResult.success).toBe(true);

      // Now checkout from origin/main
      const branchPoint = getBranchPoint(action, baseBranch);

      // This should fail because there's a conflict between local staged changes
      // and upstream changes to the same file
      let checkoutError: Error | null = null;
      try {
        git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });
      } catch (e) {
        checkoutError = e as Error;
      }

      // Git will either:
      // 1. Refuse the checkout (conflict) - checkoutError is set
      // 2. Preserve staged changes - stagedAfterCheckout contains README.md

      if (checkoutError) {
        // Git refused the checkout due to conflicting changes - this is expected.
        // When a file has both local staged changes AND upstream changes,
        // git protects the user by refusing the checkout.
        console.log('Git refused checkout due to conflict (expected behavior)');
        expect(checkoutError.message).toContain('overwritten');
      } else {
        // Git allowed checkout - verify staged changes are preserved.
        // This branch handles the case where git finds a way to merge cleanly.
        const stagedAfterCheckout = git.getStagedFiles(mainRepoDir);
        expect(stagedAfterCheckout).toContain('README.md');
      }
    });
  });

  describe('Full flow: file ends up in worktree, not main', () => {
    it('uncommitted file is committed to branch and available in worktree', () => {
      const baseBranch = getBaseBranch();
      const branchName = 'test-feature-full-flow';

      // Create an unstaged file
      fs.mkdirSync(path.join(mainRepoDir, 'docs'), { recursive: true });
      const testFile = path.join(mainRepoDir, 'docs', 'AI-TOOLING-PLAN.md');
      fs.writeFileSync(testFile, '# Plan\n');

      // Stage files (what executeStateAction does for commit_all)
      git.add('.', mainRepoDir);

      // Verify staged
      expect(git.getStagedFiles(mainRepoDir)).toContain('docs/AI-TOOLING-PLAN.md');

      // Create new branch from origin/main
      git.exec(['checkout', '-b', branchName, `origin/${baseBranch}`], { cwd: mainRepoDir });

      // Verify still staged after checkout
      expect(git.getStagedFiles(mainRepoDir)).toContain('docs/AI-TOOLING-PLAN.md');

      // Commit (what newpr does)
      git.commit({ message: 'feat: Test feature\n\n🤖 Created with newpr' }, mainRepoDir);

      // Verify file is committed (not staged anymore)
      expect(git.getStagedFiles(mainRepoDir)).not.toContain('docs/AI-TOOLING-PLAN.md');

      // Verify file exists in working tree
      expect(fs.existsSync(testFile)).toBe(true);

      // Go back to original branch (what newpr does)
      git.checkout(baseBranch, mainRepoDir);

      // KEY CHECK: File should NOT exist in main worktree after checkout back
      // because it was only committed to the feature branch
      expect(fs.existsSync(testFile)).toBe(false);

      // Create worktree (what newpr does)
      const worktreePath = path.join(tempDir, 'test-worktree');
      git.addWorktree(worktreePath, branchName, { cwd: mainRepoDir });

      // KEY CHECK: File SHOULD exist in the worktree
      const fileInWorktree = path.join(worktreePath, 'docs', 'AI-TOOLING-PLAN.md');
      expect(fs.existsSync(fileInWorktree)).toBe(true);

      // Clean up worktree
      git.removeWorktree(worktreePath, { cwd: mainRepoDir });
    });
  });

  describe('Contrast: branching from HEAD preserves staged files', () => {
    it('use_commits_and_commit_all from HEAD preserves staged files', () => {
      const baseBranch = getBaseBranch();
      const branchName = 'test-feature-from-head';

      // First create a local commit so we can branch from HEAD
      fs.writeFileSync(path.join(mainRepoDir, 'local-commit.txt'), 'local commit\n');
      execSync('git add local-commit.txt', { cwd: mainRepoDir });
      execSync('git commit -m "Local commit"', { cwd: mainRepoDir });

      // Now create an unstaged file
      fs.mkdirSync(path.join(mainRepoDir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(mainRepoDir, 'docs', 'new-file.md'), '# New\n');

      // Create the action: use commits and commit all (branches from HEAD)
      const action: StateAction = {
        action: 'use_commits_and_commit_all',
        branchFrom: 'head',
        stashUnstaged: false,
      };

      // Execute the action (this stages files)
      const deps = createRealDeps(mainRepoDir);
      executeStateAction(action, 'Test from head', branchName, deps, mainRepoDir);

      // Verify files are staged
      const stagedAfterAction = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterAction).toContain('docs/new-file.md');

      // Create new branch from HEAD
      const branchPoint = getBranchPoint(action, baseBranch);
      expect(branchPoint).toBe('HEAD');

      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // When branching from HEAD, staged files ARE preserved
      const stagedAfterCheckout = git.getStagedFiles(mainRepoDir);
      expect(stagedAfterCheckout).toContain('docs/new-file.md');
    });
  });
});
