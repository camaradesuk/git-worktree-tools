/**
 * Tests for fuzzy search functionality
 */

import { describe, it, expect } from 'vitest';
import {
  fuzzyScore,
  getSearchableText,
  filterWorktrees,
  highlightMatches,
} from './fuzzy-search.js';
import type { WorktreeDisplay } from './types.js';

describe('fuzzyScore', () => {
  it('returns 0 for empty pattern', () => {
    expect(fuzzyScore('', 'hello')).toBe(0);
  });

  it('returns -1 when pattern is longer than text', () => {
    expect(fuzzyScore('hello world', 'hi')).toBe(-1);
  });

  it('returns high score for exact substring match', () => {
    expect(fuzzyScore('dark', 'add-dark-mode')).toBeGreaterThan(100);
  });

  it('returns higher score for match at start', () => {
    const startScore = fuzzyScore('add', 'add-feature');
    const middleScore = fuzzyScore('feat', 'add-feature');
    expect(startScore).toBeGreaterThan(middleScore);
  });

  it('returns positive score for fuzzy match', () => {
    const score = fuzzyScore('adm', 'add-dark-mode');
    expect(score).toBeGreaterThan(0);
  });

  it('returns -1 when characters do not appear in order', () => {
    expect(fuzzyScore('xyz', 'hello')).toBe(-1);
  });

  it('gives bonus for consecutive matches', () => {
    const consecutiveScore = fuzzyScore('dark', 'dark-mode');
    const spreadScore = fuzzyScore('drmd', 'dark-mode');
    expect(consecutiveScore).toBeGreaterThan(spreadScore);
  });

  it('gives bonus for word boundary matches', () => {
    // 'dm' hits word boundaries: d at start, m after hyphen
    // 'am' has mid-word match: a is mid-word (position 1)
    const boundaryScore = fuzzyScore('dm', 'dark-mode');
    const midScore = fuzzyScore('am', 'dark-mode');
    expect(boundaryScore).toBeGreaterThan(midScore);
  });
});

describe('getSearchableText', () => {
  it('includes branch name', () => {
    const wt: WorktreeDisplay = {
      path: '/path/to/repo',
      name: 'repo',
      branch: 'feat/dark-mode',
      commit: 'abc123',
      type: 'branch',
      prNumber: null,
      prState: null,
      isDraft: null,
      hasChanges: false,
    };
    expect(getSearchableText(wt)).toContain('feat/dark-mode');
  });

  it('includes PR number with # prefix', () => {
    const wt: WorktreeDisplay = {
      path: '/path/to/repo.pr42',
      name: 'repo.pr42',
      branch: 'feat/dark-mode',
      commit: 'abc123',
      type: 'pr',
      prNumber: 42,
      prState: 'OPEN',
      isDraft: false,
      hasChanges: false,
    };
    const text = getSearchableText(wt);
    expect(text).toContain('PR#42');
    expect(text).toContain('#42');
  });

  it('includes PR title', () => {
    const wt: WorktreeDisplay = {
      path: '/path/to/repo.pr42',
      name: 'repo.pr42',
      branch: 'feat/dark-mode',
      commit: 'abc123',
      type: 'pr',
      prNumber: 42,
      prTitle: 'Add dark mode support',
      prState: 'OPEN',
      isDraft: false,
      hasChanges: false,
    };
    expect(getSearchableText(wt)).toContain('Add dark mode support');
  });

  it('includes PR state', () => {
    const wt: WorktreeDisplay = {
      path: '/path/to/repo.pr42',
      name: 'repo.pr42',
      branch: 'feat/dark-mode',
      commit: 'abc123',
      type: 'pr',
      prNumber: 42,
      prState: 'MERGED',
      isDraft: false,
      hasChanges: false,
    };
    expect(getSearchableText(wt)).toContain('MERGED');
  });

  it('includes type', () => {
    const wt: WorktreeDisplay = {
      path: '/path/to/repo',
      name: 'repo',
      branch: 'main',
      commit: 'abc123',
      type: 'main',
      prNumber: null,
      prState: null,
      isDraft: null,
      hasChanges: false,
    };
    expect(getSearchableText(wt)).toContain('main');
  });
});

describe('filterWorktrees', () => {
  const worktrees: WorktreeDisplay[] = [
    {
      path: '/path/to/repo',
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
      path: '/path/to/repo.pr42',
      name: 'repo.pr42',
      branch: 'feat/dark-mode',
      commit: 'def456',
      type: 'pr',
      prNumber: 42,
      prTitle: 'Add dark mode',
      prState: 'OPEN',
      isDraft: false,
      hasChanges: true,
    },
    {
      path: '/path/to/repo.pr43',
      name: 'repo.pr43',
      branch: 'fix/light-theme',
      commit: 'ghi789',
      type: 'pr',
      prNumber: 43,
      prTitle: 'Fix light theme bug',
      prState: 'MERGED',
      isDraft: false,
      hasChanges: false,
    },
  ];

  it('returns all worktrees for empty pattern', () => {
    const results = filterWorktrees(worktrees, '');
    expect(results).toHaveLength(3);
  });

  it('filters by branch name', () => {
    const results = filterWorktrees(worktrees, 'dark');
    expect(results).toHaveLength(1);
    expect(results[0].worktree.branch).toBe('feat/dark-mode');
  });

  it('filters by PR number', () => {
    const results = filterWorktrees(worktrees, '42');
    expect(results).toHaveLength(1);
    expect(results[0].worktree.prNumber).toBe(42);
  });

  it('filters by PR title', () => {
    const results = filterWorktrees(worktrees, 'theme');
    expect(results).toHaveLength(1);
    expect(results[0].worktree.prNumber).toBe(43);
  });

  it('filters by state', () => {
    const results = filterWorktrees(worktrees, 'MERGED');
    expect(results).toHaveLength(1);
    expect(results[0].worktree.prState).toBe('MERGED');
  });

  it('returns results sorted by score (best first)', () => {
    const results = filterWorktrees(worktrees, 'mode');
    expect(results.length).toBeGreaterThan(0);
    // Dark mode should come first as it has "mode" in the title
    expect(results[0].worktree.prTitle).toContain('dark mode');
  });

  it('preserves original indices', () => {
    const results = filterWorktrees(worktrees, 'dark');
    expect(results[0].originalIndex).toBe(1); // Second worktree in original array
  });
});

describe('highlightMatches', () => {
  const highlight = (s: string) => `[${s}]`;

  it('returns unchanged text for empty pattern', () => {
    expect(highlightMatches('hello', '', highlight)).toBe('hello');
  });

  it('highlights exact substring match', () => {
    expect(highlightMatches('dark-mode', 'dark', highlight)).toBe('[dark]-mode');
  });

  it('highlights fuzzy matches', () => {
    expect(highlightMatches('dark-mode', 'dm', highlight)).toBe('[d]ark-[m]ode');
  });

  it('handles case-insensitive matching', () => {
    expect(highlightMatches('DarkMode', 'dark', highlight)).toBe('[Dark]Mode');
  });

  it('handles no match gracefully', () => {
    expect(highlightMatches('hello', 'xyz', highlight)).toBe('hello');
  });
});
