/**
 * cleanpr library - public API exports
 */

// Types
export type {
  CleanOptions,
  PrState,
  WorktreeInfo,
  ParseResult,
  CleanupResult,
} from './types.js';

// Argument parsing
export { parseArgs, getHelpText } from './args.js';

// Worktree info gathering
export type { GatherDeps } from './worktree-info.js';
export {
  extractPrNumber,
  gatherPrWorktreeInfo,
  createDefaultDeps,
} from './worktree-info.js';

// Cleanup operations
export type { CleanupDeps, GroupedWorktrees, CleanupSummary } from './cleanup.js';
export {
  groupWorktreesByState,
  getCleanableWorktrees,
  findWorktreeByPrNumber,
  canCleanWorktree,
  cleanWorktree,
  cleanWorktrees,
  formatPrState,
  summarizeResults,
} from './cleanup.js';
