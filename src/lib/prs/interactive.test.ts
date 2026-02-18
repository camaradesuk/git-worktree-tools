/**
 * Tests for PR interactive browser
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getActionForShortcut,
  filterPrsBySearch,
  formatPrChoice,
  printPrHeader,
  runPrInteractiveMode,
  createDefaultPrInteractiveDeps,
  type PrInteractiveDeps,
} from './interactive.js';
import type { PrDisplayItem, PrFilterState } from './types.js';
import { createDefaultFilterState } from './types.js';

// Helper to create mock PR display items
function createMockPr(overrides: Partial<PrDisplayItem> = {}): PrDisplayItem {
  return {
    number: 1,
    title: 'Test PR',
    state: 'OPEN',
    isDraft: false,
    url: 'https://github.com/test/repo/pull/1',
    headBranch: 'feat/test',
    baseBranch: 'main',
    author: 'testuser',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    labels: [],
    reviewDecision: null,
    approvalCount: 0,
    reviewCount: 0,
    checksStatus: null,
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    hasWorktree: false,
    worktreePath: null,
    ...overrides,
  };
}

// Helper to create mock interactive deps with sensible defaults
function createMockDeps(overrides: Partial<PrInteractiveDeps> = {}): PrInteractiveDeps {
  return {
    selectPr: vi.fn().mockResolvedValue({ pr: null, action: null }),
    pressEnterToContinue: vi.fn().mockResolvedValue(undefined),
    showDetails: vi.fn().mockResolvedValue('back'),
    executeAction: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe('interactive', () => {
  describe('getActionForShortcut', () => {
    it('should return create_worktree for "w" when PR has no worktree', () => {
      const pr = createMockPr({ hasWorktree: false });
      expect(getActionForShortcut('w', pr)).toBe('create_worktree');
    });

    it('should return open_worktree for "w" when PR has worktree', () => {
      const pr = createMockPr({ hasWorktree: true, worktreePath: '/path/to/worktree' });
      expect(getActionForShortcut('w', pr)).toBe('open_worktree');
    });

    it('should return open_browser for "b"', () => {
      const pr = createMockPr();
      expect(getActionForShortcut('b', pr)).toBe('open_browser');
    });

    it('should return null for "e" when PR has no worktree', () => {
      const pr = createMockPr({ hasWorktree: false });
      expect(getActionForShortcut('e', pr)).toBe(null);
    });

    it('should return open_editor for "e" when PR has worktree', () => {
      const pr = createMockPr({ hasWorktree: true, worktreePath: '/path/to/worktree' });
      expect(getActionForShortcut('e', pr)).toBe('open_editor');
    });

    it('should return null for "t" when PR has no worktree', () => {
      const pr = createMockPr({ hasWorktree: false });
      expect(getActionForShortcut('t', pr)).toBe(null);
    });

    it('should return open_terminal for "t" when PR has worktree', () => {
      const pr = createMockPr({ hasWorktree: true, worktreePath: '/path/to/worktree' });
      expect(getActionForShortcut('t', pr)).toBe('open_terminal');
    });

    it('should return copy_url for "c"', () => {
      const pr = createMockPr();
      expect(getActionForShortcut('c', pr)).toBe('copy_url');
    });

    it('should return copy_number for "n"', () => {
      const pr = createMockPr();
      expect(getActionForShortcut('n', pr)).toBe('copy_number');
    });

    it('should return null for "d" (now a filter key, not a PR action)', () => {
      const pr = createMockPr();
      // 'd' is now used for drafts filter toggle, not show_details
      expect(getActionForShortcut('d', pr)).toBe(null);
    });

    it('should return refresh for "r"', () => {
      const pr = createMockPr();
      expect(getActionForShortcut('r', pr)).toBe('refresh');
    });

    it('should return exit for "q"', () => {
      const pr = createMockPr();
      expect(getActionForShortcut('q', pr)).toBe('exit');
    });

    it('should return null for unknown key', () => {
      const pr = createMockPr();
      expect(getActionForShortcut('z', pr)).toBe(null);
    });
  });

  describe('filterPrsBySearch', () => {
    const prs = [
      createMockPr({
        number: 1,
        title: 'Add dark mode',
        author: 'alice',
        headBranch: 'feat/dark-mode',
      }),
      createMockPr({ number: 2, title: 'Fix login bug', author: 'bob', headBranch: 'fix/login' }),
      createMockPr({ number: 3, title: 'Update docs', author: 'alice', headBranch: 'docs/update' }),
    ];

    it('should return all PRs when no search pattern', () => {
      const result = filterPrsBySearch(prs, '');
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.originalIndex)).toEqual([0, 1, 2]);
    });

    it('should filter by title', () => {
      const result = filterPrsBySearch(prs, 'dark');
      expect(result).toHaveLength(1);
      expect(result[0].pr.number).toBe(1);
    });

    it('should filter by PR number', () => {
      const result = filterPrsBySearch(prs, '#2');
      expect(result).toHaveLength(1);
      expect(result[0].pr.number).toBe(2);
    });

    it('should filter by author', () => {
      const result = filterPrsBySearch(prs, '@alice');
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.pr.number)).toEqual([1, 3]);
    });

    it('should filter by branch name', () => {
      const result = filterPrsBySearch(prs, 'feat/dark');
      expect(result).toHaveLength(1);
      expect(result[0].pr.number).toBe(1);
    });

    it('should be case-insensitive', () => {
      const result = filterPrsBySearch(prs, 'DARK');
      expect(result).toHaveLength(1);
      expect(result[0].pr.number).toBe(1);
    });

    it('should preserve original indices', () => {
      const result = filterPrsBySearch(prs, 'alice');
      expect(result).toHaveLength(2);
      expect(result[0].originalIndex).toBe(0);
      expect(result[1].originalIndex).toBe(2);
    });
  });

  describe('formatPrChoice', () => {
    it('should format selected PR with indicator', () => {
      const pr = createMockPr({ number: 42, title: 'Test PR' });
      const result = formatPrChoice(pr, 4, true, 'preview');
      expect(result).toContain('❯');
    });

    it('should format unselected PR without indicator', () => {
      const pr = createMockPr({ number: 42, title: 'Test PR' });
      const result = formatPrChoice(pr, 4, false, 'preview');
      expect(result.startsWith('  ')).toBe(true);
      expect(result).not.toContain('❯');
    });

    it('should include PR number', () => {
      const pr = createMockPr({ number: 123, title: 'Test PR' });
      const result = formatPrChoice(pr, 5, false, 'preview');
      expect(result).toContain('#123');
    });
  });

  describe('printPrHeader', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should print header, summary, and filter indicator', () => {
      const prs = [createMockPr(), createMockPr({ state: 'MERGED' })];
      const filterState = createDefaultFilterState();

      printPrHeader('test-repo', prs, filterState);

      expect(consoleSpy).toHaveBeenCalled();
      const allOutput = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(allOutput).toContain('test-repo');
      expect(allOutput).toContain('2 PRs');
      expect(allOutput).toContain('Showing:');
    });
  });

  describe('runPrInteractiveMode', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;
    let clearSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      clearSpy.mockRestore();
    });

    it('should stay interactive when no PRs found and allow exit', async () => {
      const deps = createMockDeps({
        selectPr: vi.fn().mockResolvedValue({ pr: null, action: 'exit' }),
      });

      await runPrInteractiveMode([], 'test-repo', 'preview', undefined, deps);

      // Should still call selectPr to allow user to quit gracefully
      expect(deps.selectPr).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('should exit on null PR selection (exit selected)', async () => {
      const prs = [createMockPr()];
      const deps = createMockDeps({
        selectPr: vi.fn().mockResolvedValue({ pr: null, action: null }),
      });

      await runPrInteractiveMode(prs, 'test-repo', 'preview', undefined, deps);

      expect(deps.selectPr).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('should exit on exit action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps({
        selectPr: vi.fn().mockResolvedValue({ pr, action: 'exit' }),
      });

      await runPrInteractiveMode([pr], 'test-repo', 'preview', undefined, deps);

      expect(deps.selectPr).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Goodbye'));
    });

    it('should execute action and show success message when action is selected', async () => {
      const pr = createMockPr({ number: 42 });
      let callCount = 0;
      const mockExecuteAction = vi.fn().mockResolvedValue({
        success: true,
        message: 'Opened PR #42 in browser',
      });
      const deps = createMockDeps({
        selectPr: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ pr, action: 'open_browser' });
          }
          return Promise.resolve({ pr: null, action: null });
        }),
        executeAction: mockExecuteAction,
      });

      await runPrInteractiveMode([pr], 'test-repo', 'preview', undefined, deps);

      expect(mockExecuteAction).toHaveBeenCalledWith('open_browser', pr);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Opened PR #42 in browser'));
      expect(deps.pressEnterToContinue).toHaveBeenCalled();
    });

    it('should show detail view when PR is selected without action', async () => {
      const pr = createMockPr({ number: 42, title: 'Test PR' });
      let callCount = 0;
      const mockShowDetails = vi.fn().mockResolvedValue('back');
      const deps = createMockDeps({
        selectPr: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ pr, action: null });
          }
          return Promise.resolve({ pr: null, action: null });
        }),
        showDetails: mockShowDetails,
      });

      await runPrInteractiveMode([pr], 'test-repo', 'preview', undefined, deps);

      expect(mockShowDetails).toHaveBeenCalledWith(pr);
    });

    it('should switch to MERGED filter when filter_show_merged action is received', async () => {
      const openPr = createMockPr({ number: 1, state: 'OPEN' });
      const mergedPr = createMockPr({ number: 2, state: 'MERGED' });
      let callCount = 0;
      const deps = createMockDeps({
        selectPr: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call: switch to show MERGED only
            return Promise.resolve({ pr: null, action: 'filter_show_merged' });
          }
          if (callCount === 2) {
            // Second call: exit
            return Promise.resolve({ pr: null, action: 'exit' });
          }
          return Promise.resolve({ pr: null, action: null });
        }),
      });

      // Start with default filter (OPEN only), pass both PRs
      await runPrInteractiveMode([openPr, mergedPr], 'test-repo', 'preview', undefined, deps);

      // Should have been called twice - once for filter change, once for exit
      expect(deps.selectPr).toHaveBeenCalledTimes(2);
    });

    it('should re-filter PRs after exclusive state selection', async () => {
      const openPr = createMockPr({ number: 1, state: 'OPEN' });
      const mergedPr = createMockPr({ number: 2, state: 'MERGED' });
      const receivedPrs: PrDisplayItem[][] = [];
      let callCount = 0;
      const deps = createMockDeps({
        selectPr: vi.fn().mockImplementation((prs: PrDisplayItem[]) => {
          receivedPrs.push([...prs]);
          callCount++;
          if (callCount === 1) {
            // First call with OPEN filter: should see 1 PR (open)
            return Promise.resolve({ pr: null, action: 'filter_show_merged' });
          }
          if (callCount === 2) {
            // Second call after switching to MERGED: should see 1 PR (merged)
            return Promise.resolve({ pr: null, action: 'filter_show_all' });
          }
          if (callCount === 3) {
            // Third call after showing ALL: should see 2 PRs
            return Promise.resolve({ pr: null, action: 'exit' });
          }
          return Promise.resolve({ pr: null, action: null });
        }),
      });

      // Start with default filter (OPEN only)
      await runPrInteractiveMode([openPr, mergedPr], 'test-repo', 'preview', undefined, deps);

      // First call: OPEN only -> 1 PR (the open one)
      expect(receivedPrs[0]).toHaveLength(1);
      expect(receivedPrs[0][0].state).toBe('OPEN');

      // Second call: MERGED only -> 1 PR (the merged one)
      expect(receivedPrs[1]).toHaveLength(1);
      expect(receivedPrs[1][0].state).toBe('MERGED');

      // Third call: ALL states -> 2 PRs
      expect(receivedPrs[2]).toHaveLength(2);
    });

    it('should cycle draft filter when filter_toggle_drafts action is received', async () => {
      const regularPr = createMockPr({ number: 1, state: 'OPEN', isDraft: false });
      const draftPr = createMockPr({ number: 2, state: 'OPEN', isDraft: true });
      const receivedPrs: PrDisplayItem[][] = [];
      let callCount = 0;
      const deps = createMockDeps({
        selectPr: vi.fn().mockImplementation((prs: PrDisplayItem[]) => {
          receivedPrs.push([...prs]);
          callCount++;
          if (callCount === 1) {
            // First call: includes drafts (default) -> toggle to drafts only
            return Promise.resolve({ pr: null, action: 'filter_toggle_drafts' });
          }
          if (callCount === 2) {
            // Second call: drafts only -> toggle to exclude drafts
            return Promise.resolve({ pr: null, action: 'filter_toggle_drafts' });
          }
          if (callCount === 3) {
            // Third call: no drafts -> toggle back to include
            return Promise.resolve({ pr: null, action: 'exit' });
          }
          return Promise.resolve({ pr: null, action: null });
        }),
      });

      await runPrInteractiveMode([regularPr, draftPr], 'test-repo', 'preview', undefined, deps);

      // First call: include drafts (default) -> 2 PRs
      expect(receivedPrs[0]).toHaveLength(2);

      // Second call: drafts only -> 1 PR (the draft)
      expect(receivedPrs[1]).toHaveLength(1);
      expect(receivedPrs[1][0].isDraft).toBe(true);

      // Third call: no drafts -> 1 PR (the non-draft)
      expect(receivedPrs[2]).toHaveLength(1);
      expect(receivedPrs[2][0].isDraft).toBe(false);
    });
  });

  describe('createDefaultPrInteractiveDeps', () => {
    it('should return deps object with required functions', () => {
      const deps = createDefaultPrInteractiveDeps();
      expect(deps).toHaveProperty('selectPr');
      expect(deps).toHaveProperty('pressEnterToContinue');
      expect(typeof deps.selectPr).toBe('function');
      expect(typeof deps.pressEnterToContinue).toBe('function');
    });
  });

  describe('selectPrWithShortcuts terminal cleanup (via createDefaultPrInteractiveDeps)', () => {
    let originalIsTTY: boolean | undefined;
    let mockStdinOn: ReturnType<typeof vi.fn>;
    let mockStdinRemoveListener: ReturnType<typeof vi.fn>;
    let mockStdinSetRawMode: ReturnType<typeof vi.fn>;
    let mockStdinResume: ReturnType<typeof vi.fn>;
    let mockStdinPause: ReturnType<typeof vi.fn>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockStdoutWrite: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let processOnSpy: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let processRemoveListenerSpy: any;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;

      // Set up TTY mode
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });

      // Mock stdin methods
      mockStdinOn = vi.fn().mockReturnValue(process.stdin);
      mockStdinRemoveListener = vi.fn().mockReturnValue(process.stdin);
      mockStdinSetRawMode = vi.fn();
      mockStdinResume = vi.fn();
      mockStdinPause = vi.fn();

      // Apply mocks to process.stdin
      vi.spyOn(process.stdin, 'on').mockImplementation(mockStdinOn);
      vi.spyOn(process.stdin, 'removeListener').mockImplementation(mockStdinRemoveListener);

      Object.defineProperty(process.stdin, 'setRawMode', {
        value: mockStdinSetRawMode,
        writable: true,
        configurable: true,
      });
      vi.spyOn(process.stdin, 'resume').mockImplementation(mockStdinResume);
      vi.spyOn(process.stdin, 'pause').mockImplementation(mockStdinPause);

      // Mock stdout.write to prevent rendering output during tests
      mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      // Spy on process.on and process.removeListener for signal handler tracking
      processOnSpy = vi.spyOn(process, 'on');
      processRemoveListenerSpy = vi.spyOn(process, 'removeListener');

      // Suppress console output during render
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'clear').mockImplementation(() => {});
    });

    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
      vi.restoreAllMocks();
    });

    it('should resolve with null result on Ctrl+C instead of calling process.exit', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      // Capture the data handler and simulate Ctrl+C
      mockStdinOn.mockImplementation((event: string, handler: (key: Buffer) => void) => {
        if (event === 'data') {
          // Simulate Ctrl+C keypress after setup
          setImmediate(() => {
            handler(Buffer.from('\x03'));
          });
        }
        return process.stdin;
      });

      const deps = createDefaultPrInteractiveDeps();
      const prs = [createMockPr({ number: 1, title: 'Test PR' })];
      const filterState = createDefaultFilterState();

      const result = await deps.selectPr(prs, filterState);

      // Should resolve with null pr and null action (graceful exit)
      expect(result.pr).toBeNull();
      expect(result.action).toBeNull();

      // process.exit should NOT have been called
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should restore raw mode on Ctrl+C cleanup', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      mockStdinOn.mockImplementation((event: string, handler: (key: Buffer) => void) => {
        if (event === 'data') {
          setImmediate(() => {
            handler(Buffer.from('\x03'));
          });
        }
        return process.stdin;
      });

      const deps = createDefaultPrInteractiveDeps();
      const prs = [createMockPr()];
      const filterState = createDefaultFilterState();

      await deps.selectPr(prs, filterState);

      // setRawMode should have been called with true (setup) then false (cleanup)
      expect(mockStdinSetRawMode).toHaveBeenCalledWith(true);
      expect(mockStdinSetRawMode).toHaveBeenCalledWith(false);
      // The last call should be false (cleanup)
      const calls = mockStdinSetRawMode.mock.calls;
      expect(calls[calls.length - 1][0]).toBe(false);
    });

    it('should register SIGINT handler when raw mode starts', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      mockStdinOn.mockImplementation((event: string, handler: (key: Buffer) => void) => {
        if (event === 'data') {
          // Simulate 'q' to exit cleanly
          setImmediate(() => {
            handler(Buffer.from('q'));
          });
        }
        return process.stdin;
      });

      const deps = createDefaultPrInteractiveDeps();
      const prs = [createMockPr()];
      const filterState = createDefaultFilterState();

      await deps.selectPr(prs, filterState);

      // process.on should have been called with 'SIGINT'
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should remove SIGINT handler during cleanup', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      mockStdinOn.mockImplementation((event: string, handler: (key: Buffer) => void) => {
        if (event === 'data') {
          // Simulate 'q' to exit cleanly
          setImmediate(() => {
            handler(Buffer.from('q'));
          });
        }
        return process.stdin;
      });

      const deps = createDefaultPrInteractiveDeps();
      const prs = [createMockPr()];
      const filterState = createDefaultFilterState();

      await deps.selectPr(prs, filterState);

      // process.removeListener should have been called for SIGINT and SIGTERM
      expect(processRemoveListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processRemoveListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should restore cursor visibility in cleanup', async () => {
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      mockStdinOn.mockImplementation((event: string, handler: (key: Buffer) => void) => {
        if (event === 'data') {
          setImmediate(() => {
            handler(Buffer.from('\x03'));
          });
        }
        return process.stdin;
      });

      const deps = createDefaultPrInteractiveDeps();
      const prs = [createMockPr()];
      const filterState = createDefaultFilterState();

      await deps.selectPr(prs, filterState);

      // Cursor show escape sequence should have been written during cleanup
      expect(mockStdoutWrite).toHaveBeenCalledWith('\x1b[?25h');
    });
  });
});
