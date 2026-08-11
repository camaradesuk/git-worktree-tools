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
import { readBodyOverride, PRContentError } from '../../lib/newpr/pr-content.js';
import { AI_PROVIDER_NAMES } from '../../lib/ai/types.js';

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
  title?: string;
  body?: string;
  'body-file'?: string;
  'force-ai'?: boolean;
  'skip-ai'?: boolean;
  'ai-provider'?: string;
  'ai-timeout'?: number;
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
      .option('title', {
        type: 'string',
        description: 'Exact PR title (skips AI title generation)',
      })
      .option('body', {
        type: 'string',
        description: 'Exact PR body (skips AI description generation)',
      })
      .option('body-file', {
        type: 'string',
        description: 'Read the PR body from a file (preferred for multi-line markdown)',
      })
      .option('force-ai', {
        type: 'boolean',
        description: 'Run AI generation even when --title/--body are supplied',
        default: false,
      })
      .option('skip-ai', {
        type: 'boolean',
        description: 'Skip AI generation entirely for this invocation',
        default: false,
      })
      .example(
        '$0 new "Add dark mode" --title "feat: dark mode" --body-file /tmp/body.md',
        'Supply exact PR content'
      )
      .option('ai-provider', {
        type: 'string',
        description: 'Override the AI provider for this run',
        // Derived from the canonical list, never hand-copied: a transcribed
        // enum here would silently reject a provider the rest of the config
        // chain accepts — the exact drift this flag's own tier exists to avoid.
        choices: AI_PROVIDER_NAMES,
      })
      .option('ai-timeout', {
        type: 'number',
        description: 'Override the AI generation timeout (milliseconds) for this run',
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

    // Read and validate --title/--body/--body-file before any git mutation.
    // This is a fail-fast check so a simple typo doesn't leave the repo
    // mid-mutation (branch pushed, no PR, stash unpopped). It also rejects
    // empty/whitespace-only values: an empty --title or body silently corrupts
    // the underlying `gh pr create` invocation, so an agent must learn its
    // content did not land rather than have `gh` misparse the command.
    //
    // The bytes read here are then carried downstream in `options.body`, and
    // `bodyFile` is dropped, so the file is read EXACTLY ONCE. Re-reading the
    // path later would be unsafe: the workflow may commit that very file onto
    // the feature branch, push, and check the original branch back out before
    // resolvePRContent runs — at which point a newly added body file is gone
    // (ENOENT after the branch was already pushed) and a modified tracked one
    // silently reverts to the original branch's stale contents. The documented
    // `--body-file ./pr-body.md` example is exactly that shape.
    //
    // Skipped entirely in --pr mode: that path routes to modeExistingPr, which
    // never calls resolvePRContent and never reads a body, so the content flags
    // are ignored there (as documented in docs/AI-TOOLING.md). Validating them
    // anyway would reject `wt new --pr 42 --body-file missing.md` over a file
    // the command would never have opened.
    let resolvedBody: string | undefined;
    try {
      if (argv.pr === undefined) {
        if (argv.title !== undefined && argv.title.trim() === '') {
          throw new PRContentError('--title must not be empty or whitespace-only.');
        }

        resolvedBody = readBodyOverride({ body: argv.body, bodyFile: argv['body-file'] });
        if (resolvedBody !== undefined && resolvedBody.trim() === '') {
          const flagName = argv.body !== undefined ? '--body' : '--body-file';
          throw new PRContentError(`${flagName} must not be empty or whitespace-only.`);
        }
      }
    } catch (error) {
      if (error instanceof PRContentError) {
        const useJson = !!argv.json;
        if (useJson) {
          console.log(
            formatJsonResult(createErrorResult('newpr', ErrorCode.INVALID_ARGUMENT, error.message))
          );
        } else {
          printError({ title: error.message });
        }
        process.exit(1);
      }
      throw error;
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
      title: argv.title,
      // Pass the ALREADY-READ bytes, not the path, so the file is never read
      // a second time after the workflow has moved git state underneath it.
      // In --pr mode nothing was read (validation is skipped) and the content
      // flags are ignored anyway, so fall back to the raw argv there.
      body: resolvedBody ?? argv.body,
      bodyFile: resolvedBody !== undefined ? undefined : argv['body-file'],
      forceAi: !!argv['force-ai'],
      skipAi: !!argv['skip-ai'],
      confirmHooks: !!argv['confirm-hooks'],
      generatePlan: argv.plan,
      noPlan: argv['no-plan'],
      verbose: !!argv.verbose,
      quiet: !!argv.quiet,
      noColor: !!argv.noColor,
      aiProvider: argv['ai-provider'],
      aiTimeout: argv['ai-timeout'],
    };

    setJsonMode(options.json);
    await runNewprHandler(options);
  },
};
