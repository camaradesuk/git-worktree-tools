/**
 * PATH lookups for external commands.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Check if a command exists in PATH, via `which` / `where`.
 */
export function commandExists(cmd: string): boolean {
  try {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Read an env var the way the OS does: case-insensitively on Windows, where
 * a copied environment object keeps whatever casing it had (`Path`, `PATH`).
 */
function getEnvVar(env: NodeJS.ProcessEnv, name: string): string | undefined {
  if (process.platform !== 'win32') return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

function isExecutableFile(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether `cmd` resolves on the PATH in `env`, by searching the PATH
 * directly rather than running `which`. This works even when `env.PATH`
 * is a self-contained tool directory that has no `which` in it.
 */
export function isOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const isWindows = process.platform === 'win32';
  const extensions = isWindows
    ? ['', ...(getEnvVar(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)]
    : [''];

  // A name with a directory part is checked as given, like the shell does
  const dirs =
    cmd.includes('/') || (isWindows && cmd.includes('\\'))
      ? ['']
      : (getEnvVar(env, 'PATH') ?? '').split(path.delimiter).filter(Boolean);

  return dirs.some((dir) =>
    extensions.some((ext) => isExecutableFile(dir ? path.join(dir, cmd + ext) : cmd + ext))
  );
}
