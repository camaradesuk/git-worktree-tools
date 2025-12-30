/**
 * lswt library - public API exports
 */

// Types
export type { ListOptions, WorktreeDisplay, ParseResult, TypeLabel } from './types.js';

// Argument parsing
export { parseArgs, getHelpText } from './args.js';

// Formatters
export {
  extractPrNumber,
  isMainWorktree,
  formatTypeLabel,
  sortWorktrees,
  getDisplayPath,
  formatJsonOutput,
} from './formatters.js';

// Worktree info gathering
export type { GatherDeps } from './worktree-info.js';
export { gatherWorktreeInfo, createDefaultDeps } from './worktree-info.js';
