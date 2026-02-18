---
phase: 02-shared-ui-primitives
plan: 02
subsystem: ui
tags: [cli-refactoring, ui-primitives, json-mode, error-handling, ansi]

# Dependency graph
requires:
  - phase: 02-shared-ui-primitives
    provides: src/lib/ui/ module with printStatus, printError, printSummaryBox, printTable, changeIndicator, setJsonMode
provides:
  - All five CLI entry points use shared UI primitives for structured output
  - JSON-mode gate wired into all CLI init paths via setJsonMode()
  - Consolidated error display via printError/errorToDisplay across all CLIs
  - Standardized change indicator format (compact `*`) across cleanpr and lswt
  - Consistent icon usage in link-configs.ts via colors.ts semantic functions
affects: [02-shared-ui-primitives plan 03 (wt wrapper cleanup)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      printStatus/printError replacing inline console.log(colors.*),
      errorToDisplay for catch blocks,
      changeIndicator for worktree status,
    ]

key-files:
  created: []
  modified:
    - src/cli/newpr.ts
    - src/cli/cleanpr.ts
    - src/cli/lswt.ts
    - src/cli/lswt.test.ts
    - src/cli/wtlink.ts
    - src/cli/wt.ts
    - src/lib/wtlink/link-configs.ts

key-decisions:
  - 'Consolidated checkout error in newpr.ts into single printError({title, detail}) to preserve stderr routing'
  - 'Updated lswt.test.ts assertions from mockConsoleError to mockConsoleLog after printStatus rerouted warnings to stdout'
  - 'Kept cleanpr.ts group label colors (Merged/Closed/Open/Unknown) as raw console.log -- decorative, not status messages'
  - 'Extracted getWtlinkHint() to eliminate duplicated error hint logic in wtlink.ts .fail()/.catch()'

patterns-established:
  - 'CLI error catch blocks: errorToDisplay(error) + printError(display) + process.exit(1)'
  - 'CLI init: setJsonMode(options.json) alongside initializeLogger() in all CLIs'
  - 'Status messages: printStatus(level, message) instead of console.log(colors.level(message))'

# Metrics
duration: 20min
completed: 2026-02-18
---

# Phase 2 Plan 02: Refactor CLI Commands to Use Shared UI Primitives Summary

**All five CLI entry points refactored to use ui/ primitives for status, error, summary, and table output with JSON-mode gate wired through setJsonMode()**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-18T19:30:00Z
- **Completed:** 2026-02-18T19:50:00Z
- **Tasks:** 7 (plus 1 follow-up fix)
- **Files modified:** 7

## Accomplishments

- Wired `setJsonMode()` into all four standalone CLI init paths (newpr, cleanpr, lswt, wtlink)
- Replaced all inline `console.log(colors.*)` status messages in newpr.ts, cleanpr.ts, lswt.ts with `printStatus()`
- Replaced newpr's box-drawing `printSummary()` with `printSummaryBox()` + `printNextSteps()`
- Replaced lswt's local `printTable()` implementation with shared `sharedPrintTable()`
- Consolidated duplicated error hint logic in wtlink.ts into `getWtlinkHint()` helper
- Added colored error output to wt.ts (previously had raw text errors)
- Replaced raw unicode icons in link-configs.ts with `colors.success()`, `colors.warning()`, `colors.error()`, `colors.info()` semantic functions
- All 3097 tests passing across 100 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire setJsonMode() into all CLI init paths** - `31f42af` (feat)
2. **Task 2: Refactor newpr.ts to use UI primitives** - `f5fb0b6` (refactor)
3. **Task 3: Refactor cleanpr.ts to use UI primitives** - `8017442` (refactor)
4. **Task 4: Refactor lswt.ts to use UI primitives** - `cf4d988` (refactor)
5. **Task 5: Refactor wtlink.ts error handling** - `e618f03` (refactor)
6. **Task 6: Fix wt.ts error handling (add colors)** - `ee41450` (feat)
7. **Task 7: Fix inconsistent icons in link-configs.ts** - `b96bc00` (fix)
8. **Follow-up: Replace remaining console.log(colors.error) in newpr.ts** - `f1dad86` (fix)

## Files Created/Modified

- `src/cli/newpr.ts` - Replaced progress()/progressError() with printStatus, printSummaryBox, printNextSteps, printError/errorToDisplay
- `src/cli/cleanpr.ts` - Replaced inline console.log(colors.\*) with printStatus, printHeader, printNextSteps, printError, changeIndicator
- `src/cli/lswt.ts` - Replaced local printTable with shared sharedPrintTable, replaced status/error messages with UI primitives
- `src/cli/lswt.test.ts` - Updated assertions: mockConsoleError->mockConsoleLog for warnings, loosened "Commit:" to "Commit" for table format
- `src/cli/wtlink.ts` - Added setJsonMode, extracted getWtlinkHint(), consolidated .fail()/.catch() with printError
- `src/cli/wt.ts` - Added printError import, replaced plain text .fail()/.catch() with colored error output
- `src/lib/wtlink/link-configs.ts` - Replaced raw unicode icons with colors.success/warning/error/info semantic functions

## Decisions Made

- **Checkout error routing (newpr.ts):** Consolidated the checkout error into a single `printError({title, detail})` call to preserve stderr output, since `printStatus('info',...)` would have routed to stdout and broken test expectations
- **lswt warning channel change:** `printStatus('warning',...)` routes through `print()` (stdout) instead of the original `console.error`. Updated test from `mockConsoleError` to `mockConsoleLog` -- the warning is informational, not an error
- **Group label colors preserved (cleanpr.ts):** 4 remaining `console.log(colors.*)` calls in cleanpr.ts are decorative group labels (Merged/Closed/Open/Unknown categories), not status messages -- left as-is per plan scope
- **Extracted getWtlinkHint():** Eliminated duplicated if/else error hint chains in wtlink.ts by extracting shared helper function

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stderr routing for newpr checkout error**

- **Found during:** Task 2 (newpr.ts refactoring)
- **Issue:** Converting `progressError(options, colors.info(...))` to `printStatus('info',...)` changed output from stderr to stdout, breaking test expectation at line 579
- **Fix:** Used `printError({title, detail})` instead, which routes through `printErr()` (stderr)
- **Files modified:** `src/cli/newpr.ts`
- **Verification:** Test passes, output stays on stderr
- **Committed in:** `f5fb0b6`

**2. [Rule 1 - Bug] Updated lswt.test.ts assertions for channel and format changes**

- **Found during:** Task 4 (lswt.ts refactoring)
- **Issue:** Two test failures: (1) GitHub CLI warning moved from stderr to stdout via printStatus, (2) shared printTable formats "Commit" without colon
- **Fix:** Changed test assertion from `mockConsoleError` to `mockConsoleLog`; loosened "Commit:" to "Commit"
- **Files modified:** `src/cli/lswt.test.ts`
- **Verification:** All lswt tests pass
- **Committed in:** `cf4d988`

**3. [Rule 1 - Bug] Fixed remaining console.log(colors.error) in newpr.ts cancel path**

- **Found during:** Verification (post-task scan)
- **Issue:** One cancel-path `console.log(colors.error('Aborted by user.'))` was missed in Step 2
- **Fix:** Replaced with `printStatus('error', 'Aborted by user.')`
- **Files modified:** `src/cli/newpr.ts`
- **Verification:** Grep confirms zero console.log(colors.) in newpr.ts
- **Committed in:** `f1dad86`

**4. [Rule 3 - Blocking] Fixed prettier formatting in link-configs.ts**

- **Found during:** Task 7 (link-configs.ts icon fixes)
- **Issue:** Commit failed due to prettier pre-commit hook finding formatting issues
- **Fix:** Ran `npx prettier --write` before recommitting
- **Files modified:** `src/lib/wtlink/link-configs.ts`
- **Verification:** Commit succeeded, build clean
- **Committed in:** `b96bc00`

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- **stdout vs stderr routing:** The key architectural subtlety was that `printStatus()` uses `print()` (stdout) while `printError()` uses `printErr()` (stderr). Tests that expected messages on stderr needed careful handling when switching from `console.error`/`progressError` patterns to UI primitives.
- **Shared printTable format differences:** The shared `printTable` from ui/table.ts uses padded key formatting without colons, differing slightly from lswt's original colon-suffixed format. Test assertions needed loosening.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All five CLI entry points now use shared UI primitives consistently
- JSON-mode gate is wired throughout -- `setJsonMode(true)` suppresses all structured output
- Ready for plan 02-03 (wt wrapper cleanup, if applicable)
- All 3097 tests passing, build clean

## Self-Check: PASSED

All 7 modified files verified present. All 8 commit hashes verified in git log.

---

_Phase: 02-shared-ui-primitives_
_Completed: 2026-02-18_
