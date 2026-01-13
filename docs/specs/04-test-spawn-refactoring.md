# VSCode Opening Files During Tests - Implementation Specification

**Status**: Approved
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: WSL Ubuntu / Cross-platform

---

## Executive Summary

When running tests locally in VSCode, empty file tabs open with paths like `/path/to/worktree`. This occurs because several modules execute real system commands (editor launching, terminal opening, clipboard operations) without proper dependency injection, bypassing test mocks.

This specification details a full audit and refactoring to ensure all side-effect-producing functions use dependency injection, enabling proper test mocking whilst maintaining test integrity.

---

## Table of Contents

1. [Root Cause Analysis](#1-root-cause-analysis)
2. [Files Requiring Changes](#2-files-requiring-changes)
3. [Detailed Design](#3-detailed-design)
4. [Implementation Checklist](#4-implementation-checklist)
5. [Testing Strategy](#5-testing-strategy)
6. [Verification](#6-verification)

---

## 1. Root Cause Analysis

### The Problem

Test files use mock dependencies, but implementation files bypass them:

```typescript
// Test creates mock deps
const deps = createMockDeps({ spawnCommand: vi.fn() });
await openWorktreeInEditor(pr, deps);

// But implementation ignores deps and calls spawn directly!
function openPathInEditor(targetPath: string, preferredEditor: string): boolean {
  const hasVscode = commandExists('code'); // Real spawnSync!
  spawn(editorCmd, [targetPath], { detached: true }); // Real spawn!
}
```

### Evidence

| File                                              | Line                             | Issue            |
| ------------------------------------------------- | -------------------------------- | ---------------- |
| [prs/actions.ts:247](src/lib/prs/actions.ts#L247) | `spawn(editorCmd, [targetPath])` | Bypasses deps    |
| [prs/actions.ts:227](src/lib/prs/actions.ts#L227) | `commandExists('code')`          | Real spawnSync   |
| [prs/actions.ts:95](src/lib/prs/actions.ts#L95)   | `spawnSync(command, args)`       | Clipboard bypass |

### Good Pattern (for reference)

[action-executors.ts:153](src/lib/lswt/action-executors.ts#L153):

```typescript
deps.spawnDetached(editorCmd, [worktree.path]); // ✓ Uses injected dep
```

---

## 2. Files Requiring Changes

### Critical Priority (Causing the VSCode issue)

| File                     | Functions to Refactor                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `src/lib/prs/actions.ts` | `openPathInEditor`, `openPathInTerminal`, `copyToClipboard`, `openUrl`, `commandExists` |

### Medium Priority (Similar pattern issues)

| File                               | Functions to Refactor                                       |
| ---------------------------------- | ----------------------------------------------------------- |
| `src/lib/wtconfig/environment.ts`  | `commandExists`, `runCommand`                               |
| `src/lib/lswt/environment.ts`      | `isCommandAvailable`, `getGitVersion`, `getDefaultTerminal` |
| `src/lib/lswt/worktree-info.ts`    | `hasUncommittedChanges` (use git module)                    |
| `src/lib/cleanpr/worktree-info.ts` | `hasUncommittedChanges` (use git module)                    |
| `src/lib/lswt/action-executors.ts` | `wslPathToWindows`                                          |

### No Changes Needed (Good patterns)

- `src/lib/git.ts` - Only git commands, properly isolated
- `src/lib/github.ts` - Only gh CLI, properly isolated
- `src/lib/hooks/executor.ts` - Intentional user hook execution
- `src/lib/ai/cli-provider.ts` - Intentional AI CLI execution

---

## 3. Detailed Design

### 3.1 Pattern: Extend Existing Deps Interface

For `src/lib/prs/actions.ts`, extend `PrActionDeps`:

```typescript
export interface PrActionDeps {
  // Existing
  execCommand: (command: string, cwd?: string) => string;
  spawnCommand: (command: string, args: string[], cwd?: string) => void;
  copyToClipboard: (text: string) => boolean;
  openUrl: (url: string) => boolean;
  getRepoRoot: () => string;
  log: (message: string) => void;
  gitFetch: (remote: string, cwd?: string) => void;
  gitAddWorktree: (path: string, branch: string, options?: AddWorktreeOptions) => void;

  // NEW: Add these for editor/terminal operations
  openPathInEditor: (targetPath: string, preferredEditor: string) => boolean;
  openPathInTerminal: (targetPath: string) => boolean;
  commandExists: (cmd: string) => boolean;
}
```

### 3.2 Update Factory Function

```typescript
export function createDefaultActionDeps(): PrActionDeps {
  return {
    // ... existing deps ...

    // NEW implementations
    openPathInEditor: openPathInEditorImpl,
    openPathInTerminal: openPathInTerminalImpl,
    commandExists: commandExistsImpl,
  };
}

// Rename current functions to *Impl
function openPathInEditorImpl(targetPath: string, preferredEditor: string): boolean {
  // Current implementation unchanged
}
```

### 3.3 Update Consumer Functions

```typescript
export async function openWorktreeInEditor(
  pr: PrDisplayItem,
  deps: PrActionDeps = createDefaultActionDeps()
): Promise<PrActionResult> {
  // ...
  const success = deps.openPathInEditor(pr.worktreePath, config.preferredEditor || 'vscode');
  // Instead of: openPathInEditor(pr.worktreePath, ...)
}
```

### 3.4 Environment Detection Pattern

For `src/lib/wtconfig/environment.ts` and `src/lib/lswt/environment.ts`:

```typescript
export interface EnvironmentDeps {
  commandExists: (cmd: string) => boolean;
  runCommand: (cmd: string, args: string[]) => string | null;
}

export function createDefaultEnvironmentDeps(): EnvironmentDeps {
  return {
    commandExists: commandExistsImpl,
    runCommand: runCommandImpl,
  };
}

export function detectEnvironment(
  cwd?: string,
  deps: EnvironmentDeps = createDefaultEnvironmentDeps()
): EnvironmentInfo {
  // Use deps.commandExists() instead of bare commandExists()
}
```

### 3.5 Git Module Usage Pattern

For `worktree-info.ts` files, replace direct execSync with git module:

```typescript
// Before
const status = execSync('git status --porcelain', { cwd, encoding: 'utf8' });

// After
import * as git from '../git.js';
const status = git.exec(['status', '--porcelain'], { cwd, silent: true });
```

---

## 4. Implementation Checklist

### Phase 1: Critical Fix (Solves the reported issue)

- [ ] **src/lib/prs/actions.ts**
  - [ ] Add `openPathInEditor`, `openPathInTerminal`, `commandExists` to `PrActionDeps`
  - [ ] Rename current implementations to `*Impl` suffix
  - [ ] Add new deps to `createDefaultActionDeps()`
  - [ ] Update `openWorktreeInEditor` to use `deps.openPathInEditor`
  - [ ] Update `openWorktreeInTerminal` to use `deps.openPathInTerminal`
  - [ ] Update tests to verify deps are called

- [ ] **src/lib/prs/actions.test.ts**
  - [ ] Add mock implementations to `createMockDeps()`
  - [ ] Add explicit tests verifying `openPathInEditor` dep is called
  - [ ] Add explicit tests verifying `openPathInTerminal` dep is called

### Phase 2: Environment Detection

- [ ] **src/lib/wtconfig/environment.ts**
  - [ ] Create `EnvironmentDeps` interface
  - [ ] Create `createDefaultEnvironmentDeps()` factory
  - [ ] Rename `commandExists` → `commandExistsImpl`
  - [ ] Rename `runCommand` → `runCommandImpl`
  - [ ] Update `detectEnvironment` to accept optional deps parameter
  - [ ] Update all internal calls to use deps

- [ ] **src/lib/wtconfig/environment.test.ts**
  - [ ] Add mock deps for environment detection tests
  - [ ] Verify no real commands executed during tests

- [ ] **src/lib/lswt/environment.ts**
  - [ ] Apply same pattern as wtconfig/environment.ts
  - [ ] Create `LswtEnvironmentDeps` interface
  - [ ] Update `getEnvironmentInfo` to use deps

- [ ] **src/lib/lswt/environment.test.ts**
  - [ ] Add mock deps
  - [ ] Verify proper mocking

### Phase 3: Git Module Usage

- [ ] **src/lib/lswt/worktree-info.ts**
  - [ ] Replace `execSync('git status...')` with `git.exec()`
  - [ ] Or add to deps interface if git module not appropriate

- [ ] **src/lib/cleanpr/worktree-info.ts**
  - [ ] Same changes as lswt/worktree-info.ts

### Phase 4: Minor Fixes

- [ ] **src/lib/lswt/action-executors.ts**
  - [ ] Add `wslPathToWindows` to `ExecutorDeps` interface
  - [ ] Update `openTerminal` to use deps

---

## 5. Testing Strategy

### 5.1 Unit Tests

Each refactored function should have tests verifying:

```typescript
it('should use deps.openPathInEditor instead of direct spawn', async () => {
  const deps = createMockDeps({
    openPathInEditor: vi.fn().mockReturnValue(true),
  });
  const pr = createMockPr({ hasWorktree: true, worktreePath: '/test/path' });

  await openWorktreeInEditor(pr, deps);

  expect(deps.openPathInEditor).toHaveBeenCalledWith('/test/path', 'vscode');
});
```

### 5.2 Regression Tests

Verify existing tests still pass:

```bash
npm test
```

### 5.3 Manual Verification

After implementation, verify VSCode doesn't open files:

```bash
# Run tests from terminal (not VSCode integrated terminal)
npm test -- --run

# Verify no VSCode windows/tabs opened with test paths
```

---

## 6. Verification

### Pre-Implementation Check

```bash
# Count current spawn/spawnSync in problematic files
grep -c "spawn\|spawnSync" src/lib/prs/actions.ts
# Expected: Multiple matches
```

### Post-Implementation Check

```bash
# Run full test suite
npm test

# Run specific test file to verify no VSCode opens
npm test -- src/lib/prs/actions.test.ts --run

# Verify coverage hasn't dropped
npm test -- --coverage
```

### Success Criteria

1. ✅ All existing tests pass
2. ✅ No VSCode tabs open when running tests locally
3. ✅ Coverage thresholds maintained (80%+)
4. ✅ New tests verify deps are called correctly

---

## Files to Modify

| File                                                                         | Type of Change               |
| ---------------------------------------------------------------------------- | ---------------------------- |
| [src/lib/prs/actions.ts](src/lib/prs/actions.ts)                             | Add deps, refactor functions |
| [src/lib/prs/actions.test.ts](src/lib/prs/actions.test.ts)                   | Add mock deps, new tests     |
| [src/lib/wtconfig/environment.ts](src/lib/wtconfig/environment.ts)           | Add deps interface           |
| [src/lib/wtconfig/environment.test.ts](src/lib/wtconfig/environment.test.ts) | Add mock deps                |
| [src/lib/lswt/environment.ts](src/lib/lswt/environment.ts)                   | Add deps interface           |
| [src/lib/lswt/environment.test.ts](src/lib/lswt/environment.test.ts)         | Add mock deps                |
| [src/lib/lswt/worktree-info.ts](src/lib/lswt/worktree-info.ts)               | Use git module               |
| [src/lib/cleanpr/worktree-info.ts](src/lib/cleanpr/worktree-info.ts)         | Use git module               |
| [src/lib/lswt/action-executors.ts](src/lib/lswt/action-executors.ts)         | Add wslPathToWindows to deps |

---

**Document End**
