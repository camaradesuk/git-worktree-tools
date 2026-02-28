/**
 * Tests for wt list command handler - error paths and interactive mode
 *
 * Covers uncovered lines in list.ts:
 * - Line ~122: process.exit(1) after getRepoRoot() returns falsy
 * - Line ~139: runInteractiveMode path
 * - Lines 144-164: catch block error handling (git repo errors and generic errors, JSON/non-JSON)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before importing the module under test

vi.mock('../../lib/lswt/index.js', () => ({
  gatherWorktreeInfo: vi.fn().mockResolvedValue([]),
  createDefaultDeps: vi.fn().mockReturnValue({}),
  formatJsonOutput: vi.fn().mockReturnValue('[]'),
  runInteractiveMode: vi.fn().mockResolvedValue(undefined),
  printWorktreeTable: vi.fn(),
}));

vi.mock('../../lib/git.js', () => ({
  getRepoRoot: vi.fn().mockReturnValue('/fake/repo'),
}));

vi.mock('../../lib/github.js', () => ({
  isGhInstalled: vi.fn().mockReturnValue(true),
}));

vi.mock('../../lib/ui/index.js', () => ({
  setJsonMode: vi.fn(),
  printStatus: vi.fn(),
  printDim: vi.fn(),
  printError: vi.fn(),
  errorToDisplay: vi.fn().mockReturnValue({ title: 'Something went wrong' }),
}));

vi.mock('../../lib/json-output.js', () => ({
  createErrorResult: vi.fn().mockReturnValue({ success: false }),
  formatJsonResult: vi.fn().mockReturnValue('{"success":false}'),
  ErrorCode: {
    NOT_GIT_REPO: 'NOT_GIT_REPO',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  },
  getErrorSuggestion: vi.fn().mockReturnValue('Run this command from within a git repository.'),
}));

// Import after mocks are set up
import { listCommand } from './list.js';
import * as git from '../../lib/git.js';
import { gatherWorktreeInfo, runInteractiveMode } from '../../lib/lswt/index.js';
import { printError, errorToDisplay } from '../../lib/ui/index.js';
import { createErrorResult, formatJsonResult } from '../../lib/json-output.js';

// Mock process.exit to prevent test runner from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('listCommand handler - error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getRepoRoot returns a valid path
    vi.mocked(git.getRepoRoot).mockReturnValue('/fake/repo');
  });

  afterEach(() => {
    mockExit.mockClear();
  });

  describe('getRepoRoot() returns falsy', () => {
    it('outputs JSON error and exits when json=true', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue(null as unknown as string);

      await listCommand.handler({
        json: true,
        verbose: false,
        status: false,
      } as never);

      expect(createErrorResult).toHaveBeenCalledWith(
        'lswt',
        'NOT_GIT_REPO',
        'Not a git repository',
        undefined,
        expect.any(String)
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('calls printError and exits when json=false', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('' as unknown as string);

      await listCommand.handler({
        json: false,
        verbose: false,
        status: false,
      } as never);

      expect(printError).toHaveBeenCalledWith({
        title: 'Not a git repository.',
        hint: 'Run this command from within a git repository.',
      });
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('gatherWorktreeInfo throws "not a git repository" error', () => {
    it('outputs JSON error for git repo error when json=true', async () => {
      vi.mocked(gatherWorktreeInfo).mockRejectedValueOnce(
        new Error('fatal: not a git repository (or any parent)')
      );

      await listCommand.handler({
        json: true,
        verbose: false,
        status: false,
      } as never);

      expect(createErrorResult).toHaveBeenCalledWith(
        'lswt',
        'NOT_GIT_REPO',
        'Not a git repository',
        undefined,
        expect.any(String)
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('calls printError for git repo error when json=false', async () => {
      vi.mocked(gatherWorktreeInfo).mockRejectedValueOnce(new Error('fatal: not a git repository'));

      await listCommand.handler({
        json: false,
        verbose: false,
        status: false,
      } as never);

      expect(printError).toHaveBeenCalledWith({
        title: 'Not a git repository',
        hint: 'Run this command from within a git repository.',
      });
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('gatherWorktreeInfo throws generic error', () => {
    it('outputs JSON error with UNKNOWN_ERROR code when json=true', async () => {
      vi.mocked(gatherWorktreeInfo).mockRejectedValueOnce(
        new Error('Something unexpected happened')
      );

      await listCommand.handler({
        json: true,
        verbose: false,
        status: false,
      } as never);

      expect(createErrorResult).toHaveBeenCalledWith(
        'lswt',
        'UNKNOWN_ERROR',
        'Something unexpected happened',
        undefined,
        expect.any(String)
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('calls errorToDisplay and printError when json=false', async () => {
      const thrownError = new Error('disk read failure');
      vi.mocked(gatherWorktreeInfo).mockRejectedValueOnce(thrownError);
      vi.mocked(errorToDisplay).mockReturnValueOnce({ title: 'disk read failure' });

      await listCommand.handler({
        json: false,
        verbose: false,
        status: false,
      } as never);

      expect(errorToDisplay).toHaveBeenCalledWith(thrownError);
      expect(printError).toHaveBeenCalledWith({ title: 'disk read failure' });
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles non-Error thrown values in catch block', async () => {
      vi.mocked(gatherWorktreeInfo).mockRejectedValueOnce('string error');

      await listCommand.handler({
        json: true,
        verbose: false,
        status: false,
      } as never);

      expect(createErrorResult).toHaveBeenCalledWith(
        'lswt',
        'UNKNOWN_ERROR',
        'string error',
        undefined,
        expect.any(String)
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('interactive mode path', () => {
    it('calls runInteractiveMode when interactive=true', async () => {
      await listCommand.handler({
        json: false,
        verbose: false,
        status: false,
        interactive: true,
      } as never);

      expect(runInteractiveMode).toHaveBeenCalledWith([], expect.any(Object));
    });
  });
});
