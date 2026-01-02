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
  /** Enable interactive mode (undefined = auto-detect based on TTY) */
  interactive?: boolean;
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
  prState: 'OPEN' | 'CLOSED' | 'MERGED' | null;
  /** Whether the PR is a draft (null for non-PR worktrees) */
  isDraft: boolean | null;
  hasChanges: boolean;
}

/**
 * Available actions that can be performed on a worktree
 */
export type WorktreeAction =
  | 'open_editor'
  | 'open_terminal'
  | 'copy_path'
  | 'show_details'
  | 'open_pr_url'
  | 'create_pr'
  | 'remove_worktree'
  | 'link_configs'
  | 'back'
  | 'exit';

/**
 * Menu item for action selection
 */
export interface ActionMenuItem {
  name: string;
  value: WorktreeAction;
  /** Can be disabled with a reason string */
  disabled?: boolean | string;
  /** Keyboard shortcut for this action */
  shortcut?: string;
}

/**
 * Result from executing an action
 */
export interface ActionResult {
  success: boolean;
  message?: string;
  /** Whether to exit the interactive loop */
  shouldExit?: boolean;
  /** Whether to refresh the worktree list */
  shouldRefresh?: boolean;
}

/**
 * Git version information
 */
export interface GitVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Environment information for action availability
 */
export interface EnvironmentInfo {
  hasVscode: boolean;
  hasCursor: boolean;
  defaultEditor: 'vscode' | 'cursor' | null;
  platform: 'win32' | 'darwin' | 'linux';
  isInteractive: boolean;
  shell: string;
  gitVersion: GitVersion;
  /** Whether running in Windows Subsystem for Linux */
  isWSL: boolean;
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
