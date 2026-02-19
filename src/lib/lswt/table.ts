/**
 * lswt table - shared printWorktreeTable function
 *
 * Extracted from src/cli/lswt.ts to allow both lswt.ts and wt/list.ts
 * to display worktree tables without code duplication.
 */

import * as path from 'path';
import { formatTypeLabel, getDisplayPath } from './formatters.js';
import { printTable as sharedPrintTable, printStatus, changeIndicator } from '../ui/index.js';
import { cyan, green, yellow, red, blue, dim } from '../colors.js';
import type { WorktreeDisplay, ListOptions } from './types.js';

const colorMap = {
  cyan,
  green,
  yellow,
  red,
  blue,
  dim,
} as const;

/**
 * Print worktree table to stdout using shared UI primitives.
 *
 * Displays a formatted table of worktrees with type labels, branch names,
 * paths, and optional commit hashes. Shows a summary line with counts.
 */
export function printWorktreeTable(
  worktrees: WorktreeDisplay[],
  options: ListOptions,
  cwd: string
): void {
  if (worktrees.length === 0) {
    printStatus('info', 'No worktrees found.');
    return;
  }

  const repoName = path.basename(worktrees[0].path.replace(/\.pr\d+$/, ''));

  const rows = worktrees.map((wt) => {
    const { text, color } = formatTypeLabel(wt);
    const typeLabel = colorMap[color](text);
    const ci = changeIndicator(wt.hasChanges);

    const fields: Array<{ key: string; value: string }> = [
      { key: 'Branch', value: wt.branch || dim('(detached)') },
      { key: 'Path', value: getDisplayPath(wt.path, cwd, options.verbose) },
    ];
    if (options.verbose) {
      fields.push({ key: 'Commit', value: dim(wt.commit) });
    }

    return { label: typeLabel, indicator: ci, fields };
  });

  // Build summary
  const prCount = worktrees.filter((w) => w.type === 'pr').length;
  const openCount = worktrees.filter((w) => w.prState === 'OPEN').length;
  const changesCount = worktrees.filter((w) => w.hasChanges).length;
  const parts: string[] = [`${worktrees.length} worktrees`];
  if (prCount > 0) parts.push(`${prCount} PRs`);
  if (openCount > 0) parts.push(`${openCount} open`);
  if (changesCount > 0) parts.push(red(`${changesCount} with changes`));

  sharedPrintTable({
    title: `${repoName} worktrees:`,
    rows,
    summary: parts.join(' · '),
  });
}
