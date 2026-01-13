/**
 * Hook Executor
 *
 * Executes lifecycle hooks with proper context and error handling.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type {
  HookName,
  HookDefinition,
  HookContext,
  HookResult,
  HookExecutorOptions,
  HooksConfig,
  ComplexHookDef,
} from './types.js';
import {
  contextToEnv,
  isSimpleHook,
  isMultipleHook,
  isComplexHook,
  shouldUseWorktreeCwd,
} from './types.js';

/**
 * Default timeout for hook execution (30 seconds)
 *
 * For hooks that may take longer (e.g., `npm install`, build scripts),
 * configure custom timeouts in .worktreerc:
 *
 * @example
 * ```json
 * {
 *   "hookDefaults": {
 *     "timeout": 120000,    // 2 minutes default
 *     "maxTimeout": 300000  // 5 minutes max
 *   },
 *   "hooks": {
 *     "post-worktree": {
 *       "command": "npm install",
 *       "timeout": 180000   // 3 minutes for this specific hook
 *     }
 *   }
 * }
 * ```
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Maximum overall timeout (60 seconds)
 * Can be overridden via hookDefaults.maxTimeout in .worktreerc
 * Individual hook timeouts are clamped to this value.
 */
const DEFAULT_MAX_TIMEOUT = 60000;

/**
 * Execute a shell command with context
 */
async function executeCommand(
  command: string,
  context: HookContext,
  options: {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  }
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const cwd = options.cwd ?? context.repoRoot;

    // Build environment with context variables
    const env = {
      ...process.env,
      ...contextToEnv(context),
      ...options.env,
    };

    // Replace template variables in command
    const expandedCommand = expandTemplateVariables(command, context);

    // Spawn shell process
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellFlag = isWindows ? '/c' : '-c';

    const proc = spawn(shell, [shellFlag, expandedCommand], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({
        success: false,
        output: stdout,
        error: `Command timed out after ${timeout}ms`,
      });
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      if (code === 0) {
        resolve({
          success: true,
          output: stdout.trim(),
        });
      } else {
        resolve({
          success: false,
          output: stdout.trim(),
          error: stderr.trim() || `Command exited with code ${code}`,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        output: stdout.trim(),
        error: `Failed to execute command: ${err.message}`,
      });
    });
  });
}

/**
 * Expand template variables in a string
 */
function expandTemplateVariables(template: string, context: HookContext): string {
  let result = template;

  // Replace {{VARIABLE}} style placeholders
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
    switch (varName) {
      case 'BRANCH_NAME':
        return context.branchName ?? '';
      case 'PR_NUMBER':
        return context.prNumber?.toString() ?? '';
      case 'PR_URL':
        return context.prUrl ?? '';
      case 'WORKTREE_PATH':
        return context.worktreePath ?? '';
      case 'REPO_ROOT':
        return context.repoRoot ?? '';
      case 'BASE_BRANCH':
        return context.baseBranch ?? '';
      case 'DESCRIPTION':
        return context.description ?? '';
      case 'SCENARIO':
        return context.scenario ?? '';
      case 'ACTION':
        return context.action ?? '';
      default:
        return '';
    }
  });

  return result;
}

/**
 * Resolve the working directory for a hook
 *
 * Priority:
 * 1. Explicit cwd in complex hook definition (with template expansion)
 * 2. Smart default for WORKTREE_CWD_HOOKS when worktreePath is available
 * 3. Fallback to executor options cwd or context repoRoot
 *
 * @param hookName - The hook being executed
 * @param definition - The hook definition
 * @param context - The hook execution context
 * @param options - The executor options
 * @returns The resolved working directory path
 */
export function resolveHookCwd(
  hookName: HookName,
  definition: HookDefinition,
  context: HookContext,
  options: HookExecutorOptions
): string {
  // 1. Explicit cwd in complex hook definition (with template expansion)
  if (isComplexHook(definition) && definition.cwd) {
    return expandTemplateVariables(definition.cwd, context);
  }

  // 2. Smart defaults for post-* hooks when worktree path exists and is a valid directory
  if (
    shouldUseWorktreeCwd(hookName) &&
    context.worktreePath &&
    fs.existsSync(context.worktreePath)
  ) {
    return context.worktreePath;
  }

  // 3. Fallback to options cwd or repoRoot
  return options.cwd ?? context.repoRoot;
}

/**
 * Evaluate a condition string
 */
function evaluateCondition(condition: string, context: HookContext, cwd: string): boolean {
  // Handle "exists:filename" condition
  if (condition.startsWith('exists:')) {
    const fileName = condition.slice(7);
    const filePath = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
    return fs.existsSync(filePath);
  }

  // Handle "not:condition" condition
  if (condition.startsWith('not:')) {
    const innerCondition = condition.slice(4);
    return !evaluateCondition(innerCondition, context, cwd);
  }

  // Handle "env:VAR_NAME" condition (check if env var is set)
  if (condition.startsWith('env:')) {
    const varName = condition.slice(4);
    return !!process.env[varName];
  }

  // Handle "has-changes" condition
  if (condition === 'has-changes') {
    return (context.stagedFiles?.length ?? 0) > 0 || (context.unstagedFiles?.length ?? 0) > 0;
  }

  // Handle "has-staged" condition
  if (condition === 'has-staged') {
    return (context.stagedFiles?.length ?? 0) > 0;
  }

  // Handle scenario conditions like "scenario:main_clean_same"
  if (condition.startsWith('scenario:')) {
    const expectedScenario = condition.slice(9);
    return context.scenario === expectedScenario;
  }

  // Unknown condition - default to true
  return true;
}

/**
 * Execute a single hook definition
 */
async function executeSingleHook(
  hookName: HookName,
  definition: HookDefinition,
  context: HookContext,
  options: HookExecutorOptions
): Promise<HookResult> {
  const startTime = Date.now();
  // Use smart CWD resolution for proper worktree support
  const cwd = resolveHookCwd(hookName, definition, context, options);

  // Handle simple string command
  if (isSimpleHook(definition)) {
    if (options.dryRun) {
      return {
        hook: hookName,
        success: true,
        duration: 0,
        output: `[DRY RUN] Would execute: ${definition}`,
        skipped: true,
        skipReason: 'dry-run mode',
      };
    }

    const result = await executeCommand(definition, context, {
      cwd,
      timeout: options.defaultTimeout ?? DEFAULT_TIMEOUT,
    });

    return {
      hook: hookName,
      success: result.success,
      duration: Date.now() - startTime,
      output: result.output,
      error: result.error,
    };
  }

  // Handle multiple commands
  if (isMultipleHook(definition)) {
    const outputs: string[] = [];

    for (const command of definition) {
      if (options.dryRun) {
        outputs.push(`[DRY RUN] Would execute: ${command}`);
        continue;
      }

      const result = await executeCommand(command, context, {
        cwd,
        timeout: options.defaultTimeout ?? DEFAULT_TIMEOUT,
      });

      if (result.output) {
        outputs.push(result.output);
      }

      if (!result.success) {
        return {
          hook: hookName,
          success: false,
          duration: Date.now() - startTime,
          output: outputs.join('\n'),
          error: result.error,
        };
      }
    }

    return {
      hook: hookName,
      success: true,
      duration: Date.now() - startTime,
      output: outputs.join('\n'),
      skipped: options.dryRun,
      skipReason: options.dryRun ? 'dry-run mode' : undefined,
    };
  }

  // Handle complex hook definition
  if (isComplexHook(definition)) {
    return executeComplexHook(hookName, definition, context, options, startTime);
  }

  // Unknown hook type
  return {
    hook: hookName,
    success: false,
    duration: Date.now() - startTime,
    error: 'Unknown hook definition type',
  };
}

/**
 * Execute a complex hook with conditions and options
 */
async function executeComplexHook(
  hookName: HookName,
  definition: ComplexHookDef,
  context: HookContext,
  options: HookExecutorOptions,
  startTime: number
): Promise<HookResult> {
  // Use smart CWD resolution for proper worktree support
  const cwd = resolveHookCwd(hookName, definition, context, options);

  // Check condition if specified
  if (definition.if) {
    const conditionMet = evaluateCondition(definition.if, context, cwd);
    if (!conditionMet) {
      return {
        hook: hookName,
        success: true,
        duration: Date.now() - startTime,
        skipped: true,
        skipReason: `Condition not met: ${definition.if}`,
      };
    }
  }

  // Get the command or script
  let command: string;
  if (definition.command) {
    command = definition.command;
  } else if (definition.script) {
    const scriptPath = path.isAbsolute(definition.script)
      ? definition.script
      : path.join(cwd, definition.script);

    if (!fs.existsSync(scriptPath)) {
      return {
        hook: hookName,
        success: definition.failOnError !== true,
        duration: Date.now() - startTime,
        error: `Script not found: ${scriptPath}`,
      };
    }

    // Determine how to run the script
    const ext = path.extname(scriptPath);
    if (ext === '.js' || ext === '.mjs') {
      command = `node "${scriptPath}"`;
    } else if (ext === '.ts') {
      command = `npx tsx "${scriptPath}"`;
    } else if (ext === '.sh') {
      command = `sh "${scriptPath}"`;
    } else if (ext === '.ps1') {
      command = `powershell -File "${scriptPath}"`;
    } else {
      // Try to execute directly (for shebang scripts)
      command = `"${scriptPath}"`;
    }
  } else {
    return {
      hook: hookName,
      success: false,
      duration: Date.now() - startTime,
      error: 'Hook must specify either "command" or "script"',
    };
  }

  if (options.dryRun) {
    return {
      hook: hookName,
      success: true,
      duration: 0,
      output: `[DRY RUN] Would execute: ${command}`,
      skipped: true,
      skipReason: 'dry-run mode',
    };
  }

  const defaultTimeout = options.defaultTimeout ?? DEFAULT_TIMEOUT;
  const maxTimeout = options.maxTimeout ?? DEFAULT_MAX_TIMEOUT;
  const timeout = Math.min(definition.timeout ?? defaultTimeout, maxTimeout);
  const result = await executeCommand(command, context, {
    cwd,
    timeout,
    env: definition.env,
  });

  // Handle failOnError setting
  if (!result.success && definition.failOnError === false) {
    return {
      hook: hookName,
      success: true,
      duration: Date.now() - startTime,
      output: result.output,
      error: `[Non-fatal] ${result.error}`,
    };
  }

  return {
    hook: hookName,
    success: result.success,
    duration: Date.now() - startTime,
    output: result.output,
    error: result.error,
  };
}

/**
 * Hook executor class for managing hook execution
 */
export class HookExecutor {
  private config: HooksConfig;
  private options: HookExecutorOptions;

  constructor(config: HooksConfig = {}, options: HookExecutorOptions = {}) {
    this.config = config;
    this.options = options;
  }

  /**
   * Check if a hook is configured
   */
  hasHook(hookName: HookName): boolean {
    return hookName in this.config;
  }

  /**
   * Get all configured hooks
   */
  getConfiguredHooks(): HookName[] {
    return Object.keys(this.config) as HookName[];
  }

  /**
   * Execute a single hook
   */
  async executeHook(hookName: HookName, context: HookContext): Promise<HookResult> {
    const definition = this.config[hookName];

    if (!definition) {
      return {
        hook: hookName,
        success: true,
        duration: 0,
        skipped: true,
        skipReason: 'No hook configured',
      };
    }

    if (this.options.verbose) {
      console.log(`Executing hook: ${hookName}`);
    }

    const result = await executeSingleHook(hookName, definition, context, this.options);

    if (this.options.verbose) {
      if (result.success) {
        console.log(`Hook ${hookName} completed in ${result.duration}ms`);
      } else {
        console.error(`Hook ${hookName} failed: ${result.error}`);
      }
    }

    return result;
  }

  /**
   * Execute multiple hooks in sequence
   */
  async executeHooks(hookNames: HookName[], context: HookContext): Promise<HookResult[]> {
    const results: HookResult[] = [];

    for (const hookName of hookNames) {
      const result = await this.executeHook(hookName, context);
      results.push(result);

      // Stop on first failure (unless it was skipped)
      if (!result.success && !result.skipped) {
        break;
      }
    }

    return results;
  }
}

/**
 * Create a hook executor with the given configuration
 */
export function createHookExecutor(
  config: HooksConfig = {},
  options: HookExecutorOptions = {}
): HookExecutor {
  return new HookExecutor(config, options);
}
