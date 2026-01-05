/**
 * lswt interactive - interactive mode UI loop
 */

import * as path from 'path';
import * as readline from 'readline';
import inquirer from 'inquirer';
import * as colors from '../colors.js';
import * as git from '../git.js';
import { loadConfig } from '../config.js';
import { detectEnvironment } from './environment.js';
import { buildActionMenu, formatShortcutLegend } from './actions.js';
import { executeAction, createDefaultExecutorDeps } from './action-executors.js';
import { gatherWorktreeInfo, createDefaultDeps } from './worktree-info.js';
import { filterWorktrees, highlightMatches } from './fuzzy-search.js';
import type { WorktreeDisplay, WorktreeAction, ListOptions, EnvironmentInfo } from './types.js';

/** Map shortcut keys to actions */
const SHORTCUT_MAP: Record<string, WorktreeAction> = {
  e: 'open_editor',
  t: 'open_terminal',
  c: 'copy_path',
  d: 'show_details',
  p: 'open_pr_url', // Will be adjusted for branch worktrees
  w: 'checkout_pr', // Only works for remote_pr type
  l: 'link_configs',
  r: 'remove_worktree',
  q: 'exit',
};

/**
 * Get the raw badge text (without colors) for a worktree.
 * Used to compute dynamic badge widths.
 * Exported for testing.
 */
export function getBadgeText(worktree: WorktreeDisplay): string {
  switch (worktree.type) {
    case 'main':
      return '[main]';
    case 'pr':
      if (worktree.isDraft) {
        return `[PR #${worktree.prNumber} DRAFT]`;
      }
      return `[PR #${worktree.prNumber}]`;
    case 'remote_pr':
      if (worktree.isDraft) {
        return `[PR #${worktree.prNumber} REMOTE DRAFT]`;
      }
      return `[PR #${worktree.prNumber} REMOTE]`;
    case 'branch':
      return '[branch]';
    case 'detached':
      return '[detached]';
    default:
      return '[unknown]';
  }
}

/**
 * Compute the maximum badge width needed for a list of worktrees.
 * Adds padding for visual spacing.
 * Exported for testing.
 */
export function computeMaxBadgeWidth(worktrees: WorktreeDisplay[]): number {
  if (worktrees.length === 0) return 12; // sensible default
  const maxTextWidth = Math.max(...worktrees.map((wt) => getBadgeText(wt).length));
  return maxTextWidth + 2; // add padding for visual spacing
}

/**
 * Get the action for a shortcut key, handling worktree-specific rules.
 * Returns null if the shortcut is not valid for this worktree type.
 * Exported for testing.
 */
export function getActionForShortcut(
  shortcutKey: string,
  worktree: WorktreeDisplay
): WorktreeAction | null {
  if (!(shortcutKey in SHORTCUT_MAP)) {
    return null;
  }

  let action = SHORTCUT_MAP[shortcutKey];

  // Special handling for remote PRs - limited actions
  if (worktree.type === 'remote_pr') {
    // Remote PRs only support: w (checkout), p (open PR), d (details), q (quit)
    if (!['w', 'p', 'd', 'q'].includes(shortcutKey)) {
      return null;
    }
  } else {
    // 'w' (checkout_pr) only works for remote_pr type
    if (shortcutKey === 'w') {
      return null;
    }
  }

  // Special handling for 'p' key based on worktree type
  if (shortcutKey === 'p') {
    if (worktree.type === 'branch') {
      action = 'create_pr';
    } else if (worktree.type !== 'pr' && worktree.type !== 'remote_pr') {
      // 'p' only works for PR, remote_pr, and branch worktrees
      return null;
    }
  }

  // 'r' (remove) doesn't work for main worktree
  if (shortcutKey === 'r' && worktree.type === 'main') {
    return null;
  }

  return action;
}

/** Result from the combined worktree+action selection */
interface SelectionResult {
  worktree: WorktreeDisplay | null;
  action: WorktreeAction | null;
}

/** Dependencies for interactive mode (injectable for testing) */
export interface InteractiveDeps {
  selectWorktree: (worktrees: WorktreeDisplay[], env: EnvironmentInfo) => Promise<SelectionResult>;
  selectAction: (worktree: WorktreeDisplay, env: EnvironmentInfo) => Promise<WorktreeAction>;
  pressEnterToContinue: () => Promise<void>;
}

/**
 * Create default interactive dependencies using raw keyboard input
 */
export function createDefaultInteractiveDeps(): InteractiveDeps {
  return {
    selectWorktree: selectWorktreeWithShortcuts,
    selectAction: selectActionMenu,
    pressEnterToContinue: pressEnterToContinue,
  };
}

/**
 * Run the interactive mode loop
 */
export async function runInteractiveMode(
  initialWorktrees: WorktreeDisplay[],
  options: ListOptions,
  interactiveDeps?: InteractiveDeps
): Promise<void> {
  const env = detectEnvironment();
  const repoRoot = git.getRepoRoot();

  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    return;
  }

  const config = loadConfig(repoRoot);
  const deps = createDefaultDeps();
  const executorDeps = createDefaultExecutorDeps();
  const iDeps = interactiveDeps ?? createDefaultInteractiveDeps();

  // Guard against empty worktrees array
  if (initialWorktrees.length === 0) {
    console.log(colors.dim('\nNo worktrees found.\n'));
    return;
  }

  let worktrees = initialWorktrees;
  let running = true;

  while (running) {
    // Clear screen for clean display
    console.clear();

    // Print header
    printWorktreeHeader(worktrees, env);

    // Combined selection: user can either select a worktree or press a shortcut key
    const selection = await iDeps.selectWorktree(worktrees, env);

    if (!selection.worktree) {
      running = false;
      console.log(colors.dim('\nGoodbye!\n'));
      continue;
    }

    // If a shortcut was pressed, execute immediately
    // Otherwise show the action menu
    let action = selection.action;
    if (!action) {
      action = await iDeps.selectAction(selection.worktree, env);
    }

    if (action === 'exit') {
      running = false;
      console.log(colors.dim('\nGoodbye!\n'));
      continue;
    }

    if (action === 'back') {
      continue;
    }

    // Execute action
    const result = await executeAction(action, selection.worktree, env, config, executorDeps);

    if (result.message) {
      console.log(
        result.success ? colors.green(`\n✓ ${result.message}`) : colors.red(`\n✗ ${result.message}`)
      );
    }

    if (result.shouldRefresh) {
      // Re-gather worktree info after actions like remove
      worktrees = await gatherWorktreeInfo(repoRoot, options, deps);
      if (worktrees.length === 0) {
        console.log(colors.dim('\nNo worktrees remaining.\n'));
        running = false;
        continue;
      }
    }

    if (result.shouldExit) {
      running = false;
      continue;
    }

    // Wait for user to continue
    await iDeps.pressEnterToContinue();
  }
}

/**
 * Print worktree list header with shortcuts legend
 */
function printWorktreeHeader(worktrees: WorktreeDisplay[], env: EnvironmentInfo): void {
  const firstPath = worktrees[0]?.path || '';
  const repoName = path.basename(firstPath.replace(/\.pr\d+$/, '') || 'repository');

  console.log(
    colors.cyan(
      colors.bold('\n╔══════════════════════════════════════════════════════════════════╗')
    )
  );
  console.log(
    colors.cyan(colors.bold('║')) +
      colors.bold(`  ${repoName} worktrees`.padEnd(66)) +
      colors.cyan(colors.bold('║'))
  );
  console.log(
    colors.cyan(
      colors.bold('╚══════════════════════════════════════════════════════════════════╝\n')
    )
  );

  // Summary line
  const localPrCount = worktrees.filter((w) => w.type === 'pr').length;
  const remotePrCount = worktrees.filter((w) => w.type === 'remote_pr').length;
  const localWorktreeCount = worktrees.filter((w) => w.type !== 'remote_pr').length;
  const openCount = worktrees.filter((w) => w.prState === 'OPEN').length;
  const changesCount = worktrees.filter((w) => w.hasChanges).length;

  const parts: string[] = [`${localWorktreeCount} worktrees`];
  if (localPrCount > 0) parts.push(`${localPrCount} local PRs`);
  if (remotePrCount > 0) parts.push(`${remotePrCount} remote PRs`);
  if (openCount > 0) parts.push(`${openCount} open`);
  if (changesCount > 0) parts.push(colors.red(`${changesCount} with changes`));

  console.log(colors.dim(parts.join(' · ')) + '\n');

  // Shortcuts legend
  const editorLabel = env.defaultEditor === 'cursor' ? 'Cursor' : 'VSCode';
  const shortcuts = [
    `${colors.cyan('[e]')} ${editorLabel}`,
    `${colors.cyan('[t]')} terminal`,
    `${colors.cyan('[c]')} copy path`,
    `${colors.cyan('[d]')} details`,
    `${colors.cyan('[p]')} PR`,
  ];
  // Add worktree shortcut if there are remote PRs
  if (remotePrCount > 0) {
    shortcuts.push(`${colors.cyan('[w]')} worktree`);
  }
  shortcuts.push(
    `${colors.cyan('[l]')} link`,
    `${colors.cyan('[r]')} remove`,
    `${colors.cyan('[/]')} search`,
    `${colors.cyan('[q]')} quit`
  );
  console.log(colors.dim('Shortcuts: ') + shortcuts.join(colors.dim(' · ')) + '\n');
}

/**
 * Format worktree choice with search highlighting
 * @param worktree - The worktree to format
 * @param badgeWidth - The width to pad the badge to
 * @param searchPattern - Optional search pattern to highlight matches
 * Exported for testing
 */
export function formatWorktreeChoiceWithSearch(
  worktree: WorktreeDisplay,
  badgeWidth: number,
  searchPattern?: string
): string {
  const typeLabel = formatTypeBadgeWithColors(worktree, badgeWidth);

  // For remote PRs, show the PR title (truncated) instead of branch
  let displayText: string;
  if (worktree.type === 'remote_pr' && worktree.prTitle) {
    const maxLength = 30;
    displayText =
      worktree.prTitle.length > maxLength
        ? worktree.prTitle.substring(0, maxLength - 3) + '...'
        : worktree.prTitle;
  } else {
    displayText = worktree.branch || colors.dim('(detached)');
  }

  // Apply search highlighting if pattern provided
  if (searchPattern && searchPattern.length > 0) {
    displayText = highlightMatches(displayText, searchPattern, colors.yellow);
  }

  const status = formatStatusWithColors(worktree);
  const paddedDisplay = displayText.padEnd(30);

  return `${typeLabel}  ${paddedDisplay} ${status}`;
}

/**
 * Select a worktree from the list with keyboard shortcuts and fuzzy search
 * Arrow keys to navigate, Enter to select, or press a shortcut key
 * Press '/' to enter search mode
 *
 * This function uses raw stdin keypress handling and is intentionally
 * excluded from coverage. The logic is tested via dependency injection
 * in tests where this function is mocked.
 */
/* c8 ignore start */
async function selectWorktreeWithShortcuts(
  worktrees: WorktreeDisplay[],
  _env: EnvironmentInfo
): Promise<SelectionResult> {
  // Guard: if stdin is not a TTY, we can't do interactive selection
  if (!process.stdin.isTTY) {
    // Return first worktree with no action (fallback for non-interactive mode)
    return { worktree: worktrees[0] ?? null, action: null };
  }

  return new Promise((resolve) => {
    let selectedIndex = 0;
    let firstRender = true;
    let searchMode = false;
    let searchPattern = '';
    let filteredWorktrees = worktrees;
    let filteredIndices: number[] = worktrees.map((_, i) => i);
    // Track previous line count for correct cursor movement when exiting search mode
    let previousTotalLines = worktrees.length + 2;

    // Compute badge width once for consistent alignment
    const badgeWidth = computeMaxBadgeWidth(worktrees);

    // Update filtered list based on search pattern
    const updateFiltered = () => {
      if (searchPattern.length === 0) {
        filteredWorktrees = worktrees;
        filteredIndices = worktrees.map((_, i) => i);
      } else {
        const results = filterWorktrees(worktrees, searchPattern);
        filteredWorktrees = results.map((r) => r.worktree);
        filteredIndices = results.map((r) => r.originalIndex);
      }
      // Clamp selected index to valid range
      if (selectedIndex >= filteredWorktrees.length) {
        selectedIndex = Math.max(0, filteredWorktrees.length - 1);
      }
    };

    const exitIndex = () => filteredWorktrees.length; // Virtual "Exit" option

    // Render the list
    const render = () => {
      const totalItems = filteredWorktrees.length;
      // Total lines = worktrees + exit + prompt line + search line (if in search mode)
      const currentTotalLines = worktrees.length + 2 + (searchMode ? 1 : 0);

      // Move cursor up to overwrite previous render (skip on first render)
      // Use previousTotalLines to correctly clear the old screen state
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

      // Render each worktree (always render all slots for consistent display)
      for (let i = 0; i < worktrees.length; i++) {
        if (i < totalItems) {
          const wt = filteredWorktrees[i];
          const prefix = i === selectedIndex ? colors.cyan('❯ ') : '  ';
          const line = formatWorktreeChoiceWithSearch(
            wt,
            badgeWidth,
            searchMode ? searchPattern : undefined
          );
          const highlight = i === selectedIndex ? colors.bold(line) : line;
          process.stdout.write(`\x1b[2K${prefix}${highlight}\n`);
        } else {
          // Clear unused lines
          process.stdout.write(`\x1b[2K\n`);
        }
      }

      // Exit option
      const exitPrefix = selectedIndex === exitIndex() ? colors.cyan('❯ ') : '  ';
      const exitText =
        selectedIndex === exitIndex() ? colors.bold(colors.dim('Exit')) : colors.dim('Exit');
      process.stdout.write(`\x1b[2K${exitPrefix}${exitText}\n`);

      // Prompt line
      if (searchMode) {
        const matchCount =
          filteredWorktrees.length === worktrees.length
            ? ''
            : ` (${filteredWorktrees.length}/${worktrees.length})`;
        process.stdout.write(
          `\x1b[2K${colors.dim(`Type to search${matchCount} • esc cancel • enter select`)}\n`
        );
      } else {
        process.stdout.write(
          `\x1b[2K${colors.dim('↑/↓ navigate • enter select • / search • shortcuts: e,t,c,d,p,l,r,q')}\n`
        );
      }
    };

    // Initial render (print blank lines first)
    for (let i = 0; i <= worktrees.length + 1; i++) {
      console.log('');
    }
    render();

    // Set up raw mode for keypress handling (we already checked isTTY above)
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    // Signal handler to ensure terminal is restored on unexpected termination
    const handleSignal = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.exit(0);
    };

    // Register signal handlers
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    const cleanup = () => {
      // Remove signal handlers to prevent memory leaks
      process.removeListener('SIGINT', handleSignal);
      process.removeListener('SIGTERM', handleSignal);
      process.stdin.setRawMode(false);
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.pause();
    };

    const onKeypress = (str: string, key: readline.Key) => {
      if (!key) return;

      // Handle Ctrl+C - clean exit instead of process.exit for better testability
      if (key.ctrl && key.name === 'c') {
        cleanup();
        resolve({ worktree: null, action: 'exit' });
        return;
      }

      // Search mode handling
      if (searchMode) {
        // Escape exits search mode
        if (key.name === 'escape') {
          searchMode = false;
          searchPattern = '';
          updateFiltered();
          selectedIndex = 0;
          render();
          return;
        }

        // Enter confirms selection
        if (key.name === 'return') {
          cleanup();
          if (selectedIndex === exitIndex() || filteredWorktrees.length === 0) {
            resolve({ worktree: null, action: null });
          } else {
            resolve({ worktree: filteredWorktrees[selectedIndex], action: null });
          }
          return;
        }

        // Arrow keys for navigation
        if (key.name === 'up') {
          selectedIndex = Math.max(0, selectedIndex - 1);
          render();
          return;
        }

        if (key.name === 'down') {
          selectedIndex = Math.min(exitIndex(), selectedIndex + 1);
          render();
          return;
        }

        // Backspace removes last character
        if (key.name === 'backspace') {
          if (searchPattern.length > 0) {
            searchPattern = searchPattern.slice(0, -1);
            updateFiltered();
          }
          render();
          return;
        }

        // Any printable character adds to search
        if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
          searchPattern += str;
          updateFiltered();
          render();
          return;
        }

        return;
      }

      // Normal mode handling

      // Handle arrow keys
      if (key.name === 'up') {
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
        return;
      }

      if (key.name === 'down') {
        selectedIndex = Math.min(exitIndex(), selectedIndex + 1);
        render();
        return;
      }

      // Handle Enter
      if (key.name === 'return') {
        cleanup();
        if (selectedIndex === exitIndex()) {
          resolve({ worktree: null, action: null });
        } else {
          resolve({ worktree: filteredWorktrees[selectedIndex], action: null });
        }
        return;
      }

      // Handle escape or q for exit
      if (key.name === 'escape' || key.name === 'q') {
        cleanup();
        resolve({ worktree: null, action: 'exit' });
        return;
      }

      // Handle '/' to enter search mode
      if (str === '/') {
        searchMode = true;
        searchPattern = '';
        // Add extra line for search bar
        console.log('');
        firstRender = true;
        render();
        return;
      }

      // Handle shortcut keys (only if a worktree is selected, not exit)
      if (selectedIndex < filteredWorktrees.length && key.name && key.name.length === 1) {
        const shortcutKey = key.name.toLowerCase();
        const worktree = filteredWorktrees[selectedIndex];

        // Use the shared helper function to get valid action for this shortcut
        const action = getActionForShortcut(shortcutKey, worktree);
        if (action) {
          cleanup();
          resolve({ worktree, action });
          return;
        }
      }
    };

    process.stdin.on('keypress', onKeypress);
  });
}
/* c8 ignore stop */

/**
 * Format worktree choice with colors for display
 * @param worktree - The worktree to format
 * @param badgeWidth - The width to pad the badge to (computed dynamically via computeMaxBadgeWidth)
 * Exported for testing
 */
export function formatWorktreeChoiceWithColors(
  worktree: WorktreeDisplay,
  badgeWidth: number
): string {
  const typeLabel = formatTypeBadgeWithColors(worktree, badgeWidth);

  // For remote PRs, show the PR title (truncated) instead of branch
  let displayText: string;
  if (worktree.type === 'remote_pr' && worktree.prTitle) {
    // Truncate title to fit
    const maxLength = 30;
    displayText =
      worktree.prTitle.length > maxLength
        ? worktree.prTitle.substring(0, maxLength - 3) + '...'
        : worktree.prTitle;
  } else {
    displayText = worktree.branch || colors.dim('(detached)');
  }

  const status = formatStatusWithColors(worktree);

  // Pad for alignment (accounting for ANSI codes is tricky, so we use fixed widths)
  const paddedDisplay = displayText.padEnd(30);

  return `${typeLabel}  ${paddedDisplay} ${status}`;
}

/**
 * Format type badge with colors
 * @param worktree - The worktree to format
 * @param badgeWidth - The width to pad the badge to (computed dynamically via computeMaxBadgeWidth)
 * Exported for testing
 */
export function formatTypeBadgeWithColors(worktree: WorktreeDisplay, badgeWidth: number): string {
  const badge = getBadgeText(worktree);
  const paddedBadge = badge.padEnd(badgeWidth);

  switch (worktree.type) {
    case 'main':
      return colors.cyan(paddedBadge);
    case 'pr':
      if (worktree.isDraft) {
        return colors.yellow(paddedBadge);
      }
      return colors.green(paddedBadge);
    case 'remote_pr':
      if (worktree.isDraft) {
        return colors.dim(colors.yellow(paddedBadge));
      }
      return colors.dim(paddedBadge);
    case 'branch':
      return colors.blue(paddedBadge);
    case 'detached':
      return colors.dim(paddedBadge);
    default:
      return colors.dim(paddedBadge);
  }
}

/**
 * Format status string with colors
 * Exported for testing
 */
export function formatStatusWithColors(worktree: WorktreeDisplay): string {
  const parts: string[] = [];

  // PR state
  if (worktree.prState) {
    switch (worktree.prState) {
      case 'OPEN':
        parts.push(colors.green('OPEN'));
        break;
      case 'MERGED':
        parts.push(colors.blue('MERGED'));
        break;
      case 'CLOSED':
        parts.push(colors.red('CLOSED'));
        break;
    }
  }

  // Changes indicator
  if (worktree.hasChanges) {
    parts.push(colors.red('has changes'));
  } else if (worktree.type === 'main' && parts.length === 0) {
    parts.push(colors.dim('clean'));
  }

  if (parts.length === 0) {
    return '';
  }

  return colors.dim('(') + parts.join(colors.dim(', ')) + colors.dim(')');
}

/**
 * Select an action for the worktree
 *
 * Uses inquirer.prompt which requires real stdin.
 * Excluded from coverage - tested via dependency injection.
 */
/* c8 ignore start */
async function selectActionMenu(
  worktree: WorktreeDisplay,
  env: ReturnType<typeof detectEnvironment>
): Promise<WorktreeAction> {
  const actions = buildActionMenu(worktree, env);

  // Show worktree info at top
  const badgeWidth = computeMaxBadgeWidth([worktree]);
  console.log('');
  console.log(colors.bold(`  Selected: `) + formatWorktreeChoiceWithColors(worktree, badgeWidth));
  console.log(colors.dim(`  ${formatShortcutLegend(worktree)}`));
  console.log('');

  const choices = actions.map((action) => {
    let name = action.name;

    // Add shortcut indicator
    if (action.shortcut) {
      name = `${colors.cyan(`[${action.shortcut}]`)} ${name}`;
    } else {
      name = `    ${name}`;
    }

    // Handle disabled state
    if (action.disabled) {
      const reason = typeof action.disabled === 'string' ? action.disabled : 'Not available';
      return {
        name: colors.dim(`${name} (${reason})`),
        value: action.value,
        disabled: reason,
      };
    }

    return {
      name,
      value: action.value,
    };
  });

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
      pageSize: 12,
    },
  ]);

  return action;
}

/**
 * Wait for user to press Enter
 */
async function pressEnterToContinue(): Promise<void> {
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: colors.dim('Press Enter to continue...'),
    },
  ]);
}
