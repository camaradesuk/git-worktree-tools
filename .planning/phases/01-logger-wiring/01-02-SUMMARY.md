---
phase: 01-logger-wiring
plan: 02
subsystem: logging
tags: [cli-flags, verbose, quiet, no-color, initializeLogger, logger-wiring, yargs-middleware]

# Dependency graph
requires:
  - phase: 01-logger-wiring/01
    provides: 'consola-based logger singleton with initializeLogger() and setAuditContext()'
provides:
  - '--verbose, --quiet, --no-color flags accepted by all 4 legacy CLIs (newpr, cleanpr, lswt, wtlink)'
  - 'initializeLogger() called at startup in all 4 legacy CLI entry points'
  - 'newpr debug() function replaced with logger.debug() throughout'
  - 'wt subcommand wrappers forward logging flags to child processes via args and env vars'
  - 'runSubcommand() accepts optional envOverrides parameter'
affects: [01-logger-wiring/03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [flag-forwarding-via-args-and-env, yargs-middleware-for-logger-init, audit-context-enrichment]

key-files:
  created: []
  modified:
    - src/lib/newpr/args.ts
    - src/lib/newpr/types.ts
    - src/lib/cleanpr/args.ts
    - src/lib/cleanpr/types.ts
    - src/lib/lswt/args.ts
    - src/lib/lswt/types.ts
    - src/cli/newpr.ts
    - src/cli/cleanpr.ts
    - src/cli/lswt.ts
    - src/cli/wtlink.ts
    - src/cli/wt/new.ts
    - src/cli/wt/clean.ts
    - src/cli/wt/list.ts
    - src/cli/wt/link.ts
    - src/cli/wt/run-command.ts

key-decisions:
  - 'lswt --verbose serves dual purpose: display (full paths/hashes) and logger verbose -- no separate flag needed'
  - 'wtlink manage --verbose removed from subcommand level, promoted to global --verbose option'
  - '--verbose and --quiet are mutually exclusive in newpr, cleanpr, and lswt parsers'
  - 'wt wrappers use belt-and-suspenders: forward flags via CLI args AND set GWT_LOG_LEVEL/NO_COLOR env vars'
  - 'setAuditContext() called in newpr mode functions to enrich audit log with prNumber, worktreePath, gitBranch'

patterns-established:
  - 'Flag forwarding pattern: wt subcommands push --verbose/--quiet/--no-color to args[] and set envOverrides{} before runSubcommand()'
  - 'initializeLogger placement: called immediately after parseArgs succeeds, before business logic'
  - 'Yargs middleware pattern: initializeLogger in .middleware() callback for yargs-based CLIs (wtlink)'

# Metrics
duration: 17min
completed: 2026-02-18
---

# Phase 1 Plan 2: CLI Flag Wiring Summary

**Wired --verbose/--quiet/--no-color into all 4 legacy CLIs with initializeLogger(), removed newpr debug() function, and forwarded flags from wt wrappers to child processes**

## Performance

- **Duration:** 17 min
- **Started:** 2026-02-18T17:43:55Z
- **Completed:** 2026-02-18T18:01:00Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- All 4 legacy CLIs (newpr, cleanpr, lswt, wtlink) accept --verbose, --quiet, --no-color flags
- All 4 legacy CLIs call initializeLogger() at startup with parsed flags, connecting to the consola logger singleton
- newpr.ts DEBUG_ENABLED constant and debug() function completely removed; all 13 debug() call sites replaced with logger.debug()
- All 4 wt subcommand wrappers (new, clean, list, link) forward logging flags to child processes via CLI args and environment variables
- runSubcommand() updated to accept optional envOverrides for belt-and-suspenders flag forwarding
- setAuditContext() called in newpr mode functions to enrich audit log entries with PR number, worktree path, and branch name
- Mutual exclusivity validation added: --verbose + --quiet produces clear error in newpr, cleanpr, and lswt

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --verbose/--quiet/--no-color to all 4 legacy arg parsers and types** - `1c8b3ac` (feat)
2. **Task 2: Wire initializeLogger into all 4 legacy CLI entry points and migrate newpr debug calls** - `e7342e9` (feat)
3. **Task 3: Forward --verbose/--quiet/--no-color from wt subcommand wrappers to child processes** - `16ca52b` (feat)

## Files Created/Modified

- `src/lib/newpr/args.ts` - Added --verbose (-v), --quiet, --no-color cases and help text
- `src/lib/newpr/types.ts` - Added verbose/quiet/noColor fields to Options interface
- `src/lib/cleanpr/args.ts` - Added --verbose, --quiet, --no-color cases and help text
- `src/lib/cleanpr/types.ts` - Added verbose/quiet/noColor fields to CleanOptions interface
- `src/lib/lswt/args.ts` - Added --quiet, --no-color cases (--verbose already existed) and help text
- `src/lib/lswt/types.ts` - Added quiet/noColor fields to ListOptions interface
- `src/cli/newpr.ts` - Added initializeLogger, removed debug()/DEBUG_ENABLED, replaced with logger.debug(), added setAuditContext
- `src/cli/cleanpr.ts` - Added initializeLogger and logger.debug() at key decision points
- `src/cli/lswt.ts` - Added initializeLogger
- `src/cli/wtlink.ts` - Added global --verbose/--quiet/--no-color options, yargs middleware for initializeLogger, removed manage subcommand --verbose
- `src/cli/wt/new.ts` - Forward logging flags to newpr child process
- `src/cli/wt/clean.ts` - Forward logging flags to cleanpr child process
- `src/cli/wt/list.ts` - Forward logging flags to lswt child process
- `src/cli/wt/link.ts` - Forward logging flags to wtlink child process
- `src/cli/wt/run-command.ts` - Added envOverrides parameter to runSubcommand and runSubcommandForResult

## Decisions Made

- lswt's existing --verbose flag serves dual purpose (display detail + logger verbose) -- no separate logging flag needed
- wtlink manage's --verbose option removed from subcommand builder and promoted to global yargs option
- Mutual exclusivity of --verbose and --quiet enforced at parse time in all hand-rolled parsers
- Belt-and-suspenders approach for wt wrapper flag forwarding: both CLI args and env vars set
- setAuditContext enriches audit log entries with PR/worktree context as values become known during execution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All CLI entry points now wire through the shared logger system
- Plan 03 will add comprehensive logger integration tests covering the end-to-end flag behavior
- All 3044 tests pass, zero build errors

## Self-Check: PASSED

- SUMMARY.md exists at expected path
- All 3 task commits verified (1c8b3ac, e7342e9, 16ca52b)
- All 15 modified files exist on disk
- Build passes with zero errors
- All 3044 tests pass (95 test files)

---

_Phase: 01-logger-wiring_
_Completed: 2026-02-18_
