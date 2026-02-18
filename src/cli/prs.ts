#!/usr/bin/env node
/**
 * prs - Browse repository pull requests
 *
 * Standalone CLI entry point for the prs command.
 * This allows it to be called via runSubcommand from the interactive menu.
 *
 * The actual command logic lives in src/lib/prs/command.ts (shared with wt prs).
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as colors from '../lib/colors.js';
import type { PrsCommandOptions } from '../lib/prs/types.js';
import { runPrsCommand, outputJsonError } from '../lib/prs/command.js';
import { ErrorCode } from '../lib/json-output.js';

// Re-export for downstream consumers
export { runPrsCommand, outputJsonError } from '../lib/prs/command.js';

/**
 * Check if --json flag is present in args (for early error handling)
 */
export function hasJsonFlag(args: string[]): boolean {
  return args.includes('--json') || args.includes('-j');
}

async function main(): Promise<void> {
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
