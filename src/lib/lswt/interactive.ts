/**
 * lswt interactive - interactive mode UI loop
 */

import * as path from 'path';
import inquirer from 'inquirer';
import * as colors from '../colors.js';
import * as git from '../git.js';
import { loadConfig } from '../config.js';
import { detectEnvironment } from './environment.js';
import { buildActionMenu, formatShortcutLegend } from './actions.js';
import { executeAction, createDefaultExecutorDeps } from './action-executors.js';
import { gatherWorktreeInfo, createDefaultDeps } from './worktree-info.js';
import type { WorktreeDisplay, WorktreeAction, ListOptions, EnvironmentInfo } from './types.js';

/** Result from the combined worktree+action selection */
interface SelectionResult {
  worktree: WorktreeDisplay | null;
  action: WorktreeAction | null;
}

/**
 * Run the interactive mode loop
 */
export async function runInteractiveMode(
  initialWorktrees: WorktreeDisplay[],
  options: ListOptions
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
    const selection = await selectWorktreeWithShortcuts(worktrees, env);

    if (!selection.worktree) {
      running = false;
      console.log(colors.dim('\nGoodbye!\n'));
      continue;
    }

    // If a shortcut was pressed, execute immediately
    // Otherwise show the action menu
    let action = selection.action;
    if (!action) {
      action = await selectAction(selection.worktree, env);
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
    await pressEnterToContinue();
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
  const prCount = worktrees.filter((w) => w.type === 'pr').length;
  const openCount = worktrees.filter((w) => w.prState === 'OPEN').length;
  const changesCount = worktrees.filter((w) => w.hasChanges).length;

  const parts: string[] = [`${worktrees.length} worktrees`];
  if (prCount > 0) parts.push(`${prCount} PRs`);
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
    `${colors.cyan('[l]')} link`,
    `${colors.cyan('[r]')} remove`,
    `${colors.cyan('[q]')} quit`,
  ];
  console.log(colors.dim('Shortcuts: ') + shortcuts.join(colors.dim(' · ')) + '\n');
}

/**
 * Select a worktree from the list
 * Shortcuts are displayed in the header and available in the action menu
 */
async function selectWorktreeWithShortcuts(
  worktrees: WorktreeDisplay[],
  _env: EnvironmentInfo
): Promise<SelectionResult> {
  // Build the choices array
  const choices = worktrees.map((wt) => ({
    name: formatWorktreeChoiceWithColors(wt),
    value: wt,
    short: wt.name,
  }));

  // Add exit option
  choices.push(new inquirer.Separator() as unknown as (typeof choices)[0]);
  choices.push({
    name: colors.dim('Exit'),
    value: null as unknown as WorktreeDisplay,
    short: 'Exit',
  });

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message: 'Select worktree:',
      choices,
      pageSize: 15,
      loop: false,
    },
  ]);

  return { worktree: selected, action: null };
}

/**
 * Format worktree choice with colors for display
 * Exported for testing
 */
export function formatWorktreeChoiceWithColors(worktree: WorktreeDisplay): string {
  const typeLabel = formatTypeBadgeWithColors(worktree);
  const branchDisplay = worktree.branch || colors.dim('(detached)');
  const status = formatStatusWithColors(worktree);

  // Pad type label for alignment (accounting for ANSI codes is tricky, so we use fixed widths)
  const paddedBranch = branchDisplay.padEnd(30);

  return `${typeLabel}  ${paddedBranch} ${status}`;
}

/**
 * Format type badge with colors
 * Exported for testing
 */
export function formatTypeBadgeWithColors(worktree: WorktreeDisplay): string {
  switch (worktree.type) {
    case 'main':
      return colors.cyan('[main]      ');
    case 'pr': {
      if (worktree.isDraft) {
        const label = `[PR #${worktree.prNumber} DRAFT]`;
        return colors.yellow(label.padEnd(14));
      }
      const prLabel = `[PR #${worktree.prNumber}]`;
      return colors.green(prLabel.padEnd(14));
    }
    case 'branch':
      return colors.blue('[branch]    ');
    case 'detached':
      return colors.dim('[detached]  ');
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
 */
async function selectAction(
  worktree: WorktreeDisplay,
  env: ReturnType<typeof detectEnvironment>
): Promise<WorktreeAction> {
  const actions = buildActionMenu(worktree, env);

  // Show worktree info at top
  console.log('');
  console.log(colors.bold(`  Selected: `) + formatWorktreeChoiceWithColors(worktree));
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
