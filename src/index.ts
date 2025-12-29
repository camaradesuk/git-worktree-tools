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

// Export key types
export type {
  CommitRelationship,
  WorkingTreeStatus,
  Worktree,
  StashOptions,
  CommitOptions,
  PushOptions,
} from './lib/git.js';

export type {
  CreatePrOptions,
  PrInfo,
  RepoInfo,
  ListPrsOptions,
} from './lib/github.js';

export type {
  WorktreeConfig,
} from './lib/config.js';

export type {
  GitState,
  Scenario,
  WorktreeType,
  BranchType,
} from './lib/state-detection.js';

export type {
  PromptOption,
} from './lib/prompts.js';
