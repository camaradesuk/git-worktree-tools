# Architecture Research

**Domain:** Multi-subcommand Node.js CLI with TUI components
**Researched:** 2026-02-18
**Confidence:** HIGH (based on direct codebase inspection)

---

## Standard Architecture

### System Overview

Current state: two-tier invocation with a spawn bridge.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLI ENTRY POINTS                                 │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┤
│  wt.ts   │ newpr.ts │cleanpr.ts│ lswt.ts  │wtlink.ts │  wtstate.ts  │
│ (yargs)  │ (direct) │ (direct) │ (direct) │ (direct) │  (direct)    │
└────┬─────┴──────────┴──────────┴──────────┴──────────┴──────────────┘
     │  spawnSync (process boundary — current wt delegation)
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   INTERACTIVE MENU LAYER                             │
│   wt/interactive-menu.ts     wt/link.ts      wt/list.ts             │
│   (flows collect args,       (delegates)     (delegates)            │
│    then spawnSync to CLIs)                                           │
└──────────────────────────────────────────────┬──────────────────────┘
                                               │ direct import
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LIBRARY LAYER (src/lib/)                         │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  logger  │  │  colors  │  │ prompts  │  │   json-output      │  │
│  │(singleton│  │(module-  │  │(inquirer │  │(CommandResult<T>   │  │
│  │ wt only) │  │ level)   │  │ wrapper) │  │ typed envelope)    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────────┘  │
│                                                                      │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐    │
│  │  git.ts / github.ts  │  │  wtlink/manage-manifest.ts        │    │
│  │  (shell wrappers)    │  │  (2042 lines: TUI + state machine  │    │
│  │                      │  │   + file I/O + signals — FRAGILE) │    │
│  └──────────────────────┘  └───────────────────────────────────┘    │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │  newpr/  │  │ cleanpr/ │  │  lswt/   │  │   wtstate/       │    │
│  │ (index,  │  │ (index,  │  │(index,   │  │   wtconfig/      │    │
│  │  actions,│  │  cleanup,│  │ formatt- │  │   hooks/         │    │
│  │  handler)│  │  args)   │  │ ers,etc) │  │   ai/            │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                               │ direct import
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API LAYER (src/api/)                             │
│  list.ts   clean.ts   create.ts   state.ts  (programmatic use)      │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                           | Responsibility                                                                               | Notes                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/cli/wt.ts`                     | Yargs root: registers subcommands, initializes logger, handles interactive menu default      | Only CLI that uses logger singleton correctly                                      |
| `src/cli/wt/run-command.ts`         | `spawnSync` bridge between `wt` subcommands and legacy binaries                              | Crosses process boundary — creates output fragmentation                            |
| `src/cli/wt/interactive-menu.ts`    | TUI flow coordinator for `wt` interactive mode                                               | Collects inputs via prompts, delegates execution via `runSubcommand`               |
| `src/cli/newpr.ts` (and siblings)   | Legacy binary entry points; arg parsing + orchestration                                      | Each re-implements output formatting independently                                 |
| `src/lib/logger.ts`                 | Singleton structured logger with levels, file output, child loggers                          | Only wired in `wt.ts` — legacy binaries bypass it entirely                         |
| `src/lib/colors.ts`                 | ANSI colorizer with `NO_COLOR`/`FORCE_COLOR` / TTY detection                                 | Module-level evaluation of `shouldUseColors()` — cannot be reconfigured at runtime |
| `src/lib/json-output.ts`            | Typed `CommandResult<T>` envelope, `ErrorCode` enum, factory functions                       | Exists and is used by lswt/wtstate — not yet unified across all commands           |
| `src/lib/prompts.ts`                | Custom arrow-key navigation prompt wrapping readline                                         | Manages raw mode; used by `interactive-menu.ts` and `manage-manifest.ts`           |
| `src/lib/wtlink/manage-manifest.ts` | Full TUI state machine: signals-based reactive state, keyboard handling, rendering, file I/O | 2042 lines — the highest-risk component                                            |
| `src/lib/lswt/formatters.ts`        | Pure formatting functions: type labels, sort order, JSON output                              | Well-extracted; model for other formatters                                         |
| `src/lib/lswt/interactive.ts`       | Interactive worktree selection via prompts                                                   | Separate from formatters — clean boundary                                          |
| `src/api/`                          | Programmatic API (list, clean, create, state)                                                | Usable without CLI; consumed by MCP server                                         |
| `src/mcp/server.ts`                 | MCP server exposing API layer to AI agents                                                   | Imports `src/api/` only — correctly isolated                                       |

---

## Recommended Project Structure (Target State)

The goal is in-process delegation instead of spawn delegation for `wt` subcommands, with a shared UI rendering module.

```
src/
├── cli/
│   ├── wt.ts                  # Unified entry: yargs root, logger init
│   ├── wt/
│   │   ├── entry.ts           # Wires yargs commands → lib handlers
│   │   ├── interactive-menu.ts # TUI flow coordinator (calls handlers directly)
│   │   ├── run-command.ts     # Keep for legacy binaries (newpr etc as aliases)
│   │   ├── new.ts / list.ts / clean.ts / link.ts / state.ts / config.ts
│   │   └── ...
│   ├── newpr.ts               # Thin alias → delegates to lib/newpr
│   ├── cleanpr.ts             # Thin alias → delegates to lib/cleanpr
│   ├── lswt.ts                # Thin alias → delegates to lib/lswt
│   └── wtlink.ts              # Thin alias → delegates to lib/wtlink
├── lib/
│   ├── ui/                    # NEW: shared UI rendering module
│   │   ├── index.ts           # Public API: printTable, printError, printSuccess
│   │   ├── table.ts           # Worktree table renderer (extracted from lswt.ts)
│   │   ├── status-line.ts     # Status line / summary footer
│   │   └── theme.ts           # Color aliases for semantic intent
│   ├── logger.ts              # Singleton — NO changes needed
│   ├── colors.ts              # NO changes needed
│   ├── json-output.ts         # Extend to cover newpr/cleanpr/wtlink
│   ├── prompts.ts             # NO changes needed
│   ├── newpr/ cleanpr/ lswt/ wtlink/ wtstate/ wtconfig/
│   └── ...
└── api/
    └── ...  # NO changes needed
```

---

## Architectural Patterns

### Pattern 1: Shared Output Formatter

**What:** A `src/lib/ui/` module that all CLI entry points import for rendering worktree tables, status lines, and error output. Pure functions that receive data and write to stdout/stderr. No state.

**When to use:** Whenever more than one CLI command renders the same type of data (worktree rows, PR status badges, error messages).

**Trade-offs:** Requires extracting the `printTable` function currently inlined in `src/cli/lswt.ts` and the summary rendering from `manage-manifest.ts`'s header. Low risk because the extraction is pure function work.

**Example:**

```typescript
// src/lib/ui/table.ts
export function printWorktreeTable(
  worktrees: WorktreeDisplay[],
  options: { verbose: boolean; cwd: string }
): void {
  // extracted from src/cli/lswt.ts printTable()
}

// src/cli/lswt.ts (after)
import { printWorktreeTable } from '../lib/ui/table.js';
```

### Pattern 2: Logger Propagation via Child Context

**What:** Every CLI entry point (including legacy binaries) calls `initializeLogger()` at startup, then creates a child logger via `logger.child('commandName')`. All downstream lib functions receive the logger via dependency injection or import the singleton directly.

**When to use:** Any new function in `src/lib/` that needs to emit diagnostic output at DEBUG/TRACE level. User-visible output (success messages, errors) stays as `console.log`/`console.error` — the logger is for diagnostics.

**Trade-offs:** Legacy binaries (`newpr.ts`, `cleanpr.ts`, etc.) currently call `console.log` directly without going through the logger. Wiring them requires adding `initializeLogger()` at the top of each entry point. This is safe to do incrementally.

**Example:**

```typescript
// src/cli/newpr.ts (after adding logger init)
import { initializeLogger } from '../lib/logger.js';
initializeLogger({
  /* read from process.argv */
});

// src/lib/newpr/actions.ts (diagnostic logging)
import { logger } from '../logger.js';
const log = logger.child('newpr');
log.debug('Creating worktree at %s', worktreePath);
```

### Pattern 3: In-Process Delegation (replacing spawnSync bridge)

**What:** `wt` subcommand handlers in `src/cli/wt/*.ts` call library functions directly instead of spawning child processes via `run-command.ts`.

**When to use:** When the `wt list` handler can call `gatherWorktreeInfo()` and `printWorktreeTable()` directly instead of spawning `lswt.js`. Eliminates the output pipe gap that breaks `--quiet` and `--log-file`.

**Trade-offs:** This is a larger refactor. `run-command.ts` must be preserved for backward-compat (newpr/cleanpr/lswt as standalone binaries still exist). Interactive-menu handlers call `runSubcommand` and exit — these become synchronous function calls returning results instead.

**Example:**

```typescript
// src/cli/wt/list.ts (after in-process delegation)
import { gatherWorktreeInfo, createDefaultDeps } from '../../lib/lswt/index.js';
import { printWorktreeTable } from '../../lib/ui/table.js';

export const listCommand: CommandModule = {
  handler: async (argv) => {
    const worktrees = await gatherWorktreeInfo(repoRoot, options, deps);
    printWorktreeTable(worktrees, { verbose: argv.verbose, cwd: process.cwd() });
  },
};
```

### Pattern 4: State Machine Extraction for manage-manifest

**What:** The `interactiveManage()` function in `manage-manifest.ts` already has correct separation between state (signals), state transitions (the `_update*` family of pure functions marked with `_` prefix), and rendering (the `render()` function). The problem is they are all co-located in one 2042-line file.

**When to use:** If and only if a bug or new feature forces a structural change inside `manage-manifest.ts`. Do NOT extract for its own sake — the signals-based approach works correctly.

**Trade-offs:** The pure state-transition functions (`_updateDecision`, `_toggleFilter`, `_moveCursor`, etc.) already exist but are prefixed with `_` indicating they are unused. They are shadow implementations of inline mutations. The render path uses direct signal reads. Connecting the `_` functions to the render loop would be the right fix if the menu has state bugs, but it requires touching the `onKeypress` handler (lines 1300-1600 approximately) which is the most fragile section.

---

## Data Flow

### Logging Flow (Current vs Target)

```
CURRENT:
  wt.ts → initializeLogger() → logger singleton configured
  wt/list.ts → runSubcommand('lswt', args)
    ↳ spawnSync → new process → lswt.ts → console.log() [bypasses logger]

TARGET:
  wt.ts → initializeLogger() → logger singleton configured
  wt/list.ts → gatherWorktreeInfo() → printWorktreeTable()
    ↳ same process → logger.debug() flows to file if --log-file set
    ↳ console.log() for user output (unaffected by logger level)
```

### Output Formatting Flow (Current vs Target)

```
CURRENT (3 independent paths):
  lswt.ts → printTable() [inline, 40 lines]
  manage-manifest.ts → renderStatusHeader() [inline, 60 lines]
  interactive-menu.ts → console.log(bold(cyan(...))) [inline, scattered]

TARGET:
  lswt.ts → lib/ui/table.ts → printWorktreeTable()
  manage-manifest.ts → lib/ui/table.ts → printWorktreeTable() [if applicable]
  interactive-menu.ts → lib/ui/index.ts → printStatus(), printError()
```

### Command Dispatch Flow

```
User: `wt list`
  → wt.ts (yargs parses)
  → wt/list.ts handler(argv)
  [CURRENT]  → runSubcommand('lswt', args) → spawnSync → exit
  [TARGET]   → gatherWorktreeInfo(repoRoot, options, deps)
             → printWorktreeTable(worktrees, options)
             → process.exit(0)

User: `lswt --json`  (legacy binary path, must continue to work)
  → lswt.ts main()
  → parseArgs()
  → gatherWorktreeInfo()
  → formatJsonOutput() / printWorktreeTable()
```

### State Flow in manage-manifest (signals-based)

```
keypress event
  → onKeypress(key, data)
  → mutates one or more signals directly:
      decisions$.value = new Map([...])
      cursorIndex$.value = cursorIndex$.value + 1
  → computed signals auto-recompute if dependencies changed:
      visibleItems$ = computed(() => getVisibleItems(...))
      displayItems$ = computed(() => [...])
  → renderCurrent() called explicitly
      reads displayItems$.value (cached — no recomputation)
      calls render(buildState(), allFiles, gitRoot, displayItems)
      → console.clear() + renderStatusHeader() + renderItems() + renderFooter()
```

---

## Integration Points

### External Boundaries

| Boundary                          | Communication               | Notes                                                           |
| --------------------------------- | --------------------------- | --------------------------------------------------------------- |
| `wt` subcommands → legacy CLIs    | `spawnSync` process spawn   | Current state; target is to eliminate for in-process delegation |
| `lib/` → git                      | `execSync` shell wrapper    | `src/lib/git.ts` — synchronous, no streaming                    |
| `lib/` → GitHub CLI               | `execSync` shell wrapper    | `src/lib/github.ts` — synchronous                               |
| `src/api/` → MCP server           | Direct TypeScript import    | Clean boundary, no changes needed                               |
| `manage-manifest.ts` → filesystem | Direct `fs.*` calls inline  | Not injected — cannot mock without module-level interception    |
| `manage-manifest.ts` → git        | Direct `git.*` calls inline | Mixed with I/O and TUI rendering                                |

### Internal Boundaries

| Boundary                                                    | Communication                  | Notes                                                                |
| ----------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `cli/wt/interactive-menu.ts` ↔ `lib/prompts.ts`             | Direct import                  | Clean; `UserNavigatedBack` error class used for control flow         |
| `cli/lswt.ts` ↔ `lib/lswt/`                                 | Direct import of named exports | Clean; `lib/lswt/index.ts` is a good model                           |
| `cli/wt/*.ts` ↔ `cli/wt/run-command.ts`                     | Direct import                  | Bridge to eliminate in target state                                  |
| `lib/wtlink/main-menu.ts` ↔ `lib/wtlink/manage-manifest.ts` | Direct import of `run()`       | `main-menu.ts` calls `manage.run(argv)` — reasonable delegation      |
| Logger ↔ legacy CLI binaries                                | **Not connected**              | `newpr.ts`, `cleanpr.ts`, `lswt.ts` do not call `initializeLogger()` |

---

## Anti-Patterns

### Anti-Pattern 1: Colors Module-Level Evaluation

**What people do:** `src/lib/colors.ts` evaluates `shouldUseColors()` once at module import time via `const useColors = shouldUseColors()`. All colorizer functions close over this value.

**Why it's wrong:** Any code that imports `colors.ts` before TTY state is known (e.g., during testing, or when piped) will get the wrong color setting for the entire process lifetime. This is currently worked around by `NO_COLOR`/`FORCE_COLOR` env vars but cannot be changed after init.

**Do this instead:** Pass a `colors: boolean` context object to rendering functions, or re-evaluate TTY state lazily per call. Do NOT refactor `colors.ts` itself without understanding all call sites — the current behavior is depended on by tests.

### Anti-Pattern 2: spawnSync as Integration Glue

**What people do:** `wt list` calls `runSubcommand('lswt', args)` which calls `spawnSync(node, ['lswt.js', ...args])`.

**Why it's wrong:** The spawned process does not inherit the logger singleton, so `--log-file`, `--quiet`, and `--verbose` flags set on `wt` have no effect on the output of the spawned binary. Also prevents `wt` from composing multiple operations (e.g., `wt clean && wt link`) in one TTY session without re-rendering artifacts.

**Do this instead:** Call library functions directly from `wt` subcommand handlers. Preserve the legacy binary entry points as thin wrappers that call the same library functions.

### Anti-Pattern 3: Rendering Logic Inline in CLI Entry Points

**What people do:** `printTable()` is defined inline in `src/cli/lswt.ts`. `renderStatusHeader()` is defined inline in `src/lib/wtlink/manage-manifest.ts`. Each command re-implements color application, padding, and summary lines independently.

**Why it's wrong:** UI consistency requires touching multiple files. When the worktree status badge format changes (e.g., adding a new PR state), every renderer must be updated separately. Testing rendering requires testing through the full CLI.

**Do this instead:** Extract shared rendering into `src/lib/ui/` as pure functions that take data and write to stdout. The `lswt/formatters.ts` module is already the right pattern — `formatTypeLabel()` returns `{text, color}` and lets the caller apply color. Extend this pattern to table rendering.

### Anti-Pattern 4: Touching manage-manifest.ts for Unrelated Changes

**What people do:** Because `manage-manifest.ts` is adjacent to `link-configs.ts` and `validate-manifest.ts`, refactors that touch "wtlink" often end up modifying it.

**Why it's wrong:** The file has a working signals-based reactive loop with keyboard raw mode, `readline.emitKeypressEvents`, and direct `process.stdin` manipulation. Any change that breaks the signal dependency graph (computed signals reading the wrong signals) causes invisible rendering bugs — items not updating, cursor drift, or the UI freezing.

**Do this instead:** Treat `manage-manifest.ts` as a black box for any refactor that does not have an explicit bug to fix in it. All extraction from this file should start with adding tests first (mock `process.stdin` keypress sequences, assert `decisions$.value` state after each keypress). Only then extract to `src/lib/ui/`.

---

## Build Order (Dependency Analysis)

The correct implementation sequence based on component dependencies:

### Phase 1: Logger Wiring (no UI changes, no behavioral changes)

- Add `initializeLogger()` calls to `newpr.ts`, `cleanpr.ts`, `lswt.ts`, `wtlink.ts`, `wtstate.ts`
- This is additive-only. Each legacy binary already works without it; adding it just wires the singleton.
- **Dependency:** None. Safe to do first.

### Phase 2: Shared UI Renderer (`src/lib/ui/`)

- Extract `printTable()` from `src/cli/lswt.ts` into `src/lib/ui/table.ts`
- Extract error/success output patterns from CLI entry points into `src/lib/ui/index.ts`
- Replace inline calls with imports from `src/lib/ui/`
- **Dependency:** Requires Phase 1 complete (so the extracted renderer can call logger.debug if needed)
- **Risk:** Low. `lswt/formatters.ts` already provides the data-formatting layer; this is just the console.log orchestration.

### Phase 3: JSON Output Coverage

- Extend `src/lib/json-output.ts` with types for any commands not yet covered (wtlink result types exist but `newpr --json` output type needs audit)
- Ensure all CLI entry points use `createErrorResult` / `createSuccessResult` for structured JSON mode
- **Dependency:** Requires Phase 2 (shared renderer handles human output; JSON output is the other branch)
- **Risk:** Low. `json-output.ts` is well-structured and tested.

### Phase 4: In-Process Delegation for `wt` Subcommands

- Replace `runSubcommand('lswt', args)` in `wt/list.ts` with direct call to `gatherWorktreeInfo()` + `printWorktreeTable()` (from Phase 2)
- Repeat for `wt/clean.ts` → `lib/cleanpr/`, `wt/state.ts` → `lib/wtstate/`
- **Dependency:** Requires Phase 2 (shared renderer must exist before `wt/list.ts` can call it)
- **Risk:** Medium. The `lswt` interactive mode uses TTY detection; `wt list` must preserve this behavior. Test with both TTY and piped output before shipping.

### Phase 5: manage-manifest State Machine (only if bugs require it)

- If there are specific reported bugs in menu state (cursor drift, filter state not resetting, scroll not tracking), scope each bug individually
- Add keypress simulation tests first, then fix the signal mutation at the point of the bug
- **Dependency:** None from other phases. Completely isolated.
- **Risk:** HIGH. Do not combine with any other phase. Do not refactor for cleanliness alone.

---

## Fragile Areas — Risk Register

| Component                                                  | Risk Level | Why Fragile                                                                                       | Safe Approach                                                                              |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `manage-manifest.ts` lines 1133-1600 (`interactiveManage`) | CRITICAL   | Raw mode stdin + signals computed graph; any signal read from the wrong place breaks caching      | No changes without keypress simulation tests                                               |
| `lib/colors.ts` `useColors` constant                       | MEDIUM     | Module-level evaluation; tests may be sensitive to TTY state                                      | Do not change initialization strategy; use `NO_COLOR` in tests                             |
| `wt/run-command.ts` + `spawnSync` bridge                   | MEDIUM     | Process exit behavior relied on by interactive-menu flows (`return COMPLETED_EXIT`)               | Replace only when `wt/interactive-menu.ts` flows are rewritten to not exit the process     |
| `lib/prompts.ts` raw mode handling                         | MEDIUM     | Shares raw mode with `manage-manifest.ts`; two concurrent raw mode consumers = undefined behavior | Never run both `interactiveManage` and `promptChoice` in the same process at the same time |
| `lib/lswt/interactive.ts` + `lib/lswt/actions.ts`          | LOW        | Clean but complex; action executor depends on environment detection                               | Test with mocked environment deps before changing                                          |

---

## Scaling Considerations

This is a local CLI tool. Traditional "scale" concerns (users, requests/sec) do not apply. The relevant scaling dimension is **number of worktrees and PRs**.

| Scale                                   | Architecture Adjustments                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1-10 worktrees                          | Current architecture is fine                                                                                          |
| 50-100 worktrees                        | `manage-manifest.ts` scroll + filter becomes important; `visibleItems$` computed signal already caches this correctly |
| 100+ files in manifest                  | `groupByTopDirectory()` summary mode already handles this (threshold at 50 items)                                     |
| Large repositories (10k+ ignored files) | `interactiveManage()` builds full file tree in memory; `buildFileTree()` is O(n) — acceptable                         |

---

## Sources

- Direct inspection of `src/cli/wt.ts`, `src/cli/wt/run-command.ts`, `src/cli/wt/interactive-menu.ts`
- Direct inspection of `src/lib/wtlink/manage-manifest.ts` (2042 lines, sampled at key sections)
- Direct inspection of `src/lib/logger.ts` (singleton pattern, `initializeLogger` API)
- Direct inspection of `src/lib/colors.ts` (module-level `useColors` constant)
- Direct inspection of `src/lib/json-output.ts` (typed `CommandResult<T>` envelope)
- Direct inspection of `src/lib/lswt/formatters.ts` (model for pure formatter pattern)
- `package.json` bin entries (confirms 8 registered binaries)
- HIGH confidence: all claims based on direct source inspection, not training data

---

_Architecture research for: git-worktree-tools CLI unification_
_Researched: 2026-02-18_
