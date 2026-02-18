/**
 * Status output functions for consistent CLI display.
 *
 * Replaces inline console.log(colors.success(...)) patterns throughout
 * CLI files with a single set of JSON-mode-aware helpers.
 */

import * as colors from '../colors.js';
import { box } from './theme.js';
import { print } from './output.js';

type StatusType = 'success' | 'error' | 'warning' | 'info';

const statusFn: Record<StatusType, (msg: string) => string> = {
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
};

/**
 * Print a status message with the appropriate icon and color.
 *
 * Example: printStatus('success', 'Prerequisites OK')
 */
export function printStatus(type: StatusType, message: string): void {
  print(statusFn[type](message));
}

/**
 * Print a section header: blank line, bold title, blank line.
 *
 * Replaces: console.log(''); console.log(colors.bold('...')); console.log('');
 */
export function printHeader(title: string): void {
  print('');
  print(colors.bold(title));
  print('');
}

/**
 * Print a label: value detail line with optional indentation.
 *
 * Replaces: console.log('  Branch:    ' + branchName)
 */
export function printDetail(label: string, value: string, indent: number = 2): void {
  const pad = ' '.repeat(indent);
  print(`${pad}${label}: ${value}`);
}

/**
 * Print dimmed text with optional indentation.
 *
 * Replaces: console.log(colors.dim(...))
 */
export function printDim(message: string, indent: number = 0): void {
  const pad = ' '.repeat(indent);
  print(`${pad}${colors.dim(message)}`);
}

/**
 * Print a "Next steps:" section in dim text.
 *
 * Replaces the duplicated next-steps blocks in newpr.ts and cleanpr.ts.
 */
export function printNextSteps(steps: Array<{ command: string; description?: string }>): void {
  print(colors.dim('  Next steps:'));
  for (const step of steps) {
    const desc = step.description ? `     # ${step.description}` : '';
    print(colors.dim(`    ${step.command}${desc}`));
  }
}

/**
 * Print a box-drawing summary used by newpr's printSummary().
 *
 * Output format:
 * ```
 * ════════════════════════════════════════════════════════════
 *   {title}
 * ════════════════════════════════════════════════════════════
 *
 *   {label}:    {value}
 *   ...
 *
 *   Next steps:
 *     ...
 * ```
 */
export function printSummaryBox(
  title: string,
  fields: Array<{ label: string; value: string }>,
  nextSteps?: Array<{ command: string; description?: string }>
): void {
  const borderWidth = 58;
  const border = box.horizontal.repeat(borderWidth);

  print('');
  print(colors.green(border));
  print(colors.green(`  ${title}`));
  print(colors.green(border));
  print('');

  // Calculate alignment: pad labels to widest + 4 spaces
  const maxLabelLen = Math.max(...fields.map((f) => f.label.length));

  for (const field of fields) {
    const padded = field.label.padEnd(maxLabelLen + 4);
    print(`  ${padded}${field.value}`);
  }

  if (nextSteps && nextSteps.length > 0) {
    print('');
    printNextSteps(nextSteps);
  }

  print('');
}
