/**
 * PATH lookups for external commands.
 */

import { spawnSync } from 'child_process';

/**
 * Check if a command exists in PATH.
 *
 * `env` defaults to this process's environment; pass a hook's environment
 * to resolve against the PATH that hook will actually run with.
 */
export function commandExists(cmd: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      env,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}
