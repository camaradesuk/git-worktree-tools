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
}
