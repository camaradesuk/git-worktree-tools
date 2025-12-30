/**
 * newpr args - pure argument parsing
 */

import type { Options, ParseResult } from './types.js';

/**
 * Default options
 */
export function getDefaultOptions(): Options {
  return {
    mode: 'new',
    baseBranch: 'main',
    draft: true,
    installDeps: false,
    openEditor: false,
    runWtlink: true,
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

      case '--pr':
      case '-p':
        options.mode = 'pr';
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { kind: 'error', message: '--pr requires a PR number' };
        }
        options.prNumber = parseInt(args[i], 10);
        if (isNaN(options.prNumber)) {
          return { kind: 'error', message: 'PR number must be numeric' };
        }
        break;

      case '--branch':
      case '-B':
        options.mode = 'branch';
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { kind: 'error', message: '--branch requires a branch name' };
        }
        options.branchName = args[i];
        break;

      case '-b':
      case '--base':
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { kind: 'error', message: '--base requires a branch name' };
        }
        options.baseBranch = args[i];
        break;

      case '-i':
      case '--install':
        options.installDeps = true;
        break;

      case '-c':
      case '--code':
        options.openEditor = true;
        break;

      case '-r':
      case '--ready':
        options.draft = false;
        break;

      case '--no-wtlink':
        options.runWtlink = false;
        break;

      default:
        if (arg.startsWith('-')) {
          return { kind: 'error', message: `Unknown option: ${arg}` };
        }
        // Positional argument = description
        if (!options.description && options.mode === 'new') {
          options.description = arg;
        } else {
          return { kind: 'error', message: `Unexpected argument: ${arg}` };
        }
    }
    i++;
  }

  // Validate
  if (options.mode === 'new' && !options.description) {
    return {
      kind: 'error',
      message: 'Description required. Usage: newpr "feature description"',
    };
  }

  return { kind: 'success', options };
}

/**
 * Get help text as a string
 */
export function getHelpText(): string {
  return `
newpr - Create or setup a PR with a dedicated worktree

Usage:
  newpr "description"           Create new branch + PR + worktree
  newpr --pr <NUMBER>           Setup worktree for existing PR
  newpr --branch <NAME>         Create PR for existing branch + worktree

Options:
  -b, --base BRANCH     Base branch for PR (default: main)
  -i, --install         Install dependencies after setup
  -c, --code            Open editor to the new worktree
  -r, --ready           Create PR as ready for review (default: draft)
  --no-wtlink           Skip wtlink config sync
  -h, --help            Show this help message

Examples:
  newpr "Add user authentication"
  newpr "Fix login bug" --install --code
  newpr --pr 1234
  newpr --branch feat/my-feature
`.trim();
}
