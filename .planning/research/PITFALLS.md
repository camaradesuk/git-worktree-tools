# Pitfalls Research

**Domain:** CLI unification and logging refactoring for a Node.js/TypeScript worktree tool
**Researched:** 2026-02-18
**Confidence:** HIGH (based on direct codebase analysis) / MEDIUM (for general CLI patterns from engineering knowledge)

---

## Critical Pitfalls

### Pitfall 1: Subprocess Delegation Breaks Logger Continuity

**What goes wrong:**
`wt` subcommands currently delegate to legacy CLIs via `spawnSync(process.execPath, [cliPath, ...args], { stdio: 'inherit' })`. The child process is a completely separate Node.js runtime. Any logger state (log level, log file, verbosity) initialized by `wt` dies at the process boundary. The child process (`newpr`, `cleanpr`, etc.) never calls `initializeLogger()` and has no access to `--verbose` or `--log-file` flags parsed by the parent `wt` process.

**Why it happens:**
The delegation pattern (`run-command.ts`) was a fast way to wire up `wt new` → `newpr` without rewriting logic. It works for basic pass-through but cannot propagate runtime state.

**How to avoid:**
Either (a) pass logging flags explicitly as environment variables in the child spawn env (e.g., `GWT_LOG_LEVEL`, `GWT_LOG_FILE`), or (b) refactor legacy CLIs to import and use the singleton logger so it reads those env vars. Option (b) is correct long-term. Until then, `wt --verbose new "..."` silently loses verbosity inside the child process.

**Warning signs:**

- `wt -v new "feature"` produces no debug output, but `DEBUG=newpr newpr "feature"` produces different debug output
- Log file specified via `wt --log-file /tmp/wt.log new "..."` is empty after the run
- `newpr.ts` still checks `process.env.DEBUG === 'newpr'` (line 59-60), not `GWT_LOG_LEVEL`

**Phase to address:**
Logger migration phase — must happen before `newpr.ts` debug() is removed. Convert `newpr.ts` to call `initializeLogger()` at startup and replace all `debug()` calls with `logger.debug()`. Apply same to `cleanpr.ts`, `lswt.ts`, `wtlink.ts`.

---

### Pitfall 2: Silent Exit When Subprocess Returns to Interactive Menu

**What goes wrong:**
`interactive-menu.ts` in `wt` calls `runSubcommand()` which calls `spawnSync()` and then `process.exit(result.status ?? 1)`. The `runSubcommand` function is typed to return `never`. This means once any menu action triggers a subcommand, the entire `wt` process exits — there is no returning to the main menu after "List worktrees" or "Create new PR". The `FlowResult` return types (`COMPLETED_EXIT`, `CANCELLED`) are misleading because the flow never actually returns.

**Why it happens:**
The legacy CLIs were designed as standalone tools that each own their process lifecycle. Wrapping them with `runSubcommand` preserves their exit behavior but breaks the interactive loop expected by a unified TUI.

**How to avoid:**
Either (a) replace `runSubcommand` with direct function-call imports in menu handlers (removes the subprocess boundary), or (b) use `spawnSync` but do not call `process.exit()` afterward — capture the return code and continue the menu loop. Option (a) is the clean solution but requires the legacy CLIs to export their `main()` function as a pure async function with no `process.exit()` calls inside.

**Warning signs:**

- `handleListWorktrees()` returns `COMPLETED_EXIT` but `runSubcommand('lswt', [])` already exited the process
- Any PTY test for "navigate to List, navigate back, select Clean" will timeout or get unexpected exit
- Menu items under the "Link config files" submenu reference `wtlink list`, `wtlink sync`, `wtlink add` — these subcommands do not exist in the current `wtlink` binary (it has `manage`, `link`, `validate`, `migrate`)

**Phase to address:**
Interactive menu fix phase — must audit every `runSubcommand` call in `interactive-menu.ts` and decide whether the command should (a) stay as subprocess (exits flow) or (b) become a library call (allows return to menu).

---

### Pitfall 3: manage-manifest.ts Cannot Be Lightly Refactored

**What goes wrong:**
`manage-manifest.ts` is 2042 lines. It mixes business logic, TUI rendering (raw readline + `@preact/signals-core`), and direct `console.log()` output in the same functions. Any attempt to wire it into the shared logger will require touching 132 `console.log/error` calls in this file alone. Partial migration (replacing only some calls) will produce inconsistent output — some output goes to the logger (and respects `--quiet`), some bypasses it.

**Why it happens:**
The file grew organically from a simple manifest manager to a full TUI with signal-based state management. Output and rendering logic were never separated.

**How to avoid:**
Treat `manage-manifest.ts` as a component with a defined output interface. Do not attempt line-by-line logger replacement. Instead: (1) identify all user-facing print calls vs. internal debug calls, (2) replace debug-level internal calls with `logger.debug()`, (3) leave TUI rendering calls as `process.stdout.write()` or similar (they are presentation, not logging), (4) only replace status/error summary calls with `logger.info/error`.

**Warning signs:**

- The file uses `console.clear()` (line in `main-menu.ts`) which will clear the entire terminal — this must NOT go through a logger
- `@preact/signals-core` state updates trigger render functions that write directly to stdout — logger cannot intercept these without wrapping stdout
- PTY tests for `wtlink manage` are the validation mechanism; if they start failing, a refactor went wrong

**Phase to address:**
Logging migration phase — `manage-manifest.ts` should be the last file touched. Fix simpler CLIs first to establish the pattern, then apply to this file.

---

### Pitfall 4: Breaking Backwards Compatibility for Existing Users

**What goes wrong:**
Users with existing scripts call `newpr`, `cleanpr`, `lswt`, `wtlink` directly. These are all registered in `package.json` `bin`. If logging refactoring changes exit codes, output format, or flag behavior in these CLIs, user scripts break silently. Particular risks:

- Adding `initializeLogger()` to `newpr.ts` that reads `GWT_LOG_LEVEL=debug` from environment adds unexpected debug noise to stdout if a user happens to have that env var set for another tool
- Renaming or removing any flag that current users depend on (e.g., `wtlink --manifest-file` is already marked deprecated/hidden but still works)
- Changing `console.log` to `logger.info` in `lswt.ts` means `--quiet` flag silences output that scripts were parsing

**Why it happens:**
Unified logging with `--quiet` support is a legitimate feature, but it changes observable behavior of standalone legacy CLIs in ways users don't expect.

**How to avoid:**

- Never change default log level of standalone CLIs; `INFO` output must remain visible without any flags
- Treat stdout output from `lswt` and `cleanpr` as a stable API — only add the logger for debug/trace messages, not for existing info output
- Add a `--quiet` flag to legacy CLIs only if they do not already have one, and document it as new behavior
- Keep all existing `bin` entries in `package.json`; do not remove them even when `wt new` / `wt list` / etc. are stable

**Warning signs:**

- Any existing E2E test for a legacy CLI that asserts specific stdout content — if it fails after a logger change, you broke the output contract
- `lswt.ts` has 22 `console.log` calls; `cleanpr.ts` has 63; these are user-visible output, not debug logging

**Phase to address:**
All phases — this is a constraint, not a one-time task. Every PR touching a legacy CLI should explicitly check whether stdout/stderr contract is preserved.

---

## Moderate Pitfalls

### Pitfall 5: DEBUG Environment Variable Collision

**What goes wrong:**
`newpr.ts` checks `process.env.DEBUG === 'newpr' || process.env.DEBUG === '*' || process.env.DEBUG === '1'` (lines 59-60). The singleton logger uses `GWT_LOG_LEVEL`. After migration, if `DEBUG=newpr` is removed but users relied on it, they lose their debugging workflow. If both exist simultaneously during transition, the same information might appear twice.

**How to avoid:**
During migration, have `newpr.ts` honor both env vars: `DEBUG=newpr` continues to work AND `GWT_LOG_LEVEL=debug` also enables debug output. Remove the `DEBUG` path only after a deprecation notice. Add a one-time warning: `"DEBUG=newpr is deprecated; use GWT_LOG_LEVEL=debug instead"`.

**Phase to address:**
Logger migration phase for `newpr.ts`.

---

### Pitfall 6: PTY Tests Are Fragile on CI Matrix

**What goes wrong:**
`node-pty` is a native addon (requires compilation). On the CI matrix (Ubuntu/macOS/Windows × Node 18/20/22), the PTY spawn check (`canSpawnPty()`) can fail silently — tests that rely on PTY simply skip with `describe.skipIf(!(await isPtyAvailable()))`. If a refactoring breaks an interactive menu in a way that only shows up via PTY (e.g., the menu exits immediately instead of showing options), the test suite will pass with a false green because PTY tests were skipped.

**How to avoid:**

- Add a non-PTY test that at minimum verifies the process does not exit immediately when invoked with a non-TTY stdin (`echo "" | wt`)
- Separate interactive behavior tests from pure rendering unit tests; test the flow logic (handlers) directly without PTY
- The existing `interactive-menu.test.ts` mocking pattern is correct — maintain it for all new menu flows

**Warning signs:**

- `describe.skipIf(!GH_AVAILABLE)` and PTY availability checks — if most tests are behind skip guards, the test suite provides false confidence
- A CI run where zero PTY tests ran but all tests passed should be treated as a coverage gap, not success

**Phase to address:**
Interactive menu fix phase — add mandatory non-PTY smoke tests before PTY-specific tests.

---

### Pitfall 7: The Singleton Logger Is Only Initialized in `wt.ts`

**What goes wrong:**
`logger` is a module-level singleton (`Logger.getInstance()`). When `newpr.ts`, `cleanpr.ts`, `lswt.ts`, or `wtlink.ts` import library modules that call `logger.debug()` (e.g., `config.ts`, `config-manifest.ts`, `global-check.ts`), the logger has never been initialized in those processes. It falls back to default settings (INFO level, no file output). This means debug logging from library code is suppressed even when `DEBUG=newpr` is set — only the local `debug()` function in `newpr.ts` fires.

**How to avoid:**
Each CLI entry point that wants logger output must call `initializeLogger()` before any library imports execute their module-level code. Since ES module imports run synchronously at load time, `initializeLogger()` must be called before the first library import that may produce output. In practice this means calling it at the very top of the CLI file, before other imports, which TypeScript/ESM does not easily support. The pattern used in `wt.ts` (calling `initializeLoggerFromCliFlags()` before `yargs` is constructed) is the correct approach.

**Warning signs:**

- Library code that uses `logger.debug()` never produces output even with `-vv` on legacy CLIs
- Tests that mock `logger` find it in the default-initialized state instead of test-configured state

**Phase to address:**
Logger migration phase — each legacy CLI entrypoint must get its own `initializeLoggerFromCliFlags()` call.

---

### Pitfall 8: Menu References Non-Existent Subcommands

**What goes wrong:**
`interactive-menu.ts` in `wt` calls `runSubcommand('wtlink', ['list'])`, `runSubcommand('wtlink', ['sync'])`, `runSubcommand('wtlink', ['add', filePath])`, and `runSubcommand('wtlink', ['remove', filePath])`. None of these subcommands exist in `wtlink.ts`. The existing subcommands are `manage`, `link`, `validate`, and `migrate`. This means the "Link config files" menu flow in `wt` is completely broken: every option except "Validate" and "Back" will fail with a yargs "Unknown argument" error.

**How to avoid:**
Before shipping the interactive menu, verify every `runSubcommand` call against the actual subcommand definitions in the target CLI. Add an integration test that runs each menu action end-to-end with non-interactive flags.

**Warning signs:**

- `wtlink --strict` will reject unknown subcommands, but the error may be swallowed by the interactive menu's catch block
- PTY tests for these flows were never written (or were skipped), so the breakage is invisible

**Phase to address:**
Interactive menu fix phase — audit all `runSubcommand` calls against real subcommand lists. This is a prerequisite to any further menu work.

---

## Minor Pitfalls

### Pitfall 9: `console.clear()` in Non-TTY Environments

**What goes wrong:**
`main-menu.ts` for `wtlink` calls `console.clear()` at the start of each menu render loop. In non-TTY environments (CI, piped output, test runners), this emits `\x1Bc` or `\x1B[2J\x1B[0;0H` ANSI sequences that pollute captured output and break snapshot tests.

**How to avoid:**
Gate `console.clear()` on `process.stdout.isTTY`. The pattern should be `if (process.stdout.isTTY) console.clear()`.

**Phase to address:**
Interactive menu fix phase.

---

### Pitfall 10: Log File Rotation Creates Files in Unexpected Locations

**What goes wrong:**
`logger.ts` has log file rotation logic (`MAX_LOG_FILE_SIZE`, `MAX_LOG_FILES`). The default log directory (`getGlobalLogDir()`) writes to a global user directory. Users who enable logging in `.worktreerc` and then run the tool many times will accumulate log files they never knew existed.

**How to avoid:**
Document the log file location in `wt init` output. Add `wt logs` or `wt --log-location` as a discoverability aid. Ensure the log rotation constants are conservative (the current approach exists but needs validation).

**Phase to address:**
Logger migration phase.

---

## Technical Debt Patterns

| Shortcut                                                | Immediate Benefit              | Long-term Cost                                                        | When Acceptable                                                                      |
| ------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `runSubcommand` delegation in `wt` subcommands          | No need to refactor CLI logic  | Logger state, signals, interactive mode all break at process boundary | Never — must be replaced with direct imports for any command that needs shared state |
| Local `debug()` function in `newpr.ts`                  | No singleton dependency        | Two parallel debug systems; users need two different env vars         | Acceptable only during transition; remove once `logger.debug()` is wired             |
| Keeping all `console.log` calls in `manage-manifest.ts` | No disruption to TUI rendering | Cannot be suppressed by `--quiet`, cannot go to log file              | Acceptable for TUI render calls; never acceptable for status/error messages          |
| `process.exit()` inside library functions               | Simple error handling          | Makes functions untestable without process mocking                    | Never in library code; acceptable only in CLI entry points                           |

---

## Integration Gotchas

| Integration                         | Common Mistake                                                                 | Correct Approach                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `yargs` + logger initialization     | Calling `initializeLogger` inside yargs handler (too late for library imports) | Parse logging flags manually from `process.argv` before yargs runs, as `wt.ts` does |
| `node-pty` in CI                    | Assuming PTY tests run everywhere                                              | Always check `isPtyAvailable()` and `canSpawnPty()`; have non-PTY fallback tests    |
| `spawnSync` with `stdio: 'inherit'` | Assuming logger file output goes to the same file as the parent                | File streams are per-process; child has no file stream                              |
| `inquirer` + raw readline           | Mixing inquirer prompts and custom readline interfaces                         | Pick one; `manage-manifest.ts` mixes both, causing readline conflicts               |

---

## UX Pitfalls

| Pitfall                                      | User Impact                                             | Better Approach                                                                 |
| -------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `wt list` exits instead of returning to menu | User has to re-invoke `wt` to do anything after listing | `wt list` should return control to the menu loop, not exit                      |
| `--quiet` silences progress output           | Users don't know if a long operation is running         | Reserve `--quiet` for suppressing info, not progress; use stderr for progress   |
| Error output mixed with JSON output          | `--json` mode includes ANSI errors in stdout            | All non-JSON output must go to stderr in `--json` mode; audit all 4 legacy CLIs |
| `console.clear()` without TTY check          | CI logs show garbled output                             | Gate all terminal-manipulation calls on `isTTY`                                 |

---

## "Looks Done But Isn't" Checklist

- [ ] **Logger migration:** Verify `logger.debug()` output actually appears when running `GWT_LOG_LEVEL=debug newpr "test"` — it will not unless `initializeLogger()` is called in `newpr.ts`
- [ ] **Menu navigation:** Verify the main menu returns after a subcommand — it does not currently because `runSubcommand` exits the process
- [ ] **JSON mode:** Verify no ANSI escape codes appear in `--json` output — `lswt --json`, `newpr --json`, `cleanpr --json` must route all non-JSON output to stderr
- [ ] **Backwards compatibility:** Run existing E2E tests for `newpr`, `lswt`, `cleanpr`, `wtlink` after any logger change to verify stdout/stderr contract is unchanged
- [ ] **wtlink subcommands in menu:** Verify every `runSubcommand('wtlink', [...])` call references an actual `wtlink` subcommand that exists
- [ ] **PTY tests actually ran:** Check CI test output for `PTY not available` messages — if all PTY tests were skipped, the run provides false confidence

---

## Recovery Strategies

| Pitfall                                 | Recovery Cost | Recovery Steps                                                                                   |
| --------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| Subprocess delegation breaks logger     | MEDIUM        | Add env var propagation to `runSubcommand`; update each legacy CLI to read `GWT_LOG_LEVEL`       |
| Menu exits instead of returning         | HIGH          | Refactor `runSubcommand` calls to direct imports; remove `process.exit()` from library functions |
| `manage-manifest.ts` partially migrated | HIGH          | Revert partial migration; plan full migration as dedicated phase                                 |
| Backwards compatibility broken          | HIGH          | Audit E2E test failures; revert flag/output changes; add explicit test contract                  |
| PTY tests all skipped in CI             | LOW           | Add non-PTY smoke tests; ensure at least one CI environment supports PTY                         |
| DEBUG env var removed prematurely       | LOW           | Add back `DEBUG=newpr` support; document `GWT_LOG_LEVEL` as preferred                            |

---

## Pitfall-to-Phase Mapping

| Pitfall                                 | Prevention Phase           | Verification                                                                          |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Subprocess delegation breaks logger     | Logger migration phase     | `GWT_LOG_LEVEL=debug wt new "test"` produces debug output                             |
| Silent exit from interactive menu       | Interactive menu fix phase | PTY test: navigate to List, press Escape, return to main menu                         |
| manage-manifest.ts partial migration    | Logger migration phase     | Full E2E for `wtlink manage` still passes after changes                               |
| Backwards compatibility breakage        | Every phase                | All existing E2E tests for legacy CLIs pass unchanged                                 |
| DEBUG env var collision                 | Logger migration for newpr | `DEBUG=newpr newpr "test"` still works OR prints deprecation warning                  |
| PTY tests provide false confidence      | Interactive menu fix phase | At least one non-PTY smoke test per interactive flow                                  |
| Logger not initialized in legacy CLIs   | Logger migration phase     | Each CLI entry point has `initializeLoggerFromCliFlags()` before first library import |
| Non-existent wtlink subcommands in menu | Interactive menu fix phase | Integration test runs each menu action; none get "unknown command" error              |
| `console.clear()` in non-TTY            | Interactive menu fix phase | `wt` invoked with non-TTY stdin does not emit `\x1B[2J`                               |
| Log file in unexpected location         | Logger migration phase     | `wt init` output mentions log file location                                           |

---

## Sources

- Direct codebase analysis: `src/cli/newpr.ts` (1326 lines, local `debug()` at L59-84)
- Direct codebase analysis: `src/lib/wtlink/manage-manifest.ts` (2042 lines, 132 `console.log` calls)
- Direct codebase analysis: `src/cli/wt/run-command.ts` — `spawnSync` with `stdio: 'inherit'`, returns `never`
- Direct codebase analysis: `src/cli/wt/interactive-menu.ts` — all handlers call `runSubcommand()` and return `COMPLETED_EXIT`
- Direct codebase analysis: `src/lib/logger.ts` — singleton only initialized in `src/cli/wt.ts`
- Direct codebase analysis: `package.json` — all 6 legacy binaries still registered in `bin`
- Direct codebase analysis: `src/e2e/helpers/pty-wrapper.ts` — `canSpawnPty()` with fallback, skip guards throughout E2E tests
- Engineering knowledge (MEDIUM confidence): subprocess process isolation in Node.js, singleton logger patterns in CLI tools

---

_Pitfalls research for: git-worktree-tools CLI unification and logging refactoring_
_Researched: 2026-02-18_
