#!/usr/bin/env node
/**
 * lswt - List git worktrees with PR status
 *
 * CLI thin wrapper - orchestration and side effects only
 */

import * as path from 'path';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as colors from '../lib/colors.js';
import {
  parseArgs,
  getHelpText,
  formatTypeLabel,
  getDisplayPath,
  formatJsonOutput,
  gatherWorktreeInfo,
  createDefaultDeps,
  runInteractiveMode,
} from '../lib/lswt/index.js';
import type { WorktreeDisplay, ListOptions } from '../lib/lswt/index.js';

const colorMap = {
  cyan: colors.cyan,
  green: colors.green,
  yellow: colors.yellow,
  red: colors.red,
  blue: colors.blue,
  dim: colors.dim,
} as const;

function printTable(worktrees: WorktreeDisplay[], options: ListOptions, cwd: string): void {
  if (worktrees.length === 0) {
    console.log(colors.info('No worktrees found.'));
    return;
  }

  const repoName = path.basename(worktrees[0].path.replace(/\.pr\d+$/, ''));
  console.log('');
  console.log(colors.bold(`${repoName} worktrees:`));
  console.log('');

  for (const wt of worktrees) {
    const { text, color } = formatTypeLabel(wt);
    const typeLabel = colorMap[color](text);
    const changeIndicator = wt.hasChanges ? colors.red(' *') : '';

    console.log(`  ${typeLabel}${changeIndicator}`);
    console.log(`    Branch: ${wt.branch || colors.dim('(detached)')}`);

    const displayPath = getDisplayPath(wt.path, cwd, options.verbose);
    console.log(`    Path:   ${displayPath}`);

    if (options.verbose) {
      console.log(`    Commit: ${colors.dim(wt.commit)}`);
    }
    console.log('');
  }

  // Summary
  const prCount = worktrees.filter((w) => w.type === 'pr').length;
  const openCount = worktrees.filter((w) => w.prState === 'OPEN').length;
  const changesCount = worktrees.filter((w) => w.hasChanges).length;

  const parts: string[] = [`${worktrees.length} worktrees`];
  if (prCount > 0) parts.push(`${prCount} PRs`);
  if (openCount > 0) parts.push(`${openCount} open`);
  if (changesCount > 0) parts.push(colors.red(`${changesCount} with changes`));

  console.log(colors.dim(parts.join(' · ')));
  console.log('');
}

async function main(): Promise<void> {
  const result = parseArgs(process.argv.slice(2));

  if (result.kind === 'help') {
    console.log(getHelpText());
    process.exit(0);
  }

  if (result.kind === 'error') {
    console.error(colors.error(result.message));
    process.exit(1);
  }

  const options = result.options;

  // Check for gh cli if status requested
  if (options.showStatus && !github.isGhInstalled()) {
    console.error(colors.warning('GitHub CLI (gh) not installed. PR status will not be shown.'));
    console.error(colors.dim('Install: https://cli.github.com/'));
    options.showStatus = false;
  }

  // Find repo root
  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    process.exit(1);
  }

  // Gather worktree info
  const deps = createDefaultDeps();
  const worktrees = await gatherWorktreeInfo(repoRoot, options, deps);

  // Determine if we should use interactive mode
  // Default to interactive if TTY and not explicitly disabled, and not JSON output
  const useInteractive =
    options.interactive === true ||
    (options.interactive === undefined && process.stdout.isTTY && !options.json);

  // Output
  if (options.json) {
    console.log(formatJsonOutput(worktrees));
  } else if (useInteractive) {
    await runInteractiveMode(worktrees, options);
  } else {
    printTable(worktrees, options, process.cwd());
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);

  // Provide friendly message for common errors
  if (message.includes('not a git repository')) {
    console.error(colors.error('Not a git repository'));
    console.error(colors.dim('Run this command from within a git repository.'));
  } else {
    console.error(colors.error(`Error: ${message}`));
  }
  process.exit(1);
});
