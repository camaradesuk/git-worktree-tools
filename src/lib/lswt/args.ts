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
    interactive: undefined, // undefined = auto-detect based on TTY
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
      case '-i':
      case '--interactive':
        options.interactive = true;
        break;
      case '--no-interactive':
        options.interactive = false;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--no-color':
        options.noColor = true;
        break;
      default:
        if (arg.startsWith('-')) {
          return { kind: 'error', message: `Unknown option: ${arg}` };
        }
    }
  }

  // Validate mutual exclusivity of --verbose and --quiet
  if (options.verbose && options.quiet) {
    return { kind: 'error', message: '--verbose and --quiet cannot be used together' };
  }

  // Validate: --json and --interactive cannot be used together
  if (options.json && options.interactive === true) {
    return {
      kind: 'error',
      message: '--json and --interactive cannot be used together',
    };
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
  -s, --status       Include PR status from GitHub (open/merged/closed)
  -j, --json         Output as JSON
  -v, --verbose      Show more details (commit hashes, full paths, debug output)
  -i, --interactive  Enable interactive mode (default in TTY)
  --no-interactive   Disable interactive mode
  --quiet            Suppress all output except errors
  --no-color         Disable colored output
  -h, --help         Show this help message

EXAMPLES
  lswt                  # Interactive mode (default in terminal)
  lswt --no-interactive # List-only mode
  lswt --status         # Include PR status (requires gh cli)
  lswt --json           # Output as JSON for scripting
  lswt | cat            # Automatically uses list mode when piped

INTERACTIVE MODE
  When running in a terminal, lswt enters interactive mode where you can
  select a worktree and perform actions like:
  - Open in editor (VSCode/Cursor)
  - Open terminal at worktree path
  - Open PR in browser
  - Create PR from branch
  - Remove worktree
  - Link config files
  - Copy path to clipboard

SHORTCUTS (in interactive mode)
  e - Open in editor       t - Open terminal
  p - Open/Create PR       d - Show details
  c - Copy path            r - Remove worktree
  l - Link configs         q - Quit

OUTPUT
  Shows each worktree with:
  - Type indicator: [main], [PR #123 OPEN], [PR #45 DRAFT], [branch], [detached]
  - Branch name
  - Path (relative or absolute based on context)
  - Uncommitted changes indicator
`;
}
