/**
 * Type definitions for PR browser feature
 */

import type {
  PrListItem as GhPrListItem,
  ListPrsExtendedOptions as GhListPrsExtendedOptions,
} from '../github.js';

// Re-export types from github.ts for convenience
export type PrListItem = GhPrListItem;
export type ListPrsExtendedOptions = GhListPrsExtendedOptions;

/**
 * PR display item with worktree correlation
 */
export interface PrDisplayItem extends GhPrListItem {
  /** Whether a local worktree exists for this PR's branch */
  hasWorktree: boolean;
  /** Path to the worktree (if exists) */
  worktreePath: string | null;
}

/**
 * Filter state for PR list
 */
export interface PrFilterState {
  /** Which PR states to show */
  states: Set<'OPEN' | 'MERGED' | 'CLOSED'>;
  /** How to handle drafts: true=include, false=exclude, 'only'=drafts only */
  showDrafts: boolean | 'only';
  /** Filter by labels (show PRs with ANY of these labels) */
  labels: string[];
  /** Filter by author (null = all authors) */
  author: string | null;
  /** Filter by worktree presence: true=only with WT, false=only without, null=all */
  hasWorktree: boolean | null;
  /** Fuzzy search query on title/number/author */
  searchQuery: string;
}

/**
 * Create default filter state (show open PRs)
 */
export function createDefaultFilterState(): PrFilterState {
  return {
    states: new Set(['OPEN']),
    showDrafts: true,
    labels: [],
    author: null,
    hasWorktree: null,
    searchQuery: '',
  };
}

/**
 * Actions available for PRs
 */
export type PrAction =
  | 'create_worktree'
  | 'open_worktree'
  | 'open_browser'
  | 'open_editor'
  | 'open_terminal'
  | 'copy_url'
  | 'copy_number'
  | 'show_details'
  | 'refresh'
  | 'back'
  | 'exit'
  // Filter actions - exclusive state selection (press key = show only that state)
  | 'filter_show_open'
  | 'filter_show_merged'
  | 'filter_show_closed'
  | 'filter_show_all'
  // Filter actions - draft toggle (cycles through include/only/exclude)
  | 'filter_toggle_drafts';

/**
 * Result from executing a PR action
 */
export interface PrActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Optional message to display */
  message?: string;
  /** Whether to refresh the PR list */
  shouldRefresh?: boolean;
  /** Whether to exit the interactive mode */
  shouldExit?: boolean;
}

/**
 * Selection result from the PR list
 */
export interface PrSelectionResult {
  /** Selected PR (null if exit selected) */
  pr: PrDisplayItem | null;
  /** Action triggered by shortcut key (null if Enter pressed) */
  action: PrAction | null;
}

/**
 * Options for the wt prs command
 */
export interface PrsCommandOptions {
  /** State filter */
  state: 'open' | 'closed' | 'merged' | 'all';
  /** Author filter */
  author?: string;
  /** Label filter */
  label?: string[];
  /** Show only drafts */
  draft?: boolean;
  /** Exclude drafts */
  noDraft?: boolean;
  /** Show only PRs with worktrees */
  withWorktree?: boolean;
  /** Maximum PRs to fetch */
  limit: number;
  /** Output as JSON */
  json?: boolean;
  /** Disable interactive mode */
  noInteractive?: boolean;
  /** Force refresh from GitHub */
  refresh?: boolean;
}

/**
 * PR cache entry
 */
export interface PrCacheEntry {
  /** Cached PR list */
  prs: PrListItem[];
  /** When the cache was populated */
  timestamp: number;
  /** Cache TTL in milliseconds */
  ttl: number;
}

/**
 * Dependencies for PR data operations (injectable for testing)
 */
export interface PrDataDeps {
  /** Fetch PRs from GitHub */
  fetchPrs: (options: ListPrsExtendedOptions, cwd?: string) => PrListItem[];
  /** Get worktree list */
  getWorktrees: (cwd?: string) => Array<{ path: string; branch: string | null }>;
  /** Get current time (for cache testing) */
  now: () => number;
}

/**
 * Dependencies for interactive PR browser (injectable for testing)
 */
export interface PrInteractiveDeps {
  /** Select a PR from the list */
  selectPr: (prs: PrDisplayItem[], filterState: PrFilterState) => Promise<PrSelectionResult>;
  /** Show PR detail view */
  showDetails: (pr: PrDisplayItem) => Promise<PrAction>;
  /** Show filter menu */
  showFilterMenu: (currentFilters: PrFilterState) => Promise<PrFilterState | null>;
  /** Wait for user to press Enter */
  pressEnterToContinue: () => Promise<void>;
}

/**
 * JSON output for wt prs --json
 */
export interface PrsJsonOutput {
  /** Whether the command succeeded */
  success: boolean;
  /** Command name */
  command: 'prs';
  /** ISO timestamp */
  timestamp: string;
  /** PR data */
  data: {
    /** Total PRs fetched */
    total: number;
    /** Active filter state */
    filters: {
      states: string[];
      showDrafts: boolean | 'only';
      labels: string[];
      author: string | null;
      hasWorktree: boolean | null;
    };
    /** PR list */
    prs: PrDisplayItem[];
  };
}
