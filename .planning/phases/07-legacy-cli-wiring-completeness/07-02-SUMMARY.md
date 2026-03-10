---
phase: 07-legacy-cli-wiring-completeness
plan: 02
subsystem: cli
tags: [ui-primitives, json-mode, logger, setJsonMode, console-migration]

# Dependency graph
requires:
  - phase: 02-shared-ui-primitives
    provides: print/printErr/printStatus/printDim/printError UI functions
  - phase: 01-logger-wiring
    provides: initializeLogger shared logger singleton
  - phase: 07-legacy-cli-wiring-completeness/01
    provides: wtconfig.ts logger wiring and UI migration (completed in 07-01)
provides:
  - setJsonMode(!!argv.json) wiring in wt/config.ts handler
  - Full UI primitive migration for wt/config.ts (~53 decorative console calls)
  - Updated wtconfig.test.ts mocks for logger, UI, deprecation modules
affects: [07-legacy-cli-wiring-completeness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'UI primitive pass-through mocks with vi.clearAllMocks (not resetAllMocks) for legacy test compatibility'
    - 'setJsonMode(!!argv.json) as first line in yargs handler for JSON-mode gating'

key-files:
  created: []
  modified:
    - src/cli/wt/config.ts
    - src/cli/wt/config.test.ts
    - src/cli/wtconfig.test.ts

key-decisions:
  - 'Task 1 (wtconfig.ts wiring) was already completed by plan 07-01 -- skipped to avoid duplicate work'
  - 'Used vi.clearAllMocks instead of vi.resetAllMocks in wtconfig.test.ts to preserve mock implementations across tests'
  - 'UI mock pass-through pattern: vi.fn((msg) => console.log(msg)) bridges UI primitives to console spies for legacy test assertions'

patterns-established:
  - 'Pass-through UI mocks: mock UI functions to delegate to console.* so legacy test assertions on console spies still work'
  - 'clearAllMocks vs resetAllMocks: use clearAllMocks when mock factory implementations must survive beforeEach cleanup'

requirements-completed: [LOG-01, LOG-04, UNI-01]

# Metrics
duration: 25min
completed: 2026-03-09
---

# Phase 7 Plan 2: Config CLI UI Migration Summary

**setJsonMode wiring and ~53 decorative console call migration to UI primitives in wt/config.ts, plus legacy wtconfig.test.ts mock compatibility fixes**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-09T15:30:00Z
- **Completed:** 2026-03-09T15:55:00Z
- **Tasks:** 2 (1 skipped as already completed by 07-01)
- **Files modified:** 3

## Accomplishments

- Wired setJsonMode(!!argv.json) as first action in wt/config.ts yargs handler, ensuring all UI primitives respect JSON mode
- Migrated all ~53 decorative console.log/console.error/console.warn calls in wt/config.ts to print/printErr/printStatus/printDim/printError
- Only console.log(formatJsonResult(...)) calls remain as raw console output (8 instances -- structured JSON output)
- Updated wtconfig.test.ts with pass-through UI mocks and switched from resetAllMocks to clearAllMocks for mock implementation preservation
- All 3284 tests pass across 108 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire logger into wtconfig.ts and migrate all console calls** - Skipped (already completed in plan 07-01 commit `4553382`)
2. **Task 2: Add setJsonMode to wt/config.ts, migrate console calls, update tests** - `bb47562` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/cli/wt/config.ts` - Added setJsonMode import/call, migrated ~53 decorative console calls to UI primitives
- `src/cli/wt/config.test.ts` - Added setJsonMode/print/printErr/printDim to UI mock, new setJsonMode test section, updated assertions for UI primitives
- `src/cli/wtconfig.test.ts` - Added mocks for logger/deprecation/colors/UI modules, switched to vi.clearAllMocks for mock implementation preservation

## Decisions Made

| Decision                       | Chosen                             | Alternatives Considered                                    | Why                                                                                                                                                     |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1 handling                | Skip (already done by 07-01)       | Redo and re-commit                                         | Commit 4553382 already contains the full wtconfig.ts migration; re-doing would create duplicate/conflicting work                                        |
| wtconfig.test.ts mock strategy | Pass-through mocks (UI -> console) | Rewrite all test assertions to check UI functions directly | Pass-through preserves 85 existing test assertions while adding UI mock compatibility; far less churn                                                   |
| beforeEach cleanup             | vi.clearAllMocks()                 | vi.resetAllMocks()                                         | resetAllMocks clears mock implementations set in factory functions; clearAllMocks only resets call history, preserving the pass-through implementations |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi.resetAllMocks clearing mock implementations in wtconfig.test.ts**

- **Found during:** Task 2 (test updates)
- **Issue:** After migrating wtconfig.ts to UI primitives, 68 tests failed because vi.resetAllMocks() in beforeEach cleared the pass-through mock implementations (e.g., `vi.fn((msg) => console.log(msg))`), causing UI functions to return undefined instead of delegating to console
- **Fix:** Changed vi.resetAllMocks() to vi.clearAllMocks() which preserves implementations while clearing call counts
- **Files modified:** src/cli/wtconfig.test.ts
- **Verification:** 85 tests pass; reduced from 68 failures to 0
- **Committed in:** bb47562

**2. [Rule 1 - Bug] Fixed 7 validate/set test assertions checking wrong spy**

- **Found during:** Task 2 (test updates)
- **Issue:** After clearAllMocks fix, 7 tests still failed. printErr (for validation errors/warnings) routes to console.error via pass-through, but tests asserted on mockConsoleLog instead of mockConsoleError
- **Fix:** Updated 7 assertions from mockConsoleLog to mockConsoleError for validate error/warning and set warning test cases
- **Files modified:** src/cli/wtconfig.test.ts
- **Verification:** All 85 wtconfig tests pass
- **Committed in:** bb47562

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness after UI primitive migration. No scope creep.

## Issues Encountered

- lint-staged "empty commit" error on first commit attempt: lint-staged stashed unstaged changes from other files, formatted the staged files (already formatted), and found no diff. Resolved by re-staging and retrying -- second attempt succeeded because lint-staged handled the stash correctly.
- Pre-existing TypeScript error in src/cli/prs.ts (missing `colors` import) -- not caused by this plan, not fixed here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- INT-02 (wtconfig logger), INT-05 (wtconfig UI migration), INT-06 (wt/config.ts setJsonMode) are all closed
- wt/config.ts and wtconfig.ts both fully wired with UI primitives and JSON-mode gating
- Remaining phase 07 plans can proceed with other legacy CLI files

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---

_Phase: 07-legacy-cli-wiring-completeness_
_Completed: 2026-03-09_
