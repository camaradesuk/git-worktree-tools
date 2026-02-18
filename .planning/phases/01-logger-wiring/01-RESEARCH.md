# Phase 1: Logger Wiring - Research

**Researched:** 2026-02-18
**Domain:** Logging infrastructure, CLI flag wiring, audit trail
**Confidence:** HIGH

## Summary

Phase 1 replaces the custom `src/lib/logger.ts` singleton with `consola@^3.4.2`, wires it into all CLI entry points, removes the newpr-specific `debug()`/`DEBUG=newpr` mechanism, adds a persistent audit log file with size-based rotation, and adds `--verbose`/`--quiet`/`--no-color` flags to all 5 binaries (`wt`, `newpr`, `cleanpr`, `lswt`, `wtlink`).

The existing logger (`src/lib/logger.ts`) is a 520-line hand-rolled singleton with file logging, rotation, child loggers, and level management. It is imported by 7 library files (`config.ts`, `global-config.ts`, `global-check.ts`, `config-manifest.ts`, `config-migration/runner.ts`, `config-migration/detector.ts`) and the `wt.ts` entry point. The `newpr.ts` CLI has its own parallel `debug()` function gated by `DEBUG=newpr`. The other legacy CLIs (`cleanpr.ts`, `lswt.ts`) have no debug/logging infrastructure at all.

**Primary recommendation:** Create a `src/lib/logger.ts` replacement module that wraps `consola` via `createConsola()`, exposes the same `logger` singleton export name for minimal import churn, adds a custom file reporter for audit logging, and handles the `DEBUG=newpr` deprecation warning. Wire `--verbose`/`--quiet`/`--no-color` into all 5 binaries by updating their argument parsers.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Replace `logger.ts` with `consola@^3.4.2` (not an extension of the existing implementation)
- consola was chosen for: built-in CI detection, clean API, ESM-native, file output support
- All existing callers of `logger.*` must be updated to the consola API
- Default log level: INFO when no flags or env vars are set
- Audit log **on by default** -- every command writes to the audit log automatically
- Audit log location: Platform XDG default:
  - Linux: `~/.local/share/git-worktree-tools/audit.log`
  - macOS: `~/Library/Application Support/git-worktree-tools/audit.log`
  - Windows: `%APPDATA%/git-worktree-tools/audit.log`
- Audit log format: Human-readable text by default; JSON (JSONL) when `--json` flag is active
- Audit log entry content (full structured envelope):
  - timestamp, log level, command name
  - working directory, current git branch
  - exit code (written on process exit)
  - duration, worktree path (if applicable), PR number (if applicable), relevant git state
- Rotation: Size-based -- 10MB max, keep 3 files (`audit.log`, `audit.log.1`, `audit.log.2`)
- Flag precedence: CLI flag > `GWT_LOG_LEVEL` env var > default (INFO)
- `--verbose` maps to DEBUG level, `--quiet` maps to ERROR level only
- `--verbose`, `--quiet`, `--no-color` added to all 5 binaries
- Handle `--no-color` / `NO_COLOR` in this phase (not deferred)
- Respect both `--no-color` CLI flag and `NO_COLOR` env var; `--no-color` wins if both set
- newpr debug migration:
  - Internal calculations -> `logger.debug()`
  - User-visible progress steps -> `logger.info()`
  - Remove `debug()` function and `DEBUG_ENABLED` constant entirely
  - `DEBUG=newpr` auto-mapped to DEBUG level (backwards compat), prints deprecation warning exactly once
  - `DEBUG=newpr` mapping will be removed in a future major version
- Logger output destinations:
  - Normal operation: file only (audit log), nothing to terminal
  - `--verbose` passed: file + stderr stream in real time
  - WARN and ERROR: always printed to stderr regardless of `--verbose` flag

### Claude's Discretion

(No discretion areas specified -- all decisions locked.)

### Deferred Ideas (OUT OF SCOPE)

- Configuring log file location via `.worktreerc` `logFile` key
- Disabling audit logging via `.worktreerc`
- Upgrading `GWT_LOG_LEVEL` to support named levels beyond debug/info/warn/error (e.g., trace)

</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose          | Why Standard                                                                         |
| ------- | ------- | ---------------- | ------------------------------------------------------------------------------------ |
| consola | ^3.4.2  | Logger framework | User decision. ESM-native, TypeScript, CI detection via std-env, pluggable reporters |

### Supporting

| Library      | Version | Purpose | When to Use                                                        |
| ------------ | ------- | ------- | ------------------------------------------------------------------ |
| (none added) | --      | --      | Rotation is simple enough to hand-roll (see Architecture Patterns) |

### Alternatives Considered

| Instead of            | Could Use            | Tradeoff                                                                                                                                                                                   |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hand-rolled rotation  | rotating-file-stream | Adds a dependency for ~20 lines of rotation logic; overkill for size-only rotation on startup                                                                                              |
| Hand-rolled XDG paths | env-paths            | Already in lockfile as transitive dep; but project already has `getGlobalConfigDir()`/`getGlobalLogDir()` in constants.ts -- adding one more function (`getGlobalDataDir()`) is consistent |

**Installation:**

```bash
npm install consola@^3.4.2
```

## Architecture Patterns

### Recommended Module Structure

```
src/lib/
├── logger.ts              # REPLACED: consola wrapper, singleton, custom reporters
├── logger.test.ts         # REPLACED: tests for new logger
├── constants.ts           # UPDATED: add getGlobalDataDir(), update MAX_LOG_FILE_SIZE to 10MB
├── colors.ts              # UPDATED: respect --no-color flag (set dynamically, not just at import)
```

### Pattern 1: Consola Singleton Wrapper

**What:** Wrap `createConsola()` in a module that exports a `logger` singleton and initialization functions, preserving the same import name as today.

**When to use:** All logger consumers import `{ logger }` from this module.

**Rationale:** Minimizes import churn. Today 7 files import `{ logger }` from `'./logger.js'` or `'../logger.js'`. By keeping the export name, those imports don't change -- only the API calls need updating (which must happen anyway per the user's decision).

```typescript
// src/lib/logger.ts (new implementation)
import { createConsola, type ConsolaReporter, type LogObject, type ConsolaOptions } from 'consola';
import { getGlobalDataDir } from './constants.js';
import path from 'path';
import fs from 'fs';

// Custom file reporter for audit log
class AuditFileReporter implements ConsolaReporter {
  private stream: fs.WriteStream | null = null;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.ensureDir();
    this.rotateIfNeeded();
    this.stream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  log(logObj: LogObject, ctx: { options: ConsolaOptions }) {
    if (!this.stream) return;
    const entry = this.formatEntry(logObj);
    this.stream.write(entry + '\n');
  }

  private formatEntry(logObj: LogObject): string {
    // Human-readable or JSONL depending on --json mode
    // ...
  }

  // ... rotation, cleanup
}

// Custom stderr reporter that respects output rules:
// - WARN/ERROR always to stderr
// - DEBUG/INFO to stderr only when --verbose
class StderrReporter implements ConsolaReporter {
  constructor(private verbose: boolean) {}

  log(logObj: LogObject, ctx: { options: ConsolaOptions }) {
    // level 0 (error/fatal) and level 1 (warn) -> always stderr
    // level >= 2 -> only if verbose
    if (logObj.level < 2 || this.verbose) {
      // write to process.stderr
    }
  }
}

export const logger = createConsola({
  level: 3, // INFO (consola level 3 = info)
  reporters: [], // configured at init time
});

export function initializeLogger(options: { ... }): void {
  // Configure reporters based on flags
  // ...
}
```

### Pattern 2: Consola Level Mapping

**What:** Map existing project LogLevel enum values to consola's numeric levels.

**Critical detail:** Consola uses a DIFFERENT level numbering than the existing project:

| Concept | Existing (constants.ts) | Consola          |
| ------- | ----------------------- | ---------------- |
| SILENT  | 0                       | -Infinity / -999 |
| ERROR   | 1                       | 0                |
| WARN    | 2                       | 1                |
| INFO    | 3                       | 3                |
| DEBUG   | 4                       | 4                |
| TRACE   | 5                       | 5                |

The existing `LogLevel` enum in `constants.ts` uses: SILENT=0, ERROR=1, WARN=2, INFO=3, DEBUG=4, TRACE=5. Consola uses: fatal/error=0, warn=1, log=2, info/success/fail/ready/start/box=3, debug=4, trace=5, silent=-Infinity.

**Recommendation:** Drop the custom `LogLevel` enum. Use consola's built-in level numbers directly. Existing consumers of `LogLevel` (in `constants.ts`, `logger.ts`, `logger.test.ts`, `config.ts`) need updating. The `parseLogLevel()` function should return consola-compatible numbers.

### Pattern 3: Audit Log Envelope (Process Lifecycle)

**What:** Track command metadata across the process lifecycle and write a summary entry on exit.

**When to use:** Every CLI entry point.

```typescript
// Called at CLI startup
function startAuditSession(commandName: string): void {
  auditContext = {
    command: commandName,
    startTime: Date.now(),
    cwd: process.cwd(),
    gitBranch: tryGetCurrentBranch(),
  };

  // Register process exit handler
  process.on('exit', (code) => {
    writeAuditSummary(code);
  });
}

// Written on process exit
function writeAuditSummary(exitCode: number): void {
  const entry = {
    timestamp: new Date().toISOString(),
    command: auditContext.command,
    cwd: auditContext.cwd,
    gitBranch: auditContext.gitBranch,
    exitCode,
    duration: Date.now() - auditContext.startTime,
    // worktreePath, prNumber set during execution
    ...auditContext.extra,
  };
  // Write synchronously (process.exit doesn't wait for async)
  fs.appendFileSync(auditFilePath, formatEntry(entry) + '\n');
}
```

**Critical:** The `process.on('exit')` handler must use synchronous I/O (`fs.appendFileSync`). Node.js does not process async operations after 'exit' fires.

### Pattern 4: Legacy Binary Flag Wiring

**What:** Add `--verbose`, `--quiet`, `--no-color` to the 4 legacy binaries that use hand-rolled `parseArgs()`.

**Approach:** The legacy binaries (`newpr`, `cleanpr`, `lswt`, `wtlink`) each parse args differently:

- `newpr`, `cleanpr`, `lswt` use hand-rolled `parseArgs()` in `src/lib/{tool}/args.ts`
- `wtlink` uses yargs

For the hand-rolled parsers, add three new cases to the switch statement. For `wtlink`, add yargs options. Since `wt.ts` already has `--verbose`, `--quiet`, `--debug`, `--log-file` as global options but spawns child processes, the `wt` subcommand wrappers (`src/cli/wt/new.ts`, etc.) must forward these flags to the child process via `runSubcommand()`.

**Key insight:** `wt new` calls `runSubcommand('newpr', args)` which spawns a child process. The `wt` binary's logger initialization does NOT propagate to child processes. Each legacy binary must initialize its own logger. However, `env` is inherited via `process.env`, so `GWT_LOG_LEVEL` and `NO_COLOR` env vars propagate automatically. CLI flags like `--verbose` must be explicitly forwarded by the `wt` subcommand wrappers.

### Pattern 5: --no-color Wiring

**What:** Make `colors.ts` respect `--no-color` flag dynamically (not just at import time).

**Current problem:** `colors.ts` evaluates `shouldUseColors()` once at import time: `const useColors = shouldUseColors();`. This means a `--no-color` flag parsed AFTER import has no effect.

**Solution:** Change `colors.ts` to use a mutable flag that can be set during initialization:

```typescript
let colorEnabled = shouldUseColors(); // default from env

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

function colorize(text: string, code: string): string {
  if (!colorEnabled) return text;
  return `${code}${text}${codes.reset}`;
}
```

Call `setColorEnabled(false)` during CLI initialization when `--no-color` is detected.

**Consola color handling:** Consola's `formatOptions.colors` controls colors in its reporters. Set `formatOptions: { colors: false }` when `--no-color` or `NO_COLOR` is set. The `colors.ts` module is separate from consola and used for direct `console.log()` output in the CLI layer -- both must be disabled.

### Anti-Patterns to Avoid

- **Don't import consola's default instance directly:** Always use `createConsola()` so we control the configuration. Importing `import { consola } from 'consola'` gives a global instance we can't fully configure.
- **Don't write audit log asynchronously in process.on('exit'):** Node.js doesn't process async callbacks after 'exit'. Use `fs.appendFileSync()`.
- **Don't remove the `logger` export name:** Keep `export const logger = ...` to minimize import churn across 7+ consumers.
- **Don't initialize logger at module import time:** The logger must be initialized after CLI flags are parsed. Use a lazy/deferred initialization pattern or an explicit `initializeLogger()` call.
- **Don't use `consola.wrapConsole()` or `consola.wrapStd()`:** The existing code uses `console.log()` extensively for user-facing output in CLI files. Wrapping console would route all user output through consola's reporters, which is NOT desired in Phase 1 (UI output changes are Phase 2).

## Don't Hand-Roll

| Problem                       | Don't Build                                                | Use Instead                                                         | Why                                                                                                |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Logger framework              | Custom Logger class with formatters, levels, child loggers | consola                                                             | User decision; consola handles CI detection, TypeScript types, ESM, reporter system                |
| Log file rotation             | Nothing beyond simple size-check-on-startup                | existing pattern from logger.ts (adapted)                           | Size-based rotation is ~20 lines; a library like rotating-file-stream is overkill                  |
| XDG data directory resolution | New complex path logic                                     | Add `getGlobalDataDir()` to constants.ts following existing pattern | Project already has `getGlobalConfigDir()` and `getGlobalLogDir()` with XDG/Windows/macOS handling |

**Key insight:** The audit log location decision uses `~/.local/share` (XDG_DATA_HOME), which differs from the existing `getGlobalLogDir()` that uses `~/.local/state` (XDG_STATE_HOME). A new `getGlobalDataDir()` function is needed in constants.ts.

## Common Pitfalls

### Pitfall 1: Consola Level Mismatch

**What goes wrong:** Using existing `LogLevel` enum values (where INFO=3, ERROR=1) as consola levels (where info=3 but error=0) causes wrong filtering.
**Why it happens:** The numeric values happen to align for some levels (INFO=3, DEBUG=4, TRACE=5) but not others (ERROR: existing=1, consola=0; WARN: existing=2, consola=1).
**How to avoid:** Drop the custom `LogLevel` enum entirely. Use consola's level constants or create a clean mapping. Verify with tests that `logger.level = 0` suppresses everything except fatal/error.
**Warning signs:** Tests pass but `--quiet` shows warnings, or errors are suppressed when they shouldn't be.

### Pitfall 2: Synchronous Exit Handler for Audit Log

**What goes wrong:** Audit log summary (exit code, duration) not written because async I/O in `process.on('exit')` doesn't complete.
**Why it happens:** Node.js event loop stops after 'exit' fires. `writeStream.write()` and `await` don't work.
**How to avoid:** Use `fs.appendFileSync()` in the exit handler. For the streaming audit log entries during execution, use the async write stream -- only the final summary needs sync.
**Warning signs:** Audit log missing the exit code entry, or final entry is truncated.

### Pitfall 3: colors.ts Static Initialization

**What goes wrong:** `--no-color` flag has no effect because `colors.ts` evaluates color support once at module import time.
**Why it happens:** Module-level `const useColors = shouldUseColors()` runs before CLI arg parsing.
**How to avoid:** Make color state mutable. Export a `setColorEnabled()` function called during CLI initialization.
**Warning signs:** `--no-color` flag is parsed but colored output still appears.

### Pitfall 4: Child Process Logger State

**What goes wrong:** `wt new --verbose` spawns `newpr` child process that doesn't have verbose mode.
**Why it happens:** `runSubcommand()` in `src/cli/wt/run-command.ts` uses `spawnSync` with `stdio: 'inherit'` and `env: process.env`. CLI flags are forwarded as args by the wt/\* wrapper, but only if explicitly listed.
**How to avoid:** Ensure each `wt` subcommand wrapper (`src/cli/wt/new.ts`, `clean.ts`, `list.ts`, `link.ts`) forwards `--verbose`, `--quiet`, and `--no-color` to the child process args. Also: the `wt` binary itself can set `GWT_LOG_LEVEL` in `process.env` before spawning, which the child will inherit.
**Warning signs:** `wt new --verbose "test"` produces no debug output but `newpr --verbose "test"` does.

### Pitfall 5: DEBUG=newpr Deprecation Warning Loop

**What goes wrong:** Deprecation warning prints on every debug log call instead of once.
**Why it happens:** Checking for `DEBUG=newpr` inside the logger's log method rather than during initialization.
**How to avoid:** Check `process.env.DEBUG` once during `initializeLogger()`, print the warning then, set level to DEBUG, and never check again.
**Warning signs:** Console flooded with deprecation messages when DEBUG=newpr is active.

### Pitfall 6: Audit Log File Permissions on Shared Systems

**What goes wrong:** Audit log directory creation fails or has wrong permissions.
**Why it happens:** `~/.local/share` may not exist on some systems; `fs.mkdirSync` with `{ recursive: true }` needed.
**How to avoid:** Always use `fs.mkdirSync(dir, { recursive: true })` before opening the audit log. Wrap in try/catch -- if audit logging fails, warn once to stderr and continue (don't crash the tool).
**Warning signs:** First-time users on fresh systems get ENOENT errors.

### Pitfall 7: Consola Reporter Not Receiving All Log Types

**What goes wrong:** Custom audit reporter doesn't receive `warn` or `error` calls.
**Why it happens:** Consola level filtering happens BEFORE reporter dispatch. If consola's level is set to 3 (info), it won't dispatch level 0 (error) or level 1 (warn) to reporters -- wait, actually consola dispatches all messages with level <= the configured level. Error (0) and Warn (1) are LOWER than Info (3), so they ARE dispatched. This is the opposite of the existing logger where higher numbers mean higher verbosity.
**How to avoid:** Understand consola's level semantics: level N means "show messages at level N and below." Level 3 (info) includes error(0), warn(1), log(2), info(3). Level 4 (debug) adds debug. Level 5 (trace) adds trace.
**Warning signs:** Audit log missing error/warn entries.

## Code Examples

### Creating the Consola Instance

```typescript
// Source: https://github.com/unjs/consola README + types.ts
import { createConsola, type ConsolaReporter, type LogObject } from 'consola';

const logger = createConsola({
  level: 3, // INFO: shows fatal, error, warn, log, info
  reporters: [
    // reporters configured at init time
  ],
  formatOptions: {
    date: true,
    colors: true,
  },
});

// Change level at runtime
logger.level = 4; // DEBUG

// Tagged child logger
const childLogger = logger.withTag('newpr');
childLogger.debug('State analysis complete');
```

### Custom File Reporter

```typescript
// Source: consola custom reporter pattern from README
import fs from 'fs';
import type { ConsolaReporter, LogObject, ConsolaOptions } from 'consola';

class FileReporter implements ConsolaReporter {
  private stream: fs.WriteStream;

  constructor(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.stream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  log(logObj: LogObject, ctx: { options: ConsolaOptions }): void {
    const entry = {
      timestamp: logObj.date.toISOString(),
      level: logObj.type, // 'info', 'debug', 'warn', 'error', etc.
      tag: logObj.tag, // command name if set via withTag
      message: logObj.args.map(String).join(' '),
    };
    this.stream.write(JSON.stringify(entry) + '\n');
  }

  close(): void {
    this.stream.end();
  }
}
```

### Stderr Reporter with Conditional Output

```typescript
// Custom reporter implementing the user's output rules:
// - WARN/ERROR always to stderr
// - DEBUG/INFO only to stderr when --verbose
class ConditionalStderrReporter implements ConsolaReporter {
  constructor(private verbose: boolean) {}

  log(logObj: LogObject, ctx: { options: ConsolaOptions }): void {
    // consola levels: error=0, warn=1, log=2, info=3, debug=4, trace=5
    const isWarnOrError = logObj.level < 2;

    if (isWarnOrError || this.verbose) {
      const prefix = `[${logObj.type.toUpperCase()}]`;
      const message = logObj.args.map(String).join(' ');
      const tag = logObj.tag ? `[${logObj.tag}]` : '';
      process.stderr.write(`${prefix}${tag} ${message}\n`);
    }
  }
}
```

### Size-Based Log Rotation

```typescript
// Adapted from existing logger.ts rotation logic
const MAX_AUDIT_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIT_LOG_FILES = 3;

function rotateIfNeeded(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size <= MAX_AUDIT_LOG_SIZE) return;

    // Shift existing rotated files
    for (let i = MAX_AUDIT_LOG_FILES - 1; i >= 1; i--) {
      const older = `${filePath}.${i}`;
      const newer = i === 1 ? filePath : `${filePath}.${i - 1}`;
      if (fs.existsSync(newer)) {
        if (i === MAX_AUDIT_LOG_FILES - 1 && fs.existsSync(older)) {
          fs.unlinkSync(older);
        }
        fs.renameSync(newer, older);
      }
    }
  } catch {
    // Rotation failure is non-fatal
  }
}
```

### DEBUG=newpr Deprecation Mapping

```typescript
// During logger initialization
let deprecationWarned = false;

function checkDebugEnvCompat(): number | undefined {
  const debugEnv = process.env.DEBUG;
  if (debugEnv === 'newpr' || debugEnv === '*' || debugEnv === '1') {
    if (!deprecationWarned) {
      deprecationWarned = true;
      process.stderr.write('WARNING: DEBUG=newpr is deprecated, use GWT_LOG_LEVEL=debug\n');
    }
    return 4; // consola DEBUG level
  }
  return undefined;
}
```

### Adding getGlobalDataDir to constants.ts

```typescript
/**
 * Get the global data directory path (for audit logs)
 * - Linux: $XDG_DATA_HOME/git-worktree-tools or ~/.local/share/git-worktree-tools
 * - macOS: ~/Library/Application Support/git-worktree-tools
 * - Windows: %APPDATA%/git-worktree-tools
 */
export function getGlobalDataDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, PACKAGE_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', PACKAGE_NAME);
  }
  // Linux and others: XDG_DATA_HOME
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, PACKAGE_NAME);
}
```

## Codebase Inventory: Files That Need Changes

### Files to REPLACE

| File                     | Lines | Reason                                    |
| ------------------------ | ----- | ----------------------------------------- |
| `src/lib/logger.ts`      | ~572  | Complete replacement with consola wrapper |
| `src/lib/logger.test.ts` | ~350  | Tests must be rewritten for new API       |

### Files to UPDATE (logger consumers)

| File                                   | Import                                          | Calls Used                         |
| -------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| `src/lib/config.ts`                    | `{ logger }`                                    | `.warn()`, `.debug()`              |
| `src/lib/global-config.ts`             | `{ logger }`                                    | `.warn()`, `.debug()`, `.info()`   |
| `src/lib/global-check.ts`              | `{ logger }`                                    | `.debug()`                         |
| `src/lib/wtlink/config-manifest.ts`    | `{ logger }`                                    | `.debug()`, `.warn()`              |
| `src/lib/config-migration/runner.ts`   | `{ logger }`                                    | `.debug()`, `.info()`, `.warn()`   |
| `src/lib/config-migration/detector.ts` | `{ logger }`                                    | `.debug()`                         |
| `src/cli/wt.ts`                        | `{ initializeLogger, parseLogLevel, LogLevel }` | `initializeLogger()`, logger setup |

### Files to UPDATE (CLI flag wiring)

| File                      | Change Needed                                                  |
| ------------------------- | -------------------------------------------------------------- |
| `src/lib/newpr/args.ts`   | Add `--verbose`, `--quiet`, `--no-color` parsing               |
| `src/lib/cleanpr/args.ts` | Add `--verbose`, `--quiet`, `--no-color` parsing               |
| `src/lib/lswt/args.ts`    | Add `--verbose`, `--quiet`, `--no-color` parsing               |
| `src/cli/wtlink.ts`       | Add `--verbose`, `--quiet`, `--no-color` yargs options         |
| `src/cli/newpr.ts`        | Remove `debug()`, `DEBUG_ENABLED`; add logger init; wire flags |
| `src/cli/cleanpr.ts`      | Add logger init; wire flags                                    |
| `src/cli/lswt.ts`         | Add logger init; wire flags                                    |

### Files to UPDATE (wt subcommand flag forwarding)

| File                  | Change Needed                                       |
| --------------------- | --------------------------------------------------- |
| `src/cli/wt/new.ts`   | Forward `--verbose`/`--quiet`/`--no-color` to child |
| `src/cli/wt/clean.ts` | Forward `--verbose`/`--quiet`/`--no-color` to child |
| `src/cli/wt/list.ts`  | Forward `--verbose`/`--quiet`/`--no-color` to child |
| `src/cli/wt/link.ts`  | Forward `--verbose`/`--quiet`/`--no-color` to child |

### Files to UPDATE (colors/constants)

| File                   | Change Needed                                                |
| ---------------------- | ------------------------------------------------------------ |
| `src/lib/colors.ts`    | Make color state mutable via `setColorEnabled()`             |
| `src/lib/constants.ts` | Add `getGlobalDataDir()`, update `MAX_LOG_FILE_SIZE` to 10MB |

### Files NOT to change

- `src/index.ts` -- does not export logger (currently exports `constants` which has `LogLevel`)
- All `src/lib/*.test.ts` other than `logger.test.ts` -- existing tests should continue to pass once logger API is compatible
- `src/e2e/`, `src/integration/` -- may need minor updates if they reference debug flags

## State of the Art

| Old Approach                             | Current Approach                          | When Changed  | Impact                                                   |
| ---------------------------------------- | ----------------------------------------- | ------------- | -------------------------------------------------------- |
| Custom Logger singleton with WriteStream | consola with pluggable reporters          | Phase 1 (now) | Eliminates ~520 lines of custom code, gains CI detection |
| `DEBUG=newpr` env var pattern            | `GWT_LOG_LEVEL=debug` env var             | Phase 1 (now) | Consistent debug control across all commands             |
| No audit trail                           | Persistent audit.log with rotation        | Phase 1 (now) | Full command history for debugging                       |
| Color hard-coded at import time          | Dynamic `--no-color` / `NO_COLOR` support | Phase 1 (now) | Proper accessibility support                             |

**Deprecated/outdated:**

- `DEBUG=newpr` env var: auto-mapped with deprecation warning, to be removed in future major version
- Custom `LogLevel` enum in constants.ts: replaced by consola's built-in levels
- `initializeLogger()` signature from old logger.ts: replaced with new signature

## Open Questions

1. **LogLevel enum backward compatibility**
   - What we know: `LogLevel` is exported from `constants.ts` and re-exported from `logger.ts`. It's used in `config.ts` for type annotations.
   - What's unclear: Whether any external consumers (package importers via `src/index.ts`) depend on the `LogLevel` enum values.
   - Recommendation: Keep a `LogLevel`-compatible export that maps to consola levels, or re-export from consola. Since `src/index.ts` exports `* as constants`, the enum is public API. Consider keeping a compatibility mapping or documenting the breaking change.

2. **Audit log XDG_DATA_HOME vs XDG_STATE_HOME**
   - What we know: The user specified `~/.local/share/git-worktree-tools/audit.log` (XDG_DATA_HOME). The existing `getGlobalLogDir()` uses XDG_STATE_HOME (`~/.local/state`). XDG spec says STATE_HOME is for "state data that should persist between restarts" including "actions history (logs)."
   - What's unclear: Whether the user intentionally chose DATA_HOME over STATE_HOME, or if it was a natural assumption.
   - Recommendation: Implement as specified (XDG_DATA_HOME / `~/.local/share`). The user's decision is locked. Note: XDG_STATE_HOME would technically be more correct per the XDG spec for logs, but the user decision takes precedence.

3. **consola's `log` type (level 2) vs project's concept of INFO**
   - What we know: Consola has both `log` (level 2) and `info` (level 3). The project currently has a single INFO level.
   - What's unclear: Whether to use `logger.log()` or `logger.info()` for progress messages.
   - Recommendation: Use `logger.info()` (level 3) for all progress messages, matching consola's default level. `logger.log()` (level 2) is an intermediate level that exists in consola but isn't needed for this project's semantics.

## Sources

### Primary (HIGH confidence)

- [unjs/consola GitHub](https://github.com/unjs/consola) -- README, types.ts, constants.ts, reporters/basic.ts source code
- [consola npm](https://www.npmjs.com/package/consola) -- v3.4.2, 24M+ weekly downloads
- Codebase analysis -- `src/lib/logger.ts`, `src/cli/wt.ts`, `src/cli/newpr.ts`, `src/lib/constants.ts`, `src/lib/colors.ts`, all CLI entry points, all wt/\* subcommand wrappers

### Secondary (MEDIUM confidence)

- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) -- Official Freedesktop spec
- [env-paths npm](https://www.npmjs.com/package/env-paths) -- Cross-platform path conventions
- [NO_COLOR standard](https://no-color.org/) -- Convention for disabling color output

### Tertiary (LOW confidence)

- (None -- all findings verified against source code or official documentation)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- consola is a locked user decision; version verified on npm
- Architecture: HIGH -- based on direct codebase analysis and consola source code review
- Pitfalls: HIGH -- derived from actual code patterns found in the codebase
- Code examples: MEDIUM -- consola API verified against source, but exact integration patterns are novel

**Research date:** 2026-02-18
**Valid until:** 2026-04-18 (consola v3 is stable; project architecture won't change)
