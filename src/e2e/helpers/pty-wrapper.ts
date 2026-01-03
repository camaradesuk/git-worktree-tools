import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to compiled CLI scripts
 */
const CLI_DIR = path.resolve(__dirname, '../../../dist/cli');

/**
 * PTY session options
 */
export interface PtyOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
  timeout?: number;
}

/**
 * An interaction step for interactive CLI testing
 */
export interface PtyInteraction {
  /** Pattern to wait for before sending input */
  waitFor: string | RegExp;
  /** Input to send (will be followed by Enter unless raw is true) */
  send: string;
  /** If true, don't append Enter key */
  raw?: boolean;
  /** Delay in ms after sending (for animations) */
  delay?: number;
}

/**
 * Result of an interactive PTY session
 */
export interface PtyResult {
  /** All captured output */
  output: string;
  /** Exit code of the process */
  exitCode: number;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the session timed out */
  timedOut: boolean;
}

/**
 * Active PTY session
 */
export interface PtySession {
  /** Raw output buffer */
  output: string[];
  /** Write raw data to the PTY */
  write: (data: string) => void;
  /** Send a line (with Enter key) */
  sendLine: (line: string) => void;
  /** Send a key (ANSI escape sequence) */
  sendKey: (key: 'up' | 'down' | 'enter' | 'escape' | 'tab' | string) => void;
  /** Wait for a pattern in output */
  waitFor: (pattern: string | RegExp, timeoutMs?: number) => Promise<void>;
  /** Get all output as a string */
  getOutput: () => string;
  /** Kill the process */
  kill: () => void;
  /** Wait for the process to exit */
  waitForExit: (timeoutMs?: number) => Promise<number>;
}

/**
 * Key code mapping for common keys
 */
const KEY_CODES: Record<string, string> = {
  up: '\x1B[A',
  down: '\x1B[B',
  right: '\x1B[C',
  left: '\x1B[D',
  enter: '\r',
  escape: '\x1B',
  tab: '\t',
  backspace: '\x7F',
  space: ' ',
  'ctrl+c': '\x03',
  'ctrl+d': '\x04',
};

/**
 * Check if node-pty is available
 */
let ptyModule: typeof import('node-pty') | null = null;
let ptyLoadError: Error | null = null;

/**
 * Load node-pty module (lazy loading for optional dependency)
 */
async function loadPty(): Promise<typeof import('node-pty')> {
  if (ptyModule) {
    return ptyModule;
  }

  if (ptyLoadError) {
    throw ptyLoadError;
  }

  try {
    ptyModule = await import('node-pty');
    return ptyModule;
  } catch (error) {
    ptyLoadError = new Error(
      'node-pty is not available. Install it with: npm install --save-dev node-pty\n' +
        `Original error: ${error instanceof Error ? error.message : error}`
    );
    throw ptyLoadError;
  }
}

/**
 * Check if PTY support is available
 */
export async function isPtyAvailable(): Promise<boolean> {
  try {
    await loadPty();
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn a PTY session for a CLI tool
 *
 * @param tool - The CLI tool to run
 * @param args - Command line arguments
 * @param options - PTY options
 * @returns Active PTY session
 */
export async function spawnPty(
  tool: string,
  args: string[],
  options: PtyOptions
): Promise<PtySession> {
  const pty = await loadPty();

  const scriptPath = path.join(CLI_DIR, `${tool}.js`);
  const isWindows = process.platform === 'win32';

  const shell = isWindows ? 'cmd.exe' : '/bin/sh';
  const shellArgs = isWindows
    ? ['/c', 'node', scriptPath, ...args]
    : ['-c', `node "${scriptPath}" ${args.map((a) => `"${a}"`).join(' ')}`];

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    FORCE_COLOR: '1', // Enable colors for realistic testing
    TERM: 'xterm-256color',
  };

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: options.cols || 80,
    rows: options.rows || 24,
    cwd: options.cwd,
    env,
  });

  const output: string[] = [];
  let exited = false;
  let exitCode = -1;

  // Collect output
  ptyProcess.onData((data: string) => {
    output.push(data);
  });

  // Handle exit
  const exitPromise = new Promise<number>((resolve) => {
    ptyProcess.onExit(({ exitCode: code }) => {
      exited = true;
      exitCode = code;
      resolve(code);
    });
  });

  const session: PtySession = {
    output,

    write: (data: string) => {
      if (!exited) {
        ptyProcess.write(data);
      }
    },

    sendLine: (line: string) => {
      if (!exited) {
        ptyProcess.write(line + '\r');
      }
    },

    sendKey: (key: string) => {
      const code = KEY_CODES[key.toLowerCase()] || key;
      if (!exited) {
        ptyProcess.write(code);
      }
    },

    waitFor: async (pattern: string | RegExp, timeoutMs = 5000) => {
      const startTime = Date.now();
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

      while (Date.now() - startTime < timeoutMs) {
        const fullOutput = output.join('');
        if (regex.test(fullOutput)) {
          return;
        }
        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      throw new Error(
        `Timeout waiting for pattern: ${pattern}\n` +
          `Current output:\n${output.join('')}`
      );
    },

    getOutput: () => output.join(''),

    kill: () => {
      if (!exited) {
        ptyProcess.kill();
      }
    },

    waitForExit: async (timeoutMs = 10000) => {
      if (exited) {
        return exitCode;
      }

      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => {
          ptyProcess.kill();
          reject(new Error('Process exit timeout'));
        }, timeoutMs);
      });

      return Promise.race([exitPromise, timeoutPromise]);
    },
  };

  return session;
}

/**
 * Run a CLI tool interactively with predefined interactions
 *
 * @param tool - The CLI tool to run
 * @param args - Command line arguments
 * @param interactions - List of wait/send interactions
 * @param options - PTY options
 * @returns Result of the interactive session
 */
export async function runInteractive(
  tool: string,
  args: string[],
  interactions: PtyInteraction[],
  options: PtyOptions
): Promise<PtyResult> {
  const startTime = Date.now();
  const timeout = options.timeout || 30000;
  let timedOut = false;

  const session = await spawnPty(tool, args, options);

  try {
    for (const interaction of interactions) {
      // Check if we've exceeded timeout
      if (Date.now() - startTime > timeout) {
        timedOut = true;
        break;
      }

      // Wait for pattern
      await session.waitFor(interaction.waitFor, timeout - (Date.now() - startTime));

      // Optional delay before sending
      if (interaction.delay) {
        await new Promise((resolve) => setTimeout(resolve, interaction.delay));
      }

      // Send input
      if (interaction.raw) {
        session.write(interaction.send);
      } else {
        session.sendLine(interaction.send);
      }
    }

    // Wait for process to exit
    const exitCode = await session.waitForExit(timeout - (Date.now() - startTime));

    return {
      output: session.getOutput(),
      exitCode,
      duration: Date.now() - startTime,
      timedOut: false,
    };
  } catch (error) {
    session.kill();

    if (error instanceof Error && error.message.includes('Timeout')) {
      return {
        output: session.getOutput(),
        exitCode: -1,
        duration: Date.now() - startTime,
        timedOut: true,
      };
    }

    throw error;
  }
}

/**
 * Helper to create common menu interaction patterns
 */
export const menuInteractions = {
  /**
   * Select an option by number
   */
  selectNumber: (prompt: string | RegExp, number: number): PtyInteraction => ({
    waitFor: prompt,
    send: String(number),
  }),

  /**
   * Navigate down and select
   */
  navigateDown: (prompt: string | RegExp, times: number = 1): PtyInteraction[] => {
    const interactions: PtyInteraction[] = [
      { waitFor: prompt, send: KEY_CODES.down.repeat(times), raw: true },
    ];
    return interactions;
  },

  /**
   * Confirm with yes
   */
  confirmYes: (prompt: string | RegExp): PtyInteraction => ({
    waitFor: prompt,
    send: 'y',
  }),

  /**
   * Confirm with no
   */
  confirmNo: (prompt: string | RegExp): PtyInteraction => ({
    waitFor: prompt,
    send: 'n',
  }),

  /**
   * Press Enter to continue
   */
  pressEnter: (prompt: string | RegExp): PtyInteraction => ({
    waitFor: prompt,
    send: '',
  }),

  /**
   * Cancel/quit
   */
  cancel: (prompt: string | RegExp): PtyInteraction => ({
    waitFor: prompt,
    send: 'q',
  }),
};

/**
 * Strip ANSI escape codes from output for easier assertion
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Wait for a delay (useful between interactions)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
