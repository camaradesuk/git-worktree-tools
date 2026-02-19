/**
 * Shared deprecation notice utility
 *
 * Prints a stderr deprecation warning for legacy CLI commands.
 * Respects JSON mode and suppression env var.
 */

/**
 * Print a deprecation notice to stderr.
 *
 * Skips output when:
 * - GWT_NO_DEPRECATION_WARNINGS=1 is set
 * - --json flag is present in process.argv (avoids corrupting structured output)
 *
 * @param oldCommand - The deprecated command name (e.g., 'lswt')
 * @param newCommand - The replacement command (e.g., 'wt list')
 */
export function printDeprecationNotice(oldCommand: string, newCommand: string): void {
  // Skip in JSON mode to avoid corrupting structured output
  if (process.argv.includes('--json')) return;

  // Allow suppression via environment variable
  if (process.env.GWT_NO_DEPRECATION_WARNINGS === '1') return;

  process.stderr.write(
    `\x1b[33m[DEPRECATED]\x1b[0m "${oldCommand}" is deprecated. Use "${newCommand}" instead.\n` +
      `This command will be removed in a future version.\n` +
      `Set GWT_NO_DEPRECATION_WARNINGS=1 to suppress this notice.\n\n`
  );
}
