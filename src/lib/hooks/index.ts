/**
 * Hook System Module
 *
 * Provides lifecycle hooks for the git-worktree-tools workflow.
 *
 * Hooks can be configured in .worktreerc:
 *
 * ```json
 * {
 *   "hooks": {
 *     "post-worktree": "npm install",
 *     "post-pr": ["echo 'PR created!'", "./scripts/notify.sh"],
 *     "pre-branch": {
 *       "script": "./hooks/validate-branch.js",
 *       "timeout": 5000
 *     }
 *   }
 * }
 * ```
 */

// Types
export type {
  HookName,
  HookContext,
  HookDefinition,
  HookResult,
  HooksConfig,
  HookExecutorOptions,
  HookTemplate,
  SimpleHookDef,
  MultipleHookDef,
  ComplexHookDef,
  ScriptHookFunction,
} from './types.js';

export { HOOK_NAMES, contextToEnv, isSimpleHook, isMultipleHook, isComplexHook } from './types.js';

// Executor
export { HookExecutor, createHookExecutor } from './executor.js';

// Templates
export {
  HOOK_TEMPLATES,
  getHookTemplate,
  listHookTemplates,
  getTemplateHooks,
  mergeHookTemplates,
  suggestHookTemplates,
  autoDepsTemplate,
  autoDepsTemplatePnpm,
  autoDepsTemplateYarn,
  vscodeOpenTemplate,
  cursorOpenTemplate,
  echoTemplate,
  notifyTemplate,
  gitLfsTemplate,
  preCommitTemplate,
  huskyTemplate,
} from './templates.js';
