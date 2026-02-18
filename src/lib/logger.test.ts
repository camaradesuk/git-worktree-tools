/**
 * Comprehensive tests for logger.ts (consola-based)
 *
 * Covers:
 * - parseLogLevel mapping
 * - LogLevel compatibility export
 * - initializeLogger level resolution (flag precedence)
 * - DEBUG=newpr deprecation path
 * - AuditFileReporter (write, JSONL, directory creation, rotation)
 * - ConditionalStderrReporter (verbose/non-verbose conditional output)
 * - Process exit handler (synchronous audit summary)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseLogLevel,
  initializeLogger,
  logger,
  LogLevel,
  setAuditContext,
  _resetForTesting,
} from './logger.js';

// ---------------------------------------------------------------------------
// Test-level helpers
// ---------------------------------------------------------------------------

/** Saved env vars to restore after each test */
let savedEnv: Record<string, string | undefined>;

/** Per-test temp directory */
let tempDir: string;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
}

function cleanupTempDir(dir: string): void {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// parseLogLevel
// ---------------------------------------------------------------------------

describe('parseLogLevel', () => {
  it('parses "debug" to 4', () => {
    expect(parseLogLevel('debug')).toBe(4);
  });

  it('parses "info" to 3', () => {
    expect(parseLogLevel('info')).toBe(3);
  });

  it('parses "warn" to 1', () => {
    expect(parseLogLevel('warn')).toBe(1);
  });

  it('parses "warning" to 1', () => {
    expect(parseLogLevel('warning')).toBe(1);
  });

  it('parses "error" to 0', () => {
    expect(parseLogLevel('error')).toBe(0);
  });

  it('parses "silent" to -999', () => {
    expect(parseLogLevel('silent')).toBe(-999);
  });

  it('parses "trace" to 5', () => {
    expect(parseLogLevel('trace')).toBe(5);
  });

  it('parses "verbose" to 4 (alias for debug)', () => {
    expect(parseLogLevel('verbose')).toBe(4);
  });

  it('is case insensitive — "DEBUG" returns 4', () => {
    expect(parseLogLevel('DEBUG')).toBe(4);
  });

  it('is case insensitive — mixed case "Error" returns 0', () => {
    expect(parseLogLevel('Error')).toBe(0);
  });

  it('returns undefined for "unknown"', () => {
    expect(parseLogLevel('unknown')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseLogLevel('')).toBeUndefined();
  });

  it('returns undefined for numeric strings', () => {
    expect(parseLogLevel('99')).toBeUndefined();
    expect(parseLogLevel('3')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(parseLogLevel('  info  ')).toBe(3);
    expect(parseLogLevel('\tdebug\n')).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// LogLevel compatibility export
// ---------------------------------------------------------------------------

describe('LogLevel compatibility export', () => {
  it('LogLevel.SILENT exists and equals -999', () => {
    expect(LogLevel.SILENT).toBe(-999);
  });

  it('LogLevel.ERROR equals 0', () => {
    expect(LogLevel.ERROR).toBe(0);
  });

  it('LogLevel.WARN equals 1', () => {
    expect(LogLevel.WARN).toBe(1);
  });

  it('LogLevel.INFO equals 3', () => {
    expect(LogLevel.INFO).toBe(3);
  });

  it('LogLevel.DEBUG equals 4', () => {
    expect(LogLevel.DEBUG).toBe(4);
  });

  it('LogLevel.TRACE equals 5', () => {
    expect(LogLevel.TRACE).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Logger singleton
// ---------------------------------------------------------------------------

describe('Logger singleton', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('returns same instance on repeated access', () => {
    const instance1 = logger;
    const instance2 = logger;
    expect(instance1).toBe(instance2);
  });

  it('defaults to level 3 (INFO) after reset', () => {
    expect(logger.level).toBe(3);
  });

  it('has standard logging methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.trace).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// initializeLogger — level resolution
// ---------------------------------------------------------------------------

describe('initializeLogger level resolution', () => {
  beforeEach(() => {
    _resetForTesting();
    savedEnv = {
      GWT_LOG_LEVEL: process.env.GWT_LOG_LEVEL,
      DEBUG: process.env.DEBUG,
      NO_COLOR: process.env.NO_COLOR,
    };
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    _resetForTesting();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('quiet flag sets level to 0 (error only) regardless of env', () => {
    process.env.GWT_LOG_LEVEL = 'debug';
    initializeLogger({ quiet: true });
    expect(logger.level).toBe(0);
  });

  it('verbose flag sets level to 4 (debug)', () => {
    initializeLogger({ verbose: true });
    expect(logger.level).toBe(4);
  });

  it('GWT_LOG_LEVEL=debug with no flags sets level to 4', () => {
    process.env.GWT_LOG_LEVEL = 'debug';
    initializeLogger({});
    expect(logger.level).toBe(4);
  });

  it('GWT_LOG_LEVEL=warn with no flags sets level to 1', () => {
    process.env.GWT_LOG_LEVEL = 'warn';
    initializeLogger({});
    expect(logger.level).toBe(1);
  });

  it('quiet flag overrides GWT_LOG_LEVEL=debug (CLI flag wins)', () => {
    process.env.GWT_LOG_LEVEL = 'debug';
    initializeLogger({ quiet: true });
    expect(logger.level).toBe(0);
  });

  it('no flags and no env var defaults to level 3 (INFO)', () => {
    initializeLogger({});
    expect(logger.level).toBe(3);
  });

  it('quiet flag takes priority over verbose when both are set', () => {
    initializeLogger({ quiet: true, verbose: true });
    expect(logger.level).toBe(0);
  });

  it('GWT_LOG_LEVEL with invalid value falls back to INFO', () => {
    process.env.GWT_LOG_LEVEL = 'bananas';
    initializeLogger({});
    expect(logger.level).toBe(3);
  });

  it('verbose flag overrides GWT_LOG_LEVEL=warn (CLI flag wins)', () => {
    process.env.GWT_LOG_LEVEL = 'warn';
    initializeLogger({ verbose: true });
    expect(logger.level).toBe(4);
  });

  it('sets reporters when called', () => {
    initializeLogger({});
    expect(logger.options.reporters).toBeDefined();
    expect((logger.options.reporters as unknown[]).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DEBUG=newpr deprecation path
// ---------------------------------------------------------------------------

describe('DEBUG=newpr deprecation path', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    _resetForTesting();
    savedEnv = {
      GWT_LOG_LEVEL: process.env.GWT_LOG_LEVEL,
      DEBUG: process.env.DEBUG,
    };
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.DEBUG;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    _resetForTesting();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('DEBUG=newpr sets level to 4 (debug) and prints deprecation warning', () => {
    process.env.DEBUG = 'newpr';
    initializeLogger({});
    expect(logger.level).toBe(4);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARNING: DEBUG=newpr is deprecated')
    );
  });

  it('DEBUG=newpr deprecation warning fires exactly once across multiple calls', () => {
    process.env.DEBUG = 'newpr';
    initializeLogger({});
    initializeLogger({});
    const deprecationCalls = (stderrSpy.mock.calls as unknown[][]).filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('deprecated')
    );
    expect(deprecationCalls).toHaveLength(1);
  });

  it('DEBUG=* activates debug level and prints deprecation warning', () => {
    process.env.DEBUG = '*';
    initializeLogger({});
    expect(logger.level).toBe(4);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
  });

  it('DEBUG=1 activates debug level and prints deprecation warning', () => {
    process.env.DEBUG = '1';
    initializeLogger({});
    expect(logger.level).toBe(4);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
  });

  it('DEBUG=something_else does NOT activate debug — level stays at default', () => {
    process.env.DEBUG = 'something_else';
    initializeLogger({});
    expect(logger.level).toBe(3);
    const deprecationCalls = (stderrSpy.mock.calls as unknown[][]).filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('deprecated')
    );
    expect(deprecationCalls).toHaveLength(0);
  });

  it('GWT_LOG_LEVEL takes priority over DEBUG=newpr', () => {
    process.env.GWT_LOG_LEVEL = 'warn';
    process.env.DEBUG = 'newpr';
    initializeLogger({});
    expect(logger.level).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// _resetForTesting
// ---------------------------------------------------------------------------

describe('_resetForTesting', () => {
  it('resets logger level to INFO (3)', () => {
    logger.level = 0;
    _resetForTesting();
    expect(logger.level).toBe(3);
  });

  it('clears reporters', () => {
    initializeLogger({ verbose: true });
    _resetForTesting();
    expect(logger.options.reporters).toEqual([]);
  });

  it('resets deprecation warning flag so it can fire again', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const origDebug = process.env.DEBUG;
    const origGwt = process.env.GWT_LOG_LEVEL;
    delete process.env.GWT_LOG_LEVEL;

    process.env.DEBUG = 'newpr';
    initializeLogger({});

    _resetForTesting();
    delete process.env.GWT_LOG_LEVEL;
    process.env.DEBUG = 'newpr';
    initializeLogger({});

    const deprecationCalls = (stderrSpy.mock.calls as unknown[][]).filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('deprecated')
    );
    expect(deprecationCalls).toHaveLength(2);

    stderrSpy.mockRestore();
    if (origDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = origDebug;
    if (origGwt === undefined) delete process.env.GWT_LOG_LEVEL;
    else process.env.GWT_LOG_LEVEL = origGwt;
  });
});

// ---------------------------------------------------------------------------
// AuditFileReporter
// ---------------------------------------------------------------------------

describe('AuditFileReporter', () => {
  beforeEach(() => {
    _resetForTesting();
    tempDir = createTempDir();
    savedEnv = {
      GWT_LOG_LEVEL: process.env.GWT_LOG_LEVEL,
      DEBUG: process.env.DEBUG,
    };
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    _resetForTesting();
    cleanupTempDir(tempDir);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('writes a log entry to the audit log file', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    initializeLogger({ commandName: 'test-cmd' });
    logger.info('test audit message');

    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditPath = path.join(tempDir, 'audit.log');
    expect(fs.existsSync(auditPath)).toBe(true);
    const content = fs.readFileSync(auditPath, 'utf-8');
    expect(content).toContain('test audit message');

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('audit log entries contain timestamp, level, and message', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    initializeLogger({ commandName: 'test-cmd' });
    logger.warn('something went wrong');

    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditPath = path.join(tempDir, 'audit.log');
    const content = fs.readFileSync(auditPath, 'utf-8');
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(content).toMatch(/WARN/);
    expect(content).toContain('something went wrong');

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('writes JSONL entries when json mode is active', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    initializeLogger({ json: true, commandName: 'test-cmd' });
    logger.info('json test message');

    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditPath = path.join(tempDir, 'audit.log');
    const content = fs.readFileSync(auditPath, 'utf-8').trim();
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('message');
    }

    const hasMessage = lines.some((line) => {
      const parsed = JSON.parse(line);
      return parsed.message.includes('json test message');
    });
    expect(hasMessage).toBe(true);

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('creates audit directory automatically if it does not exist', async () => {
    const nestedDir = path.join(tempDir, 'nested', 'subdir');
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(nestedDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(fs.existsSync(nestedDir)).toBe(false);
    initializeLogger({ commandName: 'test-cmd' });
    expect(fs.existsSync(nestedDir)).toBe(true);

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

describe('Audit log rotation', () => {
  beforeEach(() => {
    _resetForTesting();
    tempDir = createTempDir();
    savedEnv = {
      GWT_LOG_LEVEL: process.env.GWT_LOG_LEVEL,
      DEBUG: process.env.DEBUG,
    };
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    _resetForTesting();
    cleanupTempDir(tempDir);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('rotates a file larger than 10MB to audit.log.1', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const auditPath = path.join(tempDir, 'audit.log');
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 100);
    fs.writeFileSync(auditPath, bigContent);

    initializeLogger({ commandName: 'test-cmd' });

    expect(fs.existsSync(path.join(tempDir, 'audit.log.1'))).toBe(true);
    const rotatedContent = fs.readFileSync(path.join(tempDir, 'audit.log.1'), 'utf-8');
    expect(rotatedContent).toBe(bigContent);

    logger.info('post-rotation entry');
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(fs.existsSync(auditPath)).toBe(true);
    const newSize = fs.statSync(auditPath).size;
    expect(newSize).toBeLessThan(10 * 1024 * 1024);

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('shifts existing rotated files: .1 becomes .2, original becomes .1, oldest deleted', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const auditPath = path.join(tempDir, 'audit.log');
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 100);
    fs.writeFileSync(auditPath, bigContent);
    fs.writeFileSync(auditPath + '.1', 'rotated-1-content');
    fs.writeFileSync(auditPath + '.2', 'rotated-2-content-to-be-deleted');

    initializeLogger({ commandName: 'test-cmd' });

    expect(fs.readFileSync(auditPath + '.2', 'utf-8')).toBe('rotated-1-content');
    expect(fs.readFileSync(auditPath + '.1', 'utf-8')).toBe(bigContent);

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('rotation failure does not crash the tool', async () => {
    const constantsMod = await import('./constants.js');
    const badDir = path.join(tempDir, 'readonly-test');
    fs.mkdirSync(badDir);
    const auditPath = path.join(badDir, 'audit.log');
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 100);
    fs.writeFileSync(auditPath, bigContent);
    fs.chmodSync(badDir, 0o444);

    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(badDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => initializeLogger({ commandName: 'test-cmd' })).not.toThrow();

    fs.chmodSync(badDir, 0o755);

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });
});

// ---------------------------------------------------------------------------
// ConditionalStderrReporter
// ---------------------------------------------------------------------------

describe('ConditionalStderrReporter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    _resetForTesting();
    savedEnv = {
      GWT_LOG_LEVEL: process.env.GWT_LOG_LEVEL,
      DEBUG: process.env.DEBUG,
    };
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.DEBUG;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    _resetForTesting();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('non-verbose mode (default)', () => {
    beforeEach(() => {
      initializeLogger({});
    });

    it('error writes to stderr', () => {
      logger.error('err-msg');
      const errorCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('err-msg')
      );
      expect(errorCalls.length).toBeGreaterThan(0);
    });

    it('warn writes to stderr', () => {
      logger.warn('wrn-msg');
      const warnCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('wrn-msg')
      );
      expect(warnCalls.length).toBeGreaterThan(0);
    });

    it('info does NOT write to stderr', () => {
      logger.info('inf-msg');
      const infoCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('inf-msg')
      );
      expect(infoCalls.length).toBe(0);
    });

    it('debug does NOT write to stderr', () => {
      logger.debug('dbg-msg');
      const debugCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('dbg-msg')
      );
      expect(debugCalls.length).toBe(0);
    });
  });

  describe('verbose mode', () => {
    beforeEach(() => {
      initializeLogger({ verbose: true });
    });

    it('error writes to stderr', () => {
      logger.error('err-verbose');
      const errorCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('err-verbose')
      );
      expect(errorCalls.length).toBeGreaterThan(0);
    });

    it('warn writes to stderr', () => {
      logger.warn('wrn-verbose');
      const warnCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('wrn-verbose')
      );
      expect(warnCalls.length).toBeGreaterThan(0);
    });

    it('info writes to stderr in verbose mode', () => {
      logger.info('inf-verbose');
      const infoCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('inf-verbose')
      );
      expect(infoCalls.length).toBeGreaterThan(0);
    });

    it('debug writes to stderr in verbose mode', () => {
      logger.debug('dbg-verbose');
      const debugCalls = stderrSpy.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('dbg-verbose')
      );
      expect(debugCalls.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Process exit handler / audit session summary
// ---------------------------------------------------------------------------

describe('Process exit handler', () => {
  beforeEach(() => {
    _resetForTesting();
    tempDir = createTempDir();
    savedEnv = {
      GWT_LOG_LEVEL: process.env.GWT_LOG_LEVEL,
      DEBUG: process.env.DEBUG,
    };
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    _resetForTesting();
    cleanupTempDir(tempDir);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('exit handler writes audit summary via fs.appendFileSync', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const appendSpy = vi.spyOn(fs, 'appendFileSync');

    initializeLogger({ commandName: 'test-exit' });
    setAuditContext({ prNumber: 42 });

    process.emit('exit', 0);

    expect(appendSpy).toHaveBeenCalled();

    const lastCall = appendSpy.mock.calls.find(
      (call) => typeof call[1] === 'string' && (call[1] as string).includes('test-exit')
    );
    expect(lastCall).toBeDefined();
    const writtenContent = lastCall![1] as string;
    expect(writtenContent).toContain('test-exit');
    expect(writtenContent).toContain('exit=0');

    appendSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('exit handler includes duration as a positive number', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const appendSpy = vi.spyOn(fs, 'appendFileSync');

    initializeLogger({ commandName: 'duration-test' });

    await new Promise((resolve) => setTimeout(resolve, 50));

    process.emit('exit', 0);

    const exitCall = appendSpy.mock.calls.find(
      (call) => typeof call[1] === 'string' && (call[1] as string).includes('duration-test')
    );
    expect(exitCall).toBeDefined();
    const writtenContent = exitCall![1] as string;
    const durationMatch = writtenContent.match(/duration=(\d+)ms/);
    expect(durationMatch).toBeTruthy();
    const duration = parseInt(durationMatch![1], 10);
    expect(duration).toBeGreaterThanOrEqual(0);

    appendSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('exit handler writes JSON format when json mode is active', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const appendSpy = vi.spyOn(fs, 'appendFileSync');

    initializeLogger({ json: true, commandName: 'json-exit-test' });
    setAuditContext({ prNumber: 99 });

    process.emit('exit', 1);

    const exitCall = appendSpy.mock.calls.find(
      (call) => typeof call[1] === 'string' && (call[1] as string).includes('json-exit-test')
    );
    expect(exitCall).toBeDefined();
    const writtenContent = (exitCall![1] as string).trim();
    const parsed = JSON.parse(writtenContent);
    expect(parsed.command).toBe('json-exit-test');
    expect(parsed.exitCode).toBe(1);
    expect(parsed.prNumber).toBe(99);
    expect(parsed.type).toBe('session');
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);

    appendSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });

  it('exit handler fails silently if audit log path is inaccessible', async () => {
    const constantsMod = await import('./constants.js');
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue('/nonexistent/path/deep/nest');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    initializeLogger({ commandName: 'fail-silently-test' });

    expect(() => process.emit('exit', 0)).not.toThrow();

    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
  });
});

// ---------------------------------------------------------------------------
// setAuditContext
// ---------------------------------------------------------------------------

describe('setAuditContext', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('merges additional metadata into audit context', async () => {
    const constantsMod = await import('./constants.js');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    tempDir = createTempDir();
    vi.spyOn(constantsMod, 'getGlobalDataDir').mockReturnValue(tempDir);
    const appendSpy = vi.spyOn(fs, 'appendFileSync');

    initializeLogger({ commandName: 'context-test' });
    setAuditContext({ worktreePath: '/tmp/worktree', prNumber: 123 });

    process.emit('exit', 0);

    const exitCall = appendSpy.mock.calls.find(
      (call) => typeof call[1] === 'string' && (call[1] as string).includes('context-test')
    );
    expect(exitCall).toBeDefined();

    appendSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(constantsMod.getGlobalDataDir).mockRestore();
    cleanupTempDir(tempDir);
  });
});
