/**
 * Tests for main-menu.ts - Interactive menu for wtlink
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock inquirer before importing
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
    Separator: class Separator {
      type = 'separator';
    },
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

import inquirer from 'inquirer';
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
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ action: 'exit' });

      await showMainMenu();

      expect(mockConsoleClear).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('calls manage.run when user selects manage', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ action: 'manage' })
        .mockResolvedValueOnce({ shouldLink: false }) // Don't link after manage
        .mockResolvedValueOnce({ continue: '' }) // Press Enter
        .mockResolvedValueOnce({ action: 'exit' });

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
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ action: 'manage' })
        .mockResolvedValueOnce({ shouldLink: true }) // Link after manage
        .mockResolvedValueOnce({ continue: '' }) // Press Enter after link
        .mockResolvedValueOnce({ action: 'exit' });

      await showMainMenu();

      expect(manage.run).toHaveBeenCalled();
      expect(link.run).toHaveBeenCalled();
    });

    it('calls link.run when user selects link', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ action: 'link' })
        .mockResolvedValueOnce({ continue: '' }) // Press Enter
        .mockResolvedValueOnce({ action: 'exit' });

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
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ action: 'validate' })
        .mockResolvedValueOnce({ continue: '' }) // Press Enter
        .mockResolvedValueOnce({ action: 'exit' });

      await showMainMenu();

      expect(validate.run).toHaveBeenCalled();
    });

    it('shows help when user selects help', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ action: 'help' })
        .mockResolvedValueOnce({ continue: '' }) // Press Enter
        .mockResolvedValueOnce({ action: 'exit' });

      await showMainMenu();

      // Help text contains "wtlink Help"
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('wtlink'));
    });

    it('handles errors gracefully and continues loop', async () => {
      vi.mocked(manage.run).mockRejectedValueOnce(new Error('Test error'));

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ action: 'manage' })
        .mockResolvedValueOnce({ continue: '' }) // Press Enter after error
        .mockResolvedValueOnce({ action: 'exit' });

      await showMainMenu();

      expect(mockConsoleError).toHaveBeenCalledWith(expect.anything(), 'Test error');
    });

    it('handles non-Error exceptions', async () => {
      vi.mocked(manage.run).mockRejectedValueOnce('String error');

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ action: 'manage' })
        .mockResolvedValueOnce({ continue: '' }) // Press Enter after error
        .mockResolvedValueOnce({ action: 'exit' });

      await showMainMenu();

      expect(mockConsoleError).toHaveBeenCalledWith(expect.anything(), 'String error');
    });

    it('displays the menu header', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ action: 'exit' });

      await showMainMenu();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Worktree Config Link Manager')
      );
    });
  });
});
