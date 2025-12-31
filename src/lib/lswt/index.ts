/**
 * lswt library - public API exports
 */

// Types
export type {
  ListOptions,
  WorktreeDisplay,
  ParseResult,
  TypeLabel,
  WorktreeAction,
  ActionMenuItem,
  ActionResult,
  EnvironmentInfo,
  GitVersion,
} from './types.js';

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
export type { GatherDeps, PrInfoResult } from './worktree-info.js';
export { gatherWorktreeInfo, createDefaultDeps } from './worktree-info.js';

// Environment detection
export {
  detectEnvironment,
  isCommandAvailable,
  getGitVersion,
  parseGitVersion,
  isGitVersionAtLeast,
  getDefaultTerminal,
  getShell,
  WORKTREE_MOVE_MIN_VERSION,
} from './environment.js';

// Actions
export {
  buildActionMenu,
  formatWorktreeChoice,
  formatShortcutLegend,
  getActionShortcut,
  ACTION_SHORTCUTS,
} from './actions.js';

// Action executors
export type { ExecutorDeps } from './action-executors.js';
export { executeAction, createDefaultExecutorDeps } from './action-executors.js';

// Interactive mode
export { runInteractiveMode } from './interactive.js';
