/**
 * wtstate args - pure argument parsing
 */

import type { WtstateOptions, ParseResult } from './types.js';

/**
 * Default options
 */
export function getDefaultOptions(): WtstateOptions {
  return {
    json: false,
    baseBranch: 'main',
    verbose: false,
  };
}

/**
 * Parse command line arguments - pure function, no side effects
 */
export function parseArgs(args: string[]): ParseResult {
  const options = getDefaultOptions();

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        return { kind: 'help' };

      case '--json':
        options.json = true;
        break;

      case '-v':
      case '--verbose':
        options.verbose = true;
        break;

      case '-b':
      case '--base':
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { kind: 'error', message: '--base requires a branch name' };
        }
        options.baseBranch = args[i];
        break;

      default:
        if (arg.startsWith('-')) {
          return { kind: 'error', message: `Unknown option: ${arg}` };
        }
        return { kind: 'error', message: `Unexpected argument: ${arg}` };
    }
    i++;
  }

  return { kind: 'success', options };
}

/**
 * Get help text as a string
 */
export function getHelpText(): string {
  return `
wtstate - Query git worktree state for AI agents

Usage:
  wtstate [options]             Query current git state

Options:
  --json              Output as JSON (recommended for AI usage)
  -b, --base BRANCH   Base branch for comparison (default: main)
  -v, --verbose       Include file lists in output
  -h, --help          Show this help message

Output:
  The command outputs information about the current git state including:
  - Current scenario (e.g., main_clean_same, branch_with_changes)
  - Branch and worktree information
  - Change status (staged/unstaged files)
  - Available actions for the scenario
  - Recommended action for AI agents

Examples:
  wtstate --json              # Query state as JSON
  wtstate --json --verbose    # Include file lists
  wtstate --base develop      # Compare against develop branch

AI/Automation workflow:
  # 1. Query state
  STATE=$(wtstate --json)

  # 2. Get recommended action
  ACTION=$(echo $STATE | jq -r '.recommendedAction')

  # 3. Execute with chosen action
  newpr "Fix bug" --non-interactive --action=$ACTION --json

DEPRECATED: Use "wt state" instead. This command will be removed in a future version.
`.trim();
}
