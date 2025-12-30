import { describe, it, expect } from 'vitest';
import {
  getScenarioContext,
  isPrWorktreeScenario,
  isExistingBranchAction,
  shouldBranchFromHead,
  getScenarioMessageLevel,
} from './scenario-handler.js';
import type { StateAction } from './types.js';
import type { GitState, Scenario } from '../state-detection.js';

describe('newpr/scenario-handler', () => {
  const makeGitState = (overrides: Partial<GitState> = {}): GitState => ({
    worktreeType: 'main_worktree',
    branchType: 'main',
    currentBranch: 'main',
    commitRelationship: 'same',
    workingTreeStatus: 'clean',
    localCommits: [],
    stagedFiles: [],
    unstagedFiles: [],
    repoRoot: '/home/user/repo',
    repoName: 'repo',
    ...overrides,
  });

  describe('getScenarioContext', () => {
    describe('main_clean_same scenario', () => {
      it('returns context with empty commit option', () => {
        const context = getScenarioContext('main_clean_same', makeGitState(), 'main');

        expect(context).not.toBeNull();
        expect(context!.message).toContain('No changes detected');
        expect(context!.choices).toHaveLength(2);
        expect(context!.choices[0].action?.action).toBe('empty_commit');
        expect(context!.choices[1].action).toBeNull(); // Cancel
      });
    });

    describe('main_staged_same scenario', () => {
      it('returns context with commit staged option', () => {
        const context = getScenarioContext(
          'main_staged_same',
          makeGitState({ stagedFiles: ['file.ts'] }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain('staged changes');
        expect(context!.choices).toHaveLength(3);
        expect(context!.choices[0].action?.action).toBe('commit_staged');
        expect(context!.choices[1].action?.action).toBe('empty_commit');
      });
    });

    describe('main_unstaged_same scenario', () => {
      it('returns context with commit all option', () => {
        const context = getScenarioContext(
          'main_unstaged_same',
          makeGitState({ unstagedFiles: ['file.ts'] }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain('unstaged changes');
        expect(context!.choices).toHaveLength(4);
        expect(context!.choices[0].action?.action).toBe('commit_all');
        expect(context!.choices[2].action?.action).toBe('stash_and_empty');
      });
    });

    describe('main_both_same scenario', () => {
      it('returns context with multiple options', () => {
        const context = getScenarioContext(
          'main_both_same',
          makeGitState({ stagedFiles: ['a.ts'], unstagedFiles: ['b.ts'] }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain('both staged and unstaged');
        expect(context!.choices).toHaveLength(5);
        expect(context!.choices[0].action?.stashUnstaged).toBe(true);
      });
    });

    describe('main_clean_ahead scenario', () => {
      it('returns context with use commits option', () => {
        const context = getScenarioContext(
          'main_clean_ahead',
          makeGitState({ localCommits: ['abc123'] }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain('local commits');
        expect(context!.choices).toHaveLength(4);
        expect(context!.choices[0].action?.action).toBe('use_commits');
        expect(context!.choices[0].action?.branchFrom).toBe('head');
        expect(context!.choices[1].action?.action).toBe('push_then_branch');
      });
    });

    describe('main_changes_ahead scenario', () => {
      it('returns context with use commits and commit all option', () => {
        const context = getScenarioContext(
          'main_changes_ahead',
          makeGitState({ localCommits: ['abc123'], unstagedFiles: ['file.ts'] }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain('local commits AND uncommitted changes');
        expect(context!.choices).toHaveLength(4);
        expect(context!.choices[0].action?.action).toBe('use_commits_and_commit_all');
        expect(context!.choices[1].action?.action).toBe('use_commits_and_stash');
      });
    });

    describe('branch_same_as_main scenario', () => {
      it('returns context with branch name in message', () => {
        const context = getScenarioContext(
          'branch_same_as_main',
          makeGitState({ currentBranch: 'feature', branchType: 'other' }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain("'feature'");
        expect(context!.message).toContain('same commit as main');
        expect(context!.choices).toHaveLength(2);
      });

      it('uses unknown for null branch', () => {
        const context = getScenarioContext(
          'branch_same_as_main',
          makeGitState({ currentBranch: null, branchType: 'other' }),
          'main'
        );

        expect(context!.message).toContain("'unknown'");
      });
    });

    describe('branch_ancestor scenario', () => {
      it('returns context with merged warning', () => {
        const context = getScenarioContext(
          'branch_ancestor',
          makeGitState({ currentBranch: 'old-feature', branchType: 'other' }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain('already merged');
        expect(context!.choices).toHaveLength(2);
      });
    });

    describe('branch_divergent scenario', () => {
      it('returns context with create PR for branch option', () => {
        const context = getScenarioContext(
          'branch_divergent',
          makeGitState({
            currentBranch: 'my-feature',
            branchType: 'other',
            localCommits: ['abc123'],
          }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain("'my-feature'");
        expect(context!.choices).toHaveLength(3);
        expect(context!.choices[0].action?.action).toBe('create_pr_for_branch');
        expect(context!.choices[0].label).toContain('my-feature');
      });
    });

    describe('branch_with_changes scenario', () => {
      it('returns divergent branch options when has local commits', () => {
        const context = getScenarioContext(
          'branch_with_changes',
          makeGitState({
            currentBranch: 'my-feature',
            branchType: 'other',
            unstagedFiles: ['file.ts'],
            localCommits: ['abc123'],
          }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.subMessage).toContain('commits not in main');
        expect(context!.choices).toHaveLength(4);
        expect(context!.choices[0].action?.action).toBe('pr_for_branch_commit_all');
        expect(context!.choices[1].action?.action).toBe('pr_for_branch_stash');
      });

      it('returns simple options when no local commits', () => {
        const context = getScenarioContext(
          'branch_with_changes',
          makeGitState({
            currentBranch: 'my-feature',
            branchType: 'other',
            unstagedFiles: ['file.ts'],
            localCommits: [],
          }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.subMessage).toBeUndefined();
        expect(context!.choices).toHaveLength(4);
        expect(context!.choices[0].action?.action).toBe('commit_all');
      });
    });

    describe('detached_head scenario', () => {
      it('returns context with branch from detached option', () => {
        const context = getScenarioContext(
          'detached_head',
          makeGitState({ branchType: 'detached', currentBranch: null }),
          'main'
        );

        expect(context).not.toBeNull();
        expect(context!.message).toContain('detached HEAD');
        expect(context!.choices).toHaveLength(3);
        expect(context!.choices[0].action?.action).toBe('branch_from_detached');
        expect(context!.choices[0].action?.branchFrom).toBe('head');
      });
    });

    describe('pr_worktree scenario', () => {
      it('returns null for delegation', () => {
        const context = getScenarioContext('pr_worktree', makeGitState(), 'main');

        expect(context).toBeNull();
      });
    });

    describe('default scenario', () => {
      it('returns context with empty commit for unhandled scenarios', () => {
        // Force an unknown scenario value
        const context = getScenarioContext('unknown_scenario' as Scenario, makeGitState(), 'main');

        expect(context).not.toBeNull();
        expect(context!.message).toContain('Ready to create PR');
        expect(context!.choices).toHaveLength(2);
      });
    });
  });

  describe('isPrWorktreeScenario', () => {
    it('returns true for pr_worktree', () => {
      expect(isPrWorktreeScenario('pr_worktree')).toBe(true);
    });

    it('returns false for other scenarios', () => {
      expect(isPrWorktreeScenario('main_clean_same')).toBe(false);
      expect(isPrWorktreeScenario('branch_divergent')).toBe(false);
    });
  });

  describe('isExistingBranchAction', () => {
    it('returns true for create_pr_for_branch', () => {
      const action: StateAction = {
        action: 'create_pr_for_branch',
        branchFrom: 'head',
        stashUnstaged: false,
      };
      expect(isExistingBranchAction(action)).toBe(true);
    });

    it('returns true for pr_for_branch_commit_all', () => {
      const action: StateAction = {
        action: 'pr_for_branch_commit_all',
        branchFrom: 'head',
        stashUnstaged: false,
      };
      expect(isExistingBranchAction(action)).toBe(true);
    });

    it('returns true for pr_for_branch_stash', () => {
      const action: StateAction = {
        action: 'pr_for_branch_stash',
        branchFrom: 'head',
        stashUnstaged: false,
      };
      expect(isExistingBranchAction(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: StateAction = {
        action: 'empty_commit',
        branchFrom: 'origin_main',
        stashUnstaged: false,
      };
      expect(isExistingBranchAction(action)).toBe(false);
    });
  });

  describe('shouldBranchFromHead', () => {
    it('returns true when branchFrom is head', () => {
      const action: StateAction = {
        action: 'use_commits',
        branchFrom: 'head',
        stashUnstaged: false,
      };
      expect(shouldBranchFromHead(action)).toBe(true);
    });

    it('returns false when branchFrom is origin_main', () => {
      const action: StateAction = {
        action: 'empty_commit',
        branchFrom: 'origin_main',
        stashUnstaged: false,
      };
      expect(shouldBranchFromHead(action)).toBe(false);
    });
  });

  describe('getScenarioMessageLevel', () => {
    it('returns warning for main_clean_same', () => {
      expect(getScenarioMessageLevel('main_clean_same')).toBe('warning');
    });

    it('returns warning for branch_same_as_main', () => {
      expect(getScenarioMessageLevel('branch_same_as_main')).toBe('warning');
    });

    it('returns warning for branch_ancestor', () => {
      expect(getScenarioMessageLevel('branch_ancestor')).toBe('warning');
    });

    it('returns warning for detached_head', () => {
      expect(getScenarioMessageLevel('detached_head')).toBe('warning');
    });

    it('returns warning for pr_worktree', () => {
      expect(getScenarioMessageLevel('pr_worktree')).toBe('warning');
    });

    it('returns info for other scenarios', () => {
      expect(getScenarioMessageLevel('main_staged_same')).toBe('info');
      expect(getScenarioMessageLevel('branch_divergent')).toBe('info');
      expect(getScenarioMessageLevel('main_clean_ahead')).toBe('info');
    });
  });
});
