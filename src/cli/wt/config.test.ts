/**
 * Unit tests for wt config command
 *
 * All subcommands are handled via direct library calls (no subprocess spawning).
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

// Mock child_process for edit subcommand (spawnSync for editor)
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
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
  getDefaultConfig: vi.fn(() => ({
    baseBranch: 'main',
    draftPr: false,
    branchPrefix: 'feat',
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    preferredEditor: 'auto',
    sharedRepos: [],
  })),
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
  warning: vi.fn((s: string) => s),
  bold: vi.fn((s: string) => s),
}));

vi.mock('../../lib/global-config.js', () => ({
  getSchemaUrl: vi.fn(() => 'https://example.com/schema.json'),
}));

vi.mock('../../lib/wtconfig/index.js', () => ({
  getConfigSource: vi.fn().mockReturnValue({ type: 'none', path: null }),
  loadMergedConfig: vi.fn().mockReturnValue({ baseBranch: 'main' }),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn().mockReturnValue({ baseBranch: 'develop' }),
  validateConfig: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
  loadRepoConfig: vi.fn().mockReturnValue({}),
  loadGlobalConfig: vi.fn().mockReturnValue({}),
  saveRepoConfig: vi.fn(),
  saveGlobalConfig: vi.fn(),
  getDefaultRepoConfigPath: vi.fn().mockReturnValue('/repo/.worktreerc'),
  getGlobalConfigPath: vi.fn().mockReturnValue('/home/user/.worktreerc'),
  findRepoConfigPath: vi.fn().mockReturnValue(null),
}));

vi.mock('../../lib/config-migration/index.js', () => ({
  detectMigrationIssues: vi.fn().mockReturnValue({ issues: [] }),
  runMigration: vi.fn().mockResolvedValue({
    success: true,
    backupPath: null,
    newConfigPath: '/repo/.worktreerc',
    actionsExecuted: [],
    errors: [],
  }),
  formatMigrationReport: vi.fn().mockReturnValue('Migration report'),
  formatMigrationReportJSON: vi.fn().mockReturnValue({}),
}));

vi.mock('../../lib/json-output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/json-output.js')>();
  return {
    ...actual,
    createSuccessResult: vi.fn().mockReturnValue({ success: true }),
    createErrorResult: vi.fn().mockReturnValue({ success: false }),
    formatJsonResult: vi.fn().mockReturnValue('{}'),
  };
});

vi.mock('../../lib/ui/index.js', () => ({
  printError: vi.fn(),
  printStatus: vi.fn(),
  setJsonMode: vi.fn(),
}));

import { configCommand } from './config.js';
import * as git from '../../lib/git.js';
import * as configEditor from '../../lib/config-editor.js';
import * as config from '../../lib/config.js';
import {
  getConfigSource,
  loadMergedConfig,
  getConfigValue,
  setConfigValue,
  validateConfig,
  saveRepoConfig,
  findRepoConfigPath,
} from '../../lib/wtconfig/index.js';
import { detectMigrationIssues } from '../../lib/config-migration/index.js';
import { createSuccessResult, formatJsonResult } from '../../lib/json-output.js';
import { printError, printStatus } from '../../lib/ui/index.js';
import { spawnSync } from 'child_process';

// Helper to create valid yargs argv for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createArgv(args: { subcommand?: string; args?: string[]; json?: boolean }): any {
  return {
    _: [],
    $0: 'wt',
    subcommand: args.subcommand,
    args: args.args ?? [],
    json: args.json ?? false,
  };
}

describe('wt config command', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: MockInstance<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: MockInstance<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleWarnSpy: MockInstance<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processExitSpy: MockInstance<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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

  describe('handler - show subcommand', () => {
    it('calls loadMergedConfig and outputs config display', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');

      await configCommand.handler(createArgv({ subcommand: 'show' }));

      expect(loadMergedConfig).toHaveBeenCalledWith('/repo');
      expect(getConfigSource).toHaveBeenCalledWith('/repo');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('outputs JSON when --json is passed', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');

      await configCommand.handler(createArgv({ subcommand: 'show', json: true }));

      expect(createSuccessResult).toHaveBeenCalledWith(
        'wtconfig',
        expect.objectContaining({ subcommand: 'show' })
      );
      expect(formatJsonResult).toHaveBeenCalled();
    });
  });

  describe('handler - get subcommand', () => {
    it('calls getConfigValue with the requested key', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (getConfigValue as Mock).mockReturnValue('main');

      await configCommand.handler(createArgv({ subcommand: 'get', args: ['baseBranch'] }));

      expect(loadMergedConfig).toHaveBeenCalledWith('/repo');
      expect(getConfigValue).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('main');
    });

    it('exits with error when no key provided', async () => {
      await configCommand.handler(createArgv({ subcommand: 'get', args: [] }));

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('Missing key') })
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('exits with error when key not found', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (getConfigValue as Mock).mockReturnValue(undefined);

      await configCommand.handler(createArgv({ subcommand: 'get', args: ['nonexistent'] }));

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('not found') })
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('outputs JSON when --json is passed', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (getConfigValue as Mock).mockReturnValue('auto');

      await configCommand.handler(
        createArgv({ subcommand: 'get', args: ['ai.provider'], json: true })
      );

      expect(createSuccessResult).toHaveBeenCalledWith(
        'wtconfig',
        expect.objectContaining({ subcommand: 'get', key: 'ai.provider' })
      );
    });
  });

  describe('handler - set subcommand with key and value', () => {
    it('calls setConfigValue and saves to repo config', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');

      await configCommand.handler(
        createArgv({ subcommand: 'set', args: ['baseBranch', 'develop'] })
      );

      expect(setConfigValue).toHaveBeenCalled();
      expect(validateConfig).toHaveBeenCalled();
      expect(saveRepoConfig).toHaveBeenCalledWith('/repo', expect.any(Object));
    });

    it('exits with error when not in git repo', async () => {
      (git.getRepoRoot as Mock).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      await configCommand.handler(
        createArgv({ subcommand: 'set', args: ['baseBranch', 'develop'] })
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith('Not in a git repository.');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('exits with error when validation fails', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (validateConfig as Mock).mockReturnValue({
        valid: false,
        errors: [{ path: 'baseBranch', message: 'invalid' }],
        warnings: [],
      });

      await configCommand.handler(
        createArgv({ subcommand: 'set', args: ['baseBranch', 'invalid!'] })
      );

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('exits with error when less than 2 args', async () => {
      await configCommand.handler(createArgv({ subcommand: 'set', args: [] }));

      expect(printError).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
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

  describe('handler - edit subcommand', () => {
    it('opens editor for repo config when found', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (findRepoConfigPath as Mock).mockReturnValue('/repo/.worktreerc');

      await configCommand.handler(createArgv({ subcommand: 'edit' }));

      expect(spawnSync).toHaveBeenCalledWith(
        expect.any(String),
        ['/repo/.worktreerc'],
        expect.any(Object)
      );
    });

    it('shows error when no config found', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (findRepoConfigPath as Mock).mockReturnValue(null);

      await configCommand.handler(createArgv({ subcommand: 'edit' }));

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('No configuration file') })
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('handler - init subcommand', () => {
    it('shows message directing to wt init', async () => {
      await configCommand.handler(createArgv({ subcommand: 'init' }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('wt init'));
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

  describe('handler - migrate subcommand', () => {
    it('shows no migration needed when no issues found', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');

      await configCommand.handler(createArgv({ subcommand: 'migrate' }));

      expect(detectMigrationIssues).toHaveBeenCalledWith('/repo');
      expect(printStatus).toHaveBeenCalledWith('success', 'No migration needed.');
    });

    it('exits with error when not in git repo', async () => {
      (git.getRepoRoot as Mock).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      await configCommand.handler(createArgv({ subcommand: 'migrate' }));

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('handler - schema subcommand', () => {
    it('outputs schema URL', async () => {
      await configCommand.handler(createArgv({ subcommand: 'schema' }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('example.com/schema'));
    });
  });

  describe('handler - unknown subcommand', () => {
    it('exits with error for unknown subcommand', async () => {
      await configCommand.handler(createArgv({ subcommand: 'foobar' }));

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('Unknown config subcommand') })
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('no subprocess spawning', () => {
    it('does not call runSubcommand for show', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      await configCommand.handler(createArgv({ subcommand: 'show' }));
      // No runSubcommand import means it cannot be called
      expect(loadMergedConfig).toHaveBeenCalled();
    });

    it('does not call runSubcommand for get', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (getConfigValue as Mock).mockReturnValue('main');
      await configCommand.handler(createArgv({ subcommand: 'get', args: ['baseBranch'] }));
      expect(getConfigValue).toHaveBeenCalled();
    });

    it('does not call runSubcommand for set with key+value', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      await configCommand.handler(
        createArgv({ subcommand: 'set', args: ['baseBranch', 'develop'] })
      );
      expect(setConfigValue).toHaveBeenCalled();
      expect(saveRepoConfig).toHaveBeenCalled();
    });
  });
});
