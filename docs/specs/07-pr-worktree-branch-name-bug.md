# PR Worktree Branch Name Bug - Implementation Specification

**Status**: Draft - Pending Review
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: WSL Ubuntu / Cross-platform (Windows, macOS, Linux)

---

## Executive Summary

When creating a worktree from an existing PR via the Pull Requests listing TUI (`wt prs` command), the worktree is incorrectly created with a synthetic branch name `pr-<number>` instead of the actual PR's branch name (e.g., `feat/my-feature`).

This bug causes confusion as the local branch name doesn't match the remote tracking branch, making it difficult to push changes or understand which branch is checked out. The fix is straightforward: use `pr.headBranch` instead of constructing a synthetic `pr-<number>` branch name.

This document follows a **TDD (Test-Driven Development) approach** where tests are updated first to expect the correct behaviour, then the code is fixed to make the tests pass.

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

The PR browser feature (`wt prs`) provides an interactive TUI for browsing GitHub PRs and performing actions on them. One key action is creating a local worktree for a PR to work on it locally.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PR Browser TUI Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User runs `wt prs`                                             │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                            │
│  │  interactive.ts │  PR listing with keyboard shortcuts        │
│  └────────┬────────┘                                            │
│           │ User presses 'w' on a PR                            │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │   actions.ts    │  executePrAction('create_worktree', pr)    │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────┐                        │
│  │  createWorktreeForPr(pr, deps)      │  ◄── BUG IS HERE       │
│  │                                     │                        │
│  │  branchName = `pr-${pr.number}`     │  ◄── WRONG             │
│  │  startPoint = `origin/${pr.headBranch}`  ◄── CORRECT         │
│  └─────────────────────────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| File                         | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| `src/lib/prs/interactive.ts` | PR listing TUI with keyboard navigation               |
| `src/lib/prs/actions.ts`     | **BUG LOCATION** - PR action handlers                 |
| `src/lib/prs/types.ts`       | Type definitions (`PrDisplayItem`, `PrAction`)        |
| `src/cli/newpr.ts`           | Contains correct implementation in `modeExistingPr()` |

### 1.3 Dependencies

**Internal**:

- `src/lib/git.ts` - Git operations (addWorktree, fetch)
- `src/lib/config.ts` - Repository configuration (worktree patterns)
- `src/lib/github.ts` - GitHub CLI integration (PR data types)

**External**:

- Git CLI
- GitHub CLI (gh)

### 1.4 Integration Points

The `createWorktreeForPr()` function integrates with:

1. **Git operations** via injectable `deps.gitAddWorktree()`
2. **Config system** via `loadConfig()` for worktree path patterns
3. **Interactive TUI** via `executePrAction()` dispatcher

---

## 2. Detailed Design

### 2.1 Data Structures

The `PrDisplayItem` type (extending `PrInfo`) contains all necessary information:

```typescript
// From src/lib/github.ts:183-191
interface PrInfo {
  number: number; // PR number (e.g., 42)
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
  headBranch: string; // Actual branch name (e.g., 'feat/dark-mode')
  baseBranch: string;
  isDraft: boolean;
}

// From src/lib/prs/types.ts:17-22
interface PrDisplayItem extends PrInfo {
  hasWorktree: boolean;
  worktreePath: string | null;
}
```

### 2.2 The Bug

**Location**: `src/lib/prs/actions.ts`, lines 166-167

```typescript
// Current (buggy) code:
const branchName = `pr-${pr.number}`; // Wrong - synthetic name
const startPoint = `origin/${pr.headBranch}`; // Correct - uses actual branch
```

**Problem**: Creates a worktree with branch `pr-42` when it should use the actual PR branch `feat/dark-mode`.

### 2.3 The Fix

```typescript
// Fixed code:
const branchName = pr.headBranch; // Correct - use actual branch
const startPoint = `origin/${pr.headBranch}`; // Correct - uses actual branch
```

### 2.4 Contrast: Correct vs Buggy Implementation

**Correct implementation** in `modeExistingPr()` (`src/cli/newpr.ts:414-416`):

```typescript
git.addWorktree(worktreePath, pr.headBranch, {
  createBranch: true,
  startPoint: `origin/${pr.headBranch}`,
});
```

**Buggy implementation** in `createWorktreeForPr()` (`src/lib/prs/actions.ts:166-172`):

```typescript
const branchName = `pr-${pr.number}`;        // Wrong!
const startPoint = `origin/${pr.headBranch}`;
deps.gitAddWorktree(worktreePath, branchName, {...});
```

---

## 3. Execution Flow

### 3.1 Happy Path (After Fix)

1. User runs `wt prs` to open PR browser TUI
2. User navigates to desired PR using arrow keys
3. User presses `w` to create worktree
4. System fetches from origin: `git fetch origin`
5. System creates worktree with **actual branch name**:
   ```
   git worktree add ../repo.pr42 feat/dark-mode -b feat/dark-mode origin/feat/dark-mode
   ```
6. User can now `cd ../repo.pr42` and work on the PR
7. Running `git branch` shows `feat/dark-mode` (correct, not `pr-42`)

### 3.2 Alternative Flows

**Branch already exists locally**:

1. Stage 1 (createBranch: true) fails
2. Stage 2 (createBranch: false) succeeds using existing branch

**Fetch fails (offline)**:

1. Fetch error is caught and logged
2. Worktree creation proceeds anyway (may fail if branch not available)

### 3.3 Sequence Diagram

```
User        interactive.ts      actions.ts         git
  │               │                  │               │
  │──press 'w'───▶│                  │               │
  │               │──execute────────▶│               │
  │               │  'create_worktree'               │
  │               │                  │               │
  │               │                  │──fetch───────▶│
  │               │                  │   origin      │
  │               │                  │◀──────────────│
  │               │                  │               │
  │               │                  │──addWorktree─▶│
  │               │                  │   path:       │
  │               │                  │   ../repo.pr42│
  │               │                  │   branch:     │
  │               │                  │   feat/dark-mode ◄── FIXED
  │               │                  │◀──────────────│
  │               │◀─────success─────│               │
  │◀──refresh─────│                  │               │
```

---

## 4. Edge Cases & Mitigations

| #   | Edge Case / Failure Mode                                           | Impact | Mitigation Strategy                                                                        |
| --- | ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------ |
| 1   | Branch name contains special characters (e.g., `feat/user@domain`) | Low    | Git handles branch names with special chars; no additional handling needed                 |
| 2   | Branch already exists locally with different commit                | Medium | Existing fallback logic tries `createBranch: false` if initial create fails                |
| 3   | Branch name conflicts with existing worktree                       | Low    | Git will error; user must clean up manually (error message guides them)                    |
| 4   | PR branch was deleted on remote                                    | Medium | Fetch succeeds but `startPoint` won't exist; existing error handling catches this          |
| 5   | Branch name is very long (>255 chars)                              | Low    | Git enforces limits; rare in practice                                                      |
| 6   | Multiple PRs from same branch (force-pushed)                       | Low    | Each worktree creation will use same branch name, which is correct behaviour               |
| 7   | PR from fork with different remote                                 | Medium | Current implementation assumes `origin` remote; may need future enhancement (out of scope) |

### 4.1 Detailed Analysis: Fallback Logic

The function has a two-stage fallback that remains valid after the fix:

```typescript
try {
  // Stage 1: Try to create new branch from remote
  deps.gitAddWorktree(worktreePath, pr.headBranch, {
    createBranch: true,
    startPoint: `origin/${pr.headBranch}`,
    cwd: repoRoot,
  });
} catch {
  // Stage 2: Try to use existing local branch
  try {
    deps.gitAddWorktree(worktreePath, pr.headBranch, {
      createBranch: false,
      cwd: repoRoot,
    });
  } catch (retryError) {
    throw new Error(
      `Failed to create worktree... You may need to delete the existing branch '${pr.headBranch}' first.`
    );
  }
}
```

---

## 5. Testing Strategy

### 5.1 TDD Approach

Following TDD principles:

1. **RED**: Update tests first to expect correct behaviour (tests will fail)
2. **GREEN**: Fix the code to make tests pass
3. **REFACTOR**: Run full test suite to ensure no regressions

### 5.2 Unit Tests to Update

**File**: `src/lib/prs/actions.test.ts`

#### Test 1: "should fetch branch and create worktree" (lines 64-82)

**Current** (line 75):

```typescript
'pr-123',  // Wrong
```

**Updated**:

```typescript
'feat/test',  // Correct - matches the mock PR's headBranch
```

#### Test 2: "should fall back to existing branch if create fails" (lines 110-135)

**Current** (lines 111, 129):

```typescript
const pr = createMockPr({ number: 42 });
// ...
'pr-42',  // Wrong
```

**Updated** (add explicit headBranch override):

```typescript
const pr = createMockPr({ number: 42, headBranch: 'fix/fallback-test' });
// ...
'fix/fallback-test',  // Correct - explicit and clear
```

### 5.3 New Unit Test

Add explicit test for the requirement:

```typescript
it('should use PR headBranch as the local branch name, not pr-<number>', async () => {
  const pr = createMockPr({
    number: 99,
    headBranch: 'feature/important-change',
  });
  const deps = createMockDeps();

  await createWorktreeForPr(pr, deps);

  // Verify branch name comes from headBranch, NOT pr-<number>
  expect(deps.gitAddWorktree).toHaveBeenCalledWith(
    expect.any(String),
    'feature/important-change', // Must match headBranch exactly
    expect.objectContaining({
      startPoint: 'origin/feature/important-change',
    })
  );
});
```

### 5.4 Manual Verification Steps

```bash
# Step 1: Build the project
npm run build

# Step 2: Run unit tests for actions.ts (should fail initially in RED phase)
npm test -- src/lib/prs/actions.test.ts

# Step 3: After fix, run full test suite
npm test

# Step 4: Run linter
npm run lint

# Step 5: Manual E2E test (requires GitHub repo with open PRs)
cd /path/to/repo-with-prs
wt prs
# Navigate to a PR, press 'w' to create worktree
# Verify: cd to new worktree, run `git branch`
# Expected: Shows actual PR branch name (e.g., 'feat/my-feature')
# Bug behaviour: Would show 'pr-42' instead
```

---

## 6. Implementation Checklist

Following TDD order:

### Phase 1: RED (Update Tests First)

- [ ] **6.1** Update test "should fetch branch and create worktree" (line 75)
  - Change expected branch from `'pr-123'` to `'feat/test'`

- [ ] **6.2** Update test "should fall back to existing branch" (lines 111, 129)
  - Add explicit `headBranch: 'fix/fallback-test'` to mock PR
  - Change expected branch from `'pr-42'` to `'fix/fallback-test'`

- [ ] **6.3** Add new test "should use PR headBranch as the local branch name, not pr-<number>"

- [ ] **6.4** Run tests to confirm they fail
  ```bash
  npm test -- src/lib/prs/actions.test.ts
  ```

### Phase 2: GREEN (Fix the Code)

- [ ] **6.5** Fix branch name assignment (`src/lib/prs/actions.ts:166`)
  - Change: `const branchName = \`pr-${pr.number}\`;`
  - To: `const branchName = pr.headBranch;`

- [ ] **6.6** Update error message (`src/lib/prs/actions.ts:189`)
  - Change: `'pr-${pr.number}'`
  - To: `'${pr.headBranch}'`

- [ ] **6.7** Run tests to confirm they pass
  ```bash
  npm test -- src/lib/prs/actions.test.ts
  ```

### Phase 3: REFACTOR (Full Validation)

- [ ] **6.8** Run full test suite: `npm test`

- [ ] **6.9** Run linter: `npm run lint`

- [ ] **6.10** Build project: `npm run build`

---

## 7. Open Questions

**None** - The fix is straightforward and mirrors the existing correct implementation in `modeExistingPr()`.

---

## 8. References

- **Similar bug fix**: [docs/archive/NEWPR-COMMIT-ALL-BUG.md](../archive/NEWPR-COMMIT-ALL-BUG.md)
- **Correct implementation**: `src/cli/newpr.ts:414-416` - `modeExistingPr()` function
- **Bug location**: `src/lib/prs/actions.ts:166` - `createWorktreeForPr()` function
- **Test file**: `src/lib/prs/actions.test.ts`
- **Type definitions**: `src/lib/prs/types.ts` - `PrDisplayItem` interface
- **PR data types**: `src/lib/github.ts:183-191` - `PrInfo` interface

---

**Document End**

_This document must be reviewed and approved before implementation begins._
