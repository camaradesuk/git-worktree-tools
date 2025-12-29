/**
 * Custom error classes for git-worktree-tools
 *
 * These provide structured error handling with specific error types
 * that can be caught and handled differently based on the error kind.
 */

/**
 * Base error class for all git-worktree-tools errors
 */
export class WorktreeToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorktreeToolsError';
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error thrown when a git command fails
 */
export class GitCommandError extends WorktreeToolsError {
  public readonly command: string;
  public readonly exitCode?: number;
  public readonly stderr?: string;

  constructor(message: string, options: { command: string; exitCode?: number; stderr?: string }) {
    super(message);
    this.name = 'GitCommandError';
    this.command = options.command;
    this.exitCode = options.exitCode;
    this.stderr = options.stderr;
  }
}

/**
 * Error thrown when GitHub CLI command fails
 */
export class GitHubCliError extends WorktreeToolsError {
  public readonly command: string;
  public readonly stderr?: string;

  constructor(message: string, options: { command: string; stderr?: string }) {
    super(message);
    this.name = 'GitHubCliError';
    this.command = options.command;
    this.stderr = options.stderr;
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends WorktreeToolsError {
  public readonly configFile?: string;
  public readonly field?: string;

  constructor(message: string, options: { configFile?: string; field?: string } = {}) {
    super(message);
    this.name = 'ConfigurationError';
    this.configFile = options.configFile;
    this.field = options.field;
  }
}

/**
 * Error thrown when a worktree operation fails
 */
export class WorktreeError extends WorktreeToolsError {
  public readonly worktreePath?: string;
  public readonly branch?: string;

  constructor(message: string, options: { worktreePath?: string; branch?: string } = {}) {
    super(message);
    this.name = 'WorktreeError';
    this.worktreePath = options.worktreePath;
    this.branch = options.branch;
  }
}

/**
 * Error thrown when manifest validation fails
 */
export class ManifestError extends WorktreeToolsError {
  public readonly manifestPath?: string;
  public readonly issues?: string[];

  constructor(message: string, options: { manifestPath?: string; issues?: string[] } = {}) {
    super(message);
    this.name = 'ManifestError';
    this.manifestPath = options.manifestPath;
    this.issues = options.issues;
  }
}

/**
 * Error thrown when user cancels an operation
 */
export class UserCancelledError extends WorktreeToolsError {
  constructor(message: string = 'Operation cancelled by user') {
    super(message);
    this.name = 'UserCancelledError';
  }
}

/**
 * Type guard to check if error is a WorktreeToolsError
 */
export function isWorktreeToolsError(error: unknown): error is WorktreeToolsError {
  return error instanceof WorktreeToolsError;
}

/**
 * Type guard to check if error is a GitCommandError
 */
export function isGitCommandError(error: unknown): error is GitCommandError {
  return error instanceof GitCommandError;
}

/**
 * Type guard to check if error is a GitHubCliError
 */
export function isGitHubCliError(error: unknown): error is GitHubCliError {
  return error instanceof GitHubCliError;
}
