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

    it('passes --verbose flag', async () => {
      await runCli(['manage', '--verbose']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: true,
        })
      );
    });

    it('passes -v shorthand for verbose', async () => {
      await runCli(['manage', '-v']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: true,
        })
      );
    });

    it('combines multiple flags correctly', async () => {
      await runCli([
        'manage',
        '--non-interactive',
        '--clean',
        '--dry-run',
        '--backup',
        '--verbose',
      ]);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          nonInteractive: true,
          clean: true,
          dryRun: true,
          backup: true,
          verbose: true,
        })
      );
    });

    it('passes --json flag', async () => {
      await runCli(['manage', '--json']);

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          json: true,
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

    it('shows suggestion for single worktree error from link command', async () => {
      vi.mocked(link.run).mockRejectedValue(new Error('Unable to detect an alternate worktree'));

      await runCli(['link', '/source', '/dest']);

      // Error is caught by yargs fail handler
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Unable to detect an alternate worktree')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('shows suggestion for manifest not found error from validate command', async () => {
      vi.mocked(validate.run).mockRejectedValue(new Error('Manifest file not found'));

      await runCli(['validate']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Manifest file not found')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('shows suggestion for not git repository error', async () => {
      vi.mocked(manage.run).mockRejectedValue(new Error('not a git repository'));

      await runCli(['manage']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('not a git repository')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('shows suggestion for inspect worktrees error', async () => {
      vi.mocked(link.run).mockRejectedValue(new Error('Failed to inspect git worktrees'));

      await runCli(['link', '/source', '/dest']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to inspect git worktrees')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('main menu', () => {
    it('shows main menu when no command is provided', async () => {
      const { showMainMenu } = await import('../lib/wtlink/main-menu.js');

      await runCli([]);

      expect(showMainMenu).toHaveBeenCalled();
    });
  });

  describe('link command variations', () => {
    it('passes -d shorthand for dry-run', async () => {
      await runCli(['link', '/source', '/dest', '-d']);

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
        })
      );
    });

    it('passes -y shorthand for yes', async () => {
      await runCli(['link', '/source', '/dest', '-y']);

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          yes: true,
        })
      );
    });

    it('passes --json flag to link command', async () => {
      await runCli(['link', '/source', '/dest', '--json']);

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          json: true,
        })
      );
    });
  });

  describe('validate command variations', () => {
    it('passes custom manifest file to validate', async () => {
      await runCli(['validate', '--manifest-file', 'custom.wtlinkrc']);

      expect(validate.run).toHaveBeenCalledWith(
        expect.objectContaining({
          manifestFile: 'custom.wtlinkrc',
        })
      );
    });

    it('passes --json flag to validate command', async () => {
      await runCli(['validate', '--json']);

      expect(validate.run).toHaveBeenCalledWith(
        expect.objectContaining({
          json: true,
        })
      );
    });
  });
});
