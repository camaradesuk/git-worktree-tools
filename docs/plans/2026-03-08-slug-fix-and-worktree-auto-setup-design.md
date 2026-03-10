# Design: Slug Bug Fix, Unified PR Extraction, and Worktree Auto-Setup

**Date**: 2026-03-08
**Status**: Approved

## Problem Statement

Three related issues with worktree path generation and management:

1. **Slug bug**: `generateWorktreePath()` accepts an optional `branchName` param, but 7 of 8 call sites don't pass it — even though the branch name is always in scope. With patterns like `pr{number}.{slug}`, this produces broken names like `pr123.` (trailing dot).

2. **Divergent PR extraction**: Two separate `extractPrNumber()` implementations exist in `lswt/formatters.ts` (hardcoded patterns only) and `cleanpr/worktree-info.ts` (config-aware + hardcoded fallback). Neither uses `gh` CLI as a fallback.

3. **No worktree parent auto-setup**: Setting `worktreeParent: ".worktrees"` globally requires manually creating the directory and adding it to `.gitignore` in each repo.

## Design

### Change 1: Slug Bug Fix

**Two parts:**

#### 1a. Pass `branchName` at all call sites

Every call to `generateWorktreePath()` in `src/api/create.ts` (4 sites) and `src/cli/newpr.ts` (3 sites) must pass the branch name as the 5th argument. The branch is already known at each site — it's used in the `git.addWorktree()` call a few lines later.

Call sites and the branch variable available at each:

| File            | Line | Branch variable in scope |
| --------------- | ---- | ------------------------ |
| `api/create.ts` | 147  | `pr.headBranch`          |
| `api/create.ts` | 345  | `currentBranch`          |
| `api/create.ts` | 388  | `currentBranch`          |
| `api/create.ts` | 501  | `branchName`             |
| `cli/newpr.ts`  | 567  | `pr.headBranch`          |
| `cli/newpr.ts`  | 758  | `branchName`             |
| `cli/newpr.ts`  | 1124 | `branchName`             |

The 8th call site (`lswt/action-executors.ts:624`) already passes `branch`.

#### 1b. Separator cleanup in `generateWorktreePath()`

After all placeholder replacement, clean up separator artifacts:

- Doubled separators: `pr123..foo` → `pr123.foo`
- Trailing separators: `pr123.` → `pr123`
- Leading separators: `.pr123` → `pr123`
- Applies to `.`, `-`, and `_` characters

This is a defensive measure for edge cases where branchName might somehow be empty.

### Change 2: Unified `extractPrNumber`

**New file**: `src/lib/worktree-utils.ts`

Single shared implementation with this resolution chain:

1. **Configured pattern** — convert `worktreePattern` from config into a regex (replace `{number}` with `(\d+)`, other placeholders with `.*`), match against worktree path basename.
2. **Default pattern** — if no config or config pattern didn't match, try the same regex approach using the default pattern (`{repo}.pr{number}`).
3. **`gh` CLI fallback** — if path-based extraction fails, look up the worktree's branch (from `git worktree list --porcelain`), then query `gh pr list --head <branch>` to find the associated PR number.

The `gh` fallback makes the function async. Both `cleanpr` and `lswt` already have async code paths.

Both existing `extractPrNumber` implementations in `lswt/formatters.ts` and `cleanpr/worktree-info.ts` are replaced with imports from the shared module.

No hardcoded fallback patterns — the configured pattern (or default config if none set) is the source of truth.

### Change 3: Worktree Parent Auto-Setup

**New file**: `src/lib/worktree-setup.ts`

**Detection logic** (called before `git.addWorktree()` in the worktree creation flow):

1. Resolve `worktreeParent` to an absolute path.
2. Check if it's inside `repoRoot` (resolved path starts with `repoRoot`).
3. If yes, and the directory doesn't exist yet:
   - **Interactive mode**: prompt "Will create `.worktrees/` and add it to `.gitignore`. Continue? [Y/n]"
   - **Non-interactive mode** (`--yes` / `options.json`): proceed without prompting.
4. Create the directory with `fs.mkdirSync(path, { recursive: true })`.
5. Ensure the directory name is in `.gitignore` (reuse the pattern from `ensureLocalConfigInGitignore` in `global-config.ts`).

**One-time behavior**: After the directory exists and `.gitignore` is updated, subsequent worktree creations skip the prompt — the `!fs.existsSync(dir)` check handles this naturally.

**Integration points**: Called from `cli/newpr.ts` and `api/create.ts`, just before `git.addWorktree()`.

### Change 4: Documentation Updates

All docs, README, CLI help text, and schema must reflect the changes:

| File                             | What to update                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `README.md` (lines ~335-374)     | Config table, worktreePattern placeholders, worktreeParent auto-setup behavior |
| `schemas/worktreerc.schema.json` | worktreePattern and worktreeParent descriptions                                |
| `src/cli/wt/new.ts`              | Help text for relevant options                                                 |
| `src/cli/newpr.ts`               | `getHelpText()` function                                                       |
| `src/cli/cleanpr.ts`             | `getHelpText()` if it references PR extraction                                 |
| `src/cli/lswt.ts`                | `getHelpText()` if it references PR extraction                                 |
| `docs/PLAN.md`                   | Configuration section if it references patterns                                |

## Files Summary

| Change                     | Files Modified                                   | Files Created           |
| -------------------------- | ------------------------------------------------ | ----------------------- |
| Slug bug fix               | `config.ts`, `api/create.ts`, `cli/newpr.ts`     | —                       |
| Unified `extractPrNumber`  | `lswt/formatters.ts`, `cleanpr/worktree-info.ts` | `lib/worktree-utils.ts` |
| Worktree parent auto-setup | `cli/newpr.ts`, `api/create.ts`                  | `lib/worktree-setup.ts` |
| Documentation              | `README.md`, schema, CLI help text, docs         | —                       |

## Testing

- Unit tests for separator cleanup edge cases
- Unit tests for pattern-to-regex conversion and extraction
- Unit tests for `gh` CLI fallback (mocked)
- Unit tests for in-repo path detection and auto-setup logic
- Integration with existing test suite (231 tests must continue passing)
