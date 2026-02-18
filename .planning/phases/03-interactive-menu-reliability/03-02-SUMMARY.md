---
phase: 03-interactive-menu-reliability
plan: 02
subsystem: cli
tags: [prs, interactive, refactor, deduplication]

# Dependency graph
requires: []
provides:
  - Single canonical runPrsCommand in src/lib/prs/command.ts shared by both entry points
  - wt prs now has working refreshPrs callback (MENU-03 fix)
affects: [03-interactive-menu-reliability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Shared command module pattern: lib/prs/command.ts extracted, CLI entry points are thin wrappers'

key-files:
  created:
    - src/lib/prs/command.ts
    - src/lib/prs/command.test.ts
  modified:
    - src/cli/prs.ts
    - src/cli/wt/prs.ts

key-decisions:
  - 'Re-export runPrsCommand and outputJsonError from cli/prs.ts for downstream consumers'
  - 'cli/wt/prs.ts imports only runPrsCommand (outputJsonError not needed by yargs handler)'

patterns-established:
  - 'Shared command module: Extract command logic to lib/, CLI files become thin wrappers with import + yargs setup'

# Metrics
duration: 8min
completed: 2026-02-18
---

# Phase 3 Plan 2: Deduplicate wt prs Command Summary

**Extracted runPrsCommand to shared lib/prs/command.ts, eliminating duplicate code path that caused wt prs to lack refresh support (MENU-03)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-18T20:39:54Z
- **Completed:** 2026-02-18T20:48:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created single canonical `runPrsCommand` in `src/lib/prs/command.ts` with full `refreshPrs` callback wiring
- Rewired both `src/cli/prs.ts` (standalone) and `src/cli/wt/prs.ts` (`wt prs`) as thin import wrappers
- Added 21 tests covering interactive mode, JSON mode, non-interactive mode, error handling, filter state mapping
- Critical regression test: verifies `interactiveDeps.refreshPrs` is a Function when interactive mode is enabled

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract runPrsCommand to lib/prs/command.ts and rewire both entry points** - `cdb0eed` (refactor)
2. **Task 2: Add tests for the extracted prs command module** - `509d192` (test)

## Files Created/Modified

- `src/lib/prs/command.ts` - Canonical runPrsCommand implementation with refreshPrs support
- `src/lib/prs/command.test.ts` - 21 tests covering all modes and error paths
- `src/cli/prs.ts` - Thin wrapper: imports from lib/prs/command, keeps yargs + main()
- `src/cli/wt/prs.ts` - Thin wrapper: imports from lib/prs/command, keeps yargs CommandModule

## Decisions Made

- Re-exported `runPrsCommand` and `outputJsonError` from `cli/prs.ts` so any existing downstream consumers are not broken
- `cli/wt/prs.ts` only imports `runPrsCommand` (not `outputJsonError`) since the yargs handler delegates all error handling to the shared implementation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `wt prs` interactive "r" key refresh is now wired correctly via the shared implementation
- All 3129 tests pass (101 test files), no regressions
- Ready for plan 03-03

## Self-Check: PASSED

All artifacts verified:

- src/lib/prs/command.ts: FOUND
- src/lib/prs/command.test.ts: FOUND
- src/cli/prs.ts: FOUND
- src/cli/wt/prs.ts: FOUND
- Commit cdb0eed: FOUND
- Commit 509d192: FOUND

---

_Phase: 03-interactive-menu-reliability_
_Completed: 2026-02-18_
