---
phase: 05-in-process-delegation
plan: 01
subsystem: cli
tags: [in-process, lswt, wtstate, direct-library-calls, shared-module]

# Dependency graph
requires:
  - phase: 02-shared-ui-primitives
    provides: printTable, printStatus, changeIndicator UI primitives
  - phase: 04-json-output-and-llm-ergonomics
    provides: createSuccessResult, formatJsonResult JSON envelope pattern
provides:
  - printWorktreeTable shared module at src/lib/lswt/table.ts
  - wt list handler using direct gatherWorktreeInfo calls
  - wt state handler using direct analyzeState calls
  - Migration pattern for remaining wt subcommand conversions
affects: [05-02, 05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [direct-library-call-handler, shared-table-module, in-process-delegation]

key-files:
  created:
    - src/lib/lswt/table.ts
    - src/lib/lswt/table.test.ts
  modified:
    - src/cli/wt/list.ts
    - src/cli/wt/state.ts
    - src/cli/lswt.ts
    - src/cli/lswt.test.ts
    - src/cli/wt/wt.test.ts
    - src/lib/lswt/index.ts

key-decisions:
  - 'Extracted printWorktreeTable to src/lib/lswt/table.ts as shared module importable by both lswt.ts and wt/list.ts'
  - 'Handler functions are async to support gatherWorktreeInfo (returns Promise) and runInteractiveMode'
  - 'Error handling uses JSON-aware printError + process.exit(1) pattern, matching init.ts and config.ts handlers'
  - 'Logger initialization NOT called in handlers -- already done by wt.ts middleware'

patterns-established:
  - 'Direct library call handler: import library functions, build options from argv, call directly'
  - 'Shared UI extraction: extract display code from CLI to lib/ for reuse across entry points'
  - 'Mock isolation: use importOriginal for partial mocks to prevent cross-test leaking'

# Metrics
duration: 42min
completed: 2026-02-19
---

# Phase 5 Plan 1: List/State In-Process Delegation Summary

**Extracted printWorktreeTable to shared module, migrated wt list and wt state from subprocess spawning to direct library calls**

## Performance

- **Duration:** 42 min
- **Started:** 2026-02-19T10:00:38Z
- **Completed:** 2026-02-19T10:42:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extracted `printWorktreeTable` from `lswt.ts` to `src/lib/lswt/table.ts` as a shared importable module
- Rewrote `wt/list.ts` handler to call `gatherWorktreeInfo`, `printWorktreeTable`, `formatJsonOutput`, and `runInteractiveMode` directly in-process
- Rewrote `wt/state.ts` handler to call `analyzeState` and `formatText` directly in-process
- Added 18 unit tests for `printWorktreeTable` covering empty lists, verbose mode, change indicators, color application, and summary line formatting
- All 3199 tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract printTable and migrate list/state to direct calls** - `f796884` (feat)
2. **Task 2: Add tests for extracted printWorktreeTable** - `d3ab111` (test)

**Plan metadata:** `f275463` (docs: complete plan)

## Files Created/Modified

- `src/lib/lswt/table.ts` - Extracted printWorktreeTable function (shared display module)
- `src/lib/lswt/table.test.ts` - 18 unit tests for printWorktreeTable
- `src/lib/lswt/index.ts` - Re-exports printWorktreeTable from table.ts
- `src/cli/wt/list.ts` - Rewritten with direct library calls (gatherWorktreeInfo, printWorktreeTable)
- `src/cli/wt/state.ts` - Rewritten with direct library calls (analyzeState, formatText)
- `src/cli/lswt.ts` - Uses imported printWorktreeTable instead of local printTable function
- `src/cli/lswt.test.ts` - Updated to verify printWorktreeTable mock calls
- `src/cli/wt/wt.test.ts` - Updated with library module mocks for list/state, spawnSync for others

## Decisions Made

- Extracted `printWorktreeTable` to `src/lib/lswt/table.ts` rather than keeping in `lswt.ts` -- enables both `lswt.ts` and `wt/list.ts` to share the same display code without duplication
- Handlers made `async` to support `gatherWorktreeInfo` (returns Promise) and `runInteractiveMode`
- Error handling uses JSON-aware `printError + process.exit(1)` pattern matching existing `init.ts` and `config.ts` handlers
- Logger initialization NOT called in handlers -- already initialized by `wt.ts` middleware before handler invocation
- Used `importOriginal` for colors mock in `table.test.ts` to prevent mock leaking to other test files sharing the same vitest worker

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed colors mock leaking across vitest workers**

- **Found during:** Task 2 (table.test.ts)
- **Issue:** Incomplete `vi.mock('../colors.js')` in table.test.ts caused config.test.ts to fail when run in the same worker -- missing `warning`, `success`, `error`, `info` exports
- **Fix:** Changed to `vi.mock('../colors.js', async (importOriginal) => { ... })` to preserve all original exports while overriding specific color functions
- **Files modified:** src/lib/lswt/table.test.ts
- **Verification:** Both table.test.ts and config.test.ts pass when run together
- **Committed in:** d3ab111 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for test isolation. No scope creep.

## Issues Encountered

- Git stash operations caused file corruption during development (clean.ts and wt.test.ts were overwritten by stash pop). Resolved by restoring files from git and rewriting wt.test.ts from scratch.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Migration pattern established: subsequent plans (05-02 through 05-04) can follow the same direct-library-call pattern
- `printWorktreeTable` is now available for any future handler that needs to display worktree tables
- All existing tests pass -- no risk of regression for remaining migrations

## Self-Check: PASSED

All 8 files verified present. Both task commits (f796884, d3ab111) verified in git log.

---

_Phase: 05-in-process-delegation_
_Completed: 2026-02-19_
