# CLI/TUI Consolidation - Implementation Specification

**Status**: 📝 Draft
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: Cross-platform (Windows, macOS, Linux)

---

## Executive Summary

This document specifies the consolidation of the fragmented TUI/CLI menu systems in git-worktree-tools into a unified, consistent user experience. Currently, the codebase uses three different approaches to interactive prompts: a custom `prompts.ts` library, raw TTY handling with Preact Signals in `manage-manifest.ts`, and `inquirer` for various prompts. This creates an inconsistent UX with different navigation patterns, visual styles, and capabilities across tools.

The proposed solution extracts the sophisticated patterns from `manage-manifest.ts` into a reusable `src/lib/tui/` framework that provides: reactive state management, Vim command mode across all tools, consistent keyboard navigation, graceful non-TTY degradation, and a unified visual design language. The underlying CLI commands remain modular whilst sharing this common TUI infrastructure.

This refactor enables multiple menu routes to converge on the same intent-handling code paths, eliminating duplication whilst preserving the flexibility for different entry points to the same functionality.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Detailed Design](#2-detailed-design)
3. [Execution Flow](#3-execution-flow)
4. [Edge Cases & Mitigations](#4-edge-cases--mitigations)
5. [Testing Strategy](#5-testing-strategy)
6. [Implementation Checklist](#6-implementation-checklist)
7. [Open Questions](#7-open-questions)
8. [References](#8-references)

---

## 1. High-Level Architecture

### 1.1 Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLI Entry Points                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │  newpr  │ │ cleanpr │ │  lswt   │ │ wtlink  │ │   prs   │ │  wt   │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └───┬───┘ │
│       │           │           │           │           │           │     │
│       └───────────┴───────────┼───────────┴───────────┴───────────┘     │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                        src/lib/tui/                                 ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ││
│  │  │   core.ts  │  │  views.ts  │  │ vim-mode.ts│  │ navigation.ts│  ││
│  │  │            │  │            │  │            │  │              │  ││
│  │  │ - AppState │  │ - ListView │  │ - :w :q :x │  │ - j/k arrows │  ││
│  │  │ - Signals  │  │ - TreeView │  │ - :wq :q!  │  │ - / search   │  ││
│  │  │ - Render   │  │ - MenuView │  │ - :help    │  │ - esc/← back │  ││
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────────────┐││
│  │  │ prompts.ts │  │ spinner.ts │  │           styles.ts            │││
│  │  │            │  │            │  │                                │││
│  │  │ - confirm  │  │ - withSpin │  │ - Box drawing chars            │││
│  │  │ - input    │  │ - progress │  │ - Colour semantics             │││
│  │  │ - choice   │  │            │  │ - Badge formatting             │││
│  │  └────────────┘  └────────────┘  └────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    Core Business Logic                              ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────┐││
│  │  │  git.ts   │  │ github.ts │  │ config.ts │  │ state-detection.ts│││
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| Component           | Purpose                                                   | Source Extraction                            |
| ------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `tui/core.ts`       | Reactive state management, render loop, keypress handling | `manage-manifest.ts` signals pattern         |
| `tui/views.ts`      | Reusable view components (list, tree, menu)               | `manage-manifest.ts` + `lswt/interactive.ts` |
| `tui/vim-mode.ts`   | Vim command mode parser and actions                       | `manage-manifest.ts` executeVimCommand       |
| `tui/navigation.ts` | Unified keyboard navigation handler                       | `prompts.ts` + `manage-manifest.ts`          |
| `tui/prompts.ts`    | Simple prompts (confirm, input, choice)                   | Existing `prompts.ts` enhanced               |
| `tui/spinner.ts`    | Async operation spinner                                   | Existing `withSpinner` from `prompts.ts`     |
| `tui/styles.ts`     | Unified colour semantics and box drawing                  | Consolidate from all tools                   |

### 1.3 Dependencies

**External:**

- `@preact/signals-core` - Reactive state (already used in manage-manifest.ts)
- `inquirer` - Kept for edge cases (complex multi-select, autocomplete)

**Internal:**

- `src/lib/colors.ts` - ANSI colour functions (unchanged)
- `src/lib/git.ts` - Git operations (unchanged)
- `src/lib/config.ts` - Configuration loading (unchanged)

### 1.4 Integration Points

The TUI framework integrates at three levels:

1. **CLI Entry Points** - Each CLI tool imports TUI components for its interactive flows
2. **Intent Handlers** - Shared business logic that both CLI and API can invoke
3. **Output Formatters** - JSON/table/interactive output modes share formatting code

---

## 2. Detailed Design

### 2.1 Data Structures

```typescript
// ============================================================================
// tui/core.ts - Core Types
// ============================================================================

/** Base state interface that all TUI views extend */
export interface TuiState {
  readonly mode: 'normal' | 'command' | 'search' | 'confirm';
  readonly cursorIndex: number;
  readonly scrollOffset: number;
  readonly commandBuffer: string;
  readonly searchPattern: string;
  readonly isDirty: boolean;
  readonly showHelp: boolean;
}

/** Result from TUI session */
export interface TuiResult<T> {
  readonly action: 'submit' | 'cancel' | 'back' | 'quit';
  readonly data: T | null;
  readonly dirty: boolean;
}

/** Keyboard event abstraction */
export interface KeyEvent {
  readonly key: string;
  readonly name?: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

/** Renderer function signature */
export type RenderFn<S extends TuiState> = (state: S, items: DisplayItem[]) => void;

/** Item displayed in any list/tree view */
export interface DisplayItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly badge?: Badge;
  readonly indent?: number;
  readonly isDirectory?: boolean;
  readonly isDisabled?: boolean;
  readonly shortcut?: string;
  readonly metadata?: Record<string, unknown>;
}

/** Badge styling */
export interface Badge {
  readonly text: string;
  readonly colour: 'green' | 'yellow' | 'red' | 'blue' | 'cyan' | 'dim';
}

// ============================================================================
// tui/vim-mode.ts - Vim Command Types
// ============================================================================

export type VimCommand =
  | { type: 'save' }
  | { type: 'quit' }
  | { type: 'save-quit' }
  | { type: 'force-quit' }
  | { type: 'help' }
  | { type: 'unknown'; command: string };

// ============================================================================
// tui/views.ts - View Configuration Types
// ============================================================================

/** Configuration for ListView */
export interface ListViewConfig<T> {
  readonly title: string;
  readonly items: readonly T[];
  readonly getDisplayItem: (item: T, index: number) => DisplayItem;
  readonly onSelect?: (item: T) => Promise<void>;
  readonly onShortcut?: (key: string, item: T) => Promise<boolean>;
  readonly shortcuts?: ShortcutConfig[];
  readonly enableSearch?: boolean;
  readonly enableVimMode?: boolean;
  readonly showHelp?: HelpConfig;
}

/** Configuration for TreeView (hierarchical navigation) */
export interface TreeViewConfig<T> extends ListViewConfig<T> {
  readonly getChildren: (item: T) => readonly T[];
  readonly isExpandable: (item: T) => boolean;
}

/** Configuration for MenuView (simple choice menus) */
export interface MenuViewConfig {
  readonly title: string;
  readonly options: MenuOption[];
  readonly enableVimMode?: boolean;
}

export interface MenuOption {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly shortcut?: string;
  readonly disabled?: boolean | string;
}

export interface ShortcutConfig {
  readonly key: string;
  readonly label: string;
  readonly action: string;
}

export interface HelpConfig {
  readonly sections: HelpSection[];
}

export interface HelpSection {
  readonly title: string;
  readonly items: { key: string; description: string }[];
}
```

### 2.2 API Design

```typescript
// ============================================================================
// tui/core.ts - Core API
// ============================================================================

import { signal, computed, Signal, ReadonlySignal } from '@preact/signals-core';

/**
 * Create a TUI application with reactive state
 */
export function createTuiApp<S extends TuiState, R>(config: {
  initialState: S;
  render: RenderFn<S>;
  handleKey: (state: S, key: KeyEvent) => S;
  getResult: (state: S) => TuiResult<R> | null;
}): TuiApp<S, R>;

export interface TuiApp<S extends TuiState, R> {
  run(): Promise<TuiResult<R>>;
  getState(): ReadonlySignal<S>;
  updateState(fn: (state: S) => S): void;
}

/**
 * Check if running in TTY mode
 */
export function isTTY(): boolean;

/**
 * Graceful degradation wrapper - runs TUI in TTY, fallback otherwise
 */
export function withTuiFallback<T>(
  tuiFn: () => Promise<T>,
  fallbackFn: () => Promise<T>
): Promise<T>;

// ============================================================================
// tui/views.ts - View API
// ============================================================================

/**
 * Display a list view with keyboard navigation
 */
export function listView<T>(config: ListViewConfig<T>): Promise<TuiResult<T>>;

/**
 * Display a hierarchical tree view
 */
export function treeView<T>(config: TreeViewConfig<T>): Promise<TuiResult<T>>;

/**
 * Display a simple menu
 */
export function menuView(config: MenuViewConfig): Promise<TuiResult<string>>;

// ============================================================================
// tui/prompts.ts - Simple Prompts API
// ============================================================================

/**
 * Confirm yes/no prompt
 */
export function confirm(message: string, defaultValue?: boolean): Promise<boolean>;

/**
 * Text input prompt
 */
export function input(message: string, defaultValue?: string): Promise<string>;

/**
 * Single choice prompt (upgraded from existing promptChoice)
 */
export function choice<T>(
  message: string,
  options: ChoiceOption<T>[],
  config?: { enableVimMode?: boolean }
): Promise<T>;

/**
 * Multi-choice prompt (delegates to inquirer)
 */
export function multiChoice<T>(message: string, options: ChoiceOption<T>[]): Promise<T[]>;

// ============================================================================
// tui/vim-mode.ts - Vim Mode API
// ============================================================================

/**
 * Parse a vim command string
 */
export function parseVimCommand(input: string): VimCommand;

/**
 * Create vim mode keypress handler
 */
export function createVimModeHandler<S extends TuiState>(
  onCommand: (state: S, cmd: VimCommand) => S | Promise<S>
): (state: S, key: KeyEvent) => S;

// ============================================================================
// tui/navigation.ts - Navigation API
// ============================================================================

/**
 * Create unified navigation handler
 */
export function createNavigationHandler<S extends TuiState>(config: {
  getItemCount: (state: S) => number;
  onSelect?: (state: S) => S;
  onBack?: (state: S) => S | null;
  onSearch?: (state: S, pattern: string) => S;
}): (state: S, key: KeyEvent) => S;

// ============================================================================
// tui/styles.ts - Styling API
// ============================================================================

/**
 * Render a header box
 */
export function renderHeader(title: string, width?: number): string[];

/**
 * Render a status bar
 */
export function renderStatusBar(parts: StatusPart[]): string;

/**
 * Format a badge with consistent styling
 */
export function formatBadge(badge: Badge, width?: number): string;

/**
 * Standard colour semantics
 */
export const colours = {
  success: (s: string) => green(s),
  warning: (s: string) => yellow(s),
  error: (s: string) => red(s),
  info: (s: string) => cyan(s),
  muted: (s: string) => dim(s),
  accent: (s: string) => blue(s),
} as const;
```

### 2.3 State Management

The TUI framework uses Preact Signals for reactive state management:

```typescript
// Example: How a tool would use the TUI framework

import { signal, computed } from '@preact/signals-core';
import { createTuiApp, listView, createNavigationHandler, createVimModeHandler } from '../lib/tui';

// Define tool-specific state extending TuiState
interface CleanprState extends TuiState {
  readonly worktrees: WorktreeInfo[];
  readonly selectedIds: Set<string>;
  readonly deleteRemote: boolean;
}

// Create the app
const app = createTuiApp<CleanprState, CleanprResult>({
  initialState: {
    mode: 'normal',
    cursorIndex: 0,
    scrollOffset: 0,
    commandBuffer: '',
    searchPattern: '',
    isDirty: false,
    showHelp: false,
    worktrees: initialWorktrees,
    selectedIds: new Set(),
    deleteRemote: false,
  },

  render: (state, items) => {
    // Render uses unified styles
    console.clear();
    renderHeader('Clean PR Worktrees').forEach((line) => console.log(line));
    renderList(state, items);
    renderFooter(state);
  },

  handleKey: (state, key) => {
    // Compose handlers for different modes
    if (state.mode === 'command') {
      return vimHandler(state, key);
    }
    return navHandler(state, key);
  },

  getResult: (state) => {
    if (state.mode === 'quit') {
      return { action: 'submit', data: { selectedIds: state.selectedIds }, dirty: false };
    }
    return null;
  },
});

// Run and get result
const result = await app.run();
```

### 2.4 Design Patterns Applied

1. **Reactive State (Signals)** - All mutable state flows through signals, enabling automatic UI updates and computed derivations without manual subscriptions.

2. **Composition over Inheritance** - Views compose navigation handlers, vim mode handlers, and render functions rather than inheriting from base classes.

3. **Dependency Injection** - All external dependencies (stdin, stdout, git operations) are injectable for testing.

4. **Strategy Pattern** - Different fallback behaviours for TTY vs non-TTY environments.

5. **Command Pattern** - Vim commands parsed into typed command objects for consistent handling.

6. **Factory Pattern** - `createTuiApp`, `createNavigationHandler` provide configured instances.

---

## 3. Execution Flow

### 3.1 Happy Path - Interactive Session

```
User runs `lswt`
       │
       ▼
┌──────────────────────────────────────┐
│ 1. CLI Entry Point (lswt.ts)         │
│    - Parse args                      │
│    - Check TTY mode                  │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 2. TTY Check                         │
│    - isTTY() returns true            │
│    - Proceed to interactive mode     │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 3. Gather Data                       │
│    - gatherWorktreeInfo()            │
│    - Returns WorktreeDisplay[]       │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 4. Create TUI App                    │
│    - Initialize state with signals   │
│    - Set up render function          │
│    - Compose key handlers            │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 5. Enter Event Loop                  │
│    - Enable raw mode                 │
│    - Initial render                  │
│    - Listen for keypress events      │
└──────────────────┬───────────────────┘
                   │
       ┌───────────┴───────────┐
       │ User presses key      │
       └───────────┬───────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 6. Handle Keypress                   │
│    - Check mode (normal/command/     │
│      search/confirm)                 │
│    - Route to appropriate handler    │
│    - Update state immutably          │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 7. Re-render                         │
│    - Signals trigger computed update │
│    - Render function called          │
│    - ANSI escape codes redraw screen │
└──────────────────┬───────────────────┘
                   │
       (Loop back to step 5 until exit)
                   │
                   ▼
┌──────────────────────────────────────┐
│ 8. Exit                              │
│    - Cleanup (restore terminal)      │
│    - Return TuiResult to caller      │
│    - Execute selected action         │
└──────────────────────────────────────┘
```

### 3.2 Alternative Flows

#### Non-TTY Fallback Flow

```
User runs `lswt` in CI/pipe
       │
       ▼
┌──────────────────────────────────────┐
│ 1. CLI Entry Point                   │
│    - Parse args                      │
│    - isTTY() returns false           │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 2. Graceful Degradation              │
│    - withTuiFallback() routes to     │
│      non-interactive handler         │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 3. Non-Interactive Output            │
│    - Print table format              │
│    - Or JSON if --json flag          │
│    - Exit immediately                │
└──────────────────────────────────────┘
```

#### Vim Command Mode Flow

```
User presses `:` (colon)
       │
       ▼
┌──────────────────────────────────────┐
│ 1. Enter Command Mode                │
│    - state.mode = 'command'          │
│    - Render command line at bottom   │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 2. Accumulate Input                  │
│    - Each keypress appends to        │
│      state.commandBuffer             │
│    - ESC cancels, returns to normal  │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 3. Execute on Enter                  │
│    - parseVimCommand(buffer)         │
│    - Handle: :w :q :wq :x :q! :help  │
│    - Unknown shows error briefly     │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 4. Return to Normal or Exit          │
│    - :q/:wq/:q! exit the TUI         │
│    - :w/:help return to normal mode  │
└──────────────────────────────────────┘
```

### 3.3 Sequence Diagram - Menu Navigation

```
┌─────┐          ┌───────┐          ┌─────────┐          ┌────────┐
│User │          │ stdin │          │ TuiApp  │          │Renderer│
└──┬──┘          └───┬───┘          └────┬────┘          └───┬────┘
   │                 │                   │                   │
   │ Press 'j'       │                   │                   │
   │────────────────>│                   │                   │
   │                 │ keypress event    │                   │
   │                 │──────────────────>│                   │
   │                 │                   │ handleKey()       │
   │                 │                   │──────┐            │
   │                 │                   │      │ cursorIndex++
   │                 │                   │<─────┘            │
   │                 │                   │ signal update     │
   │                 │                   │──────────────────>│
   │                 │                   │                   │ render()
   │                 │                   │                   │──────┐
   │                 │                   │                   │      │
   │<────────────────────────────────────────────────────────│<─────┘
   │                 │                   │                   │
   │ Press Enter     │                   │                   │
   │────────────────>│                   │                   │
   │                 │ keypress event    │                   │
   │                 │──────────────────>│                   │
   │                 │                   │ handleKey()       │
   │                 │                   │──────┐            │
   │                 │                   │      │ onSelect()
   │                 │                   │<─────┘            │
   │                 │                   │ cleanup()         │
   │                 │                   │──────┐            │
   │                 │                   │<─────┘            │
   │                 │  TuiResult        │                   │
   │<────────────────────────────────────│                   │
   │                 │                   │                   │
```

---

## 4. Edge Cases & Mitigations

| #   | Edge Case / Failure Mode              | Impact                                      | Mitigation Strategy                                               |
| --- | ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Terminal resized during TUI session   | Layout breaks, display corrupted            | Listen for SIGWINCH, recalculate dimensions, full re-render       |
| 2   | stdin not a TTY (piped input)         | Raw mode fails, keypress events unavailable | `isTTY()` check routes to fallback; numbered input or JSON output |
| 3   | User presses Ctrl+C during operation  | Terminal left in raw mode                   | Signal handler registered in cleanup; `process.on('SIGINT')`      |
| 4   | Very long lists (1000+ items)         | Rendering becomes slow                      | Virtual scrolling - only render visible items with scroll offset  |
| 5   | Deep navigation stack exhausts memory | Stack overflow in recursive views           | Iterative approach with explicit stack; limit max depth           |
| 6   | Vim command with typo (e.g., `:wqq`)  | Unexpected behaviour                        | Parse returns `{ type: 'unknown' }`, show error message briefly   |
| 7   | Search pattern matches nothing        | Empty list confusing                        | Show "No matches" message; press ESC to clear search              |
| 8   | User expects different vim commands   | `:set`, `:e`, etc. not supported            | Help text shows supported commands; unknown commands show hint    |
| 9   | Terminal doesn't support ANSI colours | Output looks garbled                        | Detect via `process.env.NO_COLOR` or `TERM=dumb`; strip colours   |
| 10  | State becomes inconsistent            | UI doesn't match data                       | Immutable state updates; signals ensure consistency               |
| 11  | Git operation fails mid-action        | Partial state update                        | Transaction-like approach: prepare changes, apply atomically      |
| 12  | inquirer prompt interrupted           | Process exits uncleanly                     | Wrap inquirer calls in try/catch; handle cancellation             |
| 13  | Multiple TUI sessions nested          | stdin conflicts                             | Prevent nesting; queue operations or error clearly                |
| 14  | Windows terminal (cmd.exe)            | Limited ANSI support                        | Detect Windows; use `supports-color` package; graceful fallback   |
| 15  | SSH session with latency              | Keystroke buffering issues                  | Debounce rapid keypresses; don't assume instant response          |

### 4.1 Detailed Mitigation Analysis

#### Terminal Resize Handling

```typescript
// Register resize handler in TUI app initialisation
process.stdout.on('resize', () => {
  const { rows, columns } = process.stdout;
  updateState((state) => ({
    ...state,
    terminalRows: rows,
    terminalColumns: columns,
    scrollOffset: clampScrollOffset(state.scrollOffset, state.items.length, rows),
  }));
  render();
});
```

#### Graceful TTY Degradation

```typescript
export async function withTuiFallback<T>(
  tuiFn: () => Promise<T>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  if (!process.stdin.isTTY || process.env.CI || process.env.NO_TTY) {
    return fallbackFn();
  }

  try {
    return await tuiFn();
  } catch (error) {
    if (error instanceof TtyNotSupportedError) {
      return fallbackFn();
    }
    throw error;
  }
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

**tui/core.ts:**

- [ ] `isTTY()` returns correct value based on stdin.isTTY
- [ ] `createTuiApp()` initialises state correctly
- [ ] State updates are immutable
- [ ] Computed signals recalculate when dependencies change

**tui/vim-mode.ts:**

- [ ] `parseVimCommand(':w')` returns `{ type: 'save' }`
- [ ] `parseVimCommand(':q')` returns `{ type: 'quit' }`
- [ ] `parseVimCommand(':wq')` returns `{ type: 'save-quit' }`
- [ ] `parseVimCommand(':x')` returns `{ type: 'save-quit' }`
- [ ] `parseVimCommand(':q!')` returns `{ type: 'force-quit' }`
- [ ] `parseVimCommand(':help')` returns `{ type: 'help' }`
- [ ] `parseVimCommand(':unknown')` returns `{ type: 'unknown', command: 'unknown' }`
- [ ] `parseVimCommand('')` returns `{ type: 'unknown', command: '' }`
- [ ] `parseVimCommand(':W')` (uppercase) handles case-insensitively

**tui/navigation.ts:**

- [ ] `j` and `down` increment cursorIndex
- [ ] `k` and `up` decrement cursorIndex
- [ ] Cursor clamps to valid range (0 to length-1)
- [ ] `enter` and `right` trigger onSelect
- [ ] `esc` and `left` trigger onBack
- [ ] `/` enters search mode
- [ ] Search mode filters items correctly
- [ ] `q` sets mode to quit

**tui/prompts.ts:**

- [ ] `confirm()` returns true for 'y', 'Y', 'yes'
- [ ] `confirm()` returns false for 'n', 'N', 'no'
- [ ] `confirm()` returns defaultValue for empty input
- [ ] `input()` returns trimmed user input
- [ ] `input()` returns defaultValue for empty input
- [ ] `choice()` returns selected option value
- [ ] All prompts throw on Ctrl+C

**tui/styles.ts:**

- [ ] `renderHeader()` produces correct box drawing chars
- [ ] `formatBadge()` pads to specified width
- [ ] Colour functions apply correct ANSI codes
- [ ] `colours.success/warning/error/info/muted/accent` map correctly

### 5.2 Integration Tests

- [ ] Full interactive session flow with mocked stdin/stdout
- [ ] Vim command mode enter → type → execute cycle
- [ ] Search mode enter → type → filter → select cycle
- [ ] Back navigation through menu hierarchy
- [ ] Save/quit with unsaved changes confirmation

### 5.3 End-to-End Tests

- [ ] `lswt` displays worktree list in interactive mode
- [ ] `lswt --no-interactive` outputs table format
- [ ] `cleanpr` interactive selection and confirmation
- [ ] `wtlink` manage mode with file selection
- [ ] Vim `:q` exits cleanly from all tools
- [ ] Non-TTY environment falls back correctly

### 5.4 Manual Verification Steps

```bash
# Step 1: Verify TTY detection
echo "Testing TTY detection..."
node -e "console.log(process.stdin.isTTY ? 'TTY' : 'Not TTY')"

# Step 2: Test interactive mode
npm run build && ./dist/cli/lswt.js

# Step 3: Test vim mode
# Press ':' then 'q' then Enter - should exit

# Step 4: Test search mode
# Press '/' then type search term - list should filter

# Step 5: Test non-TTY fallback
echo "" | ./dist/cli/lswt.js --no-interactive

# Step 6: Test JSON output
./dist/cli/lswt.js --json | jq .

# Step 7: Test keyboard navigation
# j/k should move cursor, Enter should select
```

---

## 6. Implementation Checklist

### Phase 1: Core TUI Framework

- [ ] Create `src/lib/tui/` directory structure
- [ ] Implement `tui/core.ts` with signal-based state management
- [ ] Implement `tui/vim-mode.ts` - extract and generalise from manage-manifest.ts
- [ ] Implement `tui/navigation.ts` - unified key handling
- [ ] Implement `tui/styles.ts` - consolidated styling utilities
- [ ] Write unit tests for all core modules (target: 90% coverage)

### Phase 2: View Components

- [ ] Implement `tui/views.ts` with ListView component
- [ ] Add TreeView component (for hierarchical navigation)
- [ ] Add MenuView component (for simple menus)
- [ ] Implement graceful TTY fallback wrapper
- [ ] Write tests for view components

### Phase 3: Migrate Existing Code

- [ ] Refactor `prompts.ts` to use new TUI core
- [ ] Migrate `lswt/interactive.ts` to use TUI framework
- [ ] Migrate `wtlink/manage-manifest.ts` to use TUI framework
- [ ] Migrate `wtlink/main-menu.ts` to use TUI framework
- [ ] Migrate `wtlink/link-configs.ts` prompts to use TUI framework
- [ ] Update `cleanpr.ts` interactive mode
- [ ] Update `newpr.ts` scenario selection
- [ ] Update `prs.ts` interactive mode

### Phase 4: Consolidate Duplicate Logic

- [ ] Identify duplicate intent handlers across CLI/API
- [ ] Extract shared core logic into intent handlers
- [ ] Ensure multiple menu routes converge to same code path
- [ ] Remove duplicate code, update imports

### Phase 5: Polish and Documentation

- [ ] Standardise help text across all tools
- [ ] Ensure consistent colour semantics everywhere
- [ ] Update README with new keyboard shortcuts
- [ ] Add inline documentation for TUI framework
- [ ] Final test pass on all platforms (Windows, macOS, Linux)

---

## 7. Open Questions

1. **Help system**: Should `:help` open a full-screen help view, or show inline hints at the bottom? The current manage-manifest uses `?` for help toggle - should both `:help` and `?` work? both should work and also give option to open full help view.

2. **Search scope**: In `lswt`, search currently filters by branch name. Should it also search PR titles, paths, or be configurable? branch name and PR titles only.

3. **Undo support**: Should we implement `:u` for undo? This would require maintaining a state history stack. Not unless it makes sense in the specific context.

4. **Custom key bindings**: Should users be able to configure key bindings via `.worktreerc`? This adds complexity but increases flexibility. not yet for MVP. (Potential future enhancement.)

5. **Animation/transitions**: Should menu transitions be animated (e.g., fade between screens)? This could improve UX but may introduce complexity. Not for MVP. (Potential future enhancement.)

6. **Accessibility**: Should we support screen readers? This would require careful ARIA-like announcements and potentially an entirely different interaction mode. Not for MVP.

---

## 8. References

- [Preact Signals Documentation](https://preactjs.com/guide/v10/signals/)
- [Node.js readline module](https://nodejs.org/api/readline.html)
- [ANSI escape codes reference](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js)
- Existing implementation: [manage-manifest.ts](../src/lib/wtlink/manage-manifest.ts)
- Existing implementation: [prompts.ts](../src/lib/prompts.ts)
- Existing implementation: [lswt/interactive.ts](../src/lib/lswt/interactive.ts)

---

**Document End**

_This document must be reviewed and approved before implementation begins._
