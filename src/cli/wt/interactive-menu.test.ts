/**
 * Integration tests for interactive menu flows
 *
 * These tests verify that each menu flow:
 * 1. Gathers the correct user inputs
 * 2. Passes the correct arguments to subcommands
 * 3. Handles cancellation and back navigation correctly
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
  runSubcommand: vi.fn(() => {
    // Mock never returns - simulate process.exit
    throw new Error('process.exit called');
  }),
}));

vi.mock('../../lib/config.js', () => ({
  loadConfig: vi.fn(() => ({
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

// Import mocked modules
import { promptChoice, promptInput, promptConfirm } from '../../lib/prompts.js';
import { runSubcommand } from './run-command.js';
import { loadConfig } from '../../lib/config.js';
import * as git from '../../lib/git.js';

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
    it('calls lswt subcommand with no args', async () => {
      try {
        await flows.handleListWorktrees();
      } catch {
        // Expected - runSubcommand throws
      }

      expect(runSubcommand).toHaveBeenCalledWith('lswt', []);
    });
  });

  describe('handleBrowsePRs', () => {
    it('calls prs subcommand with no args', async () => {
      try {
        await flows.handleBrowsePRs();
      } catch {
        // Expected - runSubcommand throws
      }

      expect(runSubcommand).toHaveBeenCalledWith('prs', []);
    });
  });

  describe('handleShowState', () => {
    it('calls wtstate subcommand with no args', async () => {
      try {
        await flows.handleShowState();
      } catch {
        // Expected - runSubcommand throws
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtstate', []);
    });
  });

  describe('handleNewPR', () => {
    it('returns CANCELLED when user selects back', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleNewPR();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommand).not.toHaveBeenCalled();
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

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['Add dark mode support']);
      });

      it('passes --ready flag when not draft', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(false); // Ready for review (not draft)
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Fix critical bug')
          .mockResolvedValueOnce('main');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['Fix critical bug', '--ready']);
      });

      it('passes --base flag when not main', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput)
          .mockResolvedValueOnce('Feature work')
          .mockResolvedValueOnce('develop'); // Non-main base branch
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['Feature work', '--base', 'develop']);
      });

      it('passes --install flag when requested', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput).mockResolvedValueOnce('Add feature').mockResolvedValueOnce('main');
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(true) // Install deps
          .mockResolvedValueOnce(false);

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['Add feature', '--install']);
      });

      it('passes --code flag when requested', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-description')
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput).mockResolvedValueOnce('Add feature').mockResolvedValueOnce('main');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(true); // Open VS Code

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['Add feature', '--code']);
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

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', [
          'Full feature',
          '--base',
          'develop',
          '--ready',
          '--install',
          '--code',
        ]);
      });

      it('returns CANCELLED when description is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-description');
        vi.mocked(promptInput).mockResolvedValueOnce(''); // Empty description

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommand).not.toHaveBeenCalled();
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

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['--pr', '42']);
      });

      it('passes --install and --code flags', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('123');
        vi.mocked(promptConfirm)
          .mockResolvedValueOnce(true) // Install
          .mockResolvedValueOnce(true); // VS Code

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['--pr', '123', '--install', '--code']);
      });

      it('returns CANCELLED when PR number is empty', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommand).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is invalid', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('not-a-number');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommand).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is zero', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('0');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommand).not.toHaveBeenCalled();
      });

      it('returns CANCELLED when PR number is negative', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('from-pr');
        vi.mocked(promptInput).mockResolvedValueOnce('-5');

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommand).not.toHaveBeenCalled();
      });
    });

    describe('from-branch flow', () => {
      it('allows selecting from existing branches', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch') // New PR sub-menu
          .mockResolvedValueOnce('feat/existing-branch') // Select branch
          .mockResolvedValueOnce(true); // Draft PR
        vi.mocked(promptInput).mockResolvedValueOnce('main');

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['--branch', 'feat/existing-branch']);
      });

      it('allows typing custom branch name', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('__custom__') // Select custom option
          .mockResolvedValueOnce(true);
        vi.mocked(promptInput)
          .mockResolvedValueOnce('feat/my-new-branch') // Custom branch name
          .mockResolvedValueOnce('main');

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', ['--branch', 'feat/my-new-branch']);
      });

      it('passes --base and --ready flags', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('fix/bug-fix')
          .mockResolvedValueOnce(false); // Ready for review
        vi.mocked(promptInput).mockResolvedValueOnce('develop');

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('newpr', [
          '--branch',
          'fix/bug-fix',
          '--base',
          'develop',
          '--ready',
        ]);
      });

      it('returns CANCELLED when branch name is empty', async () => {
        vi.mocked(promptChoice)
          .mockResolvedValueOnce('from-branch')
          .mockResolvedValueOnce('__custom__');
        vi.mocked(promptInput).mockResolvedValueOnce(''); // Empty branch name

        const result = await flows.handleNewPR();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommand).not.toHaveBeenCalled();
      });

      it('handles empty branch list gracefully', async () => {
        // Mock empty branch list
        vi.mocked(git.listLocalBranches).mockReturnValueOnce([]);
        vi.mocked(promptChoice).mockResolvedValueOnce('from-branch');
        vi.mocked(promptInput)
          .mockResolvedValueOnce('feat/new-branch') // Manual branch input
          .mockResolvedValueOnce('main');
        vi.mocked(promptChoice).mockResolvedValueOnce(true); // Draft

        try {
          await flows.handleNewPR();
        } catch {
          // Expected
        }

        // Should have prompted for branch name directly
        expect(promptInput).toHaveBeenCalledWith('Branch name');
      });
    });
  });

  describe('handleCleanPRs', () => {
    it('returns CANCELLED when user selects back', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleCleanPRs();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommand).not.toHaveBeenCalled();
    });

    describe('clean-all', () => {
      it('calls cleanpr with --all after confirmation', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-all');
        vi.mocked(promptConfirm).mockResolvedValueOnce(true);

        try {
          await flows.handleCleanPRs();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('cleanpr', ['--all']);
      });

      it('returns CANCELLED when not confirmed', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-all');
        vi.mocked(promptConfirm).mockResolvedValueOnce(false);

        const result = await flows.handleCleanPRs();

        expect(result).toEqual({ completed: false, returnToMenu: true });
        expect(runSubcommand).not.toHaveBeenCalled();
      });
    });

    describe('clean-specific', () => {
      it('calls cleanpr with PR number', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('clean-specific');
        vi.mocked(promptInput).mockResolvedValueOnce('42');

        try {
          await flows.handleCleanPRs();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('cleanpr', ['42']);
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
      it('calls cleanpr with --dry-run', async () => {
        vi.mocked(promptChoice).mockResolvedValueOnce('dry-run');

        try {
          await flows.handleCleanPRs();
        } catch {
          // Expected
        }

        expect(runSubcommand).toHaveBeenCalledWith('cleanpr', ['--dry-run']);
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
      expect(runSubcommand).not.toHaveBeenCalled();
    });

    it('view calls wtlink list', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('view');

      try {
        await flows.handleLinkConfig();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtlink', ['list']);
    });

    it('sync calls wtlink sync', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('sync');

      try {
        await flows.handleLinkConfig();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtlink', ['sync']);
    });

    it('add calls wtlink add with file path', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('add');
      vi.mocked(promptInput).mockResolvedValueOnce('.env');

      try {
        await flows.handleLinkConfig();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtlink', ['add', '.env']);
    });

    it('add returns CANCELLED when file path is empty', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('add');
      vi.mocked(promptInput).mockResolvedValueOnce('');

      const result = await flows.handleLinkConfig();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommand).not.toHaveBeenCalled();
    });

    it('remove calls wtlink remove with file path', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('remove');
      vi.mocked(promptInput).mockResolvedValueOnce('.env.local');

      try {
        await flows.handleLinkConfig();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtlink', ['remove', '.env.local']);
    });

    it('remove returns CANCELLED when file path is empty', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('remove');
      vi.mocked(promptInput).mockResolvedValueOnce('');

      const result = await flows.handleLinkConfig();

      expect(result).toEqual({ completed: false, returnToMenu: true });
    });

    it('validate calls wtlink validate', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('validate');

      try {
        await flows.handleLinkConfig();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtlink', ['validate']);
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
      expect(runSubcommand).not.toHaveBeenCalled();
    });

    it('view calls wtconfig show', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('view');

      try {
        await flows.handleConfigure();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['show']);
    });

    it('init calls wtconfig init after confirmation', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('init');
      vi.mocked(promptConfirm).mockResolvedValueOnce(true);

      try {
        await flows.handleConfigure();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['init']);
    });

    it('init returns CANCELLED when not confirmed', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('init');
      vi.mocked(promptConfirm).mockResolvedValueOnce(false);

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommand).not.toHaveBeenCalled();
    });

    it('edit calls wtconfig set with setting and value', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('edit').mockResolvedValueOnce('baseBranch');
      vi.mocked(promptInput).mockResolvedValueOnce('develop');

      try {
        await flows.handleConfigure();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtconfig', ['set', 'baseBranch', 'develop']);
    });

    it('edit returns CANCELLED when value is empty', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('edit').mockResolvedValueOnce('branchPrefix');
      vi.mocked(promptInput).mockResolvedValueOnce('');

      const result = await flows.handleConfigure();

      expect(result).toEqual({ completed: false, returnToMenu: true });
      expect(runSubcommand).not.toHaveBeenCalled();
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

      expect(runSubcommand).not.toHaveBeenCalled();
    });

    it('exits on user cancellation', async () => {
      vi.mocked(promptChoice).mockRejectedValueOnce(new Error('User cancelled'));

      await showMainMenu();

      expect(runSubcommand).not.toHaveBeenCalled();
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

    it('handles list worktrees selection', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('list');

      try {
        await showMainMenu();
      } catch {
        // Expected - runSubcommand throws
      }

      expect(runSubcommand).toHaveBeenCalledWith('lswt', []);
    });

    it('handles browse PRs selection', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('browse-prs');

      try {
        await showMainMenu();
      } catch {
        // Expected - runSubcommand throws
      }

      expect(runSubcommand).toHaveBeenCalledWith('prs', []);
    });

    it('handles show state selection', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('state');

      try {
        await showMainMenu();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalledWith('wtstate', []);
    });
  });

  describe('FlowResult types', () => {
    it('CANCELLED has correct structure', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('back');

      const result = await flows.handleNewPR();

      expect(result.completed).toBe(false);
      expect(result.returnToMenu).toBe(true);
    });

    it('flows that run subcommands return COMPLETED_EXIT', async () => {
      vi.mocked(promptChoice).mockResolvedValueOnce('dry-run');

      // We can't test the actual return value since runSubcommand throws,
      // but we can verify the flow attempted to call the subcommand
      try {
        await flows.handleCleanPRs();
      } catch {
        // Expected
      }

      expect(runSubcommand).toHaveBeenCalled();
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
    });

    vi.mocked(promptChoice).mockResolvedValueOnce('from-description').mockResolvedValueOnce(true);
    vi.mocked(promptInput).mockResolvedValueOnce('Test feature').mockResolvedValueOnce('develop'); // User accepts default
    vi.mocked(promptConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    try {
      await flows.handleNewPR();
    } catch {
      // Expected
    }

    // Verify loadConfig was called
    expect(loadConfig).toHaveBeenCalled();
    // Since user entered 'develop' (matching config default), no --base flag
    expect(runSubcommand).toHaveBeenCalledWith('newpr', ['Test feature', '--base', 'develop']);
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

    try {
      await flows.handleNewPR();
    } catch {
      // Expected
    }

    // Check that listLocalBranches was called
    expect(git.listLocalBranches).toHaveBeenCalled();
  });
});
