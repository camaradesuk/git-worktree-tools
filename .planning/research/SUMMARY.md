# Project Research Summary

**Project:** git-worktree-tools CLI UX Refactoring
**Domain:** Node.js/TypeScript CLI tooling — multi-subcommand git workflow automation
**Researched:** 2026-02-18
**Confidence:** HIGH (all research based on direct codebase inspection + npm registry verification)

## Executive Summary

This milestone is a refactoring effort, not a feature-addition sprint. Four independently-evolved CLI tools (`newpr`, `cleanpr`, `lswt`, `wtlink`) share an existing infrastructure of logger, color, and prompt utilities that none of the legacy binary entry points actually use. The correct approach is to wire existing infrastructure into the entry points that bypass it, extract shared UI rendering into `src/lib/ui/`, and fix a small set of known bugs in interactive menu flows — without replacing any working subsystem.

The recommended implementation sequence flows from lowest to highest risk: wire the logger singleton into legacy CLI entry points first (additive, safe), then extract shared output primitives (pure function refactoring, low risk), then fix JSON output coverage, then remove the `spawnSync` delegation bridge in favor of direct library calls, and finally address `manage-manifest.ts` only if specific bugs require it. This ordering eliminates blocking dependencies — shared UI rendering must exist before the `wt` subcommand handlers can call it directly, and the logger must be wired before `newpr.ts`'s local `debug()` function can be removed.

The critical risk in this refactoring is `manage-manifest.ts`: a 2042-line file mixing signals-based reactive TUI state, raw readline keyboard handling, filesystem I/O, and rendering. It must be treated as a black box and changed only to fix specific named bugs, not for consistency. The interactive menu's `runSubcommand` delegation pattern is the second critical risk — it calls `process.exit()` after spawning child processes, which means the `wt` interactive menu cannot return to the main menu after any action, and it calls `wtlink` subcommands that do not exist. These are known bugs that must be fixed before the interactive menu is considered functional.

## Key Findings

### Recommended Stack

The existing stack is sound and should be kept with minimal changes. All core dependencies (`yargs@^17`, `inquirer@^9`, `@preact/signals-core`, `json5`, `vitest`) are ESM-compatible, Node 18-safe, and actively maintained. The one non-negotiable constraint is that `yargs` must stay at `^17` — yargs 18 requires Node `^20.19.0`, which breaks the declared `>=18` engine requirement.

Two new production dependencies are warranted: `ora@^8.1.1` for terminal spinners (ora 9+ requires Node >=20, so version pinning matters here too), and `consola@^3.4.2` for structured CLI logging with file output support. No other new dependencies are needed. `cli-table3`, `ink`, `chalk`, and `listr2@^9+` should all be avoided for Node compatibility or redundancy reasons.

**Core technologies:**

- `yargs@^17.7.2`: argument parsing — do NOT upgrade to v18 (drops Node 18)
- `inquirer@^9.3.7`: interactive prompts — used in 7+ source files, well-maintained
- `@preact/signals-core@^1.8.0`: reactive TUI state in `manage-manifest.ts` — leave it alone
- `ora@^8.1.1` (new): terminal spinners — Node 18-compatible; ora 9+ is not
- `consola@^3.4.2` (new): structured CLI logging + file transport — ESM-native, CI-aware
- Custom `src/lib/colors.ts`: keep; `chalk` would be a duplicate dep
- Custom `src/lib/ui/table.ts` (to create): thin table formatter; no need for `cli-table3`
- `vitest@^3`: upgrade from 2.x; v4 is too new to adopt yet

### Expected Features

This milestone's "features" are reliability and consistency improvements to existing functionality. The priority ordering is driven by the severity of existing bugs and the dependency chain between fixes.

**Must have (table stakes — fix first):**

- Single logger for all 4 CLI entry points — call `initializeLogger()` at startup in `newpr.ts`, `cleanpr.ts`, `lswt.ts`, `wtlink.ts`
- Route `newpr.ts` local `debug()` through shared `logger.debug()` — eliminates the two-system split
- Fix `wt prs` broken duplicate code path — one working code path, no silent-failure path
- Fix interactive menu exit paths — Esc/q/Ctrl+C must always restore the terminal and exit cleanly
- Fix non-existent `wtlink` subcommands referenced in `interactive-menu.ts` (`list`, `sync`, `add`, `remove` do not exist)

**Should have (quality signal — fix second):**

- `src/lib/ui/` shared output primitives: `formatHeader()`, `formatSuccess()`, `formatWarning()`, `formatError()`
- Consistent color semantics enforced across all 4 CLIs (green=success, yellow=warning, red=error, dim=secondary)
- Back navigation working in all multi-level menus (`UserNavigatedBack` propagated correctly)
- `--help` text accurate and current for all subcommands

**Defer (LLM ergonomics — fix third, or next milestone):**

- `--json` output documented in help text for all commands
- MCP tool annotations audited and updated with input/output schema examples
- `NO_COLOR` / non-TTY detection verified

**Do not build:**

- New TUI framework (do not replace raw readline + signals-core in `manage-manifest.ts`)
- Unified single menu component across all four tools
- Real-time polling or streaming output
- Per-tool log format configuration

### Architecture Approach

The codebase already has a clean layer structure: CLI entry points at the top, a library layer in `src/lib/`, and a programmatic API in `src/api/` consumed by the MCP server. The problem is that the `wt` entry point delegates to legacy CLIs via `spawnSync` instead of calling library functions directly, and legacy CLI entry points do not wire into the shared logger singleton. The target state eliminates the spawn bridge for `wt` subcommands by replacing `runSubcommand()` calls with direct library function imports, and introduces `src/lib/ui/` as a shared rendering module that all CLIs import.

**Major components:**

1. `src/lib/logger.ts` — existing singleton; wire it into legacy entry points via `initializeLogger()`, no changes to the module itself
2. `src/lib/ui/` (new) — shared output rendering: `table.ts`, `theme.ts`, `status-line.ts`; extracted from inline `printTable()` in `lswt.ts`
3. `src/cli/wt/run-command.ts` — replace with direct library calls in `wt/list.ts`, `wt/clean.ts`, `wt/state.ts`; preserve for backward compatibility on legacy bin paths
4. `src/lib/wtlink/manage-manifest.ts` — treat as black box; touch only to fix specific named bugs, never for consistency

### Critical Pitfalls

1. **Subprocess delegation breaks logger continuity** — `spawnSync` creates a process boundary; logger state, `--verbose`, and `--log-file` flags set by the parent `wt` process are lost in all child processes. Fix: call `initializeLogger()` in each legacy CLI entry point so it reads `GWT_LOG_LEVEL` from environment; migrate `newpr.ts`'s local `debug()` to `logger.debug()`.

2. **Interactive menu exits instead of returning** — `runSubcommand()` calls `process.exit()` after `spawnSync`, so the menu can never return to the main loop after any action. Fix: replace `runSubcommand()` calls with direct library function imports, or at minimum do not call `process.exit()` after the spawn returns. Audit every `runSubcommand` call against real subcommand definitions first — several `wtlink` subcommands in the menu do not exist.

3. **`manage-manifest.ts` cannot be lightly refactored** — 2042 lines of mixed TUI rendering, signals-based state, and file I/O. Partial logger migration (replacing only some `console.log` calls) produces inconsistent behavior. Fix: treat as a black box; replace only debug-level internal calls with `logger.debug()` and leave all TUI rendering calls as `process.stdout.write()`; never combine manage-manifest changes with other phases.

4. **Backwards compatibility must be preserved** — `lswt` has 22 `console.log` calls and `cleanpr` has 63 user-visible output statements. Routing these through `logger.info()` means `--quiet` could silence output scripts depend on. Fix: use the shared logger only for diagnostic/debug messages; treat stdout content from legacy CLIs as a stable API.

5. **PTY tests provide false confidence** — `node-pty` is a native addon; PTY tests are behind `describe.skipIf(!isPtyAvailable())` guards and may all be skipped on CI. If a menu refactor breaks interactive behavior, the test suite can pass with false green. Fix: add mandatory non-PTY smoke tests that verify a process does not exit immediately before relying on PTY-specific coverage.

## Implications for Roadmap

Based on the dependency analysis from ARCHITECTURE.md and the pitfall phase mappings from PITFALLS.md, the natural phase structure is:

### Phase 1: Logger Wiring

**Rationale:** This is purely additive — adding `initializeLogger()` calls to existing entry points that currently bypass the singleton. It has no external dependencies, no UI changes, and no behavioral changes visible to users. It unblocks everything else: the shared UI renderer can call `logger.debug()` only after the singleton is guaranteed to be initialized, and `newpr.ts`'s local `debug()` cannot be removed until `logger.debug()` is in place.
**Delivers:** Unified audit log for all 4 CLI tools; `GWT_LOG_LEVEL=debug` works consistently across all entry points; `DEBUG=newpr` gets a deprecation path.
**Addresses:** FEATURES.md P1 item — "Route `newpr.ts` debug logging through shared logger" and "Call `initializeLogger()` in all entry points."
**Avoids:** PITFALLS Pitfall 1 (subprocess breaks logger), Pitfall 7 (logger not initialized in legacy CLIs), Pitfall 5 (DEBUG env var collision).

### Phase 2: Shared UI Output Primitives

**Rationale:** Cannot enforce visual consistency across 4 CLIs without a shared rendering module. This phase creates `src/lib/ui/` and refactors each CLI to import from it. Pure function extraction; low risk. Must come before the in-process delegation phase because `wt/list.ts` must import from `src/lib/ui/table.ts` to display results without spawning `lswt`.
**Delivers:** `src/lib/ui/table.ts`, `src/lib/ui/index.ts` (header/success/warning/error functions), consistent color semantics, accurate `--help` text.
**Uses:** Existing `src/lib/colors.ts` and `src/lib/lswt/formatters.ts` as foundation; the `formatters.ts` pure-function pattern is the right model.
**Implements:** ARCHITECTURE.md Pattern 1 (Shared Output Formatter).
**Avoids:** PITFALLS Pitfall 4 (backwards compat) — pure extraction, no behavior change.

### Phase 3: Interactive Menu Reliability

**Rationale:** The interactive menu bugs are independent of the logger and UI extraction work, but fixing them requires understanding the `runSubcommand` delegation architecture clearly before touching it. After Phase 2 establishes shared UI primitives, the menu handlers can be rewritten to call library functions directly rather than spawning subprocesses — eliminating the silent-exit bug at the same time as fixing subcommand references.
**Delivers:** Working `wt` interactive menu that returns to main loop after each action; fixed `wtlink` subcommand references; `Ctrl+C` always restoring terminal; `console.clear()` gated on `isTTY`.
**Addresses:** FEATURES.md P1 items — "Fix `wt prs` duplicate path" and "Fix interactive menu exit paths."
**Avoids:** PITFALLS Pitfall 2 (silent exit), Pitfall 8 (non-existent wtlink subcommands), Pitfall 9 (`console.clear()` in non-TTY), Pitfall 6 (PTY false confidence — add non-PTY smoke tests here).

### Phase 4: JSON Output Coverage and LLM Ergonomics

**Rationale:** With consistent rendering and a working interactive menu, `--json` coverage becomes a mechanical audit: verify all code paths emit structured JSON, document `--json` in `--help`, update MCP tool annotations. This phase depends on Phase 2 (shared renderer handles the human output branch; JSON is the other branch) and Phase 3 (MCP `list_prs` tool likely uses the broken code path).
**Delivers:** Complete `--json` coverage for all 4 CLIs, documented `--json` schema in help text, updated MCP tool annotations with input/output schema and example JSON.
**Uses:** Existing `src/lib/json-output.ts` `CommandResult<T>` schema; extend with `schema_version` and `exit_code` fields.
**Addresses:** FEATURES.md P3 items — all LLM ergonomics work.

### Phase 5: In-Process Delegation (wt subcommand bridge removal)

**Rationale:** This is the highest-risk structural change. Replacing `runSubcommand('lswt', args)` with `gatherWorktreeInfo()` + `printWorktreeTable()` requires that Phase 2's shared renderer exists and that Phase 3's menu flows no longer exit the process. Only safe after interactive menu is fully working and non-PTY smoke tests pass. Preserve legacy binary entry points as thin wrappers — they must continue to work.
**Delivers:** `wt --verbose new` propagates verbosity correctly into the new command; `wt --log-file` works end-to-end; no more output fragmentation from subprocess inheritance.
**Implements:** ARCHITECTURE.md Pattern 3 (In-Process Delegation).
**Avoids:** PITFALLS Pitfall 1 (subprocess breaks logger — fully eliminated in this phase).

### Phase Ordering Rationale

- Logger wiring is first because it is additive-only and unblocks every other phase without introducing risk.
- Shared UI primitives come second because the in-process delegation phase requires them — `wt/list.ts` must call `printWorktreeTable()` before `runSubcommand` can be removed.
- Interactive menu reliability comes third because fixing the silent-exit bug requires understanding the `runSubcommand` architecture, and that understanding is cleaner after Phase 2 establishes what the replacement pattern looks like.
- JSON/LLM coverage comes fourth, after the working paths are solid — MCP annotations that reference broken code paths would need immediate revision.
- In-process delegation is last because it is the highest-risk structural change and everything else must be stable first.

### Research Flags

Phases with standard patterns (skip additional research):

- **Phase 1 (Logger Wiring):** Well-documented pattern; `wt.ts` already demonstrates correct approach with `initializeLoggerFromCliFlags()`.
- **Phase 2 (Shared UI Primitives):** Pure function extraction; `src/lib/lswt/formatters.ts` is the model to follow.
- **Phase 4 (JSON Coverage):** Mechanical audit against existing `CommandResult<T>` schema.

Phases likely needing closer planning before execution:

- **Phase 3 (Interactive Menu Reliability):** The `runSubcommand` → direct library call refactor needs careful per-handler auditing. Recommend planning to enumerate every `runSubcommand` call, classify each as "replace with library call" vs "preserve as subprocess," and write the non-PTY smoke test for each flow before touching any code.
- **Phase 5 (In-Process Delegation):** The TTY detection in `lswt` interactive mode has subtleties — the `wt list` handler must preserve the exact TTY-aware behavior of `lswt` when run from a terminal vs. piped. Recommend a pre-implementation test coverage pass on `lswt` interactive path before migrating.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                           |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | All version constraints verified against npm registry. yargs/ora version pinning is not optional — wrong versions silently break Node 18 users. |
| Features     | HIGH       | Research based on direct codebase inspection. Known bugs are confirmed from source, not inferred.                                               |
| Architecture | HIGH       | All component claims based on direct source inspection, not training data. The 5-phase build order follows directly from the dependency graph.  |
| Pitfalls     | HIGH       | Pitfalls 1, 2, 3, 8 are confirmed bugs with line number citations. Pitfalls 4, 6, 7, 9 are structural risks with verifiable warning signs.      |

**Overall confidence:** HIGH

### Gaps to Address

- **`wt prs` broken path:** The exact mechanism of the duplicate code path needs confirmation before Phase 3 planning. Research notes it exists but does not identify which specific call in `interactive-menu.ts` is the broken vs. working path.
- **MCP annotation current state:** The research notes MCP tools exist but annotation depth is "unclear from source." Phase 4 planning must begin with a full audit of `src/mcp/server.ts` to establish the current baseline before estimating annotation work.
- **`inquirer` upgrade path:** The existing stack is on `^9.3.7` while `13.2.5` is current. Whether to upgrade during this milestone (7 affected files) or defer is undecided. Recommendation: defer — migration cost is real and functional gains are minimal for this refactoring goal.

## Sources

### Primary (HIGH confidence)

- `src/cli/newpr.ts` — local `debug()` function, `DEBUG=newpr` env var, 1326 lines inspected directly
- `src/lib/wtlink/manage-manifest.ts` — 2042 lines, 132 `console.log` calls confirmed
- `src/cli/wt/run-command.ts` — `spawnSync` with `stdio: 'inherit'`, returns `never`
- `src/cli/wt/interactive-menu.ts` — all handlers call `runSubcommand()` and return `COMPLETED_EXIT`; non-existent `wtlink` subcommands confirmed
- `src/lib/logger.ts` — singleton pattern; only initialized in `src/cli/wt.ts`
- `src/lib/lswt/formatters.ts` — model for pure formatter pattern
- `src/lib/json-output.ts` — `CommandResult<T>` schema
- `package.json` — engine constraint `>=18`, all 6 legacy `bin` entries
- npm registry (`npm view --json`) — all version/engine constraints verified

### Secondary (MEDIUM confidence)

- CLI standard practices from `git`, `gh`, `docker`, `npm` behavior patterns — exit code conventions, `--json` documentation patterns, `--quiet` semantics

---

_Research completed: 2026-02-18_
_Ready for roadmap: yes_
