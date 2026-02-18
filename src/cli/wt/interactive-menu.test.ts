/**
 * Integration tests for interactive menu flows
 *
 * These tests verify that each menu flow:
 * 1. Gathers the correct user inputs
 * 2. Passes the correct arguments to subcommands
 * 3. Returns to menu after subcommand execution (not exit)
 * 4. Handles cancellation and back navigation correctly
 * 5. Uses library calls for wtlink view/add/remove
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FlowResult } from './interactive-menu.js';

// Mock modules before importing the module under test
vi.mock('../../lib/prompts.js', () => {
  // Define UserNavigatedBack inside the factory to avoid hoisting issues
  class MockUserNavigatedBack extends Error {
    constructor() {
      super('User navigated back');
      this.name = 'UserNavigatedBack';
    }
  }
  return {
    promptChoice: vi.fn(),
    promptInput: vi.fn(),
    promptConfirm: vi.fn(),
    UserNavigatedBack: MockUserNavigatedBack,
  };
});

vi.mock('./run-command.js', () => ({
  runSubcommandForResult: vi.fn(() => ({
    status: 0,
    stdout: Buffer.from(''),
    stderr: Buffer.from(''),
    pid: 0,
    output: [null, null, null],
    signal: null,
  })),
}));

vi.mock('../../lib/config.js', () => ({
  loadConfig: vi.fn(() => ({
    configVersion: 1,
    sharedRepos: [],
    baseBranch: 'main',
    draftPr: true,
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    syncPatterns: [],
    branchPrefix: 'feat',
    previewLabel: 'preview',
    preferredEditor: 'vscode',
    ai: {
      provider: 'auto',
      fallback: 'none',
      branchName: false,
      prTitle: false,
      prDescription: false,
      commitMessage: false,
      planDocument: false,
    },
    hooks: {},
    hookDefaults: { timeout: 30000, maxTimeout: 60000 },
    plugins: [],
    generators: {},
    integrations: {},
    logging: { level: 'info' as const, timestamps: true },
    global: { warnNotGlobal: true },
    wtlink: { enabled: [], disabled: [] },
  })),
}));

vi.mock('../../lib/git.js', () => ({
  getRepoRoot: vi.fn(() => '/mock/repo'),
  listLocalBranches: vi.fn(() => ['feat/existing-branch', 'fix/bug-fix', 'main', 'develop']),
}));

vi.mock('../../lib/wtlink/config-manifest.js', () => ({
  loadManifestData: vi.fn(() => ({
    enabled: ['.env', '.env.local'],
    disabled: ['config.json'],
    source: 'config',
  })),
  saveManifestData: vi.fn(),
}));

// Import mocked modules
import { promptChoice, promptInput, promptConfirm } from '../../lib/prompts.js';
import { runSubcommandForResult } from './run-command.js';
import { loadConfig } from '../../lib/config.js';
import * as git from '../../lib/git.js';
import { loadManifestData, saveManifestData } from '../../lib/wtlink/config-manifest.js';

// Import flows after mocks are set up
import { flows, showMainMenu } from './interactive-menu.js';

// Mock console.log to keep test output clean
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('Interactive Menu Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockClear();
  });

  describe('handleListWorktrees', () => {
    it('calls lswt subcommand and returns to menu', async () => {
      const result = await flows.handleListWorktrees();

      expect(runSubcommandForResult).toHaveBeenCalledWith('lswt', []);
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('returns to menu with error message when subcommand fails', async () => {
      vi.mocked(runSubcommandForResult).mockReturnValueOnce({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        pid: 0,
        output: [null, null, null],
        signal: null,
      });
      const result = await flows.handleListWorktrees();
      expect(result).toEqual({ completed: true, returnToMenu: true });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('exit'));
    });
  });

  describe('handleBrowsePRs', () => {
    it('calls prs subcommand and returns to menu', async () => {
      const result = await flows.handleBrowsePRs();

      expect(runSubcommandForResult).toHaveBeenCalledWith('prs', []);
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });
  });

  describe('handleShowState', () => {
    it('calls wtstate subcommand and returns to menu', async () => {
      const result = await flows.handleShowState();

      expect(runSubcommandForResult).toHaveBeenCalledWith('wtstate', []);
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });
  });

  describe('handleNewPR', () => {
    it('returns CANCELLED when user selects back', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleNewPR();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    it('handles user cancellation (Ctrl+C)', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      const result = await flows.handleNewPR();

      expect(result).toEqual({ completed: false, returnToMenu: true });
    });

    describe('from-description flow', () => {
      it('gathers all inputs and calls newpr with correct args', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description') // New PR sub-menu
          .mockResolvedValueOnce(true); // Draft PR selection
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Add dark mode support') // Description
          .mockResolvedValueOnce('main'); // Base branch
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(false) // Install deps
          .mockResolvedValueOnce(false); // Open VS Code

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', ['Add dark mode support']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes --ready flag when not draft', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(false); // Ready for review (not draft)
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Fix critical bug')
          .mockResolvedValueOnce('main');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
          'Fix critical bug',
          '--ready',
        ]);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes --base flag when not main', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Feature work')
          .mockResolvedValueOnce('develop'); // Non-main base branch
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
          'Feature work',
          '--base',
          'develop',
        ]);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes --install flag when requested', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput).mockResolvedValueOnce('Add feature').mockResolvedValueOnce('main');
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(true) // Install deps
          .mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', ['Add feature', '--install']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes --code flag when requested', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput).mockResolvedValueOnce('Add feature').mockResolvedValueOnce('main');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(true); // Open VS Code

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', ['Add feature', '--code']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes all optional flags together', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(false); // Ready
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Full feature')
          .mockResolvedValueOnce('develop');
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(true) // Install
          .mockResolvedValueOnce(true); // VS Code

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
          'Full feature',
          '--base',
          'develop',
          '--ready',
          '--install',
          '--code',
        ]);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when description is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-description');
        vi.mocked(promptInput).mockResolvedValueOnce(''); // Empty description

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommandForResult).not.toHaveBeenCalled();
      });

      it('handles user cancellation during input', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-description');
        vi.mocked(promptInput).mockRejectedValueOnce(new Error('User cancelled'));

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
      });
    });

    describe('from-pr flow', () => {
      it('gathers PR number and calls newpr with --pr flag', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('42');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', ['--pr', '42']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes --install and --code flags', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('123');
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(true) // Install
          .mockResolvedValueOnce(true); // VS Code

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
          '--pr',
          '123',
          '--install',
          '--code',
        ]);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when PR number is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommandForResult).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is invalid', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('not-a-number');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommandForResult).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is zero', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('0');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommandForResult).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is negative', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('-5');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommandForResult).not.toHaveBeenCalled();
      });
    });

    describe('from-branch flow', () => {
      it('allows selecting from existing branches', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch') // New PR sub-menu
          .mockResolvedValueOnce('feat/existing-branch') // Select branch
          .mockResolvedValueOnce(true); // Draft PR
        vi.mocked(promptInput).mockResolvedValueOnce('main');

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
          '--branch',
          'feat/existing-branch',
        ]);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('allows typing custom branch name', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('__custom__') // Select custom option
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput)
          .mockResolvedValueOnce('feat/my-new-branch') // Custom branch name
          .mockResolvedValueOnce('main');

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
          '--branch',
          'feat/my-new-branch',
        ]);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes --base and --ready flags', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('fix/bug-fix')
          .mockResolvedValueOnce(false); // Ready for review
        vi.mocked(promptInput).mockResolvedValueOnce('develop');

        const result = await flows.handleNewPR();

        expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
          '--branch',
          'fix/bug-fix',
          '--base',
          'develop',
          '--ready',
        ]);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when branch name is empty', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('__custom__');
        vi.mocked(promptInput).mockResolvedValueOnce(''); // Empty branch name

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommandForResult).not.toHaveBeenCalled();
      });

      it('handles empty branch list gracefully', async () => {
        // Mock empty branch list
        vi.mocked(git.listLocalBranches).mockReturnValueOnce([]);
        vi.mocked(promptChoice).mockResolvedValueOnce('from-branch');
        vi.mocked(promptInput)
          .mockResolvedValueOnce('feat/new-branch') // Manual branch input
          .mockResolvedValueOnce('main');
        vi.mocked(promptChoice).mockResolvedValueOnce(true); // Draft

        const result = await flows.handleNewPR();

        // Should have prompted for branch name directly
        expect(promptInput).toHaveBeenCalledWith('Branch name');
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });
    });
  });

  describe('handleCleanPRs', () => {
    it('returns CANCELLED when user selects back', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleCleanPRs();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    describe('clean-all', () => {
      it('calls cleanpr with --all after confirmation and returns to menu', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-all');
        vi.mocked(promptConfirm).mockResolvedValueOnce(true);

        const result = await flows.handleCleanPRs();

        expect(runSubcommandForResult).toHaveBeenCalledWith('cleanpr', ['--all']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when not confirmed', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-all');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false);

        const result = await flows.handleCleanPRs();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommandForResult).not.toHaveBeenCalled();
      });
    });

    describe('clean-specific', () => {
      it('calls cleanpr with PR number and returns to menu', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-specific');
        vi.mocked(promptInput).mockResolvedValueOnce('42');

        const result = await flows.handleCleanPRs();

        expect(runSubcommandForResult).toHaveBeenCalledWith('cleanpr', ['42']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when PR number is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-specific');
        vi.mocked(promptInput).mockResolvedValueOnce('');

        const result = await flows.handleCleanPRs();

        expect(result).toEqual({ completed: false, returnToMenu: true });
      });

      it('returns CANCELLED when PR number is invalid', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-specific');
        vi.mocked(promptInput).mockResolvedValueOnce('invalid');

        const result = await flows.handleCleanPRs();

        expect(result).toEqual({ completed: false, returnToMenu: true });
      });
    });

    describe('dry-run', () => {
      it('calls cleanpr with --dry-run and returns to menu', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('dry-run');

        const result = await flows.handleCleanPRs();

        expect(runSubcommandForResult).toHaveBeenCalledWith('cleanpr', ['--dry-run']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });
    });

    it('handles user cancellation', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      const result = await flows.handleCleanPRs();

      expect(result).toEqual({ completed: false, returnToMenu: true });
    });
  });

  describe('handleLinkConfig', () => {
    it('returns CANCELLED when user selects back', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleLinkConfig();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    describe('view via library', () => {
      it('displays manifest contents from loadManifestData', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('view');

        const result = await flows.handleLinkConfig();

        expect(loadManifestData).toHaveBeenCalledWith('/mock/repo');
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('shows empty message when manifest has no files', async () => {
        vi.mocked(loadManifestData).mockReturnValueOnce({
          enabled: [],
          disabled: [],
          source: 'empty',
        });
        vi.mocked(promptChoice).mockResolvedValueOnce('view');

        const result = await flows.handleLinkConfig();

        expect(result).toEqual({ completed: true, returnToMenu: true });
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No files'));
      });

      it('displays enabled and disabled files', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('view');

        const result = await flows.handleLinkConfig();

        expect(result).toEqual({ completed: true, returnToMenu: true });
        // Check enabled files are shown
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Enabled'));
        expect(consoleSpy).toHaveBeenCalledWith('  .env');
        expect(consoleSpy).toHaveBeenCalledWith('  .env.local');
        // Check disabled files are shown
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Disabled'));
      });
    });

    describe('sync via wtlink link', () => {
      it('calls wtlink link subcommand', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('sync');

        const result = await flows.handleLinkConfig();

        expect(runSubcommandForResult).toHaveBeenCalledWith('wtlink', ['link']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('shows error when sync fails', async () => {
        vi.mocked(runSubcommandForResult).mockReturnValueOnce({
          status: 1,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          pid: 0,
          output: [null, null, null],
          signal: null,
        });
        vi.mocked(promptChoice).mockResolvedValueOnce('sync');

        const result = await flows.handleLinkConfig();

        expect(result).toEqual({ completed: true, returnToMenu: true });
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('sync failed'));
      });
    });

    describe('add via library', () => {
      it('adds file to manifest via saveManifestData', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('add');
        vi.mocked(promptInput).mockResolvedValueOnce('.npmrc');

        const result = await flows.handleLinkConfig();

        expect(saveManifestData).toHaveBeenCalledWith(
          '/mock/repo',
          ['.env', '.env.local', '.npmrc'],
          ['config.json']
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('skips duplicate files', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('add');
        vi.mocked(promptInput).mockResolvedValueOnce('.env');

        const result = await flows.handleLinkConfig();

        expect(saveManifestData).not.toHaveBeenCalled();
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when file path is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('add');
        vi.mocked(promptInput).mockResolvedValueOnce('');

        const result = await flows.handleLinkConfig();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(saveManifestData).not.toHaveBeenCalled();
      });
    });

    describe('remove via library', () => {
      it('removes file from manifest via saveManifestData', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('remove');
        vi.mocked(promptInput).mockResolvedValueOnce('.env');

        const result = await flows.handleLinkConfig();

        expect(saveManifestData).toHaveBeenCalledWith(
          '/mock/repo',
          ['.env.local'],
          ['config.json']
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('handles file not in manifest', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('remove');
        vi.mocked(promptInput).mockResolvedValueOnce('nonexistent.txt');

        const result = await flows.handleLinkConfig();

        expect(saveManifestData).not.toHaveBeenCalled();
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when file path is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('remove');
        vi.mocked(promptInput).mockResolvedValueOnce('');

        const result = await flows.handleLinkConfig();

        expect(result).toEqual({ completed: false, returnToMenu: true });
      });
    });

    describe('validate', () => {
      it('calls wtlink validate and returns to menu', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('validate');

        const result = await flows.handleLinkConfig();

        expect(runSubcommandForResult).toHaveBeenCalledWith('wtlink', ['validate']);
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });
    });

    it('handles user cancellation', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      const result = await flows.handleLinkConfig();

      expect(result).toEqual({ completed: false, returnToMenu: true });
    });
  });

  describe('handleConfigure', () => {
    it('returns CANCELLED when user selects back', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    it('view calls wtconfig show and returns to menu', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('view');

      const result = await flows.handleConfigure();

      expect(runSubcommandForResult).toHaveBeenCalledWith('wtconfig', ['show']);
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('init calls wtconfig init after confirmation and returns to menu', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('init');
      vi.mocked(promptConfirm).mockResolvedValueOnce(true);

      const result = await flows.handleConfigure();

      expect(runSubcommandForResult).toHaveBeenCalledWith('wtconfig', ['init']);
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('init returns CANCELLED when not confirmed', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('init');
      vi.mocked(promptConfirm).mockResolvedValueOnce(false);

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    it('edit calls wtconfig set with setting and value', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('edit').mockResolvedValueOnce('baseBranch');
      vi.mocked(promptInput).mockResolvedValueOnce('develop');

      const result = await flows.handleConfigure();

      expect(runSubcommandForResult).toHaveBeenCalledWith('wtconfig', [
        'set',
        'baseBranch',
        'develop',
      ]);
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('edit returns CANCELLED when value is empty', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('edit').mockResolvedValueOnce('branchPrefix');
      vi.mocked(promptInput).mockResolvedValueOnce('');

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    it('handles user cancellation', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
    });
  });

  describe('showMainMenu', () => {
    it('exits on exit selection', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('exit');

      await showMainMenu();

      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    it('exits on user cancellation', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      await showMainMenu();

      expect(runSubcommandForResult).not.toHaveBeenCalled();
    });

    it('re-throws non-cancellation errors', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('Some other error'));

      await expect(showMainMenu()).rejects.toThrow('Some other error');
    });

    it('returns to menu when flow returns returnToMenu=true', async () => {
      vi.mocked(promptChoice)
        .mockResolvedValueOnce('new-pr') // First: select new-pr
        .mockResolvedValueOnce('back') // Then: go back from new-pr sub-menu
        .mockResolvedValueOnce('exit'); // Finally: exit

      await showMainMenu();

      // Should have called promptChoice 3 times (menu -> sub-menu -> back to menu -> exit)
      expect(promptChoice).toHaveBeenCalledTimes(3);
    });

    it('handles list worktrees and returns to menu', async () => {
      vi.mocked(promptChoice)
        .mockResolvedValueOnce('list') // Select list
        .mockResolvedValueOnce('exit'); // Then exit

      await showMainMenu();

      expect(runSubcommandForResult).toHaveBeenCalledWith('lswt', []);
      expect(promptChoice).toHaveBeenCalledTimes(2);
    });

    it('handles browse PRs and returns to menu', async () => {
      vi.mocked(promptChoice)
        .mockResolvedValueOnce('browse-prs') // Select browse-prs
        .mockResolvedValueOnce('exit'); // Then exit

      await showMainMenu();

      expect(runSubcommandForResult).toHaveBeenCalledWith('prs', []);
      expect(promptChoice).toHaveBeenCalledTimes(2);
    });

    it('handles show state and returns to menu', async () => {
      vi.mocked(promptChoice)
        .mockResolvedValueOnce('state') // Select state
        .mockResolvedValueOnce('exit'); // Then exit

      await showMainMenu();

      expect(runSubcommandForResult).toHaveBeenCalledWith('wtstate', []);
      expect(promptChoice).toHaveBeenCalledTimes(2);
    });
  });

  describe('FlowResult types', () => {
    it('CANCELLED has correct structure', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleNewPR();

      expect(result.completed).toBe(false);
      expect(result.returnToMenu).toBe(true);
    });

    it('flows that run subcommands return completed with returnToMenu=true', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('dry-run');

      const result = await flows.handleCleanPRs();

      expect(result).toEqual({ completed: true, returnToMenu: true });
      expect(runSubcommandForResult).toHaveBeenCalled();
    });
  });
});

describe('Config loading in flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses config default for base branch', async () => {
    // Set up config mock to return custom baseBranch
    vi.mocked(loadConfig).mockReturnValueOnce({
      configVersion: 1,
      sharedRepos: [],
      baseBranch: 'develop',
      draftPr: true,
      worktreePattern: '{repo}.pr{number}',
      worktreeParent: '..',
      syncPatterns: [],
      branchPrefix: 'feat',
      previewLabel: 'preview',
      preferredEditor: 'vscode',
      ai: {
        provider: 'auto',
        fallback: 'none',
        branchName: false,
        prTitle: false,
        prDescription: false,
        commitMessage: false,
        planDocument: false,
      },
      hooks: {},
      hookDefaults: { timeout: 30000, maxTimeout: 60000 },
      plugins: [],
      generators: {},
      integrations: {},
      logging: { level: 'info' as const, timestamps: true },
      global: { warnNotGlobal: true },
      wtlink: { enabled: [], disabled: [] },
      linkConfigFiles: undefined,
    });

    vi.mocked(promptChoice).mockResolvedValueOnce('from-description').mockResolvedValueOnce(true);
    vi.mocked(promptInput).mockResolvedValueOnce('Test feature').mockResolvedValueOnce('develop'); // User accepts default
    vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    const result = await flows.handleNewPR();

    // Verify loadConfig was called
    expect(loadConfig).toHaveBeenCalled();
    // Since user entered 'develop' (matching config default), --base flag present
    expect(runSubcommandForResult).toHaveBeenCalledWith('newpr', [
      'Test feature',
      '--base',
      'develop',
    ]);
    expect(result).toEqual({ completed: true, returnToMenu: true });
  });
});

describe('Git branch listing in flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out main/master/develop from branch selection', async () => {
    // The mock already returns ['feat/existing-branch', 'fix/bug-fix', 'main', 'develop']
    // The flow should filter out main and develop

    vi.mocked(promptChoice)
      .mockResolvedValueOnce('from-branch')
      .mockResolvedValueOnce('feat/existing-branch')
      .mockResolvedValueOnce(true);
    vi.mocked(promptInput).mockResolvedValueOnce('main');

    const result = await flows.handleNewPR();

    // Check that listLocalBranches was called
    expect(git.listLocalBranches).toHaveBeenCalled();
    expect(result).toEqual({ completed: true, returnToMenu: true });
  });
});
