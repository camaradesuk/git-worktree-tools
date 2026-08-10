# Phase 5: In-Process Delegation - Research

**Researched:** 2026-02-18
**Domain:** CLI architecture refactoring (child-process delegation to in-process library calls)
**Confidence:** HIGH

## Summary

Phase 5 replaces the `runSubcommand()` child-process spawning pattern with direct library function calls inside the `wt` subcommand handlers. Currently, every `wt` subcommand (list, clean, new, link, state) and the interactive menu's flow handlers spawn a separate Node.js process via `spawnSync` to execute the legacy CLI entry points (lswt, cleanpr, newpr, wtlink, wtstate). This causes three problems: (1) global flags like `--verbose` must be re-serialized as string args and env vars, losing type safety; (2) the audit log sees two separate sessions instead of one; (3) the spawned process re-initializes the logger, config, and git detection redundantly.

The codebase already has the library-level functions needed. The `src/lib/lswt/`, `src/lib/cleanpr/`, `src/lib/newpr/`, `src/lib/wtstate/`, and `src/lib/wtlink/` modules export all the core logic. The CLI entry points (`src/cli/lswt.ts`, `src/cli/cleanpr.ts`, etc.) are thin orchestration wrappers that import from these libraries. The task is to move that same orchestration logic into the `wt` subcommand handlers in `src/cli/wt/*.ts`, eliminating the `runSubcommand()` hop entirely.

**Primary recommendation:** Work from simplest to most complex -- start with `wt list` (well-factored library, clear printTable function), then `wt clean` and `wt state` (moderate complexity), then `wt new` and `wt link` (highest complexity, most flags). Simultaneously add deprecation notices to legacy bin entry points and update README/help text.

## Standard Stack

### Core

No new dependencies are required. This phase is purely a refactoring of call patterns using existing libraries.

| Library | Version  | Purpose                       | Why Standard             |
| ------- | -------- | ----------------------------- | ------------------------ |
| yargs   | existing | CLI argument parsing for `wt` | Already used in wt.ts    |
| consola | existing | Logger singleton              | Already wired in Phase 1 |
| vitest  | existing | Test framework                | Already used throughout  |

### Supporting

| Library                    | Version | Purpose                | When to Use                          |
| -------------------------- | ------- | ---------------------- | ------------------------------------ |
| `src/lib/lswt/index.ts`    | N/A     | Worktree listing logic | Direct import in wt/list.ts handler  |
| `src/lib/cleanpr/index.ts` | N/A     | Cleanup logic          | Direct import in wt/clean.ts handler |
| `src/lib/newpr/index.ts`   | N/A     | PR creation logic      | Direct import in wt/new.ts handler   |
| `src/lib/wtstate/index.ts` | N/A     | State analysis         | Direct import in wt/state.ts handler |
| `src/lib/wtlink/`          | N/A     | Link management        | Direct import in wt/link.ts handler  |
| `src/lib/ui/index.ts`      | N/A     | Shared UI output       | printTable, printError, printStatus  |

### Alternatives Considered

| Instead of                           | Could Use                           | Tradeoff                                                                                                                                                            |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moving full CLI orchestration inline | Extracting shared handler functions | Could extract `runList(options)` functions from CLI entry points to share between standalone and wt, but the CLIs are already thin wrappers; duplication is minimal |
| Deprecation warnings via stderr      | Deprecation via stdout banner       | stderr is correct for deprecation notices per Unix convention                                                                                                       |

## Architecture Patterns

### Current Architecture (subprocess delegation)

```
User runs:  wt --verbose list --json
                    |
                    v
           wt.ts (yargs parsing)
                    |
                    v
           wt/list.ts handler
                    |
                    v
           runSubcommand('lswt', ['--verbose', '--json'])
                    |
                    v
           spawnSync(node, ['lswt.js', '--verbose', '--json'])
                    |
                    v
           NEW PROCESS: lswt.ts
             - re-parses args
             - re-initializes logger
             - re-loads config
             - calls gatherWorktreeInfo()
             - calls printTable() / formatJsonOutput()
             - process.exit()
```

### Target Architecture (in-process delegation)

```
User runs:  wt --verbose list --json
                    |
                    v
           wt.ts (yargs parsing + logger init + config load)
                    |
                    v
           wt/list.ts handler
                    |
                    v
           DIRECT CALLS (same process):
             - gatherWorktreeInfo()    <- from src/lib/lswt/
             - printTable() / formatJsonOutput()  <- from src/lib/lswt/ and src/lib/ui/
             - runInteractiveMode()    <- from src/lib/lswt/interactive.ts
```

### Pattern 1: Direct Library Import in Handler

**What:** Replace `runSubcommand(name, args)` with direct imports from `src/lib/{name}/index.ts` and inline orchestration.
**When to use:** For all wt subcommand handlers.
**Example (wt/list.ts):**

```typescript
// BEFORE
import { runSubcommand } from './run-command.js';

handler: (argv) => {
  const args: string[] = [];
  if (argv.verbose) args.push('--verbose');
  if (argv.json) args.push('--json');
  // ... many more flag reconstructions
  runSubcommand('lswt', args, envOverrides);
}

// AFTER
import { gatherWorktreeInfo, createDefaultDeps, formatJsonOutput, runInteractiveMode } from '../../lib/lswt/index.js';
import * as git from '../../lib/git.js';

handler: async (argv) => {
  const repoRoot = git.getRepoRoot();
  const options = { verbose: argv.verbose, json: argv.json, ... };
  const deps = createDefaultDeps();
  const worktrees = await gatherWorktreeInfo(repoRoot, options, deps);

  if (options.json) {
    console.log(formatJsonOutput(worktrees));
  } else if (shouldUseInteractive(options)) {
    await runInteractiveMode(worktrees, options);
  } else {
    printTable(worktrees, options, process.cwd());
  }
}
```

### Pattern 2: Deprecation Notice in Legacy Entry Points

**What:** Add a stderr deprecation warning at the top of each legacy CLI's `main()` function, then proceed normally.
**When to use:** For `newpr.ts`, `cleanpr.ts`, `lswt.ts`, `wtlink.ts` standalone entry points.
**Example:**

```typescript
// At top of main() in lswt.ts
function printDeprecationNotice(): void {
  if (process.env.GWT_NO_DEPRECATION_WARNINGS !== '1') {
    process.stderr.write(
      '\x1b[33m[DEPRECATED]\x1b[0m "lswt" is deprecated. Use "wt list" instead.\n' +
        'Set GWT_NO_DEPRECATION_WARNINGS=1 to suppress this notice.\n\n'
    );
  }
}
```

### Pattern 3: Logger Reuse (No Re-initialization)

**What:** When calling library functions directly, the logger singleton initialized by `wt.ts` is already configured. No need to call `initializeLogger()` again.
**When to use:** In all wt subcommand handlers after migration.
**Key insight:** The `wt.ts` entry point already calls `initializeLoggerFromCliFlags()` and sets up the middleware. The library functions use the `logger` singleton. This "just works" when calling in-process.

### Pattern 4: Shared Error Handling

**What:** Error handling that was duplicated in each legacy CLI's `main().catch()` can be consolidated in the `wt.ts` `.fail()` and `.parseAsync().catch()` handlers.
**When to use:** After migration, the wt subcommand handlers throw errors that bubble up to wt.ts error handling.

### Anti-Patterns to Avoid

- **Re-parsing args inside the handler:** The wt/list.ts handler already has parsed `argv` from yargs. Do NOT parse `process.argv` again or construct arg strings.
- **Calling `process.exit()` in handlers:** Let errors propagate to wt.ts's `.fail()` handler. Only use `process.exit()` for clean exits (e.g., after printing help).
- **Re-initializing the logger in handlers:** The logger singleton is already configured by wt.ts middleware. Calling `initializeLogger()` again would replace reporters.
- **Importing the full CLI entry point:** Do NOT `import '../lswt.js'`. Import from the library modules (`../lib/lswt/index.js`).

## Don't Hand-Roll

| Problem                            | Don't Build                        | Use Instead                                                                         | Why                                         |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------ |
| TTY detection for interactive mode | Custom TTY check                   | Existing pattern from `lswt.ts` lines 168-170                                       | The `options.interactive === true           |     | (options.interactive === undefined && process.stdout.isTTY && !options.json)` logic is already correct |
| Deprecation notice formatting      | Custom formatting                  | Consistent pattern with ANSI yellow `[DEPRECATED]` prefix + env var suppression     | Other tools use this convention             |
| Flag propagation                   | Manual env var + args construction | Direct typed argv object                                                            | This is the entire point of the refactoring |
| JSON error output                  | New error handler                  | Existing `createErrorResult()` + `formatJsonResult()` from `src/lib/json-output.ts` | Already standardized in Phase 4             |

**Key insight:** The library functions already exist and are well-tested. The refactoring is about removing the indirection layer (`runSubcommand`), not creating new abstractions.

## Common Pitfalls

### Pitfall 1: lswt Interactive Mode TTY Behavior

**What goes wrong:** The lswt interactive mode uses raw stdin keypress handling (`process.stdin.setRawMode(true)`) and `console.clear()`. When called in-process from `wt`, the terminal state must be properly managed since `wt.ts` already has a global `process.on('exit')` safety net for cursor/raw mode.
**Why it happens:** The interactive mode was designed assuming it owns the process. In-process, it shares the process with `wt`.
**How to avoid:** The existing `runInteractiveMode()` function already handles cleanup via its `cleanup()` function. The `wt.ts` exit handler is a belt-and-suspenders safety net that will also help. Test that: (1) running `wt list` enters interactive mode correctly, (2) Ctrl+C exits cleanly, (3) the cursor is visible after exit.
**Warning signs:** Corrupted terminal state after exiting `wt list`, raw mode not disabled.

### Pitfall 2: process.exit() in Library Code

**What goes wrong:** Some legacy CLI code calls `process.exit(1)` directly. When moved in-process, this kills the entire `wt` process without proper cleanup.
**Why it happens:** The legacy CLIs treated `process.exit()` as the error-exit mechanism. In the `wt` wrapper, errors should propagate as exceptions.
**How to avoid:** Audit all code paths that call `process.exit()`. In the library functions themselves, they should throw errors. The `process.exit()` calls live in the CLI orchestration layer (the `main()` functions), which is what we're replacing.
**Warning signs:** Tests that mock `process.exit` failing after migration.

### Pitfall 3: Double Logger Initialization

**What goes wrong:** If the handler calls `initializeLogger()` (copied from the legacy CLI code), the reporters get replaced, losing the audit file reporter set up by `wt.ts`.
**Why it happens:** Copy-pasting orchestration code from the legacy CLI entry points without understanding that logger init is already done.
**How to avoid:** The library functions (e.g., `gatherWorktreeInfo`, `cleanWorktree`) do NOT call `initializeLogger()`. Only the CLI entry points do. When migrating, skip the logger initialization that exists in the legacy CLI's `main()` function.
**Warning signs:** Missing audit log entries when using `wt` subcommands.

### Pitfall 4: Config Loading Redundancy

**What goes wrong:** Each legacy CLI loads its own config. When `wt.ts` middleware already loads config for the global install check, loading it again is redundant but harmless. The real issue is that some CLIs (like `cleanpr`) pass `loadConfig()` results to their library functions.
**Why it happens:** The legacy CLIs are self-contained units.
**How to avoid:** Load config once in the handler and pass it to library functions. This is fine since `loadConfig()` is synchronous and fast (reads a JSON file).
**Warning signs:** None significant -- this is about cleanliness, not bugs.

### Pitfall 5: Interactive Menu's runSubcommandForResult Usage

**What goes wrong:** The interactive menu (`interactive-menu.ts`) also uses `runSubcommandForResult` for many operations. Phase 3 already fixed some of these (wtlink view/add/remove now use direct library calls). But `handleListWorktrees`, `handleBrowsePRs`, `handleNewPR*`, `handleCleanPRs`, `handleShowState`, and some `handleConfigure` paths still use `runSubcommandForResult`.
**Why it happens:** The interactive menu was built on the subprocess model.
**How to avoid:** Plan 05-01, 05-02, and 05-03 address the wt subcommand handlers. The interactive menu's `runSubcommandForResult` calls should also be migrated, but this is a separate (larger) concern. Consider whether to include this in Phase 5 scope or defer it.
**Warning signs:** After migrating wt subcommand handlers, the interactive menu still spawns subprocesses.

### Pitfall 6: newpr Complexity

**What goes wrong:** `newpr.ts` is the most complex CLI (1305 lines) with three modes (new feature, existing PR, existing branch), lifecycle hooks, AI plan generation, and complex error recovery with stash operations. Moving all of this inline into `wt/new.ts` would create a massive file.
**Why it happens:** newpr is inherently complex.
**How to avoid:** Rather than moving the entire `main()` function inline, extract a single `runNewpr(options: Options)` handler function from `newpr.ts` that can be called directly. The function takes already-parsed options (no re-parsing needed) and returns a result. This keeps `wt/new.ts` thin.
**Warning signs:** `wt/new.ts` growing past 100 lines of orchestration logic.

## Code Examples

### Example 1: Migrating wt/list.ts (simplest case)

The current `wt/list.ts` handler reconstructs CLI args and calls `runSubcommand('lswt', args)`. The target replaces this with direct library calls.

**Key library functions from `src/lib/lswt/index.ts`:**

- `gatherWorktreeInfo(repoRoot, options, deps)` -- gathers all worktree data
- `formatJsonOutput(worktrees)` -- formats as JSON string
- `runInteractiveMode(worktrees, options)` -- runs the interactive TUI
- `createDefaultDeps()` -- creates dependency injection object

**Key UI functions from `src/cli/lswt.ts`:**

- `printTable(worktrees, options, cwd)` -- the non-interactive table output
- This function is currently defined locally in `lswt.ts` and would need to be either extracted to a shared location or duplicated.

**Approach:** Extract `printTable` from `lswt.ts` into `src/lib/lswt/formatters.ts` (or a new file), then import it in both `lswt.ts` and `wt/list.ts`.

### Example 2: Deprecation Notice Pattern

```typescript
// src/lib/deprecation.ts (shared utility)
export function printDeprecationNotice(oldCommand: string, newCommand: string): void {
  // Skip in JSON mode (avoid corrupting structured output)
  if (process.argv.includes('--json')) return;
  // Allow suppression via env var
  if (process.env.GWT_NO_DEPRECATION_WARNINGS === '1') return;

  process.stderr.write(
    `\x1b[33m[DEPRECATED]\x1b[0m "${oldCommand}" is deprecated. Use "${newCommand}" instead.\n` +
      `This command will be removed in a future version.\n` +
      `Set GWT_NO_DEPRECATION_WARNINGS=1 to suppress this notice.\n\n`
  );
}
```

### Example 3: Extracting runNewpr Handler Function

```typescript
// In src/cli/newpr.ts, extract the core logic:
export async function runNewprHandler(options: Options): Promise<void> {
  // All the logic currently in main() after parseArgs()
  // But receiving already-parsed options instead of raw args
  switch (options.mode) {
    case 'pr':
      await modeExistingPr(options.prNumber!, options);
      break;
    case 'branch':
      await modeExistingBranch(options.branchName!, options);
      break;
    case 'new':
      await modeNewFeature(options.description!, options);
      break;
  }
}

// In wt/new.ts handler:
handler: async (argv) => {
  const options: Options = {
    mode: argv.pr ? 'pr' : argv.branch ? 'branch' : 'new',
    description: argv.description,
    prNumber: argv.pr,
    branchName: argv.branch,
    baseBranch: argv.base || 'main',
    // ... map yargs argv to Options type
  };
  await runNewprHandler(options);
};
```

## State of the Art

| Old Approach                          | Current Approach                                | When Changed         | Impact                                                       |
| ------------------------------------- | ----------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| Subprocess delegation via `spawnSync` | Direct library function calls                   | Phase 5 (this phase) | Eliminates flag serialization, double init, split audit logs |
| `DEBUG=newpr` for debug output        | `--verbose` flag / `GWT_LOG_LEVEL` env var      | Phase 1              | Already done                                                 |
| Inline `console.log` formatting       | Shared `src/lib/ui/` primitives                 | Phase 2              | Already done                                                 |
| Broken interactive menu flows         | `runSubcommandForResult` + direct library calls | Phase 3              | Interactive menu partially migrated                          |
| Missing JSON output coverage          | Full `--json` coverage                          | Phase 4              | Already done                                                 |

**Deprecated/outdated:**

- `runSubcommand()` and `runSubcommandForResult()` in `src/cli/wt/run-command.ts` will be deprecated by this phase. After migration, these functions should still exist (for backward compatibility in case anything references them) but should have no callers in the main codebase.

## Specific Migration Analysis

### Subcommand-by-Subcommand Complexity Assessment

| Subcommand  | Legacy CLI  | Orchestration Lines         | Library API Surface                                                                                                                | Migration Difficulty                                          |
| ----------- | ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `wt list`   | lswt.ts     | ~75 lines (main function)   | `gatherWorktreeInfo`, `formatJsonOutput`, `runInteractiveMode`, `printTable` (local)                                               | LOW - clean library separation                                |
| `wt state`  | wtstate.ts  | ~50 lines (main function)   | `analyzeState`, `formatText`, `createSuccessResult`                                                                                | LOW - simplest CLI                                            |
| `wt clean`  | cleanpr.ts  | ~250 lines (main + helpers) | `parseArgs` (options only), `gatherPrWorktreeInfo`, `cleanWorktree`, `getCleanableWorktrees`, etc.                                 | MEDIUM - interactive mode + JSON output logic                 |
| `wt link`   | wtlink.ts   | ~275 lines (yargs setup)    | Uses yargs internally for subcommands; library functions are per-subcommand                                                        | MEDIUM-HIGH - wtlink has its own yargs subcommand structure   |
| `wt new`    | newpr.ts    | ~1300 lines                 | Three modes, hooks, AI, stash management                                                                                           | HIGH - complex but could extract `runNewprHandler`            |
| `wt config` | wtconfig.ts | ~500 lines                  | Already partially direct (interactive, validate, schema); `runSubcommand` only for `show`, `get`, `set`, `edit`, `init`, `migrate` | MEDIUM - config.ts already has direct handlers for some paths |

### Interactive Menu Migration Scope

The interactive menu (`interactive-menu.ts`) has 20 calls to `runSubcommandForResult`. Phase 3 already converted some wtlink operations to direct library calls. The remaining calls are:

- `handleListWorktrees` -- calls `runSubcommandForResult('lswt', [])`
- `handleBrowsePRs` -- calls `runSubcommandForResult('prs', [])`
- `handleNewPR*` (3 flows) -- calls `runSubcommandForResult('newpr', args)`
- `handleCleanPRs` (3 flows) -- calls `runSubcommandForResult('cleanpr', args)`
- `handleShowState` -- calls `runSubcommandForResult('wtstate', [])`
- `handleConfigure` (3 flows) -- calls `runSubcommandForResult('wtconfig', args)`
- `handleLinkConfig` sync -- calls `runSubcommandForResult('wtlink', ['link'])`
- `handleLinkConfig` validate -- calls `runSubcommandForResult('wtlink', ['validate'])`

**Recommendation:** The interactive menu migration should be included in Phase 5 scope since it shares the same pattern. However, it should be the last step after the wt subcommand handlers are migrated, since the menu can benefit from the same extracted handler functions.

### Existing Direct-Call Subcommands (Reference Patterns)

Three wt subcommands already call library functions directly (not via subprocess):

1. **`wt prs`** (`src/cli/wt/prs.ts`) -- calls `runPrsCommand(options)` from `src/lib/prs/command.ts`
2. **`wt init`** (`src/cli/wt/init.ts`) -- calls library functions directly from `src/lib/global-config.ts`
3. **`wt config`** (`src/cli/wt/config.ts`) -- partially direct (interactive, validate, schema handlers); partially subprocess for show/get/set/edit/init/migrate

These serve as reference patterns for the migration.

### printTable Extraction for lswt

The `printTable` function in `src/cli/lswt.ts` (lines 65-103) is currently local to that file. It uses:

- `formatTypeLabel()` from `src/lib/lswt/formatters.ts`
- `getDisplayPath()` from `src/lib/lswt/formatters.ts`
- `sharedPrintTable()` from `src/lib/ui/index.ts`
- `changeIndicator()` from `src/lib/ui/index.ts`
- Color functions from `src/lib/colors.ts`

This function should be extracted to `src/lib/lswt/formatters.ts` (or a new `src/lib/lswt/table.ts`) so it can be imported by both `lswt.ts` and `wt/list.ts`.

## Open Questions

1. **Should the interactive menu's `runSubcommandForResult` calls be migrated in Phase 5?**
   - What we know: The roadmap's plan sketches (05-01, 05-02, 05-03) focus on wt subcommand handlers and deprecation notices, not the interactive menu
   - What's unclear: Whether the interactive menu migration is in scope
   - Recommendation: Include it since the success criteria says "call library functions directly rather than spawning child processes" which the interactive menu currently violates. However, it could be a 4th plan (05-04) if scope is a concern

2. **Should `wt config`'s remaining subprocess calls be migrated?**
   - What we know: `wt/config.ts` already handles some subcommands directly and delegates others to `wtconfig` via `runSubcommand`
   - What's unclear: Whether to extract handler functions from wtconfig.ts or keep the subprocess delegation for config-related operations
   - Recommendation: Migrate since the config operations are relatively simple and wtconfig.ts has clear function boundaries

3. **What about `wtstate` -- should it get a deprecation notice?**
   - What we know: The roadmap says "newpr, cleanpr, lswt, wtlink" get deprecation notices. `wtstate` and `wtconfig` are not mentioned
   - What's unclear: Whether `wtstate`, `wtconfig`, and `prs` should also get deprecation notices
   - Recommendation: Add deprecation notices to ALL standalone binaries that have `wt` equivalents: `newpr`, `cleanpr`, `lswt`, `wtlink`, `wtstate`, `wtconfig`. The `prs` binary is less clear since it was created specifically as a runSubcommand target -- it could simply be removed from `bin` in `package.json`

4. **Should `run-command.ts` be removed after migration?**
   - What we know: After migration, no production code should call `runSubcommand` or `runSubcommandForResult`
   - What's unclear: Whether to remove the file or keep it for backward compatibility
   - Recommendation: Keep the file but remove all production imports. Add a deprecation comment. Remove in a future major version

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis of `src/cli/wt/*.ts` -- all wt subcommand handlers examined
- Direct codebase analysis of `src/cli/lswt.ts`, `src/cli/cleanpr.ts`, `src/cli/newpr.ts`, `src/cli/wtlink.ts`, `src/cli/wtstate.ts` -- all legacy CLI entry points examined
- Direct codebase analysis of `src/lib/lswt/index.ts`, `src/lib/cleanpr/index.ts`, `src/lib/newpr/index.ts`, `src/lib/wtstate/index.ts` -- all library public API surfaces examined
- Direct codebase analysis of `src/cli/wt/run-command.ts` -- the subprocess delegation mechanism
- Direct codebase analysis of `src/lib/logger.ts` -- singleton logger architecture
- Direct codebase analysis of `src/cli/wt/interactive-menu.ts` -- all runSubcommandForResult usage

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` -- phase descriptions and plan sketches
- Phase 3 summary (03-01) -- prior decisions about interactive menu subprocess replacement
- Phase 4 summaries -- JSON output standardization decisions

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - no new dependencies, pure internal refactoring
- Architecture: HIGH - existing patterns (wt/prs.ts, wt/init.ts) prove the target architecture works
- Pitfalls: HIGH - based on direct codebase analysis, not speculation

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (30 days -- stable internal codebase, no external dependency changes)
