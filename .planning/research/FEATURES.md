# Feature Research

**Domain:** CLI tool UX refactoring — UI consistency, logging, interactive menus, LLM ergonomics
**Researched:** 2026-02-18
**Confidence:** HIGH (codebase read directly; CLI standards from training data verified against well-known tools like git, gh, npm, brew, docker)

---

## Context: What This Is Not

This is a **refactoring** milestone, not a feature-addition milestone. The goal is to make four independently-evolved CLI tools behave consistently, reliably, and transparently. The feature categories below describe what a professional CLI tool must have in each area — anchored to what the existing codebase already partially has, and what it is missing.

The four problem areas from the milestone brief:

1. **UI inconsistency** — four tools, four output styles
2. **Broken logging** — `logger.ts` exists but `newpr.ts` ignores it; `DEBUG=newpr` is a second system
3. **Unreliable interactive menus** — silent exits, broken back navigation, duplicate PR path
4. **Poor LLM ergonomics** — stale help text, underdocumented `--json`, MCP annotations thin

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are features users expect from any professional CLI tool. Missing them causes loss of trust. They are non-negotiable for a tool calling itself polished.

| Feature                                                | Why Expected                                                                                        | Complexity | Notes                                                                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consistent output format across all subcommands        | Users scan output; inconsistency reads as "unfinished"                                              | MEDIUM     | Currently: `newpr` uses box-drawing success banner; `cleanpr` uses plain text; `lswt` uses table; `wtlink` uses inquirer. All need to converge on a common visual language without becoming identical |
| Uniform color semantics                                | Green=success, yellow=warning, red=error, dim=secondary info — everywhere                           | LOW        | Colors already exist; usage is inconsistent across tools (e.g., `cleanpr` uses `colors.bold('PR Worktrees:')` without a standard header function)                                                     |
| Consistent progress indicators (spinners)              | Users expect to see that long operations are running                                                | LOW        | `withSpinner` exists in `prompts.ts` and is used in `newpr.ts` and `cleanpr.ts` — but not consistently in all commands                                                                                |
| `--help` output that is accurate and current           | Users run `--help` before filing bug reports; stale help destroys trust                             | LOW        | Known issue per PROJECT.md: help text is stale                                                                                                                                                        |
| Errors go to stderr, not stdout                        | This is a POSIX convention; violations break shell pipelines                                        | LOW        | Verified in code: `console.error` used for errors in most places but `formatJsonResult` goes to `console.log` (stdout) — correct for JSON but must be verified consistently                           |
| Consistent exit codes (0=success, 1=failure)           | Scripts that call `wt` must be able to check `$?`                                                   | LOW        | Appears consistent via `process.exit(1)` but no explicit validation                                                                                                                                   |
| Non-interactive mode that doesn't hang                 | When stdin is not a TTY, the tool must not wait for input                                           | MEDIUM     | Partially addressed via `--non-interactive` and `isTTY` checks, but edge cases exist in the PR listing path                                                                                           |
| Interactive menus that always have a working exit path | Users must be able to press Esc or q and leave; menus that silently exit or get stuck destroy trust | MEDIUM     | Known bug: menus in `lswt` can silently exit; `wt prs` has a broken path                                                                                                                              |
| Back navigation that works consistently                | In multi-level menus (list -> detail -> action), back must always return to previous level          | MEDIUM     | `UserNavigatedBack` exception exists in `prompts.ts` and is handled in `main-menu.ts`; inconsistently handled elsewhere                                                                               |
| Ctrl+C exits cleanly without terminal damage           | Raw mode must always be restored on interrupt                                                       | LOW        | Signal handlers exist in `interactive.ts` but are not uniformly registered across all menu code                                                                                                       |
| Logging goes through a single channel                  | One `--verbose` flag, one log file, no split brain                                                  | MEDIUM     | `newpr.ts` has a local `debug()` function and `DEBUG=newpr` env var; everything else uses `logger.ts`                                                                                                 |

### Differentiators (Competitive Advantage)

These are what would make git-worktree-tools stand out as a tool that developers actively recommend.

| Feature                                                           | Value Proposition                                                                                                | Complexity | Notes                                                                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Persistent audit log (`~/.config/git-worktree-tools/wt.log`)      | Debug "what did newpr actually do?" days later; especially valuable for AI-driven workflows                      | LOW        | `logger.ts` already supports file output; `initializeLogger` just needs to be called with a default log file path in every CLI entry point |
| Structured `--json` output for every command                      | Enables scripting, CI, and AI agent use without screen-scraping                                                  | MEDIUM     | `newpr`, `cleanpr`, and `lswt` already have `--json`; `wtlink` has it flag but the coverage of all code paths through JSON is incomplete   |
| `--json` error format is stable and documented                    | AI agents need to handle errors programmatically; undocumented schema = fragile                                  | LOW        | `CommandResult<T>` type exists in `json-output.ts`; needs to be documented in help text and README                                         |
| MCP tool annotations include input/output schema and example JSON | AI agents use MCP to call tools; poorly annotated tools get misused                                              | MEDIUM     | Current MCP tools exist but annotation depth is unclear from source; needs audit                                                           |
| Debug log level correlates to audit trail                         | `GWT_LOG_LEVEL=debug` or `--verbose` should produce a human-readable trace of exactly what git commands were run | MEDIUM     | `logger.ts` supports it; `newpr.ts` debug calls need to be routed through logger                                                           |
| TTY-aware output (no escape codes in pipes)                       | Professional tools detect when stdout is not a TTY and strip ANSI                                                | LOW        | `colors.ts` likely handles this but needs verification — should test `NO_COLOR` env var compliance                                         |
| `wt state` (wtstate) exposes machine-readable scenario detection  | AI agents can query "what git state am I in?" before deciding what to do                                         | LOW        | `wtstate` already exists; needs JSON output verification and MCP annotation                                                                |

### Anti-Features (Deliberately NOT Building)

These are things that seem reasonable but would make the refactoring worse, not better.

| Anti-Feature                                                           | Why Avoid                                                                                                                                         | What to Do Instead                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A new TUI framework (e.g., replacing raw readline with Ink or blessed) | `manage-manifest.ts` is 2000+ lines of signals-core + raw readline; replacing the framework risks a complete rewrite and breaks the E2E PTY tests | Keep the existing raw readline/signals-core approach; fix behavior bugs without changing the rendering model    |
| Unifying all four menus into a single component                        | The menus have different state models (worktrees vs PRs vs file manifests); forcing a single component creates coupling                           | Share behavior (exit paths, Ctrl+C handling, error logging) via shared utilities, not a shared render component |
| "Smart" non-interactive defaults (guessing what user wanted)           | When interactive prompts are suppressed, silently taking actions the user didn't explicitly choose causes data loss                               | In non-interactive mode, fail with a clear error message and a `--action` flag hint                             |
| Real-time polling / streaming output                                   | Would require async-to-sync refactoring across the entire codebase; git and gh CLI calls are synchronous exec                                     | Keep synchronous execution; add spinners for latency feedback                                                   |
| Plugin system for custom output formatters                             | Premature before the core output format is even consistent                                                                                        | Stabilize the core format first                                                                                 |
| Per-tool configuration of log format                                   | Four different log formats defeats the purpose of a shared logger                                                                                 | One format: JSON to file, colored text to terminal                                                              |
| Emoji in log files                                                     | Emoji in machine-readable logs break parsing on some platforms                                                                                    | Emoji in interactive terminal output only; never in file log output                                             |

---

## Feature Dependencies

```
Shared logger used by all CLIs
    └──requires──> initializeLogger() called at CLI startup in all 4 entry points
                       └──requires──> logger.ts singleton (already exists)

Consistent output format
    └──requires──> Shared output primitives (header, section, success, warning, error functions)
                       └──enhances──> lswt interactive mode (uses consistent badge widths already)

Interactive menu reliability
    └──requires──> Consistent Ctrl+C handler pattern (cleanup + exit)
    └──requires──> Back navigation always returns (UserNavigatedBack propagated correctly)

wt prs single path
    └──requires──> Removing the broken duplicate code path
    └──enhances──> prs/interactive.ts (the working path, already tested)

--json complete coverage
    └──requires──> JSON output verified for all code paths (not just happy path)
    └──enhances──> MCP tool annotations (can reference stable schema)

MCP annotation completeness
    └──requires──> --json schema documented and stable
    └──requires──> wt state JSON output working
```

### Dependency Notes

- **Shared logger requires early initialization:** Every CLI entry point must call `initializeLogger()` early in `main()`. Currently `newpr.ts` calls its own `debug()` function instead. This is the highest-priority change — it unblocks the audit trail.
- **wt prs single path blocks MCP annotation:** The MCP `list_prs` tool likely uses the broken code path. Fixing the path is prerequisite to annotating it correctly.
- **UI consistency requires shared primitives first:** You cannot consistently apply color semantics until there is a shared `formatHeader()`, `formatSuccess()` etc. — otherwise you fix one tool and the others remain inconsistent.
- **--json coverage and MCP annotations are independent:** MCP annotations can be improved even before --json coverage is complete, but the annotations will need revision once coverage issues are found.

---

## MVP Definition

This milestone is a refactoring, so "MVP" means "minimum set of changes that makes the tool measurably more consistent and trustworthy."

### Fix First (must complete for milestone to have value)

- [ ] Route `newpr.ts` debug logging through shared `logger` — eliminates split logging, enables audit trail
- [ ] Call `initializeLogger()` at startup in all 4 CLI entry points — single control point
- [ ] Fix `wt prs` duplicate path — one working code path, no broken silent-failure path
- [ ] Fix interactive menu exit paths — Esc/q/Ctrl+C must always work, terminal must always be restored

### Fix Second (quality signal, high trust impact)

- [ ] Shared output primitives: `formatHeader()`, `formatSuccess()`, `formatWarning()`, `formatError()` — apply to all 4 CLIs
- [ ] Consistent color semantics verified: green=success, yellow=warning, red=error, dim=secondary
- [ ] Back navigation working in all multi-level menus (list -> detail -> action -> back)
- [ ] `--help` text accurate and current for all subcommands

### Fix Third (LLM ergonomics)

- [ ] `--json` output documented in help text for all commands that support it
- [ ] MCP tool annotations audited and updated: input schema, output schema, example JSON
- [ ] `NO_COLOR` / non-TTY detection verified (ANSI codes stripped when stdout is piped)

### Defer (out of scope for this milestone)

- [ ] New interactive features in any menu — not the goal; just fix existing ones
- [ ] New `--json` output fields — only fix missing/broken coverage of existing fields
- [ ] New MCP tools — audit and annotate what exists

---

## Feature Prioritization Matrix

| Feature                                 | User Value              | Implementation Cost                         | Priority |
| --------------------------------------- | ----------------------- | ------------------------------------------- | -------- |
| Route newpr debug through shared logger | HIGH (audit trail)      | LOW (swap function calls)                   | P1       |
| initializeLogger() in all entry points  | HIGH (audit trail)      | LOW                                         | P1       |
| Fix wt prs broken code path             | HIGH (reliability)      | MEDIUM (understand which path is broken)    | P1       |
| Fix Ctrl+C / menu exit paths            | HIGH (trust)            | LOW-MEDIUM (consistent handler pattern)     | P1       |
| Shared output primitives                | MEDIUM (consistency)    | MEDIUM (refactor across 4 CLIs)             | P2       |
| Consistent color semantics              | MEDIUM (polish)         | LOW (after primitives exist)                | P2       |
| Back navigation reliability             | MEDIUM (UX)             | LOW (propagate UserNavigatedBack correctly) | P2       |
| --help text accuracy                    | HIGH (trust)            | LOW (text edits)                            | P2       |
| --json output documentation             | MEDIUM (LLM ergonomics) | LOW (text additions)                        | P3       |
| MCP tool annotation depth               | MEDIUM (LLM ergonomics) | MEDIUM (audit + rewrite)                    | P3       |
| NO_COLOR / TTY detection                | LOW (edge case)         | LOW                                         | P3       |

**Priority key:**

- P1: Must fix for milestone to have value
- P2: Should fix; high trust impact
- P3: Improves LLM ergonomics; lower urgency

---

## Competitor Feature Analysis

Comparing against tools that set the standard: `git`, `gh` (GitHub CLI), `docker`, `npm`.

| Feature                       | git/gh/docker/npm pattern                    | Current git-worktree-tools state                                     | Gap     |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------- | ------- |
| Single logging system         | One `--verbose` / `GIT_TRACE` env            | Two systems: `logger.ts` + local `debug()` in newpr                  | Yes     |
| Color = semantic, consistent  | green=success, red=error everywhere          | Mostly correct but not enforced                                      | Partial |
| `--help` always current       | Auto-generated from arg parser               | Partially hand-written; known to be stale                            | Yes     |
| JSON output documented        | `gh` documents `--json` fields in help       | `--json` undocumented in most help texts                             | Yes     |
| Ctrl+C restores terminal      | Always                                       | Mostly; edge cases exist                                             | Partial |
| Non-interactive mode explicit | `--no-input` / `--yes` / `--non-interactive` | `--non-interactive` exists in newpr; not consistent                  | Partial |
| Back navigation in TUI        | `gh` uses `b` to go back, `q` to quit        | `UserNavigatedBack` exception exists but unevenly handled            | Partial |
| Errors show suggestion        | `git` and `gh` print "did you mean X?"       | `getErrorSuggestion()` exists in json-output.ts; used in most places | Mostly  |

---

## Implementation Notes

### The Logger Consolidation Pattern

The correct pattern for eliminating split logging:

```typescript
// In each CLI entry point's main():
import { initializeLogger, logger } from '../lib/logger.js';

async function main() {
  // Must happen before any other output
  initializeLogger({ logFile: Logger.getDefaultLogFilePath() });
  logger.setContext('newpr');

  // Replace all debug() calls:
  // BEFORE: debug('State analysis complete', { scenario, ... })
  // AFTER:  logger.debug('State analysis complete', { scenario, ... })
}
```

The `Logger.getDefaultLogFilePath()` returns `~/.config/git-worktree-tools/wt.log` (cross-platform). This means all four tools write to the same audit log, filterable by context.

### The Menu Exit Path Pattern

Every raw-mode keypress handler must:

1. Register `SIGINT` and `SIGTERM` handlers that call cleanup
2. The cleanup function must `setRawMode(false)` + `pause()` stdin
3. Remove all event listeners before resolving/rejecting the Promise

Current `lswt/interactive.ts` does this mostly correctly. The pattern must be extracted to a shared utility so all menus use it.

### The --json Documentation Pattern

`gh` shows this pattern: `gh pr list --json number,title,state`. The `--help` output for any command with `--json` support should include:

- That `--json` exists
- What fields are in the output
- The exit code semantics (0=success even for empty results)

---

## Sources

- Codebase read directly: `src/cli/newpr.ts`, `src/cli/cleanpr.ts`, `src/cli/lswt.ts`, `src/cli/wtlink.ts` (CONFIDENCE: HIGH — direct observation)
- `src/lib/logger.ts` — full singleton implementation read (CONFIDENCE: HIGH)
- `src/lib/json-output.ts` — `CommandResult<T>` schema read (CONFIDENCE: HIGH)
- `src/lib/lswt/interactive.ts` — menu implementation read (CONFIDENCE: HIGH)
- `src/lib/prs/interactive.ts` — PR browser implementation read (CONFIDENCE: HIGH)
- `src/lib/prompts.ts` — shared prompt utilities read (CONFIDENCE: HIGH)
- `src/lib/wtlink/main-menu.ts` — wtlink menu read (CONFIDENCE: HIGH)
- `.planning/PROJECT.md` — milestone requirements and known bugs read (CONFIDENCE: HIGH)
- CLI standard practices: `git`, `gh`, `docker`, `npm` behavior patterns (CONFIDENCE: MEDIUM — training data, well-established conventions)
- POSIX exit code conventions (CONFIDENCE: HIGH — widely documented standard)

---

_Feature research for: git-worktree-tools CLI UX refactoring milestone_
_Researched: 2026-02-18_
