#!/usr/bin/env node
/**
 * wt - Unified command for git worktree tools
 *
 * A master command that encompasses all git-worktree-tools functionality
 * via subcommands, providing a consistent interface.
 *
 * Commands:
 *   wt                       Interactive main menu
 *   wt new <description>     Create a new PR with worktree (newpr)
 *   wt list                  List worktrees with status (lswt)
 *   wt clean [pr-number]     Clean up merged/closed worktrees (cleanpr)
 *   wt link [subcommand]     Manage config file linking (wtlink)
 *   wt state                 Query git worktree state (wtstate)
 *   wt config [subcommand]   Configuration management (wtconfig)
 *
 * Short Aliases:
 *   wt n    -> wt new
 *   wt ls   -> wt list
 *   wt c    -> wt clean
 *   wt l    -> wt link
 *   wt s    -> wt state
 *   wt cfg  -> wt config
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { newCommand } from './wt/new.js';
import { listCommand } from './wt/list.js';
import { cleanCommand } from './wt/clean.js';
import { linkCommand } from './wt/link.js';
import { stateCommand } from './wt/state.js';
import { configCommand } from './wt/config.js';
import { initCommand } from './wt/init.js';
import { completionCommand } from './wt/completion.js';
import { showMainMenu } from './wt/interactive-menu.js';
import { initializeLogger, parseLogLevel, LogLevel } from '../lib/logger.js';
import { loadConfig } from '../lib/config.js';
import { checkAndWarnGlobalInstall } from '../lib/global-check.js';
import * as git from '../lib/git.js';

// Initialize logger early (before yargs) for proper log output
// Only reads CLI flags - config-based settings applied later
function initializeLoggerFromCliFlags(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('-v') || args.includes('--verbose');
  const veryVerbose = args.filter((a) => a === '-v').length >= 2;
  const debug = args.includes('--debug');
  const quiet = args.includes('-q') || args.includes('--quiet');
  const logFileIdx = args.findIndex((a) => a === '--log-file');
  const logFile = logFileIdx >= 0 ? args[logFileIdx + 1] : undefined;

  // Initialize logger with CLI flags first
  initializeLogger({
    verbose: veryVerbose ? 2 : verbose,
    debug,
    quiet,
    logFile,
  });
}

// Non-critical initialization that can run after yargs parsing
// Exported for testing
export function initializeCliEnvironment(): void {
  // Try to load config for logging settings
  let config;
  try {
    const repoRoot = git.getRepoRoot();
    config = loadConfig(repoRoot);
  } catch {
    // Not in a git repo, load global config only
    config = loadConfig();
  }

  // Re-initialize logger with config values (if not already set by CLI flags)
  const args = process.argv.slice(2);
  const hasCliLogLevel =
    args.includes('-v') ||
    args.includes('--verbose') ||
    args.includes('--debug') ||
    args.includes('-q') ||
    args.includes('--quiet');
  const hasCliLogFile = args.includes('--log-file');

  // Apply config-based logging if CLI flags weren't provided
  if (!hasCliLogLevel || !hasCliLogFile) {
    initializeLogger({
      configLogLevel: hasCliLogLevel ? undefined : config.logging?.level,
      configLogFile: hasCliLogFile ? undefined : config.logging?.logFile,
    });
  }

  // Check global installation (non-critical warning)
  checkAndWarnGlobalInstall(config);
}

// Initialize logger early (CLI flags only)
initializeLoggerFromCliFlags();

// Track if deferred init has run to avoid duplicates
let deferredInitComplete = false;

yargs(hideBin(process.argv))
  .scriptName('wt')
  .usage('$0 [command] [options]')
  .middleware(() => {
    // Run deferred initialization once per CLI invocation
    // This runs after yargs parses but before command handlers
    if (!deferredInitComplete) {
      deferredInitComplete = true;
      initializeCliEnvironment();
    }
  })
  .option('verbose', {
    alias: 'v',
    type: 'count',
    description: 'Increase verbosity (-v for debug, -vv for trace)',
    global: true,
  })
  .option('debug', {
    type: 'boolean',
    description: 'Enable debug output',
    global: true,
  })
  .option('quiet', {
    alias: 'q',
    type: 'boolean',
    description: 'Suppress non-essential output',
    global: true,
  })
  .option('log-file', {
    type: 'string',
    description: 'Write logs to file',
    global: true,
  })
  .command(
    '$0',
    'Interactive main menu (when no command specified)',
    () => {},
    async () => {
      await showMainMenu();
    }
  )
  .command(newCommand)
  .command(listCommand)
  .command(cleanCommand)
  .command(linkCommand)
  .command(stateCommand)
  .command(configCommand)
  .command(initCommand)
  .command(completionCommand)
  .completion('get-yargs-completions', false) // Enable yargs completion for bash script
  .alias('h', 'help')
  .help()
  .version()
  .wrap(Math.min(100, process.stdout.columns ?? 100))
  .example('wt', 'Launch interactive main menu')
  .example('wt new "Add dark mode"', 'Create new PR with worktree')
  .example('wt n "Fix bug"', 'Short alias for wt new')
  .example('wt list', 'List all worktrees with PR status')
  .example('wt ls --json', 'List worktrees in JSON format')
  .example('wt clean', 'Interactive cleanup of merged PRs')
  .example('wt clean --all', 'Clean all merged/closed PR worktrees')
  .example('wt link', 'Interactive config file linking')
  .example('wt state', 'Show current worktree state')
  .example('wt config show', 'Show current configuration')
  .example('wt init', 'Initialize local/global configuration')
  .example('wt -v new "Feature"', 'Create PR with verbose logging')
  .strict()
  .fail((msg, err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.error(msg);
    }
    process.exit(1);
  })
  .parseAsync()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
