/**
 * newpr library - public API exports
 */

// Types
export type {
  Mode,
  Options,
  BranchFrom,
  ActionType,
  StateAction,
  ParseResult,
  ActionResult,
  ScenarioChoice,
  ScenarioResult,
} from './types.js';

// Argument parsing
export { parseArgs, getHelpText, getDefaultOptions } from './args.js';

// Scenario handling
export type { ScenarioContext } from './scenario-handler.js';
export {
  getScenarioContext,
  isPrWorktreeScenario,
  isExistingBranchAction,
  shouldBranchFromHead,
  getScenarioMessageLevel,
} from './scenario-handler.js';

// Action execution
export type { ActionDeps } from './actions.js';
export {
  executeStateAction,
  getBranchPoint,
  requiresStageAll,
  involvesStashing,
  needsPushToMain,
  commitsToCurrentBranch,
  getActionDescription,
} from './actions.js';

// Hook runner
export type { HookRunnerOptions } from './hook-runner.js';
export { HookRunner, createHookRunner, runLifecycleHook } from './hook-runner.js';

// Action dependencies factory
export { createActionDeps } from './action-deps.js';
