/**
 * git-worktree-tools - Cross-platform git worktree workflow management
 *
 * @packageDocumentation
 */

// Export all library modules
export * as git from './lib/git.js';
export * as github from './lib/github.js';
export * as colors from './lib/colors.js';
export * as prompts from './lib/prompts.js';
export * as config from './lib/config.js';
export * as stateDetection from './lib/state-detection.js';
export * as errors from './lib/errors.js';
export * as constants from './lib/constants.js';
export * as jsonOutput from './lib/json-output.js';
export * as wtstate from './lib/wtstate/index.js';

// Export programmatic API (Phase 3)
export * as api from './api/index.js';

// Export key types
export type {
  CommitRelationship,
  WorkingTreeStatus,
  Worktree,
  StashOptions,
  CommitOptions,
  PushOptions,
} from './lib/git.js';

export type { CreatePrOptions, PrInfo, RepoInfo, ListPrsOptions } from './lib/github.js';

export type { WorktreeConfig } from './lib/config.js';

export type { GitState, Scenario, WorktreeType, BranchType } from './lib/state-detection.js';

export type { PromptOption } from './lib/prompts.js';

export type {
  CommandResult,
  ErrorInfo,
  StateActionKey,
  NewprResultData,
  CleanprResultData,
  WtlinkResultData,
  WtstateResultData,
  AvailableAction,
} from './lib/json-output.js';

export { ErrorCode } from './lib/json-output.js';

export type {
  WtstateOptions,
  WtstateResult,
  WorktreeType as WtstateWorktreeType,
} from './lib/wtstate/types.js';

// Export API types (Phase 3)
export type {
  QueryStateOptions,
  QueryStateResult,
  ListWorktreesOptions,
  ListWorktreesResult,
  WorktreeInfo as ApiWorktreeInfo,
  CleanWorktreesOptions,
  CleanWorktreesResult,
  CleanedWorktree,
  CreatePrOptions as ApiCreatePrOptions,
  CreatePrResult,
  SetupPrWorktreeOptions,
} from './api/index.js';

// Export API functions for direct import
export {
  queryState,
  listWorktrees,
  cleanWorktrees,
  createPr,
  setupPrWorktree,
} from './api/index.js';

// Export error classes for direct use
export {
  WorktreeToolsError,
  GitCommandError,
  GitHubCliError,
  ConfigurationError,
  WorktreeError,
  ManifestError,
  UserCancelledError,
  isWorktreeToolsError,
  isGitCommandError,
  isGitHubCliError,
} from './lib/errors.js';
