/**
 * Tests for PR detail view
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDetailHeader,
  formatDetailMetadata,
  formatDetailLabels,
  formatDetailReviews,
  formatDetailCI,
  formatDetailChanges,
  formatDetailWorktree,
  formatDetailActions,
  formatPrDetailView,
  showPrDetail,
  createDefaultDetailDeps,
  type PrDetailDeps,
} from './details.js';
import type { PrDisplayItem } from './types.js';

// Helper to create mock PR display items
function createMockPr(overrides: Partial<PrDisplayItem> = {}): PrDisplayItem {
  return {
    number: 42,
    title: 'Add dark mode toggle',
    state: 'OPEN',
    isDraft: false,
    url: 'https://github.com/test/repo/pull/42',
    headBranch: 'feat/dark-mode',
    baseBranch: 'main',
    author: 'testuser',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
    labels: ['enhancement', 'frontend'],
    reviewDecision: 'APPROVED',
    approvalCount: 2,
    reviewCount: 2,
    checksStatus: 'SUCCESS',
    additions: 342,
    deletions: 89,
    changedFiles: 12,
    hasWorktree: true,
    worktreePath: '../repo.pr42',
    ...overrides,
  };
}

describe('details', () => {
  describe('formatDetailHeader', () => {
    it('should include PR number', () => {
      const pr = createMockPr({ number: 123 });
      const result = formatDetailHeader(pr);
      expect(result).toContain('#123');
    });

    it('should include box characters', () => {
      const pr = createMockPr();
      const result = formatDetailHeader(pr);
      expect(result).toContain('╔');
      expect(result).toContain('╚');
    });
  });

  describe('formatDetailMetadata', () => {
    it('should include title', () => {
      const pr = createMockPr({ title: 'My Amazing Feature' });
      const result = formatDetailMetadata(pr);
      expect(result).toContain('My Amazing Feature');
    });

    it('should include author', () => {
      const pr = createMockPr({ author: 'alice' });
      const result = formatDetailMetadata(pr);
      expect(result).toContain('@alice');
    });

    it('should include branch info', () => {
      const pr = createMockPr({ headBranch: 'feat/test', baseBranch: 'main' });
      const result = formatDetailMetadata(pr);
      expect(result).toContain('feat/test');
      expect(result).toContain('main');
    });

    it('should show draft status', () => {
      const pr = createMockPr({ isDraft: true });
      const result = formatDetailMetadata(pr);
      expect(result).toContain('DRAFT');
    });

    it('should show ready for review for open non-draft', () => {
      const pr = createMockPr({ isDraft: false, state: 'OPEN' });
      const result = formatDetailMetadata(pr);
      expect(result).toContain('Ready for review');
    });
  });

  describe('formatDetailLabels', () => {
    it('should show none when no labels', () => {
      const pr = createMockPr({ labels: [] });
      const result = formatDetailLabels(pr);
      expect(result).toContain('none');
    });

    it('should show labels in brackets', () => {
      const pr = createMockPr({ labels: ['bug', 'urgent'] });
      const result = formatDetailLabels(pr);
      expect(result).toContain('[bug]');
      expect(result).toContain('[urgent]');
    });
  });

  describe('formatDetailReviews', () => {
    it('should show approved with count', () => {
      const pr = createMockPr({ reviewDecision: 'APPROVED', approvalCount: 3 });
      const result = formatDetailReviews(pr);
      expect(result).toContain('Approved');
      expect(result).toContain('3 approvals');
    });

    it('should show singular for 1 approval', () => {
      const pr = createMockPr({ reviewDecision: 'APPROVED', approvalCount: 1 });
      const result = formatDetailReviews(pr);
      expect(result).toContain('1 approval');
      expect(result).not.toContain('approvals');
    });

    it('should show changes requested', () => {
      const pr = createMockPr({ reviewDecision: 'CHANGES_REQUESTED' });
      const result = formatDetailReviews(pr);
      expect(result).toContain('Changes requested');
    });

    it('should show review required', () => {
      const pr = createMockPr({ reviewDecision: 'REVIEW_REQUIRED' });
      const result = formatDetailReviews(pr);
      expect(result).toContain('Review required');
    });

    it('should show review count when no decision but has reviews', () => {
      const pr = createMockPr({ reviewDecision: null, reviewCount: 2 });
      const result = formatDetailReviews(pr);
      expect(result).toContain('2 reviews');
    });

    it('should show no reviews yet', () => {
      const pr = createMockPr({ reviewDecision: null, reviewCount: 0 });
      const result = formatDetailReviews(pr);
      expect(result).toContain('No reviews yet');
    });
  });

  describe('formatDetailCI', () => {
    it('should show all checks passing for SUCCESS', () => {
      const pr = createMockPr({ checksStatus: 'SUCCESS' });
      const result = formatDetailCI(pr);
      expect(result).toContain('All checks passing');
    });

    it('should show checks failing for FAILURE', () => {
      const pr = createMockPr({ checksStatus: 'FAILURE' });
      const result = formatDetailCI(pr);
      expect(result).toContain('checks failing');
    });

    it('should show checks pending for PENDING', () => {
      const pr = createMockPr({ checksStatus: 'PENDING' });
      const result = formatDetailCI(pr);
      expect(result).toContain('Checks pending');
    });

    it('should show no CI checks for null', () => {
      const pr = createMockPr({ checksStatus: null });
      const result = formatDetailCI(pr);
      expect(result).toContain('No CI checks');
    });
  });

  describe('formatDetailChanges', () => {
    it('should show additions and deletions', () => {
      const pr = createMockPr({ additions: 100, deletions: 50 });
      const result = formatDetailChanges(pr);
      expect(result).toContain('+100');
      expect(result).toContain('-50');
    });

    it('should show file count', () => {
      const pr = createMockPr({ changedFiles: 5 });
      const result = formatDetailChanges(pr);
      expect(result).toContain('5 files');
    });

    it('should show singular for 1 file', () => {
      const pr = createMockPr({ changedFiles: 1 });
      const result = formatDetailChanges(pr);
      expect(result).toContain('1 file');
      expect(result).not.toContain('1 files');
    });
  });

  describe('formatDetailWorktree', () => {
    it('should show worktree path when exists', () => {
      const pr = createMockPr({ hasWorktree: true, worktreePath: '/path/to/worktree' });
      const result = formatDetailWorktree(pr);
      expect(result).toContain('/path/to/worktree');
    });

    it('should show not created when no worktree', () => {
      const pr = createMockPr({ hasWorktree: false, worktreePath: null });
      const result = formatDetailWorktree(pr);
      expect(result).toContain('Not created');
    });
  });

  describe('formatDetailActions', () => {
    it('should show open worktree when has worktree', () => {
      const pr = createMockPr({ hasWorktree: true });
      const result = formatDetailActions(pr);
      expect(result).toContain('Open worktree');
      expect(result).toContain('[e]');
      expect(result).toContain('[t]');
    });

    it('should show create worktree when no worktree', () => {
      const pr = createMockPr({ hasWorktree: false });
      const result = formatDetailActions(pr);
      expect(result).toContain('Create worktree');
    });

    it('should include browser and copy actions', () => {
      const pr = createMockPr();
      const result = formatDetailActions(pr);
      expect(result).toContain('[b]');
      expect(result).toContain('[c]');
      expect(result).toContain('[n]');
    });
  });

  describe('formatPrDetailView', () => {
    it('should include all sections', () => {
      const pr = createMockPr();
      const result = formatPrDetailView(pr);

      expect(result).toContain('#42'); // Header
      expect(result).toContain('Add dark mode toggle'); // Title
      expect(result).toContain('@testuser'); // Author
      expect(result).toContain('enhancement'); // Labels
      expect(result).toContain('Approved'); // Reviews
      expect(result).toContain('passing'); // CI
      expect(result).toContain('+342'); // Changes
      expect(result).toContain('repo.pr42'); // Worktree
      expect(result).toContain('[w]'); // Actions
    });
  });

  describe('showPrDetail', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;
    let clearSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      clearSpy.mockRestore();
    });

    it('should return back action on q key', async () => {
      const pr = createMockPr();
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('q'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('back');
    });

    it('should return back action on escape', async () => {
      const pr = createMockPr();
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('back'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('back');
    });

    it('should return create_worktree for w key when no worktree', async () => {
      const pr = createMockPr({ hasWorktree: false });
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('w'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('create_worktree');
    });

    it('should return open_worktree for w key when has worktree', async () => {
      const pr = createMockPr({ hasWorktree: true });
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('w'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('open_worktree');
    });

    it('should return open_browser for b key', async () => {
      const pr = createMockPr();
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('b'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('open_browser');
    });

    it('should return open_editor for e key when has worktree', async () => {
      const pr = createMockPr({ hasWorktree: true });
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('e'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('open_editor');
    });

    it('should ignore e key when no worktree and wait for another key', async () => {
      const pr = createMockPr({ hasWorktree: false });
      let callCount = 0;
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve('e');
          return Promise.resolve('q');
        }),
      };

      const result = await showPrDetail(pr, deps);
      expect(callCount).toBe(2);
      expect(result).toBe('back');
    });

    it('should return open_terminal for t key when has worktree', async () => {
      const pr = createMockPr({ hasWorktree: true });
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('t'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('open_terminal');
    });

    it('should return copy_url for c key', async () => {
      const pr = createMockPr();
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('c'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('copy_url');
    });

    it('should return copy_number for n key', async () => {
      const pr = createMockPr();
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('n'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('copy_number');
    });

    it('should return refresh for r key', async () => {
      const pr = createMockPr();
      const deps: PrDetailDeps = {
        waitForKey: vi.fn().mockResolvedValue('r'),
      };

      const result = await showPrDetail(pr, deps);
      expect(result).toBe('refresh');
    });
  });

  describe('createDefaultDetailDeps', () => {
    it('should return deps object with waitForKey function', () => {
      const deps = createDefaultDetailDeps();
      expect(deps).toHaveProperty('waitForKey');
      expect(typeof deps.waitForKey).toBe('function');
    });
  });
});
