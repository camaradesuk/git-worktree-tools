/**
 * Centralized theme constants for UI output.
 *
 * Provides raw icons and box-drawing characters used by all other ui/ modules.
 * colors.ts still provides the semantic functions (success(), error(), etc.)
 * that combine icon + color. theme.ts provides the raw constants for cases
 * where you need just the icon or just the box-drawing chars.
 */

import * as colors from '../colors.js';

export const icons = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
  bullet: '\u2022',
  arrow: '\u25B6',
  change: '*',
} as const;

export const box = {
  horizontal: '\u2550',
  vertical: '\u2551',
  topLeft: '\u2554',
  topRight: '\u2557',
  bottomLeft: '\u255A',
  bottomRight: '\u255D',
  line: '\u2500',
} as const;

/**
 * Returns a compact change indicator: red " *" when changes exist, empty string otherwise.
 *
 * Standardizes the inconsistency where lswt uses `colors.red(' *')`
 * and cleanpr uses `colors.red(' [has changes]')`.
 */
export function changeIndicator(hasChanges: boolean): string {
  return hasChanges ? colors.red(` ${icons.change}`) : '';
}
