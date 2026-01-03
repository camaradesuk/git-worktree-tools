/**
 * wtstate CLI Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the CLI
vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../lib/wtstate/index.js', () => ({
  parseArgs: vi.fn(),
  getHelpText: vi.fn(),
  analyzeState: vi.fn(),
  formatText: vi.fn(),
}));

vi.mock('../lib/json-output.js', () => ({
  createSuccessResult: vi.fn(),
  createErrorResult: vi.fn(),
  formatJsonResult: vi.fn(),
  ErrorCode: {
    NOT_GIT_REPO: 'NOT_GIT_REPO',
    OPERATION_FAILED: 'OPERATION_FAILED',
  },
}));

// Import after mocking
import * as git from '../lib/git.js';
import * as wtstate from '../lib/wtstate/index.js';
import * as jsonOutput from '../lib/json-output.js';
import type { WtstateResult } from '../lib/wtstate/types.js';

describe('cli/wtstate', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetAllMocks();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // @ts-expect-error - process.exit mock type is complex
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    originalArgv = process.argv;
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
    process.argv = originalArgv;
    vi.resetModules();
  });

  async function runCli(args: string[] = []): Promise<void> {
    process.argv = ['node', 'wtstate', ...args];
    // Re-import to trigger main()
    await import('./wtstate.js');
    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  describe('help option', () => {
    it('prints help and exits 0 on --help', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({ kind: 'help' });
      vi.mocked(wtstate.getHelpText).mockReturnValue('Usage: wtstate [options]');

      await runCli(['--help']);

      expect(wtstate.getHelpText).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: wtstate [options]');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('error handling', () => {
    it('prints error and exits 1 on parse error', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({
        kind: 'error',
        message: 'Unknown option: --invalid',
      });

      await runCli(['--invalid']);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('not in git repo', () => {
    it('outputs JSON error when --json is used', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({
        kind: 'success',
        options: { baseBranch: 'main', json: true, verbose: false },
      });
      vi.mocked(git.getRepoRoot).mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      vi.mocked(jsonOutput.createErrorResult).mockReturnValue({
        success: false,
        command: 'wtstate',
        timestamp: '2024-01-01T00:00:00.000Z',
        error: { code: jsonOutput.ErrorCode.NOT_GIT_REPO, message: 'Not in a git repository' },
      });
      vi.mocked(jsonOutput.formatJsonResult).mockReturnValue('{"success":false}');

      await runCli(['--json']);

      expect(jsonOutput.createErrorResult).toHaveBeenCalledWith(
        'wtstate',
        jsonOutput.ErrorCode.NOT_GIT_REPO,
        'Not in a git repository'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs text error when --json is not used', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({
        kind: 'success',
        options: { baseBranch: 'main', json: false, verbose: false },
      });
      vi.mocked(git.getRepoRoot).mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      await runCli([]);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('successful state analysis', () => {
    const mockStateResult: WtstateResult = {
      scenario: 'main_clean_same',
      scenarioDescription: 'On main branch, clean',
      currentBranch: 'main',
      baseBranch: 'main',
      worktreeType: 'main_worktree',
      hasChanges: false,
      hasStagedChanges: false,
      hasUnstagedChanges: false,
      localCommits: [],
      stagedFiles: [],
      unstagedFiles: [],
      availableActions: [{ key: 'empty_commit', label: 'Create empty commit' }],
      recommendedAction: 'empty_commit',
    };

    it('outputs JSON when --json is used', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({
        kind: 'success',
        options: { baseBranch: 'main', json: true, verbose: false },
      });
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(wtstate.analyzeState).mockReturnValue(mockStateResult);
      vi.mocked(jsonOutput.createSuccessResult).mockReturnValue({
        success: true,
        command: 'wtstate',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: { scenario: 'main_clean_same' },
      });
      vi.mocked(jsonOutput.formatJsonResult).mockReturnValue('{"success":true}');

      await runCli(['--json']);

      expect(wtstate.analyzeState).toHaveBeenCalled();
      expect(jsonOutput.createSuccessResult).toHaveBeenCalledWith('wtstate', expect.any(Object));
      expect(mockConsoleLog).toHaveBeenCalledWith('{"success":true}');
    });

    it('outputs formatted text when --json is not used', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({
        kind: 'success',
        options: { baseBranch: 'main', json: false, verbose: false },
      });
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(wtstate.analyzeState).mockReturnValue(mockStateResult);
      vi.mocked(wtstate.formatText).mockReturnValue('Scenario: main_clean_same\nBranch: main');

      await runCli([]);

      expect(wtstate.formatText).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('Scenario: main_clean_same\nBranch: main');
    });
  });

  describe('analysis error handling', () => {
    it('outputs JSON error when analysis fails with --json', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({
        kind: 'success',
        options: { baseBranch: 'main', json: true, verbose: false },
      });
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(wtstate.analyzeState).mockImplementation(() => {
        throw new Error('Analysis failed');
      });
      vi.mocked(jsonOutput.createErrorResult).mockReturnValue({
        success: false,
        command: 'wtstate',
        timestamp: '2024-01-01T00:00:00.000Z',
        error: { code: jsonOutput.ErrorCode.OPERATION_FAILED, message: 'Analysis failed' },
      });
      vi.mocked(jsonOutput.formatJsonResult).mockReturnValue('{"success":false}');

      await runCli(['--json']);

      expect(jsonOutput.createErrorResult).toHaveBeenCalledWith(
        'wtstate',
        jsonOutput.ErrorCode.OPERATION_FAILED,
        'Analysis failed'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('outputs text error when analysis fails without --json', async () => {
      vi.mocked(wtstate.parseArgs).mockReturnValue({
        kind: 'success',
        options: { baseBranch: 'main', json: false, verbose: false },
      });
      vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
      vi.mocked(wtstate.analyzeState).mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      await runCli([]);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});
