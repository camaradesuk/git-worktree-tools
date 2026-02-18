/**
 * Structured table output for worktree listings.
 *
 * Replicates the exact visual format that lswt currently produces,
 * but in a reusable, JSON-mode-aware way.
 */

import * as colors from '../colors.js';
import { print } from './output.js';

export interface TableRow {
  /** Colored type label (e.g., the colored "PR #123" or "main" tag) */
  label: string;
  /** Optional change indicator appended to label */
  indicator?: string;
  /** Key-value fields displayed indented below the label */
  fields: Array<{ key: string; value: string }>;
}

export interface TableOptions {
  /** Bold title printed above the table */
  title?: string;
  /** Rows to display */
  rows: TableRow[];
  /** Dim summary line printed below the table */
  summary?: string;
  /** Whether verbose fields are included (informational only) */
  verbose?: boolean;
}

/**
 * Print a structured table of rows with labels and fields.
 *
 * Output format per row:
 * ```
 *   {label}{indicator}
 *     {key}: {value}
 *     ...
 * ```
 */
export function printTable(options: TableOptions): void {
  if (options.rows.length === 0) {
    return;
  }

  if (options.title) {
    print('');
    print(colors.bold(options.title));
    print('');
  }

  // Calculate max key length for alignment within each row
  const allKeys = options.rows.flatMap((r) => r.fields.map((f) => f.key));
  const maxKeyLen = allKeys.length > 0 ? Math.max(...allKeys.map((k) => k.length)) : 0;

  for (const row of options.rows) {
    const indicator = row.indicator ?? '';
    print(`  ${row.label}${indicator}`);

    for (const field of row.fields) {
      const padded = field.key.padEnd(maxKeyLen + 1);
      print(`    ${padded} ${field.value}`);
    }

    print('');
  }

  if (options.summary) {
    print(colors.dim(options.summary));
    print('');
  }
}
