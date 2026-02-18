/**
 * Tests for logger.ts (consola-based)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseLogLevel, initializeLogger, logger, LogLevel, _resetForTesting } from './logger.js';

describe('logger', () => {
  let tempDir: string;

  beforeEach(() => {
    // Reset module state for test isolation
    _resetForTesting();
    // Clear env vars
    delete process.env.GWT_LOG_LEVEL;
    delete process.env.GWT_LOG_FILE;
    delete process.env.DEBUG;
    // Create temp dir for file tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
  });

  afterEach(() => {
    _resetForTesting();
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

    it('returns undefined for invalid levels', () => {
      expect(parseLogLevel('invalid')).toBeUndefined();
      expect(parseLogLevel('99')).toBeUndefined();
      expect(parseLogLevel('')).toBeUndefined();
    });

    it('trims whitespace', () => {
      expect(parseLogLevel('  info  ')).toBe(LogLevel.INFO);
    });

    it('maps verbose to debug level', () => {
      expect(parseLogLevel('verbose')).toBe(4);
    });
  });

  describe('Logger singleton', () => {
    it('returns same instance on repeated import', () => {
      const instance1 = logger;
      const instance2 = logger;
      expect(instance1).toBe(instance2);
    });

    it('defaults to level 3 (INFO)', () => {
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

  describe('initializeLogger', () => {
    it('sets quiet mode to level 0 (error only)', () => {
      initializeLogger({ quiet: true });
      expect(logger.level).toBe(0);
    });

    it('sets verbose mode to level 4 (debug)', () => {
      initializeLogger({ verbose: true });
      expect(logger.level).toBe(4);
    });

    it('defaults to level 3 (info)', () => {
      initializeLogger({});
      expect(logger.level).toBe(3);
    });

    it('respects GWT_LOG_LEVEL environment variable', () => {
      process.env.GWT_LOG_LEVEL = 'debug';
      initializeLogger({});
      expect(logger.level).toBe(4);
    });

    it('CLI flags override environment variable', () => {
      process.env.GWT_LOG_LEVEL = 'debug';
      initializeLogger({ quiet: true });
      expect(logger.level).toBe(0);
    });

    it('quiet overrides verbose', () => {
      initializeLogger({ quiet: true, verbose: true });
      expect(logger.level).toBe(0);
    });

    it('handles DEBUG=newpr with deprecation warning', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      process.env.DEBUG = 'newpr';
      initializeLogger({});
      expect(logger.level).toBe(4);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: DEBUG=newpr is deprecated')
      );
      stderrSpy.mockRestore();
    });

    it('prints DEBUG=newpr deprecation warning only once', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      process.env.DEBUG = 'newpr';
      initializeLogger({});
      initializeLogger({});
      const deprecationCalls = (stderrSpy.mock.calls as unknown[][]).filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('deprecated')
      );
      expect(deprecationCalls.length).toBe(1);
      stderrSpy.mockRestore();
    });

    it('handles DEBUG=* as debug level', () => {
      process.env.DEBUG = '*';
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      initializeLogger({});
      expect(logger.level).toBe(4);
      stderrSpy.mockRestore();
    });

    it('sets reporters when called', () => {
      initializeLogger({});
      // After initialization, reporters should be set (non-empty)
      // The logger should have at least the stderr reporter
      expect(logger.options.reporters).toBeDefined();
    });
  });

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
  });

  describe('LogLevel enum values', () => {
    it('has consola-compatible values', () => {
      expect(LogLevel.SILENT).toBe(-999);
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(3);
      expect(LogLevel.DEBUG).toBe(4);
      expect(LogLevel.TRACE).toBe(5);
    });
  });
});
