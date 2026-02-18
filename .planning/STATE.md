# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Every `wt` subcommand behaves consistently, predictably, and leaves a clear audit trail — so developers trust the tool and can debug it when something goes wrong.
**Current focus:** Phase 4 in progress — JSON Output and LLM Ergonomics

## Current Position

Phase: 4 of 5 (JSON Output and LLM Ergonomics)
Plan: 3 of 4 in current phase
Status: Plan 04-03 complete
Last activity: 2026-02-18 — Completed 04-03 MCP tool annotations

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: 11min
- Total execution time: 122min

**By Phase:**

| Phase                             | Plans | Total | Avg/Plan |
| --------------------------------- | ----- | ----- | -------- |
| 01-logger-wiring                  | 3/3   | 28min | 9min     |
| 02-shared-ui-primitives           | 3/3   | 37min | 12min    |
| 03-interactive-menu-reliability   | 3/3   | 24min | 8min     |
| 04-json-output-and-llm-ergonomics | 1/4   | 19min | 19min    |

**Recent Trend:**

- Last 5 plans: 02-03 (8min), 03-01 (7min), 03-02 (8min), 03-03 (9min), 04-02 (19min)
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
- 03-01: COMPLETED_EXIT replaced with COMPLETED_RETURN (returnToMenu: true) -- all menu flows loop back
- 03-01: wtlink sync maps to 'wtlink link' subcommand (actual CLI command for hard link creation)
- 03-01: wtlink view/add/remove use loadManifestData/saveManifestData directly instead of spawning subprocesses
- 03-02: Re-export runPrsCommand and outputJsonError from cli/prs.ts for downstream consumers
- 03-02: cli/wt/prs.ts imports only runPrsCommand (outputJsonError not needed by yargs handler)
- 03-03: Global exit handler guards cursor-show with process.stdout.isTTY to avoid corrupting JSON/piped output
- 03-03: SIGINT handleSignal calls cleanup+process.exit(0) as last resort; Ctrl+C keypress resolves promise gracefully
- 04-02: wt wrapper flag naming uses descriptive names (--delete-remote) even when underlying CLI uses short names (--remote)
- 04-02: Only expose flags in wt wrappers that the underlying CLI actually accepts (removed --stash-untracked bug)
- 04-02: --filter and --refresh cannot be added to wt list until upstream lswt parseArgs supports them

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3: RESOLVED -- wt prs duplicate code path confirmed and fixed in 03-02 (missing refreshPrs callback)
- Phase 3: PTY tests may silently skip on CI (`node-pty` native addon); non-PTY smoke tests required alongside any menu changes
- Phase 4: MCP annotation baseline is unknown; Phase 4 planning must start with a full audit of `src/mcp/server.ts`
- Phase 5: `lswt` TTY-aware interactive mode has behavioral subtleties; pre-implementation coverage pass recommended before migrating

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 04-02-PLAN.md (help text audit)
Resume file: None
