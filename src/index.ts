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

// Export AI content generation (Phase 5)
export * as ai from './lib/ai/index.js';

// Export hooks system (Phase 6)
export * as hooks from './lib/hooks/index.js';

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

export type {
  WorktreeConfig,
  GeneratorsConfig,
  IntegrationsConfig,
  LinearIntegration,
  JiraIntegration,
  SlackIntegration,
} from './lib/config.js';

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

// Export AI types (Phase 5)
export type {
  AIProvider,
  AIConfig,
  AIProviderName,
  AIGenerationResult,
  BranchContext,
  PRContext,
  CommitContext,
  PlanContext,
  CommitInfo,
} from './lib/ai/types.js';

// Export hook types (Phase 6)
export type {
  HookName,
  HookContext,
  HookDefinition,
  HookResult,
  HooksConfig,
  HookExecutorOptions,
  HookTemplate,
} from './lib/hooks/types.js';

// Export hook utilities
export { createHookExecutor, HookExecutor } from './lib/hooks/executor.js';
export {
  getHookTemplate,
  listHookTemplates,
  suggestHookTemplates,
  mergeHookTemplates,
} from './lib/hooks/templates.js';
