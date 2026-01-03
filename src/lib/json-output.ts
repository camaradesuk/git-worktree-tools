/**
 * JSON output utilities for AI-friendly CLI output
 *
 * Provides structured, machine-readable output for all CLI commands
 * to enable AI agents to programmatically interact with git-worktree-tools.
 */

/**
 * Standard error codes for programmatic handling
 */
export enum ErrorCode {
  // Git errors
  NOT_GIT_REPO = 'NOT_GIT_REPO',
  DETACHED_HEAD = 'DETACHED_HEAD',
  UNCOMMITTED_CHANGES = 'UNCOMMITTED_CHANGES',
  BRANCH_EXISTS = 'BRANCH_EXISTS',
  WORKTREE_EXISTS = 'WORKTREE_EXISTS',
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  MERGE_CONFLICT = 'MERGE_CONFLICT',
  STASH_FAILED = 'STASH_FAILED',

  // GitHub errors
  GH_NOT_INSTALLED = 'GH_NOT_INSTALLED',
  GH_NOT_AUTHENTICATED = 'GH_NOT_AUTHENTICATED',
  PR_NOT_FOUND = 'PR_NOT_FOUND',
  PR_ALREADY_EXISTS = 'PR_ALREADY_EXISTS',
  PR_CREATE_FAILED = 'PR_CREATE_FAILED',

  // Config errors
  INVALID_CONFIG = 'INVALID_CONFIG',

  // User errors
  USER_CANCELLED = 'USER_CANCELLED',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  MISSING_ARGUMENT = 'MISSING_ARGUMENT',
  INVALID_ACTION = 'INVALID_ACTION',

  // Hook errors
  HOOK_FAILED = 'HOOK_FAILED',

  // System errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  OPERATION_FAILED = 'OPERATION_FAILED',
}

/**
 * Error information for structured error responses
 */
export interface ErrorInfo {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Standard JSON response schema for all commands
 */
export interface CommandResult<T = Record<string, unknown>> {
  success: boolean;
  command: string;
  timestamp: string;

  /** Command-specific data */
  data?: T;

  /** Error information (present when success is false) */
  error?: ErrorInfo;

  /** Warnings that didn't prevent success */
  warnings?: string[];
}

// ============================================================================
// newpr specific types
// ============================================================================

/**
 * Successful newpr result data
 */
export interface NewprResultData {
  prNumber: number;
  prUrl: string;
  branch: string;
  worktreePath: string;
  draft: boolean;
  scenario?: string;
  actionTaken?: string;
}

/**
 * State action key for --action flag
 * Maps to the scenario handler's StateAction types
 */
export type StateActionKey =
  | 'empty_commit'
  | 'commit_staged'
  | 'commit_all'
  | 'stash_and_empty'
  | 'use_commits'
  | 'push_then_branch'
  | 'use_commits_and_commit_all'
  | 'use_commits_and_stash'
  | 'create_pr_for_branch'
  | 'pr_for_branch_commit_all'
  | 'pr_for_branch_stash'
  | 'branch_from_detached';

/**
 * Validate a string is a valid StateActionKey
 */
export function isValidStateActionKey(key: string): key is StateActionKey {
  const validKeys: StateActionKey[] = [
    'empty_commit',
    'commit_staged',
    'commit_all',
    'stash_and_empty',
    'use_commits',
    'push_then_branch',
    'use_commits_and_commit_all',
    'use_commits_and_stash',
    'create_pr_for_branch',
    'pr_for_branch_commit_all',
    'pr_for_branch_stash',
    'branch_from_detached',
  ];
  return validKeys.includes(key as StateActionKey);
}

// ============================================================================
// cleanpr specific types
// ============================================================================

/**
 * Cleaned worktree info for JSON output
 */
export interface CleanedWorktreeInfo {
  prNumber: number;
  branch: string | null;
  path: string;
  prState: string;
  localBranchDeleted: boolean;
  remoteBranchDeleted: boolean;
}

/**
 * Successful cleanpr result data
 */
export interface CleanprResultData {
  cleaned: CleanedWorktreeInfo[];
  skipped: Array<{
    prNumber: number;
    reason: string;
  }>;
  totalCleaned: number;
  totalSkipped: number;
}

/**
 * Dry-run cleanpr result data
 */
export interface CleanprDryRunData {
  wouldClean: Array<{
    prNumber: number;
    branch: string | null;
    path: string;
    prState: string;
  }>;
  totalWouldClean: number;
}

// ============================================================================
// wtlink specific types
// ============================================================================

/**
 * Link operation result for JSON output
 */
export interface LinkInfo {
  file: string;
  status: 'linked' | 'skipped' | 'failed';
  reason?: string;
}

/**
 * Successful wtlink result data
 */
export interface WtlinkResultData {
  sourceWorktree: string;
  targetWorktree: string;
  links: LinkInfo[];
  totalLinked: number;
  totalSkipped: number;
  totalFailed: number;
}

// ============================================================================
// wtstate specific types (Phase 2)
// ============================================================================

/**
 * Available action with description
 */
export interface AvailableAction {
  key: StateActionKey;
  label: string;
  description?: string;
}

/**
 * Git state query result for wtstate command
 */
export interface WtstateResultData {
  scenario: string;
  scenarioDescription: string;
  currentBranch: string | null;
  baseBranch: string;
  worktreeType: 'main_worktree' | 'pr_worktree' | 'other';
  hasChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  localCommits: string[];
  stagedFiles: string[];
  unstagedFiles: string[];
  availableActions: AvailableAction[];
  recommendedAction: StateActionKey | null;
}

// ============================================================================
// Factory functions
// ============================================================================

/**
 * Create a successful command result
 */
export function createSuccessResult<T>(
  command: string,
  data: T,
  warnings?: string[]
): CommandResult<T> {
  return {
    success: true,
    command,
    timestamp: new Date().toISOString(),
    data,
    warnings: warnings?.length ? warnings : undefined,
  };
}

/**
 * Create a failed command result
 */
export function createErrorResult(
  command: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): CommandResult<never> {
  return {
    success: false,
    command,
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Format result as JSON string for output
 */
export function formatJsonResult<T>(result: CommandResult<T>): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Check if an error has an ErrorCode property
 */
function hasErrorCode(error: unknown): error is Error & { code: ErrorCode } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  );
}

/**
 * Map error class names to error codes
 */
export function getErrorCodeFromError(error: unknown): ErrorCode {
  if (error instanceof Error) {
    // Handle errors that carry their own ErrorCode (e.g., NonInteractiveError)
    if (hasErrorCode(error) && Object.values(ErrorCode).includes(error.code)) {
      return error.code;
    }

    switch (error.name) {
      case 'GitCommandError':
        return ErrorCode.OPERATION_FAILED;
      case 'GitHubCliError':
        return ErrorCode.OPERATION_FAILED;
      case 'ConfigurationError':
        return ErrorCode.INVALID_CONFIG;
      case 'WorktreeError':
        return ErrorCode.OPERATION_FAILED;
      case 'ManifestError':
        return ErrorCode.INVALID_CONFIG;
      case 'UserCancelledError':
        return ErrorCode.USER_CANCELLED;
      case 'NonInteractiveError':
        return ErrorCode.INVALID_ARGUMENT;
      default:
        return ErrorCode.UNKNOWN_ERROR;
    }
  }
  return ErrorCode.UNKNOWN_ERROR;
}
