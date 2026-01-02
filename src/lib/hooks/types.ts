/**
 * Hook System Types
 *
 * Defines types for the lifecycle hook system.
 */

/**
 * Available hook points in the newpr lifecycle
 */
export type HookName =
  | 'pre-analyze'
  | 'post-analyze'
  | 'pre-branch'
  | 'post-branch'
  | 'pre-commit'
  | 'post-commit'
  | 'pre-push'
  | 'post-push'
  | 'pre-pr'
  | 'post-pr'
  | 'pre-worktree'
  | 'post-worktree'
  | 'cleanup';

/**
 * All valid hook names as an array for iteration
 */
export const HOOK_NAMES: HookName[] = [
  'pre-analyze',
  'post-analyze',
  'pre-branch',
  'post-branch',
  'pre-commit',
  'post-commit',
  'pre-push',
  'post-push',
  'pre-pr',
  'post-pr',
  'pre-worktree',
  'post-worktree',
  'cleanup',
];

/**
 * Context passed to hooks via environment variables
 */
export interface HookContext {
  /** New branch name (available post-branch onwards) */
  branchName?: string;

  /** PR number (available post-pr onwards) */
  prNumber?: number;

  /** PR URL (available post-pr onwards) */
  prUrl?: string;

  /** Worktree path (available post-worktree) */
  worktreePath?: string;

  /** Main repo root */
  repoRoot: string;

  /** Base branch (e.g., main) */
  baseBranch: string;

  /** User-provided description */
  description?: string;

  /** Detected git state scenario */
  scenario?: string;

  /** Action taken for the scenario */
  action?: string;

  /** Staged files */
  stagedFiles?: string[];

  /** Unstaged files */
  unstagedFiles?: string[];

  /** Error message (available in cleanup hook) */
  error?: string;
}

/**
 * Simple hook definition - just a command string
 */
export type SimpleHookDef = string;

/**
 * Multiple commands hook definition
 */
export type MultipleHookDef = string[];

/**
 * Complex hook definition with options
 */
export interface ComplexHookDef {
  /** Shell command to run */
  command?: string;

  /** Path to script file */
  script?: string;

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Whether to fail on error (default: true) */
  failOnError?: boolean;

  /** Condition for running the hook */
  if?: string;

  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Any valid hook definition
 */
export type HookDefinition = SimpleHookDef | MultipleHookDef | ComplexHookDef;

/**
 * Hook configuration in .worktreerc
 */
export type HooksConfig = Partial<Record<HookName, HookDefinition>>;

/**
 * Result of a hook execution
 */
export interface HookResult {
  /** Hook that was executed */
  hook: HookName;

  /** Whether the hook succeeded */
  success: boolean;

  /** Duration in milliseconds */
  duration: number;

  /** Output from the hook */
  output?: string;

  /** Error message if failed */
  error?: string;

  /** Whether the hook was skipped */
  skipped?: boolean;

  /** Reason for skipping */
  skipReason?: string;
}

/**
 * Options for hook execution
 */
export interface HookExecutorOptions {
  /** Working directory for hook execution */
  cwd?: string;

  /** Whether to run in verbose mode */
  verbose?: boolean;

  /** Whether to run in dry-run mode (don't actually execute) */
  dryRun?: boolean;

  /** Maximum timeout for all hooks (default: 60000ms) */
  timeout?: number;
}

/**
 * Built-in hook template definition
 */
export interface HookTemplate {
  /** Template name */
  name: string;

  /** Description of what the template does */
  description: string;

  /** Which hooks the template installs */
  hooks: Partial<Record<HookName, HookDefinition>>;

  /** Conditions for recommending this template */
  conditions?: {
    /** Files that should exist */
    filesExist?: string[];

    /** Package manager to detect */
    packageManager?: string;
  };
}

/**
 * Function signature for custom script hooks
 */
export type ScriptHookFunction = (context: HookContext) => Promise<{
  success: boolean;
  message?: string;
}>;

/**
 * Convert HookContext to environment variables
 */
export function contextToEnv(context: HookContext): Record<string, string> {
  const env: Record<string, string> = {};

  if (context.branchName) env.WT_BRANCH_NAME = context.branchName;
  if (context.prNumber !== undefined) env.WT_PR_NUMBER = String(context.prNumber);
  if (context.prUrl) env.WT_PR_URL = context.prUrl;
  if (context.worktreePath) env.WT_WORKTREE_PATH = context.worktreePath;
  if (context.repoRoot) env.WT_REPO_ROOT = context.repoRoot;
  if (context.baseBranch) env.WT_BASE_BRANCH = context.baseBranch;
  if (context.description) env.WT_DESCRIPTION = context.description;
  if (context.scenario) env.WT_SCENARIO = context.scenario;
  if (context.action) env.WT_ACTION = context.action;
  if (context.error) env.WT_ERROR = context.error;
  if (context.stagedFiles?.length) env.WT_STAGED_FILES = context.stagedFiles.join(',');
  if (context.unstagedFiles?.length) env.WT_UNSTAGED_FILES = context.unstagedFiles.join(',');

  return env;
}

/**
 * Check if a hook definition is a simple string
 */
export function isSimpleHook(def: HookDefinition): def is SimpleHookDef {
  return typeof def === 'string';
}

/**
 * Check if a hook definition is multiple commands
 */
export function isMultipleHook(def: HookDefinition): def is MultipleHookDef {
  return Array.isArray(def);
}

/**
 * Check if a hook definition is complex
 */
export function isComplexHook(def: HookDefinition): def is ComplexHookDef {
  return typeof def === 'object' && !Array.isArray(def);
}
