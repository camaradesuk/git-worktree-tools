# Slug Fix, Unified PR Extraction, and Worktree Auto-Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the slug placeholder bug, unify PR number extraction with `gh` CLI fallback, and auto-setup in-repo worktree directories.

**Architecture:** Three independent changes that improve worktree path generation and management. The slug fix passes branch names through existing call sites. The unified extractor replaces two divergent implementations with a shared module. The auto-setup detects in-repo worktree parents and handles directory creation + gitignore.

**Tech Stack:** TypeScript, Node.js fs/path, `gh` CLI, Vitest

---

### Task 1: Separator Cleanup in `generateWorktreePath` — Write Tests

**Files:**

- Modify: `src/lib/config.test.ts`

**Step 1: Write failing tests for separator cleanup**

Add these tests to the existing `generateWorktreePath` describe block in `src/lib/config.test.ts`:

```typescript
it('should clean up trailing separators when branchName is absent', () => {
  const customConfig = {
    ...config,
    worktreePattern: 'pr{number}.{slug}',
  };
  const result = generateWorktreePath(customConfig, '/home/user/repos/myproject', 'myproject', 123);
  expect(path.basename(result)).toBe('pr123');
});

it('should clean up doubled separators', () => {
  const customConfig = {
    ...config,
    worktreePattern: '{repo}..pr{number}',
  };
  const result = generateWorktreePath(customConfig, '/home/user/repos/myproject', 'myproject', 123);
  expect(path.basename(result)).toBe('myproject.pr123');
});

it('should clean up leading separators', () => {
  const customConfig = {
    ...config,
    worktreePattern: '.pr{number}',
  };
  const result = generateWorktreePath(customConfig, '/home/user/repos/myproject', 'myproject', 123);
  expect(path.basename(result)).toBe('pr123');
});

it('should clean up trailing separators with dashes and underscores', () => {
  const customConfig = {
    ...config,
    worktreePattern: 'pr{number}-{slug}',
  };
  const result = generateWorktreePath(customConfig, '/home/user/repos/myproject', 'myproject', 123);
  expect(path.basename(result)).toBe('pr123');
});

it('should clean up multiple doubled separators', () => {
  const customConfig = {
    ...config,
    worktreePattern: '{repo}--pr{number}..{slug}',
  };
  const result = generateWorktreePath(
    customConfig,
    '/home/user/repos/myproject',
    'myproject',
    123,
    'feat/my-feature'
  );
  expect(path.basename(result)).toBe('myproject-pr123.my-feature');
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/config.test.ts`
Expected: New tests FAIL (separator cleanup not implemented yet)

**Step 3: Commit**

```bash
git add src/lib/config.test.ts
git commit -m "test: add separator cleanup tests for generateWorktreePath"
```

---

### Task 2: Separator Cleanup in `generateWorktreePath` — Implement

**Files:**

- Modify: `src/lib/config.ts:728-763`

**Step 1: Add separator cleanup after placeholder replacement**

In `generateWorktreePath()` in `src/lib/config.ts`, add cleanup logic just before the `path.join` return. After the closing brace of the `if (branchName) { ... } else { ... }` block (after line 752) and before the `// Resolve parent directory` comment (line 754):

```typescript
// Clean up separator artifacts from placeholder replacement
// Remove doubled separators: pr123..foo → pr123.foo
pattern = pattern.replace(/([.\-_]){2,}/g, '$1');
// Remove leading separators: .pr123 → pr123
pattern = pattern.replace(/^[.\-_]+/, '');
// Remove trailing separators: pr123. → pr123
pattern = pattern.replace(/[.\-_]+$/, '');
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test -- src/lib/config.test.ts`
Expected: All tests PASS including new separator cleanup tests

**Step 3: Commit**

```bash
git add src/lib/config.ts
git commit -m "fix: clean up separator artifacts in worktree path generation"
```

---

### Task 3: Pass `branchName` at All Call Sites

**Files:**

- Modify: `src/api/create.ts:147,345,388,501`
- Modify: `src/cli/newpr.ts:567,758,1124`

**Step 1: Fix `src/api/create.ts` — 4 call sites**

Line 147 — `setupPrWorktree()`: `pr.headBranch` is available (used on line 161)

```typescript
// Before:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber);
// After:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber, pr.headBranch);
```

Line 345 — `createPr()` existing branch with existing PR: `currentBranch` is in scope

```typescript
// Before:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, existingPr.number);
// After:
const worktreePath = generateWorktreePath(
  config,
  repoRoot,
  repoName,
  existingPr.number,
  currentBranch
);
```

Line 388 — `createPr()` existing branch, new PR: `currentBranch` is in scope

```typescript
// Before:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);
// After:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number, currentBranch);
```

Line 501 — `createPr()` new branch: `branchName` is in scope

```typescript
// Before:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);
// After:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number, branchName);
```

**Step 2: Fix `src/cli/newpr.ts` — 3 call sites**

Line 567 — `modeExistingPr()`: `pr.headBranch` is available (printed on line 565)

```typescript
// Before:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber);
// After:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber, pr.headBranch);
```

Line 758 — `modeExistingBranch()`: `branchName` is a function parameter

```typescript
// Before:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);
// After:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number, branchName);
```

Line 1124 — `modeNewFeature()`: `branchName` is in scope (generated earlier)

```typescript
// Before:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number);
// After:
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number, branchName);
```

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/api/create.ts src/cli/newpr.ts
git commit -m "fix: pass branchName to generateWorktreePath at all call sites"
```

---

### Task 4: Unified `extractPrNumber` — Write Tests

**Files:**

- Create: `src/lib/worktree-utils.test.ts`

**Step 1: Write failing tests for the unified extractor**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { extractPrNumber } from './worktree-utils.js';
import { DEFAULT_WORKTREE_PATTERN } from './constants.js';

describe('extractPrNumber', () => {
  describe('pattern-based extraction', () => {
    it('should extract PR number using configured pattern', () => {
      const result = extractPrNumber('/worktrees/myproject.pr42', {
        worktreePattern: '{repo}.pr{number}',
      });
      expect(result).toBe(42);
    });

    it('should extract PR number from slug pattern', () => {
      const result = extractPrNumber('/worktrees/pr2301.mongodb-change-streams', {
        worktreePattern: 'pr{number}.{slug}',
      });
      expect(result).toBe(2301);
    });

    it('should extract PR number from branch pattern', () => {
      const result = extractPrNumber('/worktrees/myproject-pr123-feat-login', {
        worktreePattern: '{repo}-pr{number}-{branch}',
      });
      expect(result).toBe(123);
    });

    it('should return null for non-matching path', () => {
      const result = extractPrNumber('/worktrees/random-directory', {
        worktreePattern: '{repo}.pr{number}',
      });
      expect(result).toBeNull();
    });
  });

  describe('default pattern fallback', () => {
    it('should use default pattern when no config pattern provided', () => {
      const result = extractPrNumber('/worktrees/myproject.pr99');
      expect(result).toBe(99);
    });

    it('should use default pattern when config pattern does not match', () => {
      const result = extractPrNumber('/worktrees/myproject.pr99', {
        worktreePattern: 'pr{number}.{slug}',
      });
      // Doesn't match pr{number}.{slug} pattern but matches default {repo}.pr{number}
      expect(result).toBe(99);
    });
  });

  describe('edge cases', () => {
    it('should handle patterns with special regex characters', () => {
      const result = extractPrNumber('/worktrees/my.project.pr5', {
        worktreePattern: '{repo}.pr{number}',
      });
      expect(result).toBe(5);
    });

    it('should return null for empty path', () => {
      const result = extractPrNumber('');
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/worktree-utils.test.ts`
Expected: FAIL — module `./worktree-utils.js` not found

**Step 3: Commit**

```bash
git add src/lib/worktree-utils.test.ts
git commit -m "test: add tests for unified extractPrNumber"
```

---

### Task 5: Unified `extractPrNumber` — Implement

**Files:**

- Create: `src/lib/worktree-utils.ts`

**Step 1: Implement the unified extractor**

```typescript
/**
 * Shared worktree utilities used by lswt, cleanpr, and other tools
 */

import * as path from 'path';
import { DEFAULT_WORKTREE_PATTERN } from './constants.js';
import * as github from './github.js';
import * as git from './git.js';
import { logger } from './logger.js';

/**
 * Options for PR number extraction
 */
export interface ExtractPrNumberOptions {
  /** Configured worktree naming pattern */
  worktreePattern?: string;
}

/**
 * Convert a worktree naming pattern to a regex for PR number extraction.
 * Replaces {number} with a capture group and other placeholders with .*
 */
function patternToRegex(pattern: string): RegExp | null {
  if (!pattern.includes('{number}')) {
    return null;
  }

  // Escape regex special characters first, then replace placeholders
  let regexStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Now replace escaped placeholder sequences
  regexStr = regexStr.replace('\\{repo\\}', '.*');
  regexStr = regexStr.replace('\\{number\\}', '(\\d+)');
  regexStr = regexStr.replace('\\{branch\\}', '.*');
  regexStr = regexStr.replace('\\{slug\\}', '.*');

  // Anchor to full string
  regexStr = `^${regexStr}$`;

  try {
    return new RegExp(regexStr);
  } catch {
    return null;
  }
}

/**
 * Extract PR number from a worktree path using config-aware pattern matching.
 *
 * Resolution chain:
 * 1. Configured pattern (if provided)
 * 2. Default pattern ({repo}.pr{number})
 *
 * For async extraction with gh CLI fallback, use extractPrNumberAsync.
 */
export function extractPrNumber(
  worktreePath: string,
  options: ExtractPrNumberOptions = {}
): number | null {
  if (!worktreePath) {
    return null;
  }

  const name = path.basename(worktreePath);

  // 1. Try configured pattern
  if (options.worktreePattern) {
    const regex = patternToRegex(options.worktreePattern);
    if (regex) {
      const match = name.match(regex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  // 2. Try default pattern (skip if same as configured)
  if (options.worktreePattern !== DEFAULT_WORKTREE_PATTERN) {
    const defaultRegex = patternToRegex(DEFAULT_WORKTREE_PATTERN);
    if (defaultRegex) {
      const match = name.match(defaultRegex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  return null;
}

/**
 * Extract PR number with gh CLI fallback.
 *
 * Resolution chain:
 * 1. Configured pattern
 * 2. Default pattern
 * 3. gh CLI: look up branch from git worktree list, query gh pr list --head <branch>
 */
export async function extractPrNumberAsync(
  worktreePath: string,
  options: ExtractPrNumberOptions & { cwd?: string } = {}
): Promise<number | null> {
  // Try synchronous extraction first
  const syncResult = extractPrNumber(worktreePath, options);
  if (syncResult !== null) {
    return syncResult;
  }

  // 3. gh CLI fallback: find branch for this worktree, then query GitHub
  try {
    const worktrees = git.listWorktrees(options.cwd);
    const resolvedPath = path.resolve(worktreePath);
    const wt = worktrees.find((w) => path.resolve(w.path) === resolvedPath);

    if (wt?.branch) {
      logger.debug(`Falling back to gh CLI for PR extraction: branch=${wt.branch}`);
      const prInfo = github.getPrByBranch(wt.branch, options.cwd);
      if (prInfo) {
        return prInfo.number;
      }
    }
  } catch (error) {
    logger.debug(
      'gh CLI fallback for PR extraction failed: %s',
      error instanceof Error ? error.message : String(error)
    );
  }

  return null;
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test -- src/lib/worktree-utils.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/worktree-utils.ts
git commit -m "feat: add unified extractPrNumber with pattern-based extraction"
```

---

### Task 6: Unified `extractPrNumber` — Write Async/gh Fallback Tests

**Files:**

- Modify: `src/lib/worktree-utils.test.ts`

**Step 1: Add async tests with mocked gh CLI**

Add to the existing test file:

```typescript
import * as github from './github.js';
import * as git from './git.js';
import { extractPrNumberAsync } from './worktree-utils.js';

vi.mock('./github.js');
vi.mock('./git.js');

describe('extractPrNumberAsync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return sync result when pattern matches', async () => {
    const result = await extractPrNumberAsync('/worktrees/myproject.pr42', {
      worktreePattern: '{repo}.pr{number}',
    });
    expect(result).toBe(42);
    expect(git.listWorktrees).not.toHaveBeenCalled();
  });

  it('should fall back to gh CLI when pattern does not match', async () => {
    vi.mocked(git.listWorktrees).mockReturnValue([
      {
        path: '/worktrees/some-random-name',
        branch: 'feat/my-feature',
        commit: 'abc123',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      },
    ]);
    vi.mocked(github.getPrByBranch).mockReturnValue({
      number: 77,
      title: 'My Feature',
      state: 'OPEN',
      url: 'https://github.com/org/repo/pull/77',
      headBranch: 'feat/my-feature',
      baseBranch: 'main',
      isDraft: false,
    });

    const result = await extractPrNumberAsync('/worktrees/some-random-name', {
      worktreePattern: '{repo}.pr{number}',
    });
    expect(result).toBe(77);
    expect(github.getPrByBranch).toHaveBeenCalledWith('feat/my-feature', undefined);
  });

  it('should return null when gh CLI finds no PR', async () => {
    vi.mocked(git.listWorktrees).mockReturnValue([
      {
        path: '/worktrees/some-name',
        branch: 'feat/no-pr',
        commit: 'abc123',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      },
    ]);
    vi.mocked(github.getPrByBranch).mockReturnValue(null);

    const result = await extractPrNumberAsync('/worktrees/some-name');
    expect(result).toBeNull();
  });

  it('should return null when worktree has no branch', async () => {
    vi.mocked(git.listWorktrees).mockReturnValue([
      {
        path: '/worktrees/detached',
        branch: null,
        commit: 'abc123',
        isMain: false,
        isBare: false,
        isLocked: false,
        isPrunable: false,
      },
    ]);

    const result = await extractPrNumberAsync('/worktrees/detached');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test -- src/lib/worktree-utils.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/worktree-utils.test.ts
git commit -m "test: add async gh CLI fallback tests for extractPrNumber"
```

---

### Task 7: Replace Existing `extractPrNumber` Imports

**Files:**

- Modify: `src/lib/lswt/formatters.ts:11-24` (remove `extractPrNumber`)
- Modify: `src/lib/lswt/worktree-info.ts:10,55` (update import, pass options)
- Modify: `src/lib/lswt/index.ts` (update re-export)
- Modify: `src/lib/cleanpr/worktree-info.ts:23-49` (remove `extractPrNumber`)
- Modify: `src/lib/cleanpr/index.ts` (update re-export)

**Step 1: Update lswt**

In `src/lib/lswt/formatters.ts`, delete the `extractPrNumber` function (lines 8-24). Keep the rest of the file.

In `src/lib/lswt/worktree-info.ts`, change the import on line 10:

```typescript
// Before:
import { extractPrNumber, isMainWorktree, sortWorktrees } from './formatters.js';
// After:
import { isMainWorktree, sortWorktrees } from './formatters.js';
import { extractPrNumber } from '../worktree-utils.js';
```

On line 55, update the call to pass options:

```typescript
// Before:
const prNumber = extractPrNumber(wt.path);
// After:
const prNumber = extractPrNumber(wt.path, { worktreePattern: options.worktreePattern });
```

Note: The `ListOptions` type in `src/lib/lswt/types.ts` may need a `worktreePattern?: string` field added. Check if it already has one; if not, add it. The caller in `src/cli/lswt.ts` or `src/cli/wt/list.ts` should pass `config.worktreePattern` through.

In `src/lib/lswt/index.ts`, update the re-export:

```typescript
// Before (if extractPrNumber is re-exported from formatters):
export { extractPrNumber, ... } from './formatters.js';
// After:
export { extractPrNumber, extractPrNumberAsync } from '../worktree-utils.js';
```

**Step 2: Update cleanpr**

In `src/lib/cleanpr/worktree-info.ts`, delete the local `extractPrNumber` function (lines 20-49). Add import:

```typescript
import { extractPrNumber } from '../worktree-utils.js';
```

On line 64, update the call:

```typescript
// Before:
const prNumber = extractPrNumber(wt.path, worktreePattern);
// After:
const prNumber = extractPrNumber(wt.path, { worktreePattern });
```

In `src/lib/cleanpr/index.ts`, update the re-export if `extractPrNumber` is exported:

```typescript
export { extractPrNumber, extractPrNumberAsync } from '../worktree-utils.js';
```

**Step 3: Update existing tests**

Update `src/lib/lswt/formatters.test.ts` — remove tests for `extractPrNumber` (they're now in `worktree-utils.test.ts`).

Update `src/lib/cleanpr/worktree-info.test.ts` — remove tests for `extractPrNumber`.

**Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/lswt/ src/lib/cleanpr/ src/lib/worktree-utils.ts
git commit -m "refactor: replace divergent extractPrNumber with unified implementation"
```

---

### Task 8: Worktree Parent Auto-Setup — Write Tests

**Files:**

- Create: `src/lib/worktree-setup.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureWorktreeParentDir } from './worktree-setup.js';

describe('ensureWorktreeParentDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-setup-test-'));
    // Create a fake .git directory so it looks like a repo
    fs.mkdirSync(path.join(tmpDir, '.git'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create directory and update gitignore for in-repo parent', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(true);
    expect(result.gitignoreUpdated).toBe(true);
    expect(fs.existsSync(worktreeDir)).toBe(true);

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.worktrees');
  });

  it('should skip setup for out-of-repo parent', async () => {
    const externalDir = path.join(os.tmpdir(), 'external-worktrees');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: externalDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(false);
    expect(result.gitignoreUpdated).toBe(false);
  });

  it('should skip setup when directory already exists', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.mkdirSync(worktreeDir);

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(false);
    // Should still check gitignore
  });

  it('should not duplicate gitignore entries', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.worktrees\n', 'utf8');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.gitignoreUpdated).toBe(false);
    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    const matches = gitignore.match(/\.worktrees/g);
    expect(matches).toHaveLength(1);
  });

  it('should append to existing gitignore', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules\n.env\n', 'utf8');

    await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('.worktrees');
  });

  it('should handle nested worktree parent dirs', async () => {
    const worktreeDir = path.join(tmpDir, 'build', 'worktrees');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(true);
    expect(fs.existsSync(worktreeDir)).toBe(true);

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('build/worktrees');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/worktree-setup.test.ts`
Expected: FAIL — module `./worktree-setup.js` not found

**Step 3: Commit**

```bash
git add src/lib/worktree-setup.test.ts
git commit -m "test: add tests for worktree parent auto-setup"
```

---

### Task 9: Worktree Parent Auto-Setup — Implement

**Files:**

- Create: `src/lib/worktree-setup.ts`

**Step 1: Implement the auto-setup function**

```typescript
/**
 * Worktree parent directory auto-setup
 *
 * When worktreeParent resolves to a path inside the repo, automatically:
 * 1. Create the directory (with confirmation in interactive mode)
 * 2. Add it to .gitignore
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { promptConfirm } from './prompts.js';

export interface EnsureWorktreeParentOptions {
  /** Resolved absolute path of the worktree parent directory */
  resolvedParentDir: string;
  /** Repository root path */
  repoRoot: string;
  /** Whether to prompt for confirmation (false = auto-proceed) */
  interactive: boolean;
}

export interface EnsureWorktreeParentResult {
  /** Whether the directory was created */
  created: boolean;
  /** Whether .gitignore was updated */
  gitignoreUpdated: boolean;
  /** Whether the user declined (only in interactive mode) */
  declined: boolean;
}

/**
 * Check if a path is inside the repo root
 */
function isInsideRepo(dirPath: string, repoRoot: string): boolean {
  const resolved = path.resolve(dirPath);
  const resolvedRoot = path.resolve(repoRoot);
  return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
}

/**
 * Get the relative path from repo root for gitignore entry
 */
function getGitignoreEntry(dirPath: string, repoRoot: string): string {
  return path.relative(repoRoot, dirPath);
}

/**
 * Check if a gitignore entry already exists
 */
function gitignoreContains(gitignorePath: string, entry: string): boolean {
  if (!fs.existsSync(gitignorePath)) {
    return false;
  }
  const content = fs.readFileSync(gitignorePath, 'utf8');
  const regex = new RegExp(`^\\/?${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  return regex.test(content);
}

/**
 * Add an entry to .gitignore
 */
function addToGitignore(gitignorePath: string, entry: string): void {
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }

  const addition = `\n# git-worktree-tools worktree directory\n${entry}\n`;
  content = content.trimEnd() + '\n' + addition;
  fs.writeFileSync(gitignorePath, content, 'utf8');
}

/**
 * Ensure the worktree parent directory exists and is gitignored (if inside repo).
 *
 * Only acts when the resolved parent dir is inside the repo root.
 * In interactive mode, prompts for confirmation before making changes.
 * In non-interactive mode, proceeds automatically.
 */
export async function ensureWorktreeParentDir(
  options: EnsureWorktreeParentOptions
): Promise<EnsureWorktreeParentResult> {
  const { resolvedParentDir, repoRoot, interactive } = options;

  const result: EnsureWorktreeParentResult = {
    created: false,
    gitignoreUpdated: false,
    declined: false,
  };

  // Only act for in-repo directories
  if (!isInsideRepo(resolvedParentDir, repoRoot)) {
    return result;
  }

  const dirExists = fs.existsSync(resolvedParentDir);
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const gitignoreEntry = getGitignoreEntry(resolvedParentDir, repoRoot);
  const alreadyIgnored = gitignoreContains(gitignorePath, gitignoreEntry);

  // Nothing to do
  if (dirExists && alreadyIgnored) {
    return result;
  }

  // Prompt in interactive mode
  if (interactive && (!dirExists || !alreadyIgnored)) {
    const actions: string[] = [];
    if (!dirExists) {
      actions.push(`create \`${gitignoreEntry}/\``);
    }
    if (!alreadyIgnored) {
      actions.push(`add \`${gitignoreEntry}\` to .gitignore`);
    }

    const confirmed = await promptConfirm(`Will ${actions.join(' and ')}. Continue?`, true);

    if (!confirmed) {
      result.declined = true;
      return result;
    }
  }

  // Create directory
  if (!dirExists) {
    fs.mkdirSync(resolvedParentDir, { recursive: true });
    result.created = true;
    logger.info(`Created worktree directory: ${gitignoreEntry}/`);
  }

  // Update .gitignore
  if (!alreadyIgnored) {
    addToGitignore(gitignorePath, gitignoreEntry);
    result.gitignoreUpdated = true;
    logger.info(`Added ${gitignoreEntry} to .gitignore`);
  }

  return result;
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test -- src/lib/worktree-setup.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/worktree-setup.ts
git commit -m "feat: add worktree parent auto-setup with gitignore management"
```

---

### Task 10: Integrate Auto-Setup into Worktree Creation Flow

**Files:**

- Modify: `src/cli/newpr.ts` (before each `git.addWorktree` call)
- Modify: `src/api/create.ts` (before each `git.addWorktree` call)

**Step 1: Add auto-setup call in newpr.ts**

Add the import at the top of `src/cli/newpr.ts`:

```typescript
import { ensureWorktreeParentDir } from '../lib/worktree-setup.js';
```

Before each `git.addWorktree()` call, insert the auto-setup. The pattern is the same everywhere — add it after `generateWorktreePath()` and before `git.addWorktree()`. Use `path.dirname(worktreePath)` as the resolved parent dir. The `interactive` flag should be `!options.json && !options.yes` (non-interactive when JSON output or `--yes` flag is used).

Example insertion (repeat at each worktree creation site):

```typescript
const worktreePath = generateWorktreePath(config, repoRoot, repoName, pr.number, branchName);

// Auto-setup worktree parent directory
const setupResult = await ensureWorktreeParentDir({
  resolvedParentDir: path.dirname(worktreePath),
  repoRoot,
  interactive: !options.json && !options.yes,
});
if (setupResult.declined) {
  exitWithError('Worktree directory setup declined.', ErrorCode.USER_ABORT, options.json);
}
```

**Step 2: Add auto-setup call in api/create.ts**

Add the import at the top of `src/api/create.ts`:

```typescript
import { ensureWorktreeParentDir } from '../lib/worktree-setup.js';
```

The API layer is always non-interactive, so use `interactive: false`:

```typescript
const worktreePath = generateWorktreePath(config, repoRoot, repoName, prNumber, pr.headBranch);

// Auto-setup worktree parent directory
await ensureWorktreeParentDir({
  resolvedParentDir: path.dirname(worktreePath),
  repoRoot,
  interactive: false,
});
```

Note: Some functions in `api/create.ts` may not be async. If needed, make the enclosing function async or wrap in a sync helper that skips the prompt.

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/cli/newpr.ts src/api/create.ts
git commit -m "feat: integrate worktree parent auto-setup into newpr and API"
```

---

### Task 11: Documentation Updates

**Files:**

- Modify: `README.md` (lines ~358-374)
- Modify: `schemas/worktreerc.schema.json` (lines ~33-42)
- Modify: `src/cli/wt/new.ts` (help text)
- Modify: any `getHelpText()` functions that reference worktree patterns

**Step 1: Update README.md configuration table**

Update the `worktreePattern` row to mention placeholders and separator cleanup:

```markdown
| `worktreePattern` | string | `"{repo}.pr{number}"` | Naming pattern. Placeholders: `{repo}`, `{number}`, `{branch}`, `{slug}`. Doubled/trailing separators are cleaned automatically. |
| `worktreeParent` | string | `".."` | Parent directory for worktrees. If inside the repo, the directory is auto-created and added to `.gitignore`. |
```

**Step 2: Update schema descriptions**

In `schemas/worktreerc.schema.json`, update the `worktreePattern` description:

```json
"worktreePattern": {
  "type": "string",
  "default": "{repo}.pr{number}",
  "description": "Worktree directory naming pattern. Placeholders: {repo}, {number}, {branch}, {slug}. {slug} is the branch name after the first '/', made filesystem-safe. Doubled or trailing separators (., -, _) are cleaned automatically."
}
```

Update the `worktreeParent` description:

```json
"worktreeParent": {
  "type": "string",
  "default": "..",
  "description": "Parent directory for worktrees (absolute or relative to repo root). When the resolved path is inside the repository, the directory will be auto-created and added to .gitignore."
}
```

**Step 3: Update CLI help text**

In `src/cli/wt/new.ts`, if there are option descriptions for worktree pattern or parent, update them to match the schema descriptions.

Check `getHelpText()` in `src/cli/newpr.ts`, `src/cli/cleanpr.ts`, `src/cli/lswt.ts` for any references to worktree path patterns that need updating.

**Step 4: Run build to check for issues**

Run: `pnpm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add README.md schemas/worktreerc.schema.json src/cli/
git commit -m "docs: update worktreePattern and worktreeParent documentation"
```

---

### Task 12: Final Verification

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 2: Run build**

Run: `pnpm run build`
Expected: Build succeeds with no errors

**Step 3: Run linter/formatter**

Run: `npx prettier --check .`
Expected: All files formatted

**Step 4: Manual smoke test (if possible)**

Verify with the syrf repo's pattern `pr{number}.{slug}`:

- A worktree for branch `feat/my-feature` on PR #123 should produce path `.worktrees/pr123.my-feature`
- A worktree with no branch should produce path `.worktrees/pr123` (no trailing dot)

**Step 5: Final commit if any formatting fixes needed**

```bash
git add -A
git commit -m "chore: formatting fixes"
```
