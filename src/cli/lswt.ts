#!/usr/bin/env node
/**
 * lswt - List git worktrees with PR status
 *
 * Usage:
 *   lswt              List all worktrees
 *   lswt --status     Include PR status (open/merged/closed)
 *   lswt --json       Output as JSON
 */

import * as path from 'path';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as colors from '../lib/colors.js';
import { loadConfig } from '../lib/config.js';

interface ListOptions {
  showStatus: boolean;
  json: boolean;
  verbose: boolean;
}

interface WorktreeDisplay {
  path: string;
  name: string;
  branch: string | null;
  commit: string;
  type: 'main' | 'pr' | 'branch' | 'detached';
  prNumber: number | null;
  prState: string | null;
  hasChanges: boolean;
}

function parseArgs(): ListOptions {
  const args = process.argv.slice(2);
  const options: ListOptions = {
    showStatus: false,
    json: false,
    verbose: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '-s':
      case '--status':
        options.showStatus = true;
        break;
      case '-j':
      case '--json':
        options.json = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(colors.error(`Unknown option: ${arg}`));
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
${colors.bold('lswt')} - List git worktrees with PR status

${colors.bold('USAGE')}
  lswt [options]

${colors.bold('OPTIONS')}
  -s, --status    Include PR status from GitHub (open/merged/closed)
  -j, --json      Output as JSON
  -v, --verbose   Show more details (commit hashes, full paths)
  -h, --help      Show this help message

${colors.bold('EXAMPLES')}
  lswt              # List all worktrees
  lswt --status     # Include PR status (requires gh cli)
  lswt --json       # Output as JSON for scripting

${colors.bold('OUTPUT')}
  Shows each worktree with:
  - Type indicator: [main], [PR #123 OPEN], [branch], [detached]
  - Branch name
  - Path (relative or absolute based on context)
  - Uncommitted changes indicator
`);
}

/**
 * Extract PR number from worktree path
 */
function extractPrNumber(
  worktreePath: string,
  config: ReturnType<typeof loadConfig>
): number | null {
  const name = path.basename(worktreePath);

  // Try common patterns
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
 * Check if worktree is the main/bare worktree
 */
function isMainWorktree(worktreePath: string, repoRoot: string): boolean {
  return path.resolve(worktreePath) === path.resolve(repoRoot);
}

/**
 * Check for uncommitted changes in a worktree
 */
function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const { execSync } = require('child_process');
    const status = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get PR state from GitHub
 */
async function getPrState(prNumber: number): Promise<string | null> {
  try {
    const pr = await github.getPr(prNumber);
    if (!pr) {
      return null;
    }

    // pr.state is already 'OPEN' | 'CLOSED' | 'MERGED'
    return pr.state;
  } catch {
    return null;
  }
}

/**
 * Format type label with colors
 */
function formatTypeLabel(display: WorktreeDisplay): string {
  switch (display.type) {
    case 'main':
      return colors.cyan('[main]');
    case 'pr':
      const prLabel = `PR #${display.prNumber}`;
      if (display.prState === 'OPEN') {
        return colors.green(`[${prLabel} OPEN]`);
      } else if (display.prState === 'MERGED') {
        return colors.yellow(`[${prLabel} MERGED]`);
      } else if (display.prState === 'CLOSED') {
        return colors.red(`[${prLabel} CLOSED]`);
      } else {
        return colors.dim(`[${prLabel}]`);
      }
    case 'branch':
      return colors.blue('[branch]');
    case 'detached':
      return colors.dim('[detached]');
    default:
      return colors.dim('[unknown]');
  }
}

/**
 * Gather worktree information
 */
async function gatherWorktreeInfo(
  repoRoot: string,
  config: ReturnType<typeof loadConfig>,
  options: ListOptions
): Promise<WorktreeDisplay[]> {
  const worktrees = await git.listWorktrees();
  const result: WorktreeDisplay[] = [];

  for (const wt of worktrees) {
    const name = path.basename(wt.path);
    const prNumber = extractPrNumber(wt.path, config);
    const isMain = isMainWorktree(wt.path, repoRoot);
    const hasChanges = hasUncommittedChanges(wt.path);

    let type: 'main' | 'pr' | 'branch' | 'detached';
    let prState: string | null = null;

    if (isMain) {
      type = 'main';
    } else if (prNumber !== null) {
      type = 'pr';
      if (options.showStatus) {
        prState = await getPrState(prNumber);
      }
    } else if (wt.branch) {
      type = 'branch';
    } else {
      type = 'detached';
    }

    result.push({
      path: wt.path,
      name,
      branch: wt.branch,
      commit: wt.commit,
      type,
      prNumber,
      prState,
      hasChanges,
    });
  }

  // Sort: main first, then PRs by number, then others
  result.sort((a, b) => {
    if (a.type === 'main') return -1;
    if (b.type === 'main') return 1;
    if (a.type === 'pr' && b.type === 'pr') {
      return (a.prNumber || 0) - (b.prNumber || 0);
    }
    if (a.type === 'pr') return -1;
    if (b.type === 'pr') return 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

/**
 * Print worktrees in table format
 */
function printTable(worktrees: WorktreeDisplay[], options: ListOptions): void {
  if (worktrees.length === 0) {
    console.log(colors.info('No worktrees found.'));
    return;
  }

  const repoName = path.basename(worktrees[0].path.replace(/\.pr\d+$/, ''));

  console.log('');
  console.log(colors.bold(`${repoName} worktrees:`));
  console.log('');

  for (const wt of worktrees) {
    const typeLabel = formatTypeLabel(wt);
    const changeIndicator = wt.hasChanges ? colors.red(' *') : '';

    console.log(`  ${typeLabel}${changeIndicator}`);
    console.log(`    Branch: ${wt.branch || colors.dim('(detached)')}`);

    if (options.verbose) {
      console.log(`    Path:   ${wt.path}`);
      console.log(`    Commit: ${colors.dim(wt.commit)}`);
    } else {
      // Show relative path if possible
      const cwd = process.cwd();
      let displayPath = wt.path;
      if (wt.path.startsWith(cwd)) {
        displayPath = path.relative(cwd, wt.path) || '.';
      } else if (wt.path.startsWith(path.dirname(cwd))) {
        displayPath = path.relative(path.dirname(cwd), wt.path);
      }
      console.log(`    Path:   ${displayPath}`);
    }

    console.log('');
  }

  // Summary
  const prCount = worktrees.filter((w) => w.type === 'pr').length;
  const openCount = worktrees.filter((w) => w.prState === 'OPEN').length;
  const changesCount = worktrees.filter((w) => w.hasChanges).length;

  const parts: string[] = [`${worktrees.length} worktrees`];
  if (prCount > 0) {
    parts.push(`${prCount} PRs`);
  }
  if (openCount > 0) {
    parts.push(`${openCount} open`);
  }
  if (changesCount > 0) {
    parts.push(colors.red(`${changesCount} with changes`));
  }

  console.log(colors.dim(parts.join(' · ')));
  console.log('');
}

/**
 * Print worktrees as JSON
 */
function printJson(worktrees: WorktreeDisplay[]): void {
  const output = worktrees.map((wt) => ({
    path: wt.path,
    name: wt.name,
    branch: wt.branch,
    commit: wt.commit,
    type: wt.type,
    prNumber: wt.prNumber,
    prState: wt.prState,
    hasChanges: wt.hasChanges,
  }));

  console.log(JSON.stringify(output, null, 2));
}

async function main(): Promise<void> {
  const options = parseArgs();

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

  // Load configuration
  const config = loadConfig(repoRoot);

  // Gather worktree info
  const worktrees = await gatherWorktreeInfo(repoRoot, config, options);

  // Output
  if (options.json) {
    printJson(worktrees);
  } else {
    printTable(worktrees, options);
  }
}

main().catch((err) => {
  console.error(colors.error(`Error: ${err.message}`));
  process.exit(1);
});
