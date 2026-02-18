---
phase: 02-shared-ui-primitives
plan: 01
subsystem: ui
tags: [ansi, cli-output, json-mode, box-drawing, theme]

# Dependency graph
requires:
  - phase: 01-logger-wiring
    provides: logger singleton, colors.ts semantic functions
provides:
  - src/lib/ui/ module with JSON-mode-aware print functions
  - printStatus, printHeader, printDetail, printDim, printNextSteps, printSummaryBox
  - printTable for structured worktree listings
  - printError/errorToDisplay for centralized error display
  - changeIndicator for standardized change markers
  - setJsonMode/isJsonMode output gate
affects:
  [02-shared-ui-primitives plan 02 (CLI refactoring), 02-shared-ui-primitives plan 03 (wt wrapper)]

# Tech tracking
tech-stack:
  added: []
  patterns: [json-mode output gate, barrel re-exports for ui primitives]

key-files:
  created:
    - src/lib/ui/theme.ts
    - src/lib/ui/output.ts
    - src/lib/ui/status.ts
    - src/lib/ui/table.ts
    - src/lib/ui/error.ts
    - src/lib/ui/spinner.ts
    - src/lib/ui/index.ts
    - src/lib/ui/theme.test.ts
    - src/lib/ui/output.test.ts
    - src/lib/ui/status.test.ts
    - src/lib/ui/table.test.ts
    - src/lib/ui/error.test.ts
  modified: []

key-decisions:
  - 'Box border width fixed at 58 chars matching existing newpr output'
  - 'changeIndicator uses compact * form; cleanpr will migrate from [has changes] in plan 02-02'
  - 'print/printErr functions are the sole JSON-mode gate; all ui/ functions route through them'

patterns-established:
  - 'JSON-mode gate: all CLI output goes through print()/printErr() which no-op when setJsonMode(true)'
  - "Barrel export: import { anything } from '../ui/index.js' for all UI primitives"
  - 'Theme constants: use icons/box objects from theme.ts, not hardcoded unicode'

# Metrics
duration: 9min
completed: 2026-02-18
---

# Phase 2 Plan 01: Create Shared UI Primitives Summary

**JSON-mode-aware ui/ module with theme constants, status/table/error display, and 53 unit tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-18T19:20:29Z
- **Completed:** 2026-02-18T19:29:54Z
- **Tasks:** 8
- **Files modified:** 12

## Accomplishments

- Created `src/lib/ui/` module with 7 source files providing centralized CLI output primitives
- All print functions route through JSON-mode gate (setJsonMode/isJsonMode) for clean machine-readable output
- printSummaryBox replicates newpr's box-drawing summary in reusable form
- printTable provides structured worktree listing format matching lswt output
- errorToDisplay centralizes Error -> ErrorCode -> suggestion mapping from 3 CLIs
- changeIndicator standardizes change markers (compact `*` form)
- 53 new tests covering all modules, 3097 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ui/theme.ts** - `0d72db6` (feat)
2. **Task 2: Create ui/output.ts** - `c4445cc` (feat)
3. **Task 3: Create ui/status.ts** - `002115b` (feat)
4. **Task 4: Create ui/table.ts** - `0835f73` (feat)
5. **Task 5: Create ui/error.ts** - `c21c531` (feat)
6. **Task 6: Create ui/spinner.ts** - `3accc1b` (feat)
7. **Task 7: Create ui/index.ts** - `0cc4764` (feat)
8. **Task 8: Write tests** - `f955e71` (test)

## Files Created/Modified

- `src/lib/ui/theme.ts` - Centralized icons and box-drawing constants, changeIndicator()
- `src/lib/ui/output.ts` - JSON-mode flag and print/printErr output gate
- `src/lib/ui/status.ts` - printStatus, printHeader, printDetail, printDim, printNextSteps, printSummaryBox
- `src/lib/ui/table.ts` - printTable for structured row/field display
- `src/lib/ui/error.ts` - printError structured display, errorToDisplay extraction helper
- `src/lib/ui/spinner.ts` - Re-export of withSpinner from prompts.ts
- `src/lib/ui/index.ts` - Barrel export of all 17 public API items
- `src/lib/ui/theme.test.ts` - 8 tests for icons, box, changeIndicator
- `src/lib/ui/output.test.ts` - 8 tests for JSON mode toggle and output suppression
- `src/lib/ui/status.test.ts` - 19 tests for all status functions
- `src/lib/ui/table.test.ts` - 7 tests for printTable
- `src/lib/ui/error.test.ts` - 11 tests for printError and errorToDisplay

## Decisions Made

- Box border width fixed at 58 characters to match existing newpr printSummary output
- changeIndicator uses compact `*` form -- cleanpr will migrate from `[has changes]` in plan 02-02
- All ui/ print functions route through print()/printErr() as the single JSON-mode gate
- withSpinner stays in prompts.ts (spinner.ts is just a re-export for unified import path)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All UI primitives ready for plan 02-02 (CLI refactoring to use ui/ module)
- 17 exports verified at runtime via barrel index
- No new dependencies added, build clean, all tests passing

## Self-Check: PASSED

All 12 files verified present. All 8 commit hashes verified in git log.

---

_Phase: 02-shared-ui-primitives_
_Completed: 2026-02-18_
