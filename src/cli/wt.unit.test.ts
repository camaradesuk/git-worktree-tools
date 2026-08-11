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
  LogLevel: {
    SILENT: -999,
    ERROR: 0,
    WARN: 1,
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

vi.mock('../lib/ui/index.js', () => ({
  printError: vi.fn(),
}));

vi.mock('../lib/json-output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/json-output.js')>();
  return {
    ...actual,
    createErrorResult: vi.fn((command: string, code: string, message: string) => ({
      success: false,
      command,
      error: { code, message },
    })),
    formatJsonResult: vi.fn((result: unknown) => JSON.stringify(result)),
  };
});

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

import yargs from 'yargs';
import * as git from '../lib/git.js';
import * as config from '../lib/config.js';
import * as logger from '../lib/logger.js';
import * as globalCheck from '../lib/global-check.js';
import { aiCommand } from './wt/ai.js';
import { printError } from '../lib/ui/index.js';
import { createErrorResult } from '../lib/json-output.js';

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

    it('parses --no-color flag from argv', async () => {
      process.argv = ['node', 'wt', '--no-color'];
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          noColor: true,
        })
      );
    });

    it('passes commandName to initializeLogger', async () => {
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      expect(logger.initializeLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'wt',
        })
      );
    });

    describe('invalid GWT_AI_* env var (ConfigurationError from loadConfig)', () => {
      // This middleware runs before EVERY command (it loads config for
      // logging settings), so a ConfigurationError from an invalid
      // GWT_AI_* env var must be reported cleanly and exit(1) — not
      // propagate as an uncaught exception that would crash unrelated
      // commands like `wt list`.
      let processExitSpy: ReturnType<typeof vi.spyOn>;
      let consoleLogSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      });

      afterEach(() => {
        processExitSpy.mockRestore();
        consoleLogSpy.mockRestore();
      });

      it('prints a clean error and exits 1, without --json', async () => {
        // Import errors.js fresh (matching whatever instance wt.js's own
        // dynamic import below will resolve to post-resetModules) so
        // `error instanceof ConfigurationError` inside wt.ts's catch block
        // sees the SAME class reference as this thrown error, not a stale
        // one bound at this test file's original static-import time.
        const { ConfigurationError: FreshConfigurationError } = await import('../lib/errors.js');
        (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (config.loadConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new FreshConfigurationError(
            'Invalid GWT_AI_PROVIDER: "bogus" — must be one of: ...',
            { field: 'GWT_AI_PROVIDER' }
          );
        });

        await import('./wt.js');

        expect(printError).toHaveBeenCalledWith(
          expect.objectContaining({ title: expect.stringContaining('GWT_AI_PROVIDER') })
        );
        expect(processExitSpy).toHaveBeenCalledWith(1);
        // checkAndWarnGlobalInstall must not run with a broken config.
        expect(globalCheck.checkAndWarnGlobalInstall).not.toHaveBeenCalledWith(
          expect.objectContaining({ logging: expect.anything() })
        );
      });

      it('prints an INVALID_CONFIG JSON error and exits 1, with --json', async () => {
        const { ConfigurationError: FreshConfigurationError } = await import('../lib/errors.js');
        process.argv = ['node', 'wt', 'list', '--json'];
        (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (config.loadConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new FreshConfigurationError(
            'Invalid GWT_AI_PROVIDER: "bogus" — must be one of: ...',
            { field: 'GWT_AI_PROVIDER' }
          );
        });

        await import('./wt.js');

        expect(createErrorResult).toHaveBeenCalledWith(
          'wt',
          'INVALID_CONFIG',
          expect.stringContaining('GWT_AI_PROVIDER')
        );
        expect(consoleLogSpy).toHaveBeenCalled();
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });

      it('re-throws non-ConfigurationError errors from loadConfig (unchanged behavior)', async () => {
        (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (config.loadConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('Some other failure');
        });

        await expect(import('./wt.js')).rejects.toThrow('Some other failure');
        expect(processExitSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('command registration', () => {
    it('registers the ai command (wt ai doctor)', async () => {
      (git.getRepoRoot as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
      (config.loadConfig as ReturnType<typeof vi.fn>).mockReturnValue({});

      await import('./wt.js');

      // wt.js is re-imported fresh per test (vi.resetModules() in afterEach),
      // so it pulls in its own fresh copy of aiCommand whose handler/builder
      // function references differ from the one statically imported above —
      // compare the stable command/describe strings rather than object
      // identity, which a deep-equal toHaveBeenCalledWith(aiCommand) would
      // spuriously fail on function identity alone.
      const mockYargsInstance = vi.mocked(yargs).mock.results[0]?.value;
      expect(mockYargsInstance.command).toHaveBeenCalledWith(
        expect.objectContaining({ command: aiCommand.command, describe: aiCommand.describe })
      );
    });
  });
});
