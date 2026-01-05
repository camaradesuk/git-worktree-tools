/**
 * Tests for config-editor.ts
 *
 * Tests the interactive config editor functions:
 * - editCategory
 * - editProperty
 * - quickEditConfig
 * - runConfigEditor
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// Mock dependencies before importing
vi.mock('./prompts.js', () => ({
  promptChoice: vi.fn(),
  promptInput: vi.fn(),
  promptConfirm: vi.fn(),
  UserNavigatedBack: class UserNavigatedBack extends Error {
    constructor() {
      super('User navigated back');
      this.name = 'UserNavigatedBack';
    }
  },
}));

vi.mock('./config.js', () => ({
  loadConfigWithValidation: vi.fn(() => ({
    config: {},
    configPath: '/repo/.worktreerc',
    validation: null,
  })),
  saveConfig: vi.fn(() => ({ configPath: '/repo/.worktreerc' })),
  getConfigPath: vi.fn(() => '/repo/.worktreerc'),
  getDefaultConfig: vi.fn(() => ({
    baseBranch: 'main',
    branchPrefix: 'feat',
    draftPr: false,
    preferredEditor: 'vscode',
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    sharedRepos: [],
    syncPatterns: [],
    ai: { provider: 'none' },
    hooks: {},
    hookDefaults: { timeout: 30000, maxTimeout: 60000 },
  })),
}));

vi.mock('./config-validation.js', () => ({
  validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
  formatValidationErrors: vi.fn(() => 'formatted errors'),
}));

vi.mock('./colors.js', () => ({
  green: vi.fn((s: string) => s),
  dim: vi.fn((s: string) => s),
  cyan: vi.fn((s: string) => s),
  yellow: vi.fn((s: string) => s),
  red: vi.fn((s: string) => s),
  bold: vi.fn((s: string) => s),
}));

import { runConfigEditor, quickEditConfig } from './config-editor.js';
import * as prompts from './prompts.js';
import * as config from './config.js';
import * as validation from './config-validation.js';

describe('config-editor', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: MockInstance<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: MockInstance<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('runConfigEditor', () => {
    it('displays config path when config exists', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce('__exit__');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('/repo/.worktreerc'));
    });

    it('displays message when no config file exists', async () => {
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: {},
        configPath: null,
        validation: null,
      });
      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce('__exit__');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No config file found'));
    });

    it('shows validation warnings when present', async () => {
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: {},
        configPath: '/repo/.worktreerc',
        validation: {
          valid: false,
          errors: [{ path: 'baseBranch', message: 'Invalid branch name' }],
        },
      });
      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce('__exit__');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Validation warnings'));
    });

    it('exits without saving when no changes made', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce('__exit__');

      const result = await runConfigEditor('/repo');

      expect(result.saved).toBe(false);
      expect(config.saveConfig).not.toHaveBeenCalled();
    });

    it('discards changes when __discard__ selected', async () => {
      // First select a category, make a change, then discard
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic') // Select category
        .mockResolvedValueOnce('baseBranch') // Select property
        .mockResolvedValueOnce('__back__') // Go back from property
        .mockResolvedValueOnce('__discard__'); // Discard changes

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('develop');

      const result = await runConfigEditor('/repo');

      expect(result.saved).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('discarded'));
    });

    it('saves changes when __exit__ selected with changes', async () => {
      // Select category, edit property, then exit
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic') // Select category
        .mockResolvedValueOnce('baseBranch') // Select property
        .mockResolvedValueOnce('__back__') // Go back from category
        .mockResolvedValueOnce('__exit__'); // Exit

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('develop');

      const result = await runConfigEditor('/repo');

      expect(result.saved).toBe(true);
      expect(config.saveConfig).toHaveBeenCalled();
    });

    it('handles save error and allows retry', async () => {
      // Make a change, fail to save, then exit
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__') // First exit attempt fails
        .mockResolvedValueOnce('__discard__'); // Then discard

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('develop');
      (config.saveConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Write permission denied');
      });

      const result = await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'));
      expect(result.saved).toBe(false);
    });

    it('handles UserNavigatedBack from main menu without changes', async () => {
      const UserNavigatedBack = prompts.UserNavigatedBack;
      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new UserNavigatedBack()
      );

      const result = await runConfigEditor('/repo');

      expect(result.saved).toBe(false);
    });

    it('prompts to save when UserNavigatedBack with changes', async () => {
      const UserNavigatedBack = prompts.UserNavigatedBack;

      // Make a change, then navigate back
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockRejectedValueOnce(new UserNavigatedBack());

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('develop');
      (prompts.promptConfirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      const result = await runConfigEditor('/repo');

      expect(prompts.promptConfirm).toHaveBeenCalledWith('Save changes before exiting?', true);
      expect(result.saved).toBe(true);
    });

    it('handles save error when UserNavigatedBack with changes', async () => {
      const UserNavigatedBack = prompts.UserNavigatedBack;

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockRejectedValueOnce(new UserNavigatedBack());

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('develop');
      (prompts.promptConfirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      (config.saveConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Disk full');
      });

      const result = await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'));
      expect(result.saved).toBe(false);
    });

    it('rethrows non-UserNavigatedBack errors', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Unexpected error')
      );

      await expect(runConfigEditor('/repo')).rejects.toThrow('Unexpected error');
    });
  });

  describe('quickEditConfig', () => {
    it('reports unknown config key', async () => {
      const result = await quickEditConfig('/repo', 'unknownKey');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown config key'));
      expect(result.saved).toBe(false);
    });

    it('sets boolean value directly', async () => {
      const result = await quickEditConfig('/repo', 'draftPr', 'true');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', { draftPr: true });
      expect(result.saved).toBe(true);
    });

    it('sets boolean false with "false"', async () => {
      const result = await quickEditConfig('/repo', 'draftPr', 'false');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', { draftPr: false });
      expect(result.saved).toBe(true);
    });

    it('sets boolean true with "1"', async () => {
      const result = await quickEditConfig('/repo', 'draftPr', '1');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', { draftPr: true });
      expect(result.saved).toBe(true);
    });

    it('sets number value directly', async () => {
      const result = await quickEditConfig('/repo', 'hookDefaults.timeout', '60000');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', {
        hookDefaults: { timeout: 60000 },
      });
      expect(result.saved).toBe(true);
    });

    it('rejects invalid number value', async () => {
      const result = await quickEditConfig('/repo', 'hookDefaults.timeout', 'not-a-number');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid number'));
      expect(result.saved).toBe(false);
    });

    it('sets array value from comma-separated string', async () => {
      const result = await quickEditConfig('/repo', 'sharedRepos', 'repo1,repo2,repo3');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', {
        sharedRepos: ['repo1', 'repo2', 'repo3'],
      });
      expect(result.saved).toBe(true);
    });

    it('sets string value directly', async () => {
      const result = await quickEditConfig('/repo', 'baseBranch', 'develop');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', { baseBranch: 'develop' });
      expect(result.saved).toBe(true);
    });

    it('handles interactive edit when no value provided', async () => {
      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('develop');

      const result = await quickEditConfig('/repo', 'baseBranch');

      expect(prompts.promptInput).toHaveBeenCalled();
      expect(result.saved).toBe(true);
    });

    it('returns saved false when interactive edit makes no change', async () => {
      // Mock loadConfigWithValidation to return baseBranch: 'main'
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { baseBranch: 'main' },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      // Return same value
      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('main');

      const result = await quickEditConfig('/repo', 'baseBranch');

      expect(result.saved).toBe(false);
    });

    it('handles save error', async () => {
      (config.saveConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const result = await quickEditConfig('/repo', 'baseBranch', 'develop');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'));
      expect(result.saved).toBe(false);
    });

    it('sets enum value directly', async () => {
      const result = await quickEditConfig('/repo', 'preferredEditor', 'cursor');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', { preferredEditor: 'cursor' });
      expect(result.saved).toBe(true);
    });

    it('sets nested AI config value', async () => {
      const result = await quickEditConfig('/repo', 'ai.provider', 'claude');

      expect(config.saveConfig).toHaveBeenCalledWith('/repo', {
        ai: { provider: 'claude' },
      });
      expect(result.saved).toBe(true);
    });
  });

  describe('editProperty via runConfigEditor', () => {
    it('edits boolean property with promptConfirm', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('draftPr')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptConfirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      await runConfigEditor('/repo');

      expect(prompts.promptConfirm).toHaveBeenCalledWith(expect.stringContaining('Enable'), false);
    });

    it('edits enum property with promptChoice', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('preferredEditor')
        .mockResolvedValueOnce('cursor') // Select enum value
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      await runConfigEditor('/repo');

      // Verify promptChoice was called with enum options
      expect(prompts.promptChoice).toHaveBeenCalledWith(
        expect.stringContaining('Select'),
        expect.arrayContaining([
          expect.objectContaining({ label: 'vscode' }),
          expect.objectContaining({ label: 'cursor' }),
        ])
      );
    });

    it('clears enum property when undefined selected', async () => {
      // Set initial value so clearing it is a change
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { preferredEditor: 'vscode' },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('preferredEditor')
        .mockResolvedValueOnce(undefined) // Clear value
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      await runConfigEditor('/repo');

      expect(config.saveConfig).toHaveBeenCalled();
    });

    it('edits number property with promptInput', async () => {
      // Set an initial value so the promptInput gets a default value
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { hookDefaults: { timeout: 30000 } },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('hookDefaults')
        .mockResolvedValueOnce('hookDefaults.timeout')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('45000');

      await runConfigEditor('/repo');

      expect(prompts.promptInput).toHaveBeenCalledWith(expect.stringContaining('Enter'), '30000');
    });

    it('handles invalid number input', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('hookDefaults')
        .mockResolvedValueOnce('hookDefaults.timeout')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('abc');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid number'));
    });

    it('clears number property with empty input', async () => {
      // Set an initial value so clearing it is a change
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { hookDefaults: { timeout: 30000 } },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('hookDefaults')
        .mockResolvedValueOnce('hookDefaults.timeout')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

      await runConfigEditor('/repo');

      // Empty string clears the value
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('updated'));
    });

    it('edits array property with comma-separated input', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('worktree')
        .mockResolvedValueOnce('sharedRepos')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('repo1, repo2');

      await runConfigEditor('/repo');

      expect(config.saveConfig).toHaveBeenCalled();
    });

    it('clears array property with empty input', async () => {
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { sharedRepos: ['existing'] },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('worktree')
        .mockResolvedValueOnce('sharedRepos')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('updated'));
    });

    it('edits string property with promptInput', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('develop');

      await runConfigEditor('/repo');

      expect(prompts.promptInput).toHaveBeenCalledWith(expect.stringContaining('Enter'), undefined);
    });

    it('clears string property with empty input', async () => {
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { baseBranch: 'develop' },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('updated'));
    });

    it('displays value unchanged message when same value entered', async () => {
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { baseBranch: 'main' },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('main');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('unchanged'));
    });

    it('shows validation warning when value causes validation error', async () => {
      (validation.validateConfig as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        valid: false,
        errors: [{ path: 'baseBranch', message: 'Invalid branch name' }],
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockResolvedValueOnce('invalid!branch');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('may cause issues'));
    });

    it('handles UserNavigatedBack when editing property', async () => {
      const UserNavigatedBack = prompts.UserNavigatedBack;

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new UserNavigatedBack()
      );

      const result = await runConfigEditor('/repo');

      // Should not crash, returns without saving the property
      expect(result.saved).toBe(false);
    });
  });

  describe('editCategory via runConfigEditor', () => {
    it('returns to main menu when __back__ selected in category', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      const result = await runConfigEditor('/repo');

      expect(result.saved).toBe(false);
    });

    it('handles UserNavigatedBack in category menu', async () => {
      const UserNavigatedBack = prompts.UserNavigatedBack;

      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockRejectedValueOnce(new UserNavigatedBack()) // Back from category
        .mockResolvedValueOnce('__exit__');

      const result = await runConfigEditor('/repo');

      expect(result.saved).toBe(false);
    });

    it('tracks changes through multiple property edits', async () => {
      (prompts.promptChoice as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('basic')
        .mockResolvedValueOnce('baseBranch')
        .mockResolvedValueOnce('branchPrefix')
        .mockResolvedValueOnce('__back__')
        .mockResolvedValueOnce('__exit__');

      (prompts.promptInput as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('develop')
        .mockResolvedValueOnce('fix');

      const result = await runConfigEditor('/repo');

      expect(result.saved).toBe(true);
      expect(config.saveConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          baseBranch: 'develop',
          branchPrefix: 'fix',
        })
      );
    });
  });

  describe('formatValue helper', () => {
    it('shows configured properties count in category menu', async () => {
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: { baseBranch: 'develop', draftPr: true },
        configPath: '/repo/.worktreerc',
        validation: null,
      });

      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce('__exit__');

      await runConfigEditor('/repo');

      // The category label should include count of configured properties
      expect(prompts.promptChoice).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            label: expect.stringContaining('set'),
          }),
        ])
      );
    });
  });

  describe('validation warnings display', () => {
    it('shows truncated validation warnings', async () => {
      (config.loadConfigWithValidation as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        config: {},
        configPath: '/repo/.worktreerc',
        validation: {
          valid: false,
          errors: [
            { path: 'error1', message: 'Error 1' },
            { path: 'error2', message: 'Error 2' },
            { path: 'error3', message: 'Error 3' },
            { path: 'error4', message: 'Error 4' },
            { path: 'error5', message: 'Error 5' },
          ],
        },
      });
      (prompts.promptChoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce('__exit__');

      await runConfigEditor('/repo');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('and 2 more'));
    });
  });
});
