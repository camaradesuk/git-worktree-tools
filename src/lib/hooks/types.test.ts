/**
 * Hook Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
  HOOK_NAMES,
  contextToEnv,
  isSimpleHook,
  isMultipleHook,
  isComplexHook,
} from './types.js';
import type { HookContext, ComplexHookDef } from './types.js';

describe('HOOK_NAMES', () => {
  it('contains all expected hook names', () => {
    expect(HOOK_NAMES).toContain('pre-analyze');
    expect(HOOK_NAMES).toContain('post-analyze');
    expect(HOOK_NAMES).toContain('pre-branch');
    expect(HOOK_NAMES).toContain('post-branch');
    expect(HOOK_NAMES).toContain('pre-commit');
    expect(HOOK_NAMES).toContain('post-commit');
    expect(HOOK_NAMES).toContain('pre-push');
    expect(HOOK_NAMES).toContain('post-push');
    expect(HOOK_NAMES).toContain('pre-pr');
    expect(HOOK_NAMES).toContain('post-pr');
    expect(HOOK_NAMES).toContain('pre-worktree');
    expect(HOOK_NAMES).toContain('post-worktree');
    expect(HOOK_NAMES).toContain('cleanup');
  });

  it('has 13 hook names', () => {
    expect(HOOK_NAMES).toHaveLength(13);
  });
});

describe('contextToEnv', () => {
  it('converts basic context to env vars', () => {
    const context: HookContext = {
      repoRoot: '/home/user/repo',
      baseBranch: 'main',
    };

    const env = contextToEnv(context);

    expect(env.WT_REPO_ROOT).toBe('/home/user/repo');
    expect(env.WT_BASE_BRANCH).toBe('main');
  });

  it('converts full context to env vars', () => {
    const context: HookContext = {
      branchName: 'feat/add-feature',
      prNumber: 42,
      prUrl: 'https://github.com/org/repo/pull/42',
      worktreePath: '/home/user/repo.pr42',
      repoRoot: '/home/user/repo',
      baseBranch: 'main',
      description: 'Add new feature',
      scenario: 'main_staged_same',
      action: 'commit_staged',
      stagedFiles: ['src/foo.ts', 'src/bar.ts'],
      unstagedFiles: ['README.md'],
      error: 'Something went wrong',
    };

    const env = contextToEnv(context);

    expect(env.WT_BRANCH_NAME).toBe('feat/add-feature');
    expect(env.WT_PR_NUMBER).toBe('42');
    expect(env.WT_PR_URL).toBe('https://github.com/org/repo/pull/42');
    expect(env.WT_WORKTREE_PATH).toBe('/home/user/repo.pr42');
    expect(env.WT_REPO_ROOT).toBe('/home/user/repo');
    expect(env.WT_BASE_BRANCH).toBe('main');
    expect(env.WT_DESCRIPTION).toBe('Add new feature');
    expect(env.WT_SCENARIO).toBe('main_staged_same');
    expect(env.WT_ACTION).toBe('commit_staged');
    expect(env.WT_STAGED_FILES).toBe('src/foo.ts,src/bar.ts');
    expect(env.WT_UNSTAGED_FILES).toBe('README.md');
    expect(env.WT_ERROR).toBe('Something went wrong');
  });

  it('omits undefined values', () => {
    const context: HookContext = {
      repoRoot: '/home/user/repo',
      baseBranch: 'main',
    };

    const env = contextToEnv(context);

    expect(env.WT_BRANCH_NAME).toBeUndefined();
    expect(env.WT_PR_NUMBER).toBeUndefined();
    expect(env.WT_STAGED_FILES).toBeUndefined();
  });

  it('omits empty arrays', () => {
    const context: HookContext = {
      repoRoot: '/home/user/repo',
      baseBranch: 'main',
      stagedFiles: [],
      unstagedFiles: [],
    };

    const env = contextToEnv(context);

    expect(env.WT_STAGED_FILES).toBeUndefined();
    expect(env.WT_UNSTAGED_FILES).toBeUndefined();
  });
});

describe('Hook definition type guards', () => {
  describe('isSimpleHook', () => {
    it('returns true for string', () => {
      expect(isSimpleHook('npm install')).toBe(true);
    });

    it('returns false for array', () => {
      expect(isSimpleHook(['npm install', 'npm run build'])).toBe(false);
    });

    it('returns false for object', () => {
      expect(isSimpleHook({ command: 'npm install' })).toBe(false);
    });
  });

  describe('isMultipleHook', () => {
    it('returns true for array', () => {
      expect(isMultipleHook(['npm install', 'npm run build'])).toBe(true);
    });

    it('returns false for string', () => {
      expect(isMultipleHook('npm install')).toBe(false);
    });

    it('returns false for object', () => {
      expect(isMultipleHook({ command: 'npm install' })).toBe(false);
    });
  });

  describe('isComplexHook', () => {
    it('returns true for object', () => {
      const hook: ComplexHookDef = { command: 'npm install' };
      expect(isComplexHook(hook)).toBe(true);
    });

    it('returns true for object with options', () => {
      const hook: ComplexHookDef = {
        command: 'npm install',
        timeout: 60000,
        failOnError: false,
        if: 'exists:package.json',
      };
      expect(isComplexHook(hook)).toBe(true);
    });

    it('returns false for string', () => {
      expect(isComplexHook('npm install')).toBe(false);
    });

    it('returns false for array', () => {
      expect(isComplexHook(['npm install'])).toBe(false);
    });
  });
});
