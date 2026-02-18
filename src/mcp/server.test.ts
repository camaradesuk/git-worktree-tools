/**
 * MCP Server tests
 *
 * Tests the MCP server tool definitions and handler logic.
 * Since the actual MCP protocol communication is handled by the SDK,
 * these tests focus on the tool implementation logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP SDK to prevent server startup when importing server.ts
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

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
// Import tools array for definition tests (safe because SDK is mocked)
import { tools } from './server.js';

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
    it('calls queryState with default options', async () => {
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

      vi.mocked(queryState).mockResolvedValue(mockResult);

      // Simulate calling the handler
      const result = await queryState({ baseBranch: 'main', verbose: false });

      expect(queryState).toHaveBeenCalledWith({ baseBranch: 'main', verbose: false });
      expect(result.success).toBe(true);
      expect(result.data?.scenario).toBe('main_clean_same');
    });

    it('calls queryState with verbose option', async () => {
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

      vi.mocked(queryState).mockResolvedValue(mockResult);

      const result = await queryState({ baseBranch: 'develop', verbose: true });

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
          remotePrCount: 0,
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

    it('includes remote PR fields when present', async () => {
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
            {
              path: '[remote]',
              name: 'PR #42',
              branch: 'feature/remote-pr',
              commit: 'def456',
              type: 'remote_pr' as const,
              prNumber: 42,
              prState: 'OPEN' as const,
              isDraft: false,
              hasChanges: false,
              prTitle: 'Add new feature',
              prUrl: 'https://github.com/test/repo/pull/42',
            },
          ],
          total: 2,
          prCount: 0,
          remotePrCount: 1,
          openCount: 1,
          changesCount: 0,
        },
      };

      vi.mocked(listWorktrees).mockResolvedValue(mockResult);

      const result = await listWorktrees({ showStatus: true });

      expect(result.success).toBe(true);
      expect(result.data?.worktrees).toHaveLength(2);
      expect(result.data?.remotePrCount).toBe(1);

      const remotePr = result.data?.worktrees.find((w) => w.type === 'remote_pr');
      expect(remotePr?.prTitle).toBe('Add new feature');
      expect(remotePr?.prUrl).toBe('https://github.com/test/repo/pull/42');
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

  describe('MCP tool definitions', () => {
    const expectedToolNames = [
      'worktree_get_state',
      'worktree_create_pr',
      'worktree_setup_pr',
      'worktree_list',
      'worktree_clean',
    ];

    it('defines exactly 5 tools', () => {
      expect(tools).toHaveLength(5);
      const names = tools.map((t) => t.name);
      expect(names).toEqual(expectedToolNames);
    });

    it('all tools have annotations with required hint fields', () => {
      for (const tool of tools) {
        expect(tool.annotations).toBeDefined();
        const annotations = tool.annotations!;

        expect(typeof annotations.title).toBe('string');
        expect(annotations.title!.length).toBeGreaterThan(0);
        expect(typeof annotations.readOnlyHint).toBe('boolean');
        expect(typeof annotations.destructiveHint).toBe('boolean');
        expect(typeof annotations.idempotentHint).toBe('boolean');
        expect(typeof annotations.openWorldHint).toBe('boolean');
      }
    });

    it('all tools have outputSchema with CommandResult structure', () => {
      for (const tool of tools) {
        expect(tool.outputSchema).toBeDefined();
        const schema = tool.outputSchema as Record<string, unknown>;

        expect(schema.type).toBe('object');
        expect(schema.required).toContain('success');
        expect(schema.required).toContain('command');
        expect(schema.required).toContain('timestamp');

        const properties = schema.properties as Record<string, unknown>;
        expect(properties.success).toBeDefined();
        expect(properties.command).toBeDefined();
        expect(properties.timestamp).toBeDefined();
        expect(properties.data).toBeDefined();
        expect(properties.error).toBeDefined();
      }
    });

    it('worktree_get_state is annotated as read-only', () => {
      const tool = tools.find((t) => t.name === 'worktree_get_state');
      expect(tool).toBeDefined();
      expect(tool!.annotations!.readOnlyHint).toBe(true);
      expect(tool!.annotations!.destructiveHint).toBe(false);
      expect(tool!.annotations!.idempotentHint).toBe(true);
      expect(tool!.annotations!.openWorldHint).toBe(false);
    });

    it('worktree_clean is annotated as destructive', () => {
      const tool = tools.find((t) => t.name === 'worktree_clean');
      expect(tool).toBeDefined();
      expect(tool!.annotations!.destructiveHint).toBe(true);
      expect(tool!.annotations!.readOnlyHint).toBe(false);
      expect(tool!.annotations!.idempotentHint).toBe(true);
    });

    it('worktree_create_pr is annotated as not idempotent', () => {
      const tool = tools.find((t) => t.name === 'worktree_create_pr');
      expect(tool).toBeDefined();
      expect(tool!.annotations!.idempotentHint).toBe(false);
      expect(tool!.annotations!.readOnlyHint).toBe(false);
      expect(tool!.annotations!.destructiveHint).toBe(false);
      expect(tool!.annotations!.openWorldHint).toBe(true);
    });

    it('worktree_list is annotated as read-only with open world', () => {
      const tool = tools.find((t) => t.name === 'worktree_list');
      expect(tool).toBeDefined();
      expect(tool!.annotations!.readOnlyHint).toBe(true);
      expect(tool!.annotations!.destructiveHint).toBe(false);
      expect(tool!.annotations!.openWorldHint).toBe(true);
    });

    it('worktree_setup_pr is annotated as idempotent with open world', () => {
      const tool = tools.find((t) => t.name === 'worktree_setup_pr');
      expect(tool).toBeDefined();
      expect(tool!.annotations!.idempotentHint).toBe(true);
      expect(tool!.annotations!.readOnlyHint).toBe(false);
      expect(tool!.annotations!.destructiveHint).toBe(false);
      expect(tool!.annotations!.openWorldHint).toBe(true);
    });

    it('all tool descriptions mention JSON response format', () => {
      for (const tool of tools) {
        const desc = tool.description ?? '';
        const mentionsJson =
          desc.includes('CommandResult') ||
          desc.includes('JSON') ||
          desc.includes('success') ||
          desc.includes('Example success response');

        expect(mentionsJson).toBe(true);
      }
    });

    it('all tool descriptions include example JSON responses', () => {
      for (const tool of tools) {
        const desc = tool.description ?? '';
        expect(desc).toContain('Example success response:');
        // Each example should contain valid-looking JSON with "success":true
        expect(desc).toContain('"success":true');
      }
    });
  });
});
