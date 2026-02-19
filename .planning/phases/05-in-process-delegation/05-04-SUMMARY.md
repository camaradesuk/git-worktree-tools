---
phase: 05-in-process-delegation
plan: 04
subsystem: cli
tags: [deprecation, interactive-menu, documentation, stderr, in-process]

# Dependency graph
requires:
  - phase: 05-01
    provides: lswt/state/prs handler exports and table extraction
  - phase: 05-02
    provides: clean/config/state in-process handlers in wt subcommands
  - phase: 05-03
    provides: new/link in-process handlers with isMain guard pattern
provides:
  - Shared deprecation utility (printDeprecationNotice) for all legacy CLIs
  - Interactive menu fully migrated to direct library calls (zero subprocess spawning)
  - README presenting wt as canonical entry point with legacy deprecation table
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Deprecation notice via process.stderr.write with JSON/env-var suppression'
    - 'Interactive menu direct library imports replacing runSubcommandForResult'

key-files:
  created:
    - src/lib/deprecation.ts
    - src/lib/deprecation.test.ts
  modified:
    - src/cli/newpr.ts
    - src/cli/cleanpr.ts
    - src/cli/lswt.ts
    - src/cli/wtlink.ts
    - src/cli/wtstate.ts
    - src/cli/wtconfig.ts
    - src/cli/wt/interactive-menu.ts
    - src/cli/wt/interactive-menu.test.ts
    - src/lib/newpr/args.ts
    - src/lib/cleanpr/args.ts
    - src/lib/lswt/args.ts
    - src/lib/wtstate/args.ts
    - README.md

key-decisions:
  - 'Deprecation uses process.stderr.write directly (not logger) to avoid requiring logger init in legacy CLIs'
  - 'printDeprecationNotice suppresses on --json and GWT_NO_DEPRECATION_WARNINGS=1'
  - 'Interactive menu calls gatherWorktreeInfo, runNewprHandler, analyzeState etc. directly instead of subprocess spawning'
  - 'README Legacy Commands section provides migration table for all 6 deprecated standalone commands'

patterns-established:
  - 'Deprecation pattern: import printDeprecationNotice, call at top of main() before arg parsing'
  - 'Help text deprecation: add DEPRECATED line to getHelpText() or yargs .epilog()'

# Metrics
duration: 15min
completed: 2026-02-19
---

# Phase 05 Plan 04: Deprecation Notices, Menu Migration, and README Update Summary

**Deprecation notices on all 6 legacy CLIs via shared utility, interactive menu fully migrated to direct library calls, README canonicalizes wt with legacy deprecation table**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-19T11:18:00Z
- **Completed:** 2026-02-19T11:33:08Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Created shared deprecation utility (`printDeprecationNotice`) with JSON and env-var suppression
- Added deprecation notices to all 6 legacy CLI entry points (newpr, cleanpr, lswt, wtlink, wtstate, wtconfig)
- Added deprecation epilog to all legacy CLI --help output
- Migrated interactive menu from subprocess spawning (`runSubcommandForResult`) to direct library function calls
- Updated README to present `wt` as canonical entry point with Legacy Commands (Deprecated) section
- Cleaned stale `--debug` and `--log-file` references from README

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared deprecation utility and add notices to all legacy CLI entry points** - `b42b5f4` (feat)
2. **Task 2: Migrate interactive menu runSubcommandForResult calls to direct library calls** - `70af18a` (feat)
3. **Task 3: Update README to present wt as canonical entry point with legacy commands as deprecated** - `a2ab4bf` (docs)

## Files Created/Modified

- `src/lib/deprecation.ts` - Shared deprecation notice utility with JSON/env-var suppression
- `src/lib/deprecation.test.ts` - 6 tests covering normal output, suppression modes, message content
- `src/cli/newpr.ts` - Added printDeprecationNotice('newpr', 'wt new') call
- `src/cli/cleanpr.ts` - Added printDeprecationNotice('cleanpr', 'wt clean') call
- `src/cli/lswt.ts` - Added printDeprecationNotice('lswt', 'wt list') call
- `src/cli/wtlink.ts` - Added printDeprecationNotice('wtlink', 'wt link') call and deprecation epilog
- `src/cli/wtstate.ts` - Added printDeprecationNotice('wtstate', 'wt state') call
- `src/cli/wtconfig.ts` - Added printDeprecationNotice('wtconfig', 'wt config') call and deprecation text in help
- `src/lib/newpr/args.ts` - Added DEPRECATED line to getHelpText()
- `src/lib/cleanpr/args.ts` - Added DEPRECATED line to getHelpText()
- `src/lib/lswt/args.ts` - Added DEPRECATED line to getHelpText()
- `src/lib/wtstate/args.ts` - Added DEPRECATED line to getHelpText()
- `src/cli/wt/interactive-menu.ts` - Complete rewrite replacing all runSubcommandForResult with direct library imports
- `src/cli/wt/interactive-menu.test.ts` - Complete rewrite of 65 tests verifying direct library call patterns
- `README.md` - Canonical wt presentation, Legacy Commands section, stale flag cleanup

## Decisions Made

- Used `process.stderr.write` directly for deprecation notices (not the logger) to avoid requiring logger initialization in legacy CLI entry points that call `printDeprecationNotice` before any setup
- Suppression logic checks `process.argv.includes('--json')` and `process.env.GWT_NO_DEPRECATION_WARNINGS === '1'` independently
- Interactive menu calls library functions directly (e.g., `runNewprHandler`, `gatherWorktreeInfo`, `analyzeState`) instead of spawning subprocesses via `runSubcommandForResult`
- README removes legacy command names from section headings (e.g., "wt new" instead of "wt new / newpr") and adds dedicated Legacy Commands (Deprecated) section with migration table

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error with process.stderr.write mock**

- **Found during:** Task 1 (deprecation test creation)
- **Issue:** `vi.spyOn(process.stderr, 'write').mockImplementation(() => true)` caused TypeScript overload incompatibility
- **Fix:** Used direct property replacement: `process.stderr.write = ((chunk) => { ... }) as typeof process.stderr.write`
- **Files modified:** `src/lib/deprecation.test.ts`
- **Verification:** Tests pass, TypeScript compiles
- **Committed in:** `b42b5f4` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed missing `interactive` field in CleanOptions**

- **Found during:** Task 2 (interactive menu migration)
- **Issue:** `runCleanInProcess` built a `CleanOptions` object without the required `interactive` boolean field
- **Fix:** Added `interactive: false` to the CleanOptions object
- **Files modified:** `src/cli/wt/interactive-menu.ts`
- **Verification:** Build succeeds, tests pass
- **Committed in:** `70af18a` (Task 2 commit)

**3. [Rule 1 - Bug] Fixed missing `baseBranch` in WtstateOptions**

- **Found during:** Task 2 (interactive menu migration)
- **Issue:** `analyzeState({ verbose: false, json: false })` missing required `baseBranch` field
- **Fix:** Added `baseBranch: 'main'` to the options object
- **Files modified:** `src/cli/wt/interactive-menu.ts`
- **Verification:** Build succeeds, tests pass
- **Committed in:** `70af18a` (Task 2 commit)

**4. [Rule 2 - Missing Critical] Cleaned stale --log-file reference in README**

- **Found during:** Task 3 (README update)
- **Issue:** Logging configuration section still referenced `--log-file` flag that was removed in Phase 01
- **Fix:** Updated to reference `--no-color` instead
- **Files modified:** `README.md`
- **Verification:** Grep confirms no stale flag references remain
- **Committed in:** `a2ab4bf` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 05 (In-Process Delegation) is now complete -- all 4 plans executed
- All `wt` subcommands operate via direct library calls (zero subprocess spawning)
- All legacy CLIs show deprecation notices directing users to `wt` equivalents
- README canonicalizes `wt` as the primary entry point
- 3207 tests passing across 103 test files

## Self-Check: PASSED

All 6 key files verified present. All 3 task commit hashes verified in git log.

---

_Phase: 05-in-process-delegation_
_Completed: 2026-02-19_
