/**
 * PR detail view rendering
 */

import * as colors from '../colors.js';
import type { PrDisplayItem, PrAction } from './types.js';
import { formatRelativeTime, formatStateBadge, formatDraftBadge } from './formatters.js';

/**
 * Format the PR detail header box
 */
export function formatDetailHeader(pr: PrDisplayItem): string {
  const lines: string[] = [];
  lines.push(
    colors.cyan(
      colors.bold('\n╔══════════════════════════════════════════════════════════════════╗')
    )
  );
  lines.push(
    colors.cyan(colors.bold('║')) +
      colors.bold(`  PR #${pr.number} Details`.padEnd(66)) +
      colors.cyan(colors.bold('║'))
  );
  lines.push(
    colors.cyan(
      colors.bold('╚══════════════════════════════════════════════════════════════════╝\n')
    )
  );
  return lines.join('\n');
}

/**
 * Format PR metadata section
 */
export function formatDetailMetadata(pr: PrDisplayItem): string {
  const lines: string[] = [];

  // Title
  lines.push(`${colors.bold('Title:')}    ${pr.title}`);

  // Author and timestamps
  const created = formatRelativeTime(pr.createdAt);
  const updated = formatRelativeTime(pr.updatedAt);
  lines.push(
    `${colors.bold('Author:')}   @${pr.author} · Created ${created} ago · Updated ${updated} ago`
  );

  // Branch
  lines.push(`${colors.bold('Branch:')}   ${colors.cyan(pr.headBranch)} → ${pr.baseBranch}`);

  // Status line
  const statusParts: string[] = [formatStateBadge(pr.state)];
  if (pr.isDraft) {
    statusParts.push(formatDraftBadge(true));
  } else if (pr.state === 'OPEN') {
    statusParts.push(colors.green('Ready for review'));
  }
  lines.push(`${colors.bold('Status:')}   ${statusParts.join(' · ')}`);

  return lines.join('\n');
}

/**
 * Format labels section
 */
export function formatDetailLabels(pr: PrDisplayItem): string {
  if (pr.labels.length === 0) {
    return `${colors.bold('Labels:')}   ${colors.dim('none')}`;
  }
  const labelBadges = pr.labels.map((label) => colors.magenta(`[${label}]`)).join(' ');
  return `${colors.bold('Labels:')}   ${labelBadges}`;
}

/**
 * Format review status section
 */
export function formatDetailReviews(pr: PrDisplayItem): string {
  const parts: string[] = [];

  if (pr.reviewDecision === 'APPROVED') {
    parts.push(
      colors.green(`✓ Approved (${pr.approvalCount} approval${pr.approvalCount !== 1 ? 's' : ''})`)
    );
  } else if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    parts.push(colors.red('✗ Changes requested'));
  } else if (pr.reviewDecision === 'REVIEW_REQUIRED') {
    parts.push(colors.yellow('○ Review required'));
  } else if (pr.reviewCount > 0) {
    parts.push(colors.dim(`${pr.reviewCount} review${pr.reviewCount !== 1 ? 's' : ''}`));
  } else {
    parts.push(colors.dim('No reviews yet'));
  }

  return `${colors.bold('Reviews:')}  ${parts.join(' · ')}`;
}

/**
 * Format CI status section
 */
export function formatDetailCI(pr: PrDisplayItem): string {
  let status: string;
  switch (pr.checksStatus) {
    case 'SUCCESS':
      status = colors.green('● All checks passing');
      break;
    case 'FAILURE':
      status = colors.red('● Some checks failing');
      break;
    case 'PENDING':
      status = colors.yellow('○ Checks pending');
      break;
    default:
      status = colors.dim('No CI checks');
  }
  return `${colors.bold('CI:')}       ${status}`;
}

/**
 * Format changes section
 */
export function formatDetailChanges(pr: PrDisplayItem): string {
  const added = colors.green(`+${pr.additions}`);
  const removed = colors.red(`-${pr.deletions}`);
  const files = `${pr.changedFiles} file${pr.changedFiles !== 1 ? 's' : ''}`;
  return `${colors.bold('Changes:')}  ${added} ${removed} across ${files}`;
}

/**
 * Format worktree section
 */
export function formatDetailWorktree(pr: PrDisplayItem): string {
  if (pr.hasWorktree && pr.worktreePath) {
    return `${colors.bold('Worktree:')} ${colors.cyan(pr.worktreePath)}`;
  }
  return `${colors.bold('Worktree:')} ${colors.dim('Not created')}`;
}

/**
 * Format action menu for detail view
 */
export function formatDetailActions(pr: PrDisplayItem): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(colors.bold('Actions:'));

  // Left column
  const leftCol: string[] = [];
  if (pr.hasWorktree) {
    leftCol.push(`  ${colors.cyan('[w]')} Open worktree`);
    leftCol.push(`  ${colors.cyan('[e]')} Open in editor`);
    leftCol.push(`  ${colors.cyan('[t]')} Open terminal`);
  } else {
    leftCol.push(`  ${colors.cyan('[w]')} Create worktree`);
    leftCol.push(`  ${colors.dim('[e]')} ${colors.dim('Open in editor')}`);
    leftCol.push(`  ${colors.dim('[t]')} ${colors.dim('Open terminal')}`);
  }

  // Right column
  const rightCol: string[] = [];
  rightCol.push(`  ${colors.cyan('[b]')} Open in browser`);
  rightCol.push(`  ${colors.cyan('[c]')} Copy PR URL`);
  rightCol.push(`  ${colors.cyan('[n]')} Copy PR number`);

  // Combine columns
  for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
    const left = (leftCol[i] || '').padEnd(32);
    const right = rightCol[i] || '';
    lines.push(left + right);
  }

  lines.push('');
  lines.push(`  ${colors.cyan('[←/q]')} Back to list`);

  return lines.join('\n');
}

/**
 * Format complete PR detail view
 */
export function formatPrDetailView(pr: PrDisplayItem): string {
  const sections: string[] = [];

  sections.push(formatDetailHeader(pr));
  sections.push(formatDetailMetadata(pr));
  sections.push('');
  sections.push(formatDetailLabels(pr));
  sections.push(formatDetailReviews(pr));
  sections.push(formatDetailCI(pr));
  sections.push('');
  sections.push(formatDetailChanges(pr));
  sections.push(formatDetailWorktree(pr));
  sections.push(formatDetailActions(pr));
  sections.push('');

  return sections.join('\n');
}

/**
 * Dependencies for PR detail view (injectable for testing)
 */
export interface PrDetailDeps {
  /** Wait for keypress */
  waitForKey: () => Promise<string>;
}

/**
 * Create default detail view dependencies
 */
export function createDefaultDetailDeps(): PrDetailDeps {
  return {
    waitForKey: waitForKeypress,
  };
}

/**
 * Wait for a single keypress
 * This function uses raw stdin keypress handling and is excluded from coverage.
 */
/* c8 ignore start */
async function waitForKeypress(): Promise<string> {
  if (!process.stdin.isTTY) {
    return 'q';
  }

  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (key: Buffer) => {
      const char = key.toString();
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.removeListener('data', onData);
      process.stdin.pause();

      // Handle Ctrl+C
      if (char === '\x03') {
        process.exit(0);
      }

      // Handle escape sequences for arrow keys
      if (char === '\x1b[D' || char === '\x1b') {
        // Left arrow or Escape
        resolve('back');
        return;
      }

      resolve(char);
    };

    process.stdin.on('data', onData);
  });
}
/* c8 ignore stop */

/**
 * Show PR detail view and handle actions
 * Returns the action to perform, or 'back' to return to list
 */
export async function showPrDetail(pr: PrDisplayItem, deps?: PrDetailDeps): Promise<PrAction> {
  const { waitForKey } = deps ?? createDefaultDetailDeps();

  // Clear and show detail view
  console.clear();
  console.log(formatPrDetailView(pr));

  // Wait for action key
  while (true) {
    const key = await waitForKey();

    // Navigation
    if (key === 'q' || key === 'back' || key === '\x1b') {
      return 'back';
    }

    // Actions
    switch (key) {
      case 'w':
        return pr.hasWorktree ? 'open_worktree' : 'create_worktree';
      case 'b':
        return 'open_browser';
      case 'e':
        if (pr.hasWorktree) return 'open_editor';
        break;
      case 't':
        if (pr.hasWorktree) return 'open_terminal';
        break;
      case 'c':
        return 'copy_url';
      case 'n':
        return 'copy_number';
      case 'r':
        return 'refresh';
    }
    // Unknown key - continue waiting
  }
}
