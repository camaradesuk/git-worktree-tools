# Empty Commit Worktree Bug - Implementation Specification

**Status**: Implemented
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: WSL Ubuntu / Cross-platform (Windows, macOS, Linux)

---

## Executive Summary

When creating a PR worktree via the `wt` CLI with an empty initial commit (scenario `main_clean_same`), the worktree creation fails with:

```
fatal: 'feat/config-migration-hooks-ai-planning' is already used by worktree at '/home/chris/workspace/git-worktree-tools'
```

The main worktree remains on the newly created feature branch instead of switching back to the original branch (`main`) before creating the new worktree. The root cause is that the CLI version of `newpr.ts` does not pass the `repoRoot` parameter to git operations, unlike the API version (`src/api/create.ts`).

This is a **recurring pattern** in this codebase. A nearly identical bug was previously fixed (see `docs/archive/NEWPR-COMMIT-ALL-BUG.md` Fix #1) where `git add .` operations failed when run from a subdirectory due to missing `cwd` parameters.

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

The `newpr` CLI handles multiple git state scenarios when creating a new PR. For the `main_clean_same` scenario (user on main branch with no changes), it offers an "empty initial commit" option:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          modeNewFeature() Flow                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User on main ──► Create feature branch ──► Empty commit ──► Push          │
│                                                                             │
│       ──► Switch back to main ──► Create PR ──► Create worktree            │
│              ▲                                       ▲                      │
│              │                                       │                      │
│          BUG HERE                               BUG HERE                    │
│       (missing repoRoot)                     (missing cwd)                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| Component        | File                                | Purpose                                  |
| ---------------- | ----------------------------------- | ---------------------------------------- |
| CLI Entry        | `src/cli/newpr.ts`                  | Main CLI implementation (**FIXED**)      |
| API Entry        | `src/api/create.ts`                 | Programmatic API (**CORRECT reference**) |
| Git Operations   | `src/lib/git.ts`                    | Git command wrappers                     |
| State Detection  | `src/lib/state-detection.ts`        | Analyses git repository state            |
| Scenario Handler | `src/lib/newpr/scenario-handler.ts` | Presents options based on scenario       |

### 1.3 Dependencies

- **External**: Git CLI, GitHub CLI (`gh`)
- **Internal**: `git.checkout()`, `git.push()`, `git.addWorktree()` - all accept optional `cwd` parameter
- **Testing**: Vitest, E2E test harness with mock gh server

### 1.4 Integration Points

The affected code path is in `modeNewFeature()` function in `newpr.ts`. It interacts with:

- Git repository via `git.exec()`, `git.checkout()`, `git.push()`, `git.addWorktree()`
- GitHub API via `github.createPr()`
- File system for worktree creation

---

## 2. Detailed Design

### 2.1 Root Cause Analysis

**The CLI version did not pass `repoRoot` to git operations.**

#### API Version (CORRECT) - `src/api/create.ts`:

```typescript
git.push({ setUpstream: true, remote: 'origin', branch: branchName }, repoRoot);
git.checkout(originalBranch, repoRoot);
git.addWorktree(worktreePath, branchName, { cwd: repoRoot });
```

#### CLI Version (WAS BUGGY) - `src/cli/newpr.ts`:

```typescript
git.push({ setUpstream: true, remote: 'origin', branch: branchName });
git.checkout(originalBranch); // Missing repoRoot!
git.addWorktree(worktreePath, branchName); // Missing cwd!
```

Without explicit `cwd`, git operations use `process.cwd()` which may differ from `repoRoot` if:

- User runs from a subdirectory
- Path resolution differs (symbolic links, Windows path normalisation)
- Working directory changes during execution

### 2.2 Affected Code Locations

| Line | Original Code                                          | Fixed Code                                           |
| ---- | ------------------------------------------------------ | ---------------------------------------------------- |
| 751  | `git.exec(['checkout', '-b', branchName, branchFrom])` | `git.exec([...], { cwd: repoRoot })`                 |
| 822  | `git.push({ ... })`                                    | `git.push({ ... }, repoRoot)`                        |
| 825  | `await git.pushAsync({ ... })`                         | `await git.pushAsync({ ... }, repoRoot)`             |
| 832  | `git.checkout(originalBranch)`                         | `git.checkout(originalBranch, repoRoot)`             |
| 901  | `git.addWorktree(worktreePath, branchName)`            | `git.addWorktree(..., { cwd: repoRoot })`            |
| 904  | `await git.addWorktreeAsync(...)`                      | `await git.addWorktreeAsync(..., { cwd: repoRoot })` |

### 2.3 Git Function Signatures

From `src/lib/git.ts`:

```typescript
export function checkout(ref: string, cwd?: string): void;
export function push(options: PushOptions, cwd?: string): void;
export async function pushAsync(options: PushOptions, cwd?: string): Promise<void>;
export function addWorktree(path: string, branch: string, options?: { cwd?: string }): void;
export async function addWorktreeAsync(
  path: string,
  branch: string,
  options?: { cwd?: string }
): Promise<void>;
```

### 2.4 Design Patterns Applied

**Consistent Parameter Passing**: All git operations in a function should receive the same `cwd`/`repoRoot` parameter. This pattern is correctly implemented in `src/api/create.ts`.

---

## 3. Execution Flow

### 3.1 Happy Path (Before Fix - Buggy)

```
1. User runs `wt` from `/home/user/repo`
2. modeNewFeature() captures originalBranch='main', repoRoot='/home/user/repo'
3. git.exec(['checkout', '-b', 'feat/...', 'origin/main']) → Switches to feature branch
4. Empty commit created
5. git.push(...) → Pushes feature branch (uses process.cwd())
6. git.checkout('main') → INTENDED to switch back (uses process.cwd())
7. github.createPr(...) → Creates PR successfully
8. git.addWorktree(...) → FAILS: branch still checked out in main worktree
```

### 3.2 Expected Flow (After Fix)

```
1-4. Same as above
5. git.push(..., repoRoot) → Pushes feature branch
6. git.checkout('main', repoRoot) → Switches back to main
7. github.createPr(...) → Creates PR
8. git.addWorktree(..., { cwd: repoRoot }) → SUCCESS
```

### 3.3 Sequence Diagram

```
User        CLI(newpr.ts)        Git        GitHub
  │              │                │            │
  │──wt new─────►│                │            │
  │              │──getRepoRoot()►│            │
  │              │◄──repoRoot─────│            │
  │              │──checkout -b───►│            │
  │              │◄──on feat──────│            │
  │              │──commit────────►│            │
  │              │──push──────────►│            │
  │              │──checkout main──►│  ◄── FIXED: Added cwd
  │              │◄──on main───────│
  │              │──createPr──────────────────►│
  │              │◄──PR #123──────────────────│
  │              │──worktree add───►│  ◄── FIXED: Added cwd
  │              │◄──success────────│
  │◄──Done───────│                │            │
```

---

## 4. Edge Cases & Mitigations

| #   | Edge Case / Failure Mode                | Impact                  | Mitigation Strategy                                                    |
| --- | --------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| 1   | User runs newpr from subdirectory       | Git operations may fail | Pass `repoRoot` to all git operations                                  |
| 2   | Repository path contains symbolic links | Path resolution differs | Use canonical `repoRoot` from `git.getRepoRoot()`                      |
| 3   | Windows path separators                 | Inconsistencies         | Git.ts already normalises; `repoRoot` ensures consistency              |
| 4   | User-defined hook changes cwd           | Subsequent git ops fail | Always pass explicit `cwd`                                             |
| 5   | `originalBranch` is null                | Checkout fails          | Already handled: `originalBranch = git.getCurrentBranch() \|\| 'main'` |
| 6   | Checkout fails (dirty worktree)         | Branch switch fails     | Existing try/catch handles this                                        |
| 7   | Branch exists on remote                 | Branch creation fails   | Handled with existing error handling                                   |
| 8   | Running from another worktree           | Wrong worktree targeted | `repoRoot` ensures correct worktree                                    |

---

## 5. Testing Strategy

### 5.1 Unit Tests Added

Added to `src/cli/newpr.test.ts`:

```typescript
describe('Bug fix: git operations must use repoRoot (empty commit worktree bug)', () => {
  it('git.checkout after push must use repoRoot parameter', async () => {
    // Verifies git.checkout is called with repoRoot
    expect(git.checkout).toHaveBeenCalledWith('main', repoRoot);
  });

  it('git.addWorktreeAsync must use { cwd: repoRoot } option', async () => {
    // Verifies git.addWorktreeAsync is called with cwd option
    expect(git.addWorktreeAsync).toHaveBeenCalledWith('/repo.pr100', 'feat/test-feature', {
      cwd: repoRoot,
    });
  });

  it('git.pushAsync must use repoRoot parameter', async () => {
    // Verifies git.pushAsync is called with repoRoot
    expect(git.pushAsync).toHaveBeenCalledWith(
      { setUpstream: true, remote: 'origin', branch: 'feat/test-feature' },
      repoRoot
    );
  });

  it('git.exec for branch checkout must use { cwd: repoRoot } option', async () => {
    // Verifies git.exec for branch creation uses cwd option
    expect(git.exec).toHaveBeenCalledWith(['checkout', '-b', 'feat/test-feature', 'origin/main'], {
      cwd: repoRoot,
    });
  });
});
```

### 5.2 Manual Verification Steps

```bash
# Step 1: Ensure on main with no changes
cd /path/to/repo
git checkout main && git status

# Step 2: Run wt → Create new PR → New feature/fix
wt

# Step 3: Enter description, accept defaults, select "Continue with empty initial commit"

# Step 4: Verify success
git branch --show-current  # Should output: main
git worktree list          # Should show new worktree
```

---

## 6. Implementation Checklist

### Phase 1: Write Failing Tests (TDD) - COMPLETED

- [x] 1.1 Add unit test: `git.checkout` called with `repoRoot`
- [x] 1.2 Add unit test: `git.addWorktreeAsync` called with `{ cwd: repoRoot }`
- [x] 1.3 Add unit test: `git.pushAsync` called with `repoRoot`
- [x] 1.4 Add unit test: `git.exec` for branch checkout called with `{ cwd: repoRoot }`
- [x] 1.5 Run tests - confirmed they fail (4 failures as expected)

### Phase 2: Apply Fix - COMPLETED

- [x] 2.1 Fix line 751: `git.exec([...], { cwd: repoRoot })`
- [x] 2.2 Fix line 822: `git.push({ ... }, repoRoot)`
- [x] 2.3 Fix line 825: `await git.pushAsync({ ... }, repoRoot)`
- [x] 2.4 Fix line 832: `git.checkout(originalBranch, repoRoot)`
- [x] 2.5 Fix line 901: `git.addWorktree(..., { cwd: repoRoot })`
- [x] 2.6 Fix line 904: `await git.addWorktreeAsync(..., { cwd: repoRoot })`

### Phase 3: Verify - COMPLETED

- [x] 3.1 Run all tests: `npm test` - 2510 tests passed
- [x] 3.2 Build project: `npm run build` - success

---

## 7. Open Questions

**Resolved during implementation:**

1. **Are there other git operations in `modeNewFeature` needing `repoRoot`?**
   - Yes, all 6 locations identified and fixed

2. **Should we add a linting rule to prevent this pattern?**
   - Deferred for future consideration

---

## 8. References

- **Previous related fix**: [docs/archive/NEWPR-COMMIT-ALL-BUG.md](../archive/NEWPR-COMMIT-ALL-BUG.md) - Fix #1
- **Working reference**: `src/api/create.ts` - correct implementation
- **Bug location**: `src/cli/newpr.ts` - `modeNewFeature()` function
- **Test file**: `src/cli/newpr.test.ts`
- **Git worktree docs**: https://git-scm.com/docs/git-worktree

---

**Document End**

_Implementation completed 2026-01-13._
