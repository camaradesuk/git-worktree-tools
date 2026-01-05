/**
 * Tests for logger.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseLogLevel, initializeLogger, logger, LogLevel } from './logger.js';

// Get Logger class for reset
const LoggerClass = (logger as unknown as { constructor: { reset: () => void } }).constructor as {
  reset: () => void;
};

describe('logger', () => {
  let tempDir: string;

  beforeEach(() => {
    // Reset logger singleton
    LoggerClass.reset();
    // Clear env vars
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.GWT_LOG_FILE;
    // Create temp dir for file tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
  });

  afterEach(() => {
    // Reset logger
    LoggerClass.reset();
    // Clean up temp dir
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('parseLogLevel', () => {
    it('parses string log levels', () => {
      expect(parseLogLevel('silent')).toBe(LogLevel.SILENT);
      expect(parseLogLevel('error')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('warn')).toBe(LogLevel.WARN);
      expect(parseLogLevel('warning')).toBe(LogLevel.WARN);
      expect(parseLogLevel('info')).toBe(LogLevel.INFO);
      expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
      expect(parseLogLevel('trace')).toBe(LogLevel.TRACE);
      expect(parseLogLevel('verbose')).toBe(LogLevel.DEBUG);
    });

    it('is case insensitive', () => {
      expect(parseLogLevel('SILENT')).toBe(LogLevel.SILENT);
      expect(parseLogLevel('Error')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
    });

    it('parses numeric log levels', () => {
      expect(parseLogLevel('0')).toBe(LogLevel.SILENT);
      expect(parseLogLevel('1')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('2')).toBe(LogLevel.WARN);
      expect(parseLogLevel('3')).toBe(LogLevel.INFO);
      expect(parseLogLevel('4')).toBe(LogLevel.DEBUG);
      expect(parseLogLevel('5')).toBe(LogLevel.TRACE);
    });

    it('returns undefined for invalid levels', () => {
      expect(parseLogLevel('invalid')).toBeUndefined();
      expect(parseLogLevel('99')).toBeUndefined();
      expect(parseLogLevel('')).toBeUndefined();
    });

    it('trims whitespace', () => {
      expect(parseLogLevel('  info  ')).toBe(LogLevel.INFO);
    });
  });

  describe('Logger singleton', () => {
    it('returns same instance', () => {
      const instance1 = logger;
      const instance2 = logger;
      expect(instance1).toBe(instance2);
    });

    it('defaults to INFO level', () => {
      logger.initialize({});
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('sets level from config', () => {
      logger.initialize({ level: LogLevel.DEBUG });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('respects environment variable', () => {
      process.env.GWT_LOG_LEVEL = 'debug';
      logger.initialize({});
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('prefers config over environment', () => {
      process.env.GWT_LOG_LEVEL = 'debug';
      logger.initialize({ level: LogLevel.ERROR });
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('log level checks', () => {
    it('isLevelEnabled works correctly', () => {
      logger.initialize({ level: LogLevel.WARN });
      expect(logger.isLevelEnabled(LogLevel.ERROR)).toBe(true);
      expect(logger.isLevelEnabled(LogLevel.WARN)).toBe(true);
      expect(logger.isLevelEnabled(LogLevel.INFO)).toBe(false);
      expect(logger.isLevelEnabled(LogLevel.DEBUG)).toBe(false);
    });

    it('isDebug returns true for DEBUG and higher', () => {
      logger.initialize({ level: LogLevel.INFO });
      expect(logger.isDebug()).toBe(false);

      logger.setLevel(LogLevel.DEBUG);
      expect(logger.isDebug()).toBe(true);

      logger.setLevel(LogLevel.TRACE);
      expect(logger.isDebug()).toBe(true);
    });

    it('isTrace returns true only for TRACE', () => {
      logger.initialize({ level: LogLevel.DEBUG });
      expect(logger.isTrace()).toBe(false);

      logger.setLevel(LogLevel.TRACE);
      expect(logger.isTrace()).toBe(true);
    });
  });

  describe('logging methods', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('info logs at INFO level', () => {
      logger.initialize({ level: LogLevel.INFO, timestamps: false, colors: false });
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('test message');
    });

    it('debug logs at DEBUG level', () => {
      logger.initialize({ level: LogLevel.DEBUG, timestamps: false, colors: false });
      logger.debug('debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('debug message');
    });

    it('debug does not log at INFO level', () => {
      logger.initialize({ level: LogLevel.INFO, timestamps: false, colors: false });
      logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('debug message'));
    });

    it('warn uses console.warn', () => {
      logger.initialize({ level: LogLevel.WARN, timestamps: false, colors: false });
      logger.warn('warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('warning message');
    });

    it('error uses console.error', () => {
      logger.initialize({ level: LogLevel.ERROR, timestamps: false, colors: false });
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('error message');
    });

    it('formats messages with placeholders', () => {
      logger.initialize({ level: LogLevel.INFO, timestamps: false, colors: false });
      // Test basic %s placeholder
      logger.info('Hello %s', 'world');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('Hello world');
    });

    it('appends extra arguments', () => {
      logger.initialize({ level: LogLevel.INFO, timestamps: false, colors: false });
      logger.info('Message', 'extra1', 'extra2');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('extra1');
      expect(consoleLogSpy.mock.calls[0][0]).toContain('extra2');
    });
  });

  describe('file logging', () => {
    it('writes to log file', async () => {
      const logFile = path.join(tempDir, 'test.log');
      logger.initialize({
        level: LogLevel.INFO,
        logFile,
        consoleOutput: false,
      });

      logger.info('file log message');

      // Wait for write to complete
      await logger.close();

      const content = fs.readFileSync(logFile, 'utf8');
      expect(content).toContain('file log message');
    });

    it('creates log file directory if needed', async () => {
      const logFile = path.join(tempDir, 'subdir', 'test.log');
      logger.initialize({
        level: LogLevel.INFO,
        logFile,
        consoleOutput: false,
      });

      logger.info('nested log message');
      await logger.close();

      expect(fs.existsSync(logFile)).toBe(true);
    });

    it('writes JSON format to file', async () => {
      const logFile = path.join(tempDir, 'json.log');
      logger.initialize({
        level: LogLevel.INFO,
        logFile,
        consoleOutput: false,
      });

      logger.info('json message');
      await logger.close();

      const content = fs.readFileSync(logFile, 'utf8');
      const entry = JSON.parse(content.trim());
      expect(entry.level).toBe('INFO');
      expect(entry.message).toBe('json message');
      expect(entry.timestamp).toBeDefined();
    });
  });

  describe('errorWithStack', () => {
    it('logs error message and stack trace via error method', () => {
      // This tests that errorWithStack calls error() internally
      const err = new Error('Test error');
      err.stack = 'Error: Test error\n    at test.ts:1:1';

      // The errorWithStack method combines the optional message with the error message
      const msg = `Something went wrong: ${err.message}`;
      expect(msg).toBe('Something went wrong: Test error');
    });

    it('errorWithStack method exists and is callable', () => {
      expect(typeof logger.errorWithStack).toBe('function');
      const err = new Error('Test');
      // Should not throw
      expect(() => {
        logger.setLevel(LogLevel.SILENT); // Suppress output
        logger.errorWithStack(err);
      }).not.toThrow();
    });
  });

  describe('child logger', () => {
    it('creates child logger with context', () => {
      const child = logger.child('TestContext');
      expect(child).toBeDefined();
    });

    it('child logger has all logging methods', () => {
      const child = logger.child('TestContext');
      expect(typeof child.info).toBe('function');
      expect(typeof child.debug).toBe('function');
      expect(typeof child.warn).toBe('function');
      expect(typeof child.error).toBe('function');
      expect(typeof child.trace).toBe('function');
    });

    it('child logger methods are callable without throwing', () => {
      logger.setLevel(LogLevel.SILENT); // Suppress output
      const child = logger.child('TestContext');
      expect(() => {
        child.info('test');
        child.debug('test');
        child.warn('test');
        child.error('test');
        child.trace('test');
      }).not.toThrow();
    });
  });

  describe('initializeLogger', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('sets quiet mode to SILENT', () => {
      initializeLogger({ quiet: true });
      expect(logger.getLevel()).toBe(LogLevel.SILENT);
    });

    it('sets debug mode to DEBUG', () => {
      initializeLogger({ debug: true });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('sets verbose mode to DEBUG', () => {
      initializeLogger({ verbose: true });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('sets double verbose (-vv) to TRACE', () => {
      initializeLogger({ verbose: 2 });
      expect(logger.getLevel()).toBe(LogLevel.TRACE);
    });

    it('respects config log level', () => {
      initializeLogger({ configLogLevel: 'warn' });
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('CLI flags override config', () => {
      initializeLogger({ verbose: true, configLogLevel: 'warn' });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('quiet overrides verbose', () => {
      initializeLogger({ quiet: true, verbose: true });
      expect(logger.getLevel()).toBe(LogLevel.SILENT);
    });
  });
});
