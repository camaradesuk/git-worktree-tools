# Hooks System Improvements - Implementation Specification

**Status**: Draft - Pending Review
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: WSL Ubuntu / macOS / Windows
**PR**: #18

---

## Executive Summary

This specification addresses three critical issues with the current hooks system: (1) the working directory bug where `post-*` hooks execute in the main repo instead of the newly created worktree, (2) inconsistent hook execution where `post-worktree` only runs in one of three PR creation modes, and (3) missing wizard confirmation allowing users to review, skip, or edit hook commands before execution.

The solution introduces smart working directory defaults based on hook name, ensures consistent hook execution across all code paths, and adds an interactive confirmation flow that respects non-interactive mode. These changes improve user experience whilst maintaining backwards compatibility through explicit override options.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Detailed Design](#2-detailed-design)
3. [Execution Flow](#3-execution-flow)
4. [Edge Cases & Mitigations](#4-edge-cases--mitigations)
5. [Testing Strategy](#5-testing-strategy)
6. [Implementation Checklist](#6-implementation-checklist)
7. [Open Questions](#7-open-questions)
8. [References](#8-references)

---

## 1. High-Level Architecture

### 1.1 Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Hooks System Architecture                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────┐     ┌────────────────┐  │
│  │   HookRunner     │────▶│  HookExecutor    │────▶│  Shell/Process │  │
│  │                  │     │                  │     │                │  │
│  │ • Context mgmt   │     │ • CWD resolution │     │ • spawn()      │  │
│  │ • Confirmation   │     │ • Template expand│     │ • Timeout      │  │
│  │ • Critical/Non   │     │ • Condition eval │     │ • Output       │  │
│  └──────────────────┘     └──────────────────┘     └────────────────┘  │
│           │                        │                                    │
│           │                        │                                    │
│           ▼                        ▼                                    │
│  ┌──────────────────┐     ┌──────────────────┐                         │
│  │  Confirmation    │     │  CWD Resolver    │   NEW COMPONENTS        │
│  │  Module          │     │                  │                         │
│  │                  │     │ • Smart defaults │                         │
│  │ • Display hook   │     │ • Per-hook rules │                         │
│  │ • Run/Skip/Edit  │     │ • Template vars  │                         │
│  │ • Interactive    │     │ • Override opt   │                         │
│  └──────────────────┘     └──────────────────┘                         │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Current Problems

| Problem                    | Current Behaviour                          | Impact                                        | Affected Users                     |
| -------------------------- | ------------------------------------------ | --------------------------------------------- | ---------------------------------- |
| **Wrong CWD**              | All hooks run in `repoRoot`                | `npm install` runs in main repo, not worktree | All users with post-worktree hooks |
| **Inconsistent execution** | `post-worktree` only in `modeNewFeature()` | Hooks don't run when using existing PR/branch | Users with automation workflows    |
| **No confirmation**        | Hooks execute immediately                  | Users can't preview or skip unwanted hooks    | Users wanting control over setup   |

### 1.3 Key Components

| Component        | File Location                   | Changes                                         | Est. Effort |
| ---------------- | ------------------------------- | ----------------------------------------------- | ----------- |
| **Types**        | `src/lib/hooks/types.ts`        | Add `cwd` to ComplexHookDef, confirmation types | 0.5h        |
| **Executor**     | `src/lib/hooks/executor.ts`     | Smart CWD resolution, per-hook defaults         | 2h          |
| **HookRunner**   | `src/lib/newpr/hook-runner.ts`  | Confirmation flow, store config                 | 2h          |
| **Confirmation** | `src/lib/hooks/confirmation.ts` | New module for interactive prompts              | 1.5h        |
| **newpr CLI**    | `src/cli/newpr.ts`              | Unified hook execution, all modes               | 2h          |

**Total Estimated Effort**: 8 hours

### 1.4 Dependencies

**Internal**:

- `src/lib/prompts.ts` - Interactive prompts (`promptChoice`, `promptInput`)
- `src/lib/colors.ts` - Terminal formatting
- `src/lib/hooks/templates.ts` - Hook template definitions (reference)

**External**:

- Node.js `child_process` - Command execution
- Node.js `readline` - For inline editing

### 1.5 Integration Points

1. **Hook Configuration** (`.worktreerc`): Add `cwd` option to hook definitions
2. **newpr modes**: All three modes call unified hook execution
3. **Interactive prompts**: Integrate with existing prompt system
4. **JSON output**: Include hook execution status in result

---

## 2. Detailed Design

### 2.1 Data Structures

```typescript
// Additions to src/lib/hooks/types.ts

/**
 * Extended ComplexHookDef with CWD support
 */
export interface ComplexHookDef {
  /** Shell command to run */
  command?: string;

  /** Path to script file */
  script?: string;

  /**
   * Working directory for hook execution
   * Supports template variables: {{WORKTREE_PATH}}, {{REPO_ROOT}}
   * If not specified, uses smart defaults based on hook name
   */
  cwd?: string;

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Whether to fail on error (default: true) */
  failOnError?: boolean;

  /** Condition for running the hook */
  if?: string;

  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Hook confirmation action choices
 */
export type HookConfirmAction = 'run' | 'skip' | 'edit';

/**
 * Result of confirmation prompt
 */
export interface HookConfirmResult {
  action: HookConfirmAction;
  /** Modified command (only when action is 'edit') */
  editedCommand?: string;
}

/**
 * Hooks that should default to worktree path when available
 */
export const WORKTREE_CWD_HOOKS: HookName[] = ['post-worktree', 'post-pr', 'post-push'];

/**
 * Check if hook should use worktree as default CWD
 */
export function shouldUseWorktreeCwd(hookName: HookName): boolean {
  return WORKTREE_CWD_HOOKS.includes(hookName);
}
```

### 2.2 CWD Resolution Logic

```typescript
// New function in src/lib/hooks/executor.ts

/**
 * Resolve the working directory for a hook
 *
 * Priority order:
 * 1. Explicit cwd in hook definition (supports templates)
 * 2. Smart default based on hook name
 * 3. Fallback to repoRoot
 */
export function resolveHookCwd(
  hookName: HookName,
  definition: HookDefinition,
  context: HookContext,
  options: HookExecutorOptions
): string {
  // 1. Check for explicit cwd in complex hook definition
  if (isComplexHook(definition) && definition.cwd) {
    return expandTemplateVariables(definition.cwd, context);
  }

  // 2. Smart defaults for post-* hooks when worktree exists
  if (shouldUseWorktreeCwd(hookName) && context.worktreePath) {
    return context.worktreePath;
  }

  // 3. Fallback to explicit options.cwd or repoRoot
  return options.cwd ?? context.repoRoot;
}
```

### 2.3 Confirmation Module

```typescript
// src/lib/hooks/confirmation.ts

import * as colors from '../colors.js';
import { promptChoice, promptInput } from '../prompts.js';
import type { HookName, HookDefinition, HookConfirmAction, HookConfirmResult } from './types.js';
import { isSimpleHook, isMultipleHook, isComplexHook } from './types.js';

/**
 * Check if running in an environment that supports prompts
 */
export function isInteractiveEnvironment(): boolean {
  return (
    process.stdin.isTTY === true &&
    !process.env.CI &&
    !process.env.GITHUB_ACTIONS &&
    process.env.TERM !== 'dumb'
  );
}

/**
 * Extract displayable command(s) from hook definition
 */
export function getHookCommands(definition: HookDefinition): string[] {
  if (isSimpleHook(definition)) {
    return [definition];
  }
  if (isMultipleHook(definition)) {
    return definition;
  }
  if (isComplexHook(definition)) {
    if (definition.command) return [definition.command];
    if (definition.script) return [`[script: ${definition.script}]`];
  }
  return ['[unknown hook format]'];
}

/**
 * Check if hook can be edited (only simple string hooks)
 */
export function isHookEditable(definition: HookDefinition): boolean {
  return isSimpleHook(definition);
}

/**
 * Display hook details and prompt for confirmation
 */
export async function promptHookConfirmation(
  hookName: HookName,
  definition: HookDefinition,
  cwd: string
): Promise<HookConfirmResult> {
  const commands = getHookCommands(definition);
  const canEdit = isHookEditable(definition);

  // Display hook information
  console.log();
  console.log(colors.bold(`Hook: ${hookName}`));
  console.log(colors.dim(`Working directory: ${cwd}`));
  console.log(colors.dim('Command(s):'));
  for (const cmd of commands) {
    console.log(`  ${colors.cyan(cmd)}`);
  }

  // Check for conditions
  if (isComplexHook(definition) && definition.if) {
    console.log(colors.dim(`Condition: ${definition.if}`));
  }

  console.log();

  // Build choices
  const choices = [
    { label: 'Run hook', description: 'Execute the hook now' },
    { label: 'Skip hook', description: 'Skip this hook and continue' },
  ];

  if (canEdit) {
    choices.push({
      label: 'Edit command',
      description: 'Modify the command before running',
    });
  }

  const choiceIndex = await promptChoice('How would you like to proceed?', choices);

  switch (choiceIndex) {
    case 0: // Run
      return { action: 'run' };

    case 1: // Skip
      return { action: 'skip' };

    case 2: // Edit (only available for simple hooks)
      if (canEdit) {
        const edited = await promptInput('Edit command:', commands[0]);
        // Allow empty to mean skip
        if (!edited.trim()) {
          return { action: 'skip' };
        }
        return { action: 'edit', editedCommand: edited };
      }
      return { action: 'run' };

    default:
      return { action: 'run' };
  }
}

/**
 * Format skipped hook message
 */
export function formatSkippedMessage(hookName: HookName): string {
  return colors.dim(`Skipped hook: ${hookName}`);
}
```

### 2.4 Updated HookRunner

```typescript
// Modifications to src/lib/newpr/hook-runner.ts

export interface HookRunnerOptions {
  verbose?: boolean;
  dryRun?: boolean;
  showOutput?: boolean;
  continueOnWarning?: boolean;

  /**
   * Whether to prompt for confirmation before running hooks
   * Only applies to non-critical hooks in interactive mode
   */
  confirmHooks?: boolean;

  defaultTimeout?: number;
  maxTimeout?: number;
}

export class HookRunner {
  private executor: HookExecutor;
  private hooksConfig: HooksConfig; // Store for confirmation access
  private context: Partial<HookContext>;
  private options: HookRunnerOptions;
  private hasHooks: boolean;

  // Critical hooks abort workflow on failure
  static readonly CRITICAL_HOOKS: HookName[] = [
    'pre-analyze',
    'pre-branch',
    'pre-commit',
    'pre-push',
    'pre-pr',
    'pre-worktree',
  ];

  // Non-critical hooks warn but continue
  static readonly NON_CRITICAL_HOOKS: HookName[] = [
    'post-analyze',
    'post-branch',
    'post-commit',
    'post-push',
    'post-pr',
    'post-worktree',
    'cleanup',
  ];

  constructor(
    hooksConfig: HooksConfig = {},
    initialContext: Partial<HookContext>,
    options: HookRunnerOptions = {}
  ) {
    this.hooksConfig = hooksConfig; // Store config
    this.executor = createHookExecutor(hooksConfig, {
      verbose: options.verbose,
      dryRun: options.dryRun,
      cwd: initialContext.repoRoot, // Default, will be overridden per-hook
      defaultTimeout: options.defaultTimeout,
      maxTimeout: options.maxTimeout,
    });
    this.context = initialContext;
    this.options = options;
    this.hasHooks = Object.keys(hooksConfig).length > 0;
  }

  /**
   * Run a hook with optional confirmation
   */
  async runHook(hookName: HookName): Promise<boolean> {
    if (!this.executor.hasHook(hookName)) {
      return true;
    }

    const fullContext: HookContext = {
      repoRoot: this.context.repoRoot ?? process.cwd(),
      baseBranch: this.context.baseBranch ?? 'main',
      ...this.context,
    };

    const definition = this.hooksConfig[hookName];
    if (!definition) {
      return true;
    }

    // Resolve CWD for this specific hook
    const cwd = resolveHookCwd(hookName, definition, fullContext, {
      cwd: this.context.repoRoot,
    });

    // Check if confirmation needed
    const isNonCritical = HookRunner.NON_CRITICAL_HOOKS.includes(hookName);
    const shouldConfirm = this.options.confirmHooks && isNonCritical && isInteractiveEnvironment();

    if (shouldConfirm) {
      const { action, editedCommand } = await promptHookConfirmation(hookName, definition, cwd);

      if (action === 'skip') {
        if (this.options.verbose) {
          console.log(formatSkippedMessage(hookName));
        }
        return true;
      }

      if (action === 'edit' && editedCommand) {
        // Execute edited command directly
        return this.executeEditedHook(hookName, editedCommand, fullContext, cwd);
      }
    }

    // Execute hook with resolved CWD
    if (this.options.verbose) {
      console.log(colors.dim(`Running hook: ${hookName} (cwd: ${cwd})`));
    }

    const result = await this.executor.executeHook(hookName, fullContext, { cwd });

    return this.handleResult(hookName, result);
  }

  /**
   * Execute an edited hook command
   */
  private async executeEditedHook(
    hookName: HookName,
    command: string,
    context: HookContext,
    cwd: string
  ): Promise<boolean> {
    // Create temporary executor for single command
    const tempExecutor = createHookExecutor(
      { [hookName]: command },
      {
        verbose: this.options.verbose,
        dryRun: this.options.dryRun,
        cwd,
      }
    );

    const result = await tempExecutor.executeHook(hookName, context);
    return this.handleResult(hookName, result);
  }

  // ... rest of existing implementation
}
```

### 2.5 Unified Hook Execution in newpr

```typescript
// New helper function in src/cli/newpr.ts

/**
 * Run post-worktree hooks after worktree creation
 * Called from all three modes (newFeature, existingPr, existingBranch)
 */
async function runPostWorktreeHooks(
  worktreePath: string,
  config: Required<WorktreeConfig>,
  options: Options,
  context: {
    branchName: string;
    prNumber: number;
    prUrl: string;
    description?: string;
    scenario?: string;
    action?: string;
  }
): Promise<void> {
  // Skip if no hooks configured or explicitly disabled
  if (options.noHooks || !config.hooks || Object.keys(config.hooks).length === 0) {
    return;
  }

  const repoRoot = git.getRepoRoot();

  const hookRunner = createHookRunner(
    config.hooks,
    {
      ...context,
      worktreePath,
      repoRoot,
      baseBranch: options.baseBranch,
    },
    {
      verbose: DEBUG_ENABLED,
      showOutput: true,
      // Enable confirmation in interactive mode (not CI, not --json, not --non-interactive)
      confirmHooks: !options.nonInteractive && !options.json && !process.env.CI,
      defaultTimeout: config.hookDefaults?.timeout,
      maxTimeout: config.hookDefaults?.maxTimeout,
    }
  );

  // Run post-worktree hook (non-critical, logs warning on failure)
  await hookRunner.runHook('post-worktree');
}

// Update modeExistingPr to call hooks
async function modeExistingPr(prNumber: number, options: Options): Promise<void> {
  // ... existing implementation ...

  // After setupWorktree() call:
  await runPostWorktreeHooks(worktreePath, config, options, {
    branchName: pr.headBranch,
    prNumber: pr.number,
    prUrl: pr.url,
  });

  printSummary(/* ... */);
}

// Update modeExistingBranch to call hooks
async function modeExistingBranch(branchName: string, options: Options): Promise<void> {
  // ... existing implementation ...

  // After setupWorktree() call:
  await runPostWorktreeHooks(worktreePath, config, options, {
    branchName,
    prNumber: pr.number,
    prUrl: pr.url,
    description: options.description,
  });

  printSummary(/* ... */);
}
```

---

## 3. Execution Flow

### 3.1 Happy Path - Hook with Confirmation

```
User runs: newpr "Add authentication"

┌─ Normal PR Creation Flow ───────────────────────────────────────┐
│  ... (branch, commit, push, PR creation) ...                    │
│  Worktree created at: /home/user/repo.pr42                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Hook Confirmation ─────────────────────────────────────────────┐
│                                                                 │
│  Hook: post-worktree                                            │
│  Working directory: /home/user/repo.pr42     ◀── NEW: worktree! │
│  Command(s):                                                    │
│    npm install && npm run build                                 │
│                                                                 │
│  How would you like to proceed?                                 │
│    ▶ Run hook                                                   │
│      Skip hook                                                  │
│      Edit command                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (User selects "Run hook")
┌─ Hook Execution ────────────────────────────────────────────────┐
│  $ cd /home/user/repo.pr42                                      │
│  $ npm install && npm run build                                 │
│                                                                 │
│  added 1247 packages in 32s                                     │
│  Build completed successfully.                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Summary ───────────────────────────────────────────────────────┐
│  ✓ Created PR #42: https://github.com/org/repo/pull/42          │
│  ✓ Worktree: /home/user/repo.pr42                               │
│  ✓ Hooks: post-worktree completed                               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Alternative Flow - Skip Hook

```
User runs: newpr "Quick fix"

... (PR creation) ...

  Hook: post-worktree
  Working directory: /home/user/repo.pr42
  Command(s):
    npm install

  How would you like to proceed?
    Run hook
  ▶ Skip hook                      ◀── User selects Skip
    Edit command

ℹ Skipped hook: post-worktree

✓ Created PR #43
```

### 3.3 Alternative Flow - Edit Hook

```
User runs: newpr "Add feature"

... (PR creation) ...

  Hook: post-worktree
  Working directory: /home/user/repo.pr42
  Command(s):
    npm install

  How would you like to proceed?
    Run hook
    Skip hook
  ▶ Edit command                   ◀── User selects Edit

Edit command: npm install && code .    ◀── User modifies

Running edited command...
✓ Hook completed
```

### 3.4 Non-Interactive Flow

```
User runs: newpr "CI feature" --non-interactive

... (PR creation) ...

ℹ Running hook: post-worktree (cwd: /home/user/repo.pr42)
  $ npm install
  added 1247 packages in 32s
✓ Hook completed

✓ Created PR #44
```

### 3.5 Sequence Diagram

```
┌─────┐        ┌──────┐       ┌──────────┐      ┌─────────┐      ┌───────┐
│User │        │newpr │       │HookRunner│      │Confirm  │      │Executor│
└──┬──┘        └──┬───┘       └────┬─────┘      └────┬────┘      └───┬───┘
   │              │                │                 │               │
   │ newpr "X"    │                │                 │               │
   │─────────────▶│                │                 │               │
   │              │                │                 │               │
   │              │ (PR creation)  │                 │               │
   │              │                │                 │               │
   │              │ runPostWorktreeHooks()          │               │
   │              │───────────────▶│                 │               │
   │              │                │                 │               │
   │              │                │ resolveHookCwd()│               │
   │              │                │─────────────────│               │
   │              │                │ (worktreePath)  │               │
   │              │                │◀────────────────│               │
   │              │                │                 │               │
   │              │                │ promptConfirm() │               │
   │              │                │────────────────▶│               │
   │              │                │                 │               │
   │◀─────────────────────────────────────────────── │ (display)     │
   │              │                │                 │               │
   │ "Run hook"   │                │                 │               │
   │─────────────────────────────────────────────── ▶│               │
   │              │                │                 │               │
   │              │                │◀────────────────│ {action:'run'}│
   │              │                │                 │               │
   │              │                │ executeHook(cwd=worktree)       │
   │              │                │────────────────────────────────▶│
   │              │                │                 │               │
   │              │                │◀────────────────────────────────│
   │              │◀───────────────│ (result)        │               │
   │              │                │                 │               │
   │◀─────────────│ (summary)      │                 │               │
   │              │                │                 │               │
```

---

## 4. Edge Cases & Mitigations

| #   | Edge Case / Failure Mode                    | Impact | Likelihood | Mitigation Strategy                                             |
| --- | ------------------------------------------- | ------ | ---------- | --------------------------------------------------------------- |
| 1   | **Worktree path doesn't exist yet**         | High   | Very Low   | Check path exists before using as CWD; fall back to repoRoot    |
| 2   | **Explicit cwd template expands to empty**  | Medium | Low        | Validate expanded CWD; warn and fall back to default            |
| 3   | **Explicit cwd path doesn't exist**         | Medium | Low        | Create directory if reasonable; error with clear message        |
| 4   | **User edits command to empty string**      | Low    | Low        | Treat empty edit as "skip"                                      |
| 5   | **User edits command with syntax error**    | Low    | Medium     | Let shell report error; show output; offer retry                |
| 6   | **Hook times out in worktree**              | Medium | Low        | Same timeout handling; include CWD in timeout message           |
| 7   | **Confirmation prompt in pipe/redirect**    | Medium | Medium     | Detect non-TTY; skip confirmation in non-interactive            |
| 8   | **CI environment with confirmHooks=true**   | Medium | Low        | Check CI env vars; force non-interactive                        |
| 9   | **Multiple hooks need confirmation**        | Low    | Medium     | Confirm each independently; or add "Run all/Skip all" option    |
| 10  | **post-pr hook before worktree created**    | Medium | Low        | Hook execution order prevents this; worktreePath not in context |
| 11  | **User Ctrl+C during confirmation**         | Low    | Medium     | Signal handling; clean exit; no partial state                   |
| 12  | **Edited command contains shell injection** | High   | Very Low   | User responsibility; they're editing their own hooks            |
| 13  | **Worktree on different drive (Windows)**   | Low    | Low        | Use absolute paths; Node handles cross-drive                    |
| 14  | **Symlinked worktree path**                 | Low    | Very Low   | Resolve symlinks for display; use original for CWD              |
| 15  | **Hook reads from stdin (blocks)**          | Medium | Low        | Document that hooks should not require input; timeout kills     |
| 16  | **confirmHooks + dryRun combination**       | Low    | Low        | Still show confirmation in dry-run; indicate dry-run status     |
| 17  | **Existing mode runs same hook twice**      | Low    | Very Low   | Deduplicate hook calls; track which hooks ran                   |
| 18  | **Nested worktree scenario**                | Low    | Very Low   | Detect nested worktrees; use innermost path                     |
| 19  | **Hook output extremely long**              | Low    | Low        | Truncate output in summary; full output available in verbose    |
| 20  | **Windows path with spaces in cwd**         | Medium | Medium     | Quote paths; test on Windows specifically                       |

### 4.1 Detailed Mitigation: CWD Validation

```typescript
/**
 * Validate and prepare CWD for hook execution
 */
function validateAndPrepareCwd(
  cwd: string,
  hookName: HookName,
  context: HookContext
): { valid: boolean; cwd: string; warning?: string } {
  // Expand any remaining template variables
  const expandedCwd = expandTemplateVariables(cwd, context);

  // Check for empty result
  if (!expandedCwd || expandedCwd.trim() === '') {
    return {
      valid: true,
      cwd: context.repoRoot,
      warning: `Hook ${hookName}: CWD expanded to empty, using repoRoot`,
    };
  }

  // Resolve to absolute path
  const absoluteCwd = path.isAbsolute(expandedCwd)
    ? expandedCwd
    : path.resolve(context.repoRoot, expandedCwd);

  // Check if path exists
  if (!fs.existsSync(absoluteCwd)) {
    // For worktree hooks, this might be expected if worktree creation failed
    if (shouldUseWorktreeCwd(hookName)) {
      return {
        valid: false,
        cwd: context.repoRoot,
        warning: `Hook ${hookName}: Worktree path does not exist: ${absoluteCwd}`,
      };
    }

    // For other hooks, try to create the directory
    try {
      fs.mkdirSync(absoluteCwd, { recursive: true });
      return {
        valid: true,
        cwd: absoluteCwd,
        warning: `Hook ${hookName}: Created missing directory: ${absoluteCwd}`,
      };
    } catch {
      return {
        valid: false,
        cwd: context.repoRoot,
        warning: `Hook ${hookName}: Cannot create CWD: ${absoluteCwd}`,
      };
    }
  }

  // Check if path is a directory
  if (!fs.statSync(absoluteCwd).isDirectory()) {
    return {
      valid: false,
      cwd: context.repoRoot,
      warning: `Hook ${hookName}: CWD is not a directory: ${absoluteCwd}`,
    };
  }

  return { valid: true, cwd: absoluteCwd };
}
```

### 4.2 Detailed Mitigation: Non-Interactive Detection

```typescript
/**
 * Comprehensive check for interactive environment
 */
export function isInteractiveEnvironment(): boolean {
  // Not a TTY - definitely non-interactive
  if (!process.stdin.isTTY) {
    return false;
  }

  // CI environments
  if (process.env.CI === 'true' || process.env.CI === '1') {
    return false;
  }

  // Specific CI systems
  const ciEnvVars = [
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CIRCLECI',
    'TRAVIS',
    'JENKINS_URL',
    'BUILDKITE',
    'TEAMCITY_VERSION',
    'TF_BUILD', // Azure DevOps
  ];

  if (ciEnvVars.some((v) => process.env[v])) {
    return false;
  }

  // Dumb terminal
  if (process.env.TERM === 'dumb') {
    return false;
  }

  // Running in non-interactive shell
  if (process.env.DEBIAN_FRONTEND === 'noninteractive') {
    return false;
  }

  return true;
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

**File**: `src/lib/hooks/confirmation.test.ts`

| #   | Test Case                                                  | Est. |
| --- | ---------------------------------------------------------- | ---- |
| 1   | `getHookCommands` returns single command for simple hook   | 5m   |
| 2   | `getHookCommands` returns array for multiple hook          | 5m   |
| 3   | `getHookCommands` returns command from complex hook        | 5m   |
| 4   | `getHookCommands` returns script path from complex hook    | 5m   |
| 5   | `isHookEditable` returns true for simple string            | 5m   |
| 6   | `isHookEditable` returns false for array                   | 5m   |
| 7   | `isHookEditable` returns false for complex hook            | 5m   |
| 8   | `isInteractiveEnvironment` returns false when no TTY       | 5m   |
| 9   | `isInteractiveEnvironment` returns false in CI             | 5m   |
| 10  | `isInteractiveEnvironment` returns true in normal terminal | 5m   |

**File**: `src/lib/hooks/executor.test.ts` (additions)

| #   | Test Case                                                | Est. |
| --- | -------------------------------------------------------- | ---- |
| 11  | `resolveHookCwd` returns worktreePath for post-worktree  | 10m  |
| 12  | `resolveHookCwd` returns worktreePath for post-pr        | 10m  |
| 13  | `resolveHookCwd` returns worktreePath for post-push      | 10m  |
| 14  | `resolveHookCwd` returns repoRoot for pre-\* hooks       | 10m  |
| 15  | `resolveHookCwd` respects explicit cwd in definition     | 10m  |
| 16  | `resolveHookCwd` expands templates in explicit cwd       | 10m  |
| 17  | `resolveHookCwd` falls back to repoRoot when no worktree | 10m  |
| 18  | Hook executes in correct CWD (integration)               | 15m  |

**File**: `src/lib/newpr/hook-runner.test.ts` (additions)

| #   | Test Case                                               | Est. |
| --- | ------------------------------------------------------- | ---- |
| 19  | `HookRunner` stores config for confirmation access      | 10m  |
| 20  | `runHook` skips confirmation in non-interactive mode    | 10m  |
| 21  | `runHook` skips confirmation for critical hooks         | 10m  |
| 22  | `runHook` with confirmHooks=true prompts in interactive | 15m  |
| 23  | `runHook` respects skip action from confirmation        | 10m  |
| 24  | `executeEditedHook` runs modified command               | 15m  |

### 5.2 Integration Tests

**File**: `src/integration/hooks.integration.test.ts`

| #   | Test Case                                         | Est. |
| --- | ------------------------------------------------- | ---- |
| 1   | post-worktree hook runs in worktree directory     | 20m  |
| 2   | Hook creates file in correct location             | 15m  |
| 3   | Hook can access worktree-specific package.json    | 15m  |
| 4   | modeExistingPr runs post-worktree hook            | 20m  |
| 5   | modeExistingBranch runs post-worktree hook        | 20m  |
| 6   | All three modes produce consistent hook behaviour | 15m  |

### 5.3 Manual Verification Steps

```bash
# Setup: Create test config with post-worktree hook
cd /path/to/test-repo
cat > .worktreerc << 'EOF'
{
  "configVersion": 1,
  "hooks": {
    "post-worktree": "pwd && ls -la"
  }
}
EOF

# Test 1: New feature mode - should show worktree path
newpr "Test hooks"
# Expected:
#   Hook: post-worktree
#   Working directory: /path/to/test-repo.pr123  (NOT main repo!)
#   $ pwd && ls -la
#   /path/to/test-repo.pr123

# Test 2: Existing PR mode
newpr --pr 123
# Expected: Same hook behaviour, runs in worktree

# Test 3: Non-interactive mode
newpr "CI test" --non-interactive
# Expected: No confirmation prompt, hook runs automatically

# Test 4: Skip hook
newpr "Skip test"
# Select "Skip hook" when prompted
# Expected: "Skipped hook: post-worktree"

# Test 5: Edit hook
newpr "Edit test"
# Select "Edit command", change to "echo hello"
# Expected: Runs "echo hello" instead of original

# Test 6: Explicit CWD override
cat > .worktreerc << 'EOF'
{
  "configVersion": 1,
  "hooks": {
    "post-worktree": {
      "command": "pwd",
      "cwd": "{{REPO_ROOT}}"
    }
  }
}
EOF
newpr "CWD override test"
# Expected: Hook runs in main repo, not worktree
```

---

## 6. Implementation Checklist

### Phase 1: Types & CWD Logic (Est: 2.5h)

- [ ] Add `cwd` property to `ComplexHookDef` interface
- [ ] Add `HookConfirmAction` and `HookConfirmResult` types
- [ ] Add `WORKTREE_CWD_HOOKS` constant
- [ ] Add `shouldUseWorktreeCwd()` function
- [ ] Implement `resolveHookCwd()` function
- [ ] Update JSON schema with `cwd` property
- [ ] Write unit tests for CWD resolution

### Phase 2: Confirmation Module (Est: 1.5h)

- [ ] Create `src/lib/hooks/confirmation.ts`
- [ ] Implement `isInteractiveEnvironment()`
- [ ] Implement `getHookCommands()`
- [ ] Implement `isHookEditable()`
- [ ] Implement `promptHookConfirmation()`
- [ ] Write unit tests for confirmation functions

### Phase 3: HookRunner Updates (Est: 2h)

- [ ] Add `confirmHooks` to `HookRunnerOptions`
- [ ] Store `hooksConfig` in HookRunner class
- [ ] Update `runHook()` with confirmation logic
- [ ] Implement `executeEditedHook()`
- [ ] Pass resolved CWD to executor
- [ ] Write unit tests for HookRunner changes

### Phase 4: newpr Integration (Est: 2h)

- [ ] Create `runPostWorktreeHooks()` helper
- [ ] Integrate into `modeNewFeature()`
- [ ] Integrate into `modeExistingPr()`
- [ ] Integrate into `modeExistingBranch()`
- [ ] Remove duplicate hook code
- [ ] Add hook status to JSON output
- [ ] Write integration tests

### Phase 5: Polish & Documentation (Est: 1h)

- [ ] Update docs/AI-TOOLING.md hook section
- [ ] Add CWD examples to hook documentation
- [ ] Test on Windows, macOS, Linux
- [ ] Test edge cases from table

**Total Estimated Effort**: 9 hours

---

## 7. Open Questions

1. **Multiple hook confirmation UX**: When multiple hooks run (e.g., post-pr then post-worktree), should we offer "Run all" / "Skip all" options?
   - **Recommendation**: Start simple (confirm each); add batch options in future if users request.

2. **Confirmation for post-pr hook**: Should post-pr also get confirmation, or only post-worktree?
   - **Recommendation**: Apply confirmation to all hooks in `WORKTREE_CWD_HOOKS` since they affect the new worktree.

3. **Edit history**: Should we remember edited commands for next time?
   - **Recommendation**: Out of scope for now; adds complexity. Users can modify config if needed.

4. **Verbose CWD logging**: Should we always show the CWD in hook output, or only in verbose mode?
   - **Recommendation**: Show CWD in confirmation prompt; in execution, show only in verbose mode.

---

## 8. References

- [Current executor.ts](../src/lib/hooks/executor.ts) - Existing hook execution code
- [Current hook-runner.ts](../src/lib/newpr/hook-runner.ts) - Current HookRunner implementation
- [Hook types](../src/lib/hooks/types.ts) - Type definitions
- [Hook templates](../src/lib/hooks/templates.ts) - Built-in hook templates
- [AI Tooling Guide](../docs/AI-TOOLING.md) - Hook documentation for AI agents
- [newpr.ts](../src/cli/newpr.ts) - PR creation modes

---

**Document End**

_This document must be reviewed and approved before implementation begins._
