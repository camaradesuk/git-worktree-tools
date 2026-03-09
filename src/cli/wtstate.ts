#!/usr/bin/env node
/**
 * wtstate - Query git worktree state for AI agents
 *
 * CLI thin wrapper - orchestration and side effects only
 */

import { printDeprecationNotice } from '../lib/deprecation.js';
import * as git from '../lib/git.js';
import { setColorEnabled } from '../lib/colors.js';
import { initializeLogger } from '../lib/logger.js';
import { parseArgs, getHelpText, analyzeState, formatText } from '../lib/wtstate/index.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
  type WtstateResultData,
} from '../lib/json-output.js';
import { print, printError, setJsonMode } from '../lib/ui/index.js';

/**
 * Main entry point
 */
async function main(): Promise<void> {
  printDeprecationNotice('wtstate', 'wt state');

  // Parse flags manually from argv for logger initialization (before full arg parsing)
  const rawArgs = process.argv.slice(2);
  const verbose = rawArgs.includes('--verbose');
  const quiet = rawArgs.includes('--quiet');
  const noColor = rawArgs.includes('--no-color');
  const jsonFlag = hasJsonFlag(rawArgs);

  initializeLogger({
    verbose,
    quiet,
    noColor,
    json: jsonFlag,
    commandName: 'wtstate',
  });
  setJsonMode(jsonFlag);
  if (noColor) {
    process.env.NO_COLOR = '1';
    setColorEnabled(false);
  }

  const result = parseArgs(process.argv.slice(2));

  if (result.kind === 'help') {
    console.log(getHelpText());
    process.exit(0);
  }

  if (result.kind === 'error') {
    if (jsonFlag) {
      const errorResult = createErrorResult(
        'wtstate',
        ErrorCode.INVALID_ARGUMENT,
        result.message || 'Invalid arguments'
      );
      console.log(formatJsonResult(errorResult));
    } else if (result.message) {
      printError({ title: result.message });
    }
    process.exit(1);
  }

  const { options } = result;

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
      printError({ title: 'Not in a git repository.' });
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
      print(formatText(stateResult, options.verbose));
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
      printError({ title: error instanceof Error ? error.message : String(error) });
    }
    process.exit(1);
  }
}

/**
 * Check if --json flag is present in args (for early error handling before parsing)
 */
function hasJsonFlag(args: string[]): boolean {
  return args.includes('--json');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (hasJsonFlag(process.argv.slice(2))) {
    const errorResult = createErrorResult('wtstate', ErrorCode.UNKNOWN_ERROR, message);
    console.log(formatJsonResult(errorResult));
  } else {
    printError({ title: message });
  }
  process.exit(1);
});
