import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatRelativeTime,
  formatStateBadge,
  formatDraftBadge,
  formatWorktreeIndicator,
  formatReviewStatus,
  formatCIStatus,
  formatLabelBadge,
  truncate,
  getPrBadgeText,
  computeMaxPrNumberWidth,
  computeMaxPrBadgeWidth,
  formatPrColumnHeader,
  formatPrColumnSeparator,
  formatPrListItem,
  formatPrListHeader,
  formatPrSummary,
  formatFilterIndicator,
  formatShortcutLegend,
  formatPrTable,
} from './formatters.js';
import type { PrDisplayItem, PrFilterState } from './types.js';

// Helper to strip ANSI codes for comparison
// eslint-disable-next-line no-control-regex
const stripAnsi = (str: string): string => str.replace(/\x1b\[[0-9;]*m/g, '');

// Create a mock PR for testing
function createMockPr(overrides: Partial<PrDisplayItem> = {}): PrDisplayItem {
  return {
    number: 123,
    state: 'OPEN',
    title: 'Test PR',
    author: 'testuser',
    url: 'https://github.com/test/repo/pull/123',
    headBranch: 'feature-branch',
    baseBranch: 'main',
    isDraft: false,
    labels: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasWorktree: false,
    worktreePath: null,
    reviewDecision: null,
    approvalCount: 0,
    reviewCount: 0,
    checksStatus: null,
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    ...overrides,
  };
}

describe('formatters', () => {
  describe('formatRelativeTime', () => {
    let realDateNow: () => number;

    beforeEach(() => {
      realDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = realDateNow;
    });

    it('returns "now" for very recent timestamps', () => {
      const now = new Date();
      Date.now = () => now.getTime();
      const result = formatRelativeTime(new Date(now.getTime() - 30000).toISOString()); // 30 seconds ago
      expect(result).toBe('now');
    });

    it('formats minutes correctly', () => {
      const now = new Date();
      Date.now = () => now.getTime();
      const result = formatRelativeTime(new Date(now.getTime() - 30 * 60 * 1000).toISOString()); // 30 min ago
      expect(result).toBe('30m');
    });

    it('formats hours correctly', () => {
      const now = new Date();
      Date.now = () => now.getTime();
      const result = formatRelativeTime(new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()); // 5 hours ago
      expect(result).toBe('5h');
    });

    it('formats days correctly', () => {
      const now = new Date();
      Date.now = () => now.getTime();
      const result = formatRelativeTime(
        new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
      ); // 3 days ago
      expect(result).toBe('3d');
    });

    it('formats weeks correctly', () => {
      const now = new Date();
      Date.now = () => now.getTime();
      const result = formatRelativeTime(
        new Date(now.getTime() - 2 * 7 * 24 * 60 * 60 * 1000).toISOString()
      ); // 2 weeks ago
      expect(result).toBe('2w');
    });

    it('formats months correctly', () => {
      const now = new Date();
      Date.now = () => now.getTime();
      const result = formatRelativeTime(
        new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()
      ); // 60 days ago
      expect(result).toBe('2mo');
    });
  });

  describe('formatStateBadge', () => {
    it('formats OPEN state', () => {
      const result = formatStateBadge('OPEN');
      expect(stripAnsi(result)).toBe('[OPEN]');
    });

    it('formats MERGED state', () => {
      const result = formatStateBadge('MERGED');
      expect(stripAnsi(result)).toBe('[MERGED]');
    });

    it('formats CLOSED state', () => {
      const result = formatStateBadge('CLOSED');
      expect(stripAnsi(result)).toBe('[CLOSED]');
    });
  });

  describe('formatDraftBadge', () => {
    it('returns draft badge when isDraft is true', () => {
      const result = formatDraftBadge(true);
      expect(stripAnsi(result)).toBe('[DRAFT]');
    });

    it('returns empty string when isDraft is false', () => {
      const result = formatDraftBadge(false);
      expect(result).toBe('');
    });
  });

  describe('formatWorktreeIndicator', () => {
    it('returns WT indicator when has worktree', () => {
      const result = formatWorktreeIndicator(true);
      expect(stripAnsi(result)).toBe('WT');
    });

    it('returns empty string when no worktree', () => {
      const result = formatWorktreeIndicator(false);
      expect(result).toBe('');
    });
  });

  describe('formatReviewStatus', () => {
    it('formats APPROVED with checkmark and count', () => {
      const result = formatReviewStatus('APPROVED', 2);
      expect(stripAnsi(result)).toContain('2');
    });

    it('formats CHANGES_REQUESTED with X', () => {
      const result = formatReviewStatus('CHANGES_REQUESTED', 0);
      expect(stripAnsi(result)).toBe('✗');
    });

    it('formats REVIEW_REQUIRED with circle', () => {
      const result = formatReviewStatus('REVIEW_REQUIRED', 0);
      expect(stripAnsi(result)).toBe('○');
    });

    it('returns empty string for null', () => {
      const result = formatReviewStatus(null, 0);
      expect(result).toBe('');
    });
  });

  describe('formatCIStatus', () => {
    it('formats SUCCESS with circle', () => {
      const result = formatCIStatus('SUCCESS');
      expect(stripAnsi(result)).toBe('●');
    });

    it('formats FAILURE with circle', () => {
      const result = formatCIStatus('FAILURE');
      expect(stripAnsi(result)).toBe('●');
    });

    it('formats PENDING with circle', () => {
      const result = formatCIStatus('PENDING');
      expect(stripAnsi(result)).toBe('○');
    });

    it('returns empty string for null', () => {
      const result = formatCIStatus(null);
      expect(result).toBe('');
    });
  });

  describe('formatLabelBadge', () => {
    it('formats label with brackets', () => {
      const result = formatLabelBadge('preview');
      expect(stripAnsi(result)).toBe('[preview]');
    });
  });

  describe('truncate', () => {
    it('returns text unchanged if shorter than max length', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('returns text unchanged if equal to max length', () => {
      expect(truncate('exact', 5)).toBe('exact');
    });

    it('truncates and adds ellipsis for longer text', () => {
      expect(truncate('this is a long string', 10)).toBe('this is...');
    });
  });

  describe('getPrBadgeText', () => {
    it('returns PR number with hash', () => {
      const pr = createMockPr({ number: 123 });
      expect(getPrBadgeText(pr)).toBe('#123');
    });
  });

  describe('computeMaxPrNumberWidth', () => {
    it('returns 4 for empty array', () => {
      expect(computeMaxPrNumberWidth([])).toBe(4);
    });

    it('computes width based on largest PR number', () => {
      const prs = [
        createMockPr({ number: 5 }),
        createMockPr({ number: 100 }),
        createMockPr({ number: 50 }),
      ];
      expect(computeMaxPrNumberWidth(prs)).toBe(4); // "#100" is 4 chars
    });

    it('handles single-digit PR numbers', () => {
      const prs = [createMockPr({ number: 1 })];
      expect(computeMaxPrNumberWidth(prs)).toBe(2); // "#1" is 2 chars
    });
  });

  describe('computeMaxPrBadgeWidth', () => {
    it('returns same value as computeMaxPrNumberWidth', () => {
      const prs = [createMockPr({ number: 100 })];
      expect(computeMaxPrBadgeWidth(prs)).toBe(computeMaxPrNumberWidth(prs));
    });
  });

  describe('formatPrColumnHeader', () => {
    it('includes all column headers', () => {
      const result = stripAnsi(formatPrColumnHeader(5));
      expect(result).toContain('PR');
      expect(result).toContain('STATE');
      expect(result).toContain('TITLE');
      expect(result).toContain('AUTHOR');
      expect(result).toContain('AGE');
      expect(result).toContain('WT');
      expect(result).toContain('RV');
      expect(result).toContain('CI');
    });
  });

  describe('formatPrColumnSeparator', () => {
    it('returns a line of dashes', () => {
      const result = stripAnsi(formatPrColumnSeparator(5));
      expect(result).toMatch(/^─+$/);
    });
  });

  describe('formatPrListItem', () => {
    it('formats basic PR info', () => {
      const pr = createMockPr({
        number: 42,
        state: 'OPEN',
        title: 'Add feature',
        author: 'dev',
      });
      const result = stripAnsi(formatPrListItem(pr, 4));
      expect(result).toContain('#42');
      expect(result).toContain('[OPEN]');
      expect(result).toContain('Add feature');
      expect(result).toContain('@dev');
    });

    it('includes draft badge for draft PRs', () => {
      const pr = createMockPr({ isDraft: true });
      const result = stripAnsi(formatPrListItem(pr, 4));
      expect(result).toContain('[DRAFT]');
    });

    it('includes WT indicator for PRs with worktree', () => {
      const pr = createMockPr({ hasWorktree: true });
      const result = stripAnsi(formatPrListItem(pr, 4));
      expect(result).toContain('WT');
    });

    it('adds star for preview label PRs', () => {
      const pr = createMockPr({ labels: ['preview'] });
      const result = stripAnsi(formatPrListItem(pr, 4, 'preview'));
      expect(result).toContain('★');
    });

    it('highlights search pattern in title', () => {
      const pr = createMockPr({ title: 'Fix the bug in login' });
      const result = formatPrListItem(pr, 4, undefined, 'bug');
      // Should contain highlighted "bug" (bold + yellow)
      expect(result).toContain('bug');
    });
  });

  describe('formatPrListHeader', () => {
    it('includes repo name', () => {
      const result = stripAnsi(formatPrListHeader('my-repo'));
      expect(result).toContain('my-repo');
      expect(result).toContain('Pull Requests');
    });

    it('uses box drawing characters', () => {
      const result = formatPrListHeader('repo');
      expect(result).toContain('╔');
      expect(result).toContain('╚');
    });
  });

  describe('formatPrSummary', () => {
    it('shows total count', () => {
      const prs = [createMockPr(), createMockPr(), createMockPr()];
      const result = stripAnsi(formatPrSummary(prs));
      expect(result).toContain('3 PRs');
    });

    it('shows open count', () => {
      const prs = [createMockPr({ state: 'OPEN' }), createMockPr({ state: 'MERGED' })];
      const result = stripAnsi(formatPrSummary(prs));
      expect(result).toContain('1 open');
    });

    it('shows draft count', () => {
      const prs = [createMockPr({ isDraft: true }), createMockPr({ isDraft: false })];
      const result = stripAnsi(formatPrSummary(prs));
      expect(result).toContain('1 drafts');
    });

    it('shows worktree count', () => {
      const prs = [createMockPr({ hasWorktree: true }), createMockPr({ hasWorktree: false })];
      const result = stripAnsi(formatPrSummary(prs));
      expect(result).toContain('1 with worktrees');
    });
  });

  describe('formatFilterIndicator', () => {
    it('shows "all" when all states selected', () => {
      const filters: PrFilterState = {
        states: new Set(['OPEN', 'MERGED', 'CLOSED']),
        showDrafts: true,
        labels: [],
        hasWorktree: false,
        author: null,
        searchQuery: '',
      };
      const result = stripAnsi(formatFilterIndicator(filters));
      expect(result).toContain('Showing: all');
    });

    it('shows "open" when only open selected', () => {
      const filters: PrFilterState = {
        states: new Set(['OPEN']),
        showDrafts: true,
        labels: [],
        hasWorktree: false,
        author: null,
        searchQuery: '',
      };
      const result = stripAnsi(formatFilterIndicator(filters));
      expect(result).toContain('Showing: open');
    });

    it('shows "drafts only" when drafts filter is "only"', () => {
      const filters: PrFilterState = {
        states: new Set(['OPEN']),
        showDrafts: 'only',
        labels: [],
        hasWorktree: false,
        author: null,
        searchQuery: '',
      };
      const result = stripAnsi(formatFilterIndicator(filters));
      expect(result).toContain('drafts only');
    });

    it('shows "no drafts" when drafts excluded', () => {
      const filters: PrFilterState = {
        states: new Set(['OPEN']),
        showDrafts: false,
        labels: [],
        hasWorktree: false,
        author: null,
        searchQuery: '',
      };
      const result = stripAnsi(formatFilterIndicator(filters));
      expect(result).toContain('no drafts');
    });

    it('shows combined states for multiple non-all selections', () => {
      const filters: PrFilterState = {
        states: new Set(['OPEN', 'MERGED']),
        showDrafts: true,
        labels: [],
        hasWorktree: false,
        author: null,
        searchQuery: '',
      };
      const result = stripAnsi(formatFilterIndicator(filters));
      expect(result).toContain('open+merged');
    });
  });

  describe('formatShortcutLegend', () => {
    it('includes all shortcuts', () => {
      const result = stripAnsi(formatShortcutLegend());
      expect(result).toContain('[w] worktree');
      expect(result).toContain('[b] browser');
      expect(result).toContain('[d] details');
      expect(result).toContain('[f] filter');
      expect(result).toContain('[/] search');
      expect(result).toContain('[r] refresh');
      expect(result).toContain('[q] quit');
    });
  });

  describe('formatPrTable', () => {
    it('returns message for empty PR list', () => {
      const result = stripAnsi(formatPrTable([]));
      expect(result).toBe('No pull requests found.');
    });

    it('formats multiple PRs as table', () => {
      const prs = [
        createMockPr({ number: 1, title: 'First PR' }),
        createMockPr({ number: 2, title: 'Second PR' }),
      ];
      const result = stripAnsi(formatPrTable(prs));
      expect(result).toContain('#1');
      expect(result).toContain('#2');
      expect(result).toContain('First PR');
      expect(result).toContain('Second PR');
    });

    it('includes header and separator', () => {
      const prs = [createMockPr()];
      const result = stripAnsi(formatPrTable(prs));
      expect(result).toContain('PR');
      expect(result).toContain('STATE');
      expect(result).toContain('─');
    });

    it('includes preview label star', () => {
      const prs = [createMockPr({ labels: ['preview'] })];
      const result = stripAnsi(formatPrTable(prs, 'preview'));
      expect(result).toContain('★');
    });
  });
});
