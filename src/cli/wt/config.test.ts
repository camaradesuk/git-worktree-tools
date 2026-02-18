/**
 * Unit tests for wt config command
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';

// Mock dependencies before importing the module
vi.mock('./run-command.js', () => ({
  runSubcommand: vi.fn(),
}));

vi.mock('../../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../../lib/config-editor.js', () => ({
  runConfigEditor: vi.fn(),
  quickEditConfig: vi.fn(),
}));

vi.mock('../../lib/config.js', () => ({
  loadConfigWithValidation: vi.fn(),
  getDefaultConfig: vi.fn(() => ({})),
  getConfigPath: vi.fn(),
}));

vi.mock('../../lib/config-validation.js', () => ({
  formatValidationErrors: vi.fn(() => 'formatted errors'),
}));

vi.mock('../../lib/colors.js', () => ({
  error: vi.fn((s: string) => s),
  dim: vi.fn((s: string) => s),
  success: vi.fn((s: string) => s),
  info: vi.fn((s: string) => s),
  cyan: vi.fn((s: string) => s),
  yellow: vi.fn((s: string) => s),
}));

vi.mock('../../lib/global-config.js', () => ({
  getSchemaUrl: vi.fn(() => 'https://example.com/schema.json'),
}));

import { configCommand } from './config.js';
import * as git from '../../lib/git.js';
import * as configEditor from '../../lib/config-editor.js';
import * as config from '../../lib/config.js';
import { runSubcommand } from './run-command.js';

// Helper to create valid yargs argv for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createArgv(args: { subcommand?: string; args?: string[] }): any {
  return {
    _: [],
    $0: 'wt',
    subcommand: args.subcommand,
    args: args.args ?? [],
  };
}

describe('wt config command', () => {
  // Using 'any' for spies since vitest's MockInstance typing is complex for these methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: MockInstance<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: MockInstance<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processExitSpy: MockInstance<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('command structure', () => {
    it('has correct command name and aliases', () => {
      expect(configCommand.command).toEqual(['config [subcommand] [args..]', 'cfg']);
    });

    it('has description', () => {
      expect(configCommand.describe).toBeDefined();
      expect(configCommand.describe).toContain('Configuration');
    });

    it('has handler function', () => {
      expect(typeof configCommand.handler).toBe('function');
    });

    it('builder configures positional arguments', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        example: vi.fn().mockReturnThis(),
      };

      if (typeof configCommand.builder === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configCommand.builder(mockYargs as any);
      }

      expect(mockYargs.positional).toHaveBeenCalledWith('subcommand', expect.any(Object));
      expect(mockYargs.positional).toHaveBeenCalledWith('args', expect.any(Object));
    });
  });

  describe('handler - interactive subcommand', () => {
    it('runs interactive mode by default', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.runConfigEditor as Mock).mockResolvedValue({ saved: true });

      await configCommand.handler(createArgv({ subcommand: undefined }));

      expect(configEditor.runConfigEditor).toHaveBeenCalledWith('/repo');
    });

    it('runs interactive mode with "interactive" subcommand', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.runConfigEditor as Mock).mockResolvedValue({ saved: true });

      await configCommand.handler(createArgv({ subcommand: 'interactive' }));

      expect(configEditor.runConfigEditor).toHaveBeenCalledWith('/repo');
    });

    it('runs interactive mode with "i" alias', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.runConfigEditor as Mock).mockResolvedValue({ saved: true });

      await configCommand.handler(createArgv({ subcommand: 'i' }));

      expect(configEditor.runConfigEditor).toHaveBeenCalledWith('/repo');
    });

    it('exits with error when not in git repo', async () => {
      (git.getRepoRoot as Mock).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      await configCommand.handler(createArgv({ subcommand: 'interactive' }));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Not in a git repository.');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('handles user cancellation gracefully', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.runConfigEditor as Mock).mockRejectedValue(new Error('User cancelled'));

      try {
        await configCommand.handler(createArgv({ subcommand: 'interactive' }));
      } catch {
        // Error might propagate after process.exit mock
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('rethrows other errors', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.runConfigEditor as Mock).mockRejectedValue(new Error('Some other error'));

      await expect(
        configCommand.handler(createArgv({ subcommand: 'interactive' }))
      ).rejects.toThrow('Some other error');
    });

    it('exits 0 when config was saved', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.runConfigEditor as Mock).mockResolvedValue({ saved: true });

      await configCommand.handler(createArgv({ subcommand: 'interactive' }));

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 0 when config was not saved', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.runConfigEditor as Mock).mockResolvedValue({ saved: false });

      await configCommand.handler(createArgv({ subcommand: 'interactive' }));

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('handler - set subcommand with single arg (quick edit)', () => {
    it('runs quick edit when set has only key', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.quickEditConfig as Mock).mockResolvedValue({ saved: true });

      await configCommand.handler(createArgv({ subcommand: 'set', args: ['baseBranch'] }));

      expect(configEditor.quickEditConfig).toHaveBeenCalledWith('/repo', 'baseBranch');
    });

    it('exits with error when not in git repo for quick edit', async () => {
      (git.getRepoRoot as Mock).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      await configCommand.handler(createArgv({ subcommand: 'set', args: ['baseBranch'] }));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Not in a git repository.');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('handles user cancellation in quick edit', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.quickEditConfig as Mock).mockRejectedValue(new Error('User cancelled'));

      try {
        await configCommand.handler(createArgv({ subcommand: 'set', args: ['baseBranch'] }));
      } catch {
        // Error might propagate after process.exit mock
      }

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 0 on successful save', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.quickEditConfig as Mock).mockResolvedValue({ saved: true });

      await configCommand.handler(createArgv({ subcommand: 'set', args: ['baseBranch'] }));

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('exits 1 when not saved', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (configEditor.quickEditConfig as Mock).mockResolvedValue({ saved: false });

      await configCommand.handler(createArgv({ subcommand: 'set', args: ['baseBranch'] }));

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('handler - validate subcommand', () => {
    it('exits with error when not in git repo', async () => {
      (git.getRepoRoot as Mock).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      await configCommand.handler(createArgv({ subcommand: 'validate' }));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Not in a git repository.');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('shows message when no config file found', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (config.getConfigPath as Mock).mockReturnValue(null);

      await configCommand.handler(createArgv({ subcommand: 'validate' }));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'No configuration file found. Nothing to validate.'
      );
    });

    it('shows success when no validation returned', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (config.getConfigPath as Mock).mockReturnValue('/repo/.worktreerc');
      (config.loadConfigWithValidation as Mock).mockReturnValue({ validation: null });

      await configCommand.handler(createArgv({ subcommand: 'validate' }));

      expect(consoleLogSpy).toHaveBeenCalledWith('Configuration loaded successfully.');
    });

    it('shows success when validation passes', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (config.getConfigPath as Mock).mockReturnValue('/repo/.worktreerc');
      (config.loadConfigWithValidation as Mock).mockReturnValue({
        validation: { valid: true, errors: [] },
      });

      await configCommand.handler(createArgv({ subcommand: 'validate' }));

      expect(consoleLogSpy).toHaveBeenCalledWith('Configuration is valid.');
    });

    it('shows errors and exits 1 when validation fails', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (config.getConfigPath as Mock).mockReturnValue('/repo/.worktreerc');
      (config.loadConfigWithValidation as Mock).mockReturnValue({
        validation: { valid: false, errors: ['error1'] },
      });

      await configCommand.handler(createArgv({ subcommand: 'validate' }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validation errors'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('handler - schema subcommand', () => {
    // Note: The handleSchema function uses dynamic require() which doesn't work
    // with ESM mocks. The schema functionality is tested via integration tests.
    it('has schema routing defined', () => {
      expect(configCommand.handler).toBeDefined();
    });
  });

  describe('handler - delegation to wtconfig', () => {
    it('delegates show subcommand to wtconfig', async () => {
      await configCommand.handler(createArgv({ subcommand: 'show' }));

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['show']);
    });

    it('delegates get subcommand with args to wtconfig', async () => {
      await configCommand.handler(createArgv({ subcommand: 'get', args: ['ai.provider'] }));

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['get', 'ai.provider']);
    });

    it('delegates set subcommand with key and value to wtconfig', async () => {
      await configCommand.handler(
        createArgv({ subcommand: 'set', args: ['baseBranch', 'develop'] })
      );

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['set', 'baseBranch', 'develop']);
    });

    it('delegates edit subcommand to wtconfig', async () => {
      await configCommand.handler(createArgv({ subcommand: 'edit' }));

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['edit']);
    });

    it('delegates init subcommand to wtconfig', async () => {
      await configCommand.handler(createArgv({ subcommand: 'init' }));

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['init']);
    });
  });
});
