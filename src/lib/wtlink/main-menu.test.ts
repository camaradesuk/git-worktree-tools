/**
 * Tests for main-menu.ts - Interactive menu for wtlink
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prompts module before importing
vi.mock('../prompts.js', () => ({
  promptChoice: vi.fn(),
  promptConfirm: vi.fn(),
  promptInput: vi.fn(),
  UserNavigatedBack: class UserNavigatedBack extends Error {
    constructor() {
      super('User navigated back');
      this.name = 'UserNavigatedBack';
    }
  },
}));

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleClear = vi.spyOn(console, 'clear').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock the submodules
vi.mock('./manage-manifest.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./link-configs.js', () => ({
  run: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./validate-manifest.js', () => ({
  run: vi.fn(),
}));

import { promptChoice, promptConfirm, promptInput } from '../prompts.js';
import { showMainMenu } from './main-menu.js';
import * as manage from './manage-manifest.js';
import * as link from './link-configs.js';
import * as validate from './validate-manifest.js';

describe('main-menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('showMainMenu', () => {
    it('exits when user selects exit', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('exit');

      await showMainMenu();

      expect(mockConsoleClear).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('calls manage.run when user selects manage', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('manage').mockResolvedValueOnce('exit');
      vi.mocked(promptConfirm).mockResolvedValueOnce(false); // Don't link after manage
      vi.mocked(promptInput).mockResolvedValueOnce(''); // Press Enter

      await showMainMenu();

      expect(manage.run).toHaveBeenCalledWith(
        expect.objectContaining({
          nonInteractive: false,
          clean: false,
          dryRun: false,
        })
      );
    });

    it('calls link.run after manage when user confirms', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('manage').mockResolvedValueOnce('exit');
      vi.mocked(promptConfirm).mockResolvedValueOnce(true); // Link after manage
      vi.mocked(promptInput).mockResolvedValueOnce(''); // Press Enter after link

      await showMainMenu();

      expect(manage.run).toHaveBeenCalled();
      expect(link.run).toHaveBeenCalled();
    });

    it('calls link.run when user selects link', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('link').mockResolvedValueOnce('exit');
      vi.mocked(promptInput).mockResolvedValueOnce(''); // Press Enter

      await showMainMenu();

      expect(link.run).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: false,
          type: 'hard',
          yes: false,
        })
      );
    });

    it('calls validate.run when user selects validate', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('validate').mockResolvedValueOnce('exit');
      vi.mocked(promptInput).mockResolvedValueOnce(''); // Press Enter

      await showMainMenu();

      expect(validate.run).toHaveBeenCalled();
    });

    it('shows help when user selects help', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('help').mockResolvedValueOnce('exit');
      vi.mocked(promptInput).mockResolvedValueOnce(''); // Press Enter

      await showMainMenu();

      // Help text contains "wtlink Help"
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('wtlink'));
    });

    it('handles errors gracefully and continues loop', async () => {
      vi.mocked(manage.run).mockRejectedValueOnce(new Error('Test error'));

      vi.mocked(promptChoice).mockResolvedValueOnce('manage').mockResolvedValueOnce('exit');
      vi.mocked(promptInput).mockResolvedValueOnce(''); // Press Enter after error

      await showMainMenu();

      expect(mockConsoleError).toHaveBeenCalledWith(expect.anything(), 'Test error');
    });

    it('handles non-Error exceptions', async () => {
      vi.mocked(manage.run).mockRejectedValueOnce('String error');

      vi.mocked(promptChoice).mockResolvedValueOnce('manage').mockResolvedValueOnce('exit');
      vi.mocked(promptInput).mockResolvedValueOnce(''); // Press Enter after error

      await showMainMenu();

      expect(mockConsoleError).toHaveBeenCalledWith(expect.anything(), 'String error');
    });

    it('displays the menu header', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('exit');

      await showMainMenu();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Worktree Config Link Manager')
      );
    });

    it('exits on user cancelled error', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      await showMainMenu();

      // Should exit without error
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('exits on UserNavigatedBack error', async () => {
      const { UserNavigatedBack } = await import('../prompts.js');
      vi.mocked(promptChoice).mockRejectedValueOnce(new UserNavigatedBack());

      await showMainMenu();

      // Should exit without error
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });
});
