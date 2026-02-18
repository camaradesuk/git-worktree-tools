# Phase 2: Shared UI Primitives - Research

**Researched:** 2026-02-18
**Domain:** CLI output formatting, terminal UI, error presentation
**Confidence:** HIGH

## Summary

This research audits every output path across all 4 CLI commands (newpr, cleanpr, lswt, wtlink) and their supporting libraries. The codebase currently uses a mix of `console.log`, `console.error`, `console.warn`, and `process.stdout.write` calls spread across 15+ files, with no centralized output primitives. The existing `colors.ts` module provides semantic functions (`success()`, `warning()`, `error()`, `info()`, `header()`) with consistent icons, but these are called inline throughout the codebase rather than through a shared UI layer.

The spinner is a custom implementation in `prompts.ts` using raw `setInterval` + ANSI codes -- not `ora`. Error rendering varies wildly: newpr has a structured `exitWithError()` with JSON support and suggestion hints, cleanpr has a similar pattern, lswt shows friendlier contextual messages, and wtlink uses raw yargs `.fail()` with ad-hoc suggestion blocks. There is no shared error formatting.

**Primary recommendation:** Create `src/lib/ui/` with `theme.ts` (icons + colors constants), `status.ts` (printStatus, printHeader), `table.ts` (printTable extracted from lswt), `error.ts` (printError with title+detail+hint), and `spinner.ts` (thin wrapper around existing `withSpinner` from prompts.ts). Refactor all CLIs to use these shared primitives. Do NOT introduce `ora` -- the existing spinner in prompts.ts is lightweight, cross-platform, and works well.

## Current Output Patterns

### File-by-File Inventory

#### `src/lib/colors.ts` - Existing Color & Icon System

**Output method:** Returns strings (does not print)
**Icons defined:**

- `success()`: `✓` (green) / `[OK]` (no-color)
- `warning()`: `⚠` (yellow) / `[WARN]` (no-color)
- `error()`: `✗` (red) / `[ERROR]` (no-color)
- `info()`: `ℹ` (blue) / `[INFO]` (no-color)
- `debug()`: `[DEBUG]` (dim)
- `header()`: bold cyan
- `highlight()`: bold white

**Key finding:** Colors respects `NO_COLOR`, `FORCE_COLOR`, and has `setColorEnabled()`. This is the foundation to build upon.

#### `src/lib/logger.ts` - Logger Singleton (Phase 1)

**Output method:** `process.stderr.write()` via ConditionalStderrReporter
**Icons:** None -- uses `[LEVEL]` prefix format
**Key finding:** Logger writes to stderr, NOT stdout. This is correct for diagnostic output. CLI user-facing output still uses console.log (stdout). These two channels must remain separate.

#### `src/lib/prompts.ts` - Spinner & Prompt Utilities

**Output method:** `console.log()`, `process.stdout.write()`
**Spinner:** Custom implementation using braille frames `['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']` at 80ms intervals via `setInterval`. Clears line with `\r` after completion. Only shows if `process.stdout.isTTY`.
**Key finding:** Has `printHeader()` and `printListItem()` already exported -- but only used in prompts.ts itself.

#### `src/cli/newpr.ts` - Create PR Command

**Output methods:**

- `console.log()` -- 60+ calls for progress, status, summaries
- `console.error()` -- for errors and checkout failure hints
- `progress()` helper -- suppresses output in JSON mode
- `progressError()` helper -- suppresses errors in JSON mode

**Icons/Symbols used:**

- `colors.success()` (green check): prerequisites OK, created worktree, linked files, PR created
- `colors.warning()` (yellow warning): network errors, failed links, PR worktree warning
- `colors.info()` (blue info): checking prerequisites, creating branch, fetching, config file count
- `colors.error()` (red X): prerequisites missing, abort, checkout failure
- `colors.dim()`: next steps hints
- `colors.green()`: success banner with `═` box-drawing chars
- `'✨'` emoji: AI-generated PR content (INCONSISTENT -- not from colors.ts)

**Error rendering:**

- `exitWithError()`: JSON mode outputs structured JSON, non-JSON outputs `colors.error(message)` then `process.exit(1)`
- Top-level catch: Shows `Error: ${message}` with `colors.error()`, plus suggestion via `getErrorSuggestion()` in `colors.dim()`
- Checkout failure: 3-line hint block via `progressError()` with `colors.info()` (INCONSISTENT -- errors should not use info color)

**Spinners:** Uses `withSpinner()` from prompts.ts for fetch, push, worktree creation

**Tables/Structured output:** None -- summary is a custom box with `═` chars

**JSON output:** Full structured `CommandResult` via `json-output.ts`

#### `src/cli/cleanpr.ts` - Clean Worktrees Command

**Output methods:**

- `console.log()` -- 30+ calls
- `console.error()` -- for errors

**Icons/Symbols used:**

- `colors.success()`: cleanup results, final summary
- `colors.warning()`: worktree has changes, skip messages
- `colors.info()`: scanning info, no worktrees found, cancel messages
- `colors.error()`: errors, PR not found
- `colors.bold()`: section headers ("PR Worktrees:")
- `colors.dim()`: next steps, expected path hints
- `colors.yellow()`, `colors.red()`, `colors.green()`: group headers (Merged/Closed/Open)
- `colors.red(' [has changes]')`: inline change indicator

**Error rendering:**

- `outputJsonError()`: JSON error output
- Non-JSON: `colors.error(message)` with suggestion via `getErrorSuggestion()` in `colors.dim()`

**Spinners:** Uses `withSpinner()` for scanning worktrees

**Tables/Structured output:**

- Group display: worktrees grouped by state (Merged/Closed/Open/Unknown) with colored headers
- Each worktree: `    PR #${w.prNumber}: ${w.branch}${changeIndicator}`
- Summary: `Cleaned X of Y worktrees.`
- Next steps block: dim text with command suggestions

#### `src/cli/lswt.ts` - List Worktrees Command

**Output methods:**

- `console.log()` -- 15+ calls
- `console.error()` -- for errors

**Icons/Symbols used:**

- `colors.bold()`: repo name header
- `colors.dim()`: detached state, summary
- `colors.red(' *')`: change indicator
- `colorMap` object mapping `formatTypeLabel()` results to color functions

**Error rendering:**

- `outputJsonError()`: JSON error output
- Non-JSON: `colors.error(message)` + `colors.dim()` for context

**Spinners:** None (data gathering is synchronous in non-interactive mode)

**Tables/Structured output:**

- `printTable()` function -- THE key extraction target:
  - Header: bold repo name
  - Per worktree: type label (colored) + change indicator, branch, path, optional commit
  - Summary: `X worktrees · Y PRs · Z open · W with changes` (dim, dot-separated)

#### `src/cli/wtlink.ts` - Config Link Manager

**Output methods:**

- `console.log()` -- 15+ calls
- `console.error()` -- in yargs `.fail()` and `.catch()` handlers

**Icons/Symbols used:**

- `colors.yellow()`: deprecation notices, manifest info
- `colors.dim()`: hints, context
- `colors.green()`: migration success
- `colors.red()`: migration errors, yargs validation errors
- `colors.cyan()`: dry run notices
- `colors.error()`: in `.fail()` handler (from colors.ts semantic function)

**Error rendering:**

- yargs `.fail()`: Shows error message then contextual suggestion block (5 different error patterns detected with if/else chain)
- `.catch()`: DUPLICATED error handling logic (same if/else chain as `.fail()`)
- No JSON error output support for wtlink

**Spinners:** None

**Tables/Structured output:** None

#### `src/lib/wtlink/link-configs.ts` - Link Operation

**Output methods:**

- `console.log()` -- 30+ calls
- `console.error()` -- 2 calls for safety/error
- `console.warn()` -- 1 call for missing source file
- `console.clear()` -- 1 call for conflict resolver

**Icons/Symbols used:**

- `colors.green('✓ Scanned X files')` -- raw check mark, NOT via `colors.success()` (INCONSISTENT)
- `colors.yellow('⚠️  Found X conflicting files')` -- emoji warning, NOT via `colors.warning()` (INCONSISTENT)
- `colors.dim('✓ Already linked:')` -- check in dim (INCONSISTENT)
- `colors.yellow('⚠  Replace:')` -- single char warning (INCONSISTENT)
- `colors.blue('ℹ  Ignore:')` -- info icon
- `colors.red('✗ Remove:')` -- X icon
- `colors.green('✓ Safe:')` -- check icon
- Box-drawing: `═══`, `╔`, `╗`, `╚`, `╝`, `║` for headers
- `colors.green('  - Hard-linked: file')`, `colors.green('  - Symlinked: file')` -- inline
- `colors.red(colors.bold('  - DANGER:'))` -- safety warning

**Error rendering:** Raw `console.error()` with inline `colors.red()`, no structured format

**Key finding:** This file has the MOST inconsistent icon usage. Uses raw unicode chars instead of `colors.success()` etc.

#### `src/lib/wtlink/manage-manifest.ts` - BLACK BOX (Interactive TUI)

**Output methods:** Heavy `console.log()` and `console.clear()` throughout (~100+ calls)
**Icons/Symbols used:**

- `'✓'` (green), `'◎'` (blue), `'✗'` (yellow) -- custom icon set for Link/Tracked/Skipped
- `'⬆️'` emoji -- go back
- `'📁'`, `'📄'` emojis -- file/folder icons
- `'▶'` -- cursor indicator (in bgBlue)
- `'█'` -- vim command cursor
- Box-drawing characters extensively for TUI frames
- `colors.bgYellow(colors.black(' ℹ  '))` -- info badge

**Key constraint:** This is a BLACK BOX. It has its own internal TUI rendering system using `@preact/signals-core` for reactive state. Do NOT refactor its internal output. Only fix actual bugs.

**Assessment:** manage-manifest.ts uses `colors.*` for coloring but has its own icon semantics (✓/◎/✗ mean different things than in colors.ts). This is acceptable because it's a self-contained TUI. The shared UI primitives should NOT try to unify this.

#### `src/lib/wtlink/validate-manifest.ts` - Manifest Validation

**Output methods:**

- `console.log()` -- 1 call for success
- `console.error()` -- 2 calls for validation failures

**Icons/Symbols used:**

- `colors.green()`: success message
- `colors.red(colors.bold())`: failure header
- `colors.red()`: individual issues

**Error rendering:** Throws `new Error()` after printing issues

#### `src/lib/wtlink/main-menu.ts` - Interactive Menu

**Output methods:**

- `console.log()` -- 20+ calls
- `console.clear()` -- for menu transitions
- `console.error()` -- 1 call for errors

**Icons/Symbols used:**

- Box-drawing: `╔`, `╗`, `╚`, `╝`, `║` for menu headers
- `colors.green()`, `colors.blue()`, `colors.cyan()`: menu items
- `colors.dim()`: descriptions
- `colors.red()`: error display

**Error rendering:** Catches errors and shows `colors.red('\nError:'), errorMessage`

#### `src/cli/wt.ts` - Unified CLI

**Output methods:**

- `console.error()` -- in `.fail()` and `.catch()` handlers

**Icons/Symbols used:** None -- delegates to subcommands

**Error rendering:** Raw `console.error(err.message)` or `console.error(msg)` -- no coloring at all (INCONSISTENT)

#### `src/lib/lswt/interactive.ts` - Interactive Worktree Browser

**Output methods:**

- `console.log()` -- 10+ calls
- `console.clear()` -- for screen refresh
- `process.stdout.write()` -- for raw terminal manipulation

**Icons/Symbols used:**

- `'✓'` / `'✗'` (green/red): action result feedback
- `'❯'` (cyan): cursor/selection indicator
- `'🔍'` emoji: search mode
- Badge colors: cyan (main), green (PR), yellow (draft), blue (branch), dim (detached/remote)
- Box-drawing: `╔`, `╗`, `╚`, `╝`, `║` for header

**Key finding:** Interactive mode has its own rendering system (like manage-manifest). The output is part of the raw terminal TUI and should not be forced through shared primitives.

#### API Layer (`src/api/*.ts`)

**Output methods:** NONE -- pure functions returning `CommandResult` objects
**Key finding:** The API layer is clean and produces no console output. This is correct.

## Icon/Symbol Audit

| Symbol          | Source           | Semantic Meaning | Files Using It                                   | Via colors.ts?      |
| --------------- | ---------------- | ---------------- | ------------------------------------------------ | ------------------- |
| `✓`             | colors.success() | Success/OK       | newpr, cleanpr, lswt                             | YES                 |
| `✗`             | colors.error()   | Error/failure    | newpr, cleanpr                                   | YES                 |
| `⚠`             | colors.warning() | Warning          | newpr, cleanpr                                   | YES                 |
| `ℹ`             | colors.info()    | Information      | newpr, cleanpr, lswt                             | YES                 |
| `✓`             | raw string       | Scanned files    | link-configs.ts                                  | NO (inconsistent)   |
| `⚠️`            | emoji            | Conflict warning | link-configs.ts                                  | NO (inconsistent)   |
| `✨`            | emoji            | AI-generated     | newpr.ts                                         | NO (inconsistent)   |
| `✓`/`◎`/`✗`     | raw strings      | Link/Track/Skip  | manage-manifest.ts                               | NO (black box - OK) |
| `📁`/`📄`       | emoji            | Folder/File      | manage-manifest.ts                               | NO (black box - OK) |
| `▶`             | raw string       | Selected item    | prompts.ts, manage-manifest.ts                   | NO                  |
| `❯`             | raw string       | Cursor           | lswt/interactive.ts                              | NO                  |
| `🔍`            | emoji            | Search mode      | lswt/interactive.ts                              | NO                  |
| `═╔╗╚╝║`        | box-drawing      | Section headers  | newpr, link-configs, main-menu, lswt/interactive | NO                  |
| `*`             | raw string       | Has changes      | lswt.ts printTable                               | NO                  |
| `[has changes]` | raw string       | Has changes      | cleanpr.ts                                       | NO                  |

### Inconsistencies Found

1. **link-configs.ts** uses raw `'✓'` instead of `colors.success()` in 3 places
2. **link-configs.ts** uses `'⚠️'` emoji instead of `colors.warning()` icon
3. **newpr.ts** uses `'✨'` emoji for AI content (not in colors.ts vocabulary)
4. **lswt.ts** uses `colors.red(' *')` for changes; cleanpr uses `colors.red(' [has changes]')` -- different formats
5. **wt.ts** error handling uses NO colors at all

## Spinner Audit

| Location                   | Implementation      | Library        | Frames                   | Interval | TTY-aware? |
| -------------------------- | ------------------- | -------------- | ------------------------ | -------- | ---------- |
| `prompts.ts` withSpinner() | Custom setInterval  | None (raw)     | Braille dots (10 frames) | 80ms     | YES        |
| newpr.ts                   | Calls withSpinner() | Via prompts.ts | Same as above            | Same     | YES        |
| cleanpr.ts                 | Calls withSpinner() | Via prompts.ts | Same as above            | Same     | YES        |
| lswt.ts                    | None                | N/A            | N/A                      | N/A      | N/A        |
| wtlink.ts                  | None                | N/A            | N/A                      | N/A      | N/A        |

**Key finding:** There is exactly ONE spinner implementation and it is already consistent. It is NOT `ora` -- it is a custom 15-line implementation in prompts.ts. The roadmap mentioned `ora@^8.1.1` but **ora is NOT in package.json dependencies**. The current spinner is simpler, has no dependency, and works fine.

**Recommendation:** Keep the current spinner. Do NOT add ora. Extract the spinner into `src/lib/ui/spinner.ts` as a thin re-export or keep it in prompts.ts and import from there. Adding ora adds ~30KB of dependencies for no benefit.

## Error Rendering Audit

### newpr.ts

```
Pattern 1 - exitWithError():
  JSON: { success: false, command: "newpr", error: { code, message, suggestion } }
  Non-JSON: "✗ {message}" (red) then process.exit(1)

Pattern 2 - Top-level catch:
  JSON: Same as above
  Non-JSON: "✗ Error: {message}" (red)
             ""
             "{suggestion}" (dim)

Pattern 3 - Checkout failure hint:
  "✗ Checkout failed due to conflicting changes." (red)
  "ℹ Your staged changes are preserved. To resolve this, either:" (blue info)
  "ℹ   1. Commit your changes first, then run newpr again" (blue info)
  "ℹ   2. Stash your changes: git stash push" (blue info)
  "ℹ   3. Use a different branch point" (blue info)
```

### cleanpr.ts

```
Pattern 1 - outputJsonError():
  JSON: { success: false, command: "cleanpr", error: { code, message } }

Pattern 2 - Non-JSON errors:
  "✗ {message}" (red)
  "{expected path}" (dim)

Pattern 3 - Top-level catch:
  "✗ Error: {message}" (red)
  ""
  "{suggestion}" (dim)
```

### lswt.ts

```
Pattern 1 - Non-JSON errors:
  "✗ {message}" (red)
  "{context hint}" (dim)

Pattern 2 - Top-level catch:
  "✗ Error: {message}" (red)
  (no suggestion for most errors)
```

### wtlink.ts

```
Pattern 1 - yargs .fail():
  "✗ {message}" (red via colors.error())
  ""
  "{multi-line contextual suggestion}" (dim)

Pattern 2 - .catch():
  "✗ {message}" (red via colors.error())
  ""
  "{DUPLICATED multi-line contextual suggestion}" (dim)

NO JSON error support.
```

### wt.ts

```
Pattern 1 - .fail():
  "{message}" (NO COLORS)

Pattern 2 - .catch():
  "{message}" (NO COLORS)
```

### Summary of Error Rendering Issues

1. **No shared error format** -- each command formats errors differently
2. **Inconsistent "Error:" prefix** -- some include it, some don't
3. **Suggestion display** -- newpr/cleanpr use `getErrorSuggestion()` from json-output.ts, wtlink has hardcoded suggestion blocks, lswt has partial suggestions
4. **wt.ts has NO colors** in error output
5. **wtlink duplicates** error handling logic between `.fail()` and `.catch()`
6. **No title+detail+hint structure** -- errors are flat messages with optional suggestions

### Target Error Format (title + detail + hint)

```
✗ {Title}                           <- red, concise
  {Detail explanation}               <- normal text, wraps
  Hint: {actionable suggestion}      <- dim, tells user what to do
```

This maps well to existing error classes:

- `GitCommandError`: title=message, detail=stderr, hint=from error code
- `GitHubCliError`: title=message, detail=stderr, hint=from error code
- `ConfigurationError`: title=message, detail=field+configFile, hint=from error code
- `WorktreeError`: title=message, detail=worktreePath+branch, hint=from error code
- `ManifestError`: title=message, detail=issues[], hint="Run wtlink manage"
- `UserCancelledError`: title="Operation cancelled", no detail/hint needed

## Table/Structured Output Audit

### lswt.ts `printTable()`

```
{repo} worktrees:

  [type-label][change-indicator]
    Branch: {branch}
    Path:   {path}
    Commit: {commit}           (verbose only)

{X worktrees} · {Y PRs} · {Z open} · {W with changes}
```

- Type labels colored via `colorMap` from `formatTypeLabel()`
- Change indicator: `colors.red(' *')`
- Summary uses dim dots as separators

### cleanpr.ts group display

```
PR Worktrees:

  Merged (N):
    PR #X: branch-name [has changes]
  Closed (N):
    PR #X: branch-name
  Open (N):
    PR #X: branch-name
  Unknown (N):
    PR #X: branch-name
```

- Group headers colored by state
- Change indicator: `colors.red(' [has changes]')`

### newpr.ts summary box

```
════════════════════════════════════════════════════════════
  PR #X worktree ready!
════════════════════════════════════════════════════════════

  Branch:    branch-name
  Worktree:  /path/to/worktree
  PR URL:    https://...

  Next steps:
    cd /path/to/worktree
    gh pr view X --web
    wtlink link
```

- Green box-drawing borders
- Dim next steps section

### "Next Steps" pattern (used across commands)

```
  Next steps:
    lswt                        # List remaining worktrees
    newpr "feature description"  # Create a new PR
```

Appears in: newpr, cleanpr (2 places), lswt (not explicit but similar)

## Existing Abstractions

### Already centralized in `colors.ts`:

- `success(text)` -- green check + text
- `warning(text)` -- yellow warning + yellow text
- `error(text)` -- red X + red text
- `info(text)` -- blue info + text
- `header(text)` -- bold cyan text
- `highlight(text)` -- bold white text
- `debug(text)` -- dim [DEBUG] prefix
- Color-disable support via `setColorEnabled()` and `NO_COLOR`/`FORCE_COLOR`

### Already centralized in `prompts.ts`:

- `withSpinner(message, operation)` -- TTY-aware spinner
- `printHeader(text)` -- bold cyan header (barely used)
- `printListItem(text, indent)` -- bullet list item (not used outside prompts.ts)
- `promptChoiceIndex()`, `promptChoice()`, `promptConfirm()`, `promptInput()`

### Already centralized in `json-output.ts`:

- `createSuccessResult()` / `createErrorResult()` / `formatJsonResult()`
- `getErrorSuggestion(code)` -- maps ErrorCode to helpful suggestion string
- `getErrorCodeFromError(error)` -- maps error classes to ErrorCode enum

### NOT centralized (gaps):

- Table formatting (inline in lswt.ts)
- Error rendering with title+detail+hint
- "Next steps" blocks
- Summary boxes (newpr success)
- Group displays (cleanpr worktree groups)

## Dependencies

### Current npm packages for UI output:

| Package              | Version | Used For             | Used By                                                     |
| -------------------- | ------- | -------------------- | ----------------------------------------------------------- |
| (none)               | -       | Colors/ANSI          | Custom `colors.ts`                                          |
| (none)               | -       | Spinner              | Custom in `prompts.ts`                                      |
| inquirer             | ^9.3.7  | Interactive prompts  | prompts.ts, link-configs, manage-manifest, lswt/interactive |
| yargs                | ^17.7.2 | CLI argument parsing | wtlink.ts, wt.ts                                            |
| @preact/signals-core | ^1.8.0  | Reactive TUI state   | manage-manifest.ts (black box)                              |
| consola              | ^3.4.2  | Logger               | logger.ts                                                   |

**Key finding:** There are NO external UI formatting libraries (no chalk, no ora, no cli-table, no boxen). Everything is hand-rolled ANSI. This is intentional -- the project avoids dependencies. The shared UI primitives should follow this pattern.

### NOT in dependencies (despite roadmap mention):

- `ora` -- mentioned as `ora@^8.1.1` in the roadmap but NOT installed. The custom spinner works fine.

## Recommended Approach

### Module Structure

```
src/lib/ui/
├── index.ts           # Re-exports all public functions
├── theme.ts           # Icons, semantic colors, box-drawing constants
├── status.ts          # printStatus(), printHeader(), printNextSteps()
├── table.ts           # printTable() extracted from lswt
├── error.ts           # printError() with title+detail+hint
└── spinner.ts         # Re-export withSpinner from prompts.ts (or move it here)
```

### theme.ts - Centralized Theme Constants

Should define:

```typescript
export const icons = {
  success: '✓', // or [OK] when colors disabled
  error: '✗', // or [ERROR]
  warning: '⚠', // or [WARN]
  info: 'ℹ', // or [INFO]
  bullet: '•',
  arrow: '▶',
  change: '*',
} as const;

export const box = {
  horizontal: '═',
  vertical: '║',
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  line: '─',
} as const;
```

This replaces scattered unicode literals across the codebase.

### status.ts - Status Output Functions

```typescript
// Uses colors.ts semantic functions internally
printStatus(type: 'success' | 'error' | 'warning' | 'info', message: string): void
printHeader(title: string): void
printNextSteps(steps: Array<{ command: string; description: string }>): void
printSummaryBox(title: string, fields: Array<{ label: string; value: string }>): void
```

### table.ts - Table Formatting

Extract from `lswt.ts` `printTable()`:

```typescript
printTable(options: {
  title?: string;
  rows: Array<{ label: string; sublabels?: string[]; indicator?: string }>;
  summary?: string;
}): void
```

### error.ts - Structured Error Display

```typescript
printError(options: {
  title: string;
  detail?: string;
  hint?: string;
}): void
```

Integrates with existing error classes and `getErrorSuggestion()`.

### spinner.ts - Spinner Re-export

Either re-export `withSpinner` from prompts.ts, or move the implementation here. The spinner is already consistent -- this is just about the module location.

### Refactoring Strategy

1. **Create ui/ module** with theme, status, table, error, spinner
2. **Refactor newpr.ts**: Replace inline `console.log(colors.success(...))` with `printStatus('success', ...)`. Replace `exitWithError()` with shared `printError()`. Replace summary box with `printSummaryBox()`.
3. **Refactor cleanpr.ts**: Replace group display with shared functions. Replace inline error handling with `printError()`.
4. **Refactor lswt.ts**: Move `printTable()` to `ui/table.ts`. Import from there.
5. **Refactor wtlink.ts**: Replace `.fail()` and `.catch()` error handling with shared `printError()`. Deduplicate the error handling.
6. **Fix wt.ts**: Add colors to error output.
7. **DO NOT TOUCH** manage-manifest.ts internal rendering.

### What NOT to do

- Do NOT add `ora` as a dependency -- the existing spinner is fine
- Do NOT try to unify manage-manifest.ts icons (black box)
- Do NOT try to unify lswt/interactive.ts raw terminal rendering (TUI-specific)
- Do NOT make `printTable` too generic -- extract the lswt pattern, not a full table library
- Do NOT break JSON output mode -- all print functions must be no-ops when JSON mode is active

## Gaps & Risks

### Hardest Extraction: Error Rendering in wtlink.ts

wtlink uses yargs which has its own `.fail()` handler. The error rendering must work within yargs' error handling flow, which means:

1. The `.fail()` callback receives `(msg, err)` where `msg` is yargs validation error text and `err` is a thrown error
2. We need to handle both cases
3. The suggestion blocks are currently hardcoded based on error message content matching (if/else chain with `message.includes(...)`)
4. This logic is DUPLICATED between `.fail()` and `.catch()`

**Risk:** Refactoring wtlink error handling requires careful testing to ensure all error paths still show helpful messages.

**Mitigation:** Extract the suggestion-matching logic into a function in `error.ts` (e.g., `getWtlinkSuggestion(message)`), then use `printError()` in both `.fail()` and `.catch()`.

### JSON Mode Interaction

All shared UI functions must be aware of JSON mode. Options:

1. **Check a module-level flag** -- import from logger or a new ui-state module
2. **Accept a `json` parameter** -- explicit but verbose
3. **Make print functions return strings** -- caller decides whether to print

**Recommendation:** Option 1. Add a `setJsonMode(enabled: boolean)` to the ui module, called during CLI initialization alongside `initializeLogger()`. All print functions silently no-op when JSON mode is active.

### Interactive Mode Boundary

The interactive modes (lswt/interactive.ts, manage-manifest.ts, main-menu.ts) do their own raw terminal rendering. The shared UI primitives are for NON-interactive output only. This boundary must be clear in the module documentation.

### `console.log` Grep Scope

After refactoring, the following files should have ZERO `console.log` calls for structured output:

- `src/cli/newpr.ts` (except JSON output and help text)
- `src/cli/cleanpr.ts` (except JSON output and help text)
- `src/cli/lswt.ts` (except JSON output and help text)
- `src/cli/wtlink.ts` (except help text)
- `src/cli/wt.ts`

These files MAY still have `console.log` for JSON output and interactive mode delegation:

- `src/lib/wtlink/link-configs.ts` (many inline outputs)
- `src/lib/wtlink/validate-manifest.ts` (few outputs)

### Testing Strategy

The new `ui/` module should be easy to test:

- All functions accept simple parameters (no complex objects)
- Test by capturing stdout (use `vi.spyOn(console, 'log')`)
- Test JSON mode suppression
- Test NO_COLOR fallback icons

### Change Indicator Inconsistency

Currently two different formats:

- lswt: `colors.red(' *')` -- compact
- cleanpr: `colors.red(' [has changes]')` -- verbose

Phase 2 should standardize on one format. Recommendation: `colors.red(' *')` for inline indicators, with `[has changes]` only in verbose/detail views.

## Sources

### Primary (HIGH confidence)

- Direct file reads of all 15+ source files listed above
- `package.json` for dependency verification

### Analysis Method

- Line-by-line audit of all console.log, console.error, console.warn, process.stdout.write calls
- Cross-referenced icon usage across all files
- Mapped error handling patterns in all catch blocks and .fail() handlers
- Verified spinner implementation (no ora dependency exists)

## Metadata

**Confidence breakdown:**

- Current output patterns: HIGH - direct source code analysis
- Icon audit: HIGH - exhaustive grep of all files
- Spinner audit: HIGH - verified no ora dependency in package.json
- Error rendering: HIGH - all error paths traced
- Recommended approach: HIGH - based on existing patterns, no new libraries needed

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable codebase, no external dependency changes expected)
