# Phase 7: Integration Gap Closure - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Close all 7 integration gaps (3 medium, 4 low) identified in the v1.0 milestone audit. Wire `initializeLogger()` and `printDeprecationNotice()` into the 3 deprecated legacy CLIs missing them (`wtstate`, `wtconfig`, `prs`), migrate raw console calls to UI primitives in `wtstate`, `wtconfig`, and `prs/command.ts`, and add the missing `setJsonMode()` call in `wt/config.ts`.

**Renamed from:** "Legacy CLI Wiring Completeness" → "Integration Gap Closure" to reflect expanded scope covering all 7 audit gaps.

</domain>

<decisions>
## Implementation Decisions

### Logger flag parsing

- All 3 CLIs get full `--verbose`/`--quiet` flag support matching the pattern in newpr, cleanpr, lswt, wtlink
- `wtstate.ts` and `wtconfig.ts`: manual `args.includes('--verbose')` / `args.includes('--quiet')` parsing (they don't use yargs)
- `prs.ts`: add `--verbose` and `--quiet` as yargs options (it already uses yargs)
- All 3 call `initializeLogger({ verbose, quiet, json, commandName })` with parsed flags
- `--no-color` also wired into all 3 CLIs: manual `args.includes('--no-color')` for wtstate/wtconfig, yargs option for prs, sets `process.env.NO_COLOR = '1'`

### prs deprecation

- `prs.ts` gets `printDeprecationNotice('prs', 'wt prs')` matching all other legacy CLIs

### Scope — all 7 audit gaps

- INT-01: `wtstate.ts` + `initializeLogger()` (medium)
- INT-02: `wtconfig.ts` + `initializeLogger()` (medium)
- INT-03: `prs.ts` + `initializeLogger()` + `printDeprecationNotice()` (medium)
- INT-04: `wtstate.ts` raw `console.error(colors.error(...))` → `printError()` (low)
- INT-05: `wtconfig.ts` full migration of 50+ raw console calls → UI primitives (low)
- INT-06: `wt/config.ts` missing `setJsonMode()` call (low)
- INT-07: `prs/command.ts` raw `console.error` → UI primitives (low)

### wtconfig UI migration depth

- Full migration: all 50+ raw console.log/error/warn calls replaced with UI primitives
- Includes wizard banners, config formatting display, help text — everything migrated
- New UI helpers may be needed if existing primitives don't cover all patterns (e.g., wizard step banners, config value formatting)

### Claude's Discretion

- Exact UI primitive mappings for wtconfig's decorative output (wizard banners, config value display)
- Whether to create new UI helpers or adapt existing ones for wtconfig patterns
- Testing approach for the new wiring (unit tests for initializeLogger/deprecation calls)
- Plan count and task decomposition

</decisions>

<specifics>
## Specific Ideas

No specific requirements — standard pattern replication from existing wired CLIs to the 3 unwired ones, plus UI primitive migration.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/lib/logger.ts`: `initializeLogger({ verbose, quiet, json, commandName })` — ready to import
- `src/lib/deprecation.ts`: `printDeprecationNotice(oldCmd, newCmd)` — ready to import
- `src/lib/ui/output.ts`: `printStatus()`, `printError()`, `printHeader()`, `printWarning()` — available for console call migration
- `src/lib/ui/table.ts`: `printTable()` — available for structured output
- `src/lib/json-output.ts`: `setJsonMode()` — needed for wt/config.ts fix

### Established Patterns

- Logger init pattern: `initializeLogger({ verbose: args.verbose, quiet: args.quiet, json: args.json, commandName: 'toolname' })`
- Deprecation pattern: `printDeprecationNotice('oldcmd', 'wt newcmd')` called before any other logic in `main()`
- Error rendering: `printError({ title, detail, hint })` replaces `console.error(colors.error(...))`
- Status messages: `printStatus('success' | 'warning' | 'info', message)` replaces `console.log(colors.success(...))`

### Integration Points

- `wtstate.ts` line 23: `main()` function — insert logger init before `printDeprecationNotice`
- `wtconfig.ts` line 84: `main()` function — insert logger init before `printDeprecationNotice`
- `prs.ts` line 28: `main()` function — insert both deprecation notice and logger init
- `src/cli/wt/config.ts`: add `setJsonMode()` call in handler

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 07-legacy-cli-wiring-completeness_
_Context gathered: 2026-03-09_
