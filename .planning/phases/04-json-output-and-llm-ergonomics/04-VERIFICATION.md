---
phase: 04-json-output-and-llm-ergonomics
verified: 2026-02-18T22:28:06Z
status: gaps_found
score: 15/16 must-haves verified
re_verification: false
gaps:
  - truth: 'Running `wt list --help` lists --json, --verbose, --no-status, --no-interactive, --filter, --refresh flags'
    status: partial
    reason: 'wt list has --status (not --no-status), is missing --filter and --refresh. These were intentionally deferred in 04-02 SUMMARY because lswt rejects unknown flags. However the plan truth said these flags would be present.'
    artifacts:
      - path: 'src/cli/wt/list.ts'
        issue: 'Missing --filter and --refresh options. Has --status instead of --no-status.'
    missing:
      - '--no-status flag (currently has --status; functionally different)'
      - '--filter flag (blocked until lswt supports it upstream)'
      - '--refresh flag (blocked until lswt supports it upstream)'
---

# Phase 4: JSON Output and LLM Ergonomics Verification Report

**Phase Goal:** Every `wt` subcommand emits valid, documented `CommandResult<T>` JSON when `--json` is passed; help text and MCP annotations accurately describe the current tool surface
**Verified:** 2026-02-18T22:28:06Z
**Status:** gaps_found (1 partial truth)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                | Status   | Evidence                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `wtstate --json` with invalid args outputs CommandResult error JSON on stdout                                                        | VERIFIED | `hasJsonFlag` check in parse error path at line 31; `createErrorResult` outputs to stdout                                       |
| 2   | `wt --json badcommand` outputs CommandResult error JSON on stdout                                                                    | VERIFIED | `hasJsonFlag` in `.fail()` handler at line 178; `createErrorResult('wt', ErrorCode.INVALID_ARGUMENT, ...)`                      |
| 3   | `wtlink --json badcommand` outputs CommandResult error JSON on stdout                                                                | VERIFIED | `isJsonMode()` in `.fail()` at line 279; `setJsonMode()` called in middleware                                                   |
| 4   | `wtconfig show --json` outputs CommandResult JSON with merged config                                                                 | VERIFIED | `createSuccessResult('wtconfig', {subcommand:'show', source, config})` at line 181                                              |
| 5   | `wtconfig validate --json` outputs CommandResult JSON with validation results                                                        | VERIFIED | `createSuccessResult('wtconfig', {subcommand:'validate', valid, errors, warnings})` at line 507                                 |
| 6   | `wtconfig get <key> --json` outputs CommandResult JSON with value                                                                    | VERIFIED | `createSuccessResult('wtconfig', {subcommand:'get', key, value})` at line 413                                                   |
| 7   | `prs --json` outputs `CommandResult<PrsResultData>` JSON (not PrsJsonOutput)                                                         | VERIFIED | `createSuccessResult<PrsResultData>('prs', {...})` at command.ts line 167; `PrsJsonOutput` deprecated in types.ts               |
| 8   | `wt --help` lists all 9 subcommands with accurate descriptions                                                                       | VERIFIED | `wt --help` output shows: new, list, clean, link, state, config, init, completion, prs — all 9 present                          |
| 9   | `wt new --help` lists all required flags including --draft, --json, --action, etc.                                                   | VERIFIED | new.ts has all flags; 12 StateActionKey choices in --action; actual help output confirmed                                       |
| 10  | `wt list --help` lists --json, --verbose, --no-status, --no-interactive, --filter, --refresh                                         | PARTIAL  | Has --json, --verbose, --no-interactive; MISSING --no-status (has --status), --filter, --refresh (deferred)                     |
| 11  | `wt clean --help` lists --all, --dry-run, --force, --json, --delete-remote                                                           | VERIFIED | clean.ts has all 5 flags; actual help output confirmed                                                                          |
| 12  | `wt state --help` lists --json, --verbose, --base-branch                                                                             | VERIFIED | state.ts has all 3; --base-branch forwards as --base to wtstate; actual help output confirmed                                   |
| 13  | `wt config --help` lists set, get, validate, migrate subcommands                                                                     | VERIFIED | config.ts describe lists "interactive, init, show, set, get, edit, validate, migrate, schema"; examples show all                |
| 14  | `wt prs --help` lists --state, --author, --label, --draft, --no-draft, --with-worktree, --limit, --json, --no-interactive, --refresh | VERIFIED | prs.ts has all flags; --no-interactive is the yargs negation of --interactive=true default                                      |
| 15  | All 5 MCP tools have annotations, outputSchema, and example JSON responses                                                           | VERIFIED | All 5 tools in server.ts: annotations with title+4 boolean hints; outputSchema; "Example success response:" in all descriptions |
| 16  | `wt completion` generates working scripts for bash, zsh, fish with all subcommands                                                   | VERIFIED | ZSH and fish both include prs and init; base-branch, delete-remote, prs flags all present                                       |

**Score:** 15/16 truths verified (1 partial)

### Required Artifacts

| Artifact                        | Expected                                            | Status   | Details                                                                                                           |
| ------------------------------- | --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/cli/wtstate.ts`            | JSON-aware parse error and catch handler            | VERIFIED | `hasJsonFlag` defined at line 108; used in parse error (line 31) and catch (line 114)                             |
| `src/cli/wtlink.ts`             | JSON-aware .fail() and .catch() handlers            | VERIFIED | `isJsonMode()` in .fail() (line 279) and .catch() (line 306); `setJsonMode()` in middleware (line 120)            |
| `src/cli/wt.ts`                 | JSON-aware .fail() and .catch() handlers            | VERIFIED | `hasJsonFlag` defined at line 102; used in .fail() (line 178) and .parseAsync().catch() (line 191)                |
| `src/cli/wtconfig.ts`           | JSON support for show/get/validate                  | VERIFIED | `createSuccessResult` in showConfig (line 181), getConfig (line 413), validateCurrentConfig (line 507, 489)       |
| `src/lib/prs/command.ts`        | Migrated to CommandResult<T>                        | VERIFIED | `createSuccessResult<PrsResultData>('prs', {...})` at line 167                                                    |
| `src/lib/prs/types.ts`          | PrsResultData interface, PrsJsonOutput deprecated   | VERIFIED | `PrsResultData` at line 170; `@deprecated Use CommandResult<PrsResultData> instead` at line 183                   |
| `src/cli/wt/state.ts`           | Help text with --base-branch flag                   | VERIFIED | `.option('base-branch', {...})` at line 32; forwarded as --base to wtstate at line 54                             |
| `src/cli/wt/clean.ts`           | Help text with --delete-remote flag                 | VERIFIED | `.option('delete-remote', {...})` at line 49; forwarded as --remote to cleanpr at line 86                         |
| `src/cli/wt/config.ts`          | Help text with set/get/validate/migrate subcommands | VERIFIED | Positional describe and examples enumerate all 9 subcommands including set, get, validate, migrate                |
| `src/cli/wt/list.ts`            | Help text with --filter and --refresh               | PARTIAL  | MISSING --filter and --refresh (deferred); has --status not --no-status                                           |
| `src/mcp/server.ts`             | All 5 tools with annotations and outputSchema       | VERIFIED | 5 `annotations:` blocks at lines 69, 136, 201, 247, 310; 6 `outputSchema:` properties (shared base + 5 tools)     |
| `src/mcp/server.test.ts`        | Tests verifying annotations on all tools            | VERIFIED | Tests at lines 535-631 check all 5 tools for annotations, outputSchema, behavioral hints, and description content |
| `src/cli/wt/completion.ts`      | Updated bash, zsh, fish scripts with prs and init   | VERIFIED | ZSH_COMPLETION includes 'prs:Browse...' and 'init:Initialize...'; FISH_COMPLETION includes -a 'prs' and -a 'init' |
| `src/cli/wt/completion.test.ts` | Tests verifying prs and init in completion scripts  | VERIFIED | 20 tests including "zsh completion includes all subcommands" and "fish completion includes all subcommands"       |

### Key Link Verification

| From                                         | To                          | Via                                                      | Status | Details                                                                                       |
| -------------------------------------------- | --------------------------- | -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `src/cli/wtstate.ts`                         | `src/lib/json-output.ts`    | `hasJsonFlag` + `createErrorResult` + `formatJsonResult` | WIRED  | Imports at lines 12-17; `hasJsonFlag` at 108; used in parse error at 31 and catch at 114      |
| `src/cli/wt.ts`                              | `src/lib/json-output.ts`    | `hasJsonFlag` in .fail()/.catch()                        | WIRED  | Import at line 42; `hasJsonFlag` at 102; used in .fail() at 178 and .catch() at 191           |
| `src/lib/prs/command.ts`                     | `src/lib/json-output.ts`    | `createSuccessResult<PrsResultData>`                     | WIRED  | Imports `createSuccessResult` at line 32; used at line 167                                    |
| `src/cli/wt/state.ts`                        | `src/cli/wtstate.ts`        | `--base-branch` forwarded as `--base`                    | WIRED  | Line 53-55: `args.push('--base', argv['base-branch'])`                                        |
| `src/cli/wt/config.ts`                       | `src/cli/wtconfig.ts`       | All subcommands forwarded via runSubcommand              | WIRED  | Line 95-102: delegates show/set/get/edit/validate/migrate to wtconfig                         |
| `src/mcp/server.ts`                          | `@modelcontextprotocol/sdk` | `Tool` type with `annotations` and `outputSchema`        | WIRED  | `annotations` and `outputSchema` on all 5 tool definitions; exported `tools` array at line 58 |
| `src/cli/wt/completion.ts (ZSH_COMPLETION)`  | `src/cli/wt.ts`             | prs and init subcommands listed                          | WIRED  | ZSH_COMPLETION has 'prs:Browse repository pull requests' and 'init:Initialize configuration'  |
| `src/cli/wt/completion.ts (FISH_COMPLETION)` | `src/cli/wt.ts`             | prs and init subcommands listed                          | WIRED  | FISH_COMPLETION has `-a 'prs'` and `-a 'init'` entries                                        |

### Requirements Coverage

| Requirement                                                                     | Status    | Note                                                                                                              |
| ------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| LLM-01: Every wt subcommand emits valid CommandResult<T> JSON on --json         | SATISFIED | All CLI .fail()/.catch() handlers check JSON mode; wtconfig show/get/validate produce CommandResult; prs migrated |
| LLM-02: Help text and --help outputs accurate and complete                      | PARTIAL   | 8/9 subcommands fully accurate; wt list missing --filter/--refresh/--no-status                                    |
| LLM-03: MCP tool descriptions include input schema, output schema, example JSON | SATISFIED | All 5 MCP tools have annotations, outputSchema, "Example success response:" in descriptions                       |
| LLM-04: wt completion generates working scripts for bash, zsh, fish             | SATISFIED | bash (yargs-delegated), zsh, fish all include all 9 subcommands and key flags                                     |

### Anti-Patterns Found

| File                  | Line               | Pattern                                                                                            | Severity | Impact                                                                                        |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `src/cli/wtconfig.ts` | 558, 574, 580, 595 | `JSON.stringify(...)` instead of `createErrorResult()`/`formatJsonResult()` in `runMigrateCommand` | Warning  | migrate --json outputs non-standard JSON (no timestamp, no suggestion, inconsistent envelope) |

**Note on migrate anti-pattern:** The `runMigrateCommand` function in `wtconfig.ts` uses raw `JSON.stringify({success: true/false, ...})` for its JSON output (lines 558-603). This is inconsistent with the `CommandResult<T>` pattern used everywhere else. The plan's scope did not include migrate's JSON output (the plan specified show/get/validate only), but this is a pre-existing inconsistency that was not fixed.

### Human Verification Required

No human verification required. All automated checks are definitive.

## Gaps Summary

One partial gap found:

**wt list --help missing flags (from plan 04-02 truth #4):** The plan truth stated `wt list --help` should list `--no-status, --filter, --refresh` flags. The actual `list.ts` has `--status` (not `--no-status`), and is missing `--filter` and `--refresh`. This was an intentional deviation documented in the 04-02 SUMMARY: the underlying `lswt` CLI uses strict arg parsing and rejects unknown flags, so these cannot be added to the wrapper without first adding them to lswt.

This gap does NOT block the phase goal ("accurate and complete help text") in practice because:

- The omission is correct behavior (forwarding these would cause runtime errors)
- The SUMMARY documents the reason explicitly
- The completion script includes `--refresh` for list (as a forward-looking addition per 04-04 decision)

However, it IS a deviation from the written must-have truth and should be tracked.

The one warning anti-pattern (migrate JSON inconsistency) is pre-existing and out of scope for this phase.

**Overall:** Phase 4 goal is substantially achieved. JSON output gaps are closed across all CLI error paths. MCP annotations are complete. Completion scripts are updated. The single partial is a deliberate upstream-blocked deferral, not a missed task.

---

_Verified: 2026-02-18T22:28:06Z_
_Verifier: Claude (gsd-verifier)_
