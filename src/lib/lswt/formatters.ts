/**
 * lswt formatters - pure formatting functions
 */

import * as path from 'path';
import type { WorktreeDisplay, TypeLabel } from './types.js';

/**
 * Extract PR number from worktree path - pure function
 */
export function extractPrNumber(worktreePath: string): number | null {
  const name = path.basename(worktreePath);

  const patterns = [/\.pr(\d+)$/, /\.pr-(\d+)$/, /-pr(\d+)$/, /_pr(\d+)$/];

  for (const p of patterns) {
    const match = name.match(p);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Check if worktree path matches main worktree - pure function
 */
export function isMainWorktree(worktreePath: string, repoRoot: string): boolean {
  return path.resolve(worktreePath) === path.resolve(repoRoot);
}

/**
 * Format type label - returns text and color name for CLI to apply
 */
export function formatTypeLabel(display: WorktreeDisplay): TypeLabel {
  switch (display.type) {
    case 'main':
      return { text: '[main]', color: 'cyan' };
    case 'pr': {
      const prLabel = `PR #${display.prNumber}`;
      if (display.prState === 'OPEN') {
        return { text: `[${prLabel} OPEN]`, color: 'green' };
      } else if (display.prState === 'MERGED') {
        return { text: `[${prLabel} MERGED]`, color: 'yellow' };
      } else if (display.prState === 'CLOSED') {
        return { text: `[${prLabel} CLOSED]`, color: 'red' };
      } else {
        return { text: `[${prLabel}]`, color: 'dim' };
      }
    }
    case 'remote_pr': {
      const prLabel = `PR #${display.prNumber}`;
      if (display.isDraft) {
        return { text: `[${prLabel} REMOTE DRAFT]`, color: 'yellow' };
      }
      return { text: `[${prLabel} REMOTE]`, color: 'dim' };
    }
    case 'branch':
      return { text: '[branch]', color: 'blue' };
    case 'detached':
      return { text: '[detached]', color: 'dim' };
    default:
      return { text: '[unknown]', color: 'dim' };
  }
}

/**
 * Sort worktrees: main first, then local PRs by number, then remote PRs by number, then others by name
 */
export function sortWorktrees(worktrees: WorktreeDisplay[]): WorktreeDisplay[] {
  return [...worktrees].sort((a, b) => {
    if (a.type === 'main') return -1;
    if (b.type === 'main') return 1;
    // Local PRs come before remote PRs
    if (a.type === 'pr' && b.type === 'pr') {
      return (a.prNumber || 0) - (b.prNumber || 0);
    }
    if (a.type === 'pr' && b.type !== 'remote_pr') return -1;
    if (b.type === 'pr' && a.type !== 'remote_pr') return 1;
    // Remote PRs come after local PRs but before other types
    if (a.type === 'remote_pr' && b.type === 'remote_pr') {
      return (a.prNumber || 0) - (b.prNumber || 0);
    }
    if (a.type === 'pr') return -1;
    if (b.type === 'pr') return 1;
    if (a.type === 'remote_pr') return -1;
    if (b.type === 'remote_pr') return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Normalize path to use forward slashes (POSIX style) for consistent output
 */
function toPosixPath(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Get relative display path - pure function
 * Returns a user-friendly path, showing "(current)" for the current directory
 */
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
  } else if (worktreePath.startsWith(path.dirname(cwd))) {
    const rel = path.relative(path.dirname(cwd), worktreePath);
    return toPosixPath(rel);
  }

  return worktreePath;
}

/**
 * Format JSON output - pure function
 */
export function formatJsonOutput(worktrees: WorktreeDisplay[]): string {
  const output = worktrees.map((wt) => ({
    path: wt.path,
    name: wt.name,
    branch: wt.branch,
    commit: wt.commit,
    type: wt.type,
    prNumber: wt.prNumber,
    prState: wt.prState,
    isDraft: wt.isDraft,
    hasChanges: wt.hasChanges,
  }));

  return JSON.stringify(output, null, 2);
}
