import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the wtlink submodules
vi.mock('../lib/wtlink/manage-manifest.js', () => ({
  run: vi.fn(),
}));

vi.mock('../lib/wtlink/link-configs.js', () => ({
  run: vi.fn(),
}));

vi.mock('../lib/wtlink/validate-manifest.js', () => ({
  run: vi.fn(),
}));

vi.mock('../lib/wtlink/main-menu.js', () => ({
  showMainMenu: vi.fn(),
}));

// Import after mocking
import * as manage from '../lib/wtlink/manage-manifest.js';
import * as link from '../lib/wtlink/link-configs.js';
import * as validate from '../lib/wtlink/validate-manifest.js';

describe('cli/wtlink', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetAllMocks();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // @ts-expect-error - process.exit mock type is complex
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    originalArgv = process.argv;
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
    process.argv = originalArgv;
    vi.resetModules();
  });

  async function runCli(args: string[] = []): Promise<void> {
    process.argv = ['node', 'wtlink', ...args];
    // Re-import to trigger yargs parsing
    await import('./wtlink.js');
    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  describe('manage command', () => {
    it('calls manage.run with correct options', async () => {
      await runCli(['manage']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          manifestFile: '.wtlinkrc',
          nonInteractive: false,
          clean: false,
          dryRun: false,
          backup: false,
        })
      );
    });

    it('passes --non-interactive flag', async () => {
      await runCli(['manage', '--non-interactive']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          nonInteractive: true,
        })
      );
    });

    it('passes --clean flag', async () => {
      await runCli(['manage', '--clean']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          clean: true,
        })
      );
    });

    it('passes --dry-run flag', async () => {
      await runCli(['manage', '--dry-run']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
        })
      );
    });

    it('passes --backup flag', async () => {
      await runCli(['manage', '--backup']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          backup: true,
        })
      );
    });

    it('passes custom manifest file', async () => {
      await runCli(['manage', '--manifest-file', 'custom.wtlinkrc']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          manifestFile: 'custom.wtlinkrc',
        })
      );
    });
  });

  describe('link command', () => {
    it('calls link.run with source and destination', async () => {
      await runCli(['link', '/source', '/dest']);

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/source',
          destination: '/dest',
          dryRun: false,
          type: 'hard',
          yes: false,
        })
      );
    });

    it('passes --dry-run flag', async () => {
      await runCli(['link', '/source', '/dest', '--dry-run']);

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
        })
      );
    });

    it('passes --type symbolic', async () => {
      await runCli(['link', '/source', '/dest', '--type', 'symbolic']);

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'symbolic',
        })
      );
    });

    it('passes --yes flag', async () => {
      await runCli(['link', '/source', '/dest', '--yes']);

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          yes: true,
        })
      );
    });
  });

  describe('validate command', () => {
    it('calls validate.run without source', async () => {
      await runCli(['validate']);

      expect(validate.run).toHaveBeenCalledWith(
        expect.objectContaining({
          manifestFile: '.wtlinkrc',
        })
      );
    });

    it('calls validate.run with source', async () => {
      await runCli(['validate', '/source']);

      expect(validate.run).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/source',
        })
      );
    });
  });

  describe('help option', () => {
    it('displays help on --help', async () => {
      await runCli(['--help']);

      // yargs outputs help to console - just verify it ran without throwing
      // The mock console.log should have been called with help text
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('shows error and exits 1 for unknown command', async () => {
      await runCli(['unknown-command']);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});
