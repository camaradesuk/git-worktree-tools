/**
 * newpr args - pure argument parsing
 */

import type { Options, ParseResult } from './types.js';
import { isValidStateActionKey } from '../json-output.js';

/**
 * Default options
 */
export function getDefaultOptions(): Options {
  return {
    mode: 'new',
    baseBranch: 'main',
    draft: false,
    installDeps: false,
    openEditor: false,
    runWtlink: true,
    json: false,
    nonInteractive: false,
    noHooks: false,
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
        // Validate that input is a valid integer (reject floats like "1.5")
        if (!/^\d+$/.test(args[i])) {
          return { kind: 'error', message: 'PR number must be a positive integer (e.g., 42)' };
        }
        options.prNumber = parseInt(args[i], 10);
        if (isNaN(options.prNumber) || options.prNumber <= 0) {
          return { kind: 'error', message: 'PR number must be a positive integer (e.g., 42)' };
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
        options.draftExplicitlySet = true;
        break;

      case '-d':
      case '--draft':
        options.draft = true;
        options.draftExplicitlySet = true;
        break;

      case '--no-wtlink':
        options.runWtlink = false;
        break;

      case '--no-hooks':
        options.noHooks = true;
        break;

      case '--plan':
        options.generatePlan = true;
        break;

      case '--no-plan':
        options.noPlan = true;
        break;

      case '--confirm-hooks':
        options.confirmHooks = true;
        break;

      case '--json':
        options.json = true;
        break;

      case '-y':
      case '--yes':
      case '--non-interactive':
        options.nonInteractive = true;
        break;

      case '--action':
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { kind: 'error', message: '--action requires an action key' };
        }
        if (!isValidStateActionKey(args[i])) {
          return {
            kind: 'error',
            message: `Invalid action: ${args[i]}. Valid actions: empty_commit, commit_staged, commit_all, stash_and_empty, use_commits, push_then_branch, use_commits_and_commit_all, use_commits_and_stash, create_pr_for_branch, pr_for_branch_commit_all, pr_for_branch_stash, branch_from_detached`,
          };
        }
        options.action = args[i] as Options['action'];
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
  -d, --draft           Create PR as draft
  -r, --ready           Create PR as ready for review (default)
  -i, --install         Install dependencies after setup
  -c, --code            Open editor to the new worktree
  --no-wtlink           Skip wtlink config sync
  --no-hooks            Disable lifecycle hooks (for security)
  --confirm-hooks       Prompt before running post-* hooks
  -h, --help            Show this help message

AI/Plan Options:
  --plan                Generate AI plan document for the PR
  --no-plan             Skip plan generation even if configured

Automation Options:
  --json                Output result as JSON for programmatic parsing
  -y, --yes, --non-interactive
                        Skip all interactive prompts, use defaults
  --action ACTION       Pre-specify action for scenario handling
                        (use with --non-interactive)

Actions:
  empty_commit          Create empty initial commit
  commit_staged         Commit staged changes to new branch
  commit_all            Stage all and commit to new branch
  stash_and_empty       Stash changes, create empty commit
  use_commits           Use local commits (branch from HEAD)
  push_then_branch      Push to main first, then create branch
  use_commits_and_commit_all
                        Include commits + commit uncommitted
  use_commits_and_stash Include commits, stash uncommitted
  create_pr_for_branch  Create PR for existing branch
  pr_for_branch_commit_all
                        Create PR for branch, commit changes first
  pr_for_branch_stash   Create PR for branch, stash changes
  branch_from_detached  Create branch from detached HEAD

Examples:
  newpr "Add user authentication"
  newpr "Fix login bug" --install --code
  newpr --pr 1234
  newpr --branch feat/my-feature

  # AI/Automation usage
  newpr "Add dark mode" --non-interactive --json
  newpr "Fix bug" --non-interactive --action=commit_staged --json
`.trim();
}
