---
phase: 05-in-process-delegation
plan: 03
subsystem: cli
tags: [in-process, newpr, wtlink, direct-library-calls, runNewprHandler]

# Dependency graph
requires:
  - phase: 05-in-process-delegation
    provides: Migration pattern for wt subcommand conversions (plans 05-01, 05-02)
  - phase: 04-json-output-and-llm-ergonomics
    provides: JSON output envelope (createSuccessResult/createErrorResult/formatJsonResult)
  - phase: 02-shared-ui-primitives
    provides: printError, setJsonMode, isJsonMode UI primitives
provides:
  - runNewprHandler exported from src/cli/newpr.ts for in-process delegation
  - wt new handler calling runNewprHandler directly (no subprocess)
  - wt link handler calling wtlink library modules directly (no subprocess)
  - Zero runSubcommand calls in any wt handler file
affects: [05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'High-complexity handler extraction: export handler function from monolithic CLI entry point'
    - 'ESM isMain guard: prevent module-level side effects when importing CLI modules'
    - 'Multi-subcommand handler routing: switch/case with direct library calls per subcommand'

key-files:
  created: []
  modified:
    - src/cli/newpr.ts
    - src/cli/newpr.test.ts
    - src/cli/wt/new.ts
    - src/cli/wt/link.ts
    - src/cli/wt/wt.test.ts

key-decisions:
  - 'Guard main() in newpr.ts with isMain check to prevent execution on import (same pattern as prs.ts)'
  - 'runNewprHandler takes Options directly -- no re-parsing of args, caller builds Options from argv'
  - 'PR number validation added in wt/new.ts handler to catch yargs NaN edge case'
  - 'wt link migrate delegates to migration library directly instead of subprocess wtlink CLI'

patterns-established:
  - 'ESM isMain guard: import.meta.url.endsWith(process.argv[1]) || process.argv[1].endsWith(name.js)'
  - 'Handler function extraction: split CLI main() into handler(options) + entry-point main()'
  - 'Test adaptation: mock extracted handler, assert on Options shape instead of spawnSync args'

# Metrics
duration: 18min
completed: 2026-02-19
---

# Phase 5 Plan 3: New/Link In-Process Delegation Summary

**Extracted runNewprHandler from newpr.ts and migrated wt new/link from subprocess spawning to direct in-process library calls -- zero runSubcommand calls remain in any handler file**

## Performance

- **Duration:** 18 min
- **Started:** 2026-02-19T10:54:16Z
- **Completed:** 2026-02-19T11:12:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Exported `runNewprHandler(options)` from `newpr.ts` as callable library function for in-process delegation
- Rewrote `wt/new.ts` handler to build Options from argv and call `runNewprHandler` directly (eliminated 90+ lines of arg-building + spawnSync code)
- Rewrote `wt/link.ts` handler with switch/case routing for all 5 subcommands (manage, link, validate, migrate, default menu) using direct library calls
- Added ESM `isMain` guard to `newpr.ts` to prevent `main()` from executing on import
- All 3201 tests pass across 102 test files -- zero `runSubcommand` calls remain in any wt handler file

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract runNewprHandler and migrate wt/new.ts** - `9487825` (feat)
2. **Task 2: Migrate wt/link.ts from subprocess to direct library calls** - `358dd7f` (feat)

## Files Created/Modified

- `src/cli/newpr.ts` - Extracted `runNewprHandler(options)` export; added isMain guard for main()
- `src/cli/newpr.test.ts` - Updated runCli() to set process.argv[1] ending with newpr.js (isMain guard compatibility)
- `src/cli/wt/new.ts` - Rewritten from spawnSync delegation to direct runNewprHandler call with Options mapping
- `src/cli/wt/link.ts` - Rewritten from spawnSync delegation to direct manage/link/validate/migrate/menu calls
- `src/cli/wt/wt.test.ts` - Added newpr.js and wtlink module mocks; rewrote new/link tests for library call assertions

## Decisions Made

- **Guard main() with isMain check:** Prevents `main().catch()` from executing when `newpr.ts` is imported as a module by `wt/new.ts`. Uses the same pattern already established in `prs.ts`: `import.meta.url.endsWith(process.argv[1])`.
- **runNewprHandler takes Options directly:** The handler function accepts the pre-parsed `Options` type -- no re-parsing of CLI args. The `wt/new.ts` handler is responsible for mapping yargs argv fields to Options fields (e.g., `argv.install` -> `options.installDeps`, `argv.code` -> `options.openEditor`).
- **PR number validation in wt/new.ts:** Added NaN check because yargs parses `--pr not-a-number` as `NaN` for `type: 'number'` options. The old subprocess path caught this in newpr's arg parser, but the new direct path needed explicit validation.
- **wt link migrate delegates to migration library directly:** Instead of spawning `wtlink migrate`, the handler calls `detectMigrationIssues()` and `runMigration()` from `lib/config-migration/index.js` directly, matching the pattern in the standalone `wtlink.ts` CLI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESM isMain guard needed for newpr.ts**

- **Found during:** Task 1 (wt/new.ts migration)
- **Issue:** Importing `newpr.ts` from `wt/new.ts` triggered the module-level `main().catch()` call, causing `process.exit(1)` in tests and at import time
- **Fix:** Added `isMain` guard (matching existing pattern in `prs.ts`) to conditionally execute `main()` only when the file is the entry point
- **Files modified:** src/cli/newpr.ts
- **Verification:** All 37 newpr.test.ts tests pass; all wt.test.ts tests pass
- **Committed in:** 9487825

**2. [Rule 1 - Bug] PR number NaN validation in wt/new.ts**

- **Found during:** Task 1 (e2e test failure)
- **Issue:** `wt new --pr not-a-number` produced `NaN` from yargs, which passed through to `runNewprHandler` and resulted in "Could not find PR #NaN" instead of "PR number must be a positive integer"
- **Fix:** Added explicit `isNaN(argv.pr) || argv.pr <= 0` validation in the handler before building Options
- **Files modified:** src/cli/wt/new.ts
- **Verification:** E2e test `validates PR number for --pr flag` passes
- **Committed in:** 9487825

**3. [Rule 1 - Bug] newpr.test.ts runCli() stopped working with isMain guard**

- **Found during:** Task 1 (newpr.test.ts failures)
- **Issue:** `runCli()` set `process.argv = ['node', 'newpr', ...args]` but the `isMain` guard checks `process.argv[1]?.endsWith('newpr.js')`, so `main()` was never called
- **Fix:** Changed to `process.argv = ['node', '/path/to/newpr.js', ...args]` so the guard passes
- **Files modified:** src/cli/newpr.test.ts
- **Verification:** All 37 newpr.test.ts tests pass
- **Committed in:** 9487825

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 6 wt handler files (new, link, list, state, clean, config) now use direct library calls
- `runSubcommand` utility remains for `interactive-menu.ts` only (plan 05-04 target)
- `runNewprHandler` is available for any future consumer needing programmatic newpr execution
- All 3201 tests pass -- no risk of regression

## Self-Check: PASSED

All 5 files verified present. Both task commits (9487825, 358dd7f) verified in git log.

---

_Phase: 05-in-process-delegation_
_Completed: 2026-02-19_
