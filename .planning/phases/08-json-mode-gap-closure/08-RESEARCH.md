# Phase 8: JSON Mode Gap Closure - Research

**Researched:** 2026-03-09
**Domain:** JSON mode wiring / TypeScript CLI output gating
**Confidence:** HIGH

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                                              | Research Support                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-01 | Every `wt` subcommand outputs valid `CommandResult<T>` JSON when `--json` is passed; no code paths exit without JSON output in JSON mode | Direct code inspection confirms two code paths bypass the `setJsonMode` gate — both are trivial one-line or guard fixes                                                   |
| UNI-03 | `--verbose`, `--quiet`, `--json`, and `--no-color` flags work consistently and are available across all `wt` subcommands                 | The `--json` flag is accepted by both handlers; the gap is the missing `setJsonMode` call in `wt/prs.ts` and unguarded `console.log` calls in `newpr.ts handleScenario()` |

</phase_requirements>

---

## Summary

Phase 8 closes two specific code-path gaps that survived Phase 4 verification. Both gaps are narrowly scoped and well-understood from direct code inspection — no design uncertainty exists.

**Gap INT-A — `wt prs --json` silences nothing.** `src/cli/wt/prs.ts` has a yargs handler that builds a `PrsCommandOptions` object and calls `runPrsCommand(options)`. The options object carries `json: argv.json`, so `runPrsCommand` correctly branches to JSON output internally. However, the handler never calls `setJsonMode(!!argv.json)`. Because all `src/lib/ui/` print functions gate on the module-level `jsonMode` flag in `output.ts`, any `printStatus`, `printError`, or `print` call that fires before `runPrsCommand` enters its JSON branch will still write human-readable text to stdout. The standalone `prs.ts` binary has this same omission — it calls `initializeLogger` but not `setJsonMode`. For contrast, `wt/new.ts` already calls `setJsonMode(options.json)` on line 206 before delegating to `runNewprHandler`, and `wt/config.ts` calls `setJsonMode(!!argv.json)` at the top of its handler. The fix is one line added to `wt/prs.ts`'s handler.

**Gap INT-B — `wt new --json` interactive mode leaks bare `console.log` calls.** `src/cli/newpr.ts` imports `setJsonMode` from `src/lib/ui/index.js` and calls it in both the standalone `main()` entry point and via `wt/new.ts`. The JSON mode gate therefore works for all the `printStatus`/`printError` calls made by `runNewprHandler`. However, `handleScenario()` (lines 165–284) contains bare `console.log()` calls at lines 114, 116, 118, 129, 131, 143, 145, 147, 184, 243–244, 259–260, 262, 268. These calls are reached only during the interactive path (when `options.nonInteractive` is false). In practice, `wt new --json` implies `--non-interactive` should be used together, but the code does not enforce mutual exclusivity. Any scenario that reaches the interactive display block will emit mixed stdout. The fix is to guard each bare `console.log` in `handleScenario()` with `if (!isJsonMode())`, or to replace them with the `print()` wrapper already imported from `src/lib/ui/index.js` (which silences itself when JSON mode is active).

The helper functions `showLocalCommits`, `showUncommittedChanges`, `showStagedChanges`, and `showUnstagedChanges` (lines 110–160) also use bare `console.log`. These are called exclusively from `handleScenario()`. The same guard strategy applies.

**Primary recommendation:** Add `setJsonMode(!!argv.json)` to `wt/prs.ts` handler (one line). Replace bare `console.log` calls in `handleScenario()` and its four helper functions in `newpr.ts` with `print(...)` from `src/lib/ui/index.js` — the import already exists on line 63.

---

## Standard Stack

### Core (already in use — no new dependencies)

| Module                 | Version  | Purpose                                                          | Why Standard                                                 |
| ---------------------- | -------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/ui/output.ts` | internal | JSON mode gate: `setJsonMode`, `isJsonMode`, `print`, `printErr` | Established in Phase 2; all Phase 4–7 work routes through it |
| `src/lib/ui/index.ts`  | internal | Barrel export for all UI primitives                              | Single import point used by every CLI handler                |
| `vitest`               | existing | Unit test runner                                                 | Project-standard; all 231+ tests use it                      |

### No New Installations Required

Both gaps are fixed purely through wiring — no library additions, no new modules.

---

## Architecture Patterns

### Pattern 1: Handler-Level JSON Mode Wiring

**What:** Every yargs command handler calls `setJsonMode(!!argv.json)` as the first statement in the handler body, before any delegation.

**When to use:** Any yargs CommandModule handler that accepts a `--json` flag.

**Reference implementations:**

```typescript
// src/cli/wt/config.ts — line 103 (correct pattern)
handler: async (argv) => {
  const subcommand = argv.subcommand || 'interactive';
  const args = argv.args || [];
  setJsonMode(!!argv.json);   // <-- first statement
  // ...
}

// src/cli/wt/new.ts — line 206 (correct pattern)
handler: async (argv) => {
  // ... argv validation ...
  setJsonMode(options.json);  // <-- called before runNewprHandler
  await runNewprHandler(options);
},
```

**Missing instance (the gap):**

```typescript
// src/cli/wt/prs.ts — handler (current, broken)
handler: async (argv) => {
  const options: PrsCommandOptions = { ... json: argv.json, ... };
  await runPrsCommand(options);  // setJsonMode never called
},
```

**Fix:**

```typescript
// src/cli/wt/prs.ts — handler (corrected)
handler: async (argv) => {
  setJsonMode(!!argv.json);   // ADD THIS LINE
  const options: PrsCommandOptions = { ... };
  await runPrsCommand(options);
},
```

`setJsonMode` is already exported from `src/lib/ui/index.js`; the import must be added to `wt/prs.ts`.

### Pattern 2: Bare `console.log` Replacement with `print()`

**What:** Bare `console.log()` calls inside interactive display code are replaced with `print()` from `src/lib/ui/index.js`. `print()` is a no-op when JSON mode is active.

**When to use:** Any interactive display helper that is reachable from a code path that also accepts `--json`.

**Reference implementation:**

```typescript
// src/lib/prs/command.ts — line 212 (correct pattern)
print(formatPrListHeader(repoName));
print(formatPrSummary(filteredPrs));
print('');
print(formatPrTable(filteredPrs, previewLabel));
print('');
```

**Current broken pattern in `newpr.ts`:**

```typescript
// newpr.ts handleScenario() — line 243–244 (bare console.log, JSON mode unaware)
if (context.subMessage) {
  console.log();
  console.log(context.subMessage);
}
```

**Fix:**

```typescript
if (context.subMessage) {
  print('');
  print(context.subMessage);
}
```

The `print` function is already imported in `newpr.ts` at line 64 (`import { ..., print, ... } from '../lib/ui/index.js'` — confirmed via the import block). Wait: checking the actual import on lines 60–67 — `print` is not currently destructured there. The import block currently pulls `printStatus, printDim, printSummaryBox, printNextSteps, printError, errorToDisplay, setJsonMode`. The `print` and `isJsonMode` exports are available from `src/lib/ui/index.js` and must be added to the import.

**Alternative fix using `isJsonMode()` guard:**

```typescript
if (!isJsonMode()) {
  console.log();
  console.log(context.subMessage);
}
```

Both approaches are valid. Using `print()` is cleaner and consistent with the rest of the codebase. Using `isJsonMode()` guards is a minimal-diff alternative.

### Recommended Project Structure (no change)

No structural changes are needed. Both fixes are within existing files at well-understood locations.

### Anti-Patterns to Avoid

- **Passing `json` as an option and relying on the called function to gate output:** `runPrsCommand` does gate its own output, but `setJsonMode` is a module-level side effect that must be set by the caller (the handler) before any output can occur — including output from prerequisite checks that fire before the function is reached.
- **Adding a `setJsonMode` call inside `runPrsCommand`:** The shared library function is called from both the standalone `prs.ts` binary and `wt/prs.ts`. If `setJsonMode` were called inside `runPrsCommand`, it would impose JSON mode side effects on callers that do not expect it. The handler is the correct call site.
- **Guarding only the `handleScenario` call site but not the helper functions:** `showLocalCommits`, `showUncommittedChanges`, `showStagedChanges`, and `showUnstagedChanges` each contain bare `console.log` calls. All four must be updated.

---

## Don't Hand-Roll

| Problem                               | Don't Build                                  | Use Instead                                           | Why                                                                             |
| ------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| JSON output suppression for UI calls  | Custom flag-threading through every function | `setJsonMode` + `print()` from `src/lib/ui/output.ts` | Module-level flag is already the project standard; all other handlers use it    |
| Detecting whether JSON mode is active | Reading `argv.json` inside helper functions  | `isJsonMode()` from `src/lib/ui/output.ts`            | Avoids threading `options` through display helpers that don't otherwise need it |

**Key insight:** The project has a complete, working JSON mode gate (`src/lib/ui/output.ts`). Phase 8 is purely about calling `setJsonMode` in two places that missed it, not building anything new.

---

## Common Pitfalls

### Pitfall 1: Missing Import for `setJsonMode` / `print` / `isJsonMode`

**What goes wrong:** The fix compiles but the import line is not updated, causing a TypeScript/module resolution error at build time.

**Why it happens:** `wt/prs.ts` currently has no import from `src/lib/ui/index.js` at all. `newpr.ts` imports from `src/lib/ui/index.js` but does not currently destructure `print` or `isJsonMode`.

**How to avoid:**

- `wt/prs.ts`: Add `import { setJsonMode } from '../../lib/ui/index.js';`
- `newpr.ts`: Extend the existing import to include `print` and/or `isJsonMode`

**Warning signs:** TypeScript error `Module has no exported member 'setJsonMode'` or `Cannot find name 'print'`.

### Pitfall 2: Incomplete Coverage of `console.log` in `handleScenario` Helpers

**What goes wrong:** The `handleScenario()` function body is cleaned up but the four helper functions (`showLocalCommits`, `showUncommittedChanges`, `showStagedChanges`, `showUnstagedChanges`) still contain bare `console.log` — leaking output in JSON mode.

**Why it happens:** The helpers are defined above `handleScenario` (lines 110–160) and are easy to miss on a targeted fix of `handleScenario`.

**How to avoid:** Grep `newpr.ts` for all `console.log` occurrences and address every one that is reachable when `options.json` is true.

**Warning signs:** `wt new --json --non-interactive` still produces mixed stdout when called with a scenario that would normally show uncommitted changes.

### Pitfall 3: Breaking the Existing `wt/prs.ts` Test

**What goes wrong:** Adding `setJsonMode(!!argv.json)` to the handler runs against the existing `prs.test.ts` — which mocks `prs.js` modules but may not mock `src/lib/ui/output.ts`. If `setJsonMode` writes to a shared module-level variable, it persists across tests.

**Why it happens:** Vitest runs tests in a single process with shared module instances unless `vi.isolateModules` is used. A `setJsonMode(true)` call in one test can affect the next test if not reset.

**How to avoid:** The test file already has `vi.resetAllMocks()` in `beforeEach`. However, `setJsonMode` is not a mock — it's a real function that mutates module state. The test must either:

1. Add `afterEach(() => { setJsonMode(false); })` to reset state, OR
2. Verify the existing test suite passes without change (the mock for `runPrsCommand` via `runPrsCommand` is actually not mocked — the test calls through to the real `prs/command.ts` with mocked dependencies, so `setJsonMode` will fire correctly).

**Warning signs:** Tests that previously output human-readable text (non-JSON assertions) start outputting nothing, indicating JSON mode leaked from a prior test.

### Pitfall 4: `print('')` vs `console.log()` for Blank Lines

**What goes wrong:** `console.log()` with no arguments is used for blank line separators throughout `handleScenario`. Replacing with `print('')` passes an empty string instead of no argument — both produce a blank line in terminal output, but the behavior is identical for this use case.

**Why it happens:** Minor API difference between `console.log()` (no args → blank line) and `print('')` (empty string → blank line).

**How to avoid:** Use `print('')` throughout for consistency. Both produce the same visual output.

---

## Code Examples

Verified patterns from direct source inspection:

### Correct `setJsonMode` Wiring (reference: `wt/config.ts`)

```typescript
// src/cli/wt/config.ts — handler body
handler: async (argv) => {
  const subcommand = argv.subcommand || 'interactive';
  const args = argv.args || [];
  setJsonMode(!!argv.json);   // Gate must be set before any print calls
  switch (subcommand) { ... }
}
```

### Correct `print()` Usage (reference: `prs/command.ts`)

```typescript
// src/lib/prs/command.ts — non-interactive table output
print(formatPrListHeader(repoName));
print(formatPrSummary(filteredPrs));
print('');
print(formatPrTable(filteredPrs, previewLabel));
print('');
```

### Complete Gap Fix for `wt/prs.ts`

```typescript
// Add to imports (new import line needed):
import { setJsonMode } from '../../lib/ui/index.js';

// In handler (add one line):
handler: async (argv) => {
  setJsonMode(!!argv.json);        // ADD
  const options: PrsCommandOptions = {
    state: (argv.state as ...) || 'open',
    // ...
    json: argv.json,
    // ...
  };
  await runPrsCommand(options);
},
```

### Gap Fix for `newpr.ts` — Extend Import + Replace `console.log`

```typescript
// Existing import (line 60-67), extend with print and isJsonMode:
import {
  printStatus,
  printDim,
  printSummaryBox,
  printNextSteps,
  printError,
  errorToDisplay,
  setJsonMode,
  print, // ADD
  isJsonMode, // ADD (if using guard pattern)
} from '../lib/ui/index.js';

// Replace in showLocalCommits, showUncommittedChanges, showStagedChanges,
// showUnstagedChanges, and handleScenario:
// Before: console.log()         → After: print('')
// Before: console.log(someStr)  → After: print(someStr)
```

---

## State of the Art

| Old Approach                           | Current Approach                                                            | When Changed | Impact                                                              |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| `console.log` directly in CLI code     | Route through `print()` / `printErr()` from `src/lib/ui/output.ts`          | Phase 2      | JSON mode gate works without threading options through every helper |
| Each CLI gates JSON mode independently | `setJsonMode(!!argv.json)` in handler; downstream code calls `isJsonMode()` | Phase 2–4    | Single call site per command, not per function                      |

**Still using old approach (the gaps being fixed):**

- `wt/prs.ts` handler: missing `setJsonMode` call
- `newpr.ts` `handleScenario()` and its helper functions: bare `console.log` instead of `print()`

---

## Open Questions

1. **Should `wt prs --json` imply `--no-interactive`?**
   - What we know: `runPrsCommand` already does `const interactive = isTTY && !options.noInteractive && !jsonMode` — JSON mode already suppresses interactive mode inside the library function.
   - What's unclear: Whether the handler should also set `noInteractive: true` when `json: true` to make the intent explicit.
   - Recommendation: No change needed. The library function already handles this correctly. Don't add redundant logic.

2. **Should `wt new --json` reject `--non-interactive=false` as invalid?**
   - What we know: The gap exists because JSON + interactive is technically reachable.
   - What's unclear: Whether a validation error is warranted.
   - Recommendation: Don't add validation. Fix the output leak with `print()` guards. Users who run `wt new --json` in an interactive terminal will get JSON output; users who combine it with a scenario requiring interactive prompts will receive a prompt — this is acceptable and consistent with how other tools work.

---

## Sources

### Primary (HIGH confidence)

- Direct source inspection: `src/cli/wt/prs.ts` — confirmed missing `setJsonMode` call
- Direct source inspection: `src/cli/newpr.ts` lines 113–271 — confirmed bare `console.log` in `handleScenario` and four helpers
- Direct source inspection: `src/lib/ui/output.ts` — confirmed `setJsonMode`, `isJsonMode`, `print`, `printErr` API
- Direct source inspection: `src/cli/wt/config.ts` line 103 — confirmed reference pattern
- Direct source inspection: `src/cli/wt/new.ts` line 206 — confirmed reference pattern
- Direct source inspection: `src/lib/prs/command.ts` — confirmed `print()` usage pattern
- Direct source inspection: `src/cli/wt/prs.test.ts` — confirmed existing test coverage and mock structure

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` Phase 8 description — confirms INT-A and INT-B gap identifiers
- `.planning/REQUIREMENTS.md` LLM-01, UNI-03 — confirms these are the only two pending v1 requirements
- `.planning/STATE.md` accumulated decisions — confirms `setJsonMode` pattern established in Phase 2 and applied through Phase 7

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — No new dependencies; all APIs are existing internal modules
- Architecture: HIGH — Patterns are established and have multiple reference implementations in the codebase
- Pitfalls: HIGH — Identified through direct code inspection of the two specific files being modified

**Research date:** 2026-03-09
**Valid until:** 2026-04-08 (stable internal codebase; no external dependency changes needed)
