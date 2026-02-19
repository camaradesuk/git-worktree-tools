/**
 * wt new - Create a new PR with worktree
 *
 * Calls runNewprHandler directly (in-process, no subprocess spawning)
 */

import type { CommandModule } from 'yargs';
import { runNewprHandler } from '../newpr.js';
import type { Options } from '../../lib/newpr/index.js';
import { setJsonMode, printError } from '../../lib/ui/index.js';
import { createErrorResult, formatJsonResult, ErrorCode } from '../../lib/json-output.js';

interface NewArgs {
  description?: string;
  pr?: number;
  branch?: string;
  base?: string;
  install?: boolean;
  code?: boolean;
  ready?: boolean;
  draft?: boolean;
  'no-wtlink'?: boolean;
  'no-hooks'?: boolean;
  'confirm-hooks'?: boolean;
  plan?: boolean;
  'no-plan'?: boolean;
  json?: boolean;
  'non-interactive'?: boolean;
  action?: string;
  verbose?: number | boolean;
  quiet?: boolean;
  noColor?: boolean;
}

export const newCommand: CommandModule<object, NewArgs> = {
  command: ['new [description]', 'n'],
  describe: 'Create a new PR with a dedicated worktree',
  builder: (yargs) => {
    return yargs
      .positional('description', {
        describe: 'PR description/title',
        type: 'string',
      })
      .option('pr', {
        alias: 'p',
        type: 'number',
        description: 'Existing PR number to create worktree for',
      })
      .option('branch', {
        alias: 'B',
        type: 'string',
        description: 'Create PR for existing branch',
      })
      .option('base', {
        alias: 'b',
        type: 'string',
        description: 'Base branch for PR (default: main)',
      })
      .option('install', {
        alias: 'i',
        type: 'boolean',
        description: 'Install dependencies after setup',
        default: false,
      })
      .option('code', {
        alias: 'c',
        type: 'boolean',
        description: 'Open editor to the new worktree',
        default: false,
      })
      .option('ready', {
        alias: 'r',
        type: 'boolean',
        description: 'Create PR as ready for review (default: draft)',
        default: false,
      })
      .option('draft', {
        alias: 'd',
        type: 'boolean',
        description: 'Create PR as draft',
      })
      .option('no-wtlink', {
        type: 'boolean',
        description: 'Skip wtlink config sync',
        default: false,
      })
      .option('no-hooks', {
        type: 'boolean',
        description: 'Disable lifecycle hooks (for security)',
        default: false,
      })
      .option('confirm-hooks', {
        type: 'boolean',
        description: 'Prompt before running post-* hooks',
        default: false,
      })
      .option('plan', {
        type: 'boolean',
        description: 'Generate AI plan document for the PR',
      })
      .option('no-plan', {
        type: 'boolean',
        description: 'Skip plan generation even if configured',
      })
      .option('json', {
        type: 'boolean',
        description: 'Output result as JSON',
        default: false,
      })
      .option('non-interactive', {
        alias: ['n', 'y', 'yes'],
        type: 'boolean',
        description: 'Run without prompts (requires explicit options)',
        default: false,
      })
      .option('action', {
        alias: 'a',
        type: 'string',
        description: 'Action to take (for non-interactive mode)',
        choices: [
          'empty_commit',
          'commit_staged',
          'commit_all',
          'stash_and_empty',
          'use_commits',
          'push_then_branch',
          'use_commits_and_commit_all',
          'use_commits_and_stash',
          'create_pr_for_branch',
          'pr_for_branch_commit_all',
          'pr_for_branch_stash',
          'branch_from_detached',
        ],
      })
      .example('$0 new "Add dark mode"', 'Create a new PR')
      .example('$0 n "Fix bug #123"', 'Short alias')
      .example('$0 new --pr 42', 'Create worktree for existing PR #42')
      .example('$0 new --branch feat/my-feature', 'Create PR for existing branch')
      .example('$0 new "Feature" --ready', 'Create as ready (not draft) PR')
      .example('$0 new "Feature" --draft', 'Create as draft PR')
      .example('$0 new "Fix" --non-interactive --json', 'Automation mode')
      .example('$0 new "Fix" -y --action=commit_staged', 'Non-interactive with explicit action');
  },
  handler: async (argv) => {
    // Validate PR number if provided (yargs may parse non-numeric strings as NaN)
    if (argv.pr !== undefined && (isNaN(argv.pr) || argv.pr <= 0)) {
      const useJson = !!argv.json;
      if (useJson) {
        console.log(
          formatJsonResult(
            createErrorResult(
              'newpr',
              ErrorCode.INVALID_ARGUMENT,
              'PR number must be a positive integer'
            )
          )
        );
      } else {
        printError({ title: 'PR number must be a positive integer' });
      }
      process.exit(1);
    }

    // Determine mode from argv
    let mode: Options['mode'] = 'new';
    if (argv.pr !== undefined) {
      mode = 'pr';
    } else if (argv.branch) {
      mode = 'branch';
    }

    // Determine draft/draftExplicitlySet from argv
    let draft = false;
    let draftExplicitlySet = false;
    if (argv.draft) {
      draft = true;
      draftExplicitlySet = true;
    } else if (argv.ready) {
      draft = false;
      draftExplicitlySet = true;
    }

    const options: Options = {
      mode,
      description: argv.description,
      prNumber: argv.pr,
      branchName: argv.branch,
      baseBranch: argv.base || 'main',
      draft,
      draftExplicitlySet,
      installDeps: !!argv.install,
      openEditor: !!argv.code,
      runWtlink: !argv['no-wtlink'],
      json: !!argv.json,
      nonInteractive: !!argv['non-interactive'],
      action: argv.action as Options['action'],
      noHooks: !!argv['no-hooks'],
      confirmHooks: !!argv['confirm-hooks'],
      generatePlan: argv.plan,
      noPlan: argv['no-plan'],
      verbose: !!argv.verbose,
      quiet: !!argv.quiet,
      noColor: !!argv.noColor,
    };

    setJsonMode(options.json);
    await runNewprHandler(options);
  },
};
