# Phase 3: Interactive Menu Reliability - Research

**Researched:** 2026-02-18
**Domain:** CLI interactive menus, terminal raw mode, subprocess delegation, TUI reliability
**Confidence:** HIGH

## Summary

Phase 3 addresses four concrete bugs in the `wt` interactive menu system. The research reveals that all four issues are well-understood code-level problems with clear fixes, no external library research needed. The root cause of MENU-02 (menu silently exits) is that `runSubcommand()` calls `process.exit()`, which terminates the entire process instead of returning control to the menu loop. MENU-01 (wtlink actions invoke non-existent subcommands) is confirmed: the interactive menu sends `list`, `sync`, `add`, `remove` to wtlink, but wtlink only has `manage`, `link`, `validate`, `migrate`. MENU-03 (duplicate prs code path) is confirmed: `src/cli/wt/prs.ts` contains a local `runPrsCommand()` that lacks `refreshPrs` support, while `src/cli/prs.ts` has the complete implementation. MENU-04 (Ctrl+C terminal cleanup) has inconsistent patterns across modules: `lswt/interactive.ts` properly registers SIGINT handlers, while `prs/interactive.ts` calls `process.exit(0)` directly.

**Primary recommendation:** Fix MENU-02 first (runSubcommand exit behavior) because it is the fundamental architectural issue; MENU-01 and MENU-03 become moot once subcommands run in-process via Phase 5, but Phase 3 must bridge the gap by either (a) making runSubcommand return instead of exit, or (b) replacing specific menu actions with direct library calls. MENU-04 requires a defensive `process.on('exit')` handler pattern.

## Standard Stack

### Core

No new libraries needed. Phase 3 is entirely internal code fixes.

| Library               | Version  | Purpose                               | Why Standard                     |
| --------------------- | -------- | ------------------------------------- | -------------------------------- |
| Node.js readline      | built-in | Raw mode keypress handling            | Already used in `prompts.ts`     |
| Node.js child_process | built-in | `spawnSync` for subcommand delegation | Already used in `run-command.ts` |
| vitest                | ^2.1.9   | Unit/integration testing              | Already in devDependencies       |

### Supporting

| Library  | Version | Purpose         | When to Use                                |
| -------- | ------- | --------------- | ------------------------------------------ |
| node-pty | ^1.1.0  | PTY e2e testing | Already in devDependencies; e2e tests only |

### Alternatives Considered

| Instead of                       | Could Use                      | Tradeoff                                                              |
| -------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| Fix runSubcommand() to return    | Direct library calls (Phase 5) | Phase 5 is the correct long-term fix; Phase 3 needs a bridge solution |
| Manual SIGINT handler per module | Global terminal state guard    | Global guard is simpler but risks masking bugs                        |

## Architecture Patterns

### Current Architecture (Problem)

```
wt (interactive menu)
  └─ showMainMenu() loop
       └─ handleXxx() flow
            └─ runSubcommand('tool', args)    ← calls process.exit() → PROCESS DIES
```

The interactive menu spawns child processes via `runSubcommand()` which uses `spawnSync` + `process.exit()`. Every menu action terminates the entire `wt` process. The `FlowResult.returnToMenu` pattern exists in the code but is dead code — `runSubcommand` is typed as `never` and always exits before the return statement executes.

### Pattern 1: Make runSubcommand Non-Fatal for Interactive Context

**What:** Modify the interactive menu handlers to use `runSubcommandForResult()` (which already exists but returns instead of exiting) instead of `runSubcommand()`.

**When to use:** When the menu action should complete and return to the menu loop.

**Implementation approach:**

```typescript
// BEFORE (current - process exits):
async function handleListWorktrees(): Promise<FlowResult> {
  runSubcommand('lswt', []); // ← typed as never, calls process.exit()
  return COMPLETED_EXIT; // ← dead code
}

// AFTER (returns to menu):
async function handleListWorktrees(): Promise<FlowResult> {
  const result = runSubcommandForResult('lswt', []);
  if (result.status !== 0) {
    console.log(red(`Command exited with code ${result.status}`));
  }
  return { completed: true, returnToMenu: true }; // ← now reachable
}
```

**Source:** `src/cli/wt/run-command.ts` already exports `runSubcommandForResult()` which returns `SpawnSyncReturns<Buffer>` instead of calling `process.exit()`.

### Pattern 2: SIGINT Safety Net

**What:** Register a `process.on('exit')` handler that ensures raw mode is disabled and cursor is visible, regardless of how the process exits.

**When to use:** Any module that enables raw mode on stdin.

**Good pattern (from `lswt/interactive.ts`):**

```typescript
const handleSignal = () => {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
};
process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

const cleanup = () => {
  process.removeListener('SIGINT', handleSignal);
  process.removeListener('SIGTERM', handleSignal);
  process.stdin.setRawMode(false);
  process.stdin.removeListener('keypress', onKeypress);
  process.stdin.pause();
};
```

**Bad pattern (from `prs/interactive.ts`):**

```typescript
if (char === '\x03') {
  cleanup();
  process.exit(0); // ← OK for standalone, but no SIGINT handler registered
}
```

### Anti-Patterns to Avoid

- **Using `process.exit()` in library code called from a menu loop:** The caller loses control. Use exceptions or return values instead.
- **Relying on raw mode cleanup only in the happy path:** If an error throws between `setRawMode(true)` and the cleanup function, the terminal is corrupted. Always register a defensive exit handler.
- **Duplicating business logic across code paths:** The `wt/prs.ts` vs `cli/prs.ts` duplication is the textbook anti-pattern. One path gets fixes, the other doesn't.

## Don't Hand-Roll

| Problem                     | Don't Build                      | Use Instead                                              | Why                                           |
| --------------------------- | -------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| Terminal state restoration  | Custom signal handler per module | Centralized exit guard in `prompts.ts` or `wt.ts`        | Single point of control, impossible to forget |
| Non-PTY interactive testing | Real terminal simulation         | Mock `promptChoice`/`runSubcommand` as existing tests do | PTY tests are fragile and skip on CI          |

**Key insight:** The existing test pattern (mocking prompts + runSubcommand) is well-established with 100% of interactive-menu.test.ts using it. Non-PTY smoke tests should follow this pattern, not attempt to simulate actual keystrokes.

## Common Pitfalls

### Pitfall 1: runSubcommandForResult() Still Spawns a Child Process

**What goes wrong:** Even after switching to `runSubcommandForResult()`, each menu action spawns a new Node.js process. This is slow (~500ms per spawn) and doesn't share state (logger, config).
**Why it happens:** `runSubcommandForResult` is a convenience wrapper around `spawnSync`, not a fundamentally different architecture.
**How to avoid:** Accept this as a Phase 3 bridge. Phase 5 replaces subprocess delegation entirely. Document the tradeoff.
**Warning signs:** Users complain about slow menu transitions.

### Pitfall 2: spawnSync with stdio: 'inherit' Blocks the Event Loop

**What goes wrong:** `spawnSync` with `stdio: 'inherit'` blocks the parent Node.js process entirely. No event loop, no signal handling, no cleanup. If the child process hangs, the parent is stuck.
**Why it happens:** `spawnSync` is synchronous by design.
**How to avoid:** For Phase 3, this is acceptable. The child processes are short-lived CLI commands. Phase 5 eliminates this.
**Warning signs:** Menu hangs with no way to cancel.

### Pitfall 3: PTY Tests Skip Silently on CI

**What goes wrong:** The e2e tests in `src/e2e/wt/interactive-menu.e2e.test.ts` check for `node-pty` availability and skip on macOS/Windows CI. Changes to the menu could break interactive behavior but pass CI.
**Why it happens:** `node-pty` requires native compilation and is fragile in CI environments.
**How to avoid:** Every menu change MUST have a corresponding non-PTY unit test using the mock pattern. PTY tests are bonus coverage, not primary coverage.
**Warning signs:** A PR passes CI but breaks the actual interactive menu experience.

### Pitfall 4: Cursor Visibility After Raw Mode Crash

**What goes wrong:** If the process crashes while raw mode is enabled, the terminal cursor becomes invisible and echo is disabled. The user must type `reset` or `stty sane` to recover.
**Why it happens:** Raw mode disables terminal echo and line buffering. Node.js doesn't automatically restore these on crash.
**How to avoid:** Register `process.on('exit', () => { try { process.stdin.setRawMode?.(false); } catch {} })` at the top level. Also output `\x1b[?25h` (show cursor) in the exit handler.
**Warning signs:** Users report "invisible cursor" or "no echo" after Ctrl+C.

### Pitfall 5: wtlink 'list'/'sync'/'add'/'remove' Subcommands Don't Exist

**What goes wrong:** The interactive menu calls `runSubcommand('wtlink', ['list'])`, `runSubcommand('wtlink', ['sync'])`, etc. But `wtlink.ts` only has `manage`, `link`, `validate`, `migrate` commands. Yargs strict mode causes these to fail with "Unknown command: list".
**Why it happens:** The interactive menu was written with an assumed API that doesn't match the actual wtlink CLI.
**How to avoid:** Map menu actions to actual wtlink subcommands or to direct library function calls:

- `view` -> `wtlink manage --non-interactive` (show manifest) or direct `loadManifestData()`
- `sync` -> `wtlink link` (creates hard links)
- `add` -> direct `saveManifestData()` call (no CLI subcommand exists)
- `remove` -> direct `saveManifestData()` call (no CLI subcommand exists)
- `validate` -> `wtlink validate` (this one works)
  **Warning signs:** Silent failures when selecting link management options in the menu.

## Code Examples

### Example 1: Current runSubcommand (fatal)

```typescript
// Source: src/cli/wt/run-command.ts lines 22-34
export function runSubcommand(
  cliName: string,
  args: string[],
  envOverrides?: Record<string, string>
): never {
  const cliPath = path.resolve(__dirname, `../${cliName}.js`);
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...envOverrides },
  });
  process.exit(result.status ?? 1);
}
```

### Example 2: Existing non-fatal alternative

```typescript
// Source: src/cli/wt/run-command.ts lines 44-54
export function runSubcommandForResult(
  cliName: string,
  args: string[],
  envOverrides?: Record<string, string>
): SpawnSyncReturns<Buffer> {
  const cliPath = path.resolve(__dirname, `../${cliName}.js`);
  return spawnSync(process.execPath, [cliPath, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...envOverrides },
  });
}
```

### Example 3: Proper SIGINT handling pattern (from lswt/interactive.ts)

```typescript
// Source: src/lib/lswt/interactive.ts lines 463-481
const handleSignal = () => {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
};
process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

const cleanup = () => {
  process.removeListener('SIGINT', handleSignal);
  process.removeListener('SIGTERM', handleSignal);
  process.stdin.setRawMode(false);
  process.stdin.removeListener('keypress', onKeypress);
  process.stdin.pause();
};
```

### Example 4: Existing test pattern for interactive menu

```typescript
// Source: src/cli/wt/interactive-menu.test.ts lines 30-35
vi.mock('./run-command.js', () => ({
  runSubcommand: vi.fn(() => {
    throw new Error('process.exit called'); // simulates process.exit
  }),
}));
```

### Example 5: Duplicate prs code path (wt/prs.ts vs cli/prs.ts)

```typescript
// src/cli/wt/prs.ts line 203 - MISSING refreshPrs:
await runPrInteractiveMode(prs, repoName, previewLabel, filterState);

// src/cli/prs.ts lines 194-211 - HAS refreshPrs:
const interactiveDeps = createDefaultPrInteractiveDeps();
interactiveDeps.refreshPrs = async () => {
  /* ... */
};
await runPrInteractiveMode(prs, repoName, previewLabel, filterState, interactiveDeps);
```

## State of the Art

| Old Approach                 | Current Approach                     | When Changed   | Impact                                      |
| ---------------------------- | ------------------------------------ | -------------- | ------------------------------------------- |
| `runSubcommand()` everywhere | `runSubcommandForResult()` available | Already exists | Phase 3 can use without new code            |
| Per-module SIGINT handling   | No centralized approach yet          | N/A            | Phase 3 should add defensive global handler |

**Deprecated/outdated:**

- The `FlowResult.returnToMenu` pattern is dead code today because `runSubcommand` never returns. Phase 3 resurrects this pattern.

## Detailed Findings by Plan

### Plan 03-01: Audit runSubcommand() Calls

**All runSubcommand() calls in interactive-menu.ts (with line numbers):**

| Line | Handler                         | Subcommand | Args                 | Status                              |
| ---- | ------------------------------- | ---------- | -------------------- | ----------------------------------- |
| 189  | handleListWorktrees             | `lswt`     | `[]`                 | Exists (works but exits)            |
| 199  | handleBrowsePRs                 | `prs`      | `[]`                 | Exists (works but exits)            |
| 325  | handleNewPRFromDescription      | `newpr`    | `[desc, ...]`        | Exists (works but exits)            |
| 382  | handleNewPRFromExisting         | `newpr`    | `['--pr', N]`        | Exists (works but exits)            |
| 465  | handleNewPRFromBranch           | `newpr`    | `['--branch', name]` | Exists (works but exits)            |
| 528  | handleCleanPRs (clean-all)      | `cleanpr`  | `['--all']`          | Exists (works but exits)            |
| 544  | handleCleanPRs (clean-specific) | `cleanpr`  | `[N]`                | Exists (works but exits)            |
| 550  | handleCleanPRs (dry-run)        | `cleanpr`  | `['--dry-run']`      | Exists (works but exits)            |
| 620  | handleLinkConfig (view)         | `wtlink`   | `['list']`           | **BROKEN** - no `list` subcommand   |
| 624  | handleLinkConfig (sync)         | `wtlink`   | `['sync']`           | **BROKEN** - no `sync` subcommand   |
| 635  | handleLinkConfig (add)          | `wtlink`   | `['add', path]`      | **BROKEN** - no `add` subcommand    |
| 646  | handleLinkConfig (remove)       | `wtlink`   | `['remove', path]`   | **BROKEN** - no `remove` subcommand |
| 652  | handleLinkConfig (validate)     | `wtlink`   | `['validate']`       | Exists (works but exits)            |
| 675  | handleShowState                 | `wtstate`  | `[]`                 | Exists (works but exits)            |
| 722  | handleConfigure (view)          | `wtconfig` | `['show']`           | Exists (works but exits)            |
| 731  | handleConfigure (init)          | `wtconfig` | `['init']`           | Exists (works but exits)            |
| 762  | handleConfigure (edit)          | `wtconfig` | `['set', k, v]`      | Exists (works but exits)            |

**Summary:** 17 calls total. 4 are BROKEN (call non-existent wtlink subcommands). 13 work but exit the process instead of returning to menu.

**Confidence:** HIGH - Verified by reading source code directly.

### Plan 03-02: wt prs Duplicate Code Path

**Two files contain `runPrsCommand()`:**

1. **`src/cli/prs.ts`** (standalone entry point, lines 55-221)
   - Imports `createDefaultPrInteractiveDeps` from `lib/prs/interactive.js`
   - Creates `interactiveDeps` with `refreshPrs` callback
   - Passes deps to `runPrInteractiveMode()`
   - This is the **complete** implementation

2. **`src/cli/wt/prs.ts`** (yargs command module, lines 58-213)
   - Does NOT import `createDefaultPrInteractiveDeps`
   - Calls `runPrInteractiveMode()` WITHOUT deps
   - Missing `refreshPrs` callback
   - Has extra dead code: `@me` author comment on line 173-176
   - This is the **incomplete** copy

**Which path is used when:**

- `wt prs` (yargs route) -> `src/cli/wt/prs.ts` (incomplete) -> interactive mode lacks refresh
- Interactive menu "Browse PRs" -> `runSubcommand('prs', [])` -> spawns `src/cli/prs.ts` (complete) -> has refresh
- `prs` standalone command -> `src/cli/prs.ts` (complete) -> has refresh

**The fix:** Delete the duplicated `runPrsCommand()` from `src/cli/wt/prs.ts` and import from `src/cli/prs.ts` instead. Or better: extract the shared logic to `src/lib/prs/` and have both entry points call it.

**Confidence:** HIGH - Verified by reading both files and diffing the implementations.

### Plan 03-03: wtlink Subcommand References

**What the interactive menu calls vs what exists:**

| Menu Action               | Calls                  | wtlink Has             | Status |
| ------------------------- | ---------------------- | ---------------------- | ------ |
| View linked files         | `wtlink list`          | No `list` subcommand   | BROKEN |
| Sync links                | `wtlink sync`          | No `sync` subcommand   | BROKEN |
| Add file to manifest      | `wtlink add <path>`    | No `add` subcommand    | BROKEN |
| Remove file from manifest | `wtlink remove <path>` | No `remove` subcommand | BROKEN |
| Validate manifest         | `wtlink validate`      | `validate` subcommand  | Works  |

**wtlink actual subcommands:** `manage`, `link`, `validate`, `migrate`

**Mapping menu actions to actual functionality:**

| Menu Action               | Correct Implementation                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| View linked files         | Call `loadManifestData()` from `lib/wtlink/config-manifest.ts` directly, format and print |
| Sync links                | Call `wtlink link` (the `link` subcommand creates hard links from manifest)               |
| Add file to manifest      | Call `saveManifestData()` to add file to manifest's enabled list                          |
| Remove file from manifest | Call `saveManifestData()` to remove file from manifest                                    |

**Note:** Phase 5 will replace all `runSubcommand()` calls with direct library calls. Phase 3 can either:

- (a) Map menu actions to correct wtlink CLI subcommands where they exist
- (b) Call library functions directly for actions that have no CLI equivalent

Option (b) is recommended for `add`/`remove`/`view` because no CLI subcommand exists for these. Option (a) works for `sync` -> `link`.

**Confidence:** HIGH - Verified by reading `wtlink.ts` yargs command definitions.

### Plan 03-04: Ctrl+C / Escape Terminal Cleanup

**Raw mode usage audit across all interactive modules:**

| Module                          | Sets Raw Mode        | Has Cleanup         | Has SIGINT Handler          | Has Exit Guard |
| ------------------------------- | -------------------- | ------------------- | --------------------------- | -------------- |
| `lib/prompts.ts` (arrow keys)   | Yes (line 84, 261)   | Yes (line 116, 293) | Via keypress 'c'            | No             |
| `lib/prs/interactive.ts`        | Yes (line 287)       | Yes (line 290)      | `process.exit(0)` on Ctrl+C | No             |
| `lib/lswt/interactive.ts`       | Yes (line 460)       | Yes (line 474)      | Yes (line 471)              | No             |
| `lib/wtlink/manage-manifest.ts` | Yes (line 1205)      | Yes (line 1253)     | Via keypress handler        | No             |
| `lib/prs/details.ts`            | Likely (not checked) | Likely              | Unknown                     | No             |

**Key findings:**

1. **`prs/interactive.ts`** calls `process.exit(0)` on Ctrl+C (line 302). This is fine for standalone `prs` command but would prevent menu return if called in-process.

2. **`prompts.ts`** cleanup function properly restores raw mode (lines 116-119, 293-296). Ctrl+C handling throws `Error('User cancelled')` which is caught by all menu handlers.

3. **No module registers a `process.on('exit')` safety net.** If an unhandled exception occurs while raw mode is active, the terminal is corrupted.

4. **The `lswt/interactive.ts` pattern is the gold standard** in this codebase: registers SIGINT/SIGTERM handlers, removes them in cleanup, and restores terminal state.

**Recommended fix:**

- Add a global `process.on('exit')` handler in `wt.ts` that restores terminal state
- Add SIGINT handlers to `prs/interactive.ts` following the `lswt/interactive.ts` pattern
- Replace `process.exit(0)` in `prs/interactive.ts` Ctrl+C handler with cleanup + resolve (same as lswt)

**Cursor visibility:** No module outputs `\x1b[?25h` (show cursor) on exit. If a spinner or rendering hides the cursor, it stays hidden on crash. The exit handler should include cursor restoration.

**Confidence:** HIGH - Verified by reading all raw mode usage in source.

## Open Questions

1. **Should Phase 3 use `runSubcommandForResult()` or direct library calls?**
   - What we know: `runSubcommandForResult()` already exists and returns instead of exiting. Direct library calls are Phase 5's job.
   - What's unclear: Whether using `runSubcommandForResult()` creates a weird UX where the child process output appears inline but the menu continues below it.
   - Recommendation: Use `runSubcommandForResult()` for subcommands that produce output and then return (lswt, cleanpr, wtstate, wtconfig). Use direct library calls for wtlink actions that have no CLI equivalent (view, add, remove).

2. **Should the prs duplicate be removed or unified?**
   - What we know: `src/cli/wt/prs.ts` contains an incomplete copy of `runPrsCommand()`.
   - What's unclear: Whether `wt/prs.ts` should import from `cli/prs.ts` (creating a dependency between cli modules) or whether the logic should move to `lib/prs/`.
   - Recommendation: Extract `runPrsCommand()` to `lib/prs/command.ts` and have both entry points import it. This follows the existing pattern where `lib/` contains business logic and `cli/` is just CLI wiring.

3. **How should the interactive menu handle errors from child processes?**
   - What we know: `runSubcommandForResult()` returns the exit code.
   - What's unclear: Whether to show an error message, show the child's stderr, or just return to menu silently.
   - Recommendation: If exit code is non-zero, show a brief message like "Command failed (exit code N)" and return to menu. The child process output (via `stdio: 'inherit'`) is already visible.

## Sources

### Primary (HIGH confidence)

- `src/cli/wt/interactive-menu.ts` - All runSubcommand calls audited (lines 189-762)
- `src/cli/wt/run-command.ts` - runSubcommand and runSubcommandForResult implementations
- `src/cli/prs.ts` - Complete runPrsCommand with refreshPrs
- `src/cli/wt/prs.ts` - Incomplete duplicate runPrsCommand
- `src/cli/wtlink.ts` - Actual yargs command definitions (manage, link, validate, migrate only)
- `src/lib/prompts.ts` - Raw mode handling and cleanup patterns
- `src/lib/prs/interactive.ts` - PR browser raw mode and Ctrl+C handling
- `src/lib/lswt/interactive.ts` - SIGINT handler gold standard
- `src/lib/wtlink/config-manifest.ts` - loadManifestData/saveManifestData API
- `src/cli/wt/interactive-menu.test.ts` - Existing mock-based test patterns
- `src/e2e/wt/interactive-menu.e2e.test.ts` - PTY-based e2e test patterns

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` - Phase dependencies and success criteria
- `.planning/STATE.md` - Prior decisions constraining Phase 3 approach

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - No new libraries; all fixes use existing Node.js APIs
- Architecture: HIGH - All patterns verified by reading source code; two alternatives mapped
- Pitfalls: HIGH - All identified from actual code reading, not speculation

**Research date:** 2026-02-18
**Valid until:** Indefinite (internal codebase findings, not external dependency research)
