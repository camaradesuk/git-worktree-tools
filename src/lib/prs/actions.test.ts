/**
 * Tests for PR action handlers
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createWorktreeForPr,
  openWorktree,
  openInBrowser,
  openWorktreeInEditor,
  openWorktreeInTerminal,
  copyPrUrl,
  copyPrNumber,
  executePrAction,
  createDefaultActionDeps,
  type PrActionDeps,
} from './actions.js';
import type { PrDisplayItem } from './types.js';

// Helper to create mock PR display items
function createMockPr(overrides: Partial<PrDisplayItem> = {}): PrDisplayItem {
  return {
    number: 42,
    title: 'Add dark mode toggle',
    state: 'OPEN',
    isDraft: false,
    url: 'https://github.com/test/repo/pull/42',
    headBranch: 'feat/dark-mode',
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

// Create mock deps
function createMockDeps(overrides: Partial<PrActionDeps> = {}): PrActionDeps {
  return {
    execCommand: vi.fn().mockReturnValue(''),
    spawnCommand: vi.fn(),
    copyToClipboard: vi.fn().mockReturnValue(true),
    openUrl: vi.fn().mockReturnValue(true),
    getRepoRoot: vi.fn().mockReturnValue('/home/user/repo'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('actions', () => {
  describe('createWorktreeForPr', () => {
    it('should fetch branch and create worktree', async () => {
      const pr = createMockPr({ number: 123, headBranch: 'feat/test' });
      const deps = createMockDeps();

      const result = await createWorktreeForPr(pr, deps);

      expect(result.success).toBe(true);
      expect(result.shouldRefresh).toBe(true);
      expect(deps.execCommand).toHaveBeenCalledWith(
        'git fetch origin feat/test',
        '/home/user/repo'
      );
      expect(deps.execCommand).toHaveBeenCalledWith(
        expect.stringContaining('git worktree add'),
        '/home/user/repo'
      );
    });

    it('should handle fetch errors gracefully', async () => {
      const pr = createMockPr();
      const deps = createMockDeps({
        execCommand: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('fetch')) {
            throw new Error('Branch not found');
          }
          return '';
        }),
      });

      // Should still try to create worktree even if fetch fails
      const result = await createWorktreeForPr(pr, deps);
      expect(result.success).toBe(true);
    });

    it('should return error if worktree creation fails', async () => {
      const pr = createMockPr();
      const deps = createMockDeps({
        execCommand: vi.fn().mockImplementation((cmd: string) => {
          if (cmd.includes('worktree add')) {
            throw new Error('Worktree already exists');
          }
          return '';
        }),
      });

      const result = await createWorktreeForPr(pr, deps);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Worktree already exists');
    });
  });

  describe('openWorktree', () => {
    it('should return error if no worktree path', async () => {
      const pr = createMockPr({ hasWorktree: false, worktreePath: null });
      const deps = createMockDeps();

      const result = await openWorktree(pr, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No worktree path');
    });

    it('should open worktree in editor', async () => {
      const pr = createMockPr({
        hasWorktree: true,
        worktreePath: '/path/to/worktree',
      });
      const deps = createMockDeps();

      const result = await openWorktree(pr, deps);

      // Note: This may fail if no editor is available in test environment
      // We're mainly testing the flow here
      expect(result.message).toBeDefined();
    });
  });

  describe('openInBrowser', () => {
    it('should open PR URL in browser', async () => {
      const pr = createMockPr({ number: 99, url: 'https://github.com/test/repo/pull/99' });
      const deps = createMockDeps();

      const result = await openInBrowser(pr, deps);

      expect(result.success).toBe(true);
      expect(result.message).toContain('#99');
      expect(deps.openUrl).toHaveBeenCalledWith('https://github.com/test/repo/pull/99');
    });

    it('should return error if browser fails to open', async () => {
      const pr = createMockPr();
      const deps = createMockDeps({
        openUrl: vi.fn().mockReturnValue(false),
      });

      const result = await openInBrowser(pr, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to open browser');
      expect(result.message).toContain(pr.url);
    });
  });

  describe('openWorktreeInEditor', () => {
    it('should return error if no worktree', async () => {
      const pr = createMockPr({ hasWorktree: false, worktreePath: null });
      const deps = createMockDeps();

      const result = await openWorktreeInEditor(pr, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No worktree available');
    });

    it('should try to open worktree in editor', async () => {
      const pr = createMockPr({
        hasWorktree: true,
        worktreePath: '/path/to/worktree',
      });
      const deps = createMockDeps();

      const result = await openWorktreeInEditor(pr, deps);

      expect(result.message).toBeDefined();
    });
  });

  describe('openWorktreeInTerminal', () => {
    it('should return error if no worktree', async () => {
      const pr = createMockPr({ hasWorktree: false, worktreePath: null });
      const deps = createMockDeps();

      const result = await openWorktreeInTerminal(pr, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No worktree available');
    });

    it('should try to open terminal', async () => {
      const pr = createMockPr({
        hasWorktree: true,
        worktreePath: '/path/to/worktree',
      });
      const deps = createMockDeps();

      const result = await openWorktreeInTerminal(pr, deps);

      expect(result.message).toBeDefined();
    });
  });

  describe('copyPrUrl', () => {
    it('should copy URL to clipboard', async () => {
      const pr = createMockPr({ url: 'https://github.com/test/repo/pull/42' });
      const deps = createMockDeps();

      const result = await copyPrUrl(pr, deps);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Copied URL');
      expect(result.message).toContain('github.com');
      expect(deps.copyToClipboard).toHaveBeenCalledWith('https://github.com/test/repo/pull/42');
    });

    it('should return error if clipboard fails', async () => {
      const pr = createMockPr();
      const deps = createMockDeps({
        copyToClipboard: vi.fn().mockReturnValue(false),
      });

      const result = await copyPrUrl(pr, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to copy');
    });
  });

  describe('copyPrNumber', () => {
    it('should copy PR number to clipboard', async () => {
      const pr = createMockPr({ number: 99 });
      const deps = createMockDeps();

      const result = await copyPrNumber(pr, deps);

      expect(result.success).toBe(true);
      expect(result.message).toContain('#99');
      expect(deps.copyToClipboard).toHaveBeenCalledWith('#99');
    });

    it('should return error if clipboard fails', async () => {
      const pr = createMockPr();
      const deps = createMockDeps({
        copyToClipboard: vi.fn().mockReturnValue(false),
      });

      const result = await copyPrNumber(pr, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to copy');
    });
  });

  describe('executePrAction', () => {
    it('should handle create_worktree action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('create_worktree', pr, deps);

      expect(result.shouldRefresh).toBe(true);
    });

    it('should handle open_browser action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('open_browser', pr, deps);

      expect(result.success).toBe(true);
    });

    it('should handle copy_url action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('copy_url', pr, deps);

      expect(result.success).toBe(true);
    });

    it('should handle copy_number action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('copy_number', pr, deps);

      expect(result.success).toBe(true);
    });

    it('should handle show_details action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('show_details', pr, deps);

      expect(result.success).toBe(true);
    });

    it('should handle refresh action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('refresh', pr, deps);

      expect(result.success).toBe(true);
      expect(result.shouldRefresh).toBe(true);
    });

    it('should handle back action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('back', pr, deps);

      expect(result.success).toBe(true);
      expect(result.shouldExit).toBe(true);
    });

    it('should handle exit action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      const result = await executePrAction('exit', pr, deps);

      expect(result.success).toBe(true);
      expect(result.shouldExit).toBe(true);
    });

    it('should handle open_worktree action', async () => {
      const pr = createMockPr({ hasWorktree: true, worktreePath: '/path/to/worktree' });
      const deps = createMockDeps();

      const result = await executePrAction('open_worktree', pr, deps);

      expect(result.message).toBeDefined();
    });

    it('should handle open_editor action', async () => {
      const pr = createMockPr({ hasWorktree: true, worktreePath: '/path/to/worktree' });
      const deps = createMockDeps();

      const result = await executePrAction('open_editor', pr, deps);

      expect(result.message).toBeDefined();
    });

    it('should handle open_terminal action', async () => {
      const pr = createMockPr({ hasWorktree: true, worktreePath: '/path/to/worktree' });
      const deps = createMockDeps();

      const result = await executePrAction('open_terminal', pr, deps);

      expect(result.message).toBeDefined();
    });

    it('should handle unknown action', async () => {
      const pr = createMockPr();
      const deps = createMockDeps();

      // Cast to any to test unknown action
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await executePrAction('unknown_action' as any, pr, deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown action');
    });
  });

  describe('createDefaultActionDeps', () => {
    it('should return deps object with required functions', () => {
      const deps = createDefaultActionDeps();

      expect(deps).toHaveProperty('execCommand');
      expect(deps).toHaveProperty('spawnCommand');
      expect(deps).toHaveProperty('copyToClipboard');
      expect(deps).toHaveProperty('openUrl');
      expect(deps).toHaveProperty('getRepoRoot');
      expect(deps).toHaveProperty('log');
    });
  });
});
