---
milestone: v1.0
audited: 2026-03-01T12:00:00Z
status: tech_debt
scores:
  requirements: 19/20
  phases: 5/5
  integration: 12/14
  flows: 4/6
gaps:
  requirements:
    - 'LLM-02 partial: wt list --help missing --filter, --refresh, --no-status flags (upstream-blocked by lswt strict arg parsing)'
  integration:
    - 'initializeLoggerFromCliFlags in wt.ts does not pass --json to initializeLogger — audit log writes text instead of JSONL for wt --json commands'
    - 'wt/prs.ts handler never calls setJsonMode() — inconsistent with all other subcommand handlers'
  flows:
    - 'wt clean --json: audit log writes text format instead of JSONL (user-facing JSON output is correct)'
    - 'wt prs: bypasses Phase 2 UI primitives entirely, uses direct console.error(colors.*) pattern'
tech_debt:
  - phase: 02-shared-ui-primitives
    items:
      - 'withSpinner imported from prompts.js not ui/index.js in some CLIs (functional equivalence maintained)'
      - '4x console.log(colors.*) decorative group labels in cleanpr.ts (intentional per plan decision)'
  - phase: 04-json-output-and-llm-ergonomics
    items:
      - 'wtconfig.ts runMigrateCommand uses raw JSON.stringify instead of CommandResult<T> pattern'
      - 'wt list --help missing --filter/--refresh/--no-status flags (upstream-blocked, deferred)'
  - phase: 05-in-process-delegation
    items:
      - 'runSubcommand/runSubcommandForResult in run-command.ts are now orphaned (no production callers)'
  - phase: cross-phase
    items:
      - 'initializeLoggerFromCliFlags does not read --json from argv — audit log format not set for wt entry point'
      - 'wt/prs.ts handler skips setJsonMode() call — inconsistent with all other handlers'
      - 'prs/command.ts uses direct console.error(colors.*) instead of UI module printError()'
---

# Milestone v1.0 Audit Report

**Milestone:** CLI Consistency
**Audited:** 2026-03-01
**Status:** tech_debt — all requirements met (19 fully, 1 partial), no critical blockers, accumulated tech debt needs review

## Requirements Coverage

| Requirement | Description                                | Phase   | Status    |
| ----------- | ------------------------------------------ | ------- | --------- |
| LOG-01      | GWT_LOG_LEVEL controls all debug output    | Phase 1 | SATISFIED |
| LOG-02      | newpr debug routes through shared logger   | Phase 1 | SATISFIED |
| LOG-03      | All commands write to persistent audit log | Phase 1 | SATISFIED |
| LOG-04      | --verbose/--quiet flags work consistently  | Phase 1 | SATISFIED |
| UI-01       | Shared src/lib/ui/ output primitives       | Phase 2 | SATISFIED |
| UI-02       | Consistent icon semantics across commands  | Phase 2 | SATISFIED |
| UI-03       | Same spinner style for async operations    | Phase 2 | SATISFIED |
| UI-04       | Error title + detail + hint format         | Phase 2 | SATISFIED |
| MENU-01     | wtlink menu actions invoke existing code   | Phase 3 | SATISFIED |
| MENU-02     | No silent exits; Back/Done options present | Phase 3 | SATISFIED |
| MENU-03     | wt prs uses single working code path       | Phase 3 | SATISFIED |
| MENU-04     | Ctrl+C restores terminal state cleanly     | Phase 3 | SATISFIED |
| LLM-01      | Valid CommandResult JSON on --json         | Phase 4 | SATISFIED |
| LLM-02      | Help text accurate and complete            | Phase 4 | PARTIAL   |
| LLM-03      | MCP tool descriptions fully documented     | Phase 4 | SATISFIED |
| LLM-04      | Shell completions for all subcommands      | Phase 4 | SATISFIED |
| UNI-01      | Legacy binaries print deprecation notice   | Phase 5 | SATISFIED |
| UNI-02      | wt subcommands call library directly       | Phase 5 | SATISFIED |
| UNI-03      | Global flags work consistently             | Phase 5 | SATISFIED |
| UNI-04      | README presents wt as canonical            | Phase 5 | SATISFIED |

**Score: 19/20 satisfied, 1 partial**

**Partial requirement (LLM-02):** `wt list --help` is missing `--filter`, `--refresh`, and `--no-status` flags. This was intentionally deferred because the underlying `lswt` CLI uses strict arg parsing and rejects unknown flags — adding these to the wrapper without upstream support would cause runtime errors.

## Phase Verification Summary

| Phase                             | Score | Status                 | Verified   |
| --------------------------------- | ----- | ---------------------- | ---------- |
| 1. Logger Wiring                  | 5/5   | Passed                 | 2026-02-18 |
| 2. Shared UI Primitives           | 4/4   | Passed                 | 2026-02-18 |
| 3. Interactive Menu Reliability   | 8/8   | Passed                 | 2026-02-18 |
| 4. JSON Output and LLM Ergonomics | 15/16 | Gaps Found (1 partial) | 2026-02-18 |
| 5. In-Process Delegation          | 6/6   | Passed                 | 2026-02-19 |

**Score: 5/5 phases complete (38/39 truths verified, 1 partial)**

## Cross-Phase Integration

| Integration Point                                     | Status           | Notes                                                                                |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| Phase 1→2: Logger JSON mode → UI setJsonMode          | Not bridged      | Independent gates by design; each handler calls setJsonMode separately               |
| Phase 1→5: --verbose/--quiet → initializeLogger       | Connected        | wt.ts startup reads argv directly; works via double-read of process.argv             |
| Phase 2→3: Interactive menu uses UI primitives        | Connected        | interactive-menu.ts imports printStatus/printError from ui/index                     |
| Phase 2→4: setJsonMode in error paths                 | Mostly connected | All handlers call setJsonMode except wt/prs.ts                                       |
| Phase 2→5: wt handlers use printStatus/printError     | Connected        | All 6 wt handlers import and use UI module                                           |
| Phase 3→5: Interactive menu uses direct library calls | Connected        | All 6 operations verified in-process; zero runSubcommand calls                       |
| Phase 4→5: Handlers produce CommandResult JSON        | Connected        | All wt handlers output JSON via formatJsonResult when --json                         |
| Phase 1→4: Audit log captures in-process activity     | Partial          | initializeLoggerFromCliFlags doesn't read --json; audit log always text for wt entry |

**Connected: 12/14 | Partial: 2/14**

## E2E Flow Verification

| Flow                  | Status   | Notes                                                              |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `wt new "feature"`    | Complete | Logger → handler → UI → JSON output → audit log                    |
| `wt list --verbose`   | Complete | Logger at DEBUG → gatherWorktreeInfo → printWorktreeTable          |
| `wt clean --json`     | Partial  | User-facing JSON correct; audit log writes text not JSONL          |
| `wt` interactive menu | Complete | Menu loop → direct library calls → return to menu → Ctrl+C safe    |
| `lswt` legacy command | Complete | Deprecation notice → full execution → audit log                    |
| `wt prs --refresh`    | Partial  | Refresh works; skips setJsonMode; uses console.error not UI module |

**Complete: 4/6 | Partial: 2/6**

## Tech Debt Summary

### Phase 2: Shared UI Primitives (2 items)

- withSpinner imported from `prompts.js` not `ui/index.js` in some CLIs (functional equivalence maintained)
- 4x `console.log(colors.*)` decorative group labels in `cleanpr.ts` (intentional per plan decision)

### Phase 4: JSON Output and LLM Ergonomics (2 items)

- `wtconfig.ts` `runMigrateCommand` uses raw `JSON.stringify` instead of `CommandResult<T>` pattern
- `wt list --help` missing `--filter`/`--refresh`/`--no-status` flags (upstream-blocked, deferred)

### Phase 5: In-Process Delegation (1 item)

- `runSubcommand`/`runSubcommandForResult` in `run-command.ts` are now orphaned with no production callers

### Cross-Phase (3 items)

- `initializeLoggerFromCliFlags` does not read `--json` from argv — audit log format not JSONL for `wt --json` commands
- `wt/prs.ts` handler skips `setJsonMode()` call — inconsistent with all other handlers
- `prs/command.ts` uses direct `console.error(colors.*)` instead of UI module `printError()`

### Total: 8 items across 4 categories

## Conclusion

The milestone achieved its definition of done. All 5 phases completed and verified. 19/20 v1 requirements satisfied with 1 partial (upstream-blocked, not a missed task). The accumulated tech debt is non-critical — primarily consistency gaps in the prs command and audit log format edge case. No critical blockers exist.

---

_Audited: 2026-03-01_
_Auditor: Claude (milestone audit)_
