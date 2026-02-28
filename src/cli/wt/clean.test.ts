/**
 * Tests for wt clean command handler
 *
 * Exercises the handler through different code paths to cover internal
 * helper functions: outputJsonResult, outputJsonError, resultToCleanedInfo, printWorktree.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before imports

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../lib/git.js', () => ({
  getRepoRoot: vi.fn().mockReturnValue('/fake/repo'),
  getMainWorktreeRoot: vi.fn().mockReturnValue('/fake/repo'),
  removeWorktree: vi.fn(),
  pruneWorktrees: vi.fn(),
}));

vi.mock('../../lib/github.js', () => ({
  isGhInstalled: vi.fn().mockReturnValue(true),
}));

vi.mock('../../lib/prompts.js', () => ({
  withSpinner: vi.fn((_msg: string, fn: () => Promise<unknown>) => fn()),
  promptChoice: vi.fn(),
  promptConfirm: vi.fn(),
}));

vi.mock('../../lib/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    worktreePattern: '{repo}.pr{number}',
    baseBranch: 'main',
  }),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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

vi.mock('../../lib/cleanpr/index.js', () => ({
  gatherPrWorktreeInfo: vi.fn().mockResolvedValue([]),
  createDefaultDeps: vi.fn().mockReturnValue({}),
  groupWorktreesByState: vi.fn().mockReturnValue({ merged: [], closed: [], open: [], unknown: [] }),
  getCleanableWorktrees: vi.fn().mockReturnValue([]),
  findWorktreeByPrNumber: vi.fn().mockReturnValue(null),
  cleanWorktree: vi.fn().mockReturnValue({
    success: true,
    prNumber: 42,
    message: 'Cleaned PR #42',
    localBranchDeleted: true,
    remoteBranchDeleted: false,
  }),
  summarizeResults: vi.fn().mockReturnValue({ cleaned: 0, total: 0, failed: 0 }),
}));

vi.mock('../../lib/ui/index.js', () => ({
  setJsonMode: vi.fn(),
  isJsonMode: vi.fn().mockReturnValue(false),
  printStatus: vi.fn(),
  printDim: vi.fn(),
  printError: vi.fn(),
  printHeader: vi.fn(),
  printNextSteps: vi.fn(),
  changeIndicator: vi.fn().mockReturnValue(''),
  errorToDisplay: vi.fn().mockReturnValue({ title: 'error' }),
}));

vi.mock('../../lib/json-output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/json-output.js')>();
  return {
    ...actual,
    createSuccessResult: vi.fn().mockReturnValue({ success: true }),
    createErrorResult: vi.fn().mockReturnValue({ success: false }),
    formatJsonResult: vi.fn().mockReturnValue('{}'),
  };
});

// Import the command under test
import { cleanCommand } from './clean.js';

// Import mocked modules for assertions and setup
import * as git from '../../lib/git.js';
import * as github from '../../lib/github.js';
import {
  gatherPrWorktreeInfo,
  getCleanableWorktrees,
  findWorktreeByPrNumber,
  cleanWorktree,
  summarizeResults,
  groupWorktreesByState,
} from '../../lib/cleanpr/index.js';
import {
  setJsonMode,
  printError,
  printStatus,
  printDim,
  printNextSteps,
  changeIndicator,
} from '../../lib/ui/index.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
} from '../../lib/json-output.js';
import type { WorktreeInfo, CleanupResult } from '../../lib/cleanpr/index.js';

// Mock process.exit - throws to halt execution (mimics real exit behavior)
class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new ExitError(code as number);
});

// Capture console.log output for JSON assertions
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

function makeWorktree(overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    path: '/fake/repo.pr42',
    branch: 'feat/thing',
    commit: 'abc1234',
    prNumber: 42,
    prState: 'MERGED',
    hasChanges: false,
    ...overrides,
  };
}

function makeCleanupResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
  return {
    success: true,
    prNumber: 42,
    message: 'Cleaned PR #42',
    localBranchDeleted: true,
    remoteBranchDeleted: false,
    ...overrides,
  };
}

describe('wt clean handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock return values
    vi.mocked(git.getRepoRoot).mockReturnValue('/fake/repo');
    vi.mocked(github.isGhInstalled).mockReturnValue(true);
    vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([]);
    vi.mocked(getCleanableWorktrees).mockReturnValue([]);
    vi.mocked(findWorktreeByPrNumber).mockReturnValue(undefined as never);
    vi.mocked(changeIndicator).mockReturnValue('');
  });

  afterEach(() => {
    mockExit.mockClear();
    mockConsoleLog.mockClear();
  });

  // =========================================================================
  // Error paths with JSON output
  // =========================================================================

  describe('prerequisite errors with --json', () => {
    it('outputs JSON error when gh is not installed', async () => {
      vi.mocked(github.isGhInstalled).mockReturnValue(false);

      await expect(
        cleanCommand.handler({
          all: true,
          'dry-run': false,
          force: false,
          json: true,
        } as never)
      ).rejects.toThrow(ExitError);

      expect(setJsonMode).toHaveBeenCalledWith(true);
      expect(createErrorResult).toHaveBeenCalledWith(
        'cleanpr',
        ErrorCode.GH_NOT_INSTALLED,
        expect.stringContaining('GitHub CLI')
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('{}');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON error when not in a git repo', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue(null as never);

      await expect(
        cleanCommand.handler({
          all: true,
          'dry-run': false,
          force: false,
          json: true,
        } as never)
      ).rejects.toThrow(ExitError);

      expect(createErrorResult).toHaveBeenCalledWith(
        'cleanpr',
        ErrorCode.NOT_GIT_REPO,
        expect.stringContaining('git repository')
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // =========================================================================
  // --all --json: no worktrees found
  // =========================================================================

  describe('--all --json with no worktrees', () => {
    it('outputs JSON success with zero cleaned message', async () => {
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([]);

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: true,
      } as never);

      // cleanAll path: no cleanable worktrees, json mode -> outputs success JSON directly
      expect(createSuccessResult).toHaveBeenCalledWith(
        'cleanpr',
        expect.objectContaining({
          totalCleaned: 0,
          totalSkipped: 0,
          message: expect.stringContaining('No merged or closed'),
        })
      );
      expect(formatJsonResult).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('{}');
    });
  });

  // =========================================================================
  // --all --json: cleanable worktrees found (exercises outputJsonResult non-dry-run)
  // =========================================================================

  describe('--all --json with cleanable worktrees', () => {
    it('outputs JSON result with cleaned worktrees', async () => {
      const wt1 = makeWorktree({
        prNumber: 10,
        branch: 'feat/a',
        path: '/fake/repo.pr10',
        prState: 'MERGED',
      });
      const wt2 = makeWorktree({
        prNumber: 20,
        branch: 'feat/b',
        path: '/fake/repo.pr20',
        prState: 'CLOSED',
      });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt1, wt2]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt1, wt2]);
      vi.mocked(cleanWorktree)
        .mockReturnValueOnce(makeCleanupResult({ prNumber: 10, message: 'Cleaned PR #10' }))
        .mockReturnValueOnce(makeCleanupResult({ prNumber: 20, message: 'Cleaned PR #20' }));

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: true,
      } as never);

      // outputJsonResult called for non-dry-run path
      expect(cleanWorktree).toHaveBeenCalledTimes(2);
      expect(createSuccessResult).toHaveBeenCalledWith(
        'cleanpr',
        expect.objectContaining({
          totalCleaned: 2,
          totalSkipped: 0,
        })
      );
      // printStatus should NOT be called in json mode
      expect(printStatus).not.toHaveBeenCalled();
    });

    it('includes skipped entries for failed cleanups', async () => {
      const wt1 = makeWorktree({ prNumber: 10, path: '/fake/repo.pr10' });
      const wt2 = makeWorktree({ prNumber: 20, path: '/fake/repo.pr20' });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt1, wt2]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt1, wt2]);
      vi.mocked(cleanWorktree)
        .mockReturnValueOnce(makeCleanupResult({ prNumber: 10, success: true }))
        .mockReturnValueOnce(
          makeCleanupResult({ prNumber: 20, success: false, message: 'Has uncommitted changes' })
        );

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: true,
      } as never);

      expect(createSuccessResult).toHaveBeenCalledWith(
        'cleanpr',
        expect.objectContaining({
          totalCleaned: 1,
          totalSkipped: 1,
        })
      );
    });
  });

  // =========================================================================
  // --all --json --dry-run: exercises outputJsonResult dry-run branch
  // =========================================================================

  describe('--all --json --dry-run with cleanable worktrees', () => {
    it('outputs dry-run JSON with wouldClean entries', async () => {
      const wt1 = makeWorktree({
        prNumber: 10,
        branch: 'feat/a',
        path: '/fake/repo.pr10',
        prState: 'MERGED',
      });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt1]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt1]);
      vi.mocked(cleanWorktree).mockReturnValue(
        makeCleanupResult({ prNumber: 10, success: true, dryRun: true })
      );

      await cleanCommand.handler({
        all: true,
        'dry-run': true,
        force: false,
        json: true,
      } as never);

      expect(createSuccessResult).toHaveBeenCalledWith(
        'cleanpr',
        expect.objectContaining({
          wouldClean: expect.arrayContaining([
            expect.objectContaining({ prNumber: 10, branch: 'feat/a' }),
          ]),
          totalWouldClean: 1,
          message: expect.stringContaining('Would clean 1 PR worktree'),
        })
      );
    });

    it('outputs dry-run JSON with zero wouldClean when all fail', async () => {
      const wt1 = makeWorktree({ prNumber: 10, path: '/fake/repo.pr10' });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt1]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt1]);
      vi.mocked(cleanWorktree).mockReturnValue(
        makeCleanupResult({ prNumber: 10, success: false, message: 'Failed' })
      );

      await cleanCommand.handler({
        all: true,
        'dry-run': true,
        force: false,
        json: true,
      } as never);

      expect(createSuccessResult).toHaveBeenCalledWith(
        'cleanpr',
        expect.objectContaining({
          wouldClean: [],
          totalWouldClean: 0,
          message: expect.stringContaining('No PR worktrees would be cleaned'),
        })
      );
    });
  });

  // =========================================================================
  // Specific PR number path (cleanSpecific)
  // =========================================================================

  describe('specific PR number', () => {
    it('cleans specific PR and outputs JSON result', async () => {
      const wt = makeWorktree({ prNumber: 42, branch: 'feat/thing', path: '/fake/repo.pr42' });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt]);
      vi.mocked(findWorktreeByPrNumber).mockReturnValue(wt);
      vi.mocked(cleanWorktree).mockReturnValue(makeCleanupResult({ prNumber: 42 }));

      await cleanCommand.handler({
        prNumber: 42,
        all: false,
        'dry-run': false,
        force: false,
        json: true,
      } as never);

      expect(findWorktreeByPrNumber).toHaveBeenCalled();
      expect(cleanWorktree).toHaveBeenCalledTimes(1);
      // JSON output via outputJsonResult
      expect(createSuccessResult).toHaveBeenCalledWith(
        'cleanpr',
        expect.objectContaining({
          totalCleaned: 1,
        })
      );
    });

    it('outputs JSON error when specific PR not found', async () => {
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(findWorktreeByPrNumber).mockReturnValue(undefined as never);

      await expect(
        cleanCommand.handler({
          prNumber: 999,
          all: false,
          'dry-run': false,
          force: false,
          json: true,
        } as never)
      ).rejects.toThrow(ExitError);

      // outputJsonError path
      expect(createErrorResult).toHaveBeenCalledWith(
        'cleanpr',
        ErrorCode.PR_NOT_FOUND,
        expect.stringContaining('No worktree found for PR #999')
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('prints error display when specific PR not found without --json', async () => {
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(findWorktreeByPrNumber).mockReturnValue(undefined as never);

      await expect(
        cleanCommand.handler({
          prNumber: 999,
          all: false,
          'dry-run': false,
          force: false,
          json: false,
        } as never)
      ).rejects.toThrow(ExitError);

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('No worktree found for PR #999'),
        })
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('prints success status for non-json specific PR cleanup', async () => {
      const wt = makeWorktree({ prNumber: 42 });
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt]);
      vi.mocked(findWorktreeByPrNumber).mockReturnValue(wt);
      vi.mocked(cleanWorktree).mockReturnValue(makeCleanupResult({ prNumber: 42, success: true }));

      await cleanCommand.handler({
        prNumber: 42,
        all: false,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      expect(printStatus).toHaveBeenCalledWith('info', expect.stringContaining('Cleaning PR #42'));
      expect(printDim).toHaveBeenCalled();
      expect(printStatus).toHaveBeenCalledWith(
        'success',
        expect.stringContaining('PR #42 worktree cleaned up successfully')
      );
      expect(printNextSteps).toHaveBeenCalled();
    });

    it('prints dry-run info status for specific PR', async () => {
      const wt = makeWorktree({ prNumber: 42 });
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt]);
      vi.mocked(findWorktreeByPrNumber).mockReturnValue(wt);
      vi.mocked(cleanWorktree).mockReturnValue(
        makeCleanupResult({ prNumber: 42, success: true, message: 'Would clean PR #42' })
      );

      await cleanCommand.handler({
        prNumber: 42,
        all: false,
        'dry-run': true,
        force: false,
        json: false,
      } as never);

      expect(printStatus).toHaveBeenCalledWith('info', expect.stringContaining('Would clean'));
    });

    it('prints warning and exits 1 on failed specific PR cleanup', async () => {
      const wt = makeWorktree({ prNumber: 42 });
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt]);
      vi.mocked(findWorktreeByPrNumber).mockReturnValue(wt);
      vi.mocked(cleanWorktree).mockReturnValue(
        makeCleanupResult({ prNumber: 42, success: false, message: 'Has uncommitted changes' })
      );

      await expect(
        cleanCommand.handler({
          prNumber: 42,
          all: false,
          'dry-run': false,
          force: false,
          json: false,
        } as never)
      ).rejects.toThrow(ExitError);

      expect(printStatus).toHaveBeenCalledWith('warning', 'Has uncommitted changes');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // =========================================================================
  // --all without --json: text output paths
  // =========================================================================

  describe('--all without --json (text output)', () => {
    it('prints info when no cleanable worktrees found', async () => {
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([]);

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      expect(printStatus).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('No merged or closed')
      );
    });

    it('prints success/warning per worktree and summary', async () => {
      const wt1 = makeWorktree({ prNumber: 10 });
      const wt2 = makeWorktree({ prNumber: 20 });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt1, wt2]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt1, wt2]);
      vi.mocked(cleanWorktree)
        .mockReturnValueOnce(
          makeCleanupResult({ prNumber: 10, success: true, message: 'Cleaned #10' })
        )
        .mockReturnValueOnce(
          makeCleanupResult({ prNumber: 20, success: false, message: 'Failed #20' })
        );
      vi.mocked(summarizeResults).mockReturnValue({ cleaned: 1, total: 2, failed: 1 });

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      expect(printStatus).toHaveBeenCalledWith('success', 'Cleaned #10');
      expect(printStatus).toHaveBeenCalledWith('warning', 'Failed #20');
      expect(printStatus).toHaveBeenCalledWith(
        'success',
        expect.stringContaining('Cleaned 1 of 2')
      );
    });

    it('prints dry-run summary for text output', async () => {
      const wt1 = makeWorktree({ prNumber: 10 });
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt1]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt1]);
      vi.mocked(cleanWorktree).mockReturnValue(
        makeCleanupResult({ prNumber: 10, success: true, message: 'Would clean' })
      );
      vi.mocked(summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await cleanCommand.handler({
        all: true,
        'dry-run': true,
        force: false,
        json: false,
      } as never);

      expect(printStatus).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('Would clean 1 of 1')
      );
    });

    it('shows next steps when worktrees were cleaned', async () => {
      const wt1 = makeWorktree({ prNumber: 10 });
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt1]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt1]);
      vi.mocked(cleanWorktree).mockReturnValue(makeCleanupResult({ prNumber: 10, success: true }));
      vi.mocked(summarizeResults).mockReturnValue({ cleaned: 1, total: 1, failed: 0 });

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      expect(printNextSteps).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Interactive mode with --json (not supported)
  // =========================================================================

  describe('interactive mode with --json', () => {
    it('outputs JSON error for interactive + json combination', async () => {
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([]);

      await expect(
        cleanCommand.handler({
          all: false,
          'dry-run': false,
          force: false,
          json: true,
          // prNumber is undefined -> interactive mode
        } as never)
      ).rejects.toThrow(ExitError);

      expect(createErrorResult).toHaveBeenCalledWith(
        'cleanpr',
        ErrorCode.INVALID_ARGUMENT,
        expect.stringContaining('Interactive mode not supported')
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // =========================================================================
  // printWorktree coverage (via interactiveClean path)
  // =========================================================================

  describe('interactive mode (non-json)', () => {
    it('prints grouped worktrees and shows no-cleanable message', async () => {
      const openWt = makeWorktree({ prNumber: 10, prState: 'OPEN', branch: 'feat/open' });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([openWt]);
      vi.mocked(groupWorktreesByState).mockReturnValue({
        merged: [],
        closed: [],
        open: [openWt],
        unknown: [],
      });
      vi.mocked(getCleanableWorktrees).mockReturnValue([]);

      await cleanCommand.handler({
        all: false,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      // printWorktree is called for open worktrees
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR #10: feat/open'));
      expect(printStatus).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('No merged or closed PRs to clean')
      );
    });

    it('prints all four groups when all states present', async () => {
      const merged = makeWorktree({ prNumber: 1, prState: 'MERGED', branch: 'feat/merged' });
      const closed = makeWorktree({ prNumber: 2, prState: 'CLOSED', branch: 'feat/closed' });
      const open = makeWorktree({ prNumber: 3, prState: 'OPEN', branch: 'feat/open' });
      const unknown = makeWorktree({ prNumber: 4, prState: 'UNKNOWN', branch: 'feat/unknown' });

      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([merged, closed, open, unknown]);
      vi.mocked(groupWorktreesByState).mockReturnValue({
        merged: [merged],
        closed: [closed],
        open: [open],
        unknown: [unknown],
      });
      vi.mocked(getCleanableWorktrees).mockReturnValue([]);

      await cleanCommand.handler({
        all: false,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      // Each group header is printed
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Merged (1)'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Closed (1)'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Open (1)'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Unknown (1)'));
      // printWorktree called for each
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR #1: feat/merged'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR #2: feat/closed'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR #3: feat/open'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR #4: feat/unknown'));
    });

    it('prints "No PR worktrees found" when list is empty', async () => {
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([]);

      await cleanCommand.handler({
        all: false,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      expect(printStatus).toHaveBeenCalledWith('info', 'No PR worktrees found.');
    });
  });

  // =========================================================================
  // printWorktree with changes indicator
  // =========================================================================

  describe('printWorktree with changes', () => {
    it('includes change indicator in output', async () => {
      const wt = makeWorktree({ prNumber: 55, branch: 'feat/dirty', hasChanges: true });

      vi.mocked(changeIndicator).mockReturnValue(' [modified]');
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt]);
      vi.mocked(groupWorktreesByState).mockReturnValue({
        merged: [wt],
        closed: [],
        open: [],
        unknown: [],
      });
      vi.mocked(getCleanableWorktrees).mockReturnValue([]);

      await cleanCommand.handler({
        all: false,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      expect(changeIndicator).toHaveBeenCalledWith(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('PR #55: feat/dirty [modified]')
      );
    });
  });

  // =========================================================================
  // Options mapping
  // =========================================================================

  describe('options mapping', () => {
    it('maps --delete-remote to options.deleteRemote', async () => {
      const wt = makeWorktree({ prNumber: 42 });
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt]);
      vi.mocked(cleanWorktree).mockReturnValue(makeCleanupResult());

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        'delete-remote': true,
        json: false,
      } as never);

      expect(cleanWorktree).toHaveBeenCalledWith(
        wt,
        expect.objectContaining({ deleteRemote: true }),
        expect.any(Object)
      );
    });

    it('maps --force to options.force', async () => {
      const wt = makeWorktree({ prNumber: 42 });
      vi.mocked(gatherPrWorktreeInfo).mockResolvedValue([wt]);
      vi.mocked(getCleanableWorktrees).mockReturnValue([wt]);
      vi.mocked(cleanWorktree).mockReturnValue(makeCleanupResult());

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: true,
        json: false,
      } as never);

      expect(cleanWorktree).toHaveBeenCalledWith(
        wt,
        expect.objectContaining({ force: true }),
        expect.any(Object)
      );
    });
  });

  // =========================================================================
  // JSON mode skips spinner
  // =========================================================================

  describe('spinner behavior', () => {
    it('skips spinner in json mode and calls gatherPrWorktreeInfo directly', async () => {
      const { withSpinner } = await import('../../lib/prompts.js');

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: true,
      } as never);

      expect(withSpinner).not.toHaveBeenCalled();
      expect(gatherPrWorktreeInfo).toHaveBeenCalled();
    });

    it('uses spinner in non-json mode', async () => {
      const { withSpinner } = await import('../../lib/prompts.js');

      await cleanCommand.handler({
        all: true,
        'dry-run': false,
        force: false,
        json: false,
      } as never);

      expect(withSpinner).toHaveBeenCalledWith('Scanning worktrees...', expect.any(Function));
    });
  });
});
