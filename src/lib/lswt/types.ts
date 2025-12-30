/**
 * lswt types - shared type definitions
 */

/**
 * CLI options for lswt command
 */
export interface ListOptions {
  showStatus: boolean;
  json: boolean;
  verbose: boolean;
}

/**
 * Worktree display information
 */
export interface WorktreeDisplay {
  path: string;
  name: string;
  branch: string | null;
  commit: string;
  type: 'main' | 'pr' | 'branch' | 'detached';
  prNumber: number | null;
  prState: string | null;
  hasChanges: boolean;
}

/**
 * Result from argument parsing - discriminated union for pure function
 */
export type ParseResult =
  | { kind: 'success'; options: ListOptions }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

/**
 * Type label with color name for CLI to apply
 */
export interface TypeLabel {
  text: string;
  color: 'cyan' | 'green' | 'yellow' | 'red' | 'blue' | 'dim';
}
