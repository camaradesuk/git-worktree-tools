/**
 * Shared helper for running subcommands via spawnSync
 *
 * This module provides a common pattern used by all wt subcommand handlers
 * to delegate to their underlying CLI tools (newpr, lswt, cleanpr, etc.)
 */

import { spawnSync, type SpawnSyncReturns } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run a CLI subcommand and exit with its status code
 *
 * @param cliName - Name of the CLI to run (e.g., 'newpr', 'lswt')
 * @param args - Arguments to pass to the CLI
 * @param envOverrides - Optional environment variable overrides for the child process
 * @returns Never returns - calls process.exit
 */
export function runSubcommand(
  cliName: string,
  args: string[],
  envOverrides?: Record<string, string>
): never {
  const cliPath = path.resolve(__dirname, `../${cliName}.js`);
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...envOverrides },
  });

  process.exit(result.status ?? 1);
}

/**
 * Run a CLI subcommand and return the result (for testing)
 *
 * @param cliName - Name of the CLI to run (e.g., 'newpr', 'lswt')
 * @param args - Arguments to pass to the CLI
 * @param envOverrides - Optional environment variable overrides for the child process
 * @returns SpawnSync result object
 */
export function runSubcommandForResult(
  cliName: string,
  args: string[],
  envOverrides?: Record<string, string>
): SpawnSyncReturns<Buffer> {
  const cliPath = path.resolve(__dirname, `../${cliName}.js`);
  return spawnSync(process.execPath, [cliPath, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...envOverrides },
  });
}

/**
 * Get the path to a CLI script
 *
 * @param cliName - Name of the CLI (e.g., 'newpr', 'lswt')
 * @returns Absolute path to the CLI script
 */
export function getCliPath(cliName: string): string {
  return path.resolve(__dirname, `../${cliName}.js`);
}
