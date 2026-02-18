/**
 * Shared UI primitives for CLI output.
 *
 * Provides JSON-mode-aware, themed output functions that replace
 * inline console.log(colors.something(...)) patterns in CLI files.
 */

// Theme constants
export { icons, box, changeIndicator } from './theme.js';

// Output gating
export { setJsonMode, isJsonMode, print, printErr } from './output.js';

// Status output
export {
  printStatus,
  printHeader,
  printDetail,
  printDim,
  printNextSteps,
  printSummaryBox,
} from './status.js';

// Table output
export { printTable } from './table.js';
export type { TableRow, TableOptions } from './table.js';

// Error output
export { printError, errorToDisplay } from './error.js';
export type { ErrorDisplayOptions } from './error.js';

// Spinner
export { withSpinner } from './spinner.js';
