/**
 * Hook Runner for newpr workflow
 *
 * Manages hook execution throughout the newpr lifecycle with proper context management.
 */

import { createHookExecutor, resolveHookCwd, type HookExecutor } from '../hooks/executor.js';
import type {
  HookContext,
  HookName,
  HookResult,
  HooksConfig,
  HookDefinition,
} from '../hooks/types.js';
import { shouldUseWorktreeCwd } from '../hooks/types.js';
import {
  isInteractiveEnvironment,
  promptHookConfirmation,
  createEditedHookDefinition,
} from '../hooks/confirmation.js';
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

  /**
   * Whether to prompt for confirmation before running hooks.
   * Only applies to WORKTREE_CWD_HOOKS (post-worktree, post-pr, post-push)
   * and only in interactive environments.
   */
  confirmHooks?: boolean;
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
  private hooksConfig: HooksConfig;
  private context: Partial<HookContext>;
  private options: HookRunnerOptions;
  private hasHooks: boolean;

  constructor(
    hooksConfig: HooksConfig = {},
    initialContext: Partial<HookContext>,
    options: HookRunnerOptions = {}
  ) {
    this.hooksConfig = hooksConfig;
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

    // Get the hook definition for confirmation
    const definition = this.hooksConfig[hookName];
    if (!definition) {
      return true;
    }

    // Check if we should prompt for confirmation
    // Only for WORKTREE_CWD_HOOKS in interactive environments with confirmHooks enabled
    if (this.options.confirmHooks && shouldUseWorktreeCwd(hookName) && isInteractiveEnvironment()) {
      const cwd = resolveHookCwd(hookName, definition, fullContext, {
        cwd: this.context.repoRoot,
        defaultTimeout: this.options.defaultTimeout,
        maxTimeout: this.options.maxTimeout,
      });

      const confirmResult = await promptHookConfirmation(hookName, definition, cwd);

      if (confirmResult.action === 'skip') {
        if (this.options.verbose) {
          console.log(colors.dim(`  Skipped: User chose to skip`));
        }
        return true;
      }

      // If user edited the command, execute the edited version
      if (confirmResult.editedCommand) {
        const editedDefinition = createEditedHookDefinition(
          definition,
          confirmResult.editedCommand
        );
        return this.executeEditedHook(hookName, editedDefinition, fullContext);
      }
    }

    if (this.options.verbose) {
      console.log(colors.dim(`Running hook: ${hookName}`));
    }

    const result = await this.executor.executeHook(hookName, fullContext);

    return this.handleResult(hookName, result);
  }

  /**
   * Execute an edited hook definition
   */
  private async executeEditedHook(
    hookName: HookName,
    definition: HookDefinition,
    context: HookContext
  ): Promise<boolean> {
    if (this.options.verbose) {
      console.log(colors.dim(`Running edited hook: ${hookName}`));
    }

    // Create a temporary executor with the edited definition
    const tempExecutor = createHookExecutor(
      { [hookName]: definition },
      {
        verbose: this.options.verbose,
        dryRun: this.options.dryRun,
        cwd: context.repoRoot,
        defaultTimeout: this.options.defaultTimeout,
        maxTimeout: this.options.maxTimeout,
      }
    );

    const result = await tempExecutor.executeHook(hookName, context);
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
