#!/usr/bin/env node
/**
 * wt - Unified command for git worktree tools
 *
 * A master command that encompasses all git-worktree-tools functionality
 * via subcommands, providing a consistent interface.
 *
 * Commands:
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
import { completionCommand } from './wt/completion.js';

yargs(hideBin(process.argv))
  .scriptName('wt')
  .usage('$0 <command> [options]')
  .command(newCommand)
  .command(listCommand)
  .command(cleanCommand)
  .command(linkCommand)
  .command(stateCommand)
  .command(configCommand)
  .command(completionCommand)
  .completion('get-yargs-completions', false) // Enable yargs completion for bash script
  .demandCommand(1, 'You need to specify a command. Run "wt --help" for usage.')
  .alias('h', 'help')
  .alias('v', 'version')
  .help()
  .version()
  .wrap(Math.min(100, process.stdout.columns ?? 100))
  .example('wt new "Add dark mode"', 'Create new PR with worktree')
  .example('wt n "Fix bug"', 'Short alias for wt new')
  .example('wt list', 'List all worktrees with PR status')
  .example('wt ls --json', 'List worktrees in JSON format')
  .example('wt clean', 'Interactive cleanup of merged PRs')
  .example('wt clean --all', 'Clean all merged/closed PR worktrees')
  .example('wt link', 'Interactive config file linking')
  .example('wt state', 'Show current worktree state')
  .example('wt config show', 'Show current configuration')
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
