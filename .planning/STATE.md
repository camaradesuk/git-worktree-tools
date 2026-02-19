# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Every `wt` subcommand behaves consistently, predictably, and leaves a clear audit trail — so developers trust the tool and can debug it when something goes wrong.
**Current focus:** Phase 5 complete — all 17 plans across 5 phases executed successfully

## Current Position

Phase: 5 of 5 (In-Process Delegation)
Plan: 4 of 4 in current phase
Status: Phase Complete
Last activity: 2026-02-19 — Completed 05-04 (deprecation notices, menu migration, README update)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 17
- Average duration: 14min
- Total execution time: 233min

**By Phase:**

| Phase                             | Plans | Total | Avg/Plan |
| --------------------------------- | ----- | ----- | -------- |
| 01-logger-wiring                  | 3/3   | 28min | 9min     |
| 02-shared-ui-primitives           | 3/3   | 37min | 12min    |
| 03-interactive-menu-reliability   | 3/3   | 24min | 8min     |
| 04-json-output-and-llm-ergonomics | 4/4   | 70min | 18min    |
| 05-in-process-delegation          | 4/4   | 74min | 19min    |

**Recent Trend:**

- Last 5 plans: 04-04 (5min), 05-01 (included in 05-02), 05-02 (41min), 05-03 (18min), 05-04 (15min)
- Trend: Phase 05 complete; 05-04 fast (deprecation utility + menu rewrite + README = well-scoped plan)

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
- 04-03: Export tools array from server.ts for test access; mock MCP SDK server/transport to prevent startup
- 04-03: Shared commandResultBase object for DRY outputSchema definitions across all 5 MCP tools
- 04-03: All MCP error paths (validation, default, catch) use createErrorResult() for consistent envelope
- 04-01: hasJsonFlag() for CLIs without yargs middleware (wtstate, wt); isJsonMode() for CLIs with middleware (wtlink)
- 04-01: wtconfig show/get/validate get --json; set/edit/init remain interactive-only
- 04-01: PrsJsonOutput kept deprecated; PrsResultData replaces it in production via createSuccessResult
- 04-04: Exported BASH_COMPLETION, ZSH_COMPLETION, FISH_COMPLETION constants for direct test import
- 04-04: Init completion flags (--local, --global, --force) match actual wt init CLI, not plan's --help-only suggestion
- 04-04: --refresh added to list completions (intended surface) even though wt list wrapper doesn't forward it yet
- 05-02: Config init redirects to 'wt init' instead of duplicating wizard from wtconfig
- 05-02: Config set (with key+value) saves to repo config by default (no interactive scope prompt)
- 05-02: printNextSteps in clean handler references 'wt list', 'wt new', 'wt clean' instead of legacy binaries
- 05-02: Config edit uses spawnSync for editor opening (intentional -- editor launch, not CLI delegation)
- [Phase 05-01]: Extracted printWorktreeTable to src/lib/lswt/table.ts as shared module importable by both lswt.ts and wt/list.ts
- [Phase 05-01]: Handler functions are async; logger init NOT called (already done by wt.ts middleware)
- [Phase 05-01]: Used importOriginal for colors mock in table.test.ts to prevent mock leaking across vitest workers
- [Phase 05-03]: Guard main() in newpr.ts with isMain check to prevent execution on import (same pattern as prs.ts)
- [Phase 05-03]: runNewprHandler takes Options directly -- caller builds Options from argv, no re-parsing
- [Phase 05-03]: PR number validation in wt/new.ts catches yargs NaN edge case for --pr flag
- [Phase 05-03]: wt link migrate delegates to migration library directly, matching standalone wtlink.ts pattern
- [Phase 05-04]: Deprecation uses process.stderr.write directly (not logger) to avoid requiring logger init in legacy CLIs
- [Phase 05-04]: printDeprecationNotice suppresses on --json (argv check) and GWT_NO_DEPRECATION_WARNINGS=1 (env check)
- [Phase 05-04]: Interactive menu calls library functions directly (runNewprHandler, gatherWorktreeInfo, analyzeState, etc.) -- zero runSubcommandForResult calls remain
- [Phase 05-04]: README removes legacy names from headings, adds Legacy Commands (Deprecated) section with migration table

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3: RESOLVED -- wt prs duplicate code path confirmed and fixed in 03-02 (missing refreshPrs callback)
- Phase 3: PTY tests may silently skip on CI (`node-pty` native addon); non-PTY smoke tests required alongside any menu changes
- Phase 4: RESOLVED -- MCP annotations added to all 5 tools (04-03); baseline fully documented
- Phase 5: `lswt` TTY-aware interactive mode has behavioral subtleties; pre-implementation coverage pass recommended before migrating

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 05-04-PLAN.md (deprecation notices, menu migration, README update) -- Phase 05 complete
Resume file: None
