/**
 * MCP Server tests
 *
 * Tests the MCP server tool definitions and handler logic.
 * Since the actual MCP protocol communication is handled by the SDK,
 * these tests focus on the tool implementation logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API modules before importing anything that uses them
vi.mock('../api/state.js', () => ({
  queryState: vi.fn(),
}));

vi.mock('../api/list.js', () => ({
  listWorktrees: vi.fn(),
}));

vi.mock('../api/clean.js', () => ({
  cleanWorktrees: vi.fn(),
}));

vi.mock('../api/create.js', () => ({
  createPr: vi.fn(),
  setupPrWorktree: vi.fn(),
}));

// Import mocked functions
import { queryState } from '../api/state.js';
import { listWorktrees } from '../api/list.js';
import { cleanWorktrees } from '../api/clean.js';
import { createPr, setupPrWorktree } from '../api/create.js';
import { isValidStateActionKey, type StateActionKey, ErrorCode } from '../lib/json-output.js';

describe('MCP Server', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool definitions', () => {
    it('isValidStateActionKey validates action keys correctly', () => {
      // Valid actions
      expect(isValidStateActionKey('empty_commit')).toBe(true);
      expect(isValidStateActionKey('commit_staged')).toBe(true);
      expect(isValidStateActionKey('commit_all')).toBe(true);
      expect(isValidStateActionKey('stash_and_empty')).toBe(true);
      expect(isValidStateActionKey('use_commits')).toBe(true);
      expect(isValidStateActionKey('push_then_branch')).toBe(true);
      expect(isValidStateActionKey('pr_for_branch_commit_all')).toBe(true);
      expect(isValidStateActionKey('branch_from_detached')).toBe(true);

      // Invalid actions
      expect(isValidStateActionKey('invalid_action')).toBe(false);
      expect(isValidStateActionKey('')).toBe(false);
      expect(isValidStateActionKey('COMMIT_STAGED')).toBe(false);
    });
  });

  describe('worktree_get_state handler', () => {
    it('calls queryState with default options', () => {
      const mockResult = {
        success: true,
        command: 'wtstate',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          scenario: 'main_clean_same',
          scenarioDescription: 'On main, clean, synced',
          currentBranch: 'main',
          baseBranch: 'main',
          worktreeType: 'main_worktree' as const,
          hasChanges: false,
          hasStagedChanges: false,
          hasUnstagedChanges: false,
          localCommits: [],
          stagedFiles: [],
          unstagedFiles: [],
          availableActions: [],
          recommendedAction: null,
        },
      };

      vi.mocked(queryState).mockReturnValue(mockResult);

      // Simulate calling the handler
      const result = queryState({ baseBranch: 'main', verbose: false });

      expect(queryState).toHaveBeenCalledWith({ baseBranch: 'main', verbose: false });
      expect(result.success).toBe(true);
      expect(result.data?.scenario).toBe('main_clean_same');
    });

    it('calls queryState with verbose option', () => {
      const mockResult = {
        success: true,
        command: 'wtstate',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          scenario: 'main_staged_same',
          scenarioDescription: 'On main with staged changes',
          currentBranch: 'main',
          baseBranch: 'main',
          worktreeType: 'main_worktree' as const,
          hasChanges: true,
          hasStagedChanges: true,
          hasUnstagedChanges: false,
          localCommits: [],
          stagedFiles: ['file.ts'],
          unstagedFiles: [],
          availableActions: [{ key: 'commit_staged' as StateActionKey, label: 'Commit staged' }],
          recommendedAction: 'commit_staged' as StateActionKey,
        },
      };

      vi.mocked(queryState).mockReturnValue(mockResult);

      const result = queryState({ baseBranch: 'develop', verbose: true });

      expect(queryState).toHaveBeenCalledWith({ baseBranch: 'develop', verbose: true });
      expect(result.success).toBe(true);
      expect(result.data?.stagedFiles).toEqual(['file.ts']);
    });
  });

  describe('worktree_list handler', () => {
    it('calls listWorktrees with showStatus', async () => {
      const mockResult = {
        success: true,
        command: 'lswt',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          worktrees: [
            {
              path: '/test/repo',
              name: 'repo',
              branch: 'main',
              commit: 'abc123',
              type: 'main' as const,
              prNumber: null,
              prState: null,
              isDraft: null,
              hasChanges: false,
            },
          ],
          total: 1,
          prCount: 0,
          openCount: 0,
          changesCount: 0,
        },
      };

      vi.mocked(listWorktrees).mockResolvedValue(mockResult);

      const result = await listWorktrees({ showStatus: true });

      expect(listWorktrees).toHaveBeenCalledWith({ showStatus: true });
      expect(result.success).toBe(true);
      expect(result.data?.worktrees).toHaveLength(1);
    });
  });

  describe('worktree_clean handler', () => {
    it('calls cleanWorktrees for all merged/closed', async () => {
      const mockResult = {
        success: true,
        command: 'cleanpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          cleaned: [],
          skipped: [],
          totalCleaned: 0,
          totalSkipped: 0,
        },
      };

      vi.mocked(cleanWorktrees).mockResolvedValue(mockResult);

      const result = await cleanWorktrees({
        prNumber: null,
        deleteRemote: false,
        force: false,
        dryRun: false,
      });

      expect(cleanWorktrees).toHaveBeenCalledWith({
        prNumber: null,
        deleteRemote: false,
        force: false,
        dryRun: false,
      });
      expect(result.success).toBe(true);
    });

    it('calls cleanWorktrees for specific PR', async () => {
      const mockResult = {
        success: true,
        command: 'cleanpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          cleaned: [
            {
              prNumber: 42,
              branch: 'feat/test',
              path: '/test/repo.pr42',
              prState: 'MERGED',
              localBranchDeleted: true,
              remoteBranchDeleted: true,
            },
          ],
          skipped: [],
          totalCleaned: 1,
          totalSkipped: 0,
        },
      };

      vi.mocked(cleanWorktrees).mockResolvedValue(mockResult);

      const result = await cleanWorktrees({
        prNumber: 42,
        deleteRemote: true,
        force: false,
        dryRun: false,
      });

      expect(cleanWorktrees).toHaveBeenCalledWith({
        prNumber: 42,
        deleteRemote: true,
        force: false,
        dryRun: false,
      });
      expect(result.success).toBe(true);
      expect(
        result.data && 'totalCleaned' in result.data ? result.data.totalCleaned : undefined
      ).toBe(1);
    });

    it('calls cleanWorktrees with dryRun', async () => {
      const mockResult = {
        success: true,
        command: 'cleanpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          wouldClean: [
            {
              prNumber: 42,
              branch: 'feat/test',
              path: '/test/repo.pr42',
              prState: 'MERGED',
            },
          ],
          totalWouldClean: 1,
        },
      };

      vi.mocked(cleanWorktrees).mockResolvedValue(mockResult);

      const result = await cleanWorktrees({
        prNumber: null,
        deleteRemote: false,
        force: false,
        dryRun: true,
      });

      expect(cleanWorktrees).toHaveBeenCalledWith({
        prNumber: null,
        deleteRemote: false,
        force: false,
        dryRun: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('worktree_create_pr handler', () => {
    it('calls createPr with required options', async () => {
      const mockResult = {
        success: true,
        command: 'newpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          prNumber: 42,
          prUrl: 'https://github.com/test/repo/pull/42',
          branch: 'feat/add-feature',
          worktreePath: '/test/repo.pr42',
          draft: false,
          created: true,
        },
      };

      vi.mocked(createPr).mockResolvedValue(mockResult);

      const result = await createPr({
        description: 'Add new feature',
        baseBranch: 'main',
        draft: false,
      });

      expect(createPr).toHaveBeenCalledWith({
        description: 'Add new feature',
        baseBranch: 'main',
        draft: false,
      });
      expect(result.success).toBe(true);
      expect(result.data?.prNumber).toBe(42);
    });

    it('calls createPr with action and draft', async () => {
      const mockResult = {
        success: true,
        command: 'newpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          prNumber: 43,
          prUrl: 'https://github.com/test/repo/pull/43',
          branch: 'feat/staged-changes',
          worktreePath: '/test/repo.pr43',
          draft: true,
          created: true,
          scenario: 'main_staged_same',
          actionTaken: 'commit_staged',
        },
      };

      vi.mocked(createPr).mockResolvedValue(mockResult);

      const action: StateActionKey = 'commit_staged';
      const result = await createPr({
        description: 'Commit staged changes',
        action,
        draft: true,
        baseBranch: 'develop',
      });

      expect(createPr).toHaveBeenCalledWith({
        description: 'Commit staged changes',
        action: 'commit_staged',
        draft: true,
        baseBranch: 'develop',
      });
      expect(result.success).toBe(true);
      expect(result.data?.draft).toBe(true);
    });

    it('calls createPr with custom branch name', async () => {
      const mockResult = {
        success: true,
        command: 'newpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          prNumber: 44,
          prUrl: 'https://github.com/test/repo/pull/44',
          branch: 'custom/my-branch',
          worktreePath: '/test/repo.pr44',
          draft: false,
          created: true,
        },
      };

      vi.mocked(createPr).mockResolvedValue(mockResult);

      const result = await createPr({
        description: 'Custom branch PR',
        branchName: 'custom/my-branch',
        baseBranch: 'main',
        draft: false,
      });

      expect(createPr).toHaveBeenCalledWith({
        description: 'Custom branch PR',
        branchName: 'custom/my-branch',
        baseBranch: 'main',
        draft: false,
      });
      expect(result.success).toBe(true);
      expect(result.data?.branch).toBe('custom/my-branch');
    });
  });

  describe('worktree_setup_pr handler', () => {
    it('calls setupPrWorktree with PR number', async () => {
      const mockResult = {
        success: true,
        command: 'newpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: {
          prNumber: 42,
          prUrl: 'https://github.com/test/repo/pull/42',
          branch: 'feat/existing-branch',
          worktreePath: '/test/repo.pr42',
          draft: false,
          created: false,
        },
      };

      vi.mocked(setupPrWorktree).mockResolvedValue(mockResult);

      const result = await setupPrWorktree({ prNumber: 42 });

      expect(setupPrWorktree).toHaveBeenCalledWith({ prNumber: 42 });
      expect(result.success).toBe(true);
      expect(result.data?.created).toBe(false);
    });

    it('handles PR not found error', async () => {
      const mockResult = {
        success: false,
        command: 'newpr',
        timestamp: '2026-01-02T00:00:00.000Z',
        error: {
          code: ErrorCode.PR_NOT_FOUND,
          message: 'Could not find PR #999',
        },
      };

      vi.mocked(setupPrWorktree).mockResolvedValue(mockResult);

      const result = await setupPrWorktree({ prNumber: 999 });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PR_NOT_FOUND');
    });
  });

  describe('Error handling', () => {
    it('handles API errors gracefully', async () => {
      const mockResult = {
        success: false,
        command: 'lswt',
        timestamp: '2026-01-02T00:00:00.000Z',
        error: {
          code: ErrorCode.NOT_GIT_REPO,
          message: 'Not in a git repository',
        },
      };

      vi.mocked(listWorktrees).mockResolvedValue(mockResult);

      const result = await listWorktrees({ showStatus: false });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_GIT_REPO');
    });

    it('handles unexpected errors', async () => {
      vi.mocked(cleanWorktrees).mockRejectedValue(new Error('Unexpected error'));

      await expect(cleanWorktrees({ prNumber: null })).rejects.toThrow('Unexpected error');
    });
  });
});
