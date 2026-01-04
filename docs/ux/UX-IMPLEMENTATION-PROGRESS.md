# UX Implementation Progress Report

> **Last Updated:** January 4, 2026
> **Tests Status:** 1742 tests passing
> **Current Version:** 1.5.0

This document tracks implementation progress of UX improvements and provides context for future LLM continuation.

---

## Table of Contents

1. [Completed Work](#completed-work)
2. [Code Patterns & Examples](#code-patterns--examples)
3. [Remaining Work](#remaining-work)
4. [Long-Term Roadmap](#long-term-roadmap)
5. [File Reference](#file-reference)
6. [Testing Checklist](#testing-checklist)

---

## Completed Work

### Batch 1: Foundation (Complete)

#### 1.1 Error Suggestion System

**File:** `src/lib/json-output.ts`

Added `suggestion` field to ErrorInfo interface and created `getErrorSuggestion()` function:

```typescript
export interface ErrorInfo {
  code: ErrorCode;
  message: string;
  suggestion?: string; // NEW: helpful next-step
  details?: Record<string, unknown>;
}

export function getErrorSuggestion(code: ErrorCode): string | undefined {
  const suggestions: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.NOT_GIT_REPO]: 'Run this command from within a git repository.',
    [ErrorCode.PR_NOT_FOUND]: 'Run "lswt" to see available worktrees.',
    [ErrorCode.GH_NOT_INSTALLED]: 'Install GitHub CLI: https://cli.github.com',
    [ErrorCode.GH_NOT_AUTHENTICATED]: 'Run "gh auth login" to authenticate.',
    [ErrorCode.BRANCH_EXISTS]: 'Use a different branch name or delete the existing branch.',
    [ErrorCode.WORKTREE_EXISTS]: 'Use "cleanpr" to remove the existing worktree.',
    [ErrorCode.INVALID_ARGUMENT]: 'Run with --help to see valid options.',
    [ErrorCode.MISSING_ARGUMENT]: 'Run with --help to see required arguments.',
    [ErrorCode.HOOK_FAILED]: 'Check hook output above, fix issues, and retry.',
    [ErrorCode.UNCOMMITTED_CHANGES]: 'Commit or stash your changes first.',
    [ErrorCode.MERGE_CONFLICT]: 'Resolve merge conflicts before continuing.',
    [ErrorCode.STASH_FAILED]: 'Check for uncommitted changes in submodules.',
    [ErrorCode.DETACHED_HEAD]: 'Create or checkout a branch before proceeding.',
  };
  return suggestions[code];
}
```

Enhanced `getErrorCodeFromError()` to detect git errors from message patterns:

```typescript
export function getErrorCodeFromError(error: unknown): ErrorCode {
  if (error instanceof Error) {
    // Check message content for specific patterns
    const message = error.message.toLowerCase();
    if (message.includes('not a git repository')) {
      return ErrorCode.NOT_GIT_REPO;
    }
    if (message.includes('gh: command not found') || message.includes('gh is not installed')) {
      return ErrorCode.GH_NOT_INSTALLED;
    }
    // ... more patterns
  }
  return ErrorCode.UNKNOWN_ERROR;
}
```

Updated `createErrorResult()` to auto-attach suggestions:

```typescript
export function createErrorResult(
  command: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  suggestion?: string // Optional override
): CommandResult<never> {
  const finalSuggestion = suggestion ?? getErrorSuggestion(code);
  return {
    success: false,
    command,
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
      suggestion: finalSuggestion,
      details,
    },
  };
}
```

#### 1.2 wtconfig Help Text Fix (UX-003)

**File:** `src/cli/wtconfig.ts`

Replaced `colors.info()` and `colors.warning()` with plain `colors.cyan()` in help text:

```typescript
// Before
${colors.info('wtconfig')} - Configuration management

// After
${colors.cyan('wtconfig')} - Configuration management
```

#### 1.3 newpr PR Number Validation (UX-011)

**File:** `src/lib/newpr/args.ts`

Added positive number check:

```typescript
options.prNumber = parseInt(args[i], 10);
if (isNaN(options.prNumber) || options.prNumber <= 0) {
  return { kind: 'error', message: 'PR number must be a positive number' };
}
```

---

### Batch 2: Error Handling (Complete)

#### 2.1 wtlink Error Handling (UX-001)

**File:** `src/cli/wtlink.ts`

Enhanced `.fail()` handler with contextual suggestions:

```typescript
.wrap(Math.min(100, process.stdout.columns ?? 100))
.fail((msg, err) => {
  if (err) {
    const message = err.message;
    console.error(colors.error(message));

    // Add helpful suggestions based on the error
    if (message.includes('Unable to detect an alternate worktree')) {
      console.error('');
      console.error(colors.dim('You are running from the main worktree with only one worktree available.'));
      console.error(colors.dim('To link config files, you need at least two worktrees.'));
      console.error('');
      console.error(colors.dim('To fix:'));
      console.error(colors.dim('  1. Create a PR worktree: newpr "My feature"'));
      console.error(colors.dim('  2. Then link configs: wtlink link . ../my-repo.pr42'));
    } else if (message.includes('Failed to inspect git worktrees')) {
      console.error('');
      console.error(colors.dim('Specify the source path explicitly:'));
      console.error(colors.dim('  wtlink link /path/to/source /path/to/dest'));
    } else if (message.includes('not a git repository')) {
      console.error('');
      console.error(colors.dim('Run this command from within a git repository.'));
    } else if (message.includes('Manifest file not found')) {
      console.error('');
      console.error(colors.dim('Create a manifest first:'));
      console.error(colors.dim('  wtlink manage'));
    }
  } else {
    console.error(colors.red(msg));
  }
  process.exit(1);
})
```

Fixed terminal width for help text wrapping (UX-005):

```typescript
.wrap(Math.min(100, process.stdout.columns ?? 100))
```

#### 2.2 lswt Git Error & Path Display (UX-010, UX-006)

**File:** `src/cli/lswt.ts`

Added friendly error handling for not-in-git-repo:

```typescript
main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('not a git repository')) {
    console.error(colors.error('Not a git repository'));
    console.error(colors.dim('Run this command from within a git repository.'));
  } else {
    console.error(colors.error(`Error: ${message}`));
  }
  process.exit(1);
});
```

**File:** `src/lib/lswt/formatters.ts`

Fixed path display to show "(current)" instead of ".":

```typescript
export function getDisplayPath(worktreePath: string, cwd: string, verbose: boolean): string {
  if (verbose) {
    return worktreePath;
  }

  if (worktreePath.startsWith(cwd)) {
    const rel = path.relative(cwd, worktreePath);
    // If relative path is empty (same directory), show basename with (current) indicator
    if (!rel) {
      return `${path.basename(worktreePath)} (current)`;
    }
    return toPosixPath(rel);
  }
  // ...
}
```

#### 2.3 newpr/cleanpr Error Code Detection (UX-013)

**File:** `src/cli/newpr.ts`

Updated catch block to use `getErrorCodeFromError()`:

```typescript
import { getErrorCodeFromError } from '../lib/json-output.js';

// In catch block
const code = getErrorCodeFromError(error);
exitWithError(message, code, useJson);
```

**File:** `src/cli/cleanpr.ts`

Same pattern applied:

```typescript
import { getErrorCodeFromError } from '../lib/json-output.js';

// In catch block
const code = getErrorCodeFromError(error);
exitWithError(message, code, useJson);
```

---

### Batch 3: JSON Silent Mode (Complete)

#### 3.1 newpr JSON Mode Console Suppression (UX-012)

**File:** `src/cli/newpr.ts`

Added `progress()` and `progressError()` helper functions:

```typescript
/**
 * Log progress message if not in JSON mode
 * Suppresses all non-JSON output when --json flag is used
 */
function progress(options: Options, ...args: unknown[]): void {
  if (!options.json) {
    console.log(...args);
  }
}

/**
 * Log error message if not in JSON mode
 * Suppresses all non-JSON output when --json flag is used
 */
function progressError(options: Options, ...args: unknown[]): void {
  if (!options.json) {
    console.error(...args);
  }
}
```

Replaced all `console.log()` calls throughout the file:

```typescript
// Before
console.log(colors.info('Setting up worktree...'));

// After
progress(options, colors.info('Setting up worktree...'));
```

Updated mode functions to accept options parameter:

```typescript
// Before
async function handleModeExistingPr(prNumber: number, /* ... */): Promise</* ... */> {
  console.log(colors.info(`Fetching PR #${prNumber}...`));
  // ...
}

// After
async function handleModeExistingPr(
  prNumber: number,
  options: Options,  // Added
  /* ... */
): Promise</* ... */> {
  progress(options, colors.info(`Fetching PR #${prNumber}...`));
  // ...
}
```

---

## Code Patterns & Examples

### Pattern 1: Error Handling with Suggestions

All CLI tools should follow this pattern for error handling:

```typescript
import {
  createErrorResult,
  formatJsonResult,
  getErrorCodeFromError,
  ErrorCode,
} from '../lib/json-output.js';

function exitWithError(message: string, code: ErrorCode, useJson: boolean): never {
  if (useJson) {
    const result = createErrorResult('command-name', code, message);
    console.log(formatJsonResult(result));
  } else {
    console.error(colors.error(message));
  }
  process.exit(1);
}

// In catch block
try {
  // ...
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = getErrorCodeFromError(error);
  exitWithError(message, code, options.json);
}
```

### Pattern 2: Silent Mode for JSON Output

All verbose logging should check for JSON mode:

```typescript
function progress(options: Options, ...args: unknown[]): void {
  if (!options.json) {
    console.log(...args);
  }
}

// Usage
progress(options, colors.info('Processing...'));
progress(options, colors.success('Done!'));
```

### Pattern 3: Friendly CLI Error Messages

Use yargs `.fail()` handler for user-friendly errors:

```typescript
yargs(hideBin(process.argv)).fail((msg, err) => {
  if (err) {
    console.error(colors.error(err.message));

    // Add contextual suggestions
    if (err.message.includes('specific pattern')) {
      console.error('');
      console.error(colors.dim('Suggestion for this error type'));
    }
  } else {
    console.error(colors.red(msg));
  }
  process.exit(1);
});
```

### Pattern 4: Terminal Width for Help Text

Prevent mid-word wrapping:

```typescript
yargs(hideBin(process.argv)).wrap(Math.min(100, process.stdout.columns ?? 100));
```

---

### Batch 4: UX Polish (Complete)

#### 4.1 cleanpr Empty Result Feedback (UX-007)

**File:** `src/lib/json-output.ts`

Added `message` field to CleanprResultData and CleanprDryRunData interfaces:

```typescript
export interface CleanprResultData {
  cleaned: CleanedWorktreeInfo[];
  skipped: Array<{ prNumber: number; reason: string }>;
  totalCleaned: number;
  totalSkipped: number;
  /** Human-readable summary message */
  message?: string;
}

export interface CleanprDryRunData {
  wouldClean: Array<{ prNumber: number; branch: string; path: string; prState: string }>;
  totalWouldClean: number;
  /** Human-readable summary message */
  message?: string;
}
```

**File:** `src/cli/cleanpr.ts`

Updated `outputJsonResult` to include descriptive messages for all scenarios.

#### 4.2 wtlink Manage Summary Mode (UX-004)

**File:** `src/cli/wtlink.ts`

Added `--verbose` option to manage command:

```typescript
.option('verbose', {
  alias: 'v',
  type: 'boolean',
  description: 'Show full file list in non-interactive/dry-run mode (default: summary)',
  default: false,
})
```

**File:** `src/lib/wtlink/manage-manifest.ts`

Added `groupByTopDirectory` helper and summary mode for large file sets:

```typescript
export function groupByTopDirectory(files: string[]): Map<string, number> {
  const groups = new Map<string, number>();
  for (const file of files) {
    const parts = file.split('/');
    const topDir = parts.length > 1 ? parts[0] : '.';
    groups.set(topDir, (groups.get(topDir) ?? 0) + 1);
  }
  return new Map([...groups.entries()].sort((a, b) => b[1] - a[1]));
}
```

Summary mode activates when file count > 50 and `--verbose` is not set:

```text
[DRY RUN] Summary of changes:
  42 active entries (will be linked)
  385 new entries found (will be added as commented)

Breakdown by directory:
  node_modules/  312 files
  dist/          58 files
  .idea/         15 files

Use --verbose to see full list
```

#### 4.3 Post-Action Suggestions (UX-008)

**File:** `src/cli/newpr.ts`

Enhanced `printSummary` with contextual next steps:

```typescript
console.log(colors.dim('  Next steps:'));
console.log(colors.dim(`    cd ${worktreePath}`));
console.log(colors.dim(`    gh pr view ${prNumber} --web     # Open PR in browser`));
console.log(
  colors.dim(`    wtlink link                     # Link config files from main worktree`)
);
```

**File:** `src/cli/cleanpr.ts`

Added next steps in three places: `interactiveClean`, `cleanAll`, and `cleanSpecific`:

```typescript
if (summary.cleaned > 0) {
  console.log('');
  console.log(colors.dim('Next steps:'));
  console.log(colors.dim('  lswt                        # List remaining worktrees'));
  console.log(colors.dim('  newpr "feature description" # Create a new PR'));
}
```

#### 4.4 Arrow-Key Navigation in Prompts (UX-009)

**File:** `src/lib/prompts.ts`

Added native arrow-key navigation using readline raw mode (no external dependencies):

```typescript
function supportsArrowNavigation(): boolean {
  return process.stdin.isTTY === true;
}

async function promptChoiceArrowKeys(prompt: string, options: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    let selectedIndex = 0;
    // Initial render
    console.log(`${yellow(prompt)}\n`);
    options.forEach((opt, i) => {
      if (i === selectedIndex) {
        console.log(`  ${green('▶')} ${bold(opt)}`);
      } else {
        console.log(`    ${dim(opt)}`);
      }
    });
    console.log(dim('\n  ↑/↓ navigate • Enter select • q quit'));

    // Enable raw mode for keypress events
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') { cleanup(); reject(new Error('User cancelled')); return; }
      if (key.name === 'up') { selectedIndex = ...; renderOptions(...); }
      else if (key.name === 'down') { selectedIndex = ...; renderOptions(...); }
      else if (key.name === 'return') { cleanup(); resolve(selectedIndex + 1); }
      else if (str === 'q' || str === 'Q') { cleanup(); reject(new Error('User cancelled')); }
    };
    // ... cleanup and event binding
  });
}
```

Updated both `promptChoiceIndex` and `promptChoice` to use arrow-key navigation when TTY is available, with automatic fallback to numbered input for non-TTY environments.

---

### Phase 2: Unified Experience (Complete)

#### 2.1 Unified `wt` Command

**Files Created:**

| File                       | Purpose                              |
| -------------------------- | ------------------------------------ |
| `src/cli/wt.ts`            | Main entry point with yargs          |
| `src/cli/wt/new.ts`        | Handler wrapping newpr via spawnSync |
| `src/cli/wt/list.ts`       | Handler wrapping lswt                |
| `src/cli/wt/clean.ts`      | Handler wrapping cleanpr             |
| `src/cli/wt/link.ts`       | Handler wrapping wtlink              |
| `src/cli/wt/state.ts`      | Handler wrapping wtstate             |
| `src/cli/wt/config.ts`     | Handler wrapping wtconfig            |
| `src/cli/wt/completion.ts` | Shell completion script generator    |

**Command Structure:**

```bash
wt new [description]     # Create new PR with worktree (aliases: n)
wt list                  # List worktrees with status (aliases: ls)
wt clean [pr-number]     # Clean up merged/closed worktrees (aliases: c)
wt link [subcommand]     # Manage config file linking (aliases: l)
wt state                 # Query git worktree state (aliases: s)
wt config [subcommand]   # Configuration management (aliases: cfg)
wt completion [shell]    # Generate shell completion scripts
```

**Files Modified:**

| File           | Change                    |
| -------------- | ------------------------- |
| `package.json` | Added `wt` to bin entries |

#### 2.2 Fuzzy Search in lswt

**Files Created:**

| File                                | Purpose                  |
| ----------------------------------- | ------------------------ |
| `src/lib/lswt/fuzzy-search.ts`      | Fuzzy matching algorithm |
| `src/lib/lswt/fuzzy-search.test.ts` | Tests for fuzzy search   |

**Files Modified:**

| File                          | Changes                            |
| ----------------------------- | ---------------------------------- |
| `src/lib/lswt/index.ts`       | Exported fuzzy search functions    |
| `src/lib/lswt/interactive.ts` | Added `/` key to enter search mode |

**Implementation:**

```typescript
// Fuzzy scoring algorithm with bonuses for:
// - Exact substring matches (high score)
// - Consecutive character matches
// - Word boundary matches (after -, _, /)
// - Start of string matches

export function fuzzyScore(pattern: string, text: string): number;
export function filterWorktrees(worktrees: WorktreeDisplay[], pattern: string): FilteredWorktree[];
export function highlightMatches(
  text: string,
  pattern: string,
  highlightFn: (s: string) => string
): string;
```

**Usage:** Press `/` in interactive mode to filter worktrees by branch name, PR number, PR title, or state.

#### 2.3 Shell Completion

**File:** `src/cli/wt/completion.ts`

Generated shell completion scripts for bash, zsh, and fish:

```bash
# Bash installation
wt completion bash >> ~/.bashrc
source ~/.bashrc

# Zsh installation
mkdir -p ~/.zsh/completions
wt completion zsh > ~/.zsh/completions/_wt
# Add to .zshrc: fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit && compinit

# Fish installation
wt completion fish > ~/.config/fish/completions/wt.fish
```

Bash completion uses yargs' built-in `--get-yargs-completions` backend for dynamic completions. Zsh and fish use static scripts with full command/option coverage.

---

## Remaining Work

All planned UX improvements have been implemented. See [Long-Term Roadmap](#long-term-roadmap) for future enhancements.

---

## Long-Term Roadmap

From [UX-IMPROVEMENT-ANALYSIS.md](./UX-IMPROVEMENT-ANALYSIS.md):

### Phase 2: Unified Experience ✅ COMPLETE

See [Phase 2: Unified Experience (Complete)](#phase-2-unified-experience-complete) in Completed Work section above.

### Phase 3: Advanced Features (Medium Priority)

| Item                        | Description                        | Effort |
| --------------------------- | ---------------------------------- | ------ |
| **VS Code extension**       | Worktree sidebar, quick switch     | High   |
| **Recovery mode**           | Resume interrupted operations      | High   |
| **Enhanced MCP server**     | Suggest actions, execute workflows | Medium |
| **Multi-select in cleanpr** | Batch selection with checkboxes    | Medium |

### Phase 4: Polish & Integration (Lower Priority)

| Item                     | Description                            | Effort |
| ------------------------ | -------------------------------------- | ------ |
| **Tutorial mode**        | `--tutorial` flag for first-time users | Medium |
| **Config profiles**      | Switch between configurations          | Medium |
| **Cross-repo worktrees** | Sync worktrees across related repos    | High   |
| **GitHub Action**        | CI/CD integration                      | Medium |

---

## File Reference

### Modified Files (Completed Work)

| File                         | Changes                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/json-output.ts`     | Added suggestion field, getErrorSuggestion(), enhanced getErrorCodeFromError |
| `src/cli/wtconfig.ts`        | Replaced info/warning with plain colors in showHelp()                        |
| `src/lib/newpr/args.ts`      | Added PR number > 0 validation                                               |
| `src/cli/wtlink.ts`          | Enhanced .fail() handler with suggestions, fixed terminal width              |
| `src/cli/lswt.ts`            | Friendly git repo error handling                                             |
| `src/lib/lswt/formatters.ts` | getDisplayPath shows "(current)" instead of "."                              |
| `src/cli/newpr.ts`           | Added progress() helpers, updated all mode functions, getErrorCodeFromError  |
| `src/cli/cleanpr.ts`         | Updated catch block with getErrorCodeFromError                               |

### Test Files Updated

| File                              | Changes                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `src/lib/lswt/formatters.test.ts` | Updated to expect "repo (current)"                       |
| `src/lib/newpr/args.test.ts`      | Updated message expectation to "positive number"         |
| `src/e2e/cli.e2e.test.ts`         | Updated PR validation message                            |
| `src/lib/json-output.test.ts`     | Updated to include suggestion field                      |
| `src/cli/newpr.test.ts`           | Changed mockConsoleError to mockConsoleLog for JSON mode |

### Files Modified (Batch 4)

| File                                | Changes                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| `src/lib/json-output.ts`            | Added message field to CleanprResultData and CleanprDryRunData    |
| `src/lib/wtlink/manage-manifest.ts` | Added groupByTopDirectory(), summary mode for large file sets     |
| `src/lib/wtlink/main-menu.ts`       | Added verbose: false to ManageArgv call                           |
| `src/cli/cleanpr.ts`                | Added message to JSON output, post-action suggestions in 3 places |
| `src/cli/newpr.ts`                  | Enhanced printSummary with next steps                             |
| `src/cli/wtlink.ts`                 | Added --verbose option to manage command                          |
| `src/lib/prompts.ts`                | Added arrow-key navigation for promptChoiceIndex and promptChoice |

---

## Testing Checklist

### Completed Verifications

- [x] `newpr --pr 0 --json` returns INVALID_ARGUMENT error with "positive number" message
- [x] `newpr "test" --json` from /tmp returns NOT_GIT_REPO code (not UNKNOWN_ERROR)
- [x] `lswt` shows "(current)" instead of "." for current worktree
- [x] `wtconfig --help` has no [INFO] or [WARN] prefixes
- [x] JSON error responses include `suggestion` field
- [x] All 1711 tests pass

### Pending Verifications (Updated 2026-01-04)

- [ ] `wtlink link` shows friendly error (not stack trace) with single worktree **(UX-001 CONFIRMED - still shows stack trace)**
- [x] `lswt` from /tmp shows "Not a git repository" (not raw git error)
- [x] `newpr "test" --json` outputs only JSON (no [INFO] text mixed in) **(UX-012 FIXED)**
- [x] `wtlink manage -n -d` with many files shows summary (not 400+ lines) **(UX-004 FIXED)**
- [ ] `wtlink --help` text doesn't wrap mid-word **(UX-005 CONFIRMED - still wraps)**
- [x] `cleanpr --all` with no worktrees shows friendly message **(UX-007 FIXED)**
- [x] `newpr` success shows "Next steps:" suggestions **(UX-008 FIXED)**
- [x] `cleanpr` success shows "Next steps:" suggestions **(UX-008 FIXED)**
- [x] `newpr`/`cleanpr` prompts use arrow-key navigation (when TTY available) **(UX-009 FIXED)**
- [ ] `lswt --json` shows JSON error (not [ERROR] text) when not in repo **(UX-010 CONFIRMED - still shows text)**

### Comprehensive Test Session (2026-01-04)

**Test Environment:** GitHub repo `wt-cli-test-*` with PRs in OPEN/MERGED/CLOSED states

| Category         | Tests  | Pass   | Issues                 |
| ---------------- | ------ | ------ | ---------------------- |
| lswt             | 7      | 6      | UX-010                 |
| wtstate          | 5      | 5      | -                      |
| wtconfig         | 2      | 2      | -                      |
| wtlink           | 5      | 2      | UX-001, UX-005, UX-015 |
| cleanpr          | 3      | 3      | -                      |
| newpr            | 5      | 4      | UX-014                 |
| JSON/Exit        | 6      | 6      | -                      |
| Performance      | 2      | 2      | -                      |
| Input validation | 4      | 3      | UX-014                 |
| **Total**        | **46** | **41** | **5 remaining**        |

**New Issues Found:**

- UX-014: Float PR numbers (1.5) are truncated to integers instead of rejected
- UX-015: wtlink validate shows stack trace when no manifest exists

**Remaining Open Issues (5):**

| ID     | Severity | Tool   | Issue                                    |
| ------ | -------- | ------ | ---------------------------------------- |
| UX-001 | P1       | wtlink | Stack trace on single worktree           |
| UX-005 | P2       | wtlink | Help text wraps mid-word                 |
| UX-010 | P1       | lswt   | --json shows [ERROR] text not JSON       |
| UX-014 | P2       | newpr  | Float PR numbers truncated               |
| UX-015 | P1       | wtlink | validate shows stack trace (no manifest) |

**See:** [UX-TESTING-PLAN.md](./UX-TESTING-PLAN.md) for full test details

---

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/lib/json-output.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Related Documentation

- [UX-IMPROVEMENT-ANALYSIS.md](./UX-IMPROVEMENT-ANALYSIS.md) - Comprehensive UX analysis with detailed recommendations
- [UX-REAL-WORLD-TESTING.md](./UX-REAL-WORLD-TESTING.md) - Actual CLI output captures and issues
- [UX-ACTION-PLAN.md](./UX-ACTION-PLAN.md) - Original implementation plan (see plan file)
- [CLAUDE.md](../CLAUDE.md) - Project context and development guide

---

_This document should be updated as implementation progresses._
