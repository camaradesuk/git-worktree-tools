---
phase: 04-json-output-and-llm-ergonomics
plan: 01
subsystem: cli
tags: [json-output, CommandResult, error-handling, LLM-ergonomics]

# Dependency graph
requires:
  - phase: 02-shared-ui-primitives
    provides: printError, errorToDisplay, isJsonMode/setJsonMode, json-output.ts utilities
provides:
  - Every CLI error path outputs valid CommandResult JSON when --json is present
  - wtconfig show/get/validate support --json flag
  - prs command uses CommandResult<PrsResultData> instead of legacy PrsJsonOutput
affects: [04-04-newpr-json-paths]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'hasJsonFlag() pattern for pre-yargs JSON detection in CLI entry points'
    - 'isJsonMode() pattern for post-middleware JSON detection in yargs CLIs'
    - 'createSuccessResult<T>/createErrorResult in every exit path'

key-files:
  created: []
  modified:
    - src/cli/wtstate.ts
    - src/cli/wtlink.ts
    - src/cli/wt.ts
    - src/cli/wtconfig.ts
    - src/lib/prs/command.ts
    - src/lib/prs/types.ts
    - src/cli/prs.test.ts

key-decisions:
  - 'wtstate and wt use hasJsonFlag() (no yargs middleware); wtlink uses isJsonMode() (has yargs middleware with setJsonMode)'
  - 'wtconfig show/get/validate get --json; set/edit/init remain interactive-only (no JSON needed for interactive commands)'
  - 'PrsJsonOutput kept as deprecated type for backward compatibility; PrsResultData replaces it in production'

patterns-established:
  - 'hasJsonFlag pattern: for CLIs without yargs middleware, check process.argv directly before yargs parses'
  - 'isJsonMode pattern: for CLIs with yargs middleware that calls setJsonMode(), use isJsonMode() in .fail()/.catch()'
  - 'JSON-first error handling: if (jsonMode) output JSON else printError/console.error'

# Metrics
duration: 32min
completed: 2026-02-18
---

# Phase 4 Plan 1: JSON Error Gap Patches Summary

**Patched all CLI error paths and wtconfig subcommands with CommandResult JSON output; migrated prs from legacy PrsJsonOutput to CommandResult<PrsResultData>**

## Performance

- **Duration:** 32 min
- **Started:** 2026-02-18T21:40:45Z
- **Completed:** 2026-02-18T22:13:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Every `.fail()`, `.catch()`, and parse-error path in wtstate, wtlink, wt, and wtconfig now checks for JSON mode and outputs valid `CommandResult` error JSON
- `wtconfig show --json`, `wtconfig get <key> --json`, and `wtconfig validate --json` produce structured `CommandResult` success JSON
- `prs --json` migrated from bespoke `PrsJsonOutput` to standard `CommandResult<PrsResultData>` envelope
- Added 2 new tests verifying CommandResult envelope shape and error JSON output for prs command

## Task Commits

Each task was committed atomically:

1. **Task 1: Patch JSON gaps in wtstate, wtlink, wt, and wtconfig CLIs** - `5d34f93` (feat)
2. **Task 2: Migrate prs JSON output to CommandResult<T> and add tests** - `2e5d956` (feat)

## Files Created/Modified

- `src/cli/wtstate.ts` - Added hasJsonFlag, JSON-aware parse error and catch handlers
- `src/cli/wtlink.ts` - Added isJsonMode checks in .fail() and .catch() handlers
- `src/cli/wt.ts` - Added hasJsonFlag, JSON-aware .fail() and .catch() handlers
- `src/cli/wtconfig.ts` - Added --json support for show/get/validate subcommands, patched catch/default paths
- `src/lib/prs/command.ts` - Replaced manual JSON construction with createSuccessResult<PrsResultData>
- `src/lib/prs/types.ts` - Added PrsResultData interface, deprecated PrsJsonOutput
- `src/cli/prs.test.ts` - Added CommandResult envelope and error JSON tests

## Decisions Made

- **hasJsonFlag vs isJsonMode:** wtstate and wt use `hasJsonFlag(process.argv.slice(2))` because they don't have yargs middleware that sets JSON mode. wtlink uses `isJsonMode()` because it already calls `setJsonMode()` in middleware.
- **wtconfig scope:** Only show/get/validate get --json support. set/edit/init are interactive commands that don't make sense in JSON mode.
- **PrsJsonOutput kept deprecated:** The type is preserved with @deprecated JSDoc for any external consumers, but production code now uses PrsResultData exclusively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 1 empty commit from previous session**

- **Found during:** Task 1 (re-execution)
- **Issue:** The previous session's Task 1 commit (1fece64) was empty -- no files were actually committed due to lint-staged stash/restore cycle destroying the working tree changes
- **Fix:** Re-implemented all Task 1 changes from scratch and committed properly as 5d34f93
- **Files modified:** src/cli/wtstate.ts, src/cli/wtlink.ts, src/cli/wt.ts, src/cli/wtconfig.ts
- **Verification:** All 3148 tests pass, TypeScript compiles cleanly
- **Committed in:** 5d34f93

---

**Total deviations:** 1 auto-fixed (1 bug from previous session)
**Impact on plan:** Re-implementation was necessary due to empty commit. No scope creep.

## Issues Encountered

- Previous session's Task 1 commit (1fece64) was empty due to lint-staged stash/restore cycle destroying changes. Had to re-implement from plan specification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All CLI error paths now produce valid JSON when `--json` is passed
- Plan 04-04 (newpr JSON paths) can proceed with the same patterns established here
- The `hasJsonFlag()` and `isJsonMode()` patterns are well-established for future CLIs

---

## Self-Check: PASSED

- All 7 modified files exist on disk
- Both task commits (5d34f93, 2e5d956) found in git log
- 04-01-SUMMARY.md exists
- All key patterns verified in source files (hasJsonFlag, isJsonMode, createSuccessResult, PrsResultData)

---

_Phase: 04-json-output-and-llm-ergonomics_
_Completed: 2026-02-18_
