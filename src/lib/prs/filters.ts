/**
 * Filter state management for PR browser
 */

import type { PrFilterState } from './types.js';

/** PR state type */
export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

/**
 * Toggle a state filter on/off
 */
export function toggleStateFilter(filters: PrFilterState, state: PrState): PrFilterState {
  const newStates = new Set(filters.states);
  if (newStates.has(state)) {
    // Don't allow removing last state - at least one must be selected
    if (newStates.size > 1) {
      newStates.delete(state);
    }
  } else {
    newStates.add(state);
  }
  return { ...filters, states: newStates };
}

/**
 * Set state filter to a single state (exclusive)
 */
export function setExclusiveState(filters: PrFilterState, state: PrState): PrFilterState {
  return { ...filters, states: new Set([state]) };
}

/**
 * Set state filter to show all states
 */
export function setAllStates(filters: PrFilterState): PrFilterState {
  return { ...filters, states: new Set(['OPEN', 'MERGED', 'CLOSED'] as PrState[]) };
}

/**
 * Cycle draft filter: include -> only -> exclude -> include
 */
export function cycleDraftFilter(filters: PrFilterState): PrFilterState {
  let newShowDrafts: boolean | 'only';
  if (filters.showDrafts === true) {
    newShowDrafts = 'only';
  } else if (filters.showDrafts === 'only') {
    newShowDrafts = false;
  } else {
    newShowDrafts = true;
  }
  return { ...filters, showDrafts: newShowDrafts };
}

/**
 * Toggle worktree filter: null -> true -> false -> null
 */
export function cycleWorktreeFilter(filters: PrFilterState): PrFilterState {
  let newHasWorktree: boolean | null;
  if (filters.hasWorktree === null) {
    newHasWorktree = true;
  } else if (filters.hasWorktree === true) {
    newHasWorktree = false;
  } else {
    newHasWorktree = null;
  }
  return { ...filters, hasWorktree: newHasWorktree };
}

/**
 * Toggle a label in the filter
 */
export function toggleLabelFilter(filters: PrFilterState, label: string): PrFilterState {
  const newLabels = [...filters.labels];
  const index = newLabels.findIndex((l) => l.toLowerCase() === label.toLowerCase());
  if (index >= 0) {
    newLabels.splice(index, 1);
  } else {
    newLabels.push(label);
  }
  return { ...filters, labels: newLabels };
}

/**
 * Set the author filter
 */
export function setAuthorFilter(filters: PrFilterState, author: string | null): PrFilterState {
  return { ...filters, author };
}

/**
 * Set the search query
 */
export function setSearchQuery(filters: PrFilterState, searchQuery: string): PrFilterState {
  return { ...filters, searchQuery };
}

/**
 * Clear all filters (reset to default open-only state)
 */
export function clearFilters(): PrFilterState {
  return {
    states: new Set(['OPEN'] as PrState[]),
    showDrafts: true,
    labels: [],
    author: null,
    hasWorktree: null,
    searchQuery: '',
  };
}

/**
 * Check if filters are at default state (only open PRs, no other filters)
 */
export function isDefaultFilters(filters: PrFilterState): boolean {
  return (
    filters.states.size === 1 &&
    filters.states.has('OPEN') &&
    filters.showDrafts === true &&
    filters.labels.length === 0 &&
    filters.author === null &&
    filters.hasWorktree === null &&
    filters.searchQuery === ''
  );
}

/**
 * Get human-readable description of active filters
 */
export function describeFilters(filters: PrFilterState): string {
  const parts: string[] = [];

  // States
  const stateNames = Array.from(filters.states).map((s) => s.toLowerCase());
  if (stateNames.length < 3) {
    parts.push(stateNames.join(', '));
  }

  // Drafts
  if (filters.showDrafts === 'only') {
    parts.push('drafts only');
  } else if (filters.showDrafts === false) {
    parts.push('no drafts');
  }

  // Worktree
  if (filters.hasWorktree === true) {
    parts.push('with worktree');
  } else if (filters.hasWorktree === false) {
    parts.push('without worktree');
  }

  // Labels
  if (filters.labels.length > 0) {
    parts.push(`labels: ${filters.labels.join(', ')}`);
  }

  // Author
  if (filters.author) {
    parts.push(`by @${filters.author}`);
  }

  // Search
  if (filters.searchQuery) {
    parts.push(`"${filters.searchQuery}"`);
  }

  return parts.length > 0 ? parts.join(' + ') : 'all';
}

/**
 * Handle keyboard shortcut for filter toggles
 * Returns updated filter state or null if key not handled
 */
export function handleFilterShortcut(key: string, filters: PrFilterState): PrFilterState | null {
  switch (key) {
    case 'o':
      return toggleStateFilter(filters, 'OPEN');
    case 'm':
      return toggleStateFilter(filters, 'MERGED');
    case 'x':
      return toggleStateFilter(filters, 'CLOSED');
    case 'd':
      return cycleDraftFilter(filters);
    default:
      return null;
  }
}
