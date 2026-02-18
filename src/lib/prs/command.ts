/**
 * Shared prs command implementation
 *
 * The canonical runPrsCommand() used by both:
 *   - src/cli/prs.ts (standalone `prs` binary)
 *   - src/cli/wt/prs.ts (`wt prs` subcommand)
 *
 * This ensures both entry points have identical behavior,
 * including the refreshPrs callback for interactive mode.
 */

import * as path from 'path';
import * as git from '../git.js';
import * as colors from '../colors.js';
import { loadConfig } from '../config.js';
import { isGhInstalled, isAuthenticated, getRepoInfo } from '../github.js';
import {
  fetchPrsWithWorktrees,
  applyFilters,
  clearPrCache,
  createDefaultDataDeps,
} from './data.js';
import {
  createDefaultFilterState,
  type PrsCommandOptions,
  type PrDisplayItem,
  type PrsJsonOutput,
} from './types.js';
import { formatPrListHeader, formatPrSummary, formatPrTable } from './formatters.js';
import { runPrInteractiveMode, createDefaultPrInteractiveDeps } from './interactive.js';
import {
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorSuggestion,
} from '../json-output.js';

/**
 * Output error in JSON format
 */
export function outputJsonError(code: ErrorCode, message: string): void {
  const result = createErrorResult('prs', code, message, undefined, getErrorSuggestion(code));
  console.log(formatJsonResult(result));
}

/**
 * Run the prs command
 */
export async function runPrsCommand(options: PrsCommandOptions): Promise<void> {
  const jsonMode = options.json || false;
  // Both stdin and stdout must be TTY for interactive mode to work properly
  const isTTY = process.stdout.isTTY && process.stdin.isTTY;
  const interactive = isTTY && !options.noInteractive && !jsonMode;

  // Check prerequisites
  let repoRoot: string;
  try {
    repoRoot = git.getRepoRoot();
  } catch {
    if (jsonMode) {
      outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not in a git repository');
    } else {
      console.error(colors.error('Not in a git repository'));
      console.error(colors.dim('Please run this command from within a git repository.'));
    }
    process.exit(1);
  }

  if (!isGhInstalled()) {
    if (jsonMode) {
      outputJsonError(ErrorCode.GH_NOT_INSTALLED, 'GitHub CLI (gh) is not installed');
    } else {
      console.error(colors.error('GitHub CLI (gh) is not installed'));
      console.error(colors.dim('Install it from: https://cli.github.com/'));
    }
    process.exit(1);
  }

  if (!isAuthenticated()) {
    if (jsonMode) {
      outputJsonError(ErrorCode.GH_NOT_AUTHENTICATED, 'Not authenticated with GitHub CLI');
    } else {
      console.error(colors.error('Not authenticated with GitHub CLI'));
      console.error(colors.dim('Run: gh auth login'));
    }
    process.exit(1);
  }

  // Get repo info for header
  const repoInfo = getRepoInfo(repoRoot);
  const repoName = repoInfo?.name || path.basename(repoRoot);

  // Load config for preview label
  const config = loadConfig(repoRoot);
  const previewLabel = config.previewLabel || 'preview';

  // Fetch PRs
  const deps = createDefaultDataDeps();
  const forceRefresh = options.refresh || false;

  if (forceRefresh) {
    clearPrCache();
  }

  let prs: PrDisplayItem[];
  try {
    // In interactive mode, fetch ALL PRs so filter toggles work
    // Filtering is done client-side in runPrInteractiveMode
    const fetchState = interactive ? 'all' : options.state;

    prs = fetchPrsWithWorktrees(
      {
        state: fetchState,
        author: options.author, // gh CLI natively supports @me
        labels: options.label,
        limit: options.limit,
      },
      deps,
      forceRefresh,
      repoRoot
    );
  } catch (error) {
    if (jsonMode) {
      outputJsonError(
        ErrorCode.GH_API_ERROR,
        error instanceof Error ? error.message : 'Failed to fetch PRs'
      );
    } else {
      console.error(colors.error('Failed to fetch PRs from GitHub'));
      if (error instanceof Error) {
        console.error(colors.dim(error.message));
      }
    }
    process.exit(1);
  }

  // Build initial filter state from options
  const filterState = createDefaultFilterState();

  // Set state filter from options
  if (options.state === 'all') {
    filterState.states = new Set(['OPEN', 'MERGED', 'CLOSED']);
  } else if (options.state === 'merged') {
    filterState.states = new Set(['MERGED']);
  } else if (options.state === 'closed') {
    filterState.states = new Set(['CLOSED']);
  } else {
    filterState.states = new Set(['OPEN']);
  }

  // Set draft filter
  if (options.draft) {
    filterState.showDrafts = 'only';
  } else if (options.noDraft) {
    filterState.showDrafts = false;
  }

  // Set worktree filter
  if (options.withWorktree) {
    filterState.hasWorktree = true;
  }

  // Output based on mode
  if (jsonMode) {
    const filteredPrs = applyFilters(prs, filterState);
    const output: PrsJsonOutput = {
      success: true,
      command: 'prs',
      timestamp: new Date().toISOString(),
      data: {
        total: filteredPrs.length,
        filters: {
          states: Array.from(filterState.states),
          showDrafts: filterState.showDrafts,
          labels: filterState.labels,
          author: filterState.author,
          hasWorktree: filterState.hasWorktree,
        },
        prs: filteredPrs,
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (interactive) {
    // Create interactive deps with refresh callback
    const interactiveDeps = createDefaultPrInteractiveDeps();
    interactiveDeps.refreshPrs = async () => {
      clearPrCache();
      return fetchPrsWithWorktrees(
        {
          state: 'all',
          author: options.author, // gh CLI natively supports @me
          labels: options.label,
          limit: options.limit,
        },
        deps,
        true,
        repoRoot
      );
    };

    // Run interactive PR browser - pass ALL PRs, filtering is done inside
    await runPrInteractiveMode(prs, repoName, previewLabel, filterState, interactiveDeps);
  } else {
    // Non-interactive table output - apply filters here
    const filteredPrs = applyFilters(prs, filterState);
    console.log(formatPrListHeader(repoName));
    console.log(formatPrSummary(filteredPrs));
    console.log();
    console.log(formatPrTable(filteredPrs, previewLabel));
    console.log();
  }
}
