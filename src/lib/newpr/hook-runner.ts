/**
 * Hook Runner for newpr workflow
 *
 * Manages hook execution throughout the newpr lifecycle with proper context management.
 */

import { createHookExecutor, type HookExecutor } from '../hooks/executor.js';
import type { HookContext, HookName, HookResult, HooksConfig } from '../hooks/types.js';
import * as colors from '../colors.js';

/**
 * Options for the hook runner
 */
export interface HookRunnerOptions {
  /** Whether to show verbose output */
  verbose?: boolean;

  /** Whether to run in dry-run mode */
  dryRun?: boolean;

  /** Whether to show hook output */
  showOutput?: boolean;

  /** Whether to continue on hook failure for non-critical hooks */
  continueOnWarning?: boolean;

  /**
   * Default timeout for hook execution (in milliseconds)
   * Configurable via hookDefaults.timeout in .worktreerc
   */
  defaultTimeout?: number;

  /**
   * Maximum timeout for hook execution (in milliseconds)
   * Configurable via hookDefaults.maxTimeout in .worktreerc
   */
  maxTimeout?: number;
}

/**
 * Hooks that are considered non-critical (won't abort workflow on failure)
 */
const NON_CRITICAL_HOOKS: HookName[] = [
  'post-analyze',
  'post-branch',
  'post-commit',
  'post-push',
  'post-pr',
  'post-worktree',
];

/**
 * Hooks that are critical (will abort workflow on failure)
 */
const CRITICAL_HOOKS: HookName[] = [
  'pre-analyze',
  'pre-branch',
  'pre-commit',
  'pre-push',
  'pre-pr',
  'pre-worktree',
];

/**
 * Hook runner for managing lifecycle hooks in the newpr workflow
 */
export class HookRunner {
  private executor: HookExecutor;
  private context: Partial<HookContext>;
  private options: HookRunnerOptions;
  private hasHooks: boolean;

  constructor(
    hooksConfig: HooksConfig = {},
    initialContext: Partial<HookContext>,
    options: HookRunnerOptions = {}
  ) {
    this.executor = createHookExecutor(hooksConfig, {
      verbose: options.verbose,
      dryRun: options.dryRun,
      cwd: initialContext.repoRoot,
      defaultTimeout: options.defaultTimeout,
      maxTimeout: options.maxTimeout,
    });
    this.context = {
      repoRoot: initialContext.repoRoot ?? process.cwd(),
      baseBranch: initialContext.baseBranch ?? 'main',
      ...initialContext,
    };
    this.options = options;
    this.hasHooks = this.executor.getConfiguredHooks().length > 0;
  }

  /**
   * Check if any hooks are configured
   */
  hasConfiguredHooks(): boolean {
    return this.hasHooks;
  }

  /**
   * Get configured hooks
   */
  getConfiguredHooks(): HookName[] {
    return this.executor.getConfiguredHooks();
  }

  /**
   * Update the context with new values
   */
  updateContext(updates: Partial<HookContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Get current context
   */
  getContext(): Partial<HookContext> {
    return { ...this.context };
  }

  /**
   * Run a hook and handle results appropriately
   *
   * @returns true if execution should continue, false if it should abort
   */
  async runHook(hookName: HookName): Promise<boolean> {
    // Skip if no hooks configured
    if (!this.executor.hasHook(hookName)) {
      return true;
    }

    // Build full context
    const fullContext: HookContext = {
      repoRoot: this.context.repoRoot ?? process.cwd(),
      baseBranch: this.context.baseBranch ?? 'main',
      ...this.context,
    };

    if (this.options.verbose) {
      console.log(colors.dim(`Running hook: ${hookName}`));
    }

    const result = await this.executor.executeHook(hookName, fullContext);

    return this.handleResult(hookName, result);
  }

  /**
   * Run the cleanup hook (always non-fatal)
   */
  async runCleanup(error?: Error): Promise<void> {
    if (!this.executor.hasHook('cleanup')) {
      return;
    }

    // Add error to context for cleanup hook
    const contextWithError: HookContext = {
      repoRoot: this.context.repoRoot ?? process.cwd(),
      baseBranch: this.context.baseBranch ?? 'main',
      ...this.context,
      error: error?.message,
    };

    if (this.options.verbose) {
      console.log(colors.dim('Running cleanup hook...'));
    }

    const result = await this.executor.executeHook('cleanup', contextWithError);

    if (result.output && this.options.showOutput) {
      console.log(result.output);
    }

    if (!result.success && !result.skipped) {
      console.log(colors.warning(`Cleanup hook failed: ${result.error}`));
    }
  }

  /**
   * Handle the result of a hook execution
   *
   * @returns true if execution should continue, false if it should abort
   */
  private handleResult(hookName: HookName, result: HookResult): boolean {
    // Skipped hooks always continue
    if (result.skipped) {
      if (this.options.verbose && result.skipReason) {
        console.log(colors.dim(`  Skipped: ${result.skipReason}`));
      }
      return true;
    }

    // Show output if configured
    if (result.output && this.options.showOutput) {
      console.log(result.output);
    }

    // Handle failure
    if (!result.success) {
      const isCritical = CRITICAL_HOOKS.includes(hookName);
      const isNonCritical = NON_CRITICAL_HOOKS.includes(hookName);

      if (isCritical) {
        // Critical hooks abort the workflow
        console.log(colors.error(`Hook ${hookName} failed: ${result.error}`));
        return false;
      }

      if (isNonCritical || this.options.continueOnWarning) {
        // Non-critical hooks show a warning but continue
        console.log(colors.warning(`Hook ${hookName} failed (non-critical): ${result.error}`));
        return true;
      }

      // Default: abort on failure
      console.log(colors.error(`Hook ${hookName} failed: ${result.error}`));
      return false;
    }

    // Success
    if (this.options.verbose) {
      console.log(colors.dim(`  Completed in ${result.duration}ms`));
    }

    return true;
  }
}

/**
 * Create a hook runner for the newpr workflow
 */
export function createHookRunner(
  hooksConfig: HooksConfig = {},
  initialContext: Partial<HookContext>,
  options: HookRunnerOptions = {}
): HookRunner {
  return new HookRunner(hooksConfig, initialContext, options);
}

/**
 * Simple helper to run a hook and get boolean result
 */
export async function runLifecycleHook(
  runner: HookRunner | null,
  hookName: HookName
): Promise<boolean> {
  if (!runner) {
    return true;
  }
  return runner.runHook(hookName);
}
