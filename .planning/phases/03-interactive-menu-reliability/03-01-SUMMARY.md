---
phase: 03-interactive-menu-reliability
plan: 01
subsystem: cli
tags: [interactive-menu, wtlink, return-to-menu, runSubcommandForResult]

# Dependency graph
requires:
  - phase: 02-shared-ui-primitives
    provides: Standardized error rendering and UI primitives used by menu handlers
provides:
  - Return-to-menu behavior for all interactive menu actions (no more process.exit on subcommand)
  - Direct library calls for wtlink view/add/remove (no longer invoking non-existent subcommands)
  - Error display on non-zero subcommand exit codes
affects: [03-02, 03-03, interactive-menu]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'runSubcommandForResult + error check + COMPLETED_RETURN pattern for all menu actions'
    - 'Direct library calls (loadManifestData/saveManifestData) for wtlink manifest operations in menu'

key-files:
  created: []
  modified:
    - src/cli/wt/interactive-menu.ts
    - src/cli/wt/interactive-menu.test.ts

key-decisions:
  - 'COMPLETED_EXIT replaced with COMPLETED_RETURN (returnToMenu: true) -- all flows now loop'
  - "wtlink sync maps to 'wtlink link' subcommand (the actual CLI command for hard link creation)"
  - 'wtlink view/add/remove use loadManifestData/saveManifestData directly instead of spawning subprocesses'

patterns-established:
  - 'Return-to-menu pattern: runSubcommandForResult() + status check + return { completed: true, returnToMenu: true }'
  - 'Library-direct pattern: For operations with no existing CLI subcommand, call library functions directly in the menu handler'

# Metrics
duration: 7min
completed: 2026-02-18
---

# Phase 3 Plan 1: Return-to-Menu and Wtlink Library Calls Summary

**All 17 runSubcommand() calls replaced with runSubcommandForResult() for return-to-menu behavior; 4 broken wtlink actions rewired to direct library calls via loadManifestData/saveManifestData**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-18T20:39:52Z
- **Completed:** 2026-02-18T20:47:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Every menu action now returns to the main menu loop instead of terminating the process via process.exit
- Wtlink view/add/remove actions use loadManifestData/saveManifestData library calls (previously invoked non-existent subcommands)
- Wtlink sync correctly maps to `wtlink link` subcommand
- Non-zero exit codes from subcommands display error messages and still return to menu
- 65 tests passing with full return-to-menu and library call verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace runSubcommand with runSubcommandForResult and rewire wtlink actions** - `bae03d3` (feat)
2. **Task 2: Update tests for return-to-menu behavior and wtlink library calls** - `95b7fe6` (test)

## Files Created/Modified

- `src/cli/wt/interactive-menu.ts` - Replaced all runSubcommand() with runSubcommandForResult(), rewired wtlink view/add/remove/sync, added error handling
- `src/cli/wt/interactive-menu.test.ts` - Updated mocks, removed try/catch wrappers, added return-to-menu and library call tests (65 tests)

## Decisions Made

- COMPLETED_EXIT constant replaced with COMPLETED_RETURN (returnToMenu: true) -- all flows now return to menu
- wtlink sync maps to `wtlink link` subcommand (the actual CLI command for creating hard links from manifest)
- wtlink view/add/remove use loadManifestData/saveManifestData directly instead of spawning non-existent subprocesses

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Interactive menu now properly loops after all actions
- Ready for 03-02 (additional menu reliability improvements)
- All 3108 tests pass across 100 test files (no regressions)

---

_Phase: 03-interactive-menu-reliability_
_Completed: 2026-02-18_
