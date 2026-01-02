/**
 * cleanpr argument parsing - pure functions
 */

import type { CleanOptions, ParseResult } from './types.js';

/**
 * Parse command line arguments - pure function, no side effects
 * @param argv - Arguments array (typically process.argv.slice(2))
 */
export function parseArgs(argv: string[]): ParseResult {
  let prNumber: number | null = null;
  const options: CleanOptions = {
    deleteRemote: false,
    force: false,
    all: false,
    interactive: true,
    json: false,
    dryRun: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case '-h':
      case '--help':
        return { kind: 'help' };
      case '-r':
      case '--remote':
        options.deleteRemote = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-a':
      case '--all':
        options.all = true;
        options.interactive = false;
        break;
      case '--json':
        options.json = true;
        break;
      case '-n':
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        if (arg.startsWith('-')) {
          return { kind: 'error', message: `Unknown option: ${arg}` };
        }
        {
          // Must be PR number
          const num = parseInt(arg, 10);
          if (isNaN(num)) {
            return { kind: 'error', message: `Invalid PR number: ${arg}` };
          }
          prNumber = num;
          options.interactive = false;
        }
    }
  }

  return { kind: 'success', prNumber, options };
}

/**
 * Generate help text - pure function returning string (no colors)
 */
export function getHelpText(): string {
  return `cleanpr - Clean up PR worktrees after merge/close

USAGE
  cleanpr                         Interactive cleanup of merged/closed PRs
  cleanpr <PR_NUMBER>             Clean specific PR worktree
  cleanpr --all                   Clean all merged/closed PRs automatically
  cleanpr <PR_NUMBER> [options]   Clean with options

OPTIONS
  -r, --remote    Also delete the remote branch
  -f, --force     Force removal even if worktree has uncommitted changes
  -a, --all       Clean all merged/closed PR worktrees (non-interactive)
  -h, --help      Show this help message

AI/AUTOMATION OPTIONS
  --json          Output result as JSON for programmatic parsing
  -n, --dry-run   Preview what would be cleaned without making changes

EXAMPLES
  cleanpr                    # Interactive mode - select worktrees to clean
  cleanpr 2245               # Remove worktree and local branch for PR #2245
  cleanpr 2245 --remote      # Also delete remote branch
  cleanpr 2245 -f -r         # Force cleanup and delete remote
  cleanpr --all              # Clean all merged/closed PRs

  # AI/Automation usage
  cleanpr --all --json       # Clean all and output JSON result
  cleanpr --all --dry-run --json
                             # Preview cleanup as JSON

WHAT IT REMOVES
  - Git worktree directory
  - Local branch associated with the PR
  - Remote branch (with --remote flag)
`;
}
