/**
 * wt state - Query git worktree state
 *
 * Direct library call handler - no subprocess spawning.
 * Calls analyzeState and formatText in-process.
 */

import type { CommandModule } from 'yargs';
import { analyzeState, formatText } from '../../lib/wtstate/index.js';
import * as git from '../../lib/git.js';
import { setJsonMode, printError } from '../../lib/ui/index.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  type WtstateResultData,
} from '../../lib/json-output.js';
import type { WtstateOptions } from '../../lib/wtstate/index.js';

interface StateArgs {
  verbose?: boolean;
  json?: boolean;
  'base-branch'?: string;
}

export const stateCommand: CommandModule<object, StateArgs> = {
  command: ['state', 's'],
  describe: 'Query git worktree state for AI agents',
  builder: (yargs) => {
    return yargs
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Show detailed state information',
        default: false,
      })
      .option('json', {
        type: 'boolean',
        description: 'Output as JSON (for AI/automation)',
        default: false,
      })
      .option('base-branch', {
        alias: 'b',
        type: 'string',
        description: 'Base branch to compare against (default: from .worktreerc or main)',
      })
      .example('$0 state', 'Show current worktree state')
      .example('$0 s -v', 'Verbose state output')
      .example('$0 state --json', 'JSON output for AI agents')
      .example('$0 state --base-branch develop', 'Compare against develop branch');
  },
  handler: async (argv) => {
    const options: WtstateOptions = {
      verbose: !!argv.verbose,
      json: !!argv.json,
      baseBranch: argv['base-branch'] || 'main',
    };

    setJsonMode(options.json);

    // Check we're in a git repo
    try {
      git.getRepoRoot();
    } catch {
      if (options.json) {
        const errorResult = createErrorResult(
          'wtstate',
          ErrorCode.NOT_GIT_REPO,
          'Not in a git repository'
        );
        console.log(formatJsonResult(errorResult));
      } else {
        printError({
          title: 'Not in a git repository.',
          hint: 'Run this command from within a git repository.',
        });
      }
      process.exit(1);
    }

    try {
      const stateResult = analyzeState(options);

      if (options.json) {
        // Output as JSON
        const data: WtstateResultData = {
          scenario: stateResult.scenario,
          scenarioDescription: stateResult.scenarioDescription,
          currentBranch: stateResult.currentBranch,
          baseBranch: stateResult.baseBranch,
          worktreeType: stateResult.worktreeType,
          hasChanges: stateResult.hasChanges,
          hasStagedChanges: stateResult.hasStagedChanges,
          hasUnstagedChanges: stateResult.hasUnstagedChanges,
          localCommits: stateResult.localCommits,
          stagedFiles: stateResult.stagedFiles,
          unstagedFiles: stateResult.unstagedFiles,
          availableActions: stateResult.availableActions,
          recommendedAction: stateResult.recommendedAction,
        };

        const jsonResult = createSuccessResult('wtstate', data);
        console.log(formatJsonResult(jsonResult));
      } else {
        // Output as human-readable text
        console.log(formatText(stateResult, options.verbose));
      }
    } catch (error) {
      if (options.json) {
        const errorResult = createErrorResult(
          'wtstate',
          ErrorCode.OPERATION_FAILED,
          error instanceof Error ? error.message : String(error)
        );
        console.log(formatJsonResult(errorResult));
      } else {
        printError({
          title: error instanceof Error ? error.message : String(error),
        });
      }
      process.exit(1);
    }
  },
};
