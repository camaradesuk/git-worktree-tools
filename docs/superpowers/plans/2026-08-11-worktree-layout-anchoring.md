# Worktree Layout Anchoring — Implementation Plan (Part 3, §5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

## Goal

Fix `generateWorktreePath` (`src/lib/config.ts:729-778`) so a relative `worktreeParent` resolves against the **main worktree root** (`getMainWorktreeRoot()`, `src/lib/git.ts:694-719`) instead of the current worktree's root — making placement stable from any linked worktree and correct for bare-repository container layouts (`.bare/` + `main/` + `pr/pr<N>.<slug>/`). Add an escape hatch (`worktreeParentAnchor: "repo-root"`) for legacy behaviour, and have `wt init` detect bare-container layouts and offer to scaffold matching config. Worktree _discovery_ (`listWorktrees`, `wt clean`, `wt list`) is untouched — it already works via `git worktree list`.

## Architecture

`generateWorktreePath` stays a **pure function** (no git calls inside it) — it already takes `repoRoot` as a caller-supplied string. The fix adds one optional parameter, `mainWorktreeRoot`, and changes only which path is used as the anchor for a _relative_ `worktreeParent`, gated by `config.worktreeParentAnchor`. Absolute `worktreeParent` is unaffected.

Call sites (`src/cli/newpr.ts`, `src/api/create.ts`) compute `mainWorktreeRoot` once per function via `git.getMainWorktreeRoot(repoRoot)` wrapped in try/catch, falling back to `repoRoot`. This mirrors the existing defensive pattern at `newpr.ts:328-335` and — critically — matches the existing test mock default (`git.getMainWorktreeRoot` is mocked to **throw** in `newpr.test.ts`'s global `beforeEach`, ~line 235), so wiring requires **zero edits to any pre-existing test case**: the catch-fallback reproduces old behaviour unless a test explicitly overrides the mock.

`wt init`'s scaffold reuses a new small `git.ts` export, `isBareContainerLayout()` (basename of `--git-common-dir` ≠ `.git`), and writes via a new `createRepoConfig()` in `global-config.ts` — mirroring `createLocalConfig()` but targeting `.worktreerc` (committed) rather than `.worktreerc.local`.

## Tech Stack

TypeScript (ESM, NodeNext), vitest, no new dependencies. Real `git`/`child_process` calls only in integration tests (via `execSync`), never in unit tests (mocked `child_process`, per the existing `git.test.ts` convention).

## Global Constraints

- ESM package: every relative import ends in `.js` even though sources are `.ts`.
- Node >= 18; **no new runtime dependencies**.
- vitest, tests colocated as `*.test.ts`.
- Use **`pnpm`, never `npm`** (lockfile pins prettier 3.8.1; npm resolves a different version and CI goes red).
- Commit normally (**no `--no-verify`**); run `pnpm exec prettier --write` on touched files before each commit.
- **Known-failing baseline: 14 tests / 4 files** — `src/lib/config.test.ts` (4), `src/lib/prs/actions.test.ts` (1), `src/e2e/newpr-full-flow.e2e.test.ts` (6), `src/e2e/newpr/scenarios.e2e.test.ts` (3). Pre-existing (the suite reads the developer's real `~/.config/git-worktree-tools/config.json`), not to be fixed here. A task succeeds if it adds **zero new failures** — re-check after every task.
- `pnpm run build` before any e2e test.
- A **real bare-repository fixture** is required for integration testing, not just mocks (Task 12).
- `tsconfig.json` excludes `src/**/*.test.ts` from `pnpm run build`, and `vitest run` does not type-check — so a stale `ResolvedConfig`-shaped literal in a test will not fail CI. Task 2b fixes the six that exist anyway, for correctness.

## File Structure

| File                                                                                                                                                              | Action     | Why                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `src/lib/constants.ts`                                                                                                                                            | modify     | Add `DEFAULT_WORKTREE_PARENT_ANCHOR`                                                               |
| `src/lib/constants.test.ts`                                                                                                                                       | modify     | Test the new constant                                                                              |
| `src/lib/config.ts`                                                                                                                                               | modify     | Add `worktreeParentAnchor` to config types + defaults; add `mainWorktreeRoot` param + anchor logic |
| `src/lib/config.test.ts`                                                                                                                                          | modify     | Anchoring test cases; default assertion                                                            |
| `src/lib/config-validation.ts`                                                                                                                                    | modify     | Validate the enum; add to `KNOWN_TOP_LEVEL_KEYS`                                                   |
| `src/lib/config-validation.test.ts`                                                                                                                               | modify     | Valid/invalid enum tests                                                                           |
| `schemas/worktreerc.schema.json`                                                                                                                                  | modify     | Add `worktreeParentAnchor`; clarify `worktreeParent` description                                   |
| `src/lib/schema.test.ts`                                                                                                                                          | modify     | Schema enum tests                                                                                  |
| `src/lib/git.ts`                                                                                                                                                  | modify     | Add `isBareContainerLayout()`                                                                      |
| `src/lib/git.test.ts`                                                                                                                                             | modify     | Unit tests for it                                                                                  |
| `src/lib/global-config.ts`                                                                                                                                        | modify     | Add `createRepoConfig()`                                                                           |
| `src/lib/global-config.test.ts`                                                                                                                                   | modify     | Tests for it                                                                                       |
| `src/cli/wt/init.ts`                                                                                                                                              | modify     | Detect layout; offer + wire the scaffold                                                           |
| `src/cli/wt/init.unit.test.ts`                                                                                                                                    | modify     | Detection + wiring tests                                                                           |
| `src/cli/newpr.ts`                                                                                                                                                | modify     | Thread `mainWorktreeRoot` into 3 call sites                                                        |
| `src/cli/newpr.test.ts`                                                                                                                                           | modify     | Backfill fixture; 3 wiring tests                                                                   |
| `src/api/create.ts`                                                                                                                                               | modify     | Thread into `setupPrWorktree` + `createPr`'s 3 call sites                                          |
| `src/api/create.test.ts`                                                                                                                                          | **create** | No unit test exists today for this module                                                          |
| `src/integration/worktree-layout.integration.test.ts`                                                                                                             | **create** | Real bare-repo fixture                                                                             |
| `src/cli/prs.test.ts`, `src/cli/wt/interactive-menu.test.ts`, `src/cli/wtconfig.test.ts`, `src/lib/wtlink/config-manifest.test.ts`, `src/lib/prs/command.test.ts` | modify     | Backfill `worktreeParentAnchor` in full `ResolvedConfig` literals (Task 2b)                        |

---

### Task 1 — `DEFAULT_WORKTREE_PARENT_ANCHOR` constant

**Files:** `src/lib/constants.ts`, `src/lib/constants.test.ts`
**Produces:** `DEFAULT_WORKTREE_PARENT_ANCHOR: 'main-worktree'` (consumed by Task 2).

- [ ] **Step 1: Failing test.** Add `DEFAULT_WORKTREE_PARENT_ANCHOR` to the existing import block in `constants.test.ts` (next to `DEFAULT_WORKTREE_PARENT`, ~line 21), then after the `'has correct DEFAULT_WORKTREE_PARENT'` test (~line 68):

```ts
it('has correct DEFAULT_WORKTREE_PARENT_ANCHOR', () => {
  expect(DEFAULT_WORKTREE_PARENT_ANCHOR).toBe('main-worktree');
});
```

- [ ] **Step 2: Run and see it fail** — `pnpm test -- constants.test.ts` (import error / not defined).

- [ ] **Step 3: Implement.** In `constants.ts`, after `DEFAULT_WORKTREE_PARENT` (~line 106):

```ts
/**
 * Default anchor for resolving a relative worktreeParent.
 * "main-worktree" resolves against getMainWorktreeRoot() (the bare-repo container
 * root for .bare/ layouts), stable regardless of which worktree invoked the command.
 */
export const DEFAULT_WORKTREE_PARENT_ANCHOR = 'main-worktree';
```

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `pnpm exec prettier --write src/lib/constants.ts src/lib/constants.test.ts`; `feat(config): add DEFAULT_WORKTREE_PARENT_ANCHOR constant`.

---

### Task 2 — `worktreeParentAnchor` on `WorktreeConfig` / `ResolvedConfig`

**Files:** `src/lib/config.ts`, `src/lib/config.test.ts`
**Consumes:** Task 1. **Produces:** `ResolvedConfig.worktreeParentAnchor` (always defaulted), consumed by Tasks 3 and 5.

- [ ] **Step 1: Failing test.** In `config.test.ts`, inside `describe('getDefaultConfig', ...)`, extend the first test:

```ts
expect(config.worktreeParentAnchor).toBe('main-worktree');
```

- [ ] **Step 2: Run and see it fail** (`undefined` !== `'main-worktree'`).

- [ ] **Step 3: Implement.** In `config.ts`: add `DEFAULT_WORKTREE_PARENT_ANCHOR` to the `./constants.js` imports. In `WorktreeConfig`, right after `worktreeParent?: string;` (~line 249):

```ts
  /**
   * Anchor used to resolve a relative `worktreeParent`.
   * - "main-worktree" (default): anchor to the main worktree root, resolved via
   *   `getMainWorktreeRoot()`. For a bare-repository container (`.bare/` + linked
   *   worktrees) this is the container directory. Stable regardless of which
   *   worktree the command is invoked from.
   * - "repo-root": anchor to the current worktree's root (legacy behaviour, the
   *   only option before this setting existed).
   * Default: "main-worktree"
   */
  worktreeParentAnchor?: 'main-worktree' | 'repo-root';
```

In `getDefaultConfig()`, after `worktreeParent: DEFAULT_WORKTREE_PARENT,` (~line 368):

```ts
    worktreeParentAnchor: DEFAULT_WORKTREE_PARENT_ANCHOR,
```

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `feat(config): add worktreeParentAnchor field with main-worktree default`.

> **`mergeConfigs` needs no change.** `worktreeParentAnchor` is a plain scalar; `mergeConfigs` (`config.ts:561-612`) already handles scalars via the top-level spread. Only array/object fields (`sharedRepos`, `ai`, `hooks`, `wtlink`) are special-cased.

---

### Task 2b — Backfill `worktreeParentAnchor` into existing `ResolvedConfig` fixtures

**Files:** `src/cli/newpr.test.ts`, `src/cli/prs.test.ts`, `src/cli/wt/interactive-menu.test.ts`, `src/cli/wtconfig.test.ts`, `src/lib/wtlink/config-manifest.test.ts`, `src/lib/prs/command.test.ts`

Mechanical; no red/green cycle. Nothing currently fails (tests aren't type-checked), but the literals now silently miss a `ResolvedConfig` field.

- [ ] **Step 1:** `grep -rn "linkConfigFiles: undefined" src --include="*.test.ts"` — finds all six full-config literals.
- [ ] **Step 2:** In each, add `worktreeParentAnchor: 'main-worktree' as const,` next to the existing `worktreeParent` line. In `newpr.test.ts` that's the `defaultConfig` literal (~lines 132-153).
- [ ] **Step 3:** Run the full `pnpm test` — confirm the failing count is still exactly the 14/4-file baseline.
- [ ] **Step 4: Format and commit** — `test: backfill worktreeParentAnchor into ResolvedConfig test fixtures`.

---

### Task 3 — Validate `worktreeParentAnchor`

**Files:** `src/lib/config-validation.ts`, `src/lib/config-validation.test.ts`

- [ ] **Step 1: Failing tests.** After `'should accept valid preferredEditor values'` (~line 67):

```ts
it('should validate worktreeParentAnchor enum', () => {
  const result = validateConfig({ worktreeParentAnchor: 'nonsense' });
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.path === 'worktreeParentAnchor')).toBe(true);
});

it('should accept valid worktreeParentAnchor values', () => {
  expect(validateConfig({ worktreeParentAnchor: 'main-worktree' }).valid).toBe(true);
  expect(validateConfig({ worktreeParentAnchor: 'repo-root' }).valid).toBe(true);
});
```

- [ ] **Step 2: Run and see it fail.** Note the precise failure: the key isn't in `KNOWN_TOP_LEVEL_KEYS` yet, so `'nonsense'` already yields `valid: false` via "Unknown config property" (first test passes for the _wrong reason_) — it's the **second** test that genuinely fails, because valid values are rejected as unknown too. Confirm that.

- [ ] **Step 3: Implement.** In `config-validation.ts`, after `VALID_EDITORS` (~line 42):

```ts
/**
 * Valid worktreeParentAnchor options
 */
const VALID_WORKTREE_PARENT_ANCHORS = ['main-worktree', 'repo-root'];
```

Add `'worktreeParentAnchor',` to `KNOWN_TOP_LEVEL_KEYS` right after `'worktreeParent',`. Then after the `worktreeParent` validation block (~line 147):

```ts
// Validate worktreeParentAnchor
if (obj.worktreeParentAnchor !== undefined) {
  if (
    typeof obj.worktreeParentAnchor !== 'string' ||
    !VALID_WORKTREE_PARENT_ANCHORS.includes(obj.worktreeParentAnchor)
  ) {
    errors.push({
      path: 'worktreeParentAnchor',
      message: `worktreeParentAnchor must be one of: ${VALID_WORKTREE_PARENT_ANCHORS.join(', ')}`,
    });
  }
}
```

- [ ] **Step 4: Run and see both pass.**
- [ ] **Step 5: Format and commit** — `feat(config): validate worktreeParentAnchor enum`.

---

### Task 4 — Schema: `worktreeParentAnchor` property

**Files:** `schemas/worktreerc.schema.json`, `src/lib/schema.test.ts`

- [ ] **Step 1: Failing tests.** In the valid-configs describe, after `'config with all preferredEditor values'`:

```ts
it('config with all worktreeParentAnchor values', () => {
  for (const anchor of ['main-worktree', 'repo-root']) {
    expect(validate({ worktreeParentAnchor: anchor })).toBe(true);
  }
});
```

In the invalid-configs describe, after `'rejects invalid preferredEditor value'`:

```ts
it('rejects invalid worktreeParentAnchor value', () => {
  expect(validate({ worktreeParentAnchor: 'somewhere-else' })).toBe(false);
});
```

- [ ] **Step 2: Run and see it fail** — `additionalProperties: false` currently rejects the key, so the valid-values test fails (the invalid one passes for the wrong reason).

- [ ] **Step 3: Implement.** Replace the `worktreeParent` property and insert the new one after it:

```json
    "worktreeParent": {
      "type": "string",
      "default": "..",
      "description": "Parent directory for worktrees (absolute, or relative to the anchor set by worktreeParentAnchor). When the resolved path is inside the repository, the directory will be auto-created and added to .gitignore."
    },
    "worktreeParentAnchor": {
      "type": "string",
      "enum": ["main-worktree", "repo-root"],
      "default": "main-worktree",
      "description": "Anchor for resolving a relative worktreeParent. 'main-worktree' (default) resolves against the main worktree root — the bare-repository container directory for .bare/ layouts, stable regardless of which worktree the command runs from. 'repo-root' restores the legacy behaviour of anchoring to the current worktree's root."
    },
```

- [ ] **Step 4:** Also add `worktreeParentAnchor: 'main-worktree'` to the `configWithAllDefaults` literal in the `'config with all default values explicitly stated is valid'` test (~line 76).
- [ ] **Step 5: Run and see all pass**, including the pre-existing `'getDefaultConfig() returns valid config'` test (which now implicitly validates the new field).
- [ ] **Step 6: Format and commit** — `feat(schema): add worktreeParentAnchor to worktreerc schema`.

---

### Task 5 — `generateWorktreePath`: anchor to `mainWorktreeRoot` (the core fix)

**Files:** `src/lib/config.ts`, `src/lib/config.test.ts`
**Consumes:** Task 2. **Produces:** the 6-arg `generateWorktreePath` signature, consumed by Tasks 7-12.

- [ ] **Step 1: Failing tests.** In `describe('generateWorktreePath', ...)`, after the last existing test:

```ts
it('anchors relative worktreeParent to mainWorktreeRoot when invoked from a linked worktree', () => {
  const customConfig = {
    ...config,
    worktreeParent: 'pr',
    worktreePattern: 'pr{number}.{slug}',
  };
  const result = generateWorktreePath(
    customConfig,
    '/home/chris/workspace/syrf/pr/pr2467.x', // repoRoot: current (linked) worktree
    'syrf',
    2600,
    'feat/my-feature',
    '/home/chris/workspace/syrf' // mainWorktreeRoot: stable container anchor
  );
  expect(normalizePath(result)).toBe('/home/chris/workspace/syrf/pr/pr2600.my-feature');
});

it('produces the same path regardless of which worktree it is invoked from', () => {
  const customConfig = {
    ...config,
    worktreeParent: 'pr',
    worktreePattern: 'pr{number}.{slug}',
  };
  const mainWorktreeRoot = '/home/chris/workspace/syrf';
  const fromMain = generateWorktreePath(
    customConfig,
    '/home/chris/workspace/syrf/main',
    'syrf',
    2600,
    'feat/my-feature',
    mainWorktreeRoot
  );
  const fromLinkedWorktree = generateWorktreePath(
    customConfig,
    '/home/chris/workspace/syrf/pr/pr2467.other-feature',
    'syrf',
    2600,
    'feat/my-feature',
    mainWorktreeRoot
  );
  expect(fromMain).toBe(fromLinkedWorktree);
  expect(normalizePath(fromMain)).toBe('/home/chris/workspace/syrf/pr/pr2600.my-feature');
});

it('ignores mainWorktreeRoot when worktreeParent is absolute', () => {
  const customConfig = { ...config, worktreeParent: '/tmp/worktrees' };
  const result = generateWorktreePath(
    customConfig,
    '/home/user/repos/myproject.pr1',
    'myproject',
    789,
    undefined,
    '/home/user/repos/myproject'
  );
  expect(normalizePath(result)).toBe('/tmp/worktrees/myproject.pr789');
});

it('anchors to repoRoot (legacy) when worktreeParentAnchor is "repo-root"', () => {
  const customConfig = {
    ...config,
    worktreeParent: 'pr',
    worktreePattern: 'pr{number}.{slug}',
    worktreeParentAnchor: 'repo-root' as const,
  };
  const result = generateWorktreePath(
    customConfig,
    '/home/chris/workspace/syrf/pr/pr2467.x',
    'syrf',
    2600,
    'feat/my-feature',
    '/home/chris/workspace/syrf' // must be ignored
  );
  expect(normalizePath(result)).toBe('/home/chris/workspace/syrf/pr/pr2467.x/pr/pr2600.my-feature');
});

it('falls back to repoRoot when mainWorktreeRoot is omitted (backward compatible)', () => {
  const customConfig = {
    ...config,
    worktreeParent: '.worktrees',
    worktreePattern: 'pr{number}.{slug}',
  };
  const result = generateWorktreePath(
    customConfig,
    '/home/user/repos/myproject',
    'myproject',
    42,
    'fix-login-bug'
    // mainWorktreeRoot intentionally omitted
  );
  expect(normalizePath(result)).toBe('/home/user/repos/myproject/.worktrees/pr42.fix-login-bug');
});
```

- [ ] **Step 2: Run and see them fail.** Expect the first, second and fourth to fail (the anchor isn't consumed yet); the "absolute" and "omitted" tests should already pass. Confirm exactly which are red before implementing.

- [ ] **Step 3: Implement.** Change only the signature, the doc comment, and the "Resolve parent directory" block:

```ts
/**
 * Generate worktree path based on config pattern.
 *
 * A relative `worktreeParent` is resolved against `mainWorktreeRoot` (defaulting to
 * `repoRoot` when omitted, preserving pre-anchor-fix behaviour for callers that
 * haven't been updated). Set `config.worktreeParentAnchor` to "repo-root" to anchor
 * against `repoRoot` instead. Absolute `worktreeParent` values are always used as-is.
 */
export function generateWorktreePath(
  config: ResolvedConfig,
  repoRoot: string,
  repoName: string,
  prNumber: number,
  branchName?: string,
  mainWorktreeRoot?: string
): string {
  // ... pattern substitution unchanged ...

  // Resolve parent directory
  let parentDir: string;
  if (path.isAbsolute(config.worktreeParent)) {
    parentDir = config.worktreeParent;
  } else {
    const anchor =
      config.worktreeParentAnchor === 'repo-root' ? repoRoot : (mainWorktreeRoot ?? repoRoot);
    parentDir = path.resolve(anchor, config.worktreeParent);
  }

  return path.join(parentDir, pattern);
}
```

- [ ] **Step 4: Run and see all pass** — including every pre-existing test, which calls with 5 args so `mainWorktreeRoot` is `undefined` and behaviour is byte-identical.
- [ ] **Step 5: Format and commit** — `fix(config): anchor relative worktreeParent to mainWorktreeRoot`.

---

### Task 6 — `git.isBareContainerLayout()`

**Files:** `src/lib/git.ts`, `src/lib/git.test.ts`
**Produces:** `isBareContainerLayout(cwd?): boolean`, consumed by Task 14.

- [ ] **Step 1: Failing tests.** After `describe('getMainWorktreeRoot', ...)`:

```ts
describe('isBareContainerLayout', () => {
  it('returns false for a conventional repository (.git)', () => {
    const repoPath = path.join('/home', 'user', 'repo');
    mockSpawnSync.mockReturnValue(mockSpawnSuccess(path.join(repoPath, '.git')));
    expect(git.isBareContainerLayout(repoPath)).toBe(false);
  });

  it('returns true for a bare-repository container layout (.bare)', () => {
    const containerPath = path.join('/home', 'chris', 'workspace', 'syrf');
    mockSpawnSync.mockReturnValue(mockSpawnSuccess(path.join(containerPath, '.bare')));
    expect(git.isBareContainerLayout(path.join(containerPath, 'main'))).toBe(true);
  });

  it('returns false when git-common-dir lookup fails', () => {
    mockSpawnSync.mockReturnValue(mockSpawnFailure('not a git repository'));
    expect(git.isBareContainerLayout()).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see it fail** (`is not a function`).

- [ ] **Step 3: Implement.** In `git.ts`, after `getMainWorktreeRoot` (~line 719):

```ts
/**
 * Detect whether the current repository uses a bare-repository container layout
 * (e.g. a `.bare/` directory with `main/` and `pr/*` as linked worktrees) rather
 * than a conventional repository with its own `.git` directory.
 *
 * True when `git rev-parse --git-common-dir` resolves to something whose basename
 * is not `.git`. Returns false (never throws) when the lookup fails, so callers
 * can treat this as a soft hint.
 */
export function isBareContainerLayout(cwd?: string): boolean {
  const commonDir = execSafe(['rev-parse', '--git-common-dir'], { cwd });
  if (!commonDir) {
    return false;
  }
  return path.basename(path.resolve(commonDir)) !== '.git';
}
```

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `feat(git): add isBareContainerLayout detection`.

---

### Task 7 — Wire `newpr.ts` `modeExistingPr`

**Files:** `src/cli/newpr.ts`, `src/cli/newpr.test.ts`

- [ ] **Step 1: Failing test.** In `describe('--pr mode', ...)`, after `'sets up worktree for existing PR'`:

```ts
it('anchors the worktree path to the main worktree root, not the invoking cwd', async () => {
  vi.mocked(newpr.parseArgs).mockReturnValue({
    kind: 'success',
    options: { mode: 'pr', prNumber: 123, ...defaultOptions },
  });
  vi.mocked(github.isGhInstalled).mockReturnValue(true);
  vi.mocked(github.isAuthenticated).mockReturnValue(true);
  vi.mocked(git.getRepoRoot).mockReturnValue('/repo/pr/pr1.other-worktree');
  vi.mocked(git.getRepoName).mockReturnValue('repo');
  vi.mocked(git.getMainWorktreeRoot).mockReturnValue('/repo');
  vi.mocked(loadConfig).mockReturnValue(defaultConfig);
  vi.mocked(github.getPr).mockReturnValue(makePrInfo());
  vi.mocked(generateWorktreePath).mockReturnValue('/repo/pr/pr123.feature-123');
  vi.mocked(fs.existsSync).mockReturnValue(false);

  await runCli(['--pr', '123']);

  expect(generateWorktreePath).toHaveBeenCalledWith(
    defaultConfig,
    '/repo/pr/pr1.other-worktree',
    'repo',
    123,
    'feature-123',
    '/repo'
  );
});
```

- [ ] **Step 2: Run and see it fail** (5-arg call today).

- [ ] **Step 3: Implement.** In `modeExistingPr` (~line 535), after `const config = loadConfig(repoRoot);`:

```ts
let mainWorktreeRoot = repoRoot;
try {
  mainWorktreeRoot = git.getMainWorktreeRoot(repoRoot);
} catch {
  // Could not determine main worktree root; anchor to repoRoot instead.
}
```

Then pass it as the 6th argument to the `generateWorktreePath` call (~line 569).

- [ ] **Step 4: Run and see it pass** — no other test in the file asserts exact `generateWorktreePath` args.
- [ ] **Step 5: Format and commit** — `fix(newpr): anchor worktree path to main worktree root in --pr mode`.

---

### Task 8 — Wire `newpr.ts` `modeExistingBranch`

Same shape as Task 7, targeting `modeExistingBranch` (~line 659; `config` ~line 664; call ~line 766).

- [ ] **Step 1:** Add a failing test in `describe('--branch mode', ...)` following Task 7's pattern, with `mode: 'branch', branchName: 'existing-feature'` (copy the exact option shape from the existing `'creates PR for existing branch'` test).
- [ ] **Step 2:** Run, confirm red.
- [ ] **Step 3:** Same try/catch block after `loadConfig`; add `mainWorktreeRoot` to the call.
- [ ] **Step 4:** Run, confirm green.
- [ ] **Step 5: Commit** — `fix(newpr): anchor worktree path to main worktree root in --branch mode`.

---

### Task 9 — Wire `newpr.ts` `modeNewFeature`

Same shape, targeting `modeNewFeature` (~line 825; `config` ~line 828; call ~line 1138).

> **Do not conflate two call sites.** This function already has a _later, unrelated_ `git.getMainWorktreeRoot` call inside `setupWorktree` (~line 330) for the auto-link feature. Separate scope, untouched.

- [ ] **Step 1:** Failing test in the new-feature describe, Task 7 pattern.
- [ ] **Step 2:** Run, confirm red.
- [ ] **Step 3:** try/catch after `loadConfig`; add the 6th arg at ~line 1138.
- [ ] **Step 4:** Run, confirm green — and specifically re-check the existing auto-link tests (~lines 1265, 1338, 1361, 1400), which already override `git.getMainWorktreeRoot` and share the mock while exercising the other call site.
- [ ] **Step 5: Commit** — `fix(newpr): anchor worktree path to main worktree root in new-feature mode`.

---

### Task 10 — New `src/api/create.test.ts`; wire `setupPrWorktree`

No unit test file exists today for `src/api/create.ts` (its only caller, `src/mcp/server.ts`, mocks the whole module). This creates one, scoped to the anchoring wiring.

- [ ] **Step 1: Create the failing test** — `src/api/create.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
  getRepoName: vi.fn(),
  getMainWorktreeRoot: vi.fn(),
  fetch: vi.fn(),
  remoteBranchExists: vi.fn(),
  push: vi.fn(),
  addWorktree: vi.fn(),
  checkout: vi.fn(),
}));

vi.mock('../lib/github.js', () => ({
  isGhInstalled: vi.fn(),
  isAuthenticated: vi.fn(),
  getPr: vi.fn(),
  getPrByBranch: vi.fn(),
  createPr: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadConfig: vi.fn(),
  generateBranchName: vi.fn(),
  generateWorktreePath: vi.fn(),
}));

vi.mock('../lib/state-detection.js', () => ({
  analyzeGitState: vi.fn(),
  detectScenario: vi.fn(),
}));

vi.mock('../lib/newpr/index.js', () => ({
  getScenarioContext: vi.fn(),
  isExistingBranchAction: vi.fn(),
  executeStateAction: vi.fn(),
  getBranchPoint: vi.fn(),
  createActionDeps: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));

import * as fs from 'fs';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import { loadConfig, generateWorktreePath } from '../lib/config.js';
import { setupPrWorktree } from './create.js';
import type { ResolvedConfig } from '../lib/config.js';
import type { PrInfo } from '../lib/github.js';

const fakeConfig = {} as ResolvedConfig; // opaque here — generateWorktreePath is mocked

const makePrInfo = (overrides: Partial<PrInfo> = {}): PrInfo => ({
  number: 42,
  title: 'Test PR',
  state: 'OPEN',
  headBranch: 'feat/x',
  baseBranch: 'main',
  url: 'https://github.com/org/repo/pull/42',
  isDraft: false,
  ...overrides,
});

describe('setupPrWorktree', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(github.isGhInstalled).mockReturnValue(true);
    vi.mocked(github.isAuthenticated).mockReturnValue(true);
  });

  it('anchors the generated worktree path to the main worktree root', async () => {
    vi.mocked(git.getRepoRoot).mockReturnValue('/container/pr/pr1.other');
    vi.mocked(git.getRepoName).mockReturnValue('container');
    vi.mocked(git.getMainWorktreeRoot).mockReturnValue('/container');
    vi.mocked(loadConfig).mockReturnValue(fakeConfig);
    vi.mocked(github.getPr).mockReturnValue(makePrInfo());
    vi.mocked(generateWorktreePath).mockReturnValue('/container/pr/pr42.feature-x');
    vi.mocked(fs.existsSync).mockReturnValue(true); // short-circuits at WORKTREE_EXISTS

    const result = await setupPrWorktree({ prNumber: 42 });

    expect(generateWorktreePath).toHaveBeenCalledWith(
      fakeConfig,
      '/container/pr/pr1.other',
      'container',
      42,
      'feat/x',
      '/container'
    );
    expect(result.success).toBe(false);
  });

  it('falls back to repoRoot when the main worktree root cannot be determined', async () => {
    vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
    vi.mocked(git.getRepoName).mockReturnValue('repo');
    vi.mocked(git.getMainWorktreeRoot).mockImplementation(() => {
      throw new Error('not a git repo');
    });
    vi.mocked(loadConfig).mockReturnValue(fakeConfig);
    vi.mocked(github.getPr).mockReturnValue(makePrInfo());
    vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr42');
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await setupPrWorktree({ prNumber: 42 });

    expect(generateWorktreePath).toHaveBeenCalledWith(
      fakeConfig,
      '/repo',
      'repo',
      42,
      'feat/x',
      '/repo'
    );
  });
});
```

- [ ] **Step 2: Run and see both fail** (5-arg call today).

- [ ] **Step 3: Implement.** In `setupPrWorktree` (~line 111), after `const config = loadConfig(repoRoot);` (~line 136), add the same try/catch block, then pass `mainWorktreeRoot` as the 6th arg (~line 149).

- [ ] **Step 4: Run and see both pass.**
- [ ] **Step 5: Format and commit** — `fix(api): anchor setupPrWorktree's worktree path to main worktree root`.

---

### Task 11 — Wire `createPr`'s three call sites

`createPr` (~line 224) has one `repoRoot` (~line 251) feeding three `generateWorktreePath` calls (~354, ~410, ~536). One `mainWorktreeRoot` computation covers all three. The `existingPr` branch is cheapest to drive in a test (it returns directly).

- [ ] **Step 1: Failing test** — add a `describe('createPr', ...)` block to `src/api/create.test.ts` mocking the state-detection and newpr helpers, asserting the 6-arg call for the existing-PR branch.
- [ ] **Step 2: Run and confirm** the failure is specifically the missing 6th arg (adjust mock returns until that's the actual failure, not an unrelated mock gap).
- [ ] **Step 3: Implement.** After `const config = loadConfig(repoRoot);` (~line 257), add the try/catch block; append `mainWorktreeRoot` to all three calls.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Format and commit** — `fix(api): anchor createPr's worktree path to main worktree root`.

---

### Task 12 — Real bare-repository integration fixture

**Files:** `src/integration/worktree-layout.integration.test.ts` (new)

Empirically verified on this machine (scratch `git clone --bare` + `git worktree add`): `git rev-parse --git-common-dir` returns the **same** `.bare` path from both `main/` and a linked `pr/pr1.x` worktree — so `getMainWorktreeRoot()` was already stable; only `generateWorktreePath`'s anchor was wrong. This proves it end-to-end with real git.

- [ ] **Step 1: Create the file**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as git from '../lib/git.js';
import { getDefaultConfig, generateWorktreePath } from '../lib/config.js';

/**
 * Integration tests for worktree layout anchoring against a REAL bare-repository
 * container (.bare/ + main/ + pr/*), matching spec §5.
 */

function normalizePath(p: string): string {
  try {
    return path.normalize(fs.realpathSync.native(p)).toLowerCase();
  } catch {
    return path.normalize(p).toLowerCase();
  }
}

describe('worktree layout anchoring integration', () => {
  let tempDir: string;
  let container: string;
  let mainWorktree: string;
  let prWorktree: string;

  beforeAll(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'gwt-bare-layout-')));

    // Seed a normal repo with one commit, then clone it bare — the standard
    // way to set up a .bare/ + worktrees layout.
    const seed = path.join(tempDir, 'seed');
    fs.mkdirSync(seed);
    execSync('git init -q -b main', { cwd: seed });
    execSync('git config user.email test@test.com', { cwd: seed });
    execSync('git config user.name Test', { cwd: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), 'seed\n');
    execSync('git add README.md', { cwd: seed });
    execSync('git commit -q -m initial', { cwd: seed });

    container = path.join(tempDir, 'container');
    fs.mkdirSync(container);
    execSync(`git clone --bare -q "${seed}" "${path.join(container, '.bare')}"`);

    mainWorktree = path.join(container, 'main');
    execSync(`git worktree add -q "${mainWorktree}" main`, {
      cwd: path.join(container, '.bare'),
    });

    fs.mkdirSync(path.join(container, 'pr'));
    prWorktree = path.join(container, 'pr', 'pr1.existing-feature');
    execSync(`git worktree add -q -b feat/existing-feature "${prWorktree}" main`, {
      cwd: path.join(container, '.bare'),
    });
  });

  afterAll(() => {
    try {
      execSync('git worktree prune', { cwd: path.join(container, '.bare'), stdio: 'ignore' });
    } catch {
      // ignore
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('getMainWorktreeRoot resolves the container root from the main worktree', () => {
    expect(normalizePath(git.getMainWorktreeRoot(mainWorktree))).toBe(normalizePath(container));
  });

  it('getMainWorktreeRoot resolves the same container root from a linked pr worktree', () => {
    expect(normalizePath(git.getMainWorktreeRoot(prWorktree))).toBe(normalizePath(container));
  });

  it('places a new pr worktree under the container, invoked from main', () => {
    const config = {
      ...getDefaultConfig(),
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    };
    const result = generateWorktreePath(
      config,
      mainWorktree,
      'container',
      2600,
      'feat/new-feature',
      git.getMainWorktreeRoot(mainWorktree)
    );
    expect(normalizePath(result)).toBe(
      normalizePath(path.join(container, 'pr', 'pr2600.new-feature'))
    );
  });

  it('places the same path when invoked from a different linked worktree', () => {
    const config = {
      ...getDefaultConfig(),
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    };
    const result = generateWorktreePath(
      config,
      prWorktree, // a DIFFERENT worktree than the previous test
      'container',
      2600,
      'feat/new-feature',
      git.getMainWorktreeRoot(prWorktree)
    );
    expect(normalizePath(result)).toBe(
      normalizePath(path.join(container, 'pr', 'pr2600.new-feature'))
    );
  });

  it('documents the pre-fix bug: without mainWorktreeRoot the path moves with the invoking worktree', () => {
    const config = {
      ...getDefaultConfig(),
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    };
    const result = generateWorktreePath(config, prWorktree, 'container', 2600, 'feat/new-feature');
    expect(normalizePath(result)).toBe(
      normalizePath(path.join(prWorktree, 'pr', 'pr2600.new-feature'))
    );
    expect(result).not.toBe(path.join(container, 'pr', 'pr2600.new-feature'));
  });
});
```

- [ ] **Step 2: Run** — `pnpm test -- worktree-layout.integration.test.ts`. All 5 should pass, since Task 5 has already landed. (Running this _before_ Task 5 would fail tests 3-4 and pass test 5 — a useful sanity check of Task 5's necessity.)
- [ ] **Step 3: Format and commit** — `test(integration): real bare-repo container fixture for worktree layout anchoring`.

---

### Task 13 — `createRepoConfig()` in `global-config.ts`

**Files:** `src/lib/global-config.ts`, `src/lib/global-config.test.ts`
**Produces:** `createRepoConfig(repoRoot, config?): string`, consumed by Task 14.

- [ ] **Step 1: Failing tests.** Add `createRepoConfig` to the import list; after `describe('createLocalConfig', ...)`:

```ts
describe('createRepoConfig', () => {
  it('creates repo config file', () => {
    expect(fs.existsSync(createRepoConfig(repoDir))).toBe(true);
  });

  it('creates config with provided values', () => {
    const configPath = createRepoConfig(repoDir, {
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    });
    const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(content.worktreeParent).toBe('pr');
    expect(content.worktreePattern).toBe('pr{number}.{slug}');
  });

  it('includes $schema in created config', () => {
    const content = JSON.parse(fs.readFileSync(createRepoConfig(repoDir), 'utf8'));
    expect(content.$schema).toContain('unpkg.com');
  });

  it('creates .worktreerc, not .worktreerc.local', () => {
    expect(path.basename(createRepoConfig(repoDir))).toBe(CONFIG_FILE_NAMES[0]);
  });
});
```

- [ ] **Step 2: Run and see it fail** (not exported).

- [ ] **Step 3: Implement.** After `createLocalConfig` (~line 197):

```ts
/**
 * Create a repo-level config file (.worktreerc), intended to be committed so it
 * applies identically from every worktree.
 */
export function createRepoConfig(repoRoot: string, config: WorktreeConfig = {}): string {
  const configPath = path.join(repoRoot, CONFIG_FILE_NAMES[0]);

  const configWithSchema = {
    $schema: getSchemaUrl(),
    ...config,
  };

  fs.writeFileSync(configPath, JSON.stringify(configWithSchema, null, 2) + '\n', 'utf8');
  logger.debug(`Created repo config at ${configPath}`);

  return configPath;
}
```

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `feat(config): add createRepoConfig for committed repo-level config`.

---

### Task 14 — `wt init`: detect bare-container layout, offer scaffold

**Files:** `src/cli/wt/init.ts`, `src/cli/wt/init.unit.test.ts`

- [ ] **Step 1: Failing tests.** Extend the `git.js` mock with `isBareContainerLayout: vi.fn()` and the `global-config.js` mock with `createRepoConfig: vi.fn(() => '/repo/.worktreerc')`. Then add:

```ts
describe('handler - bare-container layout detection', () => {
  it('offers to scaffold repo config when a bare-container layout is detected', async () => {
    (git.getRepoRoot as Mock).mockReturnValue('/repo');
    (git.isBareContainerLayout as Mock).mockReturnValue(true);
    (prompts.promptChoice as Mock).mockResolvedValueOnce('bare-layout');

    await initCommand.handler(createArgv({ local: false, global: false, force: false }));

    expect(globalConfig.createRepoConfig).toHaveBeenCalledWith('/repo', {
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    });
  });

  it('does not offer the scaffold for a conventional repository', async () => {
    (git.getRepoRoot as Mock).mockReturnValue('/repo');
    (git.isBareContainerLayout as Mock).mockReturnValue(false);
    (prompts.promptChoice as Mock).mockResolvedValueOnce('cancel');

    await initCommand.handler(createArgv({ local: false, global: false, force: false }));

    const choices = (prompts.promptChoice as Mock).mock.calls[0][1] as Array<{ value: string }>;
    expect(choices.some((c) => c.value === 'bare-layout')).toBe(false);
  });

  it('does not offer the scaffold when a repo config already exists', async () => {
    (git.getRepoRoot as Mock).mockReturnValue('/repo');
    (git.isBareContainerLayout as Mock).mockReturnValue(true);
    (globalConfig.getConfigSummary as Mock).mockReturnValue({
      global: false,
      repo: true,
      local: false,
      paths: {
        global: {
          path: '/home/user/.config/git-worktree-tools/config.json',
          level: 'global',
          exists: false,
        },
        repo: { path: '/repo/.worktreerc', level: 'repo', exists: true },
        local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
      },
    });
    (prompts.promptChoice as Mock).mockResolvedValueOnce('cancel');

    await initCommand.handler(createArgv({ local: false, global: false, force: false }));

    const choices = (prompts.promptChoice as Mock).mock.calls[0][1] as Array<{ value: string }>;
    expect(choices.some((c) => c.value === 'bare-layout')).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement.** In `init.ts`: add `createRepoConfig` to the `global-config.js` import. In `handleInteractiveInit` (~line 104), after the status prints and before `const choices`:

```ts
const isBareContainer = repoRoot ? git.isBareContainerLayout(repoRoot) : false;
if (isBareContainer && !summary.repo) {
  console.log(
    colors.info(
      'Detected a bare-repository container layout (a .bare/ directory rather than .git).'
    )
  );
  console.log();
}
```

Inside the `if (repoRoot) { ... }` block, after the local-config choice push:

```ts
if (isBareContainer && !summary.repo) {
  choices.push({
    label: `Scaffold repo config for bare-container layout (.worktreerc, committed)`,
    value: 'bare-layout',
  });
}
```

In the `switch (action)` block, between `'local'` and `'gitignore'`:

```ts
    case 'bare-layout':
      if (repoRoot) {
        await createBareLayoutConfig(repoRoot);
      }
      break;
```

After `createLocalConfig` (~line 229):

```ts
/**
 * Scaffold a repo config (.worktreerc) for a bare-repository container layout,
 * matching the pattern such containers use: .bare/ + main/ + pr/pr<N>.<slug>.
 */
async function createBareLayoutConfig(repoRoot: string): Promise<void> {
  const configPath = createRepoConfig(repoRoot, {
    worktreeParent: 'pr',
    worktreePattern: 'pr{number}.{slug}',
  });

  console.log(colors.success(`✓ Created repo config: ${configPath}`));
  console.log();
  console.log(
    colors.dim(
      'Worktrees will be created under pr/pr<N>.<slug>, anchored to the main worktree root.'
    )
  );
  console.log(colors.dim('Commit this file so it applies identically from every worktree.'));
}
```

- [ ] **Step 4: Run and see all pass**, including every pre-existing test (the new choice is additive and gated on `isBareContainer`, which the mock defaults to `false`).
- [ ] **Step 5: Format and commit** — `feat(init): detect bare-container layout and offer to scaffold repo config`.

---

### Task 15 — Full-suite verification (no commit unless formatting stragglers)

- [ ] **Step 1:** `pnpm run build` — must succeed.
- [ ] **Step 2:** `pnpm test` — every new test passes, and the failing count is still exactly the 14/4-file baseline. If any baseline test _newly passes_, note it rather than silently accepting it.
- [ ] **Step 3:** `pnpm run lint` — clean on all touched files.
- [ ] **Step 4:** `pnpm exec prettier --check src/ schemas/` — no drift.

## Critical files

- `src/lib/config.ts` — the core anchor fix and the new config field
- `src/lib/git.ts` — existing `getMainWorktreeRoot` (reused) plus new `isBareContainerLayout`
- `src/cli/newpr.ts`, `src/api/create.ts` — the 5 call sites threading `mainWorktreeRoot`
- `src/integration/worktree-layout.integration.test.ts` — the real bare-repo proof §5 requires
- `src/cli/wt/init.ts`, `src/lib/global-config.ts` — the §5.4 scaffold flow
