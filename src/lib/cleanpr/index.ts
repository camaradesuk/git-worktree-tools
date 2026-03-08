/**
 * cleanpr library - public API exports
 */

// Types
export type { CleanOptions, PrState, WorktreeInfo, ParseResult, CleanupResult } from './types.js';

// Argument parsing
export { parseArgs, getHelpText } from './args.js';

// Worktree info gathering
export type { GatherDeps } from './worktree-info.js';
export { gatherPrWorktreeInfo, createDefaultDeps } from './worktree-info.js';

// Shared worktree utilities
export { extractPrNumber, extractPrNumberAsync } from '../worktree-utils.js';

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
