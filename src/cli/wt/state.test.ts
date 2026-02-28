/**
 * Tests for wt state command error handling paths
 *
 * Covers:
 * - Lines 66-80: git.getRepoRoot() throws (JSON and non-JSON)
 * - Lines 110-123: analyzeState() throws (JSON and non-JSON)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before imports
vi.mock('../../lib/git.js', () => ({
  getRepoRoot: vi.fn().mockReturnValue('/fake/repo'),
}));

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
}));

vi.mock('../../lib/ui/index.js', () => ({
  setJsonMode: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../lib/json-output.js', () => ({
  createSuccessResult: vi.fn().mockReturnValue({ success: true }),
  createErrorResult: vi.fn().mockReturnValue({ success: false }),
  formatJsonResult: vi.fn().mockReturnValue('{"success":false}'),
  ErrorCode: {
    NOT_GIT_REPO: 'NOT_GIT_REPO',
    OPERATION_FAILED: 'OPERATION_FAILED',
  },
}));

import { stateCommand } from './state.js';
import * as git from '../../lib/git.js';
import { analyzeState } from '../../lib/wtstate/index.js';
import { setJsonMode, printError } from '../../lib/ui/index.js';
import { createErrorResult, formatJsonResult } from '../../lib/json-output.js';

const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

describe('stateCommand error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockClear();
    mockConsoleLog.mockClear();
  });

  describe('when git.getRepoRoot() throws (lines 66-80)', () => {
    it('outputs JSON error and exits when --json is true', async () => {
      vi.mocked(git.getRepoRoot).mockImplementationOnce(() => {
        throw new Error('fatal: not a git repository');
      });

      await stateCommand.handler({ json: true, verbose: false } as never);

      expect(setJsonMode).toHaveBeenCalledWith(true);
      expect(createErrorResult).toHaveBeenCalledWith(
        'wtstate',
        'NOT_GIT_REPO',
        'Not in a git repository'
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('{"success":false}');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('calls printError and exits when --json is false', async () => {
      vi.mocked(git.getRepoRoot).mockImplementationOnce(() => {
        throw new Error('fatal: not a git repository');
      });

      await stateCommand.handler({ json: false, verbose: false } as never);

      expect(setJsonMode).toHaveBeenCalledWith(false);
      expect(printError).toHaveBeenCalledWith({
        title: 'Not in a git repository.',
        hint: 'Run this command from within a git repository.',
      });
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('when analyzeState() throws (lines 110-123)', () => {
    it('outputs JSON error with Error message and exits when --json is true', async () => {
      vi.mocked(analyzeState).mockImplementationOnce(() => {
        throw new Error('Failed to detect git state');
      });

      await stateCommand.handler({ json: true, verbose: false } as never);

      expect(createErrorResult).toHaveBeenCalledWith(
        'wtstate',
        'OPERATION_FAILED',
        'Failed to detect git state'
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('{"success":false}');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error with stringified non-Error and exits when --json is true', async () => {
      vi.mocked(analyzeState).mockImplementationOnce(() => {
        throw 'unexpected string error';
      });

      await stateCommand.handler({ json: true, verbose: false } as never);

      expect(createErrorResult).toHaveBeenCalledWith(
        'wtstate',
        'OPERATION_FAILED',
        'unexpected string error'
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('calls printError with Error message and exits when --json is false', async () => {
      vi.mocked(analyzeState).mockImplementationOnce(() => {
        throw new Error('Failed to detect git state');
      });

      await stateCommand.handler({ json: false, verbose: false } as never);

      expect(printError).toHaveBeenCalledWith({
        title: 'Failed to detect git state',
      });
      expect(mockExit).toHaveBeenCalledWith(1);
      // Should not attempt JSON output
      expect(createErrorResult).not.toHaveBeenCalled();
    });

    it('calls printError with stringified non-Error and exits when --json is false', async () => {
      vi.mocked(analyzeState).mockImplementationOnce(() => {
        throw 42;
      });

      await stateCommand.handler({ json: false, verbose: false } as never);

      expect(printError).toHaveBeenCalledWith({
        title: '42',
      });
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
