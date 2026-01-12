/**
 * PR browser interactive mode - keyboard-driven UI for PR selection
 */

import * as colors from '../colors.js';
import type {
  PrDisplayItem,
  PrFilterState,
  PrAction,
  PrSelectionResult,
  PrActionResult,
} from './types.js';
import { createDefaultFilterState } from './types.js';
import { setExclusiveState, setAllStates, cycleDraftFilter, type PrState } from './filters.js';
import { applyFilters } from './data.js';
import {
  formatPrListItem,
  formatPrListHeader,
  formatPrSummary,
  formatFilterIndicator,
  computeMaxPrBadgeWidth,
  formatPrColumnHeader,
  formatPrColumnSeparator,
} from './formatters.js';
import { executePrAction, createDefaultActionDeps } from './actions.js';
import { showPrDetail, createDefaultDetailDeps } from './details.js';

/** Map shortcut keys to actions (for PR-specific actions) */
const SHORTCUT_MAP: Record<string, PrAction> = {
  w: 'create_worktree',
  b: 'open_browser',
  e: 'open_editor',
  t: 'open_terminal',
  c: 'copy_url',
  n: 'copy_number',
  r: 'refresh',
  q: 'exit',
};

/** Filter keys - exclusive state selection */
const FILTER_STATE_KEYS: Record<string, PrAction> = {
  o: 'filter_show_open', // Show OPEN only
  m: 'filter_show_merged', // Show MERGED only
  x: 'filter_show_closed', // Show CLOSED only
  a: 'filter_show_all', // Show all states
  d: 'filter_toggle_drafts', // Cycle draft filter
};

/**
 * Get the action for a shortcut key, handling PR-specific rules.
 * Returns null if the shortcut is not valid for this PR.
 */
export function getActionForShortcut(shortcutKey: string, pr: PrDisplayItem): PrAction | null {
  if (!(shortcutKey in SHORTCUT_MAP)) {
    return null;
  }

  const action = SHORTCUT_MAP[shortcutKey];

  // 'e' (open editor) and 't' (open terminal) only work if PR has worktree
  if ((shortcutKey === 'e' || shortcutKey === 't') && !pr.hasWorktree) {
    return null;
  }

  // 'w' changes meaning based on worktree status
  if (shortcutKey === 'w') {
    return pr.hasWorktree ? 'open_worktree' : 'create_worktree';
  }

  return action;
}

/** Dependencies for interactive PR browser (injectable for testing) */
export interface PrInteractiveDeps {
  selectPr: (prs: PrDisplayItem[], filterState: PrFilterState) => Promise<PrSelectionResult>;
  pressEnterToContinue: () => Promise<void>;
  /** Show PR detail view and return action to perform */
  showDetails: (pr: PrDisplayItem) => Promise<PrAction>;
  /** Execute a PR action */
  executeAction: (action: PrAction, pr: PrDisplayItem) => Promise<PrActionResult>;
  /** Callback to refresh PR list (returns new PR list) */
  refreshPrs?: () => Promise<PrDisplayItem[]>;
}

/**
 * Create default interactive dependencies using raw keyboard input
 */
export function createDefaultPrInteractiveDeps(): PrInteractiveDeps {
  return {
    selectPr: selectPrWithShortcuts,
    pressEnterToContinue: pressEnterToContinue,
    showDetails: (pr) => showPrDetail(pr, createDefaultDetailDeps()),
    executeAction: (action, pr) => executePrAction(action, pr, createDefaultActionDeps()),
  };
}

/**
 * Wait for user to press Enter
 */
async function pressEnterToContinue(): Promise<void> {
  if (!process.stdin.isTTY) return;

  return new Promise((resolve) => {
    console.log(colors.dim('\nPress Enter to continue...'));

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (key: Buffer) => {
      const char = key.toString();
      // Enter or Ctrl+C
      if (char === '\r' || char === '\n' || char === '\x03') {
        process.stdin.setRawMode(wasRaw ?? false);
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        resolve();
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * Format PR choice for display in the list
 */
export function formatPrChoice(
  pr: PrDisplayItem,
  badgeWidth: number,
  isSelected: boolean,
  previewLabel: string,
  searchPattern?: string
): string {
  const prefix = isSelected ? colors.cyan('❯ ') : '  ';
  const line = formatPrListItem(pr, badgeWidth, previewLabel, searchPattern);
  return `${prefix}${isSelected ? colors.bold(line) : line}`;
}

/**
 * Apply search filter to PRs
 */
export function filterPrsBySearch(
  prs: PrDisplayItem[],
  searchPattern: string
): { pr: PrDisplayItem; originalIndex: number }[] {
  if (!searchPattern || searchPattern.length === 0) {
    return prs.map((pr, i) => ({ pr, originalIndex: i }));
  }

  const pattern = searchPattern.toLowerCase();
  return prs
    .map((pr, i) => ({ pr, originalIndex: i }))
    .filter(({ pr }) => {
      const searchable = `#${pr.number} ${pr.title} @${pr.author} ${pr.headBranch}`.toLowerCase();
      return searchable.includes(pattern);
    });
}

/**
 * Select a PR from the list with keyboard shortcuts
 * Arrow keys to navigate, Enter to select, or press a shortcut key
 * Press '/' to enter search mode
 *
 * This function uses raw stdin keypress handling and is intentionally
 * excluded from coverage. The logic is tested via dependency injection.
 */
/* c8 ignore start */
async function selectPrWithShortcuts(
  prs: PrDisplayItem[],
  filterState: PrFilterState
): Promise<PrSelectionResult> {
  // Guard: if stdin is not a TTY, we can't do interactive selection
  if (!process.stdin.isTTY) {
    return { pr: prs[0] ?? null, action: null };
  }

  return new Promise((resolve) => {
    // Start with Exit selected if no PRs
    let selectedIndex = prs.length === 0 ? 0 : 0;
    let firstRender = true;
    let searchMode = false;
    let searchPattern = '';
    let filteredPrs = prs;
    let filteredIndices: number[] = prs.map((_, i) => i);
    let previousTotalLines = prs.length + 2;

    // Compute badge width once for consistent alignment
    const badgeWidth = computeMaxPrBadgeWidth(prs);

    // Update filtered list based on search pattern
    const updateFiltered = () => {
      const results = filterPrsBySearch(prs, searchPattern);
      filteredPrs = results.map((r) => r.pr);
      filteredIndices = results.map((r) => r.originalIndex);
      // Clamp selected index to valid range
      if (selectedIndex >= filteredPrs.length) {
        selectedIndex = Math.max(0, filteredPrs.length - 1);
      }
    };

    const exitIndex = () => filteredPrs.length;

    // Render the list
    const render = () => {
      const totalItems = filteredPrs.length;
      // When no PRs, we show 1 line for "No PRs found" message + 1 for Exit + 1 for prompt
      // When PRs exist, add 2 for header + separator
      const listLines = prs.length > 0 ? prs.length + 2 : 1;
      const currentTotalLines = listLines + 2 + (searchMode ? 1 : 0);

      // Move cursor up to overwrite previous render
      if (!firstRender) {
        process.stdout.write(`\x1b[${previousTotalLines}A`);
      }
      firstRender = false;
      previousTotalLines = currentTotalLines;

      // Render search bar if in search mode
      if (searchMode) {
        const searchPrompt = colors.cyan('🔍 Search: ');
        const cursor = colors.dim('▊');
        process.stdout.write(`\x1b[2K${searchPrompt}${searchPattern}${cursor}\n`);
      }

      // Handle empty state
      if (prs.length === 0) {
        process.stdout.write(`\x1b[2K  ${colors.dim('No PRs found matching the filters.')}\n`);
      } else {
        // Render header and separator
        process.stdout.write(`\x1b[2K  ${formatPrColumnHeader(badgeWidth)}\n`);
        process.stdout.write(`\x1b[2K  ${formatPrColumnSeparator(badgeWidth)}\n`);

        // Render each PR (always render all slots for consistent display)
        for (let i = 0; i < prs.length; i++) {
          if (i < totalItems) {
            const pr = filteredPrs[i];
            const line = formatPrChoice(
              pr,
              badgeWidth,
              i === selectedIndex,
              'preview', // TODO: get from config
              searchMode ? searchPattern : undefined
            );
            process.stdout.write(`\x1b[2K${line}\n`);
          } else {
            process.stdout.write(`\x1b[2K\n`);
          }
        }
      }

      // Exit option (always show, selected when no PRs or at bottom)
      const exitPrefix = selectedIndex === exitIndex() ? colors.cyan('❯ ') : '  ';
      const exitText =
        selectedIndex === exitIndex() ? colors.bold(colors.dim('Exit')) : colors.dim('Exit');
      process.stdout.write(`\x1b[2K${exitPrefix}${exitText}\n`);

      // Prompt line
      if (searchMode) {
        const matchCount =
          filteredPrs.length === prs.length ? '' : ` (${filteredPrs.length}/${prs.length})`;
        process.stdout.write(
          `\x1b[2K${colors.dim(`Type to search${matchCount} • esc cancel • enter select`)}\n`
        );
      } else if (prs.length === 0) {
        process.stdout.write(`\x1b[2K${colors.dim('esc back • q quit')}\n`);
      } else {
        process.stdout.write(
          `\x1b[2K${colors.dim('↑/↓ navigate • enter select • / search • w worktree • b browser • q quit')}\n`
        );
      }

      // Clear extra lines from previous render
      const linesToClear = previousTotalLines;
      if (linesToClear > currentTotalLines) {
        for (let i = 0; i < linesToClear - currentTotalLines; i++) {
          process.stdout.write(`\x1b[2K\n`);
        }
        process.stdout.write(`\x1b[${linesToClear - currentTotalLines}A`);
      }
    };

    // Initial render
    render();

    // Set up raw mode for keypress handling
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onKeypress);
      process.stdin.pause();
    };

    const onKeypress = (key: Buffer) => {
      const char = key.toString();

      // Handle Ctrl+C
      if (char === '\x03') {
        cleanup();
        process.exit(0);
      }

      if (searchMode) {
        // Search mode key handling
        if (char === '\x1b') {
          // Escape - exit search mode
          searchMode = false;
          searchPattern = '';
          updateFiltered();
          render();
        } else if (char === '\r' || char === '\n') {
          // Enter - select current item
          searchMode = false;
          if (selectedIndex === exitIndex() || filteredPrs.length === 0) {
            cleanup();
            resolve({ pr: null, action: null });
          } else {
            cleanup();
            resolve({ pr: filteredPrs[selectedIndex], action: null });
          }
        } else if (char === '\x7f' || char === '\b') {
          // Backspace
          if (searchPattern.length > 0) {
            searchPattern = searchPattern.slice(0, -1);
            updateFiltered();
            render();
          }
        } else if (char.length === 1 && char >= ' ') {
          // Printable character
          searchPattern += char;
          updateFiltered();
          render();
        }
        return;
      }

      // Normal mode key handling
      if (char === '\x1b' && prs.length === 0) {
        // Escape when no PRs - go back
        cleanup();
        resolve({ pr: null, action: 'exit' });
      } else if (char === '\x1b[A') {
        // Up arrow
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
      } else if (char === '\x1b[B') {
        // Down arrow
        selectedIndex = Math.min(exitIndex(), selectedIndex + 1);
        render();
      } else if (char === '\r' || char === '\n') {
        // Enter - select current item
        if (selectedIndex === exitIndex()) {
          cleanup();
          resolve({ pr: null, action: null });
        } else {
          cleanup();
          resolve({ pr: filteredPrs[selectedIndex], action: null });
        }
      } else if (char === '/') {
        // Enter search mode
        searchMode = true;
        searchPattern = '';
        render();
      } else if (char === 'q') {
        // Quit
        cleanup();
        resolve({ pr: null, action: 'exit' });
      } else if (char in FILTER_STATE_KEYS) {
        // Filter key - exclusive state selection or draft toggle
        cleanup();
        resolve({ pr: null, action: FILTER_STATE_KEYS[char] });
      } else if (char in SHORTCUT_MAP && selectedIndex < filteredPrs.length) {
        // Shortcut key for current PR
        const pr = filteredPrs[selectedIndex];
        const action = getActionForShortcut(char, pr);
        if (action) {
          cleanup();
          resolve({ pr, action });
        }
      }
    };

    process.stdin.on('data', onKeypress);
  });
}
/* c8 ignore stop */

/**
 * Print PR list header with summary and filter indicators
 */
export function printPrHeader(
  repoName: string,
  prs: PrDisplayItem[],
  filterState: PrFilterState
): void {
  console.log(formatPrListHeader(repoName));
  console.log(formatPrSummary(prs));
  console.log();
  console.log(formatFilterIndicator(filterState));
  console.log();
}

/**
 * Run the interactive PR browser loop
 *
 * @param allPrs - All PRs (unfiltered) - filtering is done internally
 * @param repoName - Repository name for header display
 * @param previewLabel - Label to highlight in PR list
 * @param initialFilterState - Initial filter state (optional, defaults to showing OPEN)
 * @param interactiveDeps - Dependencies for testing
 */
export async function runPrInteractiveMode(
  allPrs: PrDisplayItem[],
  repoName: string,
  previewLabel: string,
  initialFilterState?: PrFilterState,
  interactiveDeps?: PrInteractiveDeps
): Promise<void> {
  const deps = interactiveDeps ?? createDefaultPrInteractiveDeps();
  let filterState = initialFilterState ?? createDefaultFilterState();

  let running = true;

  while (running) {
    // Apply current filters to get display list
    const filteredPrs = applyFilters(allPrs, filterState);

    // Clear screen for clean display
    console.clear();

    // Print header
    printPrHeader(repoName, filteredPrs, filterState);

    // Combined selection: user can select a PR or press a shortcut key
    const selection = await deps.selectPr(filteredPrs, filterState);

    // Handle filter actions - exclusive state selection
    if (selection.action === 'filter_show_open') {
      filterState = setExclusiveState(filterState, 'OPEN' as PrState);
      continue; // Re-render with new filter
    }
    if (selection.action === 'filter_show_merged') {
      filterState = setExclusiveState(filterState, 'MERGED' as PrState);
      continue; // Re-render with new filter
    }
    if (selection.action === 'filter_show_closed') {
      filterState = setExclusiveState(filterState, 'CLOSED' as PrState);
      continue; // Re-render with new filter
    }
    if (selection.action === 'filter_show_all') {
      filterState = setAllStates(filterState);
      continue; // Re-render with new filter
    }
    if (selection.action === 'filter_toggle_drafts') {
      filterState = cycleDraftFilter(filterState);
      continue; // Re-render with new filter
    }

    if (!selection.pr && !selection.action) {
      running = false;
      console.log(colors.dim('\nGoodbye!\n'));
      continue;
    }

    if (selection.action === 'exit') {
      running = false;
      console.log(colors.dim('\nGoodbye!\n'));
      continue;
    }

    // Handle PR action (shortcut key pressed on a PR)
    if (selection.pr && selection.action) {
      const result = await deps.executeAction(selection.action, selection.pr);

      // Display result message
      if (result.message) {
        if (result.success) {
          console.log(colors.green(`\n✓ ${result.message}`));
        } else {
          console.log(colors.red(`\n✗ ${result.message}`));
        }
        await deps.pressEnterToContinue();
      }

      // Handle refresh if needed
      if (result.shouldRefresh && deps.refreshPrs) {
        allPrs = await deps.refreshPrs();
      }

      // Handle exit if requested
      if (result.shouldExit) {
        running = false;
        console.log(colors.dim('\nGoodbye!\n'));
      }

      continue;
    }

    // Handle PR selection (Enter pressed on a PR) - show detail view
    if (selection.pr) {
      let currentPr = selection.pr;

      // Detail view loop - stay in detail view until user presses back or exit
      while (true) {
        const action = await deps.showDetails(currentPr);

        if (action === 'back') {
          break; // Return to list
        }

        if (action === 'exit') {
          running = false;
          console.log(colors.dim('\nGoodbye!\n'));
          break;
        }

        // Execute the action
        const result = await deps.executeAction(action, currentPr);

        // Display result
        console.clear();
        if (result.message) {
          if (result.success) {
            console.log(colors.green(`\n✓ ${result.message}`));
          } else {
            console.log(colors.red(`\n✗ ${result.message}`));
          }
          await deps.pressEnterToContinue();
        }

        // Handle refresh
        if (result.shouldRefresh && deps.refreshPrs) {
          allPrs = await deps.refreshPrs();
          // Update currentPr with fresh data if still exists
          const updatedPr = allPrs.find((p) => p.number === currentPr.number);
          if (updatedPr) {
            currentPr = updatedPr;
          } else {
            break; // PR no longer exists, return to list
          }
        }

        // Exit requested from action
        if (result.shouldExit) {
          running = false;
          break;
        }
      }
    }
  }
}
