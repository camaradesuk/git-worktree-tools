/**
 * ANSI color codes for terminal output
 */
export const codes = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright foreground colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

/**
 * Check if colors should be enabled based on environment
 */
function shouldUseColors(): boolean {
  // Respect NO_COLOR environment variable
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // Respect FORCE_COLOR environment variable
  if (process.env.FORCE_COLOR !== undefined) {
    return true;
  }

  // Check if stdout is a TTY
  return process.stdout.isTTY ?? false;
}

let colorEnabled = shouldUseColors();

/**
 * Enable or disable color output at runtime
 * Used by --no-color flag and NO_COLOR env var handling
 */
export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

/**
 * Wrap text with ANSI color codes
 */
function colorize(text: string, code: string): string {
  if (!colorEnabled) {
    return text;
  }
  return `${code}${text}${codes.reset}`;
}

// Color functions
export function red(text: string): string {
  return colorize(text, codes.red);
}

export function green(text: string): string {
  return colorize(text, codes.green);
}

export function yellow(text: string): string {
  return colorize(text, codes.yellow);
}

export function blue(text: string): string {
  return colorize(text, codes.blue);
}

export function cyan(text: string): string {
  return colorize(text, codes.cyan);
}

export function magenta(text: string): string {
  return colorize(text, codes.magenta);
}

export function white(text: string): string {
  return colorize(text, codes.white);
}

export function gray(text: string): string {
  return colorize(text, codes.brightBlack);
}

export function black(text: string): string {
  return colorize(text, codes.black);
}

// Background color functions
export function bgBlue(text: string): string {
  return colorize(text, codes.bgBlue);
}

export function bgYellow(text: string): string {
  return colorize(text, codes.bgYellow);
}

export function bgRed(text: string): string {
  return colorize(text, codes.bgRed);
}

export function bgGreen(text: string): string {
  return colorize(text, codes.bgGreen);
}

// Style functions
export function bold(text: string): string {
  return colorize(text, codes.bold);
}

export function dim(text: string): string {
  return colorize(text, codes.dim);
}

export function italic(text: string): string {
  return colorize(text, codes.italic);
}

export function underline(text: string): string {
  return colorize(text, codes.underline);
}

// Semantic output functions with icons
export function success(text: string): string {
  const icon = colorEnabled ? '✓' : '[OK]';
  return `${green(icon)} ${text}`;
}

export function warning(text: string): string {
  const icon = colorEnabled ? '⚠' : '[WARN]';
  return `${yellow(icon)} ${yellow(text)}`;
}

export function error(text: string): string {
  const icon = colorEnabled ? '✗' : '[ERROR]';
  return `${red(icon)} ${red(text)}`;
}

export function info(text: string): string {
  const icon = colorEnabled ? 'ℹ' : '[INFO]';
  return `${blue(icon)} ${text}`;
}

export function debug(text: string): string {
  return dim(`[DEBUG] ${text}`);
}

// Utility for headers/titles
export function header(text: string): string {
  return bold(cyan(text));
}

// Utility for highlighting values
export function highlight(text: string): string {
  return bold(white(text));
}
