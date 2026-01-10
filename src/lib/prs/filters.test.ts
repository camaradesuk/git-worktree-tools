/**
 * Tests for PR filter state management
 */

import { describe, it, expect } from 'vitest';
import {
  toggleStateFilter,
  setExclusiveState,
  setAllStates,
  cycleDraftFilter,
  cycleWorktreeFilter,
  toggleLabelFilter,
  setAuthorFilter,
  setSearchQuery,
  clearFilters,
  isDefaultFilters,
  describeFilters,
  handleFilterShortcut,
} from './filters.js';
import type { PrFilterState } from './types.js';
import { createDefaultFilterState } from './types.js';

describe('filters', () => {
  describe('toggleStateFilter', () => {
    it('should add state when not present', () => {
      const filters = createDefaultFilterState(); // has OPEN
      const result = toggleStateFilter(filters, 'MERGED');
      expect(result.states.has('OPEN')).toBe(true);
      expect(result.states.has('MERGED')).toBe(true);
    });

    it('should remove state when present and not last', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        states: new Set(['OPEN', 'MERGED']),
      };
      const result = toggleStateFilter(filters, 'MERGED');
      expect(result.states.has('OPEN')).toBe(true);
      expect(result.states.has('MERGED')).toBe(false);
    });

    it('should not remove last state', () => {
      const filters = createDefaultFilterState(); // only OPEN
      const result = toggleStateFilter(filters, 'OPEN');
      expect(result.states.has('OPEN')).toBe(true);
      expect(result.states.size).toBe(1);
    });

    it('should not mutate original filters', () => {
      const filters = createDefaultFilterState();
      const originalSize = filters.states.size;
      toggleStateFilter(filters, 'MERGED');
      expect(filters.states.size).toBe(originalSize);
    });
  });

  describe('setExclusiveState', () => {
    it('should set single state', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        states: new Set(['OPEN', 'MERGED', 'CLOSED']),
      };
      const result = setExclusiveState(filters, 'CLOSED');
      expect(result.states.size).toBe(1);
      expect(result.states.has('CLOSED')).toBe(true);
    });
  });

  describe('setAllStates', () => {
    it('should set all three states', () => {
      const filters = createDefaultFilterState();
      const result = setAllStates(filters);
      expect(result.states.size).toBe(3);
      expect(result.states.has('OPEN')).toBe(true);
      expect(result.states.has('MERGED')).toBe(true);
      expect(result.states.has('CLOSED')).toBe(true);
    });
  });

  describe('cycleDraftFilter', () => {
    it('should cycle true -> only', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: true,
      };
      const result = cycleDraftFilter(filters);
      expect(result.showDrafts).toBe('only');
    });

    it('should cycle only -> false', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: 'only',
      };
      const result = cycleDraftFilter(filters);
      expect(result.showDrafts).toBe(false);
    });

    it('should cycle false -> true', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: false,
      };
      const result = cycleDraftFilter(filters);
      expect(result.showDrafts).toBe(true);
    });
  });

  describe('cycleWorktreeFilter', () => {
    it('should cycle null -> true', () => {
      const filters = createDefaultFilterState();
      const result = cycleWorktreeFilter(filters);
      expect(result.hasWorktree).toBe(true);
    });

    it('should cycle true -> false', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        hasWorktree: true,
      };
      const result = cycleWorktreeFilter(filters);
      expect(result.hasWorktree).toBe(false);
    });

    it('should cycle false -> null', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        hasWorktree: false,
      };
      const result = cycleWorktreeFilter(filters);
      expect(result.hasWorktree).toBe(null);
    });
  });

  describe('toggleLabelFilter', () => {
    it('should add label when not present', () => {
      const filters = createDefaultFilterState();
      const result = toggleLabelFilter(filters, 'preview');
      expect(result.labels).toContain('preview');
    });

    it('should remove label when present', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        labels: ['preview', 'bug'],
      };
      const result = toggleLabelFilter(filters, 'preview');
      expect(result.labels).not.toContain('preview');
      expect(result.labels).toContain('bug');
    });

    it('should match labels case-insensitively', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        labels: ['Preview'],
      };
      const result = toggleLabelFilter(filters, 'preview');
      expect(result.labels).not.toContain('Preview');
    });
  });

  describe('setAuthorFilter', () => {
    it('should set author', () => {
      const filters = createDefaultFilterState();
      const result = setAuthorFilter(filters, 'chris');
      expect(result.author).toBe('chris');
    });

    it('should clear author with null', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        author: 'chris',
      };
      const result = setAuthorFilter(filters, null);
      expect(result.author).toBe(null);
    });
  });

  describe('setSearchQuery', () => {
    it('should set search query', () => {
      const filters = createDefaultFilterState();
      const result = setSearchQuery(filters, 'dark mode');
      expect(result.searchQuery).toBe('dark mode');
    });
  });

  describe('clearFilters', () => {
    it('should reset to default state', () => {
      const result = clearFilters();
      expect(result.states.size).toBe(1);
      expect(result.states.has('OPEN')).toBe(true);
      expect(result.showDrafts).toBe(true);
      expect(result.labels).toEqual([]);
      expect(result.author).toBe(null);
      expect(result.hasWorktree).toBe(null);
      expect(result.searchQuery).toBe('');
    });
  });

  describe('isDefaultFilters', () => {
    it('should return true for default filters', () => {
      const filters = createDefaultFilterState();
      expect(isDefaultFilters(filters)).toBe(true);
    });

    it('should return false when states differ', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        states: new Set(['OPEN', 'MERGED']),
      };
      expect(isDefaultFilters(filters)).toBe(false);
    });

    it('should return false when showDrafts differs', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: false,
      };
      expect(isDefaultFilters(filters)).toBe(false);
    });

    it('should return false when labels present', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        labels: ['bug'],
      };
      expect(isDefaultFilters(filters)).toBe(false);
    });

    it('should return false when author set', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        author: 'chris',
      };
      expect(isDefaultFilters(filters)).toBe(false);
    });

    it('should return false when hasWorktree set', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        hasWorktree: true,
      };
      expect(isDefaultFilters(filters)).toBe(false);
    });

    it('should return false when search query set', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        searchQuery: 'test',
      };
      expect(isDefaultFilters(filters)).toBe(false);
    });
  });

  describe('describeFilters', () => {
    it('should describe default as "all" for open only', () => {
      const filters = createDefaultFilterState();
      expect(describeFilters(filters)).toBe('open');
    });

    it('should describe multiple states', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        states: new Set(['OPEN', 'MERGED']),
      };
      const desc = describeFilters(filters);
      expect(desc).toContain('open');
      expect(desc).toContain('merged');
    });

    it('should describe drafts only', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: 'only',
      };
      expect(describeFilters(filters)).toContain('drafts only');
    });

    it('should describe no drafts', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        showDrafts: false,
      };
      expect(describeFilters(filters)).toContain('no drafts');
    });

    it('should describe with worktree', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        hasWorktree: true,
      };
      expect(describeFilters(filters)).toContain('with worktree');
    });

    it('should describe without worktree', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        hasWorktree: false,
      };
      expect(describeFilters(filters)).toContain('without worktree');
    });

    it('should describe labels', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        labels: ['preview', 'bug'],
      };
      expect(describeFilters(filters)).toContain('labels: preview, bug');
    });

    it('should describe author', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        author: 'chris',
      };
      expect(describeFilters(filters)).toContain('by @chris');
    });

    it('should describe search query', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        searchQuery: 'dark mode',
      };
      expect(describeFilters(filters)).toContain('"dark mode"');
    });
  });

  describe('handleFilterShortcut', () => {
    it('should handle "o" to toggle OPEN', () => {
      const filters: PrFilterState = {
        ...createDefaultFilterState(),
        states: new Set(['OPEN', 'MERGED']),
      };
      const result = handleFilterShortcut('o', filters);
      expect(result).not.toBe(null);
      expect(result!.states.has('OPEN')).toBe(false);
    });

    it('should handle "m" to toggle MERGED', () => {
      const filters = createDefaultFilterState();
      const result = handleFilterShortcut('m', filters);
      expect(result).not.toBe(null);
      expect(result!.states.has('MERGED')).toBe(true);
    });

    it('should handle "x" to toggle CLOSED', () => {
      const filters = createDefaultFilterState();
      const result = handleFilterShortcut('x', filters);
      expect(result).not.toBe(null);
      expect(result!.states.has('CLOSED')).toBe(true);
    });

    it('should handle "d" to cycle draft filter', () => {
      const filters = createDefaultFilterState();
      const result = handleFilterShortcut('d', filters);
      expect(result).not.toBe(null);
      expect(result!.showDrafts).toBe('only');
    });

    it('should return null for unhandled key', () => {
      const filters = createDefaultFilterState();
      const result = handleFilterShortcut('z', filters);
      expect(result).toBe(null);
    });
  });
});
