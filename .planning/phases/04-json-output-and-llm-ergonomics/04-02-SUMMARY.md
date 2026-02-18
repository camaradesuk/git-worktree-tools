---
phase: 04-json-output-and-llm-ergonomics
plan: 02
subsystem: cli
tags: [yargs, help-text, shell-completion, flags]

# Dependency graph
requires: []
provides:
  - Complete and accurate --help text for all 9 wt subcommands
  - Shell completion scripts (zsh/fish) updated to match all flags
affects:
  - 04-json-output-and-llm-ergonomics (downstream plans rely on accurate help text)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'wt wrapper flag naming uses descriptive names (--delete-remote) even when underlying CLI uses short names (--remote)'
    - 'Flags forwarded to subprocess CLIs must exist in the underlying parseArgs to avoid rejection'

key-files:
  created: []
  modified:
    - src/cli/wt/state.ts
    - src/cli/wt/clean.ts
    - src/cli/wt/config.ts
    - src/cli/wt/new.ts
    - src/cli/wt/link.ts
    - src/cli/wt/completion.ts
    - src/cli/wt/wt.test.ts
    - src/cli/wt/config.test.ts

key-decisions:
  - 'Renamed --remote to --delete-remote in wt clean for clarity and discoverability; still forwards as --remote to underlying cleanpr CLI'
  - 'Added --base-branch to wt state (forwards as --base to wtstate) for consistency with other flag naming patterns'
  - 'Removed --stash-untracked from wt new because the underlying newpr CLI rejects it as unknown; this was a pre-existing bug'
  - 'Did not add --filter or --refresh to wt list because the underlying lswt CLI rejects unknown flags; these would need to be added to lswt first'
  - 'Added all 12 StateActionKey values as --action choices in wt new for explicit discoverability'

patterns-established:
  - 'Wrapper-to-CLI flag forwarding: only expose flags in wt wrappers that the underlying CLI actually accepts'
  - 'Shell completions must be updated alongside any flag changes in wt wrapper files'

# Metrics
duration: 19min
completed: 2026-02-18
---

# Phase 04 Plan 02: Help Text Audit Summary

**All 9 wt subcommands audited for help text accuracy; added --base-branch, --delete-remote, --draft, --plan, --confirm-hooks flags and complete --action choices with 12 StateActionKey values**

## Performance

- **Duration:** 19 min
- **Started:** 2026-02-18T21:40:49Z
- **Completed:** 2026-02-18T22:00:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Audited all 9 wt subcommand wrappers against their underlying CLI parseArgs definitions
- Added 5 missing flags (--base-branch, --delete-remote, --draft, --plan, --no-plan, --confirm-hooks) with proper forwarding
- Explicitly listed all 12 valid StateActionKey values in --action choices for wt new
- Updated zsh and fish shell completion scripts to match all flag changes
- Fixed pre-existing bug where --stash-untracked was forwarded to newpr which rejects it

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit and fix help text for state, clean, list, config** - `47da4a0` (feat)
2. **Task 2: Audit and fix help text for prs, link, init, new** - `f524728` (feat)

## Files Created/Modified

- `src/cli/wt/state.ts` - Added --base-branch option forwarded as --base to wtstate
- `src/cli/wt/clean.ts` - Renamed --remote to --delete-remote for clarity
- `src/cli/wt/config.ts` - Added --json flag and migrate subcommand to help text
- `src/cli/wt/new.ts` - Added --draft, --plan, --no-plan, --confirm-hooks; removed --stash-untracked; added action choices
- `src/cli/wt/link.ts` - Added migrate subcommand with deprecation notice
- `src/cli/wt/completion.ts` - Updated zsh and fish completions for all flag changes
- `src/cli/wt/wt.test.ts` - Updated tests for renamed --delete-remote, removed stash-untracked, added new flag tests
- `src/cli/wt/config.test.ts` - Added --json option mock to builder test

## Decisions Made

- **--delete-remote vs --remote:** Chose descriptive `--delete-remote` name in the wt wrapper (forwarded as `--remote` to cleanpr) for better discoverability and clarity about what the flag does
- **No --filter/--refresh for wt list:** These flags cannot be added because the underlying `lswt` CLI uses strict arg parsing and rejects unknown flags. Would need to be added to lswt first.
- **Removed --stash-untracked:** The underlying newpr CLI does not support this flag -- forwarding it causes "Unknown option" errors. This was a pre-existing bug in the wt wrapper.
- **All 12 action choices:** Rather than abbreviating or omitting, listed all valid StateActionKey values as explicit choices so --help fully documents the API

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed --stash-untracked flag from wt new**

- **Found during:** Task 2 (wt/new.ts audit)
- **Issue:** The `--stash-untracked` flag was defined in wt/new.ts and forwarded to newpr, but newpr's parseArgs rejects it with "Unknown option: --stash-untracked"
- **Fix:** Removed the flag definition from yargs builder, removed forwarding from handler, updated tests and shell completions
- **Files modified:** src/cli/wt/new.ts, src/cli/wt/wt.test.ts, src/cli/wt/completion.ts
- **Verification:** `npx tsx src/cli/newpr.ts --stash-untracked --help` confirms rejection; all 3146 tests pass
- **Committed in:** f524728 (Task 2 commit)

**2. [Rule 3 - Blocking] Skipped --filter and --refresh for wt list**

- **Found during:** Task 1 (wt/list.ts audit)
- **Issue:** Plan called for adding `--refresh` and verifying `--filter` in wt list, but the underlying lswt CLI uses strict arg parsing (`if (arg.startsWith('-')) return { kind: 'error', message: 'Unknown option' }`) and would reject these flags
- **Fix:** Did not add these flags to avoid forwarding errors. Documented as requiring upstream lswt changes first.
- **Files modified:** None (no change made)
- **Verification:** Confirmed lswt parseArgs rejects unknown flags
- **Committed in:** N/A (no code change)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Bug fix was necessary for correctness. Skipping --filter/--refresh prevents runtime errors -- these flags need upstream lswt support first.

## Issues Encountered

- Linter auto-reverted test file changes during initial edit cycle, requiring re-application of edits
- Several unrelated files showed modifications from a previous editing session; restored them with `git checkout` before committing

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All wt subcommand help text is now accurate and complete
- Shell completion scripts are synchronized with all flag changes
- Ready for remaining Phase 04 plans (JSON output formatting, MCP annotations, etc.)

## Self-Check: PASSED

All 8 modified files verified on disk. Both task commits (47da4a0, f524728) verified in git log.

---

_Phase: 04-json-output-and-llm-ergonomics_
_Completed: 2026-02-18_
