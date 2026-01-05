/**
 * Logging system for git-worktree-tools
 *
 * Provides a singleton logger with:
 * - Multiple log levels (silent, error, warn, info, debug, trace)
 * - Console and file output support
 * - Log file rotation
 * - Timestamps and context
 * - Color support for console output
 *
 * Configuration sources (in order of priority):
 * 1. CLI flags (--verbose, --debug, --log-file)
 * 2. Environment variables (GWT_LOG_LEVEL, GWT_LOG_FILE)
 * 3. Config files (logLevel, logFile properties)
 */

import fs from 'fs';
import path from 'path';
import {
  LogLevel,
  DEFAULT_LOG_LEVEL,
  MAX_LOG_FILE_SIZE,
  MAX_LOG_FILES,
  getGlobalLogDir,
} from './constants.js';
import { red, yellow, cyan, gray, bold } from './colors.js';

export { LogLevel };

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Log level threshold */
  level?: LogLevel;
  /** Path to log file (enables file logging) */
  logFile?: string;
  /** Whether to include timestamps in output */
  timestamps?: boolean;
  /** Whether to use colors in console output */
  colors?: boolean;
  /** Whether to also write to console when file logging is enabled */
  consoleOutput?: boolean;
}

/**
 * Log entry structure for file output
 */
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  data?: unknown;
}

/**
 * Parse log level from string
 */
export function parseLogLevel(value: string): LogLevel | undefined {
  const normalized = value.toLowerCase().trim();
  const mapping: Record<string, LogLevel> = {
    silent: LogLevel.SILENT,
    error: LogLevel.ERROR,
    warn: LogLevel.WARN,
    warning: LogLevel.WARN,
    info: LogLevel.INFO,
    debug: LogLevel.DEBUG,
    trace: LogLevel.TRACE,
    verbose: LogLevel.DEBUG,
    '0': LogLevel.SILENT,
    '1': LogLevel.ERROR,
    '2': LogLevel.WARN,
    '3': LogLevel.INFO,
    '4': LogLevel.DEBUG,
    '5': LogLevel.TRACE,
  };
  return mapping[normalized];
}

/**
 * Get log level name
 */
function getLevelName(level: LogLevel): string {
  const names: Record<LogLevel, string> = {
    [LogLevel.SILENT]: 'SILENT',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.TRACE]: 'TRACE',
  };
  return names[level] || 'UNKNOWN';
}

/**
 * Format a log message for console output with colors
 */
function formatConsoleMessage(
  level: LogLevel,
  message: string,
  timestamp: string | null,
  useColors: boolean
): string {
  const parts: string[] = [];

  if (timestamp) {
    parts.push(useColors ? gray(`[${timestamp}]`) : `[${timestamp}]`);
  }

  const levelStr = getLevelName(level).padEnd(5);
  let formattedLevel: string;
  let formattedMessage: string;

  if (useColors) {
    switch (level) {
      case LogLevel.ERROR:
        formattedLevel = red(bold(levelStr));
        formattedMessage = red(message);
        break;
      case LogLevel.WARN:
        formattedLevel = yellow(bold(levelStr));
        formattedMessage = yellow(message);
        break;
      case LogLevel.DEBUG:
      case LogLevel.TRACE:
        formattedLevel = gray(levelStr);
        formattedMessage = gray(message);
        break;
      default:
        formattedLevel = cyan(levelStr);
        formattedMessage = message;
    }
  } else {
    formattedLevel = levelStr;
    formattedMessage = message;
  }

  parts.push(formattedLevel);
  parts.push(formattedMessage);

  return parts.join(' ');
}

/**
 * Singleton Logger class
 */
class Logger {
  private static instance: Logger | null = null;
  private level: LogLevel = DEFAULT_LOG_LEVEL;
  private logFile: string | null = null;
  private fileStream: fs.WriteStream | null = null;
  private timestamps: boolean = true;
  private colors: boolean = true;
  private consoleOutput: boolean = true;
  private context: string | null = null;
  private initialized: boolean = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton logger instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Initialize the logger with configuration
   * Should be called early in CLI startup
   */
  initialize(config: LoggerConfig = {}): void {
    // Determine log level from multiple sources (priority order)
    // 1. Explicit config (from CLI flags)
    // 2. Environment variable
    // 3. Default

    if (config.level !== undefined) {
      this.level = config.level;
    } else {
      const envLevel = process.env.GWT_LOG_LEVEL;
      if (envLevel) {
        const parsed = parseLogLevel(envLevel);
        if (parsed !== undefined) {
          this.level = parsed;
        }
      }
    }

    // Determine log file from multiple sources
    if (config.logFile !== undefined) {
      this.logFile = config.logFile;
    } else {
      const envLogFile = process.env.GWT_LOG_FILE;
      if (envLogFile) {
        this.logFile = envLogFile;
      }
    }

    if (config.timestamps !== undefined) {
      this.timestamps = config.timestamps;
    }

    if (config.colors !== undefined) {
      this.colors = config.colors;
    }

    if (config.consoleOutput !== undefined) {
      this.consoleOutput = config.consoleOutput;
    }

    // Set up file logging if configured
    if (this.logFile) {
      this.setupFileLogging(this.logFile);
    }

    this.initialized = true;
  }

  /**
   * Set up file logging with rotation
   */
  private setupFileLogging(filePath: string): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });

      // Check if rotation is needed
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_LOG_FILE_SIZE) {
          this.rotateLogFiles(filePath);
        }
      }

      // Open file stream in append mode
      this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });
      this.fileStream.on('error', (err) => {
        console.error(`Logger: Failed to write to log file: ${err.message}`);
        this.fileStream = null;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Logger: Failed to set up file logging: ${message}`);
    }
  }

  /**
   * Rotate log files
   */
  private rotateLogFiles(filePath: string): void {
    try {
      // Shift existing rotated files
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const older = `${filePath}.${i}`;
        const newer = i === 1 ? filePath : `${filePath}.${i - 1}`;
        if (fs.existsSync(newer)) {
          if (i === MAX_LOG_FILES - 1 && fs.existsSync(older)) {
            fs.unlinkSync(older);
          }
          fs.renameSync(newer, older);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Logger: Failed to rotate log files: ${message}`);
    }
  }

  /**
   * Set the current context (e.g., command name)
   */
  setContext(context: string | null): void {
    this.context = context;
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return level <= this.level;
  }

  /**
   * Check if the logger is in debug mode
   */
  isDebug(): boolean {
    return this.level >= LogLevel.DEBUG;
  }

  /**
   * Check if the logger is in trace mode
   */
  isTrace(): boolean {
    return this.level >= LogLevel.TRACE;
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level > this.level) {
      return;
    }

    const timestamp = this.timestamps ? new Date().toISOString() : null;
    const formattedMessage = args.length > 0 ? this.formatMessage(message, args) : message;

    // Console output
    if (this.consoleOutput || !this.fileStream) {
      const consoleMsg = formatConsoleMessage(
        level,
        formattedMessage,
        timestamp,
        this.colors && process.stdout.isTTY === true
      );

      if (level === LogLevel.ERROR) {
        console.error(consoleMsg);
      } else if (level === LogLevel.WARN) {
        console.warn(consoleMsg);
      } else {
        console.log(consoleMsg);
      }
    }

    // File output
    if (this.fileStream) {
      const entry: LogEntry = {
        timestamp: timestamp || new Date().toISOString(),
        level: getLevelName(level),
        message: formattedMessage,
      };
      if (this.context) {
        entry.context = this.context;
      }
      if (args.length > 0 && typeof args[0] === 'object') {
        entry.data = args[0];
      }
      this.fileStream.write(JSON.stringify(entry) + '\n');
    }
  }

  /**
   * Format message with arguments (simple substitution)
   */
  private formatMessage(message: string, args: unknown[]): string {
    let result = message;
    for (const arg of args) {
      const replacement = typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      result = result.replace('%s', replacement);
      result = result.replace('%d', replacement);
      result = result.replace('%j', typeof arg === 'object' ? JSON.stringify(arg) : replacement);
      result = result.replace('%o', typeof arg === 'object' ? JSON.stringify(arg) : replacement);
    }
    // Append remaining args if placeholders exhausted
    const placeholders = (message.match(/%[sdjo]/g) || []).length;
    if (args.length > placeholders) {
      const extra = args
        .slice(placeholders)
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)));
      result += ' ' + extra.join(' ');
    }
    return result;
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * Log a trace message
   */
  trace(message: string, ...args: unknown[]): void {
    this.log(LogLevel.TRACE, message, ...args);
  }

  /**
   * Log an error with stack trace
   */
  errorWithStack(err: Error, message?: string): void {
    const msg = message ? `${message}: ${err.message}` : err.message;
    this.error(msg);
    if (this.level >= LogLevel.DEBUG && err.stack) {
      this.debug(err.stack);
    }
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): ChildLogger {
    return new ChildLogger(this, context);
  }

  /**
   * Close the logger (flush file stream)
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.fileStream) {
        this.fileStream.end(() => {
          this.fileStream = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the default log file path
   */
  static getDefaultLogFilePath(): string {
    return path.join(getGlobalLogDir(), 'wt.log');
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static reset(): void {
    if (Logger.instance) {
      Logger.instance.close();
      Logger.instance = null;
    }
  }
}

/**
 * Child logger with a specific context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: string
  ) {}

  error(message: string, ...args: unknown[]): void {
    this.parent.setContext(this.context);
    this.parent.error(message, ...args);
    this.parent.setContext(null);
  }

  warn(message: string, ...args: unknown[]): void {
    this.parent.setContext(this.context);
    this.parent.warn(message, ...args);
    this.parent.setContext(null);
  }

  info(message: string, ...args: unknown[]): void {
    this.parent.setContext(this.context);
    this.parent.info(message, ...args);
    this.parent.setContext(null);
  }

  debug(message: string, ...args: unknown[]): void {
    this.parent.setContext(this.context);
    this.parent.debug(message, ...args);
    this.parent.setContext(null);
  }

  trace(message: string, ...args: unknown[]): void {
    this.parent.setContext(this.context);
    this.parent.trace(message, ...args);
    this.parent.setContext(null);
  }
}

/**
 * The singleton logger instance
 */
export const logger = Logger.getInstance();

/**
 * Initialize the logger from CLI arguments and config
 * Call this early in CLI entry points
 */
export function initializeLogger(options: {
  verbose?: boolean | number;
  debug?: boolean;
  logFile?: string;
  quiet?: boolean;
  configLogLevel?: LogLevel | string;
  configLogFile?: string;
}): void {
  let level: LogLevel | undefined;

  // Priority: CLI flags > env vars > config
  if (options.quiet) {
    level = LogLevel.SILENT;
  } else if (options.debug) {
    level = LogLevel.DEBUG;
  } else if (options.verbose !== undefined) {
    if (typeof options.verbose === 'number') {
      // -v = DEBUG, -vv = TRACE
      level = options.verbose >= 2 ? LogLevel.TRACE : LogLevel.DEBUG;
    } else if (options.verbose) {
      level = LogLevel.DEBUG;
    }
  } else if (process.env.GWT_LOG_LEVEL) {
    level = parseLogLevel(process.env.GWT_LOG_LEVEL);
  } else if (options.configLogLevel) {
    level =
      typeof options.configLogLevel === 'string'
        ? parseLogLevel(options.configLogLevel)
        : options.configLogLevel;
  }

  // Log file priority: CLI flag > env var > config
  let logFile: string | undefined;
  if (options.logFile) {
    logFile = options.logFile;
  } else if (process.env.GWT_LOG_FILE) {
    logFile = process.env.GWT_LOG_FILE;
  } else if (options.configLogFile) {
    logFile = options.configLogFile;
  }

  logger.initialize({
    level,
    logFile,
  });
}
