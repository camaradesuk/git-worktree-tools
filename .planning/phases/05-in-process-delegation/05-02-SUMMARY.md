---
phase: 05-in-process-delegation
plan: 02
subsystem: cli
tags: [yargs, in-process, cleanpr, wtconfig, direct-call]

# Dependency graph
requires:
  - phase: 04-json-output-and-llm-ergonomics
    provides: JSON output envelope (createSuccessResult/createErrorResult/formatJsonResult)
  - phase: 02-shared-ui-primitives
    provides: printStatus, printError, printHeader, printNextSteps, changeIndicator
provides:
  - wt clean handler calling cleanpr library directly (no subprocess)
  - wt config handler calling wtconfig/config-migration libraries directly (no subprocess)
  - Complete in-process delegation for clean and config subcommands
affects: [05-03-PLAN, 05-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Direct library call pattern for medium-complexity wt subcommands (clean, config)'
    - 'Switch/case handler routing replacing if/else-with-fallthrough delegation'

key-files:
  created: []
  modified:
    - src/cli/wt/clean.ts
    - src/cli/wt/config.ts
    - src/cli/wt/wt.test.ts
    - src/cli/wt/config.test.ts

key-decisions:
  - "Config init redirects to 'wt init' instead of duplicating the wizard from wtconfig"
  - 'Config set (with key+value) saves to repo config by default (no interactive scope prompt)'
  - 'Config edit falls back to global config if no repo config found'
  - "printNextSteps updated to reference 'wt list', 'wt new', 'wt clean' instead of legacy lswt/newpr/cleanpr"

patterns-established:
  - 'Medium-complexity handler migration: port orchestration logic from legacy CLI entry point into wt handler'
  - 'Config subcommand routing: switch/case on subcommand string with direct library calls per case'

# Metrics
duration: 41min
completed: 2026-02-19
---

# Phase 5 Plan 2: Clean/Config In-Process Delegation Summary

**wt clean and wt config call library functions directly via ported orchestration logic and switch/case routing -- zero subprocess spawning**

## Performance

- **Duration:** 41 min
- **Started:** 2026-02-19T10:00:56Z
- **Completed:** 2026-02-19T10:42:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- wt clean calls gatherPrWorktreeInfo, cleanWorktree, getCleanableWorktrees etc. directly from cleanpr library
- wt config handles all 9 subcommands (interactive, show, get, set, edit, init, validate, migrate, schema) without subprocess delegation
- Updated test suites mock library modules directly instead of runSubcommand
- printNextSteps in clean handler now references wt CLI commands instead of legacy binaries

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate wt/clean.ts from subprocess to direct library calls** - `2dec4ce` (feat)
2. **Task 2: Migrate wt/config.ts remaining subprocess calls and update tests** - `876e0c2` (feat)

## Files Created/Modified

- `src/cli/wt/clean.ts` - Replaced runSubcommand('cleanpr') with ported orchestration logic from cleanpr.ts
- `src/cli/wt/config.ts` - Replaced runSubcommand('wtconfig') with switch/case routing to direct library calls
- `src/cli/wt/wt.test.ts` - Added cleanpr/index.js mock, updated clean tests for direct library call assertions
- `src/cli/wt/config.test.ts` - Replaced runSubcommand mock with wtconfig/index.js and config-migration mocks

## Decisions Made

- **Config init redirects to wt init:** Rather than duplicating the interactive setup wizard from wtconfig.ts, `wt config init` prints a helpful message directing users to `wt init`, which is the canonical initialization command.
- **Config set saves to repo config by default:** The legacy `wtconfig set` prompted which scope (repo/global) to save to via inquirer. The new `wt config set` saves directly to repo config without prompting, which is simpler and more scriptable. Single-key set still uses interactive quick edit.
- **Config edit uses spawnSync for editor:** The edit subcommand still uses `spawnSync` to open the editor (this is intentional -- it's opening a user's text editor, not delegating to a CLI subprocess).
- **Updated legacy command references:** All `printNextSteps` calls in the clean handler now reference `wt list`, `wt new`, and `wt clean` instead of the legacy `lswt`, `newpr`, and `cleanpr` binaries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Config.ts reverted by linter during write**

- **Found during:** Task 2 (config.ts migration)
- **Issue:** The project's lint-staged / pre-commit hook reverted config.ts to its original content when config.test.ts was written in the same batch
- **Fix:** Wrote config.ts separately, ran prettier before staging, then committed
- **Files modified:** src/cli/wt/config.ts
- **Verification:** File content verified via grep; build and tests pass
- **Committed in:** 876e0c2

**2. [Rule 1 - Bug] Used require('fs') instead of ESM import**

- **Found during:** Task 2 (config.ts edit handler)
- **Issue:** Initial implementation used `require('fs')` which doesn't work well in ESM modules
- **Fix:** Changed to `import * as fs from 'fs'` at top of file
- **Files modified:** src/cli/wt/config.ts
- **Verification:** Build passes without warnings
- **Committed in:** 876e0c2

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- Lint-staged/pre-commit hooks repeatedly reverted files during batch writes. Resolved by formatting files with prettier before staging and committing separately.
- Plan 05-01 changes were found uncommitted in working tree at start of session. Committed them as a separate commit before starting plan 05-02 work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- clean and config are now fully migrated to direct library calls
- Remaining wt subcommands using subprocess: new, link (targets for plans 05-03 and 05-04)
- All 3199 tests pass across 102 test files

---

_Phase: 05-in-process-delegation_
_Completed: 2026-02-19_
