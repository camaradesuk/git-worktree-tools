/**
 * Tests for the list worktrees API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listWorktrees, type WorktreeInfo, type ListWorktreesResultData } from './list.js';

// Mock dependencies
vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../lib/github.js', () => ({
  isGhInstalled: vi.fn(),
}));

vi.mock('../lib/lswt/index.js', () => ({
  gatherWorktreeInfo: vi.fn(),
  createDefaultDeps: vi.fn(() => ({})),
}));

import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import { gatherWorktreeInfo } from '../lib/lswt/index.js';

describe('api/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listWorktrees', () => {
    it('returns error when not in a git repository', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue(null as unknown as string);

      const result = await listWorktrees();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_GIT_REPO');
    });

    it('returns worktrees with basic fields', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(gatherWorktreeInfo).mockResolvedValue([
        {
          path: '/test/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main',
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: false,
        },
      ]);

      const result = await listWorktrees({ showStatus: true });

      expect(result.success).toBe(true);
      expect(result.data?.worktrees).toHaveLength(1);
      expect(result.data?.worktrees[0]).toEqual({
        path: '/test/repo',
        name: 'repo',
        branch: 'main',
        commit: 'abc123',
        type: 'main',
        prNumber: null,
        prState: null,
        isDraft: null,
        hasChanges: false,
      });
    });

    it('includes prTitle and prUrl for remote PRs', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(gatherWorktreeInfo).mockResolvedValue([
        {
          path: '/test/repo',
          name: 'repo',
          branch: 'main',
          commit: 'abc123',
          type: 'main',
          prNumber: null,
          prState: null,
          isDraft: null,
          hasChanges: false,
        },
        {
          path: '[remote]',
          name: 'PR #42',
          branch: 'feature/new-feature',
          commit: 'def456',
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
          isDraft: false,
          hasChanges: false,
          prTitle: 'Add amazing new feature',
          prUrl: 'https://github.com/test/repo/pull/42',
        },
      ]);

      const result = await listWorktrees({ showStatus: true });

      expect(result.success).toBe(true);
      expect(result.data?.worktrees).toHaveLength(2);

      const remotePr = result.data?.worktrees.find((w: WorktreeInfo) => w.type === 'remote_pr');
      expect(remotePr).toBeDefined();
      expect(remotePr?.prTitle).toBe('Add amazing new feature');
      expect(remotePr?.prUrl).toBe('https://github.com/test/repo/pull/42');
      expect(remotePr?.prNumber).toBe(42);
      expect(remotePr?.prState).toBe('OPEN');
    });

    it('does not include prTitle/prUrl when not present', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
      vi.mocked(github.isGhInstalled).mockReturnValue(true);
      vi.mocked(gatherWorktreeInfo).mockResolvedValue([
        {
          path: '/test/repo.pr42',
          name: 'repo.pr42',
          branch: 'feature/local-pr',
          commit: 'abc123',
          type: 'pr',
          prNumber: 42,
          prState: 'OPEN',
          isDraft: false,
          hasChanges: true,
          // No prTitle or prUrl - these are only for remote PRs
        },
      ]);

      const result = await listWorktrees({ showStatus: true });

      expect(result.success).toBe(true);
      const localPr = result.data?.worktrees[0];
      expect(localPr?.type).toBe('pr');
      expect(localPr).not.toHaveProperty('prTitle');
      expect(localPr).not.toHaveProperty('prUrl');
    });

    describe('summary stats', () => {
      it('calculates prCount for local PR worktrees only', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(true);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([
          {
            path: '/test/repo',
            name: 'repo',
            branch: 'main',
            commit: 'abc123',
            type: 'main',
            prNumber: null,
            prState: null,
            isDraft: null,
            hasChanges: false,
          },
          {
            path: '/test/repo.pr1',
            name: 'repo.pr1',
            branch: 'feature/one',
            commit: 'pr1abc',
            type: 'pr',
            prNumber: 1,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: false,
          },
          {
            path: '/test/repo.pr2',
            name: 'repo.pr2',
            branch: 'feature/two',
            commit: 'pr2abc',
            type: 'pr',
            prNumber: 2,
            prState: 'MERGED',
            isDraft: false,
            hasChanges: false,
          },
        ]);

        const result = await listWorktrees({ showStatus: true });

        expect(result.success).toBe(true);
        expect(result.data?.prCount).toBe(2);
      });

      it('calculates remotePrCount for remote PRs without local worktrees', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(true);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([
          {
            path: '/test/repo',
            name: 'repo',
            branch: 'main',
            commit: 'abc123',
            type: 'main',
            prNumber: null,
            prState: null,
            isDraft: null,
            hasChanges: false,
          },
          {
            path: '[remote]',
            name: 'PR #10',
            branch: 'feature/remote-one',
            commit: 'rem1abc',
            type: 'remote_pr',
            prNumber: 10,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: false,
            prTitle: 'Remote PR One',
            prUrl: 'https://github.com/test/repo/pull/10',
          },
          {
            path: '[remote]',
            name: 'PR #20',
            branch: 'feature/remote-two',
            commit: 'rem2abc',
            type: 'remote_pr',
            prNumber: 20,
            prState: 'OPEN',
            isDraft: true,
            hasChanges: false,
            prTitle: 'Remote PR Two',
            prUrl: 'https://github.com/test/repo/pull/20',
          },
        ]);

        const result = await listWorktrees({ showStatus: true });

        expect(result.success).toBe(true);
        expect(result.data?.remotePrCount).toBe(2);
        expect(result.data?.prCount).toBe(0); // No local PR worktrees
      });

      it('calculates openCount including both local and remote PRs', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(true);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([
          {
            path: '/test/repo.pr1',
            name: 'repo.pr1',
            branch: 'feature/local',
            commit: 'loc1abc',
            type: 'pr',
            prNumber: 1,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: false,
          },
          {
            path: '/test/repo.pr2',
            name: 'repo.pr2',
            branch: 'feature/merged',
            commit: 'loc2abc',
            type: 'pr',
            prNumber: 2,
            prState: 'MERGED',
            isDraft: false,
            hasChanges: false,
          },
          {
            path: '[remote]',
            name: 'PR #10',
            branch: 'feature/remote',
            commit: 'rem1abc',
            type: 'remote_pr',
            prNumber: 10,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: false,
            prTitle: 'Remote Open PR',
            prUrl: 'https://github.com/test/repo/pull/10',
          },
        ]);

        const result = await listWorktrees({ showStatus: true });

        expect(result.success).toBe(true);
        // 1 local open + 1 remote open = 2 open PRs
        expect(result.data?.openCount).toBe(2);
        expect(result.data?.prCount).toBe(2); // 2 local PR worktrees
        expect(result.data?.remotePrCount).toBe(1); // 1 remote PR
      });

      it('calculates changesCount correctly', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(true);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([
          {
            path: '/test/repo',
            name: 'repo',
            branch: 'main',
            commit: 'abc123',
            type: 'main',
            prNumber: null,
            prState: null,
            isDraft: null,
            hasChanges: true,
          },
          {
            path: '/test/repo.pr1',
            name: 'repo.pr1',
            branch: 'feature/dirty',
            commit: 'pr1abc',
            type: 'pr',
            prNumber: 1,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: true,
          },
          {
            path: '/test/repo.pr2',
            name: 'repo.pr2',
            branch: 'feature/clean',
            commit: 'pr2abc',
            type: 'pr',
            prNumber: 2,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: false,
          },
        ]);

        const result = await listWorktrees({ showStatus: true });

        expect(result.success).toBe(true);
        expect(result.data?.changesCount).toBe(2); // main + pr1 have changes
      });

      it('calculates total including all worktree types', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(true);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([
          {
            path: '/test/repo',
            name: 'repo',
            branch: 'main',
            commit: 'abc123',
            type: 'main',
            prNumber: null,
            prState: null,
            isDraft: null,
            hasChanges: false,
          },
          {
            path: '/test/repo.pr1',
            name: 'repo.pr1',
            branch: 'feature/local',
            commit: 'pr1abc',
            type: 'pr',
            prNumber: 1,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: false,
          },
          {
            path: '[remote]',
            name: 'PR #10',
            branch: 'feature/remote',
            commit: 'rem1abc',
            type: 'remote_pr',
            prNumber: 10,
            prState: 'OPEN',
            isDraft: false,
            hasChanges: false,
            prTitle: 'Remote PR',
            prUrl: 'https://github.com/test/repo/pull/10',
          },
          {
            path: '/test/branch-wt',
            name: 'branch-wt',
            branch: 'feature/no-pr',
            commit: 'branchabc',
            type: 'branch',
            prNumber: null,
            prState: null,
            isDraft: null,
            hasChanges: false,
          },
        ]);

        const result = await listWorktrees({ showStatus: true });

        expect(result.success).toBe(true);
        expect(result.data?.total).toBe(4); // main + pr + remote_pr + branch
      });
    });

    describe('warnings', () => {
      it('adds warning when gh is not installed but showStatus is requested', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(false);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([]);

        const result = await listWorktrees({ showStatus: true });

        expect(result.success).toBe(true);
        expect(result.warnings).toBeDefined();
        expect(result.warnings).toContain(
          'GitHub CLI (gh) not installed. PR status will not be shown.'
        );
      });

      it('does not add warning when showStatus is false', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/test/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(false);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([]);

        const result = await listWorktrees({ showStatus: false });

        expect(result.success).toBe(true);
        expect(result.warnings).toBeUndefined();
      });
    });

    describe('cwd option', () => {
      it('passes cwd to getRepoRoot', async () => {
        vi.mocked(git.getRepoRoot).mockReturnValue('/custom/path/repo');
        vi.mocked(github.isGhInstalled).mockReturnValue(true);
        vi.mocked(gatherWorktreeInfo).mockResolvedValue([]);

        await listWorktrees({ cwd: '/custom/path' });

        expect(git.getRepoRoot).toHaveBeenCalledWith('/custom/path');
      });
    });
  });
});
