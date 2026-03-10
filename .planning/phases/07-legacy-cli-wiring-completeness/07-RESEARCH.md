# Phase 7: Integration Gap Closure - Research

**Researched:** 2026-03-09
**Domain:** CLI wiring consistency -- logger initialization, deprecation notices, and UI primitive migration for legacy CLIs
**Confidence:** HIGH

## Summary

Phase 7 closes all 7 integration gaps identified in the v1.0 milestone audit. The 3 medium gaps (INT-01 through INT-03) wire `initializeLogger()` and `printDeprecationNotice()` into the 3 legacy CLIs that lack them (`wtstate`, `wtconfig`, `prs`). The 4 low gaps (INT-04 through INT-07) migrate raw `console.error(colors.error(...))` calls to UI primitives (`printError`, `printStatus`, etc.) in `wtstate.ts`, `wtconfig.ts`, `prs/command.ts`, and add the missing `setJsonMode()` call in `wt/config.ts`.

All the building blocks already exist in the codebase. `initializeLogger()` is well-tested and used in `newpr`, `cleanpr`, `lswt`, and `wtlink`. `printDeprecationNotice()` is already called in `wtstate` and `wtconfig` but missing from `prs`. The UI primitives (`printError`, `printStatus`, `printDim`, `printErr`, `print`) are production-proven across all 4 wired CLIs. This phase is pure pattern replication -- no new libraries, no architectural changes, no new modules needed.

The main complexity is `wtconfig.ts` (1369 lines, ~116 raw console calls), which includes a full setup wizard with decorative output (box-drawing borders, environment detection display, step banners). Most calls map directly to existing UI primitives, but a few patterns (wizard step headers, validation warning output) may benefit from a thin UI helper or direct use of `printErr` + `colors.warning`.

**Primary recommendation:** Replicate the exact logger/deprecation/UI patterns from `lswt.ts` (manual arg parsing) for `wtstate` and `wtconfig`, and from `wtlink.ts` (yargs middleware) for `prs`. No new abstractions needed.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- All 3 CLIs get full `--verbose`/`--quiet` flag support matching the pattern in newpr, cleanpr, lswt, wtlink
- `wtstate.ts` and `wtconfig.ts`: manual `args.includes('--verbose')` / `args.includes('--quiet')` parsing (they don't use yargs)
- `prs.ts`: add `--verbose` and `--quiet` as yargs options (it already uses yargs)
- All 3 call `initializeLogger({ verbose, quiet, json, commandName })` with parsed flags
- `--no-color` also wired into all 3 CLIs: manual `args.includes('--no-color')` for wtstate/wtconfig, yargs option for prs, sets `process.env.NO_COLOR = '1'`
- `prs.ts` gets `printDeprecationNotice('prs', 'wt prs')` matching all other legacy CLIs
- Scope covers all 7 audit gaps: INT-01 through INT-07
- wtconfig UI migration is full depth: all 50+ raw console calls replaced with UI primitives
- New UI helpers may be needed if existing primitives don't cover all patterns (e.g., wizard step banners, config value formatting)

### Claude's Discretion

- Exact UI primitive mappings for wtconfig's decorative output (wizard banners, config value display)
- Whether to create new UI helpers or adapt existing ones for wtconfig patterns
- Testing approach for the new wiring (unit tests for initializeLogger/deprecation calls)
- Plan count and task decomposition

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                             | Research Support                                                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LOG-01 | User can control all debug output via `GWT_LOG_LEVEL` -- shared logger wired into all 4 legacy CLI entry points         | `initializeLogger()` already handles GWT_LOG_LEVEL. Phase wires it into the 3 missing CLIs (wtstate, wtconfig, prs). Exact invocation pattern documented in Architecture Patterns section. |
| LOG-04 | All `wt` subcommands respect `--verbose` and `--quiet` flags consistently                                               | Flag parsing patterns documented for both manual (args.includes) and yargs approaches. See Code Examples section for exact implementations.                                                |
| UNI-01 | `newpr`, `cleanpr`, `lswt`, `wtlink` binaries delegate to corresponding `wt` subcommands and print a deprecation notice | `prs.ts` is the only legacy CLI missing `printDeprecationNotice()`. Pattern is single-line call, documented in Code Examples.                                                              |

</phase_requirements>

## Standard Stack

### Core

| Library                 | Version           | Purpose                                   | Why Standard                                                                 |
| ----------------------- | ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| consola (via logger.ts) | Already installed | Logger singleton with reporters           | Already wired into 4 CLIs; phase extends to remaining 3                      |
| src/lib/ui/\*           | N/A (internal)    | JSON-mode-aware output primitives         | printError, printStatus, printDim, print, printErr -- used in all wired CLIs |
| src/lib/deprecation.ts  | N/A (internal)    | Deprecation notice utility                | Already used in 5 of 6 legacy CLIs; extends to prs                           |
| src/lib/logger.ts       | N/A (internal)    | initializeLogger + audit session tracking | Already used in 4 of 6 legacy CLIs; extends to 3                             |

### Supporting

| Library              | Version           | Purpose                               | When to Use                                                     |
| -------------------- | ----------------- | ------------------------------------- | --------------------------------------------------------------- |
| yargs                | Already installed | CLI option parsing in prs.ts          | Add --verbose/--quiet/--no-color options to prs.ts yargs config |
| src/lib/colors.ts    | N/A (internal)    | setColorEnabled(false) for --no-color | Called after initializeLogger when noColor is true              |
| src/lib/ui/output.ts | N/A (internal)    | setJsonMode(true) for --json          | Called in wt/config.ts handler to gate decorative output        |

### Alternatives Considered

None -- this is pure pattern replication using existing infrastructure.

**Installation:**

```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure

No structural changes. Files modified in place:

```
src/
  cli/
    wtstate.ts          # INT-01: add initializeLogger + flag parsing; INT-04: console.error -> printError
    wtconfig.ts         # INT-02: add initializeLogger + flag parsing; INT-05: 50+ console -> UI primitives
    prs.ts              # INT-03: add initializeLogger + flag parsing + printDeprecationNotice
    wt/
      config.ts         # INT-06: add setJsonMode() call in handler
  lib/
    prs/
      command.ts        # INT-07: console.error(colors.error) -> printError
    ui/
      output.ts         # Existing -- no changes
      status.ts         # Existing -- no changes
      error.ts          # Existing -- no changes
```

### Pattern 1: Manual Flag Parsing (wtstate, wtconfig)

**What:** Parse --verbose/--quiet/--no-color from process.argv without yargs
**When to use:** CLIs that use custom parseArgs(), not yargs
**Example:**

```typescript
// Source: src/cli/lswt.ts lines 68-79 (verified in codebase)
// This is the exact pattern from lswt.ts -- replicate for wtstate/wtconfig

import { initializeLogger } from '../lib/logger.js';
import { setColorEnabled } from '../lib/colors.js';
import { setJsonMode } from '../lib/ui/index.js';

// Parse flags manually from process.argv
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const quiet = args.includes('--quiet');
const noColor = args.includes('--no-color');
const json = args.includes('--json');

// Initialize logger early in main()
initializeLogger({
  verbose,
  quiet,
  noColor,
  json,
  commandName: 'wtstate', // or 'wtconfig'
});
setJsonMode(json);
if (noColor) {
  setColorEnabled(false);
}
```

### Pattern 2: Yargs Middleware (prs)

**What:** Add --verbose/--quiet/--no-color as yargs options with middleware initialization
**When to use:** CLIs that already use yargs for option parsing
**Example:**

```typescript
// Source: src/cli/wtlink.ts lines 96-127 (verified in codebase)
// This is the exact pattern from wtlink.ts -- replicate for prs.ts

yargs(hideBin(process.argv))
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Enable verbose debug output',
    default: false,
  })
  .option('quiet', {
    type: 'boolean',
    description: 'Suppress all output except errors',
    default: false,
  })
  .option('no-color', {
    type: 'boolean',
    description: 'Disable colored output',
    default: false,
  });
// ... then in handler or middleware:
initializeLogger({
  verbose: argv.verbose,
  quiet: argv.quiet,
  noColor: argv['no-color'] || argv.noColor,
  json: argv.json,
  commandName: 'prs',
});
```

### Pattern 3: Deprecation Notice

**What:** Single-line call to printDeprecationNotice before any other logic
**When to use:** Every legacy CLI entry point
**Example:**

```typescript
// Source: src/cli/wtlink.ts line 79 (verified in codebase)
// prs.ts is the ONLY legacy CLI missing this call

import { printDeprecationNotice } from '../lib/deprecation.js';

async function main(): Promise<void> {
  printDeprecationNotice('prs', 'wt prs');
  // ... rest of main
}
```

### Pattern 4: UI Primitive Migration (console.error -> printError)

**What:** Replace raw console.error(colors.error(...)) with structured printError()
**When to use:** All error output in legacy CLIs
**Example:**

```typescript
// BEFORE (raw console):
console.error(colors.error('Not in a git repository.'));

// AFTER (UI primitive):
printError({ title: 'Not in a git repository.' });

// BEFORE (with hint):
console.error(colors.error('GitHub CLI (gh) is not installed'));
console.error(colors.dim('Install it from: https://cli.github.com/'));

// AFTER (with hint):
printError({
  title: 'GitHub CLI (gh) is not installed',
  hint: 'Install it from: https://cli.github.com/',
});
```

### Pattern 5: UI Primitive Migration (console.log -> printStatus/printDim/print)

**What:** Replace console.log(colors.success/info/warning/dim(...)) with UI functions
**When to use:** All non-JSON informational output in legacy CLIs
**Example:**

```typescript
// BEFORE:
console.log(colors.success('Configuration is valid.'));
// AFTER:
printStatus('success', 'Configuration is valid.');

// BEFORE:
console.log(colors.dim('No configuration file found. Using defaults.'));
// AFTER:
printDim('No configuration file found. Using defaults.');

// BEFORE:
console.log(colors.info('Current Configuration'));
// AFTER:
printStatus('info', 'Current Configuration');

// BEFORE (plain output that should respect JSON mode):
console.log(mergedDisplay);
// AFTER:
print(mergedDisplay);

// BEFORE (wizard step header):
console.log(colors.info('Step 1/4: Base Configuration'));
// AFTER:
printStatus('info', 'Step 1/4: Base Configuration');
```

### Pattern 6: setJsonMode for wt/config.ts (INT-06)

**What:** Gate decorative UI output when --json flag is passed
**When to use:** wt/config.ts handler that currently lacks setJsonMode
**Example:**

```typescript
// Source: pattern from src/cli/lswt.ts line 76 (verified in codebase)
import { setJsonMode } from '../../lib/ui/index.js';

// In the handler, early:
handler: async (argv) => {
  setJsonMode(!!argv.json);
  // ... rest of handler
};
```

### Anti-Patterns to Avoid

- **Adding initializeLogger inside the catch block:** Logger must be initialized before the try/catch, not inside error handlers. It sets up audit session tracking that needs to be active for the entire command lifecycle.
- **Calling setColorEnabled without checking noColor first:** Only call `setColorEnabled(false)` when `--no-color` is explicitly passed, not unconditionally.
- **Importing logger but not calling initializeLogger:** The logger starts with empty reporters. Without initializeLogger, log calls go nowhere. Every import must be paired with an init call.
- **Placing deprecation after logger init:** In current codebase pattern, `printDeprecationNotice` is called before `initializeLogger` in wtstate/wtconfig (it uses process.stderr.write directly, not the logger). For prs, either order works since deprecation also uses process.stderr.write. The established convention is deprecation first.
- **Mixing print() and console.log() in the same file:** After migration, a file should exclusively use UI primitives for decorative output. JSON-formatted output (console.log of formatJsonResult) is the one exception -- it goes to stdout directly because it IS the structured output, not decorative.

## Don't Hand-Roll

| Problem                  | Don't Build                         | Use Instead                                                      | Why                                                                            |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Logger initialization    | Custom flag-to-level mapping        | `initializeLogger()`                                             | Handles GWT_LOG_LEVEL, DEBUG=newpr compat, audit session, reporter setup       |
| Deprecation notices      | Custom stderr warning text          | `printDeprecationNotice()`                                       | Handles --json suppression, GWT_NO_DEPRECATION_WARNINGS, consistent formatting |
| Error display            | `console.error(colors.error(msg))`  | `printError({ title, detail, hint })`                            | JSON-mode gating, consistent format, severity semantics                        |
| Status messages          | `console.log(colors.success(msg))`  | `printStatus('success', msg)`                                    | JSON-mode gating, icon consistency                                             |
| Dim/secondary text       | `console.log(colors.dim(msg))`      | `printDim(msg)`                                                  | JSON-mode gating                                                               |
| General printed output   | `console.log(text)`                 | `print(text)`                                                    | JSON-mode gating -- silenced when --json active                                |
| Warning output to stderr | `console.warn(colors.warning(msg))` | `printErr(colors.warning(msg))` or `printStatus('warning', msg)` | JSON-mode gating                                                               |

**Key insight:** All UI output must go through the `print()`/`printErr()` gate (via UI primitives) so that `setJsonMode(true)` can silence decorative output. Raw `console.log`/`console.error` bypasses this gate and would corrupt JSON output.

## Common Pitfalls

### Pitfall 1: Forgetting setJsonMode in wt/config.ts

**What goes wrong:** `wt config show --json` outputs both JSON and decorative text because `setJsonMode()` was never called, so all `print()` calls pass through.
**Why it happens:** `wt/config.ts` was added in Phase 5 and the `setJsonMode()` call was missed.
**How to avoid:** Add `setJsonMode(!!argv.json)` at the top of the handler function.
**Warning signs:** Running `wt config show --json | jq .` fails because extra text is mixed in.

### Pitfall 2: Missing --no-color Environment Variable Set

**What goes wrong:** The `--no-color` flag is parsed but `process.env.NO_COLOR` is not set, so child processes and other color-checking code still use colors.
**Why it happens:** `setColorEnabled(false)` only affects the internal `colors.ts` module. External tools check `NO_COLOR` env var.
**How to avoid:** For consistency with the CONTEXT.md decision, set `process.env.NO_COLOR = '1'` when `--no-color` is passed.
**Warning signs:** Colors still appear in child process output when --no-color is passed.

### Pitfall 3: initializeLogger After printDeprecationNotice

**What goes wrong:** Audit session doesn't capture full command lifecycle because logger was initialized late.
**Why it happens:** Natural temptation to put both calls adjacent, but deprecation notice goes first (uses raw stderr), then logger init.
**How to avoid:** Follow established pattern: `printDeprecationNotice()` first, then early arg parsing, then `initializeLogger()`.
**Warning signs:** Audit log entries show shorter durations than expected.

### Pitfall 4: wtconfig Console Call Count Underestimate

**What goes wrong:** Migration is "done" but ~20 console calls remain because the wizard helper functions were overlooked.
**Why it happens:** `wtconfig.ts` is 1369 lines with ~116 console calls spread across 15+ functions including deeply nested wizard steps.
**How to avoid:** Use grep to find ALL console.log/error/warn calls. Migrate systematically function-by-function. Leave `console.log(formatJsonResult(...))` calls intact (they are the JSON output, not decorative).
**Warning signs:** Running `wtconfig show --json | jq .` fails because unmigrated console.log calls leak through.

### Pitfall 5: prs.ts isMain Guard Complexity

**What goes wrong:** Adding imports/code at module level in prs.ts triggers side effects when the file is imported (not executed).
**Why it happens:** prs.ts has a complex `isMain` guard (lines 107-108) and re-exports (line 19). Module-level code runs on import.
**How to avoid:** All new code (deprecation notice, logger init) goes inside `main()`, not at module level. The yargs options go inside the `yargs(...)` builder chain, also in `main()`.
**Warning signs:** Tests fail because importing prs.ts triggers deprecation notice output.

### Pitfall 6: console.log for JSON Output Should NOT Be Migrated

**What goes wrong:** Migrating `console.log(formatJsonResult(...))` to `print(formatJsonResult(...))` causes JSON output to be silenced by setJsonMode.
**Why it happens:** All console.log calls look the same, easy to migrate too aggressively.
**How to avoid:** JSON output (`formatJsonResult`, `JSON.stringify`) must stay as raw `console.log` -- it IS the structured output. Only decorative/informational output gets migrated to `print()`/`printStatus()`/etc.
**Warning signs:** `--json` flag produces no output at all.

## Code Examples

### wtstate.ts Logger Wiring (INT-01)

```typescript
// Source: Adapted from src/cli/lswt.ts lines 68-79

// Add to imports:
import { initializeLogger } from '../lib/logger.js';
import { setColorEnabled } from '../lib/colors.js';

// At start of main(), after printDeprecationNotice:
async function main(): Promise<void> {
  printDeprecationNotice('wtstate', 'wt state');

  // Parse logger flags
  const rawArgs = process.argv.slice(2);
  const verbose = rawArgs.includes('--verbose');
  const quiet = rawArgs.includes('--quiet');
  const noColor = rawArgs.includes('--no-color');
  const jsonFlag = rawArgs.includes('--json');

  initializeLogger({
    verbose,
    quiet,
    noColor,
    json: jsonFlag,
    commandName: 'wtstate',
  });
  if (noColor) {
    process.env.NO_COLOR = '1';
    setColorEnabled(false);
  }

  const result = parseArgs(process.argv.slice(2));
  // ... rest unchanged
}
```

### prs.ts Logger + Deprecation Wiring (INT-03)

```typescript
// Source: Adapted from src/cli/wtlink.ts lines 79-127

import { printDeprecationNotice } from '../lib/deprecation.js';
import { initializeLogger } from '../lib/logger.js';
import { setColorEnabled } from '../lib/colors.js';

async function main(): Promise<void> {
  // Deprecation notice first (new for prs.ts)
  printDeprecationNotice('prs', 'wt prs');

  const argv = await yargs(hideBin(process.argv))
    .scriptName('prs')
    // ... existing options ...
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Enable verbose debug output',
      default: false,
    })
    .option('quiet', {
      type: 'boolean',
      description: 'Suppress all output except errors',
      default: false,
    })
    .option('no-color', {
      type: 'boolean',
      description: 'Disable colored output',
      default: false,
    })
    .help()
    .alias('h', 'help')
    .parse();

  // Initialize logger after argv parsing
  const noColor = argv['no-color'] || argv.noColor;
  initializeLogger({
    verbose: argv.verbose,
    quiet: argv.quiet,
    noColor: noColor as boolean,
    json: argv.json,
    commandName: 'prs',
  });
  if (noColor) {
    process.env.NO_COLOR = '1';
    setColorEnabled(false);
  }

  // ... rest of main unchanged
}
```

### prs/command.ts Error Migration (INT-07)

```typescript
// Source: UI patterns from src/cli/lswt.ts

// Replace:
console.error(colors.error('Not in a git repository'));
console.error(colors.dim('Please run this command from within a git repository.'));

// With:
printError({
  title: 'Not in a git repository',
  hint: 'Please run this command from within a git repository.',
});
```

### wt/config.ts setJsonMode Fix (INT-06)

```typescript
// Source: Pattern from src/cli/lswt.ts line 76

import { setJsonMode } from '../../lib/ui/index.js';

// In handler, at the top:
handler: async (argv) => {
  const subcommand = argv.subcommand || 'interactive';
  const args = argv.args || [];
  setJsonMode(!!argv.json); // <-- ADD THIS LINE
  // ... rest of switch statement
};
```

### wtconfig.ts Wizard Banner Migration (INT-05)

```typescript
// BEFORE (raw box drawing):
console.log();
console.log(colors.info('|' + '-'.repeat(56) + '|'));
console.log(colors.info('|') + '  text  ' + colors.info('|'));
console.log(colors.info('|' + '-'.repeat(56) + '|'));
console.log();

// AFTER (using printHeader for simple headers, print for decorative):
print('');
print(colors.info('|' + '-'.repeat(56) + '|'));
print(colors.info('|') + '  text  ' + colors.info('|'));
print(colors.info('|' + '-'.repeat(56) + '|'));
print('');

// Note: The wizard box drawing uses box-drawing chars that don't map
// to printSummaryBox (which uses different chars). Use print() directly
// to preserve the visual, while gaining JSON-mode gating.
```

### Validation Warning Migration

```typescript
// BEFORE:
console.warn(colors.warning(`Warning: ${warning.path}: ${warning.message}`));

// AFTER (using printErr to route to stderr with JSON-mode gating):
import { printErr } from '../lib/ui/index.js';
printErr(colors.warning(`Warning: ${warning.path}: ${warning.message}`));
```

## State of the Art

| Old Approach                         | Current Approach                    | When Changed | Impact                                      |
| ------------------------------------ | ----------------------------------- | ------------ | ------------------------------------------- |
| Raw console.error(colors.error(...)) | printError({ title, detail, hint }) | Phase 2      | JSON-mode gating, consistent format         |
| Per-CLI debug flag handling          | initializeLogger() singleton        | Phase 1      | Audit log, GWT_LOG_LEVEL, --verbose/--quiet |
| No deprecation warnings              | printDeprecationNotice()            | Phase 5      | User sees migration path to `wt`            |
| No JSON-mode output gating           | setJsonMode() + print()/printErr()  | Phase 2      | Clean JSON output without decorative text   |

**Note:** All "current approaches" are already implemented and proven in 4+ CLIs. This phase extends them to the 3 remaining CLIs.

## Open Questions

1. **wtconfig.ts wizard output: print() vs printSummaryBox()?**
   - What we know: The wizard uses custom box-drawing characters (Unicode `\u250C`/`\u2500`/etc.) that differ from `printSummaryBox`'s double-line chars (`\u2550`). The wizard also has 4 numbered step headers.
   - What's unclear: Whether to preserve the exact visual appearance (use `print()` wrapping existing formatting) or normalize to match `printSummaryBox` style.
   - Recommendation: Use `print()` to preserve existing visual appearance. The goal is JSON-mode gating, not visual redesign. `printStatus('info', 'Step 1/4: Base Configuration')` for step headers; `print()` for the decorative box.

2. **console.warn for validation warnings -- printErr or printStatus?**
   - What we know: Only 2 places use `console.warn`: `wtconfig.ts` line 357 and `wt/config.ts` line 299. Both output validation warnings.
   - What's unclear: Whether `printErr(colors.warning(...))` or `printStatus('warning', msg)` is more appropriate for validation warnings.
   - Recommendation: Use `printErr(colors.warning(...))` because: (a) validation warnings should go to stderr (not stdout), (b) `printStatus` uses `print()` which writes to stdout, (c) preserves current stderr routing behavior.

## Sources

### Primary (HIGH confidence)

- `src/cli/lswt.ts` lines 68-79 -- verified initializeLogger manual parsing pattern
- `src/cli/wtlink.ts` lines 79-127 -- verified yargs middleware initializeLogger pattern
- `src/cli/cleanpr.ts` lines 459-464 -- verified initializeLogger call signature
- `src/cli/newpr.ts` lines 1320-1326 -- verified initializeLogger call signature
- `src/lib/logger.ts` lines 300-404 -- verified initializeLogger implementation and LoggerOptions interface
- `src/lib/deprecation.ts` lines 18-30 -- verified printDeprecationNotice implementation
- `src/lib/ui/output.ts` -- verified setJsonMode/print/printErr implementation
- `src/lib/ui/error.ts` -- verified printError implementation
- `src/lib/ui/status.ts` -- verified printStatus/printHeader/printDim/printNextSteps/printSummaryBox
- `src/cli/wtstate.ts` -- verified current state (missing initializeLogger, has console.error calls)
- `src/cli/wtconfig.ts` -- verified current state (missing initializeLogger, ~116 console calls)
- `src/cli/prs.ts` -- verified current state (missing initializeLogger AND printDeprecationNotice)
- `src/cli/wt/config.ts` -- verified missing setJsonMode (grep confirmed 0 matches)
- `src/lib/prs/command.ts` -- verified raw console.error(colors...) calls (8 instances)

### Console Call Inventory (verified via grep)

| File           | console.log | console.error | console.warn | Total | JSON output (keep)                    | Decorative (migrate) |
| -------------- | ----------- | ------------- | ------------ | ----- | ------------------------------------- | -------------------- |
| wtstate.ts     | 6           | 5             | 0            | 11    | 5 (formatJsonResult)                  | 6                    |
| wtconfig.ts    | ~85         | ~28           | 3            | ~116  | ~10 (formatJsonResult/JSON.stringify) | ~106                 |
| prs/command.ts | 6           | 9             | 0            | 15    | 5 (formatJsonResult)                  | 10                   |
| wt/config.ts   | ~45         | ~16           | 2            | ~63   | ~10 (formatJsonResult)                | ~53                  |

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries already in use, verified in codebase
- Architecture: HIGH -- pure pattern replication from verified working CLIs
- Pitfalls: HIGH -- identified from direct code inspection, no speculation needed

**Research date:** 2026-03-09
**Valid until:** 2026-04-08 (30 days -- stable domain, internal codebase patterns)
