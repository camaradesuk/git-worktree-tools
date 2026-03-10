---
phase: 07-legacy-cli-wiring-completeness
plan: 01
subsystem: cli
tags: [logger, deprecation, ui-primitives, printError, initializeLogger]

# Dependency graph
requires:
  - phase: 01-logger-wiring
    provides: initializeLogger singleton and CLI flag parsing patterns
  - phase: 02-shared-ui-primitives
    provides: printError, print, setJsonMode UI primitives
  - phase: 05-in-process-delegation
    provides: printDeprecationNotice utility
provides:
  - initializeLogger wired into wtstate.ts and prs.ts
  - printDeprecationNotice wired into prs.ts
  - All decorative console calls in wtstate.ts, prs.ts, prs/command.ts migrated to UI primitives
  - INT-01, INT-03, INT-04, INT-07 integration gaps closed
affects: [07-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [manual-argv-flag-parsing-for-logger-init, yargs-option-chain-with-logger-middleware]

key-files:
  created: []
  modified:
    - src/cli/wtstate.ts
    - src/cli/prs.ts
    - src/lib/prs/command.ts
    - src/cli/wtstate.test.ts
    - src/cli/prs.test.ts
    - src/lib/prs/command.test.ts

key-decisions:
  - 'wtstate uses manual argv parsing for logger init (same pattern as lswt) since it has no yargs'
  - 'prs uses yargs option chain for --verbose/--quiet/--no-color then initializeLogger after parse'
  - 'Removed colors import entirely from prs/command.ts since all error output migrated to printError'
  - "print('') replaces console.log() for empty separator lines in non-interactive table output"

patterns-established:
  - 'Legacy CLI logger init: parse raw argv for flags before full arg parsing, call initializeLogger()'
  - 'Legacy CLI deprecation: printDeprecationNotice() as first line of main() before any other logic'

requirements-completed: [LOG-01, LOG-04, UNI-01]

# Metrics
duration: 92min
completed: 2026-03-09
---

# Phase 7 Plan 1: Legacy CLI Wiring Completeness Summary

**Logger, deprecation, and UI primitive wiring for wtstate.ts, prs.ts, and prs/command.ts -- closing 4 integration gaps**

## Performance

- **Duration:** 92 min
- **Started:** 2026-03-09T14:15:18Z
- **Completed:** 2026-03-09T15:47:18Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Wired initializeLogger() into wtstate.ts and prs.ts with proper flag parsing
- Added printDeprecationNotice('prs', 'wt prs') to prs.ts main()
- Migrated all decorative console.error(colors.error/dim) calls to printError() across 3 files
- Migrated non-interactive table output in prs/command.ts from console.log() to print()
- Updated all 3 test files with proper UI/logger/deprecation mocks and assertions (59 tests passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire logger and UI primitives into wtstate.ts and prs.ts** - `4553382` (feat)
2. **Task 2: Migrate prs/command.ts to UI primitives and update tests** - `6477ed6` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `src/cli/wtstate.ts` - Added initializeLogger(), setJsonMode(), migrated errors to printError(), text to print()
- `src/cli/prs.ts` - Added printDeprecationNotice(), initializeLogger(), --verbose/--quiet/--no-color options, migrated catch to printError()
- `src/lib/prs/command.ts` - Migrated all error paths to printError(), table output to print(), removed colors import
- `src/cli/wtstate.test.ts` - Added logger/deprecation/UI mocks, tests for initializeLogger wiring, updated error assertions
- `src/cli/prs.test.ts` - Added UI/deprecation/logger mocks, updated error assertions for printError
- `src/lib/prs/command.test.ts` - Added UI mock, updated error path assertions to verify printError calls

## Decisions Made

| Decision                      | Chosen                                 | Alternatives Considered            | Why                                                                                            |
| ----------------------------- | -------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Logger init timing in wtstate | Manual argv parsing before parseArgs() | Parse after parseArgs(), use yargs | wtstate has no yargs -- manual argv matches lswt pattern                                       |
| Logger init timing in prs     | After yargs .parse() completes         | Before yargs, in middleware        | Yargs middleware pattern exists (wtlink) but placing after parse is simpler for standalone CLI |
| colors import in command.ts   | Removed entirely                       | Keep for future use                | No remaining references after migration; dead imports are noise                                |
| Empty line separators         | print('')                              | print() with no args, printDim('') | print('') is explicit and matches semantic of "print an empty line"                            |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- lint-staged stash/restore mechanism conflicted with pre-existing uncommitted changes in unrelated files (wt/config.ts, wtconfig.test.ts) -- resolved by stashing unrelated changes before committing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- INT-01, INT-03, INT-04, INT-07 integration gaps are now closed
- Remaining gaps (INT-02, INT-05, INT-06 for newpr.ts) are addressed by plan 07-02
- All existing tests continue to pass

## Self-Check: PASSED

- [x] src/cli/wtstate.ts -- FOUND
- [x] src/cli/prs.ts -- FOUND
- [x] src/lib/prs/command.ts -- FOUND
- [x] src/cli/wtstate.test.ts -- FOUND
- [x] src/cli/prs.test.ts -- FOUND
- [x] src/lib/prs/command.test.ts -- FOUND
- [x] Commit 4553382 (Task 1) -- FOUND
- [x] Commit 6477ed6 (Task 2) -- FOUND

---

_Phase: 07-legacy-cli-wiring-completeness_
_Completed: 2026-03-09_
