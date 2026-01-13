/**
 * wtconfig CLI Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing
vi.mock('inquirer');
vi.mock('child_process');
vi.mock('../lib/git.js');
vi.mock('../lib/config.js');
vi.mock('../lib/wtconfig/index.js');

import inquirer from 'inquirer';
import { execSync } from 'child_process';
import * as git from '../lib/git.js';
import { getDefaultConfig } from '../lib/config.js';
import * as wtconfig from '../lib/wtconfig/index.js';
import type { WorktreeConfig } from '../lib/config.js';

describe('cli/wtconfig', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockConsoleWarn: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];

  const mockConfig: WorktreeConfig = {
    configVersion: 1,
    baseBranch: 'main',
    draftPr: false,
    branchPrefix: 'feat',
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    wtlink: { enabled: [], disabled: [] },
  };

  const mockDefaultConfig = {
    configVersion: 1,
    baseBranch: 'main',
    draftPr: false,
    branchPrefix: 'feat',
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    sharedRepos: [] as string[],
    syncPatterns: [] as string[],
    preferredEditor: 'auto' as const,
    previewLabel: 'preview',
    plugins: [] as string[],
    generators: {},
    integrations: {},
    ai: {
      provider: 'none' as const,
      branchName: false,
      prTitle: false,
      prDescription: false,
    },
    hooks: {},
    hookDefaults: { timeout: 30000, maxTimeout: 60000 },
    logging: { level: 'info' as const, timestamps: true },
    global: { warnNotGlobal: true },
    wtlink: { enabled: [], disabled: [] },
    linkConfigFiles: undefined,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // @ts-expect-error - process.exit mock type is complex
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    originalArgv = process.argv;

    // Setup default mocks
    vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
    vi.mocked(getDefaultConfig).mockReturnValue(mockDefaultConfig);
    vi.mocked(wtconfig.loadMergedConfig).mockReturnValue(mockConfig);
    vi.mocked(wtconfig.getConfigSource).mockReturnValue({
      type: 'repository',
      path: '/repo/.worktreerc',
    });
    vi.mocked(wtconfig.formatConfigDisplay).mockReturnValue('formatted config');
    vi.mocked(wtconfig.validateConfig).mockReturnValue({ valid: true, errors: [], warnings: [] });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
    mockProcessExit.mockRestore();
    process.argv = originalArgv;
  });

  async function runCli(args: string[] = []): Promise<void> {
    process.argv = ['node', 'wtconfig', ...args];
    // Re-import to trigger CLI execution
    await import('./wtconfig.js');
    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  describe('show command', () => {
    it('shows current configuration with source', async () => {
      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Current Configuration'));
    });

    it('shows default message when no config exists', async () => {
      vi.mocked(wtconfig.getConfigSource).mockReturnValue({ type: 'none', path: null });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No configuration file found')
      );
    });

    it('shows config source path when config exists', async () => {
      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Source:'));
    });
  });

  describe('get command', () => {
    it('displays error when no key provided', async () => {
      await runCli(['get']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Usage: wtconfig get <key>')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('returns value for valid key', async () => {
      vi.mocked(wtconfig.getConfigValue).mockReturnValueOnce('develop');

      await runCli(['get', 'baseBranch']);

      expect(mockConsoleLog).toHaveBeenCalledWith('develop');
    });

    it('returns default value when key not in user config', async () => {
      vi.mocked(wtconfig.getConfigValue).mockReturnValueOnce(undefined).mockReturnValueOnce('feat');

      await runCli(['get', 'branchPrefix']);

      expect(mockConsoleLog).toHaveBeenCalledWith('feat');
    });

    it('displays error for unknown key', async () => {
      vi.mocked(wtconfig.getConfigValue).mockReturnValue(undefined);

      await runCli(['get', 'unknownKey']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Unknown configuration key')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON for object values', async () => {
      vi.mocked(wtconfig.getConfigValue).mockReturnValueOnce({
        provider: 'claude',
        branchName: true,
      });

      await runCli(['get', 'ai']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"provider"'));
    });
  });

  describe('set command', () => {
    beforeEach(() => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ saveLocation: 'repo' });
      vi.mocked(wtconfig.loadRepoConfig).mockReturnValue({});
      vi.mocked(wtconfig.setConfigValue).mockReturnValue({ baseBranch: 'develop' });
    });

    it('displays error when no key provided', async () => {
      await runCli(['set']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Usage: wtconfig set <key> <value>')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('displays error when no value provided', async () => {
      await runCli(['set', 'baseBranch']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Missing value for key')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('prompts for save location and saves to repo', async () => {
      await runCli(['set', 'baseBranch', 'develop']);

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith('/repo', expect.any(Object));
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Set baseBranch = develop')
      );
    });

    it('saves to global config when selected', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ saveLocation: 'global' });
      vi.mocked(wtconfig.loadGlobalConfig).mockReturnValue({});

      await runCli(['set', 'baseBranch', 'develop']);

      expect(wtconfig.saveGlobalConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('~/.worktreerc'));
    });

    it('shows validation errors and exits', async () => {
      vi.mocked(wtconfig.validateConfig).mockReturnValue({
        valid: false,
        errors: [{ path: 'baseBranch', message: 'Invalid value' }],
        warnings: [],
      });

      await runCli(['set', 'baseBranch', 'invalid']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('validation failed'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('shows validation warnings', async () => {
      vi.mocked(wtconfig.validateConfig).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [{ path: 'ai.provider', message: 'Experimental feature' }],
      });

      await runCli(['set', 'ai.provider', 'claude']);

      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Warning'));
    });
  });

  describe('validate command', () => {
    it('shows success when no config exists', async () => {
      vi.mocked(wtconfig.getConfigSource).mockReturnValue({ type: 'none', path: null });

      await runCli(['validate']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No configuration file found')
      );
    });

    it('shows success for valid config', async () => {
      await runCli(['validate']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Configuration is valid')
      );
    });

    it('shows validation source path', async () => {
      await runCli(['validate']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Validating:'));
    });

    it('shows errors and exits for invalid config', async () => {
      vi.mocked(wtconfig.validateConfig).mockReturnValue({
        valid: false,
        errors: [
          { path: 'baseBranch', message: 'Invalid branch name' },
          { path: 'ai.provider', message: 'Unknown provider' },
        ],
        warnings: [],
      });

      await runCli(['validate']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Errors:'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('shows warnings for valid config with warnings', async () => {
      vi.mocked(wtconfig.validateConfig).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [{ path: 'sharedRepos', message: 'Repo not found' }],
      });

      await runCli(['validate']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Warnings:'));
    });

    it('shows both errors and warnings', async () => {
      vi.mocked(wtconfig.validateConfig).mockReturnValue({
        valid: false,
        errors: [{ path: 'baseBranch', message: 'Invalid' }],
        warnings: [{ path: 'ai.provider', message: 'Deprecated' }],
      });

      await runCli(['validate']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Errors:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Warnings:'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('help command', () => {
    it('shows help text for help command', async () => {
      await runCli(['help']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('wtconfig'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('shows help text for --help flag', async () => {
      await runCli(['--help']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('shows help text for -h flag', async () => {
      await runCli(['-h']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });
  });

  describe('unknown command', () => {
    it('shows error and help for unknown command', async () => {
      await runCli(['unknown']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('handles git repo not found gracefully', async () => {
      vi.mocked(git.getRepoRoot).mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      vi.mocked(wtconfig.getConfigSource).mockReturnValue({
        type: 'global',
        path: '/home/user/.worktreerc',
      });

      await runCli(['show']);

      // Should still show config (from global)
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Current Configuration'));
    });
  });

  describe('edit command', () => {
    beforeEach(() => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ editLocation: 'repo' });
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
    });

    it('prompts for location when editing', async () => {
      // Mock fs.existsSync for the dynamic import
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(true),
      }));

      vi.mocked(execSync).mockImplementation(() => Buffer.from(''));

      await runCli(['edit']);

      expect(inquirer.prompt).toHaveBeenCalled();
    });
  });

  describe('init/wizard command', () => {
    const mockEnv = {
      os: 'linux' as const,
      git: { version: '2.30.0', configured: true, user: 'testuser', email: 'test@example.com' },
      github: { installed: true, authenticated: true, user: 'testuser' },
      ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: false },
      packageManager: 'npm' as const,
      ide: { vscode: true, cursor: false },
    };

    beforeEach(() => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue(mockEnv);
      vi.mocked(wtconfig.detectDefaultBranch).mockReturnValue('main');
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
      vi.mocked(wtconfig.getInstallCommand).mockReturnValue('npm install');
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue('code');
    });

    it('displays wizard header and detects environment', async () => {
      // Mock all wizard prompts in sequence (Step 1 has 3 questions in one call)
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: ['autoDeps'] })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Setup Wizard'));
      expect(wtconfig.detectEnvironment).toHaveBeenCalled();
    });

    it('runs wizard command alias', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['wizard']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Setup Wizard'));
    });

    it('displays environment detection message', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Detecting'));
    });
  });

  describe('show command with config values', () => {
    it('shows AI config when present', async () => {
      vi.mocked(wtconfig.loadMergedConfig).mockReturnValue({
        ...mockConfig,
        ai: { provider: 'claude', branchName: true, prTitle: false, prDescription: false },
      });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('shows hooks config when present', async () => {
      vi.mocked(wtconfig.loadMergedConfig).mockReturnValue({
        ...mockConfig,
        hooks: { 'post-worktree': 'npm install' },
      });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('shows plugins when present', async () => {
      vi.mocked(wtconfig.loadMergedConfig).mockReturnValue({
        ...mockConfig,
        plugins: ['@worktree/plugin-linear'],
      });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('shows generators when present', async () => {
      vi.mocked(wtconfig.loadMergedConfig).mockReturnValue({
        ...mockConfig,
        generators: { branchName: './scripts/gen.js' },
      });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('shows integrations when present', async () => {
      vi.mocked(wtconfig.loadMergedConfig).mockReturnValue({
        ...mockConfig,
        integrations: { linear: { teamId: 'ENG' } },
      });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('shows sharedRepos when present', async () => {
      vi.mocked(wtconfig.loadMergedConfig).mockReturnValue({
        ...mockConfig,
        sharedRepos: ['other-repo'],
      });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('shows syncPatterns when present', async () => {
      vi.mocked(wtconfig.loadMergedConfig).mockReturnValue({
        ...mockConfig,
        syncPatterns: ['*.env'],
      });

      await runCli(['show']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe('displayEnvironment scenarios', () => {
    const mockEnvBase = {
      os: 'linux' as const,
      git: { version: '2.30.0', configured: true, user: 'testuser', email: 'test@example.com' },
      github: { installed: true, authenticated: true, user: 'testuser' },
      ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: false },
      packageManager: 'npm' as const,
      ide: { vscode: true, cursor: false },
    };

    beforeEach(() => {
      vi.mocked(wtconfig.detectDefaultBranch).mockReturnValue('main');
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
      vi.mocked(wtconfig.getInstallCommand).mockReturnValue('npm install');
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue('code');
    });

    it('displays git not found message', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        git: { version: null, configured: false, user: null, email: null },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Git not found'));
    });

    it('displays git not configured warning', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        git: { version: '2.30.0', configured: false, user: null, email: null },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('not configured'));
    });

    it('displays GitHub CLI not installed', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        github: { installed: false, authenticated: false, user: null },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('GitHub CLI not installed')
      );
    });

    it('displays GitHub CLI not authenticated', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        github: { installed: true, authenticated: false, user: null },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('not authenticated'));
    });

    it('displays detected AI tools', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: true, geminiCLI: true, ollama: false, codexCLI: false },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ aiChoice: 'no' })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('AI tools'));
    });

    it('displays no AI tools message', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: false },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No AI tools detected'));
    });

    it('displays no package manager', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        packageManager: null,
      });
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue(null);

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      // No package manager means no autoDeps hook available
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Detecting'));
    });

    it('displays both IDEs when present', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ide: { vscode: true, cursor: true },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('IDE'));
    });

    it('displays no IDEs message when none present', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ide: { vscode: false, cursor: false },
      });
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue(null);

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe('wizard step paths', () => {
    const mockEnvBase = {
      os: 'linux' as const,
      git: { version: '2.30.0', configured: true, user: 'testuser', email: 'test@example.com' },
      github: { installed: true, authenticated: true, user: 'testuser' },
      ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: false },
      packageManager: 'npm' as const,
      ide: { vscode: true, cursor: false },
    };

    beforeEach(() => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue(mockEnvBase);
      vi.mocked(wtconfig.detectDefaultBranch).mockReturnValue('main');
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
      vi.mocked(wtconfig.getInstallCommand).mockReturnValue('npm install');
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue('code');
    });

    it('handles custom base branch input', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: '__other__', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({ customBranch: 'my-branch' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('handles inside worktree location', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({ worktreeLocation: 'inside', worktreePattern: '{repo}.pr{number}' })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('handles custom worktree location', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({ worktreeLocation: 'custom', worktreePattern: '{repo}.pr{number}' })
        .mockResolvedValueOnce({ customParent: '/custom/path' })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('handles AI configuration with detected Claude', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: true, geminiCLI: false, ollama: false, codexCLI: false },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ aiChoice: 'yes' })
        .mockResolvedValueOnce({ aiFeatures: ['branchName', 'prDescription'] })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      // Claude Code is shown in environment display as "AI tools: Claude Code"
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Claude Code'));
    });

    it('handles AI configuration with detected Gemini', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: false, geminiCLI: true, ollama: false, codexCLI: false },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ aiChoice: 'yes' })
        .mockResolvedValueOnce({ aiFeatures: [] })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      // Gemini CLI is shown in environment display as "AI tools: Gemini CLI"
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Gemini CLI'));
    });

    it('handles AI configuration with detected Ollama', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: false, geminiCLI: false, ollama: true, codexCLI: false },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ aiChoice: 'yes' })
        .mockResolvedValueOnce({ aiFeatures: [] })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      // Ollama is shown in environment display as "AI tools: Ollama"
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Ollama'));
    });

    it('handles AI configuration with detected OpenAI', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: true },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ aiChoice: 'yes' })
        .mockResolvedValueOnce({ aiFeatures: [] })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      // Codex CLI is shown in environment display as "AI tools: Codex CLI"
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Codex CLI'));
    });

    it('handles manual AI provider configuration', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: true, geminiCLI: false, ollama: false, codexCLI: false },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ aiChoice: 'configure' })
        .mockResolvedValueOnce({ manualProvider: 'gemini' })
        .mockResolvedValueOnce({ aiFeatures: ['branchName'] })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('handles hooks with both IDEs detected and editor preference', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ide: { vscode: true, cursor: true },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: ['autoDeps', 'openEditor'] })
        .mockResolvedValueOnce({ editorChoice: 'cursor' })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('handles hooks with cursor only', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ide: { vscode: false, cursor: true },
      });
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue('cursor');

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: ['openEditor'] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });

    it('saves configuration to repository', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: true, branchPrefix: 'fix' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Configuration saved'));
    });

    it('saves configuration globally', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'global' });

      await runCli(['init']);

      expect(wtconfig.saveGlobalConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Configuration saved'));
    });

    it('displays quick start after saving', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Quick Start'));
    });
  });

  describe('advanced configuration', () => {
    const mockEnvBase = {
      os: 'linux' as const,
      git: { version: '2.30.0', configured: true, user: 'testuser', email: 'test@example.com' },
      github: { installed: true, authenticated: true, user: 'testuser' },
      ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: false },
      packageManager: 'npm' as const,
      ide: { vscode: true, cursor: false },
    };

    beforeEach(() => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue(mockEnvBase);
      vi.mocked(wtconfig.detectDefaultBranch).mockReturnValue('main');
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
      vi.mocked(wtconfig.getInstallCommand).mockReturnValue('npm install');
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue('code');
    });

    it('configures plugins', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: true })
        .mockResolvedValueOnce({ pluginList: 'plugin1, plugin2' })
        .mockResolvedValueOnce({ useGenerators: false })
        .mockResolvedValueOnce({ integrationsToAdd: [] })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Advanced Configuration')
      );
    });

    it('configures custom generators', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: false })
        .mockResolvedValueOnce({ useGenerators: true })
        .mockResolvedValueOnce({
          branchNameGen: './scripts/branch.js',
          prTitleGen: './scripts/title.js',
          prDescGen: '',
          commitMsgGen: './scripts/commit.js',
        })
        .mockResolvedValueOnce({ integrationsToAdd: [] })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Advanced Configuration')
      );
    });

    it('configures Linear integration', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: false })
        .mockResolvedValueOnce({ useGenerators: false })
        .mockResolvedValueOnce({ integrationsToAdd: ['linear'] })
        .mockResolvedValueOnce({ teamId: 'ENG', apiKeyEnv: 'LINEAR_API_KEY' })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Advanced Configuration')
      );
    });

    it('configures Jira integration', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: false })
        .mockResolvedValueOnce({ useGenerators: false })
        .mockResolvedValueOnce({ integrationsToAdd: ['jira'] })
        .mockResolvedValueOnce({
          projectKey: 'PROJ',
          baseUrl: 'https://jira.example.com',
          apiTokenEnv: 'JIRA_TOKEN',
        })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Advanced Configuration')
      );
    });

    it('configures Slack integration', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: false })
        .mockResolvedValueOnce({ useGenerators: false })
        .mockResolvedValueOnce({ integrationsToAdd: ['slack'] })
        .mockResolvedValueOnce({ webhookUrl: 'SLACK_WEBHOOK_URL', channel: '#releases' })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Advanced Configuration')
      );
    });

    it('configures all integrations', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: false })
        .mockResolvedValueOnce({ useGenerators: false })
        .mockResolvedValueOnce({ integrationsToAdd: ['linear', 'jira', 'slack'] })
        .mockResolvedValueOnce({ teamId: '', apiKeyEnv: '' })
        .mockResolvedValueOnce({ projectKey: '', baseUrl: '', apiTokenEnv: '' })
        .mockResolvedValueOnce({ webhookUrl: '', channel: '' })
        .mockResolvedValueOnce({ saveChoice: 'cancel' });

      await runCli(['init']);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Advanced Configuration')
      );
    });
  });

  describe('edit command edge cases', () => {
    beforeEach(() => {
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
    });

    it('edits global config when not in repo', async () => {
      vi.mocked(git.getRepoRoot).mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ editLocation: 'global' });

      // Mock fs for the dynamic import
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(true),
        writeFileSync: vi.fn(),
      }));
      vi.mocked(execSync).mockImplementation(() => Buffer.from(''));

      await runCli(['edit']);

      expect(inquirer.prompt).toHaveBeenCalled();
    });

    it('cancels file creation when user declines', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ editLocation: 'repo' })
        .mockResolvedValueOnce({ create: false });

      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(false),
        writeFileSync: vi.fn(),
      }));

      await runCli(['edit']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
    });

    it('creates new config file when user confirms', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ editLocation: 'repo' })
        .mockResolvedValueOnce({ create: true });

      const mockWriteFileSync = vi.fn();
      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(false),
        writeFileSync: mockWriteFileSync,
      }));
      vi.mocked(execSync).mockImplementation(() => Buffer.from(''));

      await runCli(['edit']);

      // Config file should be created
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Opening'));
    });

    it('handles editor failure gracefully', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ editLocation: 'repo' });

      vi.doMock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(true),
        writeFileSync: vi.fn(),
      }));
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Editor failed');
      });

      await runCli(['edit']);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open editor')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('set command edge cases', () => {
    beforeEach(() => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ saveLocation: 'repo' });
      vi.mocked(wtconfig.loadRepoConfig).mockReturnValue({});
    });

    it('handles setConfigValue error', async () => {
      vi.mocked(wtconfig.setConfigValue).mockImplementation(() => {
        throw new Error('Invalid key format');
      });

      await runCli(['set', 'invalid..key', 'value']);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Failed to set value'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('uses global config when not in repo', async () => {
      vi.mocked(git.getRepoRoot).mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      vi.mocked(inquirer.prompt).mockResolvedValue({ saveLocation: 'global' });
      vi.mocked(wtconfig.loadGlobalConfig).mockReturnValue({});
      vi.mocked(wtconfig.setConfigValue).mockReturnValue({ baseBranch: 'develop' });

      await runCli(['set', 'baseBranch', 'develop']);

      expect(wtconfig.saveGlobalConfig).toHaveBeenCalled();
    });
  });

  describe('wizard outside repository', () => {
    beforeEach(() => {
      vi.mocked(git.getRepoRoot).mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        os: 'linux',
        git: { version: '2.30.0', configured: true, user: 'testuser', email: 'test@example.com' },
        github: { installed: true, authenticated: true, user: 'testuser' },
        ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: false },
        packageManager: 'npm',
        ide: { vscode: true, cursor: false },
      });
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
      vi.mocked(wtconfig.getInstallCommand).mockReturnValue('npm install');
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue('code');
    });

    it('runs wizard without repo context and uses default branch', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'global' });

      await runCli(['init']);

      // Should not call detectDefaultBranch with null
      expect(wtconfig.detectDefaultBranch).not.toHaveBeenCalled();
      expect(wtconfig.saveGlobalConfig).toHaveBeenCalled();
    });
  });

  describe('buildConfigFromState paths', () => {
    const mockEnvBase = {
      os: 'linux' as const,
      git: { version: '2.30.0', configured: true, user: 'testuser', email: 'test@example.com' },
      github: { installed: true, authenticated: true, user: 'testuser' },
      ai: { claudeCode: false, geminiCLI: false, ollama: false, codexCLI: false },
      packageManager: 'npm' as const,
      ide: { vscode: true, cursor: false },
    };

    beforeEach(() => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue(mockEnvBase);
      vi.mocked(wtconfig.detectDefaultBranch).mockReturnValue('main');
      vi.mocked(wtconfig.getDefaultRepoConfigPath).mockReturnValue('/repo/.worktreerc');
      vi.mocked(wtconfig.getGlobalConfigPath).mockReturnValue('/home/user/.worktreerc');
      vi.mocked(wtconfig.getInstallCommand).mockReturnValue('npm install');
      vi.mocked(wtconfig.getEditorCommand).mockReturnValue('code');
    });

    it('builds config with non-default baseBranch', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'develop', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ baseBranch: 'develop' })
      );
    });

    it('builds config with draftPr enabled', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: true, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ draftPr: true })
      );
    });

    it('builds config with non-default branchPrefix', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'fix' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ branchPrefix: 'fix' })
      );
    });

    it('builds config with non-default worktreePattern', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({ worktreeLocation: 'sibling', worktreePattern: 'pr-{number}' })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ worktreePattern: 'pr-{number}' })
      );
    });

    it('builds config with non-default worktreeParent', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({ worktreeLocation: 'inside', worktreePattern: '{repo}.pr{number}' })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ worktreeParent: '.worktrees' })
      );
    });

    it('builds config with AI enabled', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ai: { claudeCode: true, geminiCLI: false, ollama: false, codexCLI: false },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ aiChoice: 'yes' })
        .mockResolvedValueOnce({ aiFeatures: ['branchName', 'prDescription'] })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          ai: expect.objectContaining({
            provider: 'auto',
            branchName: true,
            prDescription: true,
          }),
        })
      );
    });

    it('builds config with hooks (autoDeps)', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: ['autoDeps'] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          hooks: expect.objectContaining({
            'post-worktree': 'npm install',
          }),
        })
      );
    });

    it('builds config with hooks (openEditor)', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: ['openEditor'] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          hooks: expect.objectContaining({
            'post-worktree': 'code',
          }),
        })
      );
    });

    it('builds config with multiple hooks', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: ['autoDeps', 'openEditor'] })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          hooks: expect.objectContaining({
            'post-worktree': expect.arrayContaining(['npm install', 'code']),
          }),
        })
      );
    });

    it('builds config with preferredEditor set', async () => {
      vi.mocked(wtconfig.detectEnvironment).mockReturnValue({
        ...mockEnvBase,
        ide: { vscode: true, cursor: true },
      });

      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: ['openEditor'] })
        .mockResolvedValueOnce({ editorChoice: 'cursor' })
        .mockResolvedValueOnce({ configureAdvanced: false })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ preferredEditor: 'cursor' })
      );
    });

    it('builds config with plugins', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: true })
        .mockResolvedValueOnce({ pluginList: 'plugin-a, plugin-b' })
        .mockResolvedValueOnce({ useGenerators: false })
        .mockResolvedValueOnce({ integrationsToAdd: [] })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({ plugins: ['plugin-a', 'plugin-b'] })
      );
    });

    it('builds config with generators', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: false })
        .mockResolvedValueOnce({ useGenerators: true })
        .mockResolvedValueOnce({
          branchNameGen: './branch.sh',
          prTitleGen: '',
          prDescGen: './pr-desc.sh',
          commitMsgGen: '',
        })
        .mockResolvedValueOnce({ integrationsToAdd: [] })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          generators: { branchName: './branch.sh', prDescription: './pr-desc.sh' },
        })
      );
    });

    it('builds config with integrations', async () => {
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ baseBranch: 'main', draftPr: false, branchPrefix: 'feat' })
        .mockResolvedValueOnce({
          worktreeLocation: 'sibling',
          worktreePattern: '{repo}.pr{number}',
        })
        .mockResolvedValueOnce({ hooks: [] })
        .mockResolvedValueOnce({ configureAdvanced: true })
        .mockResolvedValueOnce({ addPlugins: false })
        .mockResolvedValueOnce({ useGenerators: false })
        .mockResolvedValueOnce({ integrationsToAdd: ['linear'] })
        .mockResolvedValueOnce({ teamId: 'TEAM', apiKeyEnv: 'MY_KEY' })
        .mockResolvedValueOnce({ saveChoice: 'repo' });

      await runCli(['init']);

      expect(wtconfig.saveRepoConfig).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          integrations: { linear: { teamId: 'TEAM', apiKeyEnv: 'MY_KEY' } },
        })
      );
    });
  });

  describe('default command behavior', () => {
    it('defaults to show command when no command provided', async () => {
      await runCli([]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Current Configuration'));
    });
  });
});
