#!/usr/bin/env node
/**
 * prs - Browse repository pull requests
 *
 * Standalone CLI entry point for the prs command.
 * This allows it to be called via runSubcommand from the interactive menu.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as path from 'path';
import * as git from '../lib/git.js';
import * as colors from '../lib/colors.js';
import { loadConfig } from '../lib/config.js';
import { isGhInstalled, isAuthenticated, getRepoInfo } from '../lib/github.js';
import {
  fetchPrsWithWorktrees,
  applyFilters,
  clearPrCache,
  createDefaultDataDeps,
} from '../lib/prs/data.js';
import {
  createDefaultFilterState,
  type PrsCommandOptions,
  type PrDisplayItem,
  type PrsJsonOutput,
} from '../lib/prs/types.js';
import { formatPrListHeader, formatPrSummary, formatPrTable } from '../lib/prs/formatters.js';
import { runPrInteractiveMode, createDefaultPrInteractiveDeps } from '../lib/prs/interactive.js';
import {
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  getErrorSuggestion,
} from '../lib/json-output.js';

/**
 * Check if --json flag is present in args (for early error handling)
 */
export function hasJsonFlag(args: string[]): boolean {
  return args.includes('--json') || args.includes('-j');
}

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
  const isTTY = process.stdout.isTTY;
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
        author: options.author === '@me' ? undefined : options.author,
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
          author: options.author === '@me' ? undefined : options.author,
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

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const jsonMode = hasJsonFlag(rawArgs);

  const argv = await yargs(hideBin(process.argv))
    .scriptName('prs')
    .usage('$0 [options]\n\nBrowse repository pull requests')
    .option('state', {
      alias: 's',
      type: 'string',
      choices: ['open', 'closed', 'merged', 'all'] as const,
      description: 'Filter by PR state (default: open)',
    })
    .option('author', {
      alias: 'a',
      type: 'string',
      description: 'Filter by author (use @me for yourself)',
    })
    .option('label', {
      alias: 'l',
      type: 'array',
      string: true,
      description: 'Filter by label (can be repeated)',
    })
    .option('draft', {
      type: 'boolean',
      description: 'Show only draft PRs',
    })
    .option('no-draft', {
      type: 'boolean',
      description: 'Exclude draft PRs',
    })
    .option('with-worktree', {
      type: 'boolean',
      description: 'Show only PRs that have local worktrees',
    })
    .option('limit', {
      alias: 'n',
      type: 'number',
      description: 'Maximum PRs to fetch',
      default: 50,
    })
    .option('json', {
      alias: 'j',
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    })
    .option('interactive', {
      alias: 'i',
      type: 'boolean',
      description: 'Enable interactive mode (use --no-interactive to disable)',
      default: true,
    })
    .option('refresh', {
      alias: 'r',
      type: 'boolean',
      description: 'Force refresh from GitHub (bypass cache)',
      default: false,
    })
    .help()
    .alias('h', 'help')
    .parse();

  const options: PrsCommandOptions = {
    state: (argv.state as 'open' | 'closed' | 'merged' | 'all') || 'open',
    author: argv.author,
    label: argv.label,
    draft: argv.draft,
    noDraft: argv['no-draft'],
    withWorktree: argv['with-worktree'],
    limit: argv.limit || 50,
    json: argv.json,
    noInteractive: argv.interactive === false,
    refresh: argv.refresh,
  };

  await runPrsCommand(options);
}

// Only run main() when this file is executed directly (not when imported)
// Check if running as main module (ESM)
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMain || process.argv[1]?.endsWith('prs.js')) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    const jsonMode = hasJsonFlag(process.argv.slice(2));

    if (jsonMode) {
      outputJsonError(ErrorCode.UNKNOWN_ERROR, message);
    } else {
      console.error(colors.error(`Error: ${message}`));
    }
    process.exit(1);
  });
}
