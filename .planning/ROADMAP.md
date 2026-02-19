# Roadmap: git-worktree-tools CLI Consistency Milestone

## Overview

This milestone refactors four independently-evolved CLI entry points (`newpr`, `cleanpr`, `lswt`, `wtlink`) into a consistent, trustworthy tool surface. The work flows from lowest to highest risk: wire the shared logger singleton into all entry points first (additive, no behavioral change), then extract shared UI output primitives, then fix interactive menu bugs, then audit JSON/LLM output coverage, and finally replace the `spawnSync` delegation bridge with direct library calls. Each phase unblocks the next; none can be safely reordered.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Logger Wiring** - Wire the shared logger singleton into all 4 legacy CLI entry points and remove the `newpr`-specific debug mechanism
- [x] **Phase 2: Shared UI Primitives** - Extract a `src/lib/ui/` module with consistent output formatting functions used by all commands
- [x] **Phase 3: Interactive Menu Reliability** - Fix the broken `wt prs` code path, non-existent `wtlink` subcommand references, and all exit paths that fail to restore terminal state
- [x] **Phase 4: JSON Output and LLM Ergonomics** - Audit and complete `--json` coverage for all subcommands; update help text and MCP tool annotations
- [x] **Phase 5: In-Process Delegation** - Replace `runSubcommand()` subprocess spawning with direct library function calls in all `wt` subcommand handlers

## Phase Details

### Phase 1: Logger Wiring

**Goal**: Every `wt` subcommand writes debug output through the shared `logger` singleton, controlled by a single `GWT_LOG_LEVEL` environment variable and a persistent audit log
**Depends on**: Nothing (first phase)
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04
**Success Criteria** (what must be TRUE):

1. Running `GWT_LOG_LEVEL=debug newpr` produces debug output through the shared logger (not the local `debug()` function)
2. Running `GWT_LOG_LEVEL=debug cleanpr` and `GWT_LOG_LEVEL=debug lswt` produce debug output where previously there was none
3. All 4 commands write structured entries to `~/.local/share/git-worktree-tools/audit.log` after any operation
4. The `DEBUG=newpr` environment variable is no longer recognized; `GWT_LOG_LEVEL` is the single control point
5. Running any `wt` subcommand with `--verbose` produces DEBUG-level output; with `--quiet` produces ERROR-only output
   **Plans:** 3 plans

Plans:

- [x] 01-01-PLAN.md — Replace logger.ts with consola wrapper, add getGlobalDataDir(), make colors.ts mutable, update 7 library consumers
- [x] 01-02-PLAN.md — Wire --verbose/--quiet/--no-color into all 4 legacy arg parsers and CLI entry points, migrate newpr debug(), forward flags from wt wrappers
- [x] 01-03-PLAN.md — Rewrite logger.test.ts for consola API (level resolution, audit reporter, rotation, stderr reporter, DEBUG=newpr deprecation)

### Phase 2: Shared UI Primitives

**Goal**: All commands render output through a shared `src/lib/ui/` module — consistent colors, icons, table formatting, spinner style, and error presentation across all 4 CLIs
**Depends on**: Phase 1
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):

1. Running `newpr`, `cleanpr`, `lswt`, and `wtlink` shows green checkmarks for success, yellow warnings for warnings, and red errors for errors — with no command deviating from that palette
2. All async operations (network calls, git operations) show the same spinner style and animation
3. Error messages across all commands display as title + detail + hint — no raw stack traces or bare `Error:` strings appear
4. `src/lib/ui/` module exists with `printTable`, `printHeader`, `printStatus`, `printError` functions; no command contains inline `console.log` calls for structured output
   **Plans**: 3 plans

Plans:

- [x] 02-01-PLAN.md — Create src/lib/ui/ module with theme.ts, output.ts, status.ts, table.ts, error.ts, spinner.ts + barrel export and tests
- [x] 02-02-PLAN.md — Refactor all 5 CLI entry points to use shared UI primitives; wire JSON mode gate; fix icon inconsistencies in link-configs.ts
- [x] 02-03-PLAN.md — Standardize error rendering to title + detail + hint format across all commands; integration tests for error pipeline

### Phase 3: Interactive Menu Reliability

**Goal**: The `wt` interactive menu completes every action and returns to the main menu; `wt prs` lists PRs correctly; Ctrl+C always restores terminal state
**Depends on**: Phase 2
**Requirements**: MENU-01, MENU-02, MENU-03, MENU-04
**Success Criteria** (what must be TRUE):

1. Selecting any action in the `wt` interactive menu completes the action and returns to the main menu — the terminal does not exit
2. `wt prs` lists the user's open PRs with correct data; a second code path that returned empty results no longer exists
3. All link management actions in the `wt` menu invoke functions that exist (no "command not found" or silent failures for list/sync/add/remove)
4. Pressing Ctrl+C or Escape in any interactive menu restores the terminal cursor and raw mode — no corrupted terminal state after interruption
5. Every multi-level menu has an explicit Back or Done option; no menu silently exits without user intent
   **Plans**: 3 plans

Plans:

- [x] 03-01-PLAN.md — Replace runSubcommand with runSubcommandForResult in interactive-menu.ts; rewire broken wtlink actions to direct library calls
- [x] 03-02-PLAN.md — Extract shared runPrsCommand to lib/prs/command.ts; eliminate duplicate code path in wt prs
- [x] 03-03-PLAN.md — Add global terminal state safety net in wt.ts; fix prs Ctrl+C handling to follow lswt gold standard

### Phase 4: JSON Output and LLM Ergonomics

**Goal**: Every `wt` subcommand emits valid, documented `CommandResult<T>` JSON when `--json` is passed; help text and MCP annotations accurately describe the current tool surface
**Depends on**: Phase 3
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04
**Success Criteria** (what must be TRUE):

1. Running any `wt` subcommand with `--json` produces valid JSON on stdout in every code path — including error paths and early exits
2. `wt --help` and all subcommand `--help` outputs list accurate flags with no stale or missing entries
3. MCP tool descriptions in `src/mcp/server.ts` include input schema, output schema, and an example JSON response for each tool
4. `wt completion` generates working shell completion scripts for bash, zsh, and fish that enumerate all current subcommands and flags
   **Plans**: 4 plans

Plans:

- [x] 04-01-PLAN.md — Patch JSON gaps in wtstate, wtlink, wt, wtconfig error paths; add --json to wtconfig show/get/validate; migrate prs to CommandResult<T>
- [x] 04-02-PLAN.md — Audit and fix --help text for all 9 wt subcommands; add missing flags (--base-branch, --delete-remote, --refresh, config subcommands)
- [x] 04-03-PLAN.md — Add ToolAnnotations, outputSchema, and enriched descriptions to all 5 MCP tools in server.ts
- [x] 04-04-PLAN.md — Update zsh and fish completion scripts with missing subcommands (prs, init) and flags; add completion tests

### Phase 5: In-Process Delegation

**Goal**: `wt new`, `wt list`, `wt clean`, and `wt link` call library functions directly rather than spawning child processes — flags propagate end-to-end and the audit log captures all activity in one process
**Depends on**: Phase 4
**Requirements**: UNI-01, UNI-02, UNI-03, UNI-04
**Success Criteria** (what must be TRUE):

1. Running `wt --verbose list` produces verbose output without spawning a separate `lswt` process; the `--verbose` flag takes effect inside the list handler
2. Running `newpr`, `cleanpr`, `lswt`, or `wtlink` prints a deprecation notice directing users to the `wt` equivalent before completing normally
3. `--verbose`, `--quiet`, `--json`, and `--no-color` flags work identically whether invoked through `wt <subcommand>` or through a legacy alias
4. README and all `--help` output present `wt` as the canonical entry point with legacy commands listed as deprecated aliases
   **Plans**: 4 plans

Plans:

- [x] 05-01-PLAN.md — Extract printTable to shared module; migrate wt/list.ts and wt/state.ts to direct library calls
- [x] 05-02-PLAN.md — Migrate wt/clean.ts and wt/config.ts to direct library calls
- [x] 05-03-PLAN.md — Extract runNewprHandler; migrate wt/new.ts and wt/link.ts to direct library calls
- [x] 05-04-PLAN.md — Deprecation notices on all legacy CLIs; migrate interactive menu to direct calls; update README

## Progress

**Execution Order:**
Phases execute in dependency order: 1 → 2 → 3 → 4 → 5

| Phase                             | Plans Complete | Status     | Completed  |
| --------------------------------- | -------------- | ---------- | ---------- |
| 1. Logger Wiring                  | 3/3            | ✓ Complete | 2026-02-18 |
| 2. Shared UI Primitives           | 3/3            | ✓ Complete | 2026-02-18 |
| 3. Interactive Menu Reliability   | 3/3            | ✓ Complete | 2026-02-18 |
| 4. JSON Output and LLM Ergonomics | 4/4            | ✓ Complete | 2026-02-18 |
| 5. In-Process Delegation          | 4/4            | ✓ Complete | 2026-02-19 |
