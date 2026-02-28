/**
 * Logging system for git-worktree-tools
 *
 * Consola-based singleton logger with:
 * - AuditFileReporter: persistent audit log with size-based rotation
 * - ConditionalStderrReporter: verbose/quiet aware stderr output
 * - Audit session tracking (command, cwd, branch, exit code, duration)
 * - DEBUG=newpr deprecation handling
 *
 * Configuration sources (in order of priority):
 * 1. CLI flags (--verbose, --quiet, --no-color)
 * 2. Environment variables (GWT_LOG_LEVEL, DEBUG)
 * 3. Default (INFO)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createConsola } from 'consola';
import type { ConsolaReporter, LogObject } from 'consola';
import { LogLevel, MAX_LOG_FILE_SIZE, MAX_LOG_FILES, getGlobalDataDir } from './constants.js';
import { setColorEnabled } from './colors.js';

export { LogLevel };

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Whether the DEBUG=newpr deprecation warning has been printed */
let deprecationWarned = false;

/** Whether JSON output mode is active */
let jsonMode = false;

/** Audit session context for the process exit handler */
let auditContext: {
  command?: string;
  startTime?: number;
  cwd?: string;
  gitBranch?: string;
  worktreePath?: string;
  prNumber?: number;
  exitCode?: number;
} = {};

/** Track whether exit handler has been registered */
let exitHandlerRegistered = false;

/** Track whether audit file warning has been issued */
let auditFileWarned = false;

/** Reference to the AuditFileReporter for exit-time sync write */
let activeAuditReporter: AuditFileReporter | null = null;

// ---------------------------------------------------------------------------
// AuditFileReporter
// ---------------------------------------------------------------------------

/**
 * Writes log entries to a persistent audit file with size-based rotation.
 * Human-readable text lines by default; JSONL when json mode is active.
 */
class AuditFileReporter implements ConsolaReporter {
  private stream: fs.WriteStream | null = null;
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      rotateIfNeeded(filePath);
      this.stream = fs.createWriteStream(filePath, { flags: 'a' });
      this.stream.on('error', (err) => {
        if (!auditFileWarned) {
          auditFileWarned = true;
          process.stderr.write(`[gwt] Audit log write error: ${err.message}\n`);
        }
        this.stream = null;
      });
    } catch (err) {
      if (!auditFileWarned) {
        auditFileWarned = true;
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[gwt] Failed to open audit log: ${msg}\n`);
      }
    }
  }

  log(logObj: LogObject): void {
    if (!this.stream) return;

    try {
      const timestamp = new Date().toISOString();
      const levelName = levelToName(logObj.level);
      const tag = logObj.tag ? ` [${logObj.tag}]` : '';
      const message = formatLogArgs(logObj.args);

      if (jsonMode) {
        const entry = {
          timestamp,
          level: levelName,
          ...(logObj.tag ? { tag: logObj.tag } : {}),
          message,
        };
        this.stream.write(JSON.stringify(entry) + '\n');
      } else {
        this.stream.write(`[${timestamp}] ${levelName}${tag} ${message}\n`);
      }
    } catch {
      // Swallow write errors silently after first warning
    }
  }

  close(): void {
    if (this.stream) {
      const stream = this.stream;
      this.stream = null;
      // Close the fd synchronously so callers can immediately delete the file.
      // On Windows, stream.end()/destroy() close the fd asynchronously, leaving
      // the file locked until the next tick.
      const streamInternal = stream as unknown as { fd: number | null };
      const fd = streamInternal.fd;
      if (typeof fd === 'number') {
        // Null out the fd BEFORE closing so destroy() won't try to close it
        // again (which would risk closing a reused fd number).
        streamInternal.fd = null;
        try {
          fs.closeSync(fd);
        } catch {
          /* best effort */
        }
      }
      stream.removeAllListeners('error');
      stream.on('error', () => {});
      stream.destroy();
    }
  }
}

// ---------------------------------------------------------------------------
// ConditionalStderrReporter
// ---------------------------------------------------------------------------

/**
 * Writes to stderr based on log level and verbose mode.
 * WARN and ERROR always print; DEBUG/INFO/TRACE only print when verbose=true.
 */
class ConditionalStderrReporter implements ConsolaReporter {
  private verbose: boolean;
  private useColors: boolean;

  constructor(verbose: boolean, useColors: boolean) {
    this.verbose = verbose;
    this.useColors = useColors;
  }

  log(logObj: LogObject): void {
    // Level < 2 means warn (1) or error/fatal (0) — always print
    // Level >= 2 means info (3), debug (4), trace (5) — only if verbose
    if (logObj.level >= 2 && !this.verbose) {
      return;
    }

    const levelName = levelToName(logObj.level);
    const tag = logObj.tag ? ` [${logObj.tag}]` : '';
    const message = formatLogArgs(logObj.args);

    let prefix: string;
    if (this.useColors) {
      prefix = colorizeLevel(levelName, logObj.level);
    } else {
      prefix = `[${levelName}]`;
    }

    process.stderr.write(`${prefix}${tag} ${message}\n`);
  }
}

// ---------------------------------------------------------------------------
// Rotation logic
// ---------------------------------------------------------------------------

function rotateIfNeeded(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size <= MAX_LOG_FILE_SIZE) return;

    // Shift: audit.log.2 deleted, audit.log.1 -> .2, audit.log -> .1
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
  } catch {
    // Best-effort rotation — do not crash
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelToName(level: number): string {
  if (level <= 0) {
    // 0 = error/fatal, negative = silent (shouldn't log)
    return level === 0 ? 'ERROR' : 'SILENT';
  }
  switch (level) {
    case 1:
      return 'WARN';
    case 2:
      return 'LOG';
    case 3:
      return 'INFO';
    case 4:
      return 'DEBUG';
    case 5:
      return 'TRACE';
    default:
      return level > 5 ? 'TRACE' : 'ERROR';
  }
}

function colorizeLevel(name: string, level: number): string {
  // ANSI color codes
  const RED = '\x1b[31m';
  const YELLOW = '\x1b[33m';
  const CYAN = '\x1b[36m';
  const GRAY = '\x1b[90m';
  const RESET = '\x1b[0m';

  switch (true) {
    case level <= 0:
      return `${RED}[${name}]${RESET}`;
    case level === 1:
      return `${YELLOW}[${name}]${RESET}`;
    case level <= 3:
      return `${CYAN}[${name}]${RESET}`;
    default:
      return `${GRAY}[${name}]${RESET}`;
  }
}

function formatLogArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a)))
    .join(' ');
}

function getCurrentGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Logger singleton
// ---------------------------------------------------------------------------

/**
 * The singleton consola logger instance.
 * Starts with empty reporters — call initializeLogger() to configure.
 */
export const logger = createConsola({
  level: 3, // INFO default
  reporters: [],
});

// ---------------------------------------------------------------------------
// initializeLogger
// ---------------------------------------------------------------------------

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  json?: boolean;
  commandName?: string;
}

/**
 * Configure the logger with CLI flags, env vars, and reporters.
 * Must be called early in CLI startup. Safe to call multiple times
 * (replaces reporters each time).
 */
export function initializeLogger(options: LoggerOptions = {}): void {
  // ----------------------------------------------------------
  // 1. Resolve level: CLI flag > env var > default
  // ----------------------------------------------------------
  let level: number;

  if (options.quiet) {
    level = 0; // error only
  } else if (options.verbose) {
    level = 4; // debug
  } else if (process.env.GWT_LOG_LEVEL) {
    const parsed = parseLogLevel(process.env.GWT_LOG_LEVEL);
    level = parsed !== undefined ? parsed : 3;
  } else if (
    process.env.DEBUG === 'newpr' ||
    process.env.DEBUG === '*' ||
    process.env.DEBUG === '1'
  ) {
    level = 4; // debug
    if (!deprecationWarned) {
      deprecationWarned = true;
      process.stderr.write('WARNING: DEBUG=newpr is deprecated, use GWT_LOG_LEVEL=debug\n');
    }
  } else {
    level = 3; // info (default)
  }

  logger.level = level;

  // ----------------------------------------------------------
  // 2. Handle color
  // ----------------------------------------------------------
  const useColors = !options.noColor && process.env.NO_COLOR === undefined;
  if (options.noColor) {
    setColorEnabled(false);
  }

  // ----------------------------------------------------------
  // 3. JSON mode
  // ----------------------------------------------------------
  jsonMode = options.json ?? false;

  // ----------------------------------------------------------
  // 4. Build reporters
  // ----------------------------------------------------------
  const reporters: ConsolaReporter[] = [];

  // Audit file reporter (always on)
  try {
    const auditPath = path.join(getGlobalDataDir(), 'audit.log');
    const auditReporter = new AuditFileReporter(auditPath);
    reporters.push(auditReporter);
    activeAuditReporter = auditReporter;
  } catch {
    // Best effort — continue without audit file
  }

  // Stderr reporter
  const verbose = options.verbose ?? false;
  reporters.push(new ConditionalStderrReporter(verbose, useColors));

  logger.setReporters(reporters);

  // ----------------------------------------------------------
  // 5. Audit session tracking
  // ----------------------------------------------------------
  if (options.commandName) {
    auditContext.command = options.commandName;
    auditContext.startTime = Date.now();
    auditContext.cwd = process.cwd();
    auditContext.gitBranch = getCurrentGitBranch();
  }

  if (!exitHandlerRegistered) {
    exitHandlerRegistered = true;
    process.on('exit', (code) => {
      if (!auditContext.command || !activeAuditReporter) return;

      const duration = auditContext.startTime ? Date.now() - auditContext.startTime : 0;

      const entry: Record<string, unknown> = {
        type: 'session',
        timestamp: new Date().toISOString(),
        command: auditContext.command,
        cwd: auditContext.cwd,
        gitBranch: auditContext.gitBranch,
        exitCode: code,
        durationMs: duration,
      };
      if (auditContext.worktreePath) entry.worktreePath = auditContext.worktreePath;
      if (auditContext.prNumber !== undefined) entry.prNumber = auditContext.prNumber;

      // Must be synchronous — Node.js does not process async after 'exit'
      try {
        const logPath = activeAuditReporter.filePath;
        const line = jsonMode
          ? JSON.stringify(entry)
          : `[${entry.timestamp}] SESSION command=${entry.command} cwd=${entry.cwd} branch=${entry.gitBranch} exit=${code} duration=${duration}ms`;
        fs.appendFileSync(logPath, line + '\n');
      } catch {
        // Cannot do anything on exit — swallow
      }
    });
  }
}

// ---------------------------------------------------------------------------
// setAuditContext
// ---------------------------------------------------------------------------

/**
 * Merge additional metadata into the audit context.
 * Called from CLI handlers to add worktreePath, prNumber, etc.
 */
export function setAuditContext(ctx: Partial<typeof auditContext>): void {
  Object.assign(auditContext, ctx);
}

// ---------------------------------------------------------------------------
// parseLogLevel
// ---------------------------------------------------------------------------

/**
 * Parse a string log level name to its numeric consola equivalent.
 * Returns undefined for unrecognized values.
 */
export function parseLogLevel(value: string): number | undefined {
  const normalized = value.toLowerCase().trim();
  const mapping: Record<string, number> = {
    silent: -999,
    error: 0,
    warn: 1,
    warning: 1,
    info: 3,
    debug: 4,
    trace: 5,
    verbose: 4,
  };
  return mapping[normalized];
}

// ---------------------------------------------------------------------------
// _resetForTesting
// ---------------------------------------------------------------------------

/**
 * Reset all module-level state for test isolation.
 * Prefixed with _ to signal internal-only use.
 */
export function _resetForTesting(): void {
  deprecationWarned = false;
  jsonMode = false;
  auditContext = {};
  auditFileWarned = false;
  if (activeAuditReporter) {
    activeAuditReporter.close();
  }
  activeAuditReporter = null;
  // Note: we don't reset exitHandlerRegistered because process.on('exit') handlers
  // cannot be removed cleanly and we only register once per process.
  logger.setReporters([]);
  logger.level = 3; // INFO default
}
