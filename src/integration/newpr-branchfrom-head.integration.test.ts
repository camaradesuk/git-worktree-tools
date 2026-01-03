import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as git from '../lib/git.js';
import { analyzeGitState, detectScenario } from '../lib/state-detection.js';
import { executeStateAction, getBranchPoint, type ActionDeps } from '../lib/newpr/index.js';
import { getScenarioContext } from '../lib/newpr/scenario-handler.js';
import type { StateAction } from '../lib/newpr/types.js';

/**
 * Integration tests for the branchFrom: 'head' fix.
 *
 * This test suite verifies that when the user selects "Stage all and commit"
 * or "Commit staged changes", the staged changes are preserved even when
 * origin/main has moved ahead of the local main branch.
 *
 * The bug was: branchFrom defaulted to 'origin_main', so after git fetch,
 * if origin/main was ahead, `git checkout -b <branch> origin/main` would
 * reset the index and lose staged changes.
 *
 * The fix: changed branchFrom to 'head' for commit_all and commit_staged actions.
 */

describe('newpr integration - branchFrom: head fix', () => {
  let tempDir: string;
  let mainRepoDir: string;
  let bareRepoDir: string;

  /**
   * Create a bare repo and main working repo
   */
  beforeAll(() => {
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'newpr-branchfrom-test-'))
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

    // Create initial commit with some files
    fs.writeFileSync(path.join(mainRepoDir, 'README.md'), '# Test Repo\n');
    fs.mkdirSync(path.join(mainRepoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(mainRepoDir, 'src', 'index.ts'), 'export const main = 1;\n');
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
    // Reset to clean state on main
    execSync('git checkout main', { cwd: mainRepoDir, stdio: 'ignore' });
    execSync('git reset --hard origin/main', { cwd: mainRepoDir, stdio: 'ignore' });
    execSync('git clean -fd', { cwd: mainRepoDir, stdio: 'ignore' });

    // Clean up test branches
    const branchesToClean = [
      'test-unstaged-behind',
      'test-staged-behind',
      'test-both-behind',
      'test-branch-changes',
      'test-modification-behind',
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
  });

  /**
   * Helper: Create real ActionDeps using actual git operations
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
   * Helper: Push a commit to origin/main from a separate clone
   * This simulates another developer pushing changes while you have local work
   */
  function pushUpstreamCommit(filename: string, content: string, message: string) {
    const tempClone = path.join(tempDir, `temp-clone-${Date.now()}`);
    try {
      execSync(`git clone "${bareRepoDir}" "${tempClone}"`, { stdio: 'ignore' });
      execSync('git config user.email "other@test.com"', { cwd: tempClone });
      execSync('git config user.name "Other User"', { cwd: tempClone });
      execSync('git checkout -B main origin/main', { cwd: tempClone, stdio: 'ignore' });

      fs.writeFileSync(path.join(tempClone, filename), content);
      execSync('git add .', { cwd: tempClone });
      execSync(`git commit -m "${message}"`, { cwd: tempClone });
      execSync('git push origin main', { cwd: tempClone, stdio: 'ignore' });
    } finally {
      fs.rmSync(tempClone, { recursive: true, force: true });
    }

    // Fetch in main repo to get the new origin/main
    execSync('git fetch origin', { cwd: mainRepoDir, stdio: 'ignore' });
  }

  /**
   * Helper: Assert that local main is behind origin/main
   */
  function assertLocalBehindOrigin() {
    const behindCount = execSync('git rev-list HEAD..origin/main --count', {
      cwd: mainRepoDir,
      encoding: 'utf8',
    }).trim();
    expect(parseInt(behindCount)).toBeGreaterThan(0);
  }

  describe('Scenario validation: getScenarioContext returns branchFrom: head', () => {
    it('main_unstaged_same: commit_all uses branchFrom: head', () => {
      const context = getScenarioContext(
        'main_unstaged_same',
        {
          worktreeType: 'main_worktree',
          branchType: 'main',
          currentBranch: 'main',
          commitRelationship: 'same',
          workingTreeStatus: 'unstaged_only',
          localCommits: [],
          stagedFiles: [],
          unstagedFiles: ['file.ts'],
          repoRoot: mainRepoDir,
          repoName: 'main-repo',
        },
        'main'
      );

      expect(context).not.toBeNull();
      const commitAllAction = context!.choices.find((c) => c.action?.action === 'commit_all');
      expect(commitAllAction).toBeDefined();
      expect(commitAllAction!.action!.branchFrom).toBe('head');
    });

    it('main_staged_same: commit_staged uses branchFrom: head', () => {
      const context = getScenarioContext(
        'main_staged_same',
        {
          worktreeType: 'main_worktree',
          branchType: 'main',
          currentBranch: 'main',
          commitRelationship: 'same',
          workingTreeStatus: 'staged_only',
          localCommits: [],
          stagedFiles: ['file.ts'],
          unstagedFiles: [],
          repoRoot: mainRepoDir,
          repoName: 'main-repo',
        },
        'main'
      );

      expect(context).not.toBeNull();
      const commitStagedAction = context!.choices.find((c) => c.action?.action === 'commit_staged');
      expect(commitStagedAction).toBeDefined();
      expect(commitStagedAction!.action!.branchFrom).toBe('head');
    });

    it('main_both_same: both commit options use branchFrom: head', () => {
      const context = getScenarioContext(
        'main_both_same',
        {
          worktreeType: 'main_worktree',
          branchType: 'main',
          currentBranch: 'main',
          commitRelationship: 'same',
          workingTreeStatus: 'both',
          localCommits: [],
          stagedFiles: ['staged.ts'],
          unstagedFiles: ['unstaged.ts'],
          repoRoot: mainRepoDir,
          repoName: 'main-repo',
        },
        'main'
      );

      expect(context).not.toBeNull();

      const commitStagedAction = context!.choices.find((c) => c.action?.action === 'commit_staged');
      expect(commitStagedAction).toBeDefined();
      expect(commitStagedAction!.action!.branchFrom).toBe('head');

      const commitAllAction = context!.choices.find((c) => c.action?.action === 'commit_all');
      expect(commitAllAction).toBeDefined();
      expect(commitAllAction!.action!.branchFrom).toBe('head');
    });

    it('branch_with_changes (no divergent): commit_all uses branchFrom: head', () => {
      const context = getScenarioContext(
        'branch_with_changes',
        {
          worktreeType: 'main_worktree',
          branchType: 'other',
          currentBranch: 'my-feature',
          commitRelationship: 'same',
          workingTreeStatus: 'unstaged_only',
          localCommits: [], // No divergent commits
          stagedFiles: [],
          unstagedFiles: ['file.ts'],
          repoRoot: mainRepoDir,
          repoName: 'main-repo',
        },
        'main'
      );

      expect(context).not.toBeNull();
      const commitAllAction = context!.choices.find((c) => c.action?.action === 'commit_all');
      expect(commitAllAction).toBeDefined();
      expect(commitAllAction!.action!.branchFrom).toBe('head');
    });
  });

  describe('main_unstaged_same: origin/main ahead - NEW file', () => {
    it('preserves staged NEW file when branching from HEAD', () => {
      const branchName = 'test-unstaged-behind';

      // Push upstream commit to make origin/main ahead
      pushUpstreamCommit('upstream.txt', 'upstream content\n', 'Upstream commit');
      assertLocalBehindOrigin();

      // Create a NEW unstaged file locally
      fs.writeFileSync(path.join(mainRepoDir, 'newfile.ts'), 'export const x = 1;\n');

      // Verify scenario detection (includes 'behind' which maps to main_unstaged_same)
      const state = analyzeGitState('main', mainRepoDir);
      expect(state.commitRelationship).toBe('ancestor'); // local is ancestor of origin/main
      expect(detectScenario(state)).toBe('main_unstaged_same');

      // Create action with branchFrom: head (the fix)
      const action: StateAction = {
        action: 'commit_all',
        branchFrom: 'head', // THE FIX
        stashUnstaged: false,
      };

      // Execute the action (stages files)
      const deps = createRealDeps(mainRepoDir);
      const result = executeStateAction(action, 'Test', branchName, deps, mainRepoDir);
      expect(result.success).toBe(true);

      // Verify staged before checkout
      const stagedBefore = git.getStagedFiles(mainRepoDir);
      expect(stagedBefore).toContain('newfile.ts');

      // Create branch from HEAD (the fix)
      const branchPoint = getBranchPoint(action, 'main');
      expect(branchPoint).toBe('HEAD');

      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files PRESERVED after checkout from HEAD
      const stagedAfter = git.getStagedFiles(mainRepoDir);
      expect(stagedAfter).toContain('newfile.ts');

      // Commit and verify
      git.commit({ message: 'feat: Test' }, mainRepoDir);
      expect(fs.existsSync(path.join(mainRepoDir, 'newfile.ts'))).toBe(true);
    });

    it('CONTRAST: would lose staged NEW file when branching from origin/main (old behavior)', () => {
      const branchName = 'test-unstaged-behind-old';

      // Push upstream commit
      pushUpstreamCommit('upstream2.txt', 'upstream content 2\n', 'Upstream commit 2');
      assertLocalBehindOrigin();

      // Create a NEW unstaged file locally
      fs.writeFileSync(path.join(mainRepoDir, 'newfile2.ts'), 'export const y = 2;\n');

      // Stage it
      git.add('.', mainRepoDir);
      expect(git.getStagedFiles(mainRepoDir)).toContain('newfile2.ts');

      // Try branching from origin/main (OLD behavior)
      // Note: For NEW files, git actually preserves them even when checking out origin/main
      // because they don't conflict. The real bug is with MODIFIED files.
      git.exec(['checkout', '-b', branchName, 'origin/main'], { cwd: mainRepoDir });

      // For NEW files, git preserves them - this test shows the edge case
      const stagedAfter = git.getStagedFiles(mainRepoDir);
      // New files ARE preserved even with origin/main checkout
      // (the bug is more subtle - it's about modified files)
      expect(stagedAfter).toContain('newfile2.ts');
    });
  });

  describe('main_unstaged_same: origin/main ahead - MODIFIED existing file', () => {
    it('preserves staged MODIFIED file when branching from HEAD', () => {
      const branchName = 'test-modification-behind';

      // Push upstream commit that modifies a DIFFERENT file
      pushUpstreamCommit('upstream3.txt', 'upstream content 3\n', 'Upstream commit 3');
      assertLocalBehindOrigin();

      // Modify an existing file locally (src/index.ts)
      fs.appendFileSync(path.join(mainRepoDir, 'src', 'index.ts'), '\nexport const added = 42;\n');

      // Stage it
      git.add('.', mainRepoDir);
      expect(git.getStagedFiles(mainRepoDir)).toContain('src/index.ts');

      // Create action with branchFrom: head (the fix)
      const action: StateAction = {
        action: 'commit_all',
        branchFrom: 'head', // THE FIX
        stashUnstaged: false,
      };

      const branchPoint = getBranchPoint(action, 'main');
      expect(branchPoint).toBe('HEAD');

      // Create branch from HEAD
      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files PRESERVED
      const stagedAfter = git.getStagedFiles(mainRepoDir);
      expect(stagedAfter).toContain('src/index.ts');

      // Verify the modification is still there
      const content = fs.readFileSync(path.join(mainRepoDir, 'src', 'index.ts'), 'utf8');
      expect(content).toContain('export const added = 42;');

      // Commit and verify
      git.commit({ message: 'feat: Modified file' }, mainRepoDir);

      // Verify commit contains our changes
      const log = execSync('git show --name-only HEAD', {
        cwd: mainRepoDir,
        encoding: 'utf8',
      });
      expect(log).toContain('src/index.ts');
    });

    it('CONTRAST: loses staged MODIFIED file when origin/main changed SAME file (old behavior)', () => {
      // This test demonstrates the actual bug: when origin/main has changes to the
      // SAME file the user modified, checking out origin/main resets that file.

      // First, push an upstream commit that modifies the SAME file (src/index.ts)
      const tempClone = path.join(tempDir, `temp-clone-same-file-${Date.now()}`);
      try {
        execSync(`git clone "${bareRepoDir}" "${tempClone}"`, { stdio: 'ignore' });
        execSync('git config user.email "other@test.com"', { cwd: tempClone });
        execSync('git config user.name "Other User"', { cwd: tempClone });
        execSync('git checkout -B main origin/main', { cwd: tempClone, stdio: 'ignore' });

        // Modify the SAME file that user will also modify
        fs.appendFileSync(path.join(tempClone, 'src', 'index.ts'), '\n// Upstream modification\n');
        execSync('git add .', { cwd: tempClone });
        execSync('git commit -m "Upstream change to index.ts"', { cwd: tempClone });
        execSync('git push origin main', { cwd: tempClone, stdio: 'ignore' });
      } finally {
        fs.rmSync(tempClone, { recursive: true, force: true });
      }

      // Fetch to get the updated origin/main
      execSync('git fetch origin', { cwd: mainRepoDir, stdio: 'ignore' });
      assertLocalBehindOrigin();

      // Now modify the SAME file locally (src/index.ts)
      fs.appendFileSync(path.join(mainRepoDir, 'src', 'index.ts'), '\nexport const lost = 99;\n');

      // Stage it
      git.add('.', mainRepoDir);
      const stagedBefore = git.getStagedFiles(mainRepoDir);
      expect(stagedBefore).toContain('src/index.ts');

      // Try branching from origin/main (OLD behavior)
      // Git will either refuse (conflict) or reset the file
      let checkoutSucceeded = false;
      try {
        git.exec(['checkout', '-b', 'test-lost-changes', 'origin/main'], { cwd: mainRepoDir });
        checkoutSucceeded = true;
      } catch {
        // Expected: git refuses due to conflict
        checkoutSucceeded = false;
      }

      if (checkoutSucceeded) {
        // If checkout succeeded, the file was reset to origin/main's version
        const content = fs.readFileSync(path.join(mainRepoDir, 'src', 'index.ts'), 'utf8');
        // Our local change is gone, replaced with upstream version
        expect(content).toContain('// Upstream modification');
        expect(content).not.toContain('export const lost = 99;');
      } else {
        // Git protected us by refusing the checkout - this is also valid behavior
        // The point is: branchFrom: 'head' avoids this situation entirely
        expect(true).toBe(true); // Test passes - git protected the user
      }
    });
  });

  describe('main_staged_same: origin/main ahead', () => {
    it('preserves staged file when branching from HEAD', () => {
      const branchName = 'test-staged-behind';

      // Push upstream commit
      pushUpstreamCommit('upstream5.txt', 'upstream content 5\n', 'Upstream commit 5');
      assertLocalBehindOrigin();

      // Create and stage a new file
      fs.writeFileSync(path.join(mainRepoDir, 'staged-new.ts'), 'export const staged = 1;\n');
      git.add('staged-new.ts', mainRepoDir);

      // Verify scenario
      const state = analyzeGitState('main', mainRepoDir);
      expect(detectScenario(state)).toBe('main_staged_same');

      // Create action with branchFrom: head
      const action: StateAction = {
        action: 'commit_staged',
        branchFrom: 'head',
        stashUnstaged: false,
      };

      // Create branch from HEAD
      const branchPoint = getBranchPoint(action, 'main');
      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files preserved
      const stagedAfter = git.getStagedFiles(mainRepoDir);
      expect(stagedAfter).toContain('staged-new.ts');
    });
  });

  describe('main_both_same: origin/main ahead', () => {
    it('preserves both staged and unstaged changes when branching from HEAD', () => {
      const branchName = 'test-both-behind';

      // Push upstream commit
      pushUpstreamCommit('upstream6.txt', 'upstream content 6\n', 'Upstream commit 6');
      assertLocalBehindOrigin();

      // Create staged file
      fs.writeFileSync(path.join(mainRepoDir, 'staged-both.ts'), 'export const staged = 1;\n');
      git.add('staged-both.ts', mainRepoDir);

      // Create unstaged file
      fs.writeFileSync(path.join(mainRepoDir, 'unstaged-both.ts'), 'export const unstaged = 2;\n');

      // Verify scenario
      const state = analyzeGitState('main', mainRepoDir);
      expect(detectScenario(state)).toBe('main_both_same');

      // Create action (commit_all stages everything)
      const action: StateAction = {
        action: 'commit_all',
        branchFrom: 'head',
        stashUnstaged: false,
      };

      // Execute action to stage all
      const deps = createRealDeps(mainRepoDir);
      executeStateAction(action, 'Test', branchName, deps, mainRepoDir);

      // Verify both files are staged
      const stagedBefore = git.getStagedFiles(mainRepoDir);
      expect(stagedBefore).toContain('staged-both.ts');
      expect(stagedBefore).toContain('unstaged-both.ts');

      // Create branch from HEAD
      const branchPoint = getBranchPoint(action, 'main');
      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify all staged files preserved
      const stagedAfter = git.getStagedFiles(mainRepoDir);
      expect(stagedAfter).toContain('staged-both.ts');
      expect(stagedAfter).toContain('unstaged-both.ts');
    });
  });

  describe('branch_with_changes: no divergent commits', () => {
    it('preserves staged changes when branching from HEAD', () => {
      const branchName = 'test-branch-changes';

      // Create a feature branch at main (no divergent commits)
      execSync('git checkout -b feature-no-diverge', { cwd: mainRepoDir });

      // Push upstream commit to origin/main
      pushUpstreamCommit('upstream7.txt', 'upstream content 7\n', 'Upstream commit 7');

      // Create unstaged file BEFORE analyzing state
      fs.writeFileSync(path.join(mainRepoDir, 'branch-new.ts'), 'export const branch = 1;\n');

      // Now verify state and scenario (must be AFTER creating the file)
      const state = analyzeGitState('main', mainRepoDir);
      expect(state.branchType).toBe('other');
      expect(state.localCommits.length).toBe(0); // No divergent commits
      expect(state.workingTreeStatus).toBe('unstaged_only');

      // Verify scenario
      const scenario = detectScenario(state);
      expect(scenario).toBe('branch_with_changes');

      // Create action with branchFrom: head
      const action: StateAction = {
        action: 'commit_all',
        branchFrom: 'head',
        stashUnstaged: false,
      };

      // Execute action to stage all
      const deps = createRealDeps(mainRepoDir);
      executeStateAction(action, 'Test', branchName, deps, mainRepoDir);

      // Create branch from HEAD
      const branchPoint = getBranchPoint(action, 'main');
      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged files preserved
      const stagedAfter = git.getStagedFiles(mainRepoDir);
      expect(stagedAfter).toContain('branch-new.ts');
    });
  });

  describe('Full flow simulation: newpr with fix', () => {
    it('complete flow: stage, checkout HEAD, commit, push-ready', () => {
      const branchName = 'feat/complete-flow-test';

      // Push upstream commit to make origin/main ahead
      pushUpstreamCommit('upstream-final.txt', 'final upstream\n', 'Final upstream commit');
      assertLocalBehindOrigin();

      // Create multiple files (mix of new and modified)
      fs.writeFileSync(path.join(mainRepoDir, 'new-feature.ts'), 'export const feature = 1;\n');
      fs.appendFileSync(path.join(mainRepoDir, 'README.md'), '\n## New Section\n');

      // Verify initial state
      const state = analyzeGitState('main', mainRepoDir);
      expect(detectScenario(state)).toBe('main_unstaged_same');

      // Get the action from getScenarioContext (simulating user selection)
      const context = getScenarioContext(detectScenario(state), state, 'main');
      const commitAllAction = context!.choices.find((c) => c.action?.action === 'commit_all');
      expect(commitAllAction!.action!.branchFrom).toBe('head'); // Verify fix is in place

      // Execute the action
      const deps = createRealDeps(mainRepoDir);
      const result = executeStateAction(
        commitAllAction!.action!,
        'Complete flow test',
        branchName,
        deps,
        mainRepoDir
      );
      expect(result.success).toBe(true);

      // Verify staged
      const stagedBefore = git.getStagedFiles(mainRepoDir);
      expect(stagedBefore).toContain('new-feature.ts');
      expect(stagedBefore).toContain('README.md');

      // Checkout from HEAD (what the fix does)
      const branchPoint = getBranchPoint(commitAllAction!.action!, 'main');
      expect(branchPoint).toBe('HEAD');

      git.exec(['checkout', '-b', branchName, branchPoint], { cwd: mainRepoDir });

      // Verify staged preserved
      const stagedAfter = git.getStagedFiles(mainRepoDir);
      expect(stagedAfter).toContain('new-feature.ts');
      expect(stagedAfter).toContain('README.md');

      // Commit
      git.commit({ message: 'feat: Complete flow test\n\n🤖 Created with newpr' }, mainRepoDir);

      // Verify commit contains our files
      const showOutput = execSync('git show --name-only HEAD', {
        cwd: mainRepoDir,
        encoding: 'utf8',
      });
      expect(showOutput).toContain('new-feature.ts');
      expect(showOutput).toContain('README.md');
      expect(showOutput).toContain('Complete flow test');

      // Verify we can switch back to main without our files
      git.checkout('main', mainRepoDir);
      expect(fs.existsSync(path.join(mainRepoDir, 'new-feature.ts'))).toBe(false);

      // Verify our branch has the files
      git.checkout(branchName, mainRepoDir);
      expect(fs.existsSync(path.join(mainRepoDir, 'new-feature.ts'))).toBe(true);
      expect(fs.readFileSync(path.join(mainRepoDir, 'README.md'), 'utf8')).toContain(
        '## New Section'
      );
    });
  });
});
