---
phase: 02-shared-ui-primitives
plan: 03
subsystem: ui
tags: [error-handling, printError, hints, structured-errors, ManifestError]

# Dependency graph
requires:
  - phase: 02-shared-ui-primitives
    provides: printError(), errorToDisplay(), printStatus(), printDim() UI primitives and CLI wiring
provides:
  - Every error path in newpr, cleanpr, lswt, wtlink uses printError() with title+detail+hint
  - exitWithError() in newpr.ts includes error code hints for non-JSON output
  - validate-manifest.ts throws ManifestError with issues array (no double-display)
  - wtlink .fail() handler extracts ManifestError issues as structured detail
affects: [03-prs-wtstate-error-output, 04-mcp-annotations]

# Tech tracking
tech-stack:
  added: []
  patterns: [ManifestError with issues array for structured error propagation]

key-files:
  created: []
  modified:
    - src/cli/newpr.ts
    - src/cli/cleanpr.ts
    - src/cli/lswt.ts
    - src/cli/wtlink.ts
    - src/lib/wtlink/validate-manifest.ts
    - src/lib/ui/error.test.ts

key-decisions:
  - 'exitWithError() uses getErrorSuggestion(code) to auto-populate hints from error code mapping'
  - 'validate-manifest.ts does NOT print errors; throws ManifestError for caller to display (avoids double-display)'
  - 'Checkout failure in newpr splits resolution steps into hint (dim) instead of detail (plain)'

patterns-established:
  - 'Error propagation via ManifestError.issues: throw structured error, let caller format via printError()'
  - 'Every user-facing error in core CLIs uses title+hint at minimum; detail added when contextual info available'

# Metrics
duration: 8min
completed: 2026-02-18
---

# Phase 2 Plan 3: Standardize Error Rendering Summary

**Every error path in newpr/cleanpr/lswt/wtlink now uses printError() with title+detail+hint format; validate-manifest throws ManifestError instead of printing directly**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-18T19:58:05Z
- **Completed:** 2026-02-18T20:06:17Z
- **Tasks:** 8
- **Files modified:** 6

## Accomplishments

- All `exitWithError()` calls in newpr.ts now include contextual hints via `getErrorSuggestion(code)`
- Checkout failure hint in newpr uses dim color (hint field) instead of blue/info color (detail field)
- cleanpr.ts PR-not-found and not-a-git-repo errors include hints
- lswt.ts GH CLI warning shows dim install URL hint
- validate-manifest.ts eliminates double-display by throwing ManifestError instead of console.error
- wtlink.ts .fail() handler extracts ManifestError issues as structured detail
- 5 new integration tests for error rendering scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor exitWithError() in newpr.ts** - `d956a1c` (feat)
2. **Task 2: Fix checkout failure hint in newpr.ts** - `5e5e69e` (fix)
3. **Task 3: Standardize error output in cleanpr.ts** - `778d8a8` (feat)
4. **Task 4: Standardize error output in lswt.ts** - `8e72f6a` (feat)
5. **Task 5: Standardize error output in validate-manifest.ts** - `73d66d7` (feat)
6. **Task 6: Standardize newpr checkPrerequisites()** - `a97e88d` (feat)
7. **Task 7: Write integration tests for error rendering** - `5c2f57c` (test)
8. **Task 8: Final audit** - (read-only, no commit needed)

## Files Created/Modified

- `src/cli/newpr.ts` - exitWithError() with hints, checkPrerequisites() with hints, checkout failure detail/hint split
- `src/cli/cleanpr.ts` - PR-not-found and not-a-git-repo hints added
- `src/cli/lswt.ts` - GH CLI warning install URL hint, printDim import
- `src/cli/wtlink.ts` - ManifestError import, .fail()/.catch() extract issues as detail, manifest hint mapping
- `src/lib/wtlink/validate-manifest.ts` - ManifestError throw instead of console.error, ManifestError import
- `src/lib/ui/error.test.ts` - 5 new integration-style tests for error rendering

## Decisions Made

- **exitWithError() uses getErrorSuggestion(code):** Rather than manually specifying hints at each call site, the function auto-populates hints from the existing error code mapping. This ensures every error code that has a suggestion gets shown as a hint automatically.
- **validate-manifest.ts does NOT print errors:** The plan noted the double-display problem -- if validate-manifest prints AND the .fail() handler prints, users see the error twice. Solution: only throw (ManifestError carries issues array), and the caller formats via printError().
- **Checkout failure uses hint (not detail) for resolution steps:** The multi-line numbered steps (commit first, stash, different branch point) are guidance, not error details. Using `hint` renders them in dim color, matching the semantic intent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 (Shared UI Primitives) is now complete -- all 3 plans executed
- The pattern of printError() with title+detail+hint is established across all core CLI commands
- Remaining CLI files (wtstate.ts, prs.ts, wtconfig.ts) are out of Phase 2 scope and can be addressed in Phase 3 or later
- Ready to proceed to Phase 3 planning

## Self-Check: PASSED

All 6 modified files verified on disk. All 7 task commits verified in git log.

---

_Phase: 02-shared-ui-primitives_
_Completed: 2026-02-18_
