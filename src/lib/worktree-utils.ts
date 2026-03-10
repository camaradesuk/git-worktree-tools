/**
 * Shared worktree utilities used by lswt, cleanpr, and other tools
 */

import * as path from 'path';
import { DEFAULT_WORKTREE_PATTERN } from './constants.js';
import * as github from './github.js';
import * as git from './git.js';
import { logger } from './logger.js';

/**
 * Options for PR number extraction
 */
export interface ExtractPrNumberOptions {
  /** Configured worktree naming pattern */
  worktreePattern?: string;
}

/**
 * Convert a worktree naming pattern to a regex for PR number extraction.
 * Replaces {number} with a capture group and other placeholders with .*
 */
function patternToRegex(pattern: string): RegExp | null {
  if (!pattern.includes('{number}')) {
    return null;
  }

  // Escape regex special characters first, then replace placeholders
  let regexStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Now replace escaped placeholder sequences
  regexStr = regexStr.replace('\\{repo\\}', '.*?');
  regexStr = regexStr.replace('\\{number\\}', '(\\d+)');
  regexStr = regexStr.replace('\\{branch\\}', '.*?');
  regexStr = regexStr.replace('\\{slug\\}', '.*?');

  // Anchor to full string
  regexStr = `^${regexStr}$`;

  try {
    return new RegExp(regexStr);
  } catch {
    return null;
  }
}

/**
 * Extract PR number from a worktree path using config-aware pattern matching.
 *
 * Resolution chain:
 * 1. Configured pattern (if provided)
 * 2. Default pattern ({repo}.pr{number})
 *
 * For async extraction with gh CLI fallback, use extractPrNumberAsync.
 */
export function extractPrNumber(
  worktreePath: string,
  options: ExtractPrNumberOptions = {}
): number | null {
  if (!worktreePath) {
    return null;
  }

  const name = path.basename(worktreePath);

  // 1. Try configured pattern
  if (options.worktreePattern) {
    const regex = patternToRegex(options.worktreePattern);
    if (regex) {
      const match = name.match(regex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  // 2. Try default pattern (skip if same as configured)
  if (options.worktreePattern !== DEFAULT_WORKTREE_PATTERN) {
    const defaultRegex = patternToRegex(DEFAULT_WORKTREE_PATTERN);
    if (defaultRegex) {
      const match = name.match(defaultRegex);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  return null;
}

/**
 * Extract PR number with gh CLI fallback.
 *
 * Resolution chain:
 * 1. Configured pattern
 * 2. Default pattern
 * 3. gh CLI: look up branch from git worktree list, query gh pr list --head <branch>
 */
export async function extractPrNumberAsync(
  worktreePath: string,
  options: ExtractPrNumberOptions & { cwd?: string } = {}
): Promise<number | null> {
  // Try synchronous extraction first
  const syncResult = extractPrNumber(worktreePath, options);
  if (syncResult !== null) {
    return syncResult;
  }

  // 3. gh CLI fallback: find branch for this worktree, then query GitHub
  try {
    const worktrees = git.listWorktrees(options.cwd);
    const resolvedPath = path.resolve(worktreePath);
    const wt = worktrees.find((w) => path.resolve(w.path) === resolvedPath);

    if (wt?.branch) {
      logger.debug(`Falling back to gh CLI for PR extraction: branch=${wt.branch}`);
      const prInfo = github.getPrByBranch(wt.branch, options.cwd);
      if (prInfo) {
        return prInfo.number;
      }
    }
  } catch (error) {
    logger.debug(
      'gh CLI fallback for PR extraction failed: %s',
      error instanceof Error ? error.message : String(error)
    );
  }

  return null;
}
