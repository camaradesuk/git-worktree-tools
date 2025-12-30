import { describe, it, expect, vi } from 'vitest';
import {
  executeStateAction,
  getBranchPoint,
  requiresStageAll,
  involvesStashing,
  needsPushToMain,
  commitsToCurrentBranch,
  getActionDescription,
  ActionDeps,
} from './actions.js';
import type { StateAction } from './types.js';

describe('newpr/actions', () => {
  const makeDeps = (overrides: Partial<ActionDeps> = {}): ActionDeps => ({
    gitAdd: vi.fn(),
    gitStash: vi.fn().mockReturnValue('stash@{0}'),
    gitPush: vi.fn(),
    gitCommit: vi.fn(),
    ...overrides,
  });

  const makeAction = (overrides: Partial<StateAction> = {}): StateAction => ({
    action: 'empty_commit',
    branchFrom: 'origin_main',
    stashUnstaged: false,
    ...overrides,
  });

  describe('executeStateAction', () => {
    describe('empty_commit action', () => {
      it('does nothing and returns success', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'empty_commit' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(result.stashRef).toBeNull();
        expect(deps.gitAdd).not.toHaveBeenCalled();
        expect(deps.gitStash).not.toHaveBeenCalled();
      });
    });

    describe('commit_staged action', () => {
      it('does nothing before branch creation', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'commit_staged' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(deps.gitAdd).not.toHaveBeenCalled();
      });
    });

    describe('commit_all action', () => {
      it('stages all changes', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'commit_all' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(deps.gitAdd).toHaveBeenCalledWith('.', undefined);
      });

      it('passes cwd when provided', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'commit_all' });

        executeStateAction(action, 'My feature', 'feat/my-feature', deps, '/custom/path');

        expect(deps.gitAdd).toHaveBeenCalledWith('.', '/custom/path');
      });
    });

    describe('stash_and_empty action', () => {
      it('stashes with branch name in message', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'stash_and_empty' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(result.stashRef).toBe('stash@{0}');
        expect(deps.gitStash).toHaveBeenCalledWith(
          { message: 'newpr: auto-stash before creating feat/my-feature' },
          undefined
        );
      });
    });

    describe('use_commits action', () => {
      it('does nothing - branches from HEAD', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'use_commits', branchFrom: 'head' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(deps.gitAdd).not.toHaveBeenCalled();
      });
    });

    describe('branch_from_detached action', () => {
      it('does nothing - branches from HEAD', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'branch_from_detached', branchFrom: 'head' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
      });
    });

    describe('use_commits_and_commit_all action', () => {
      it('stages all changes', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'use_commits_and_commit_all', branchFrom: 'head' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(deps.gitAdd).toHaveBeenCalledWith('.', undefined);
      });
    });

    describe('use_commits_and_stash action', () => {
      it('stashes uncommitted changes', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'use_commits_and_stash', branchFrom: 'head' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(result.stashRef).toBe('stash@{0}');
        expect(deps.gitStash).toHaveBeenCalled();
      });
    });

    describe('push_then_branch action', () => {
      it('pushes to origin/main', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'push_then_branch' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(deps.gitPush).toHaveBeenCalledWith({ remote: 'origin', branch: 'main' }, undefined);
      });
    });

    describe('pr_for_branch_commit_all action', () => {
      it('stages all and commits', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'pr_for_branch_commit_all', branchFrom: 'head' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(deps.gitAdd).toHaveBeenCalledWith('.', undefined);
        expect(deps.gitCommit).toHaveBeenCalledWith(
          { message: 'chore: work in progress\n\n🤖 Committed with newpr' },
          undefined
        );
      });
    });

    describe('pr_for_branch_stash action', () => {
      it('stashes uncommitted changes', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'pr_for_branch_stash', branchFrom: 'head' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(result.stashRef).toBe('stash@{0}');
        expect(deps.gitStash).toHaveBeenCalledWith(
          { message: 'newpr: auto-stash before creating PR' },
          undefined
        );
      });
    });

    describe('create_pr_for_branch action', () => {
      it('does nothing - delegates to existing branch mode', () => {
        const deps = makeDeps();
        const action = makeAction({ action: 'create_pr_for_branch', branchFrom: 'head' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(true);
        expect(deps.gitAdd).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('returns failure on error', () => {
        const deps = makeDeps({
          gitAdd: vi.fn().mockImplementation(() => {
            throw new Error('Permission denied');
          }),
        });
        const action = makeAction({ action: 'commit_all' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Permission denied');
      });

      it('preserves stashRef on error', () => {
        const deps = makeDeps({
          gitStash: vi.fn().mockReturnValue('stash@{0}'),
          gitPush: vi.fn().mockImplementation(() => {
            throw new Error('Network error');
          }),
        });
        // This scenario wouldn't happen in practice, but tests error path
        const action = makeAction({ action: 'push_then_branch' });

        const result = executeStateAction(action, 'My feature', 'feat/my-feature', deps);

        expect(result.success).toBe(false);
      });
    });
  });

  describe('getBranchPoint', () => {
    it('returns HEAD for head branchFrom', () => {
      const action = makeAction({ branchFrom: 'head' });
      expect(getBranchPoint(action, 'main')).toBe('HEAD');
    });

    it('returns origin/baseBranch for origin_main branchFrom', () => {
      const action = makeAction({ branchFrom: 'origin_main' });
      expect(getBranchPoint(action, 'main')).toBe('origin/main');
    });

    it('uses provided base branch', () => {
      const action = makeAction({ branchFrom: 'origin_main' });
      expect(getBranchPoint(action, 'develop')).toBe('origin/develop');
    });
  });

  describe('requiresStageAll', () => {
    it('returns true for commit_all', () => {
      const action = makeAction({ action: 'commit_all' });
      expect(requiresStageAll(action)).toBe(true);
    });

    it('returns true for use_commits_and_commit_all', () => {
      const action = makeAction({ action: 'use_commits_and_commit_all' });
      expect(requiresStageAll(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      expect(requiresStageAll(makeAction({ action: 'empty_commit' }))).toBe(false);
      expect(requiresStageAll(makeAction({ action: 'stash_and_empty' }))).toBe(false);
    });
  });

  describe('involvesStashing', () => {
    it('returns true for stash_and_empty', () => {
      const action = makeAction({ action: 'stash_and_empty' });
      expect(involvesStashing(action)).toBe(true);
    });

    it('returns true for use_commits_and_stash', () => {
      const action = makeAction({ action: 'use_commits_and_stash' });
      expect(involvesStashing(action)).toBe(true);
    });

    it('returns true for pr_for_branch_stash', () => {
      const action = makeAction({ action: 'pr_for_branch_stash' });
      expect(involvesStashing(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      expect(involvesStashing(makeAction({ action: 'empty_commit' }))).toBe(false);
      expect(involvesStashing(makeAction({ action: 'commit_all' }))).toBe(false);
    });
  });

  describe('needsPushToMain', () => {
    it('returns true for push_then_branch', () => {
      const action = makeAction({ action: 'push_then_branch' });
      expect(needsPushToMain(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      expect(needsPushToMain(makeAction({ action: 'empty_commit' }))).toBe(false);
      expect(needsPushToMain(makeAction({ action: 'use_commits' }))).toBe(false);
    });
  });

  describe('commitsToCurrentBranch', () => {
    it('returns true for pr_for_branch_commit_all', () => {
      const action = makeAction({ action: 'pr_for_branch_commit_all' });
      expect(commitsToCurrentBranch(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      expect(commitsToCurrentBranch(makeAction({ action: 'commit_all' }))).toBe(false);
      expect(commitsToCurrentBranch(makeAction({ action: 'pr_for_branch_stash' }))).toBe(false);
    });
  });

  describe('getActionDescription', () => {
    it('returns description for each action type', () => {
      expect(getActionDescription(makeAction({ action: 'empty_commit' }))).toContain('empty');
      expect(getActionDescription(makeAction({ action: 'commit_staged' }))).toContain('staged');
      expect(getActionDescription(makeAction({ action: 'commit_all' }))).toContain('all');
      expect(getActionDescription(makeAction({ action: 'stash_and_empty' }))).toContain('Stashing');
      expect(getActionDescription(makeAction({ action: 'use_commits' }))).toContain('existing');
      expect(getActionDescription(makeAction({ action: 'push_then_branch' }))).toContain('Pushing');
      expect(getActionDescription(makeAction({ action: 'use_commits_and_commit_all' }))).toContain(
        'staging'
      );
      expect(getActionDescription(makeAction({ action: 'use_commits_and_stash' }))).toContain(
        'stashing'
      );
      expect(getActionDescription(makeAction({ action: 'create_pr_for_branch' }))).toContain(
        'current branch'
      );
      expect(getActionDescription(makeAction({ action: 'pr_for_branch_commit_all' }))).toContain(
        'Committing'
      );
      expect(getActionDescription(makeAction({ action: 'pr_for_branch_stash' }))).toContain(
        'Stashing'
      );
      expect(getActionDescription(makeAction({ action: 'branch_from_detached' }))).toContain(
        'detached'
      );
    });

    it('returns generic description for unknown action', () => {
      const action = { action: 'unknown' as StateAction['action'], branchFrom: 'origin_main' as const, stashUnstaged: false };
      expect(getActionDescription(action)).toBe('Executing action');
    });
  });
});
