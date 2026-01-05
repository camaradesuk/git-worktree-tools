/**
 * Unit tests for wt init command functions
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

// Helper to create valid yargs argv for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createArgv(args: { local?: boolean; global?: boolean; force?: boolean }): any {
  return {
    _: [],
    $0: 'wt',
    ...args,
  };
}

// Mock dependencies before importing the module
vi.mock('../../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../../lib/colors.js', () => ({
  error: vi.fn((s: string) => s),
  dim: vi.fn((s: string) => s),
  success: vi.fn((s: string) => s),
  info: vi.fn((s: string) => s),
  bold: vi.fn((s: string) => s),
  warning: vi.fn((s: string) => s),
}));

vi.mock('../../lib/global-config.js', () => ({
  initializeLocalConfig: vi.fn(() => ({
    configPath: '/repo/.worktreerc.local',
    gitignoreUpdated: true,
  })),
  saveGlobalConfig: vi.fn(),
  getConfigSummary: vi.fn(() => ({
    global: false,
    repo: false,
    local: false,
    paths: {
      global: {
        path: '/home/user/.config/git-worktree-tools/config.json',
        level: 'global',
        exists: false,
      },
      repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
      local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
    },
  })),
  ensureLocalConfigInGitignore: vi.fn(() => true),
  getGlobalConfigPath: vi.fn(() => '/home/user/.config/git-worktree-tools/config.json'),
}));

vi.mock('../../lib/prompts.js', () => ({
  promptChoice: vi.fn(() => 'cancel'),
  promptConfirm: vi.fn(() => false),
  promptInput: vi.fn(() => 'main'),
}));

import { initCommand } from './init.js';
import * as git from '../../lib/git.js';
import * as globalConfig from '../../lib/global-config.js';
import * as prompts from '../../lib/prompts.js';

describe('wt init command', () => {
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
    it('has correct command name', () => {
      expect(initCommand.command).toBe('init');
    });

    it('has description', () => {
      expect(initCommand.describe).toBeDefined();
      expect(initCommand.describe).toContain('Initialize');
    });

    it('has handler function', () => {
      expect(typeof initCommand.handler).toBe('function');
    });

    it('builder configures options', () => {
      const mockYargs = {
        option: vi.fn().mockReturnThis(),
        example: vi.fn().mockReturnThis(),
      };

      if (typeof initCommand.builder === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initCommand.builder(mockYargs as any);
      }

      expect(mockYargs.option).toHaveBeenCalledWith('local', expect.any(Object));
      expect(mockYargs.option).toHaveBeenCalledWith('global', expect.any(Object));
      expect(mockYargs.option).toHaveBeenCalledWith('force', expect.any(Object));
    });
  });

  describe('handler - --local flag', () => {
    it('creates local config when in git repo', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptConfirm as Mock).mockResolvedValue(false);

      await initCommand.handler(createArgv({ local: true, global: false, force: false }));

      expect(globalConfig.initializeLocalConfig).toHaveBeenCalledWith('/repo', expect.any(Object));
    });

    it('includes logging config when user confirms', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptConfirm as Mock).mockResolvedValue(true);
      (prompts.promptChoice as Mock).mockResolvedValue('debug');

      await initCommand.handler(createArgv({ local: true, global: false, force: false }));

      expect(globalConfig.initializeLocalConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          logging: { level: 'debug' },
        })
      );
    });

    it('exits with error when not in git repo', async () => {
      (git.getRepoRoot as Mock).mockImplementation(() => {
        throw new Error('Not a git repo');
      });

      await initCommand.handler(createArgv({ local: true, global: false, force: false }));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Not in a git repository.');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('warns when local config already exists without --force', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: true,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: true },
        },
      });

      await initCommand.handler(createArgv({ local: true, global: false, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
      expect(globalConfig.initializeLocalConfig).not.toHaveBeenCalled();
    });

    it('overwrites when --force is provided', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: true,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: true },
        },
      });
      (prompts.promptConfirm as Mock).mockResolvedValue(false);

      await initCommand.handler(createArgv({ local: true, global: false, force: true }));

      expect(globalConfig.initializeLocalConfig).toHaveBeenCalled();
    });

    it('shows success message after creation', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptConfirm as Mock).mockResolvedValue(false);
      // Ensure config summary shows no local config exists
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: false,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
        },
      });

      await initCommand.handler(createArgv({ local: true, global: false, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Created local config'));
    });

    it('shows gitignore update message when updated', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptConfirm as Mock).mockResolvedValue(false);
      // Ensure config summary shows no local config exists
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: false,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
        },
      });
      (globalConfig.initializeLocalConfig as Mock).mockReturnValue({
        configPath: '/repo/.worktreerc.local',
        gitignoreUpdated: true,
      });

      await initCommand.handler(createArgv({ local: true, global: false, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('gitignore'));
    });
  });

  describe('handler - --global flag', () => {
    it('creates global config', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptConfirm as Mock).mockResolvedValue(true);
      (prompts.promptInput as Mock).mockResolvedValue('main');
      (prompts.promptChoice as Mock).mockResolvedValue('vscode');

      await initCommand.handler(createArgv({ local: false, global: true, force: false }));

      expect(globalConfig.saveGlobalConfig).toHaveBeenCalled();
    });

    it('warns when global config already exists without --force', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: true,
        repo: false,
        local: false,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: true,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
        },
      });

      await initCommand.handler(createArgv({ local: false, global: true, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
      expect(globalConfig.saveGlobalConfig).not.toHaveBeenCalled();
    });

    it('includes warnNotGlobal setting based on prompt', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      // Ensure global config doesn't exist
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: false,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
        },
      });
      (prompts.promptConfirm as Mock).mockResolvedValue(true);
      (prompts.promptInput as Mock).mockResolvedValue('main');
      (prompts.promptChoice as Mock).mockResolvedValue('vscode');

      await initCommand.handler(createArgv({ local: false, global: true, force: false }));

      expect(globalConfig.saveGlobalConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          global: { warnNotGlobal: true },
        })
      );
    });

    it('includes preferredEditor when not vscode', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      // Ensure global config doesn't exist
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: false,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
        },
      });
      (prompts.promptConfirm as Mock).mockResolvedValue(true);
      (prompts.promptInput as Mock).mockResolvedValue('main');
      (prompts.promptChoice as Mock).mockResolvedValue('cursor');

      await initCommand.handler(createArgv({ local: false, global: true, force: false }));

      expect(globalConfig.saveGlobalConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredEditor: 'cursor',
        })
      );
    });

    it('includes baseBranch when not main', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      // Ensure global config doesn't exist
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: false,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: false },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: false },
        },
      });
      (prompts.promptConfirm as Mock).mockResolvedValue(true);
      (prompts.promptInput as Mock).mockResolvedValue('develop');
      (prompts.promptChoice as Mock).mockResolvedValue('vscode');

      await initCommand.handler(createArgv({ local: false, global: true, force: false }));

      expect(globalConfig.saveGlobalConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          baseBranch: 'develop',
        })
      );
    });
  });

  describe('handler - interactive mode (no flags)', () => {
    it('shows interactive menu when no flags specified', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptChoice as Mock).mockResolvedValue('cancel');

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(prompts.promptChoice).toHaveBeenCalled();
    });

    it('handles global choice in interactive mode', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptChoice as Mock)
        .mockResolvedValueOnce('global')
        .mockResolvedValueOnce('vscode');
      (prompts.promptConfirm as Mock).mockResolvedValue(true);
      (prompts.promptInput as Mock).mockResolvedValue('main');

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(globalConfig.saveGlobalConfig).toHaveBeenCalled();
    });

    it('handles local choice in interactive mode', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptChoice as Mock).mockResolvedValueOnce('local');
      (prompts.promptConfirm as Mock).mockResolvedValue(false);

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(globalConfig.initializeLocalConfig).toHaveBeenCalled();
    });

    it('handles gitignore choice in interactive mode', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: true,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: null,
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: true },
        },
      });
      (prompts.promptChoice as Mock).mockResolvedValueOnce('gitignore');

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(globalConfig.ensureLocalConfigInGitignore).toHaveBeenCalledWith('/repo');
    });

    it('handles cancel choice in interactive mode', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (prompts.promptChoice as Mock).mockResolvedValue('cancel');

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
    });

    it('shows all set message when configs already exist', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: true,
        repo: true,
        local: true,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: true,
          },
          repo: { path: '/repo/.worktreerc', level: 'repo', exists: true },
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: true },
        },
      });

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('already set up'));
    });

    it('shows status when not in git repo', async () => {
      (git.getRepoRoot as Mock).mockImplementation(() => {
        throw new Error('Not a git repo');
      });
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: null,
        local: null,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: null,
          local: null,
        },
      });
      (prompts.promptChoice as Mock).mockResolvedValue('cancel');

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Not in a git repository')
      );
    });

    it('shows gitignore no changes message when already up to date', async () => {
      (git.getRepoRoot as Mock).mockReturnValue('/repo');
      (globalConfig.getConfigSummary as Mock).mockReturnValue({
        global: false,
        repo: false,
        local: true,
        paths: {
          global: {
            path: '/home/user/.config/git-worktree-tools/config.json',
            level: 'global',
            exists: false,
          },
          repo: null,
          local: { path: '/repo/.worktreerc.local', level: 'local', exists: true },
        },
      });
      (prompts.promptChoice as Mock).mockResolvedValueOnce('gitignore');
      (globalConfig.ensureLocalConfigInGitignore as Mock).mockReturnValue(false);

      await initCommand.handler(createArgv({ local: false, global: false, force: false }));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No changes needed'));
    });
  });
});
