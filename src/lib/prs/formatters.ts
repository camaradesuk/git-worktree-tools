/**
 * PR display formatters - badges, colors, layout
 */

import * as colors from '../colors.js';
import type { PrDisplayItem, PrFilterState } from './types.js';

/**
 * Format relative time from ISO timestamp
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffWeeks < 4) return `${diffWeeks}w`;
  return `${diffMonths}mo`;
}

/**
 * Format state badge with color
 */
export function formatStateBadge(state: 'OPEN' | 'MERGED' | 'CLOSED'): string {
  switch (state) {
    case 'OPEN':
      return colors.green('[OPEN]');
    case 'MERGED':
      return colors.blue('[MERGED]');
    case 'CLOSED':
      return colors.red('[CLOSED]');
    default:
      return colors.dim(`[${state}]`);
  }
}

/**
 * Format draft badge
 */
export function formatDraftBadge(isDraft: boolean): string {
  return isDraft ? colors.yellow('[DRAFT]') : '';
}

/**
 * Format worktree indicator
 */
export function formatWorktreeIndicator(hasWorktree: boolean): string {
  return hasWorktree ? colors.cyan('WT') : '';
}

/**
 * Format review status indicator
 */
export function formatReviewStatus(
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null,
  approvalCount: number
): string {
  if (reviewDecision === 'APPROVED') {
    return colors.green(`\u2713${approvalCount}`);
  }
  if (reviewDecision === 'CHANGES_REQUESTED') {
    return colors.red('\u2717');
  }
  if (reviewDecision === 'REVIEW_REQUIRED') {
    return colors.yellow('\u25CB');
  }
  return '';
}

/**
 * Format CI status indicator
 */
export function formatCIStatus(checksStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null): string {
  switch (checksStatus) {
    case 'SUCCESS':
      return colors.green('\u25CF');
    case 'FAILURE':
      return colors.red('\u25CF');
    case 'PENDING':
      return colors.yellow('\u25CB');
    default:
      return '';
  }
}

/**
 * Format label badge (for preview label)
 */
export function formatLabelBadge(label: string): string {
  return colors.magenta(`[${label}]`);
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get the raw badge text (without colors) for a PR
 * Used to compute dynamic badge widths
 */
export function getPrBadgeText(pr: PrDisplayItem): string {
  const badge = `#${pr.number}`;
  return badge;
}

/**
 * Compute the maximum PR number width for alignment
 */
export function computeMaxPrNumberWidth(prs: PrDisplayItem[]): number {
  if (prs.length === 0) return 4; // "#XXX"
  const maxNum = Math.max(...prs.map((pr) => pr.number));
  return `#${maxNum}`.length;
}

/**
 * Alias for computeMaxPrNumberWidth (badge width = PR number width for list display)
 */
export function computeMaxPrBadgeWidth(prs: PrDisplayItem[]): number {
  return computeMaxPrNumberWidth(prs);
}

/**
 * Highlight search pattern in text
 */
function highlightSearchMatch(text: string, pattern?: string): string {
  if (!pattern || pattern.length === 0) {
    return text;
  }
  const lowerText = text.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  const index = lowerText.indexOf(lowerPattern);
  if (index === -1) {
    return text;
  }
  const before = text.substring(0, index);
  const match = text.substring(index, index + pattern.length);
  const after = text.substring(index + pattern.length);
  return before + colors.bold(colors.yellow(match)) + after;
}

// Column widths for consistent alignment
const COL_STATE = 8; // [OPEN], [MERGED], [CLOSED]
const COL_DRAFT = 7; // [DRAFT] or empty
const COL_TITLE = 32; // PR title (truncated)
const COL_AUTHOR = 14; // @username
const COL_AGE = 4; // 2h, 1d, etc.
const COL_WT = 2; // WT indicator
const COL_REVIEW = 3; // Review status
const COL_CI = 1; // CI status

/**
 * Format column header for PR list
 */
export function formatPrColumnHeader(prNumberWidth: number): string {
  const parts: string[] = [];

  parts.push(colors.dim('PR'.padStart(prNumberWidth)));
  parts.push(colors.dim('STATE'.padEnd(COL_STATE)));
  parts.push(colors.dim(''.padEnd(COL_DRAFT))); // DRAFT column (no header)
  parts.push(colors.dim('TITLE'.padEnd(COL_TITLE)));
  parts.push(colors.dim('AUTHOR'.padEnd(COL_AUTHOR)));
  parts.push(colors.dim('AGE'.padEnd(COL_AGE)));
  parts.push(colors.dim('WT'));
  parts.push(colors.dim('RV'));
  parts.push(colors.dim('CI'));

  return parts.join('  ');
}

/**
 * Format separator line for PR list header
 */
export function formatPrColumnSeparator(prNumberWidth: number): string {
  const totalWidth =
    prNumberWidth +
    2 +
    COL_STATE +
    2 +
    COL_DRAFT +
    2 +
    COL_TITLE +
    2 +
    COL_AUTHOR +
    2 +
    COL_AGE +
    2 +
    COL_WT +
    2 +
    COL_REVIEW +
    2 +
    COL_CI;
  return colors.dim('─'.repeat(totalWidth));
}

/**
 * Format a single PR line for list display
 */
export function formatPrListItem(
  pr: PrDisplayItem,
  prNumberWidth: number,
  previewLabel?: string,
  searchPattern?: string
): string {
  const parts: string[] = [];

  // PR number (right-aligned)
  const prNum = `#${pr.number}`.padStart(prNumberWidth);
  parts.push(colors.bold(prNum));

  // State badge (fixed width)
  const stateBadge = formatStateBadge(pr.state);
  // Calculate raw text length for padding (without ANSI codes)
  const stateRaw = pr.state === 'OPEN' ? '[OPEN]' : pr.state === 'MERGED' ? '[MERGED]' : '[CLOSED]';
  parts.push(stateBadge + ' '.repeat(COL_STATE - stateRaw.length));

  // Draft badge (fixed width column)
  if (pr.isDraft) {
    parts.push(formatDraftBadge(true));
  } else {
    parts.push(' '.repeat(COL_DRAFT));
  }

  // Title (truncated, with search highlighting) - fixed width
  let title = pr.title;
  // Add preview label indicator if matches
  if (previewLabel && pr.labels.some((l) => l.toLowerCase() === previewLabel.toLowerCase())) {
    title = `★ ${title}`;
  }
  const truncatedTitle = truncate(title, COL_TITLE);
  const highlightedTitle = highlightSearchMatch(truncatedTitle, searchPattern);
  const titlePadding = Math.max(0, COL_TITLE - truncatedTitle.length);
  parts.push(highlightedTitle + ' '.repeat(titlePadding));

  // Author (fixed width)
  const authorText = `@${pr.author}`;
  parts.push(colors.dim(truncate(authorText, COL_AUTHOR).padEnd(COL_AUTHOR)));

  // Age (fixed width)
  parts.push(colors.dim(formatRelativeTime(pr.updatedAt).padEnd(COL_AGE)));

  // Worktree indicator (fixed width)
  if (pr.hasWorktree) {
    parts.push(formatWorktreeIndicator(true));
  } else {
    parts.push(' '.repeat(COL_WT));
  }

  // Review status (fixed width)
  const reviewStr = formatReviewStatus(pr.reviewDecision, pr.approvalCount);
  if (reviewStr) {
    // The review string contains color codes, pad based on content
    const reviewRaw =
      pr.reviewDecision === 'APPROVED'
        ? `✓${pr.approvalCount}`
        : pr.reviewDecision === 'CHANGES_REQUESTED'
          ? '✗'
          : '○';
    parts.push(reviewStr + ' '.repeat(Math.max(0, COL_REVIEW - reviewRaw.length)));
  } else {
    parts.push(' '.repeat(COL_REVIEW));
  }

  // CI status (fixed width)
  const ciStr = formatCIStatus(pr.checksStatus);
  if (ciStr) {
    parts.push(ciStr);
  } else {
    parts.push(' '.repeat(COL_CI));
  }

  return parts.join('  ');
}

/**
 * Format PR list header
 */
export function formatPrListHeader(repoName: string): string {
  const lines: string[] = [];
  lines.push(
    colors.cyan(
      colors.bold(
        '\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557'
      )
    )
  );
  lines.push(
    colors.cyan(colors.bold('\u2551')) +
      colors.bold(`  ${repoName} Pull Requests`.padEnd(66)) +
      colors.cyan(colors.bold('\u2551'))
  );
  lines.push(
    colors.cyan(
      colors.bold(
        '\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n'
      )
    )
  );
  return lines.join('\n');
}

/**
 * Format summary line
 */
export function formatPrSummary(prs: PrDisplayItem[]): string {
  const total = prs.length;
  const open = prs.filter((p) => p.state === 'OPEN').length;
  const drafts = prs.filter((p) => p.isDraft).length;
  const withWorktree = prs.filter((p) => p.hasWorktree).length;

  const parts: string[] = [`${total} PRs`];
  if (open > 0) parts.push(`${open} open`);
  if (drafts > 0) parts.push(`${drafts} drafts`);
  if (withWorktree > 0) parts.push(`${withWorktree} with worktrees`);

  return colors.dim(parts.join(' \u00B7 '));
}

/**
 * Get human-readable description of current state filter
 */
function describeCurrentStateFilter(filters: PrFilterState): string {
  const states = filters.states;
  if (states.size === 3) {
    return 'all';
  }
  if (states.size === 1) {
    if (states.has('OPEN')) return 'open';
    if (states.has('MERGED')) return 'merged';
    if (states.has('CLOSED')) return 'closed';
  }
  // Multiple but not all - list them
  const stateNames: string[] = [];
  if (states.has('OPEN')) stateNames.push('open');
  if (states.has('MERGED')) stateNames.push('merged');
  if (states.has('CLOSED')) stateNames.push('closed');
  return stateNames.join('+');
}

/**
 * Get human-readable description of draft filter
 */
function describeDraftFilter(showDrafts: boolean | 'only'): string {
  if (showDrafts === 'only') return 'drafts only';
  if (showDrafts === false) return 'no drafts';
  return ''; // included by default, no need to show
}

/**
 * Format filter indicator line
 * Shows current view clearly with available shortcuts
 */
export function formatFilterIndicator(filters: PrFilterState): string {
  // Build "Showing: X PRs" description
  const stateDesc = describeCurrentStateFilter(filters);
  const draftDesc = describeDraftFilter(filters.showDrafts);

  let showingText = stateDesc;
  if (draftDesc) {
    showingText += `, ${draftDesc}`;
  }

  // Build shortcut hints with current selection highlighted
  const shortcuts: string[] = [];
  const states = filters.states;

  // State shortcuts - highlight the active one
  const isOpen = states.size === 1 && states.has('OPEN');
  const isMerged = states.size === 1 && states.has('MERGED');
  const isClosed = states.size === 1 && states.has('CLOSED');
  const isAll = states.size === 3;

  shortcuts.push(isOpen ? colors.green('[o] open') : colors.dim('[o] open'));
  shortcuts.push(isMerged ? colors.blue('[m] merged') : colors.dim('[m] merged'));
  shortcuts.push(isClosed ? colors.red('[x] closed') : colors.dim('[x] closed'));
  shortcuts.push(isAll ? colors.cyan('[a] all') : colors.dim('[a] all'));

  // Draft shortcut - show current state
  if (filters.showDrafts === 'only') {
    shortcuts.push(colors.yellow('[d] drafts only'));
  } else if (filters.showDrafts === false) {
    shortcuts.push(colors.dim('[d] no drafts'));
  } else {
    shortcuts.push(colors.dim('[d] drafts'));
  }

  return `Showing: ${colors.bold(showingText)}  ·  ${shortcuts.join('  ')}`;
}

/**
 * Format shortcut legend
 */
export function formatShortcutLegend(): string {
  const shortcuts = [
    `${colors.cyan('[w]')} worktree`,
    `${colors.cyan('[b]')} browser`,
    `${colors.cyan('[d]')} details`,
    `${colors.cyan('[f]')} filter`,
    `${colors.cyan('[/]')} search`,
    `${colors.cyan('[r]')} refresh`,
    `${colors.cyan('[q]')} quit`,
  ];
  return colors.dim('Shortcuts: ') + shortcuts.join(colors.dim(' \u00B7 '));
}

/**
 * Format table output for non-interactive mode
 */
export function formatPrTable(prs: PrDisplayItem[], previewLabel?: string): string {
  if (prs.length === 0) {
    return colors.dim('No pull requests found.');
  }

  const lines: string[] = [];
  const prNumWidth = computeMaxPrNumberWidth(prs);

  // Add header and separator
  lines.push(formatPrColumnHeader(prNumWidth));
  lines.push(formatPrColumnSeparator(prNumWidth));

  for (const pr of prs) {
    lines.push(formatPrListItem(pr, prNumWidth, previewLabel));
  }

  return lines.join('\n');
}
