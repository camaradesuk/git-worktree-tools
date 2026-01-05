/**
 * JSON Output Utilities Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ErrorCode,
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  getErrorCodeFromError,
  isValidStateActionKey,
  type CommandResult,
  type NewprResultData,
  type CleanprResultData,
  type WtstateResultData,
} from './json-output.js';

describe('json-output', () => {
  describe('ErrorCode enum', () => {
    it('has all expected git error codes', () => {
      expect(ErrorCode.NOT_GIT_REPO).toBe('NOT_GIT_REPO');
      expect(ErrorCode.DETACHED_HEAD).toBe('DETACHED_HEAD');
      expect(ErrorCode.UNCOMMITTED_CHANGES).toBe('UNCOMMITTED_CHANGES');
      expect(ErrorCode.BRANCH_EXISTS).toBe('BRANCH_EXISTS');
      expect(ErrorCode.WORKTREE_EXISTS).toBe('WORKTREE_EXISTS');
      expect(ErrorCode.BRANCH_NOT_FOUND).toBe('BRANCH_NOT_FOUND');
      expect(ErrorCode.MERGE_CONFLICT).toBe('MERGE_CONFLICT');
      expect(ErrorCode.STASH_FAILED).toBe('STASH_FAILED');
    });

    it('has all expected GitHub error codes', () => {
      expect(ErrorCode.GH_NOT_INSTALLED).toBe('GH_NOT_INSTALLED');
      expect(ErrorCode.GH_NOT_AUTHENTICATED).toBe('GH_NOT_AUTHENTICATED');
      expect(ErrorCode.PR_NOT_FOUND).toBe('PR_NOT_FOUND');
      expect(ErrorCode.PR_ALREADY_EXISTS).toBe('PR_ALREADY_EXISTS');
      expect(ErrorCode.PR_CREATE_FAILED).toBe('PR_CREATE_FAILED');
    });

    it('has all expected user error codes', () => {
      expect(ErrorCode.USER_CANCELLED).toBe('USER_CANCELLED');
      expect(ErrorCode.INVALID_ARGUMENT).toBe('INVALID_ARGUMENT');
      expect(ErrorCode.MISSING_ARGUMENT).toBe('MISSING_ARGUMENT');
      expect(ErrorCode.INVALID_ACTION).toBe('INVALID_ACTION');
    });

    it('has all expected system error codes', () => {
      expect(ErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
      expect(ErrorCode.OPERATION_FAILED).toBe('OPERATION_FAILED');
      expect(ErrorCode.INVALID_CONFIG).toBe('INVALID_CONFIG');
    });
  });

  describe('isValidStateActionKey', () => {
    it('returns true for valid action keys', () => {
      expect(isValidStateActionKey('empty_commit')).toBe(true);
      expect(isValidStateActionKey('commit_staged')).toBe(true);
      expect(isValidStateActionKey('commit_all')).toBe(true);
      expect(isValidStateActionKey('stash_and_empty')).toBe(true);
      expect(isValidStateActionKey('use_commits')).toBe(true);
      expect(isValidStateActionKey('push_then_branch')).toBe(true);
      expect(isValidStateActionKey('use_commits_and_commit_all')).toBe(true);
      expect(isValidStateActionKey('use_commits_and_stash')).toBe(true);
      expect(isValidStateActionKey('create_pr_for_branch')).toBe(true);
      expect(isValidStateActionKey('pr_for_branch_commit_all')).toBe(true);
      expect(isValidStateActionKey('pr_for_branch_stash')).toBe(true);
      expect(isValidStateActionKey('branch_from_detached')).toBe(true);
    });

    it('returns false for invalid action keys', () => {
      expect(isValidStateActionKey('invalid_action')).toBe(false);
      expect(isValidStateActionKey('')).toBe(false);
      expect(isValidStateActionKey('EMPTY_COMMIT')).toBe(false); // Wrong case
      expect(isValidStateActionKey('random_string')).toBe(false);
    });
  });

  describe('createSuccessResult', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('creates a success result with required fields', () => {
      const data = { prNumber: 123, branch: 'feat/test' };
      const result = createSuccessResult('newpr', data);

      expect(result.success).toBe(true);
      expect(result.command).toBe('newpr');
      expect(result.timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(result.data).toEqual(data);
      expect(result.error).toBeUndefined();
      expect(result.warnings).toBeUndefined();
    });

    it('creates a success result with warnings', () => {
      const data = { status: 'ok' };
      const warnings = ['Warning 1', 'Warning 2'];
      const result = createSuccessResult('test', data, warnings);

      expect(result.success).toBe(true);
      expect(result.warnings).toEqual(warnings);
    });

    it('omits empty warnings array', () => {
      const data = { status: 'ok' };
      const result = createSuccessResult('test', data, []);

      expect(result.warnings).toBeUndefined();
    });

    it('works with newpr result data', () => {
      const data: NewprResultData = {
        prNumber: 42,
        prUrl: 'https://github.com/owner/repo/pull/42',
        branch: 'feat/new-feature',
        worktreePath: '/path/to/worktree',
        draft: false,
        scenario: 'main_clean_same',
        actionTaken: 'empty_commit',
      };
      const result = createSuccessResult('newpr', data);

      expect(result.data).toEqual(data);
    });

    it('works with cleanpr result data', () => {
      const data: CleanprResultData = {
        cleaned: [
          {
            prNumber: 1,
            branch: 'feat/branch-1',
            path: '/path/to/worktree',
            prState: 'merged',
            localBranchDeleted: true,
            remoteBranchDeleted: true,
          },
        ],
        skipped: [],
        totalCleaned: 1,
        totalSkipped: 0,
      };
      const result = createSuccessResult('cleanpr', data);

      expect(result.data).toEqual(data);
    });

    it('works with wtstate result data', () => {
      const data: WtstateResultData = {
        scenario: 'main_clean_same',
        scenarioDescription: 'On main, clean working tree',
        currentBranch: 'main',
        baseBranch: 'main',
        worktreeType: 'main_worktree',
        hasChanges: false,
        hasStagedChanges: false,
        hasUnstagedChanges: false,
        localCommits: [],
        stagedFiles: [],
        unstagedFiles: [],
        availableActions: [{ key: 'empty_commit', label: 'Create empty commit' }],
        recommendedAction: 'empty_commit',
      };
      const result = createSuccessResult('wtstate', data);

      expect(result.data).toEqual(data);
    });
  });

  describe('createErrorResult', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('creates an error result with required fields', () => {
      const result = createErrorResult('newpr', ErrorCode.NOT_GIT_REPO, 'Not in a git repository');

      expect(result.success).toBe(false);
      expect(result.command).toBe('newpr');
      expect(result.timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(result.error).toEqual({
        code: ErrorCode.NOT_GIT_REPO,
        message: 'Not in a git repository',
        suggestion: 'Run this command from within a git repository.',
        details: undefined,
      });
      expect(result.data).toBeUndefined();
    });

    it('creates an error result with details', () => {
      const details = { branch: 'feat/test', file: 'README.md' };
      const result = createErrorResult(
        'cleanpr',
        ErrorCode.UNCOMMITTED_CHANGES,
        'Uncommitted changes detected',
        details
      );

      expect(result.error?.details).toEqual(details);
    });

    it('creates error for GitHub errors', () => {
      const result = createErrorResult(
        'newpr',
        ErrorCode.GH_NOT_AUTHENTICATED,
        'GitHub CLI is not authenticated'
      );

      expect(result.error?.code).toBe(ErrorCode.GH_NOT_AUTHENTICATED);
    });

    it('creates error for user cancellation', () => {
      const result = createErrorResult('newpr', ErrorCode.USER_CANCELLED, 'Operation cancelled');

      expect(result.error?.code).toBe(ErrorCode.USER_CANCELLED);
    });
  });

  describe('formatJsonResult', () => {
    it('formats success result as pretty-printed JSON', () => {
      const result: CommandResult<{ value: number }> = {
        success: true,
        command: 'test',
        timestamp: '2024-01-15T10:30:00.000Z',
        data: { value: 42 },
      };

      const json = formatJsonResult(result);
      const parsed = JSON.parse(json);

      expect(parsed.success).toBe(true);
      expect(parsed.data.value).toBe(42);
    });

    it('formats error result as pretty-printed JSON', () => {
      const result: CommandResult<never> = {
        success: false,
        command: 'test',
        timestamp: '2024-01-15T10:30:00.000Z',
        error: {
          code: ErrorCode.UNKNOWN_ERROR,
          message: 'Something went wrong',
        },
      };

      const json = formatJsonResult(result);
      const parsed = JSON.parse(json);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('UNKNOWN_ERROR');
    });

    it('produces valid JSON string with indentation', () => {
      const result: CommandResult<{ test: string }> = {
        success: true,
        command: 'test',
        timestamp: '2024-01-15T10:30:00.000Z',
        data: { test: 'value' },
      };

      const json = formatJsonResult(result);

      // Should be indented (pretty-printed)
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  describe('getErrorCodeFromError', () => {
    it('returns OPERATION_FAILED for GitCommandError', () => {
      const error = new Error('Git command failed');
      error.name = 'GitCommandError';

      expect(getErrorCodeFromError(error)).toBe(ErrorCode.OPERATION_FAILED);
    });

    it('returns OPERATION_FAILED for GitHubCliError', () => {
      const error = new Error('GitHub CLI error');
      error.name = 'GitHubCliError';

      expect(getErrorCodeFromError(error)).toBe(ErrorCode.OPERATION_FAILED);
    });

    it('returns INVALID_CONFIG for ConfigurationError', () => {
      const error = new Error('Invalid config');
      error.name = 'ConfigurationError';

      expect(getErrorCodeFromError(error)).toBe(ErrorCode.INVALID_CONFIG);
    });

    it('returns OPERATION_FAILED for WorktreeError', () => {
      const error = new Error('Worktree error');
      error.name = 'WorktreeError';

      expect(getErrorCodeFromError(error)).toBe(ErrorCode.OPERATION_FAILED);
    });

    it('returns INVALID_CONFIG for ManifestError', () => {
      const error = new Error('Manifest error');
      error.name = 'ManifestError';

      expect(getErrorCodeFromError(error)).toBe(ErrorCode.INVALID_CONFIG);
    });

    it('returns USER_CANCELLED for UserCancelledError', () => {
      const error = new Error('User cancelled');
      error.name = 'UserCancelledError';

      expect(getErrorCodeFromError(error)).toBe(ErrorCode.USER_CANCELLED);
    });

    it('returns UNKNOWN_ERROR for generic Error', () => {
      const error = new Error('Generic error');

      expect(getErrorCodeFromError(error)).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('returns UNKNOWN_ERROR for non-Error values', () => {
      expect(getErrorCodeFromError('string error')).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(getErrorCodeFromError(null)).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(getErrorCodeFromError(undefined)).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(getErrorCodeFromError(123)).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(getErrorCodeFromError({ message: 'object' })).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });
});
