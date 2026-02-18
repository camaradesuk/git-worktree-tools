# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Every `wt` subcommand behaves consistently, predictably, and leaves a clear audit trail — so developers trust the tool and can debug it when something goes wrong.
**Current focus:** Phase 2 in progress — Shared UI Primitives

## Current Position

Phase: 2 of 5 (Shared UI Primitives) — COMPLETE
Plan: 3 of 3 in current phase (02-03 complete)
Status: Phase 2 Complete
Last activity: 2026-02-18 — Completed 02-03-PLAN.md (standardize error rendering to title+detail+hint)

Progress: [██████░░░░] 60%

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: 11min
- Total execution time: 65min

**By Phase:**

| Phase                   | Plans | Total | Avg/Plan |
| ----------------------- | ----- | ----- | -------- |
| 01-logger-wiring        | 3/3   | 28min | 9min     |
| 02-shared-ui-primitives | 3/3   | 37min | 12min    |

**Recent Trend:**

- Last 5 plans: 01-03 (16min), 02-01 (9min), 02-02 (20min), 02-03 (8min)
- Trend: Stable

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: `wt` becomes primary; legacy binaries become deprecated aliases (pending implementation)
- Roadmap: Shared `logger` singleton used for all debug/audit output — eliminates the `DEBUG=newpr` two-system split
- Roadmap: No new TUI framework — `manage-manifest.ts` treated as a black box; touch only for specific named bugs
- 01-01: LogLevel enum values changed to consola-compatible (SILENT=-999, ERROR=0, WARN=1, INFO=3, DEBUG=4, TRACE=5)
- 01-01: Removed --debug and --log-file CLI options; --verbose replaces --debug, audit log is automatic
- 01-01: Config-based logger re-initialization removed; new logger handles GWT_LOG_LEVEL env var internally
- 01-02: lswt --verbose serves dual purpose (display + logger verbose); no separate logging flag needed
- 01-02: wtlink manage --verbose promoted to global yargs option
- 01-02: Belt-and-suspenders flag forwarding from wt wrappers: CLI args + GWT_LOG_LEVEL/NO_COLOR env vars
- 01-03: Used dynamic import + vi.spyOn for ESM module mocking of getGlobalDataDir
- 01-03: Used process.emit('exit', 0) for exit handler testing without process termination
- 02-01: All ui/ print functions route through print()/printErr() as single JSON-mode gate
- 02-01: Box border width fixed at 58 chars matching existing newpr output
- 02-01: changeIndicator standardizes on compact `*` form (cleanpr migrates in 02-02)
- 02-02: Consolidated checkout error in newpr.ts into printError({title, detail}) to preserve stderr routing
- 02-02: Extracted getWtlinkHint() to eliminate duplicated error hint logic in wtlink.ts
- 02-02: CLI error catch pattern: errorToDisplay(error) + printError(display) + process.exit(1)
- 02-02: cleanpr group label colors (Merged/Closed/Open/Unknown) kept as raw console.log -- decorative, not status
- 02-03: exitWithError() uses getErrorSuggestion(code) to auto-populate hints from error code mapping
- 02-03: validate-manifest.ts does NOT print errors; throws ManifestError for caller to display (avoids double-display)
- 02-03: Checkout failure in newpr splits resolution steps into hint (dim) instead of detail (plain)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3: The exact mechanism of the `wt prs` broken duplicate code path needs confirmation before planning begins (noted in research SUMMARY.md gaps)
- Phase 3: PTY tests may silently skip on CI (`node-pty` native addon); non-PTY smoke tests required alongside any menu changes
- Phase 4: MCP annotation baseline is unknown; Phase 4 planning must start with a full audit of `src/mcp/server.ts`
- Phase 5: `lswt` TTY-aware interactive mode has behavioral subtleties; pre-implementation coverage pass recommended before migrating

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 02-03-PLAN.md — Phase 2 complete, all error paths use printError() with title+detail+hint
Resume file: None
