/**
 * lswt actions - action menu building and shortcut handling
 */

import * as colors from '../colors.js';
import type { WorktreeDisplay, WorktreeAction, ActionMenuItem, EnvironmentInfo } from './types.js';

/**
 * Shortcut mappings for actions
 */
export const ACTION_SHORTCUTS: Record<WorktreeAction, string | null> = {
  open_editor: 'e',
  open_terminal: 't',
  open_pr_url: 'p',
  create_pr: 'p',
  checkout_pr: 'w',
  show_details: 'd',
  copy_path: 'c',
  remove_worktree: 'r',
  link_configs: 'l',
  back: null,
  exit: 'q',
};

/**
 * Get the shortcut key for an action
 */
export function getActionShortcut(action: WorktreeAction): string | null {
  return ACTION_SHORTCUTS[action];
}

/**
 * Build action menu items based on worktree type and environment
 */
export function buildActionMenu(worktree: WorktreeDisplay, env: EnvironmentInfo): ActionMenuItem[] {
  const items: ActionMenuItem[] = [];

  // Remote PRs have a limited action set (no local path)
  if (worktree.type === 'remote_pr') {
    items.push({
      name: 'Create worktree for this PR',
      value: 'checkout_pr',
      shortcut: 'w',
    });

    items.push({
      name: 'Open PR in browser',
      value: 'open_pr_url',
      shortcut: 'p',
    });

    items.push({
      name: 'Show details',
      value: 'show_details',
      shortcut: 'd',
    });

    items.push({
      name: 'Back to worktree list',
      value: 'back',
    });

    items.push({
      name: 'Exit',
      value: 'exit',
      shortcut: 'q',
    });

    return items;
  }

  // Editor action (always available, but may be disabled)
  const editorName = getEditorDisplayName(env);
  if (env.defaultEditor) {
    items.push({
      name: `Open in ${editorName}`,
      value: 'open_editor',
      shortcut: 'e',
    });
  } else {
    items.push({
      name: `Open in editor`,
      value: 'open_editor',
      shortcut: 'e',
      disabled: 'No editor found (VSCode or Cursor)',
    });
  }

  // Terminal action (always available)
  items.push({
    name: 'Open terminal here',
    value: 'open_terminal',
    shortcut: 't',
  });

  // Copy path (always available)
  items.push({
    name: 'Copy path to clipboard',
    value: 'copy_path',
    shortcut: 'c',
  });

  // Show details (always available)
  items.push({
    name: 'Show details',
    value: 'show_details',
    shortcut: 'd',
  });

  // PR-specific actions
  if (worktree.type === 'pr' && worktree.prNumber !== null) {
    items.push({
      name: 'Open PR in browser',
      value: 'open_pr_url',
      shortcut: 'p',
    });
  }

  // Create PR (only for branch worktrees without a PR)
  if (worktree.type === 'branch') {
    items.push({
      name: 'Create PR from branch',
      value: 'create_pr',
      shortcut: 'p',
    });
  }

  // Link configs (always available)
  items.push({
    name: 'Link config files',
    value: 'link_configs',
    shortcut: 'l',
  });

  // Remove worktree (not available for main)
  if (worktree.type !== 'main') {
    const removeLabel =
      worktree.prState === 'MERGED' || worktree.prState === 'CLOSED'
        ? 'Remove worktree (PR is ' + worktree.prState.toLowerCase() + ')'
        : 'Remove worktree';

    items.push({
      name: removeLabel,
      value: 'remove_worktree',
      shortcut: 'r',
    });
  }

  // Navigation
  items.push({
    name: 'Back to worktree list',
    value: 'back',
  });

  items.push({
    name: 'Exit',
    value: 'exit',
    shortcut: 'q',
  });

  return items;
}

/**
 * Get editor display name based on environment
 */
function getEditorDisplayName(env: EnvironmentInfo): string {
  if (env.defaultEditor === 'cursor') {
    return 'Cursor';
  }
  return 'VSCode';
}

/**
 * Format a single shortcut item, dimmed if disabled
 */
function formatShortcutItem(key: string, label: string, disabled?: string): string {
  if (disabled) {
    return colors.dim(`[${key}] ${label} (${disabled})`);
  }
  return `${colors.cyan(`[${key}]`)} ${label}`;
}

/**
 * Format shortcut legend for display in prompt
 * Shows all shortcuts with unavailable ones dimmed
 */
export function formatShortcutLegend(worktree: WorktreeDisplay): string {
  const items: string[] = [];

  // Remote PRs have a different set of shortcuts
  if (worktree.type === 'remote_pr') {
    items.push(formatShortcutItem('w', 'worktree'));
    items.push(formatShortcutItem('p', 'PR'));
    items.push(formatShortcutItem('d', 'details'));
    items.push(formatShortcutItem('q', 'quit'));
    return items.join(' · ');
  }

  // Standard shortcuts for local worktrees
  items.push(formatShortcutItem('e', 'editor'));
  items.push(formatShortcutItem('t', 'terminal'));

  // 'p' varies by type
  if (worktree.type === 'pr') {
    items.push(formatShortcutItem('p', 'PR'));
  } else if (worktree.type === 'branch') {
    items.push(formatShortcutItem('p', 'create PR'));
  } else if (worktree.type === 'main' || worktree.type === 'detached') {
    items.push(formatShortcutItem('p', 'PR', 'n/a'));
  }

  items.push(formatShortcutItem('d', 'details'));
  items.push(formatShortcutItem('c', 'copy'));
  items.push(formatShortcutItem('l', 'link'));

  // 'r' not available for main
  if (worktree.type === 'main') {
    items.push(formatShortcutItem('r', 'remove', 'main'));
  } else {
    items.push(formatShortcutItem('r', 'remove'));
  }

  items.push(formatShortcutItem('q', 'quit'));

  return items.join(' · ');
}

/**
 * Format worktree choice for selection prompt
 */
export function formatWorktreeChoice(worktree: WorktreeDisplay): string {
  const typeLabel = formatTypeBadge(worktree);
  const branchDisplay = worktree.branch || '(detached)';
  const status = formatStatus(worktree);

  // Pad type label for alignment
  const paddedType = typeLabel.padEnd(14);

  return `${paddedType} ${branchDisplay.padEnd(25)} ${status}`;
}

/**
 * Format type badge for worktree
 */
function formatTypeBadge(worktree: WorktreeDisplay): string {
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
  }
}

/**
 * Format status string for worktree
 */
function formatStatus(worktree: WorktreeDisplay): string {
  const parts: string[] = [];

  // PR state
  if (worktree.prState) {
    parts.push(worktree.prState);
  }

  // Changes indicator
  if (worktree.hasChanges) {
    parts.push('has changes');
  } else if (worktree.type === 'main') {
    parts.push('clean');
  }

  if (parts.length === 0) {
    return '';
  }

  return `(${parts.join(', ')})`;
}
