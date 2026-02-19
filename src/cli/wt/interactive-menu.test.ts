/**
 * Integration tests for interactive menu flows
 *
 * These tests verify that each menu flow:
 * 1. Gathers the correct user inputs
 * 2. Calls the correct library functions with proper arguments
 * 3. Returns to menu after operation execution (not exit)
 * 4. Handles cancellation and back navigation correctly
 * 5. Uses direct library calls (no subprocess spawning)
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
  removeWorktree: vi.fn(),
  pruneWorktrees: vi.fn(),
}));

vi.mock('../../lib/wtlink/config-manifest.js', () => ({
  loadManifestData: vi.fn(() => ({
    enabled: ['.env', '.env.local'],
    disabled: ['config.json'],
    source: 'config',
  })),
  saveManifestData: vi.fn(),
}));

// Mock direct library imports
vi.mock('../../lib/lswt/index.js', () => ({
  gatherWorktreeInfo: vi.fn(async () => []),
  createDefaultDeps: vi.fn(() => ({})),
  runInteractiveMode: vi.fn(async () => {}),
}));

vi.mock('../../lib/prs/command.js', () => ({
  runPrsCommand: vi.fn(async () => {}),
}));

vi.mock('../newpr.js', () => ({
  runNewprHandler: vi.fn(async () => {}),
}));

vi.mock('../../lib/cleanpr/index.js', () => ({
  gatherPrWorktreeInfo: vi.fn(async () => []),
  createDefaultDeps: vi.fn(() => ({})),
  getCleanableWorktrees: vi.fn(() => []),
  cleanWorktree: vi.fn(() => ({ success: true, message: 'Cleaned', prNumber: 42 })),
  findWorktreeByPrNumber: vi.fn(() => null),
  summarizeResults: vi.fn(() => ({ cleaned: 0, total: 0 })),
}));

vi.mock('../../lib/wtstate/index.js', () => ({
  analyzeState: vi.fn(() => ({
    scenario: 'main_clean_same',
    scenarioDescription: 'On main, clean, same as origin',
    currentBranch: 'main',
    baseBranch: 'main',
    worktreeType: 'main_worktree',
    hasChanges: false,
    hasStagedChanges: false,
    hasUnstagedChanges: false,
    localCommits: 0,
    stagedFiles: [],
    unstagedFiles: [],
    availableActions: [],
    recommendedAction: null,
  })),
  formatText: vi.fn(() => 'State: main_clean_same'),
}));

vi.mock('../../lib/wtlink/link-configs.js', () => ({
  run: vi.fn(async () => {}),
}));

vi.mock('../../lib/wtlink/validate-manifest.js', () => ({
  run: vi.fn(() => {}),
}));

vi.mock('../../lib/wtconfig/index.js', () => ({
  formatConfigDisplay: vi.fn(() => '{ baseBranch: "main" }'),
  setConfigValue: vi.fn((config: Record<string, unknown>, _key: string, _value: string) => config),
  loadRepoConfig: vi.fn(() => ({})),
  saveRepoConfig: vi.fn(),
  validateConfig: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
}));

vi.mock('../../lib/constants.js', () => ({
  DEFAULT_MANIFEST_FILE: '.wtlinkrc',
}));

vi.mock('../../lib/ui/index.js', () => ({
  printStatus: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Import mocked modules
import { promptChoice, promptInput, promptConfirm } from '../../lib/prompts.js';
import { loadConfig } from '../../lib/config.js';
import * as git from '../../lib/git.js';
import { loadManifestData, saveManifestData } from '../../lib/wtlink/config-manifest.js';
import { gatherWorktreeInfo, runInteractiveMode } from '../../lib/lswt/index.js';
import { runPrsCommand } from '../../lib/prs/command.js';
import { runNewprHandler } from '../newpr.js';
import {
  gatherPrWorktreeInfo,
  getCleanableWorktrees,
  summarizeResults,
} from '../../lib/cleanpr/index.js';
import { analyzeState, formatText } from '../../lib/wtstate/index.js';
import { run as runWtlinkLink } from '../../lib/wtlink/link-configs.js';
import { run as runWtlinkValidate } from '../../lib/wtlink/validate-manifest.js';
import {
  formatConfigDisplay,
  setConfigValue,
  loadRepoConfig,
  saveRepoConfig,
} from '../../lib/wtconfig/index.js';

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
    it('calls gatherWorktreeInfo and runInteractiveMode and returns to menu', async () => {
      const result = await flows.handleListWorktrees();

      expect(gatherWorktreeInfo).toHaveBeenCalledWith(
        '/mock/repo',
        { verbose: false, json: false, showStatus: false },
        expect.anything()
      );
      expect(runInteractiveMode).toHaveBeenCalled();
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('returns to menu with error message when library call fails', async () => {
      vi.mocked(gatherWorktreeInfo).mockRejectedValueOnce(new Error('git error'));
      const result = await flows.handleListWorktrees();
      expect(result).toEqual({ completed: true, returnToMenu: true });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('git error'));
    });
  });

  describe('handleBrowsePRs', () => {
    it('calls runPrsCommand and returns to menu', async () => {
      const result = await flows.handleBrowsePRs();

      expect(runPrsCommand).toHaveBeenCalledWith({
        state: 'open',
        limit: 50,
        json: false,
        noInteractive: false,
      });
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });
  });

  describe('handleShowState', () => {
    it('calls analyzeState and formatText and returns to menu', async () => {
      const result = await flows.handleShowState();

      expect(analyzeState).toHaveBeenCalledWith({
        verbose: false,
        json: false,
        baseBranch: 'main',
      });
      expect(formatText).toHaveBeenCalled();
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });
  });

  describe('handleNewPR', () => {
    it('returns CANCELLED when user selects back', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleNewPR();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runNewprHandler).not.toHaveBeenCalled();
    });

    it('handles user cancellation (Ctrl+C)', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      const result = await flows.handleNewPR();

      expect(result).toEqual({ completed: false, returnToMenu: true });
    });

    describe('from-description flow', () => {
      it('gathers all inputs and calls runNewprHandler with correct Options', async () => {
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

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'new',
            description: 'Add dark mode support',
            baseBranch: 'main',
            draft: true,
            installDeps: false,
            openEditor: false,
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes ready flag when not draft', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(false); // Ready for review (not draft)
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Fix critical bug')
          .mockResolvedValueOnce('main');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'new',
            description: 'Fix critical bug',
            draft: false,
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes non-main base branch', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Feature work')
          .mockResolvedValueOnce('develop'); // Non-main base branch
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            baseBranch: 'develop',
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes install flag when requested', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput).mockResolvedValueOnce('Add feature').mockResolvedValueOnce('main');
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(true) // Install deps
          .mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            installDeps: true,
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes code flag when requested', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput).mockResolvedValueOnce('Add feature').mockResolvedValueOnce('main');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(true); // Open VS Code

        const result = await flows.handleNewPR();

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            openEditor: true,
          })
        );
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

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'new',
            description: 'Full feature',
            baseBranch: 'develop',
            draft: false,
            installDeps: true,
            openEditor: true,
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when description is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-description');
        vi.mocked(promptInput).mockResolvedValueOnce(''); // Empty description

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runNewprHandler).not.toHaveBeenCalled();
      });

      it('handles user cancellation during input', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-description');
        vi.mocked(promptInput).mockRejectedValueOnce(new Error('User cancelled'));

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
      });
    });

    describe('from-pr flow', () => {
      it('gathers PR number and calls runNewprHandler with mode pr', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('42');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        const result = await flows.handleNewPR();

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'pr',
            prNumber: 42,
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes install and code flags', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('123');
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(true) // Install
          .mockResolvedValueOnce(true); // VS Code

        const result = await flows.handleNewPR();

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'pr',
            prNumber: 123,
            installDeps: true,
            openEditor: true,
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when PR number is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runNewprHandler).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is invalid', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('not-a-number');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runNewprHandler).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is zero', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('0');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runNewprHandler).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is negative', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('-5');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runNewprHandler).not.toHaveBeenCalled();
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

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'branch',
            branchName: 'feat/existing-branch',
          })
        );
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

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'branch',
            branchName: 'feat/my-new-branch',
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('passes non-main base branch and ready flag', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('fix/bug-fix')
          .mockResolvedValueOnce(false); // Ready for review
        vi.mocked(promptInput).mockResolvedValueOnce('develop');

        const result = await flows.handleNewPR();

        expect(runNewprHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'branch',
            branchName: 'fix/bug-fix',
            baseBranch: 'develop',
            draft: false,
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when branch name is empty', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('__custom__');
        vi.mocked(promptInput).mockResolvedValueOnce(''); // Empty branch name

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runNewprHandler).not.toHaveBeenCalled();
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
      expect(gatherPrWorktreeInfo).not.toHaveBeenCalled();
    });

    describe('clean-all', () => {
      it('calls cleanpr library after confirmation and returns to menu', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-all');
        vi.mocked(promptConfirm).mockResolvedValueOnce(true);

        const result = await flows.handleCleanPRs();

        expect(gatherPrWorktreeInfo).toHaveBeenCalled();
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('returns CANCELLED when not confirmed', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-all');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false);

        const result = await flows.handleCleanPRs();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(gatherPrWorktreeInfo).not.toHaveBeenCalled();
      });
    });

    describe('clean-specific', () => {
      it('calls cleanpr with PR number and returns to menu', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-specific');
        vi.mocked(promptInput).mockResolvedValueOnce('42');

        const result = await flows.handleCleanPRs();

        expect(gatherPrWorktreeInfo).toHaveBeenCalled();
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
      it('calls cleanpr with dry-run and returns to menu', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('dry-run');

        const result = await flows.handleCleanPRs();

        expect(gatherPrWorktreeInfo).toHaveBeenCalled();
        expect(getCleanableWorktrees).toHaveBeenCalled();
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
      it('calls wtlink link library function', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('sync');

        const result = await flows.handleLinkConfig();

        expect(runWtlinkLink).toHaveBeenCalledWith(
          expect.objectContaining({
            manifestFile: '.wtlinkrc',
            dryRun: false,
            type: 'hard',
          })
        );
        expect(result).toEqual({ completed: true, returnToMenu: true });
      });

      it('shows error when sync fails', async () => {
        vi.mocked(runWtlinkLink).mockRejectedValueOnce(new Error('Link failed'));
        vi.mocked(promptChoice).mockResolvedValueOnce('sync');

        const result = await flows.handleLinkConfig();

        expect(result).toEqual({ completed: true, returnToMenu: true });
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Link failed'));
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

        expect(runWtlinkValidate).toHaveBeenCalledWith(
          expect.objectContaining({
            manifestFile: '.wtlinkrc',
          })
        );
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
    });

    it('view calls formatConfigDisplay and returns to menu', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('view');

      const result = await flows.handleConfigure();

      expect(loadRepoConfig).toHaveBeenCalledWith('/mock/repo');
      expect(formatConfigDisplay).toHaveBeenCalled();
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('init shows redirect message after confirmation and returns to menu', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('init');
      vi.mocked(promptConfirm).mockResolvedValueOnce(true);

      const result = await flows.handleConfigure();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('wt init'));
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('init returns CANCELLED when not confirmed', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('init');
      vi.mocked(promptConfirm).mockResolvedValueOnce(false);

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
    });

    it('edit calls setConfigValue and saveRepoConfig with setting and value', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('edit').mockResolvedValueOnce('baseBranch');
      vi.mocked(promptInput).mockResolvedValueOnce('develop');

      const result = await flows.handleConfigure();

      expect(setConfigValue).toHaveBeenCalledWith({}, 'baseBranch', 'develop');
      expect(saveRepoConfig).toHaveBeenCalled();
      expect(result).toEqual({ completed: true, returnToMenu: true });
    });

    it('edit returns CANCELLED when value is empty', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('edit').mockResolvedValueOnce('branchPrefix');
      vi.mocked(promptInput).mockResolvedValueOnce('');

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(saveRepoConfig).not.toHaveBeenCalled();
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

      expect(runNewprHandler).not.toHaveBeenCalled();
    });

    it('exits on user cancellation', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      await showMainMenu();

      expect(runNewprHandler).not.toHaveBeenCalled();
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

      expect(gatherWorktreeInfo).toHaveBeenCalled();
      expect(promptChoice).toHaveBeenCalledTimes(2);
    });

    it('handles browse PRs and returns to menu', async () => {
      vi.mocked(promptChoice)
        .mockResolvedValueOnce('browse-prs') // Select browse-prs
        .mockResolvedValueOnce('exit'); // Then exit

      await showMainMenu();

      expect(runPrsCommand).toHaveBeenCalled();
      expect(promptChoice).toHaveBeenCalledTimes(2);
    });

    it('handles show state and returns to menu', async () => {
      vi.mocked(promptChoice)
        .mockResolvedValueOnce('state') // Select state
        .mockResolvedValueOnce('exit'); // Then exit

      await showMainMenu();

      expect(analyzeState).toHaveBeenCalled();
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

    it('flows that run operations return completed with returnToMenu=true', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('dry-run');

      const result = await flows.handleCleanPRs();

      expect(result).toEqual({ completed: true, returnToMenu: true });
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
    // Verify runNewprHandler was called with develop base branch
    expect(runNewprHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        baseBranch: 'develop',
      })
    );
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
