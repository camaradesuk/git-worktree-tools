# Bug Investigation: newpr `commit_all` Not Moving Files to PR Branch

**Status:** FIXED (see [src/cli/newpr.ts:486](../src/cli/newpr.ts#L486))

## Summary

When a user selects option 1 "Stage all and commit to the new PR branch" in the `main_unstaged_same` scenario, uncommitted files are not being staged and committed to the new PR branch. Instead, an empty initial commit is created.

## Root Cause

**The `git add .` command is executed without specifying the repository root as the working directory (`cwd`).**

When a user runs `newpr` from a subdirectory of the repository (e.g., `src/`), the `git add .` command only stages files within that subdirectory. Files in sibling directories (like `docs/`) are not staged, causing the commit to be empty.

### Code Flow (Before Fix)

1. In the existing branch code path around line 486 (now fixed), `createActionDeps()` was called **without a cwd argument**:

   ```typescript
   const deps = createActionDeps(); // Bug: missing repoRoot
   ```

2. Inside `createActionDeps()` at [newpr.ts:55-68](src/cli/newpr.ts#L55-L68), the closure captures `cwd` as `undefined`:

   ```typescript
   function createActionDeps(cwd?: string): ActionDeps {
     return {
       gitAdd: (addPath: string, cwdPath?: string) => git.add(addPath, cwdPath ?? cwd),
       // ...
     };
   }
   ```

3. When `executeStateAction` at [actions.ts:47](src/lib/newpr/actions.ts#L47) calls `deps.gitAdd('.', cwd)` where `cwd` is `undefined`:

   ```typescript
   case 'commit_all':
     deps.gitAdd('.', cwd);  // cwd is undefined!
     break;
   ```

4. This results in `git add .` being executed in `process.cwd()`, which might be a subdirectory, not the repository root.

### Example

```
repo/
├── docs/
│   └── LSWT-INTERACTIVE-PLAN.md  (untracked - NOT staged)
├── src/
│   └── (user runs newpr from here)
└── file.txt
```

When running from `src/`:

- `git status --porcelain` shows `?? docs/LSWT-INTERACTIVE-PLAN.md` (works from any subdirectory)
- `git add .` only adds files in `src/` (the untracked file in `docs/` is NOT staged)

## The Fix

Pass the repository root (`repoRoot`) to `createActionDeps()` so all git operations run from the correct directory:

```typescript
// In modeNewFeature, around line 486:
const repoRoot = git.getRepoRoot();
const deps = createActionDeps(repoRoot); // Pass repoRoot
```

Alternatively, use `git add -A` (or `git add --all`) which stages all changes in the entire repository regardless of the current working directory.

## Why Tests Didn't Catch This

### 1. Integration Tests Pass the cwd Explicitly

The integration tests in [newpr.integration.test.ts](src/integration/newpr.integration.test.ts) correctly pass the working directory:

```typescript
function createRealDeps(cwd: string): ActionDeps {
  return {
    gitAdd: (addPath: string, cwdPath?: string) => git.add(addPath, cwdPath ?? cwd),
    // ...
  };
}

// Tests always call with mainRepoDir:
const deps = createRealDeps(mainRepoDir);
executeStateAction(action, 'Test feature', branchName, deps, mainRepoDir);
```

The tests **always run from the repo root** and **always pass the cwd**, so they never encounter the subdirectory bug.

### 2. Unit Tests Use Mocks

The unit tests in [actions.test.ts](src/lib/newpr/actions.test.ts) mock the git operations:

```typescript
const deps = makeDeps();
// deps.gitAdd is a mock that just records calls
executeStateAction(action, 'My feature', 'feat/my-feature', deps);
expect(deps.gitAdd).toHaveBeenCalledWith('.', undefined);
```

The tests verify the mock was called with the expected arguments, but don't verify the **actual git behavior** when cwd is undefined.

### 3. No Tests for "Running from Subdirectory" Scenario

There are no tests that simulate:

1. Being in a subdirectory when calling `newpr`
2. Having files in a different directory than the current one
3. The full CLI entry point where `createActionDeps()` is called without arguments

## How to Improve Testing

### 1. Add Integration Test for Subdirectory Scenario

```typescript
it('stages files when run from subdirectory', () => {
  const baseBranch = 'main';
  const branchName = 'test-feature-subdir';

  // Create file in docs/
  fs.mkdirSync(path.join(mainRepoDir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(mainRepoDir, 'docs', 'plan.md'), '# Plan\n');

  // Create src/ subdirectory
  fs.mkdirSync(path.join(mainRepoDir, 'src'), { recursive: true });

  // Simulate running from src/ subdirectory (current bug)
  const srcDir = path.join(mainRepoDir, 'src');
  const brokenDeps = createRealDeps(srcDir); // Wrong cwd!

  // This should stage files in docs/, but with the bug it doesn't
  executeStateAction(action, 'Test feature', branchName, brokenDeps, srcDir);

  // This would fail with the current bug:
  expect(git.getStagedFiles(mainRepoDir)).toContain('docs/plan.md');
});
```

### 2. Test the Actual CLI Entry Point

Create an E2E test that:

1. Spawns the actual `newpr` CLI process
2. Runs it from a subdirectory
3. Provides input via stdin
4. Verifies the commit contains the expected files

### 3. Add Assertions for cwd in Unit Tests

```typescript
it('uses repo root as cwd, not process.cwd()', () => {
  // The deps should be created with repoRoot, not undefined
  const repoRoot = git.getRepoRoot();
  const deps = createActionDeps(repoRoot);

  // When executing action, cwd should be repoRoot
  executeStateAction(action, 'desc', 'branch', deps, repoRoot);

  expect(deps.gitAdd).toHaveBeenCalledWith('.', repoRoot);
});
```

### 4. Consider Using Git Hooks or CI Checks

Add a test that verifies all git operations in the CLI use explicit cwd values:

```typescript
// In a test or linting rule:
// Ensure createActionDeps is never called without arguments
```

## Applied Fix

The fix was applied in [src/cli/newpr.ts:486](../src/cli/newpr.ts#L486):

```typescript
const originalBranch = git.getCurrentBranch() || 'main';
const deps = createActionDeps(repoRoot); // Now uses existing repoRoot from line 411
```

This ensures all git operations in `executeStateAction` run from the repository root, regardless of where the user invoked `newpr`.

A regression test was also added in [src/integration/newpr.integration.test.ts](../src/integration/newpr.integration.test.ts) under "Bug regression: commit_all from subdirectory" to verify:

1. Calling with a subdirectory cwd fails to stage sibling directory files (demonstrates the bug)
2. Calling with the repo root cwd correctly stages all files (verifies the fix)
