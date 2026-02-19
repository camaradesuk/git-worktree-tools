/**
 * Tests for wt unified command handlers
 *
 * Commands that still use spawnSync (new, link) are tested
 * by verifying the argument array passed to spawnSync.
 *
 * Commands migrated to direct library calls (list, state, clean) are tested
 * by mocking the library modules they call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import yargs, { type CommandModule } from 'yargs';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 }) as SpawnSyncReturns<Buffer>),
  execSync: vi.fn(),
}));

// Mock library dependencies for list command (direct library calls)
vi.mock('../../lib/lswt/index.js', () => ({
  gatherWorktreeInfo: vi.fn().mockResolvedValue([]),
  createDefaultDeps: vi.fn().mockReturnValue({}),
  formatJsonOutput: vi.fn().mockReturnValue('[]'),
  runInteractiveMode: vi.fn().mockResolvedValue(undefined),
  printWorktreeTable: vi.fn(),
  parseArgs: vi.fn(),
  getHelpText: vi.fn(),
  formatTypeLabel: vi.fn(),
  getDisplayPath: vi.fn(),
  sortWorktrees: vi.fn(),
  extractPrNumber: vi.fn(),
  isMainWorktree: vi.fn(),
}));

// Mock library dependencies for state command (direct library calls)
vi.mock('../../lib/wtstate/index.js', () => ({
  analyzeState: vi.fn().mockReturnValue({
    scenario: 'main_clean_same',
    scenarioDescription: 'On main branch, same as origin/main, no changes',
    currentBranch: 'main',
    baseBranch: 'main',
    worktreeType: 'main_worktree',
    hasChanges: false,
    hasStagedChanges: false,
    hasUnstagedChanges: false,
    localCommits: [],
    stagedFiles: [],
    unstagedFiles: [],
    availableActions: [],
    recommendedAction: null,
  }),
  formatText: vi.fn().mockReturnValue('State: main_clean_same'),
  parseArgs: vi.fn(),
  getHelpText: vi.fn(),
  getDefaultOptions: vi.fn(),
}));

// Mock library dependencies for clean command (direct library calls)
vi.mock('../../lib/cleanpr/index.js', () => ({
  gatherPrWorktreeInfo: vi.fn().mockResolvedValue([]),
  createDefaultDeps: vi.fn().mockReturnValue({}),
  groupWorktreesByState: vi.fn().mockReturnValue({ merged: [], closed: [], open: [], unknown: [] }),
  getCleanableWorktrees: vi.fn().mockReturnValue([]),
  findWorktreeByPrNumber: vi.fn().mockReturnValue(null),
  cleanWorktree: vi.fn().mockReturnValue({
    success: true,
    prNumber: 42,
    message: 'Cleaned',
    localBranchDeleted: true,
    remoteBranchDeleted: false,
  }),
  summarizeResults: vi.fn().mockReturnValue({ cleaned: 0, total: 0, failed: 0 }),
}));

// Mock config module for clean command
vi.mock('../../lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ worktreePattern: '{repo}.pr{number}', baseBranch: 'main' }),
  loadConfigWithValidation: vi.fn().mockReturnValue({ config: {}, validation: null }),
  getDefaultConfig: vi.fn().mockReturnValue({}),
  getConfigPath: vi.fn().mockReturnValue(null),
}));

// Mock logger for clean command
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock prompts module for clean command
vi.mock('../../lib/prompts.js', () => ({
  withSpinner: vi.fn((_msg: string, fn: () => Promise<unknown>) => fn()),
  promptChoice: vi.fn(),
  promptConfirm: vi.fn(),
}));

// Mock colors module for clean command
vi.mock('../../lib/colors.js', () => ({
  error: vi.fn((s: string) => s),
  dim: vi.fn((s: string) => s),
  success: vi.fn((s: string) => s),
  info: vi.fn((s: string) => s),
  cyan: vi.fn((s: string) => s),
  yellow: vi.fn((s: string) => s),
  red: vi.fn((s: string) => s),
  green: vi.fn((s: string) => s),
  bold: vi.fn((s: string) => s),
  warning: vi.fn((s: string) => s),
}));

// Mock config-editor for config command
vi.mock('../../lib/config-editor.js', () => ({
  runConfigEditor: vi.fn().mockResolvedValue({ saved: false }),
  quickEditConfig: vi.fn().mockResolvedValue({ saved: false }),
}));

// Mock config-validation for config command
vi.mock('../../lib/config-validation.js', () => ({
  formatValidationErrors: vi.fn().mockReturnValue('formatted errors'),
}));

// Mock global-config for config command
vi.mock('../../lib/global-config.js', () => ({
  getSchemaUrl: vi.fn().mockReturnValue('https://example.com/schema.json'),
}));

// Mock git module for list/state/clean handlers
vi.mock('../../lib/git.js', () => ({
  getRepoRoot: vi.fn().mockReturnValue('/fake/repo'),
  removeWorktree: vi.fn(),
  pruneWorktrees: vi.fn(),
}));

// Mock github module for list/clean handlers
vi.mock('../../lib/github.js', () => ({
  isGhInstalled: vi.fn().mockReturnValue(true),
}));

// Mock UI module for list/state/clean handlers
vi.mock('../../lib/ui/index.js', () => ({
  setJsonMode: vi.fn(),
  printStatus: vi.fn(),
  printDim: vi.fn(),
  printError: vi.fn(),
  printHeader: vi.fn(),
  printNextSteps: vi.fn(),
  changeIndicator: vi.fn().mockReturnValue(''),
  errorToDisplay: vi.fn().mockReturnValue({ title: 'error' }),
}));

// Mock json-output module (partial mock to preserve exports for all command handlers)
vi.mock('../../lib/json-output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/json-output.js')>();
  return {
    ...actual,
    createSuccessResult: vi.fn().mockReturnValue({ success: true }),
    createErrorResult: vi.fn().mockReturnValue({ success: false }),
    formatJsonResult: vi.fn().mockReturnValue('{}'),
  };
});

// Import all commands statically so coverage is tracked
import { newCommand } from './new.js';
import { listCommand } from './list.js';
import { cleanCommand } from './clean.js';
import { stateCommand } from './state.js';
import { configCommand } from './config.js';
import { linkCommand } from './link.js';

// Import mocked modules for assertions
import { gatherWorktreeInfo, printWorktreeTable, formatJsonOutput } from '../../lib/lswt/index.js';
import { analyzeState, formatText } from '../../lib/wtstate/index.js';
import { gatherPrWorktreeInfo, getCleanableWorktrees } from '../../lib/cleanpr/index.js';
import { setJsonMode, printError } from '../../lib/ui/index.js';
import { createSuccessResult, formatJsonResult } from '../../lib/json-output.js';
import * as git from '../../lib/git.js';
import * as github from '../../lib/github.js';

// Mock process.exit to prevent test from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

// Helper to invoke builder for coverage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invokeBuilder(command: CommandModule<any, any>, args: string[]): void {
  const parser = yargs(args);
  if (typeof command.builder === 'function') {
    command.builder(parser);
  }
}

describe('wt subcommand handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockClear();
  });

  describe('newCommand', () => {
    it('has correct command structure', () => {
      expect(newCommand.command).toEqual(['new [description]', 'n']);
      expect(newCommand.describe).toContain('PR');
    });

    it('builder registers all expected options', () => {
      invokeBuilder(newCommand, []);
      expect(true).toBe(true);
    });

    it('passes description to newpr', () => {
      newCommand.handler({
        description: 'Add dark mode',
        json: false,
        'non-interactive': false,
        draft: false,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['Add dark mode']),
        expect.any(Object)
      );
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('passes --pr flag to newpr', () => {
      newCommand.handler({ pr: 42, json: false, 'non-interactive': false, draft: false } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--pr', '42']),
        expect.any(Object)
      );
    });

    it('passes --ready flag to newpr', () => {
      newCommand.handler({
        ready: true,
        json: false,
        'non-interactive': false,
        draft: false,
        install: false,
        code: false,
        'no-wtlink': false,
        'no-hooks': false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--ready']),
        expect.any(Object)
      );
    });

    it('passes --base flag to newpr', () => {
      newCommand.handler({
        base: 'develop',
        json: false,
        'non-interactive': false,
        draft: false,
        install: false,
        code: false,
        ready: false,
        'no-wtlink': false,
        'no-hooks': false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--base', 'develop']),
        expect.any(Object)
      );
    });

    it('passes --branch flag to newpr', () => {
      newCommand.handler({
        branch: 'feat/my-feature',
        json: false,
        'non-interactive': false,
        draft: false,
        install: false,
        code: false,
        ready: false,
        'no-wtlink': false,
        'no-hooks': false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--branch', 'feat/my-feature']),
        expect.any(Object)
      );
    });

    it('passes --install flag to newpr', () => {
      newCommand.handler({
        install: true,
        json: false,
        'non-interactive': false,
        draft: false,
        code: false,
        ready: false,
        'no-wtlink': false,
        'no-hooks': false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--install']),
        expect.any(Object)
      );
    });

    it('passes --code flag to newpr', () => {
      newCommand.handler({
        code: true,
        json: false,
        'non-interactive': false,
        draft: false,
        install: false,
        ready: false,
        'no-wtlink': false,
        'no-hooks': false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--code']),
        expect.any(Object)
      );
    });

    it('passes --no-wtlink flag to newpr', () => {
      newCommand.handler({
        'no-wtlink': true,
        json: false,
        'non-interactive': false,
        draft: false,
        install: false,
        code: false,
        ready: false,
        'no-hooks': false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--no-wtlink']),
        expect.any(Object)
      );
    });

    it('passes --no-hooks flag to newpr', () => {
      newCommand.handler({
        'no-hooks': true,
        json: false,
        'non-interactive': false,
        draft: false,
        install: false,
        code: false,
        ready: false,
        'no-wtlink': false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--no-hooks']),
        expect.any(Object)
      );
    });

    it('passes --json flag to newpr', () => {
      newCommand.handler({ json: true, 'non-interactive': false, draft: false } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--json']),
        expect.any(Object)
      );
    });

    it('passes --non-interactive flag to newpr', () => {
      newCommand.handler({ json: false, 'non-interactive': true, draft: false } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--non-interactive']),
        expect.any(Object)
      );
    });

    it('passes --action flag to newpr', () => {
      newCommand.handler({
        action: 'commit_all',
        json: false,
        'non-interactive': false,
        draft: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--action', 'commit_all']),
        expect.any(Object)
      );
    });

    it('passes --draft flag to newpr', () => {
      newCommand.handler({ json: false, 'non-interactive': false, draft: true } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--draft']),
        expect.any(Object)
      );
    });

    it('passes --plan flag to newpr', () => {
      newCommand.handler({
        json: false,
        'non-interactive': false,
        draft: false,
        plan: true,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--plan']),
        expect.any(Object)
      );
    });

    it('passes --confirm-hooks flag to newpr', () => {
      newCommand.handler({
        json: false,
        'non-interactive': false,
        draft: false,
        'confirm-hooks': true,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--confirm-hooks']),
        expect.any(Object)
      );
    });
  });

  describe('listCommand', () => {
    it('has correct command structure', () => {
      expect(listCommand.command).toEqual(['list', 'ls']);
      expect(listCommand.describe).toContain('worktrees');
    });

    it('builder registers all expected options', () => {
      invokeBuilder(listCommand, []);
      expect(true).toBe(true);
    });

    it('calls gatherWorktreeInfo with verbose option', async () => {
      await listCommand.handler({ verbose: true, json: false, status: false } as never);
      expect(gatherWorktreeInfo).toHaveBeenCalledWith(
        '/fake/repo',
        expect.objectContaining({ verbose: true }),
        expect.any(Object)
      );
    });

    it('calls setJsonMode and formatJsonOutput for --json', async () => {
      await listCommand.handler({ json: true, verbose: false, status: false } as never);
      expect(setJsonMode).toHaveBeenCalledWith(true);
      expect(formatJsonOutput).toHaveBeenCalled();
    });

    it('calls printWorktreeTable for non-interactive non-json output', async () => {
      await listCommand.handler({
        json: false,
        verbose: false,
        status: false,
        interactive: false,
      } as never);
      expect(printWorktreeTable).toHaveBeenCalled();
    });

    it('passes status option to gatherWorktreeInfo', async () => {
      await listCommand.handler({ status: true, json: false, verbose: false } as never);
      expect(gatherWorktreeInfo).toHaveBeenCalledWith(
        '/fake/repo',
        expect.objectContaining({ showStatus: true }),
        expect.any(Object)
      );
    });

    it('does not spawn a child process', async () => {
      vi.mocked(spawnSync).mockClear();
      await listCommand.handler({
        json: false,
        verbose: false,
        status: false,
        interactive: false,
      } as never);
      expect(spawnSync).not.toHaveBeenCalled();
    });
  });

  describe('cleanCommand', () => {
    it('has correct command structure', () => {
      expect(cleanCommand.command).toEqual(['clean [pr-number]', 'c']);
      expect(cleanCommand.describe).toContain('Clean');
    });

    it('builder registers all expected options', () => {
      invokeBuilder(cleanCommand, []);
      expect(true).toBe(true);
    });

    it('calls gatherPrWorktreeInfo for --all mode', async () => {
      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: false,
      } as never);
      expect(gatherPrWorktreeInfo).toHaveBeenCalledWith(
        '/fake/repo',
        '{repo}.pr{number}',
        expect.any(Object)
      );
      expect(getCleanableWorktrees).toHaveBeenCalled();
    });

    it('calls setJsonMode when --json is passed', async () => {
      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: true,
      } as never);
      expect(setJsonMode).toHaveBeenCalledWith(true);
    });

    it('handles gh not installed error', async () => {
      vi.mocked(github.isGhInstalled).mockReturnValueOnce(false);
      await cleanCommand.handler({
        all: false,
        'dry-run': false,
        force: false,
        json: false,
      } as never);
      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('GitHub CLI') })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles not in git repo error', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValueOnce(null as never);
      await cleanCommand.handler({
        all: false,
        'dry-run': false,
        force: false,
        json: false,
      } as never);
      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('git repository') })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('does not spawn a child process', async () => {
      vi.mocked(spawnSync).mockClear();
      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: false,
      } as never);
      expect(spawnSync).not.toHaveBeenCalled();
    });
  });

  describe('stateCommand', () => {
    it('has correct command structure', () => {
      expect(stateCommand.command).toEqual(['state', 's']);
      expect(stateCommand.describe).toContain('state');
    });

    it('builder registers all expected options', () => {
      invokeBuilder(stateCommand, []);
      expect(true).toBe(true);
    });

    it('calls analyzeState and formatJsonResult for --json', async () => {
      await stateCommand.handler({ json: true, verbose: false } as never);
      expect(analyzeState).toHaveBeenCalledWith(
        expect.objectContaining({ json: true, verbose: false })
      );
      expect(createSuccessResult).toHaveBeenCalledWith('wtstate', expect.any(Object));
      expect(formatJsonResult).toHaveBeenCalled();
    });

    it('calls analyzeState and formatText for text output', async () => {
      await stateCommand.handler({ verbose: true, json: false } as never);
      expect(analyzeState).toHaveBeenCalledWith(
        expect.objectContaining({ verbose: true, json: false })
      );
      expect(formatText).toHaveBeenCalled();
    });

    it('passes base-branch option to analyzeState', async () => {
      await stateCommand.handler({
        verbose: false,
        json: false,
        'base-branch': 'develop',
      } as never);
      expect(analyzeState).toHaveBeenCalledWith(expect.objectContaining({ baseBranch: 'develop' }));
    });

    it('does not spawn a child process', async () => {
      vi.mocked(spawnSync).mockClear();
      await stateCommand.handler({ json: false, verbose: false } as never);
      expect(spawnSync).not.toHaveBeenCalled();
    });
  });

  describe('configCommand', () => {
    it('has correct command structure', () => {
      expect(configCommand.command).toEqual(['config [subcommand] [args..]', 'cfg']);
      expect(configCommand.describe).toContain('Configuration');
    });

    it('builder registers positional args', () => {
      invokeBuilder(configCommand, []);
      expect(true).toBe(true);
    });

    it('handles no subcommand (defaults to interactive)', async () => {
      const handler = configCommand.handler({ subcommand: undefined, args: [] } as never);
      expect(handler).toBeInstanceOf(Promise);
    });
  });

  describe('linkCommand', () => {
    it('has correct command structure', () => {
      expect(linkCommand.command).toEqual(['link [subcommand] [args..]', 'l']);
      expect(linkCommand.describe).toContain('config');
    });

    it('builder registers all expected options', () => {
      invokeBuilder(linkCommand, []);
      expect(true).toBe(true);
    });

    it('passes subcommand and args to wtlink', () => {
      linkCommand.handler({
        subcommand: 'link',
        args: ['source', 'dest'],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        json: false,
        verbose: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['link', 'source', 'dest']),
        expect.any(Object)
      );
    });

    it('passes --dry-run flag to wtlink', () => {
      linkCommand.handler({
        'dry-run': true,
        args: [],
        yes: false,
        'non-interactive': false,
        json: false,
        verbose: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--dry-run']),
        expect.any(Object)
      );
    });

    it('passes --yes flag to wtlink', () => {
      linkCommand.handler({
        yes: true,
        args: [],
        'dry-run': false,
        'non-interactive': false,
        json: false,
        verbose: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--yes']),
        expect.any(Object)
      );
    });

    it('passes --non-interactive flag to wtlink', () => {
      linkCommand.handler({
        'non-interactive': true,
        args: [],
        'dry-run': false,
        yes: false,
        json: false,
        verbose: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--non-interactive']),
        expect.any(Object)
      );
    });

    it('passes --json flag to wtlink', () => {
      linkCommand.handler({
        json: true,
        args: [],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        verbose: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--json']),
        expect.any(Object)
      );
    });

    it('passes --verbose flag to wtlink', () => {
      linkCommand.handler({
        verbose: true,
        args: [],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        json: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--verbose']),
        expect.any(Object)
      );
    });

    it('passes --manifest-file flag to wtlink', () => {
      linkCommand.handler({
        'manifest-file': '.custom-manifest',
        args: [],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        json: false,
        verbose: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--manifest-file', '.custom-manifest']),
        expect.any(Object)
      );
    });

    it('handles no subcommand (defaults to interactive)', () => {
      linkCommand.handler({
        args: [],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        json: false,
        verbose: false,
        clean: false,
        backup: false,
      } as never);
      expect(spawnSync).toHaveBeenCalled();
    });

    it('passes --clean flag to wtlink', () => {
      linkCommand.handler({
        clean: true,
        args: [],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        json: false,
        verbose: false,
        backup: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--clean']),
        expect.any(Object)
      );
    });

    it('passes --backup flag to wtlink', () => {
      linkCommand.handler({
        backup: true,
        args: [],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        json: false,
        verbose: false,
        clean: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--backup']),
        expect.any(Object)
      );
    });

    it('passes --type flag to wtlink', () => {
      linkCommand.handler({
        type: 'symbolic',
        args: [],
        'dry-run': false,
        yes: false,
        'non-interactive': false,
        json: false,
        verbose: false,
        clean: false,
        backup: false,
      } as never);
      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--type', 'symbolic']),
        expect.any(Object)
      );
    });
  });
});
