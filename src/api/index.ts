/**
 * Programmatic API for git-worktree-tools
 *
 * This module provides clean, side-effect-free APIs for all CLI commands.
 * Use these functions for programmatic integration, MCP servers, or testing.
 *
 * All functions return CommandResult<T> with structured success/error data.
 *
 * @packageDocumentation
 */

// State query API
export { queryState, type QueryStateOptions, type QueryStateResult } from './state.js';

// List worktrees API
export {
  listWorktrees,
  type ListWorktreesOptions,
  type ListWorktreesResult,
  type WorktreeInfo,
} from './list.js';

// Clean worktrees API
export {
  cleanWorktrees,
  type CleanWorktreesOptions,
  type CleanWorktreesResult,
  type CleanedWorktree,
} from './clean.js';

// Create PR API
export {
  createPr,
  setupPrWorktree,
  type CreatePrOptions,
  type CreatePrResult,
  type SetupPrWorktreeOptions,
} from './create.js';
