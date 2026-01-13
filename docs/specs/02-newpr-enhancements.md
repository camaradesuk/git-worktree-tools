# newpr Enhancements - Consolidated Implementation Specification

**Status**: 📝 Draft
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: WSL Ubuntu / macOS / Windows
**PR**: #18
**Consolidates**: hooks-improvements + ai-plan-documents

---

## Executive Summary

This specification consolidates two closely related newpr enhancements into a single implementation plan:

1. **Hooks System Improvements** - Fix working directory bug where post-\* hooks execute in the main repo instead of the worktree, ensure consistent hook execution across all three PR creation modes, and add interactive confirmation wizard for hook review.

2. **AI Plan Documents** - Auto-generate implementation planning documents during PR creation with configurable paths, YAML frontmatter metadata, and flexible trigger methods (CLI flag, config, interactive prompt).

These features share a critical integration point: plan generation occurs **after worktree setup, before post-worktree hook**. Implementing them together ensures a smooth user experience and reduces code churn in the newpr module.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Feature A: Hooks System Improvements](#2-feature-a-hooks-system-improvements)
3. [Feature B: AI Plan Documents](#3-feature-b-ai-plan-documents)
4. [Integration Points](#4-integration-points)
5. [Execution Flow](#5-execution-flow)
6. [Edge Cases & Mitigations](#6-edge-cases--mitigations)
7. [Testing Strategy](#7-testing-strategy)
8. [Implementation Checklist](#8-implementation-checklist)
9. [Open Questions](#9-open-questions)
10. [References](#10-references)

---

## 1. High-Level Architecture

### 1.1 Combined Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        newpr Enhanced Flow                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐      │
│  │  PR/Branch  │──▶│  Worktree   │──▶│  Plan Gen   │──▶│  Hooks Run  │      │
│  │  Creation   │   │  Setup      │   │  (NEW)      │   │  (IMPROVED) │      │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘      │
│                                              │                │              │
│                                              │                │              │
│                                              ▼                ▼              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     NEW COMPONENTS                                    │   │
│  │                                                                       │   │
│  │  Plan Generator Module          │    Hooks Confirmation Module        │   │
│  │  • shouldGeneratePlan()         │    • promptHookConfirmation()       │   │
│  │  • generatePlanDocument()       │    • resolveHookCwd()               │   │
│  │  • expandPathTemplate()         │    • isInteractiveEnvironment()     │   │
│  │  • YAML frontmatter             │    • WORKTREE_CWD_HOOKS constant    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Summary

| Feature   | Component           | File Location                      | Est. Effort |
| --------- | ------------------- | ---------------------------------- | ----------- |
| **Hooks** | Types update        | `src/lib/hooks/types.ts`           | 0.5h        |
| **Hooks** | CWD Resolver        | `src/lib/hooks/executor.ts`        | 2h          |
| **Hooks** | Confirmation Module | `src/lib/hooks/confirmation.ts`    | 1.5h        |
| **Hooks** | HookRunner Updates  | `src/lib/newpr/hook-runner.ts`     | 2h          |
| **Plans** | Types update        | `src/lib/ai/types.ts`              | 0.5h        |
| **Plans** | Plan Generator      | `src/lib/newpr/plan-generator.ts`  | 3h          |
| **Plans** | Generation Service  | `src/lib/ai/generation-service.ts` | 0.5h        |
| **Both**  | newpr Integration   | `src/cli/newpr.ts`                 | 3h          |
| **Both**  | Args Parsing        | `src/lib/newpr/args.ts`            | 1h          |
| **Both**  | Tests               | Various                            | 4h          |
| **Both**  | Documentation       | README, help text                  | 1h          |

**Total Estimated Effort**: 19 hours

### 1.3 Dependencies

**Internal**:

- `src/lib/prompts.ts` - Interactive prompts
- `src/lib/colors.ts` - Terminal formatting
- `src/lib/ai/provider-manager.ts` - AI provider availability
- `src/lib/config.ts` - Config loading

**External**:

- Node.js `child_process` - Hook command execution
- AI provider (Claude, Gemini, OpenAI, Ollama) - Plan content generation

---

## 2. Feature A: Hooks System Improvements

### 2.1 Problem Statement

| Problem                    | Current Behaviour                          | Impact                                        |
| -------------------------- | ------------------------------------------ | --------------------------------------------- |
| **Wrong CWD**              | All hooks run in `repoRoot`                | `npm install` runs in main repo, not worktree |
| **Inconsistent execution** | `post-worktree` only in `modeNewFeature()` | Hooks don't run when using existing PR/branch |
| **No confirmation**        | Hooks execute immediately                  | Users can't preview or skip unwanted hooks    |

### 2.2 Solution: Smart CWD Resolution

```typescript
// src/lib/hooks/types.ts additions

/**
 * Hooks that should default to worktree path when available
 */
export const WORKTREE_CWD_HOOKS: HookName[] = ['post-worktree', 'post-pr', 'post-push'];

/**
 * Extended ComplexHookDef with CWD support
 */
export interface ComplexHookDef {
  command?: string;
  script?: string;
  /** Working directory: supports {{WORKTREE_PATH}}, {{REPO_ROOT}} */
  cwd?: string;
  timeout?: number;
  failOnError?: boolean;
  if?: string;
  env?: Record<string, string>;
}
```

```typescript
// src/lib/hooks/executor.ts

/**
 * Resolve the working directory for a hook
 * Priority: 1) Explicit cwd, 2) Smart default, 3) repoRoot
 */
export function resolveHookCwd(
  hookName: HookName,
  definition: HookDefinition,
  context: HookContext,
  options: HookExecutorOptions
): string {
  // 1. Explicit cwd in complex hook definition
  if (isComplexHook(definition) && definition.cwd) {
    return expandTemplateVariables(definition.cwd, context);
  }

  // 2. Smart defaults for post-* hooks when worktree exists
  if (shouldUseWorktreeCwd(hookName) && context.worktreePath) {
    return context.worktreePath;
  }

  // 3. Fallback to repoRoot
  return options.cwd ?? context.repoRoot;
}
```

### 2.3 Solution: Hook Confirmation Wizard

```typescript
// src/lib/hooks/confirmation.ts

export type HookConfirmAction = 'run' | 'skip' | 'edit';

export interface HookConfirmResult {
  action: HookConfirmAction;
  editedCommand?: string;
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

  console.log();
  console.log(colors.bold(`Hook: ${hookName}`));
  console.log(colors.dim(`Working directory: ${cwd}`));
  console.log(colors.dim('Command(s):'));
  for (const cmd of commands) {
    console.log(`  ${colors.cyan(cmd)}`);
  }

  const choices = [
    { label: 'Run hook', description: 'Execute the hook now' },
    { label: 'Skip hook', description: 'Skip this hook and continue' },
  ];

  if (canEdit) {
    choices.push({ label: 'Edit command', description: 'Modify before running' });
  }

  const choiceIndex = await promptChoice('How would you like to proceed?', choices);
  // ... handle choice
}
```

### 2.4 Solution: Consistent Hook Execution

All three newpr modes will call a unified `runPostWorktreeHooks()` helper:

```typescript
// src/cli/newpr.ts

async function runPostWorktreeHooks(
  worktreePath: string,
  config: Required<WorktreeConfig>,
  options: Options,
  context: { branchName: string; prNumber: number; prUrl: string }
): Promise<void> {
  if (options.noHooks || !config.hooks) return;

  const hookRunner = createHookRunner(
    config.hooks,
    {
      ...context,
      worktreePath,
      repoRoot: git.getRepoRoot(),
      baseBranch: options.baseBranch,
    },
    {
      verbose: DEBUG_ENABLED,
      showOutput: true,
      confirmHooks: !options.nonInteractive && !options.json && !process.env.CI,
    }
  );

  await hookRunner.runHook('post-worktree');
}
```

---

## 3. Feature B: AI Plan Documents

### 3.1 Problem Statement

Users want AI-generated implementation plans during PR creation to:

- Document the implementation approach before coding
- Provide context for reviewers
- Track plan status as work progresses

### 3.2 Solution: Flexible Trigger Methods

| Method                  | Description                    | Priority |
| ----------------------- | ------------------------------ | -------- |
| `--plan` flag           | CLI flag forces generation     | Highest  |
| `ai.planDocument: true` | Config enables auto-generation | Medium   |
| Interactive prompt      | Wizard asks when AI available  | Lowest   |

```typescript
// src/lib/newpr/plan-generator.ts

export function shouldGeneratePlan(options: {
  cliFlag?: boolean;
  noFlag?: boolean;
  configEnabled?: boolean;
  aiAvailable: boolean;
  nonInteractive: boolean;
}): { generate: boolean; prompt: boolean; reason: string } {
  if (options.noFlag) return { generate: false, prompt: false, reason: 'Disabled by --no-plan' };
  if (options.cliFlag) return { generate: true, prompt: false, reason: 'Enabled by --plan' };
  if (options.configEnabled) return { generate: true, prompt: false, reason: 'Enabled by config' };
  if (options.aiAvailable && !options.nonInteractive) {
    return { generate: false, prompt: true, reason: 'AI available, prompting user' };
  }
  return { generate: false, prompt: false, reason: 'Not configured' };
}
```

### 3.3 Solution: Path Templates

```json
{
  "ai": {
    "planDocument": true,
    "planPath": "PLAN-{prNumber}-{slug}.md",
    "planPathMode": "fixed"
  }
}
```

**Template Variables:**

| Variable      | Description                                  | Example         |
| ------------- | -------------------------------------------- | --------------- |
| `{prNumber}`  | PR number                                    | `42`            |
| `{slug}`      | Brief description (kebab-case, max 30 chars) | `add-user-auth` |
| `{branch}`    | Branch name (sanitized)                      | `feat-add-auth` |
| `{date}`      | ISO date                                     | `2026-01-13`    |
| `{timestamp}` | Unix timestamp                               | `1736784000`    |

### 3.4 Solution: YAML Frontmatter

Generated plans include metadata for tracking:

```markdown
---
title: 'Add user authentication'
status: draft
pr: 42
branch: feat/add-auth
base: main
created: 2026-01-13T10:30:00Z
updated: 2026-01-13T10:30:00Z
author: ai-generated
generator: git-worktree-tools
generator_version: '1.8.0'
---

# Implementation Plan: Add user authentication

...
```

**Status Workflow:**

```
draft → in-progress → complete
                   ↘ abandoned
```

### 3.5 Key Functions

```typescript
// src/lib/newpr/plan-generator.ts

export function generateSlug(description: string, maxLength = 30): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

export function expandPathTemplate(template: string, vars: PathTemplateVars): string {
  return template
    .replace(/\{prNumber\}/g, String(vars.prNumber))
    .replace(/\{slug\}/g, vars.slug)
    .replace(/\{branch\}/g, vars.branch.replace(/\//g, '-'))
    .replace(/\{date\}/g, vars.date)
    .replace(/\{timestamp\}/g, String(vars.timestamp));
}

export function generateFrontmatter(options: {
  title: string;
  prNumber: number;
  branchName: string;
  baseBranch: string;
}): PlanFrontmatter {
  const now = new Date().toISOString();
  return {
    title: options.title,
    status: 'draft',
    pr: options.prNumber,
    branch: options.branchName,
    base: options.baseBranch,
    created: now,
    updated: now,
    author: 'ai-generated',
    generator: 'git-worktree-tools',
    generator_version: process.env.npm_package_version || 'unknown',
  };
}
```

---

## 4. Integration Points

### 4.1 Critical Integration: Plan Before Hook

The most important integration point is that **plan generation must occur after worktree setup but before the post-worktree hook**:

```
worktree created → handlePlanGeneration() → post-worktree hook → summary
```

This ordering ensures:

1. Plan document exists in worktree before hooks run
2. Hooks can reference/use the plan document if needed
3. Plan generation failure doesn't block hook execution (warn and continue)

### 4.2 Unified newpr Integration

```typescript
// src/cli/newpr.ts

async function executePostWorktreeSequence(
  worktreePath: string,
  config: Required<WorktreeConfig>,
  options: Options,
  context: { description: string; branchName: string; prNumber: number; prUrl: string }
): Promise<{ planResult?: PlanGeneratorResult; hookResult?: boolean }> {
  const result: { planResult?: PlanGeneratorResult; hookResult?: boolean } = {};

  // Step 1: Plan generation (optional, non-blocking)
  result.planResult = await handlePlanGeneration(options, {
    description: context.description,
    branchName: context.branchName,
    baseBranch: options.baseBranch,
    prNumber: context.prNumber,
    worktreePath,
    repoRoot: git.getRepoRoot(),
    config,
  });

  // Step 2: Post-worktree hooks
  await runPostWorktreeHooks(worktreePath, config, options, context);

  return result;
}
```

### 4.3 CLI Flags

Both features add flags that must be parsed together:

```typescript
// src/lib/newpr/args.ts

case '--plan':
  options.generatePlan = true;
  break;

case '--no-plan':
  options.noPlan = true;
  break;

case '--no-hooks':
  options.noHooks = true;
  break;

case '--confirm-hooks':
  options.confirmHooks = true;
  break;
```

### 4.4 JSON Output

```typescript
interface NewprJsonOutput {
  success: boolean;
  mode: 'new' | 'existingPr' | 'existingBranch';
  branch: string;
  worktree: string;
  pr: { number: number; url: string };
  // NEW: Plan generation status
  plan?: {
    generated: boolean;
    path?: string;
    error?: string;
    frontmatter?: PlanFrontmatter;
  };
  // NEW: Hook execution status
  hooks?: {
    executed: HookName[];
    skipped: HookName[];
    failed: HookName[];
  };
}
```

---

## 5. Execution Flow

### 5.1 Complete Happy Path

```
User runs: newpr "Add authentication" --plan

┌─ PR Creation Flow ──────────────────────────────────────────────────┐
│  1. Parse args (--plan flag detected)                               │
│  2. Load config (.worktreerc)                                       │
│  3. Create branch: feat/add-authentication                          │
│  4. Create PR #42                                                   │
│  5. Create worktree: /home/user/repo.pr42                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Plan Generation ───────────────────────────────────────────────────┐
│  Generating AI plan document...                                     │
│  ✓ Created: PLAN-42-add-authentication.md                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Hook Confirmation ─────────────────────────────────────────────────┐
│  Hook: post-worktree                                                │
│  Working directory: /home/user/repo.pr42   ◀── Correct! (fixed)     │
│  Command(s):                                                        │
│    npm install && npm run build                                     │
│                                                                     │
│  How would you like to proceed?                                     │
│    ▶ Run hook                                                       │
│      Skip hook                                                      │
│      Edit command                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (User selects "Run hook")
┌─ Hook Execution ────────────────────────────────────────────────────┐
│  $ cd /home/user/repo.pr42                                          │
│  $ npm install && npm run build                                     │
│  added 1247 packages in 32s                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Summary ───────────────────────────────────────────────────────────┐
│  ✓ Created PR #42: https://github.com/org/repo/pull/42              │
│  ✓ Worktree: /home/user/repo.pr42                                   │
│  ✓ Plan: PLAN-42-add-authentication.md                              │
│  ✓ Hooks: post-worktree completed                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Sequence Diagram

```
┌─────┐      ┌──────┐      ┌─────────┐      ┌──────────┐      ┌─────────┐
│User │      │newpr │      │PlanGen  │      │HookRunner│      │Executor │
└──┬──┘      └──┬───┘      └────┬────┘      └────┬─────┘      └────┬────┘
   │            │               │                │                  │
   │ newpr "X"  │               │                │                  │
   │───────────▶│               │                │                  │
   │            │               │                │                  │
   │            │ (worktree setup)               │                  │
   │            │               │                │                  │
   │            │ handlePlanGeneration()        │                  │
   │            │──────────────▶│                │                  │
   │            │               │                │                  │
   │            │◀──────────────│ (plan result)  │                  │
   │            │               │                │                  │
   │            │ runPostWorktreeHooks()        │                  │
   │            │───────────────────────────────▶│                  │
   │            │               │                │                  │
   │            │               │                │ resolveHookCwd() │
   │            │               │                │─────────────────▶│
   │            │               │                │◀─────────────────│
   │            │               │                │                  │
   │◀───────────────────────────────────────────│ (confirmation)   │
   │            │               │                │                  │
   │ "Run"      │               │                │                  │
   │───────────────────────────────────────────▶│                  │
   │            │               │                │                  │
   │            │               │                │ executeHook()    │
   │            │               │                │─────────────────▶│
   │            │               │                │◀─────────────────│
   │            │               │                │                  │
   │            │◀──────────────────────────────│ (result)         │
   │            │               │                │                  │
   │◀───────────│ (summary)     │                │                  │
```

---

## 6. Edge Cases & Mitigations

### 6.1 Hooks Edge Cases

| #   | Edge Case                              | Impact | Mitigation                               |
| --- | -------------------------------------- | ------ | ---------------------------------------- |
| 1   | Worktree path doesn't exist yet        | High   | Check path exists; fall back to repoRoot |
| 2   | Explicit cwd template expands to empty | Medium | Validate; warn and fall back to default  |
| 3   | User edits command to empty string     | Low    | Treat empty edit as "skip"               |
| 4   | Hook times out in worktree             | Medium | Include CWD in timeout message           |
| 5   | Confirmation prompt in pipe/redirect   | Medium | Detect non-TTY; skip confirmation        |
| 6   | CI environment with confirmHooks=true  | Medium | Check CI env vars; force non-interactive |
| 7   | Windows path with spaces in cwd        | Medium | Quote paths; test on Windows             |

### 6.2 Plan Generation Edge Cases

| #   | Edge Case                         | Impact | Mitigation                                 |
| --- | --------------------------------- | ------ | ------------------------------------------ |
| 1   | AI provider unavailable           | Medium | Clear error; suggest config in interactive |
| 2   | File write fails (permissions)    | Medium | Offer temp file; warn and continue         |
| 3   | Existing plan file                | Medium | Prompt overwrite/skip/rename               |
| 4   | Invalid path characters           | Low    | Validate; reject with clear error          |
| 5   | Path escapes worktree             | Medium | Restrict to worktree; require confirmation |
| 6   | LLM suggests invalid path         | Medium | Validate; fall back to default             |
| 7   | Very large repo context           | Low    | Truncate README; limit file list           |
| 8   | Network timeout during generation | Medium | Configurable timeout; retry once           |

### 6.3 Integration Edge Cases

| #   | Edge Case                                      | Impact | Mitigation                                 |
| --- | ---------------------------------------------- | ------ | ------------------------------------------ |
| 1   | Plan generation fails, hooks still need to run | Medium | Log warning; continue to hooks             |
| 2   | Both --plan and --no-hooks specified           | Low    | Both honored independently                 |
| 3   | AI used for plan but hooks fail                | Medium | Plan success reported; hook failure logged |

---

## 7. Testing Strategy

### 7.1 Hooks Unit Tests

```typescript
// src/lib/hooks/confirmation.test.ts
describe('getHookCommands', () => {
  /* ... */
});
describe('isHookEditable', () => {
  /* ... */
});
describe('isInteractiveEnvironment', () => {
  /* ... */
});

// src/lib/hooks/executor.test.ts
describe('resolveHookCwd', () => {
  it('returns worktreePath for post-worktree');
  it('returns worktreePath for post-pr');
  it('returns repoRoot for pre-* hooks');
  it('respects explicit cwd in definition');
  it('expands templates in explicit cwd');
});
```

### 7.2 Plan Generator Unit Tests

```typescript
// src/lib/newpr/plan-generator.test.ts
describe('shouldGeneratePlan', () => {
  it('returns generate=true when --plan flag set');
  it('returns generate=false when --no-plan flag set');
  it('returns prompt=true when AI available but not configured');
});

describe('generateSlug', () => {
  it('converts description to kebab-case');
  it('limits to first 5 words');
  it('limits total length to 30 characters');
  it('removes special characters');
});

describe('expandPathTemplate', () => {
  it('expands {prNumber}');
  it('expands {slug}');
  it('sanitizes branch name (replaces /)');
});

describe('generateFrontmatter', () => {
  it('generates correct frontmatter structure');
});
```

### 7.3 Integration Tests

```typescript
// src/integration/newpr-enhancements.test.ts
describe('newpr post-worktree sequence', () => {
  it('generates plan document before running hooks');
  it('runs hooks in worktree directory (not repo root)');
  it('handles plan failure gracefully and continues to hooks');
  it('modeExistingPr runs same sequence');
  it('modeExistingBranch runs same sequence');
});
```

### 7.4 Manual Verification

```bash
# Test 1: Plan + Hooks together
newpr "Test both features" --plan
# Expected: Plan generated, then hook confirmation shown with worktree CWD

# Test 2: Plan only
newpr "Test plan only" --plan --no-hooks
# Expected: Plan generated, hooks skipped

# Test 3: Hooks only with confirmation
newpr "Test hooks" --confirm-hooks
# Expected: No plan, hook confirmation shown

# Test 4: Non-interactive
newpr "CI test" --plan --non-interactive
# Expected: Plan generated automatically, hooks run without confirmation

# Test 5: Existing PR mode
newpr --pr 123 --plan
# Expected: Same sequence as new feature mode
```

---

## 8. Implementation Checklist

### Phase 1: Foundation (Est: 3h)

- [ ] Add `cwd` property to `ComplexHookDef` interface
- [ ] Add `HookConfirmAction`, `HookConfirmResult` types
- [ ] Add `WORKTREE_CWD_HOOKS` constant
- [ ] Add `planPath`, `planPathMode` to `AIConfig`
- [ ] Add `PlanFrontmatter` interface
- [ ] Add `generatePlan`, `noPlan` to Options
- [ ] Update JSON schema for new config options

### Phase 2: Hooks System (Est: 5.5h)

- [ ] Implement `resolveHookCwd()` function
- [ ] Implement `shouldUseWorktreeCwd()` function
- [ ] Create `src/lib/hooks/confirmation.ts` module
- [ ] Implement `isInteractiveEnvironment()`
- [ ] Implement `getHookCommands()`, `isHookEditable()`
- [ ] Implement `promptHookConfirmation()`
- [ ] Update HookRunner with `confirmHooks` option
- [ ] Implement `executeEditedHook()`
- [ ] Write unit tests for hooks changes

### Phase 3: Plan Generator (Est: 4h)

- [ ] Create `src/lib/newpr/plan-generator.ts` module
- [ ] Implement `shouldGeneratePlan()`
- [ ] Implement `generateSlug()`, `expandPathTemplate()`
- [ ] Implement `generateFrontmatter()`, `frontmatterToYaml()`
- [ ] Implement `resolvePlanPath()`
- [ ] Implement `generatePlanDocument()`
- [ ] Update `AIGenerationService.generatePlanDocument()`
- [ ] Write unit tests for plan generator

### Phase 4: Integration (Est: 4.5h)

- [ ] Parse `--plan`, `--no-plan` in args.ts
- [ ] Create `handlePlanGeneration()` helper in newpr.ts
- [ ] Create `runPostWorktreeHooks()` helper in newpr.ts
- [ ] Create unified `executePostWorktreeSequence()` helper
- [ ] Integrate into `modeNewFeature()`
- [ ] Integrate into `modeExistingPr()`
- [ ] Integrate into `modeExistingBranch()`
- [ ] Update JSON output format
- [ ] Write integration tests

### Phase 5: Polish (Est: 2h)

- [ ] Update help text with new flags
- [ ] Update README documentation
- [ ] Test on Windows, macOS, Linux
- [ ] Test all edge cases from tables
- [ ] Ensure backwards compatibility

**Total Estimated: 19 hours**

---

## 9. Open Questions

### 9.1 Hooks Questions

1. **Multiple hook confirmation UX**: When multiple hooks run, should we offer "Run all" / "Skip all"?
   - _Recommendation_: Start simple (confirm each); add batch options if requested.

2. **Confirmation for post-pr hook**: Should post-pr also get confirmation?
   - _Recommendation_: Apply confirmation to all hooks in `WORKTREE_CWD_HOOKS`.

### 9.2 Plan Questions

1. **Template Support**: Should we support custom Markdown templates for plan structure?
   - _Recommendation_: Defer to future enhancement.

2. **Plan Updates**: When regenerating, merge with existing or overwrite?
   - _Recommendation_: Overwrite with confirmation prompt.

3. **LLM Path Suggestions**: How reliable are LLM path suggestions?
   - _Recommendation_: Always fall back to default on invalid suggestion.

### 9.3 Integration Questions

1. **Plan failure handling**: Should plan failure block newpr entirely?
   - _Recommendation_: No, warn and continue to hooks.

2. **Hook failure after plan success**: How to report partial success?
   - _Recommendation_: JSON output includes both statuses independently.

---

## 10. References

### Internal Files

- `src/lib/hooks/executor.ts` - Hook execution
- `src/lib/hooks/types.ts` - Hook type definitions
- `src/lib/newpr/hook-runner.ts` - HookRunner class
- `src/lib/ai/generation-service.ts` - AI generation
- `src/lib/ai/types.ts` - AI type definitions
- `src/cli/newpr.ts` - Main newpr implementation
- `src/lib/newpr/args.ts` - Argument parsing

### External Documentation

- [Hooks Documentation](../AI-TOOLING.md) - Current hook docs
- [Config Schema](../../schemas/worktreerc.schema.json) - JSON schema

---

**Document End**

_This consolidated specification combines hooks-improvements and ai-plan-documents into a single coherent implementation plan. Review and approve before implementation begins._
