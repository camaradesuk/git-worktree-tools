/**
 * Action Dependencies Factory
 *
 * Creates ActionDeps with real git operations for use in CLI and API.
 * Extracted to shared module to avoid duplication.
 */

import * as git from '../git.js';
import type { ActionDeps } from './actions.js';

/**
 * Create action dependencies using real git operations
 *
 * @param cwd - Default working directory for git operations
 * @returns ActionDeps instance with real git operations
 */
export function createActionDeps(cwd?: string): ActionDeps {
  return {
    gitAdd: (addPath: string, cwdPath?: string) => git.add(addPath, cwdPath ?? cwd),
    gitStash: (options, cwdPath?) =>
      git.stash({ message: options.message, keepIndex: options.keepIndex }, cwdPath ?? cwd),
    gitPush: (options, cwdPath?) =>
      git.push(
        { remote: options.remote, branch: options.branch, setUpstream: options.setUpstream },
        cwdPath ?? cwd
      ),
    gitCommit: (options, cwdPath?) =>
      git.commit({ message: options.message, allowEmpty: options.allowEmpty }, cwdPath ?? cwd),
  };
}
