---
phase: 03-interactive-menu-reliability
plan: 03
subsystem: ui
tags: [terminal, raw-mode, sigint, ctrl-c, process-exit, cursor-visibility]

# Dependency graph
requires:
  - phase: 03-01
    provides: interactive menu infrastructure and menu flow patterns
provides:
  - Global terminal state safety net in wt.ts (cursor + raw mode restore on exit)
  - SIGINT/SIGTERM handlers in prs/interactive.ts following lswt gold standard
  - Graceful Ctrl+C handling that resolves promise instead of calling process.exit
affects: [04-mcp-annotation-layer, 05-lswt-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      global exit handler safety net,
      SIGINT handler registration/removal pattern,
      cursor show on cleanup,
    ]

key-files:
  created: []
  modified:
    - src/cli/wt.ts
    - src/lib/prs/interactive.ts
    - src/lib/prs/interactive.test.ts

key-decisions:
  - 'Global exit handler guards cursor-show with process.stdout.isTTY to avoid corrupting JSON/piped output'
  - 'SIGINT handleSignal calls cleanup then process.exit(0) as last resort for OS signals; Ctrl+C keypress resolves promise gracefully'

patterns-established:
  - "Global exit handler pattern: process.on('exit') with TTY-guarded cursor show and raw mode reset"
  - 'Signal handler pattern: register SIGINT/SIGTERM after raw mode, remove in cleanup, handleSignal calls cleanup+exit'

# Metrics
duration: 9min
completed: 2026-02-18
---

# Phase 3 Plan 3: Ctrl+C Terminal Cleanup Summary

**Global exit handler safety net in wt.ts and SIGINT/Ctrl+C handling in prs/interactive.ts following lswt gold standard pattern**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-18T20:51:47Z
- **Completed:** 2026-02-18T21:00:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added global `process.on('exit')` handler in wt.ts that restores cursor visibility and disables raw mode on any exit path
- Fixed prs/interactive.ts Ctrl+C to resolve the promise gracefully instead of calling `process.exit(0)` directly
- Added SIGINT/SIGTERM signal handlers in prs/interactive.ts following the lswt/interactive.ts gold standard pattern
- Added 5 new unit tests verifying terminal cleanup behavior (signal handler registration/removal, cursor restore, raw mode reset)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add global terminal state safety net and fix prs Ctrl+C handling** - `c3139ea` (feat)
2. **Task 2: Add tests for terminal cleanup behavior** - `cfc6d89` (test)

## Files Created/Modified

- `src/cli/wt.ts` - Added global process.on('exit') handler with TTY-guarded cursor show and raw mode reset
- `src/lib/prs/interactive.ts` - Added SIGINT/SIGTERM handlers, cursor show in cleanup, Ctrl+C resolves instead of process.exit
- `src/lib/prs/interactive.test.ts` - 5 new tests for terminal cleanup behavior (Ctrl+C, signal handlers, cursor, raw mode)

## Decisions Made

- Global exit handler guards `process.stdout.write('\x1b[?25h')` with `process.stdout.isTTY` check to prevent corrupting JSON output when stdout is piped
- SIGINT `handleSignal` function calls cleanup() then process.exit(0) as a last resort for OS-level signals, while the Ctrl+C keypress handler resolves the promise gracefully for normal user interaction

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guarded cursor-show escape in global exit handler with stdout.isTTY**

- **Found during:** Task 1 (global exit handler)
- **Issue:** The global exit handler unconditionally wrote `\x1b[?25h` to stdout, which corrupted JSON output when running `wt state --json` or `wt list --json` (escape sequence appended after JSON)
- **Fix:** Added `if (process.stdout.isTTY)` guard before writing cursor-show escape sequence
- **Files modified:** src/cli/wt.ts
- **Verification:** All 3134 tests pass including e2e JSON output tests that previously failed
- **Committed in:** c3139ea (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness -- without the TTY guard, all JSON CLI output would be corrupted. No scope creep.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 (Interactive Menu Reliability) is now complete
- All three menu-related improvements delivered: interactive menu (03-01), deduplicated prs command (03-02), Ctrl+C terminal cleanup (03-03)
- All 3134 tests pass across 101 test files
- Ready for Phase 4 (MCP Annotation Layer)

## Self-Check: PASSED

- FOUND: src/cli/wt.ts
- FOUND: src/lib/prs/interactive.ts
- FOUND: src/lib/prs/interactive.test.ts
- FOUND: 03-03-SUMMARY.md
- FOUND: commit c3139ea
- FOUND: commit cfc6d89

---

_Phase: 03-interactive-menu-reliability_
_Completed: 2026-02-18_
