/**
 * cleanpr types - shared type definitions
 */

/**
 * CLI options for cleanpr command
 */
export interface CleanOptions {
  deleteRemote: boolean;
  force: boolean;
  all: boolean;
  interactive: boolean;

  // AI-friendly options (Phase 1)
  /** Output result as JSON for programmatic parsing */
  json: boolean;
  /** Preview what would be cleaned without making changes */
  dryRun: boolean;

  // Logging options
  /** Enable verbose debug output (--verbose flag) */
  verbose?: boolean;
  /** Suppress all output except errors (--quiet flag) */
  quiet?: boolean;
  /** Disable colored output (--no-color flag) */
  noColor?: boolean;
}

/**
 * PR state from GitHub
 */
export type PrState = 'OPEN' | 'CLOSED' | 'MERGED' | 'UNKNOWN';

/**
 * Worktree information for cleanup
 */
export interface WorktreeInfo {
  path: string;
  branch: string | null;
  commit: string;
  prNumber: number;
  prState: PrState;
  hasChanges: boolean;
}

/**
 * Result from argument parsing - discriminated union
 */
export type ParseResult =
  | { kind: 'success'; prNumber: number | null; options: CleanOptions }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

/**
 * Result from cleanup operation
 */
export interface CleanupResult {
  success: boolean;
  prNumber: number;
  message: string;
  /** Whether local branch was deleted */
  localBranchDeleted: boolean;
  /** Whether remote branch was deleted */
  remoteBranchDeleted: boolean;
  /** Set to true when this is a dry-run preview */
  dryRun?: boolean;
}
