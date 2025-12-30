/**
 * lswt argument parsing - pure functions
 */

import type { ListOptions, ParseResult } from './types.js';

/**
 * Parse command line arguments - pure function, no side effects
 * @param argv - Arguments array (typically process.argv.slice(2))
 */
export function parseArgs(argv: string[]): ParseResult {
  const options: ListOptions = {
    showStatus: false,
    json: false,
    verbose: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case '-h':
      case '--help':
        return { kind: 'help' };
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
          return { kind: 'error', message: `Unknown option: ${arg}` };
        }
    }
  }

  return { kind: 'success', options };
}

/**
 * Generate help text - pure function returning string (no colors)
 */
export function getHelpText(): string {
  return `lswt - List git worktrees with PR status

USAGE
  lswt [options]

OPTIONS
  -s, --status    Include PR status from GitHub (open/merged/closed)
  -j, --json      Output as JSON
  -v, --verbose   Show more details (commit hashes, full paths)
  -h, --help      Show this help message

EXAMPLES
  lswt              # List all worktrees
  lswt --status     # Include PR status (requires gh cli)
  lswt --json       # Output as JSON for scripting

OUTPUT
  Shows each worktree with:
  - Type indicator: [main], [PR #123 OPEN], [branch], [detached]
  - Branch name
  - Path (relative or absolute based on context)
  - Uncommitted changes indicator
`;
}
