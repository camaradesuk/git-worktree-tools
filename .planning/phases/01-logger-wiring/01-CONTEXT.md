# Phase 1: Logger Wiring - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>

## Phase Boundary

Wire the shared `logger` singleton into all 4 legacy CLI entry points (`newpr`,
`cleanpr`, `lswt`, `wtlink`) and remove the `newpr`-specific `debug()` / `DEBUG=newpr`
mechanism. Replace `logger.ts` with `consola`. Add a persistent audit log file.
Wire `--verbose`, `--quiet`, and `--no-color` flags into all 5 binaries. No UI
output changes — that is Phase 2.

</domain>

<decisions>

## Implementation Decisions

### Logger implementation

- Replace `logger.ts` with `consola@^3.4.2` (not an extension of the existing implementation)
- consola was chosen for: built-in CI detection, clean API, ESM-native, file output support
- All existing callers of `logger.*` must be updated to the consola API

### Default log level

- Default: INFO (informational + warnings + errors) when no flags or env vars are set
- Rationale: shows major steps (creating worktree, PR created) without being overwhelming

### Audit log file

- **On by default** — every command writes to the audit log automatically
- **Location:** Platform XDG default:
  - Linux: `~/.local/share/git-worktree-tools/audit.log`
  - macOS: `~/Library/Application Support/git-worktree-tools/audit.log`
  - Windows: `%APPDATA%/git-worktree-tools/audit.log`
- **Format:** Human-readable text by default; JSON (JSONL) when `--json` flag is active
- **Entry content (full structured envelope):**
  - timestamp, log level, command name
  - working directory, current git branch
  - exit code (written on process exit)
  - duration, worktree path (if applicable), PR number (if applicable), relevant git state
- **Rotation:** Size-based — 10MB max, keep 3 files (`audit.log`, `audit.log.1`, `audit.log.2`)

### Flag precedence

- Priority order: CLI flag > `GWT_LOG_LEVEL` env var > default (INFO)
- `--verbose` → DEBUG level
- `--quiet` → ERROR level only
- CLI flag explicitly overrides env var

### Flag availability

- `--verbose`, `--quiet`, `--no-color` added to **all 5 binaries** (`wt` + `newpr`, `cleanpr`, `lswt`, `wtlink`)
- Rationale: consistency even on deprecated aliases — users shouldn't get different behavior depending on which binary they call

### `--no-color` / `NO_COLOR` handling

- Handle in this phase (not deferred to Phase 2)
- Reason: logger output uses color for level labels; wiring color control now avoids re-touching logger in Phase 2
- Respect both `--no-color` CLI flag and `NO_COLOR` env var (standard convention)
- `--no-color` flag wins over `NO_COLOR` env var if both set

### newpr debug migration

- Internal calculations (git state detection, scenario selection, action execution) → `logger.debug()`
- User-visible progress steps ("creating worktree...", "running hook...", "pushing branch...") → `logger.info()`
- Existing `debug()` function and `DEBUG_ENABLED` constant in `newpr.ts` removed entirely
- `DEBUG=newpr` env var: **auto-mapped** — if set, activate DEBUG level (backwards compat)
- Print deprecation warning when `DEBUG=newpr` is detected: `"DEBUG=newpr is deprecated, use GWT_LOG_LEVEL=debug"`
- Note for documentation: `DEBUG=newpr` mapping will be removed in a future major version

### Logger output destinations

- Normal operation: file only (audit log), nothing to terminal
- `--verbose` passed: file + stderr stream in real time
- WARN and ERROR: always printed to stderr regardless of `--verbose` flag

</decisions>

<specifics>

## Specific Ideas

- The auto-mapping of `DEBUG=newpr` must print the deprecation warning exactly once per process
  invocation, not once per debug call
- Log entry at process exit should capture exit code and total duration so the audit trail
  is complete even for commands that fail midway

</specifics>

<deferred>

## Deferred Ideas

- Configuring log file location via `.worktreerc` `logFile` key — deferred; platform defaults are
  sufficient for v1, add user override later
- Disabling audit logging via `.worktreerc` — deferred; default-on is the goal for v1
- Upgrading `GWT_LOG_LEVEL` to support named levels beyond debug/info/warn/error (e.g., trace) — deferred

</deferred>

---

_Phase: 01-logger-wiring_
_Context gathered: 2026-02-18_
