/**
 * Unit tests for wt.ts main entry point
 *
 * Tests the initializeCliEnvironment function and CLI setup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadConfig: vi.fn(() => ({
    logging: { level: 'info' },
  })),
}));

vi.mock('../lib/logger.js', () => ({
  initializeLogger: vi.fn(),
  parseLogLevel: vi.fn(),
  LogLevel: {
    SILENT: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
    TRACE: 5,
  },
}));

vi.mock('../lib/global-check.js', () => ({
  checkAndWarnGlobalInstall: vi.fn(),
}));

vi.mock('./wt/interactive-menu.js', () => ({
  showMainMenu: vi.fn(),
}));

// Mock yargs to prevent actual CLI parsing
vi.mock('yargs', () => {
  const mockYargs = {
    scriptName: vi.fn().mockReturnThis(),
    usage: vi.fn().mockReturnThis(),
    middleware: vi.fn().mockImplementation(function (this: unknown, fn: () => void) {
      // Execute middleware immediately to simulate yargs behavior
      fn();
      return this;
    }),
    option: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    completion: vi.fn().mockReturnThis(),
    alias: vi.fn().mockReturnThis(),
    help: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    wrap: vi.fn().mockReturnThis(),
    example: vi.fn().mockReturnThis(),
    strict: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    parseAsync: vi.fn().mockResolvedValue({}),
  };
  return {
    default: vi.fn(() => mockYargs),
  };
});

vi.mock('yargs/helpers', () => ({
  hideBin: vi.fn((args) => args.slice(2)),
}));

import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as logger from '../lib/logger.js';
import * as globalCheck from '../lib/global-check.js';

describe('wt CLI entry point', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.argv
    process.argv = ['node', 'wt'];
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.resetModules();
  });

  describe('initializeCliEnvironment', () => {
    it('loads config from repo root when in a git repo', async () => {
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        logging: { level: 'debug' },
      });

      // Import the module to trigger initialization
      await import('./wt.js');

      expect(git.getRepoRoot).toHaveBeenCalled();
      expect(config.loadConfig).toHaveBeenCalledWith('/repo');
    });

    it('loads global config when not in a git repo', async () => {
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Not a git repo');
      });
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        logging: { level: 'info' },
      });

      await import('./wt.js');

      expect(config.loadConfig).toHaveBeenCalledWith();
    });

    it('initializes logger with config log level', async () => {
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        logging: { level: 'warn', logFile: '/tmp/test.log' },
      });

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          configLogLevel: 'warn',
          configLogFile: '/tmp/test.log',
        })
      );
    });

    it('checks global installation', async () => {
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      const mockConfig = { logging: { level: 'info' } };
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig);

      await import('./wt.js');

      expect(globalCheck.checkAndWarnGlobalInstall).toHaveBeenCalledWith(mockConfig);
    });

    it('parses verbose flag from argv', async () => {
      process.argv = ['node', 'wt', '-v'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: true,
        })
      );
    });

    it('parses double verbose flag (-vv) from argv', async () => {
      process.argv = ['node', 'wt', '-v', '-v'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: 2,
        })
      );
    });

    it('parses --debug flag from argv', async () => {
      process.argv = ['node', 'wt', '--debug'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          debug: true,
        })
      );
    });

    it('parses --quiet flag from argv', async () => {
      process.argv = ['node', 'wt', '--quiet'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          quiet: true,
        })
      );
    });

    it('parses -q flag from argv', async () => {
      process.argv = ['node', 'wt', '-q'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          quiet: true,
        })
      );
    });

    it('parses --log-file flag from argv', async () => {
      process.argv = ['node', 'wt', '--log-file', '/custom/log.txt'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          logFile: '/custom/log.txt',
        })
      );
    });

    it('parses --verbose flag from argv', async () => {
      process.argv = ['node', 'wt', '--verbose'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: true,
        })
      );
    });
  });
});
