/**
 * Structured error display.
 *
 * Centralizes the repeated pattern of:
 *   getErrorCodeFromError(err) -> getErrorSuggestion(code) -> format
 * that exists in newpr, cleanpr, and lswt top-level catch blocks.
 */

import * as colors from '../colors.js';
import { getErrorCodeFromError, getErrorSuggestion } from '../json-output.js';
import { printErr } from './output.js';

export interface ErrorDisplayOptions {
  title: string;
  detail?: string;
  hint?: string;
}

/**
 * Display a structured error to stderr.
 *
 * Output format:
 * ```
 * ✗ {title}                    <- via colors.error()
 *   {detail}                   <- plain text, only if provided
 *   Hint: {hint}               <- via colors.dim(), only if provided
 * ```
 */
export function printError(options: ErrorDisplayOptions): void {
  printErr(colors.error(options.title));
  if (options.detail) {
    printErr(`  ${options.detail}`);
  }
  if (options.hint) {
    printErr(`  ${colors.dim(`Hint: ${options.hint}`)}`);
  }
}

/**
 * Extract display info from an error object.
 *
 * Maps error -> ErrorCode -> suggestion, extracts stderr detail
 * from GitCommandError / GitHubCliError instances.
 */
export function errorToDisplay(error: unknown): ErrorDisplayOptions {
  const message = error instanceof Error ? error.message : String(error);
  const code = getErrorCodeFromError(error);
  const hint = getErrorSuggestion(code);

  // Extract detail from errors that carry stderr
  let detail: string | undefined;
  if (error instanceof Error && 'stderr' in error) {
    detail = (error as { stderr?: string }).stderr;
  }

  return { title: message, detail, hint };
}
