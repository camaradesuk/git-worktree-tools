/**
 * JSON-mode-aware output gate.
 *
 * All ui/ print functions call print() / printErr() instead of
 * console.log / console.error directly. A single setJsonMode(true)
 * call in CLI init silences all structured output.
 */

let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * Write to stdout, suppressed when JSON mode is active.
 */
export function print(...args: unknown[]): void {
  if (!jsonMode) {
    console.log(...args);
  }
}

/**
 * Write to stderr, suppressed when JSON mode is active.
 */
export function printErr(...args: unknown[]): void {
  if (!jsonMode) {
    console.error(...args);
  }
}
