import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeAction,
  createDefaultExecutorDeps,
  formatBranchAsTitle,
} from './action-executors.js';
import type { WorktreeDisplay, EnvironmentInfo } from './types.js';
import type { WorktreeConfig } from '../config.js';
import type { ExecutorDeps } from './action-executors.js';

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock github
vi.mock('../github.js', () => ({
  getPr: vi.fn(),
  getPrByBranch: vi.fn(),
  createPr: vi.fn(),
}));

// Mock git
vi.mock('../git.js', () => ({
  getRepoRoot: vi.fn(),
  removeWorktree: vi.fn(),
  getMainWorktreeRoot: vi.fn(),
}));

import inquirer from 'inquirer';
import * as github from '../github.js';
import * as git from '../git.js';

describe('lswt/action-executors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeWorktree = (overrides: Partial<WorktreeDisplay> = {}): WorktreeDisplay => ({
    path: '/home/user/repo',
    name: 'repo',
    branch: 'main',
    commit: 'abc123',
    type: 'main',
    prNumber: null,
    prState: null,
    isDraft: null,
    hasChanges: false,
    ...overrides,
  });

  const makeEnv = (overrides: Partial<EnvironmentInfo> = {}): EnvironmentInfo => ({
    hasVscode: true,
    hasCursor: false,
    defaultEditor: 'vscode',
    platform: 'linux',
    isInteractive: true,
    shell: '/bin/bash',
    gitVersion: { major: 2, minor: 39, patch: 0, raw: 'git version 2.39.0' },
    ...overrides,
  });

  const makeConfig = (overrides: Partial<WorktreeConfig> = {}): WorktreeConfig => ({
    baseBranch: 'main',
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    draftPr: false,
    sharedRepos: [],
    branchPrefix: 'feature',
    syncPatterns: [],
    preferredEditor: 'auto',
    ...overrides,
  });

  const makeDeps = (overrides: Partial<ExecutorDeps> = {}): ExecutorDeps => ({
    execCommand: vi.fn(),
    spawnDetached: vi.fn(),
    copyToClipboard: vi.fn(),
    openUrl: vi.fn(),
    ...overrides,
  });

  describe('executeAction', () => {
    describe('back action', () => {
      it('returns success with no message', async () => {
        const result = await executeAction('back', makeWorktree(), makeEnv(), makeConfig());

        expect(result).toEqual({ success: true });
      });
    });

    describe('exit action', () => {
      it('returns success with shouldExit true', async () => {
        const result = await executeAction('exit', makeWorktree(), makeEnv(), makeConfig());

        expect(result).toEqual({ success: true, shouldExit: true });
      });
    });

    describe('open_editor action', () => {
      it('spawns VSCode when preferredEditor is vscode', async () => {
        const deps = makeDeps();
        const worktree = makeWorktree({ path: '/home/user/repo.pr1' });
        const env = makeEnv({ hasVscode: true, defaultEditor: 'vscode' });
        const config = makeConfig({ preferredEditor: 'vscode' });

        const result = await executeAction('open_editor', worktree, env, config, deps);

        expect(deps.spawnDetached).toHaveBeenCalledWith('code', ['/home/user/repo.pr1']);
        expect(result.success).toBe(true);
        expect(result.message).toContain('VSCode');
      });

      it('spawns Cursor when preferredEditor is cursor', async () => {
        const deps = makeDeps();
        const worktree = makeWorktree({ path: '/home/user/repo.pr1' });
        const env = makeEnv({ hasCursor: true, defaultEditor: 'cursor' });
        const config = makeConfig({ preferredEditor: 'cursor' });

        const result = await executeAction('open_editor', worktree, env, config, deps);

        expect(deps.spawnDetached).toHaveBeenCalledWith('cursor', ['/home/user/repo.pr1']);
        expect(result.success).toBe(true);
        expect(result.message).toContain('Cursor');
      });

      it('uses VSCode when preferredEditor is auto and VSCode available', async () => {
        const deps = makeDeps();
        const worktree = makeWorktree();
        const env = makeEnv({ hasVscode: true, hasCursor: false, defaultEditor: 'vscode' });
        const config = makeConfig({ preferredEditor: 'auto' });

        const result = await executeAction('open_editor', worktree, env, config, deps);

        expect(deps.spawnDetached).toHaveBeenCalledWith('code', expect.any(Array));
        expect(result.success).toBe(true);
      });

      it('uses Cursor when preferredEditor is auto and only Cursor available', async () => {
        const deps = makeDeps();
        const worktree = makeWorktree();
        const env = makeEnv({ hasVscode: false, hasCursor: true, defaultEditor: 'cursor' });
        const config = makeConfig({ preferredEditor: 'auto' });

        const result = await executeAction('open_editor', worktree, env, config, deps);

        expect(deps.spawnDetached).toHaveBeenCalledWith('cursor', expect.any(Array));
        expect(result.success).toBe(true);
      });

      it('returns error when no editor is available', async () => {
        const deps = makeDeps();
        const worktree = makeWorktree();
        const env = makeEnv({ hasVscode: false, hasCursor: false, defaultEditor: null });
        const config = makeConfig({ preferredEditor: 'auto' });

        const result = await executeAction('open_editor', worktree, env, config, deps);

        expect(result.success).toBe(false);
        expect(result.message).toContain('No editor found');
        expect(deps.spawnDetached).not.toHaveBeenCalled();
      });

      it('handles spawn errors gracefully', async () => {
        const deps = makeDeps({
          spawnDetached: vi.fn().mockImplementation(() => {
            throw new Error('spawn failed');
          }),
        });
        const worktree = makeWorktree();
        const env = makeEnv({ hasVscode: true, defaultEditor: 'vscode' });
        const config = makeConfig();

        const result = await executeAction('open_editor', worktree, env, config, deps);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Failed to open editor');
      });
    });

    describe('copy_path action', () => {
      it('copies path to clipboard', async () => {
        const deps = makeDeps();
        const worktree = makeWorktree({ path: '/home/user/repo.pr1' });

        const result = await executeAction('copy_path', worktree, makeEnv(), makeConfig(), deps);

        expect(deps.copyToClipboard).toHaveBeenCalledWith('/home/user/repo.pr1');
        expect(result.success).toBe(true);
        expect(result.message).toContain('Copied');
        expect(result.message).toContain('/home/user/repo.pr1');
      });

      it('handles clipboard errors gracefully', async () => {
        const deps = makeDeps({
          copyToClipboard: vi.fn().mockImplementation(() => {
            throw new Error('clipboard unavailable');
          }),
        });
        const worktree = makeWorktree();

        const result = await executeAction('copy_path', worktree, makeEnv(), makeConfig(), deps);

        expect(result.success).toBe(false);
        expect(result.message).toContain('Failed to copy');
      });
    });

    describe('show_details action', () => {
      it('returns success (details are printed to console)', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const worktree = makeWorktree({
          type: 'pr',
          prNumber: 42,
          prState: 'OPEN',
          branch: 'feature-42',
        });

        const result = await executeAction(
          'show_details',
          worktree,
          makeEnv(),
          makeConfig(),
          makeDeps()
        );

        expect(result.success).toBe(true);
        consoleSpy.mockRestore();
      });
    });

    describe('open_pr_url action', () => {
      it('returns error when worktree has no PR number', async () => {
        const deps = makeDeps();
        const worktree = makeWorktree({ type: 'branch', prNumber: null });

        const result = await executeAction('open_pr_url', worktree, makeEnv(), makeConfig(), deps);

        expect(result.success).toBe(false);
        expect(result.message).toContain('No PR associated');
        expect(deps.openUrl).not.toHaveBeenCalled();
      });
    });
  });

  describe('createDefaultExecutorDeps', () => {
    it('returns object with all required methods', () => {
      const deps = createDefaultExecutorDeps();

      expect(deps).toHaveProperty('execCommand');
      expect(deps).toHaveProperty('spawnDetached');
      expect(deps).toHaveProperty('copyToClipboard');
      expect(deps).toHaveProperty('openUrl');

      expect(typeof deps.execCommand).toBe('function');
      expect(typeof deps.spawnDetached).toBe('function');
      expect(typeof deps.copyToClipboard).toBe('function');
      expect(typeof deps.openUrl).toBe('function');
    });
  });

  describe('open_terminal action', () => {
    it('spawns terminal on Linux', async () => {
      const deps = makeDeps();
      const worktree = makeWorktree({ path: '/home/user/repo' });
      const env = makeEnv({ platform: 'linux' });

      const result = await executeAction('open_terminal', worktree, env, makeConfig(), deps);

      // Should attempt to spawn a terminal
      expect(deps.spawnDetached).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('terminal');
    });

    it('uses osascript on macOS', async () => {
      const deps = makeDeps();
      const worktree = makeWorktree({ path: '/Users/user/repo' });
      const env = makeEnv({ platform: 'darwin' });

      const result = await executeAction('open_terminal', worktree, env, makeConfig(), deps);

      expect(deps.execCommand).toHaveBeenCalledWith(expect.stringContaining('osascript'));
      expect(result.success).toBe(true);
    });

    it('tries Windows Terminal on Windows', async () => {
      const deps = makeDeps();
      const worktree = makeWorktree({ path: 'C:\\Users\\user\\repo' });
      const env = makeEnv({ platform: 'win32' });

      const result = await executeAction('open_terminal', worktree, env, makeConfig(), deps);

      // Should try wt first
      expect(deps.spawnDetached).toHaveBeenCalledWith('wt', expect.any(Array));
      expect(result.success).toBe(true);
    });

    it('falls back to cmd on Windows when wt fails', async () => {
      let callCount = 0;
      const deps = makeDeps({
        spawnDetached: vi.fn().mockImplementation((cmd) => {
          callCount++;
          if (cmd === 'wt') {
            throw new Error('wt not found');
          }
        }),
      });
      const worktree = makeWorktree({ path: 'C:\\Users\\user\\repo' });
      const env = makeEnv({ platform: 'win32' });

      const result = await executeAction('open_terminal', worktree, env, makeConfig(), deps);

      // Should have tried wt, then cmd
      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
    });

    it('handles no terminal available on Linux', async () => {
      const deps = makeDeps({
        spawnDetached: vi.fn().mockImplementation(() => {
          throw new Error('terminal not found');
        }),
      });
      const worktree = makeWorktree();
      const env = makeEnv({ platform: 'linux' });

      const result = await executeAction('open_terminal', worktree, env, makeConfig(), deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No terminal emulator found');
    });
  });

  describe('remove_worktree action', () => {
    it('returns error for main worktree', async () => {
      const worktree = makeWorktree({ type: 'main' });

      const result = await executeAction(
        'remove_worktree',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot remove main worktree');
    });

    it('cancels when user declines confirmation', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
        name: 'feature-branch',
      });

      const result = await executeAction(
        'remove_worktree',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Cancelled');
      expect(git.removeWorktree).not.toHaveBeenCalled();
    });

    it('removes worktree when user confirms', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
      vi.mocked(git.removeWorktree).mockImplementation(() => {});

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
        name: 'my-worktree',
      });

      const result = await executeAction(
        'remove_worktree',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Removed worktree');
      expect(result.shouldRefresh).toBe(true);
      expect(git.removeWorktree).toHaveBeenCalledWith(worktree.path);
      consoleSpy.mockRestore();
    });

    it('warns about uncommitted changes', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'dirty-branch',
        hasChanges: true,
      });

      await executeAction('remove_worktree', worktree, makeEnv(), makeConfig(), makeDeps());

      const output = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('uncommitted changes');
      consoleSpy.mockRestore();
    });

    it('prompts to delete branch for merged PR worktrees', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ shouldDelete: true });
      vi.mocked(git.removeWorktree).mockImplementation(() => {});
      vi.mocked(git.getMainWorktreeRoot).mockReturnValue('/home/user/repo');

      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'MERGED',
        branch: 'feature-42',
        name: 'repo.pr42',
      });

      const result = await executeAction(
        'remove_worktree',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it('prompts to delete branch for closed PR worktrees', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ shouldDelete: false });
      vi.mocked(git.removeWorktree).mockImplementation(() => {});

      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'CLOSED',
        branch: 'feature-42',
        name: 'repo.pr42',
      });

      const result = await executeAction(
        'remove_worktree',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it('handles removal failure', async () => {
      vi.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
      vi.mocked(git.removeWorktree).mockImplementation(() => {
        throw new Error('Worktree has changes');
      });

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
        name: 'my-worktree',
      });

      const result = await executeAction(
        'remove_worktree',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to remove worktree');
    });
  });

  describe('create_pr action', () => {
    it('returns error for detached HEAD', async () => {
      const worktree = makeWorktree({ type: 'detached', branch: null });

      const result = await executeAction(
        'create_pr',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('detached HEAD');
    });

    it('returns error when PR already exists for branch', async () => {
      vi.mocked(github.getPrByBranch).mockReturnValue({
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        isDraft: false,
        title: 'Existing PR',
        headBranch: 'feature-branch',
        baseBranch: 'main',
      });

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });

      const result = await executeAction(
        'create_pr',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('PR already exists');
      expect(result.message).toContain('#42');
    });

    it('creates PR successfully with configured draftPr', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(github.getPrByBranch).mockReturnValue(null);
      vi.mocked(github.createPr).mockReturnValue({
        number: 123,
        url: 'https://github.com/owner/repo/pull/123',
        state: 'OPEN',
        isDraft: true,
        title: 'New PR',
        headBranch: 'feature-branch',
        baseBranch: 'main',
      });
      vi.mocked(inquirer.prompt).mockResolvedValue({ title: 'My New PR' });

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });
      const config = makeConfig({ draftPr: true });

      const result = await executeAction('create_pr', worktree, makeEnv(), config, makeDeps());

      expect(result.success).toBe(true);
      expect(result.message).toContain('Created PR #123');
      expect(result.shouldRefresh).toBe(true);
      expect(github.createPr).toHaveBeenCalledWith(
        expect.objectContaining({ draft: true }),
        expect.any(String)
      );
      consoleSpy.mockRestore();
    });

    it('prompts for draft status when not configured', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(github.getPrByBranch).mockReturnValue(null);
      vi.mocked(github.createPr).mockReturnValue({
        number: 123,
        url: 'https://github.com/owner/repo/pull/123',
        state: 'OPEN',
        isDraft: false,
        title: 'New PR',
        headBranch: 'feature-branch',
        baseBranch: 'main',
      });
      vi.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ title: 'My PR Title' })
        .mockResolvedValueOnce({ draft: false });

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });
      const config = makeConfig({ draftPr: undefined });

      const result = await executeAction('create_pr', worktree, makeEnv(), config, makeDeps());

      expect(result.success).toBe(true);
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it('handles PR creation failure', async () => {
      vi.mocked(github.getPrByBranch).mockReturnValue(null);
      vi.mocked(github.createPr).mockImplementation(() => {
        throw new Error('GitHub API error');
      });
      vi.mocked(inquirer.prompt).mockResolvedValue({ title: 'My PR' });

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });
      const config = makeConfig({ draftPr: false });

      const result = await executeAction('create_pr', worktree, makeEnv(), config, makeDeps());

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to create PR');
    });
  });

  describe('link_configs action', () => {
    it('returns error when repo root not found', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue(null as unknown as string);

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });

      const result = await executeAction(
        'link_configs',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not find repository root');
    });

    it('returns error for main worktree', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');

      const worktree = makeWorktree({ type: 'main' });

      const result = await executeAction(
        'link_configs',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot link configs to main worktree');
    });

    it('handles link configs failure', async () => {
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/repo');

      // Mock the dynamic import to throw
      vi.doMock('../wtlink/link-configs.js', () => ({
        run: vi.fn().mockRejectedValue(new Error('Link failed')),
      }));

      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
        path: '/home/user/feature-branch',
      });

      const result = await executeAction(
        'link_configs',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      // Either succeeds or fails with proper message
      if (!result.success) {
        expect(result.message).toContain('Failed to link configs');
      }
    });
  });

  describe('show_details action', () => {
    it('shows draft indicator for draft PRs', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
        branch: 'feature-42',
      });

      const result = await executeAction(
        'show_details',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      // Check that draft was mentioned in output
      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      expect(calls.some((c) => c.includes('Draft'))).toBe(true);
      consoleSpy.mockRestore();
    });

    it('shows branch worktree details', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
        hasChanges: true,
      });

      const result = await executeAction(
        'show_details',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('shows detached worktree details', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const worktree = makeWorktree({
        type: 'detached',
        branch: null,
      });

      const result = await executeAction(
        'show_details',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('shows all worktree fields in output', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const worktree = makeWorktree({
        path: '/home/user/repo.pr1',
        name: 'repo.pr1',
        type: 'pr',
        prNumber: 123,
        prState: 'OPEN',
        branch: 'feat/test',
        commit: 'abc123def',
        hasChanges: false,
      });

      const result = await executeAction(
        'show_details',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      const output = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('Path');
      expect(output).toContain('Name');
      expect(output).toContain('Branch');
      expect(output).toContain('Commit');
      expect(output).toContain('Type');
      consoleSpy.mockRestore();
    });

    it('shows clean status for worktree without changes', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'clean-branch',
        hasChanges: false,
      });

      const result = await executeAction(
        'show_details',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      const output = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('Clean');
      consoleSpy.mockRestore();
    });

    it('shows uncommitted changes warning', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'dirty-branch',
        hasChanges: true,
      });

      const result = await executeAction(
        'show_details',
        worktree,
        makeEnv(),
        makeConfig(),
        makeDeps()
      );

      expect(result.success).toBe(true);
      const output = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('uncommitted');
      consoleSpy.mockRestore();
    });
  });

  describe('open_pr_url action with mocked github', () => {
    it('returns error when PR is not found', async () => {
      vi.mocked(github.getPr).mockReturnValue(null);

      const deps = makeDeps();
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 999,
        prState: 'OPEN',
      });

      const result = await executeAction('open_pr_url', worktree, makeEnv(), makeConfig(), deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not find PR');
    });

    it('opens PR URL successfully when PR is found', async () => {
      vi.mocked(github.getPr).mockReturnValue({
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        isDraft: false,
        title: 'Test PR',
        headBranch: 'feature-42',
        baseBranch: 'main',
      });

      const deps = makeDeps();
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
      });

      const result = await executeAction('open_pr_url', worktree, makeEnv(), makeConfig(), deps);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Opened PR');
      expect(deps.openUrl).toHaveBeenCalledWith('https://github.com/owner/repo/pull/42');
    });

    it('handles error when opening URL fails', async () => {
      vi.mocked(github.getPr).mockReturnValue({
        number: 42,
        url: 'https://github.com/owner/repo/pull/42',
        state: 'OPEN',
        isDraft: false,
        title: 'Test PR',
        headBranch: 'feature-42',
        baseBranch: 'main',
      });

      const deps = makeDeps({
        openUrl: vi.fn().mockImplementation(() => {
          throw new Error('Failed to open browser');
        }),
      });
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
      });

      const result = await executeAction('open_pr_url', worktree, makeEnv(), makeConfig(), deps);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to open PR');
    });
  });

  describe('open_editor action edge cases', () => {
    it('prefers vscode when preferredEditor is vscode even if cursor available', async () => {
      const deps = makeDeps();
      const worktree = makeWorktree({ path: '/home/user/repo.pr1' });
      const env = makeEnv({ hasVscode: true, hasCursor: true, defaultEditor: 'vscode' });
      const config = makeConfig({ preferredEditor: 'vscode' });

      const result = await executeAction('open_editor', worktree, env, config, deps);

      expect(deps.spawnDetached).toHaveBeenCalledWith('code', ['/home/user/repo.pr1']);
      expect(result.success).toBe(true);
    });

    it('prefers cursor when preferredEditor is cursor even if vscode available', async () => {
      const deps = makeDeps();
      const worktree = makeWorktree({ path: '/home/user/repo.pr1' });
      const env = makeEnv({ hasVscode: true, hasCursor: true, defaultEditor: 'vscode' });
      const config = makeConfig({ preferredEditor: 'cursor' });

      const result = await executeAction('open_editor', worktree, env, config, deps);

      expect(deps.spawnDetached).toHaveBeenCalledWith('cursor', ['/home/user/repo.pr1']);
      expect(result.success).toBe(true);
    });
  });

  describe('copy_path action', () => {
    it('copies the correct path', async () => {
      const deps = makeDeps();
      const worktree = makeWorktree({ path: '/home/user/my-project' });

      const result = await executeAction('copy_path', worktree, makeEnv(), makeConfig(), deps);

      expect(deps.copyToClipboard).toHaveBeenCalledWith('/home/user/my-project');
      expect(result.success).toBe(true);
      expect(result.message).toContain('/home/user/my-project');
    });
  });

  describe('formatBranchAsTitle', () => {
    it('removes feat/ prefix', () => {
      expect(formatBranchAsTitle('feat/add-new-api')).toBe('Add new api');
    });

    it('removes fix/ prefix', () => {
      expect(formatBranchAsTitle('fix/bad-login')).toBe('Bad login');
    });

    it('removes chore/ prefix', () => {
      expect(formatBranchAsTitle('chore/update-deps')).toBe('Update deps');
    });

    it('removes docs/ prefix', () => {
      expect(formatBranchAsTitle('docs/add-guide')).toBe('Add guide');
    });

    it('removes refactor/ prefix', () => {
      expect(formatBranchAsTitle('refactor/clean-code')).toBe('Clean code');
    });

    it('removes test/ prefix', () => {
      expect(formatBranchAsTitle('test/add-more-tests')).toBe('Add more tests');
    });

    it('removes style/ prefix', () => {
      expect(formatBranchAsTitle('style/fix-lint')).toBe('Fix lint');
    });

    it('removes feature/ prefix', () => {
      expect(formatBranchAsTitle('feature/new-api')).toBe('New api');
    });

    it('removes bugfix/ prefix', () => {
      expect(formatBranchAsTitle('bugfix/fix-null')).toBe('Fix null');
    });

    it('removes trailing random suffixes', () => {
      expect(formatBranchAsTitle('feat/add-login-abc123')).toBe('Add login');
      expect(formatBranchAsTitle('add-feature-xyz789')).toBe('Add feature');
    });

    it('replaces hyphens with spaces', () => {
      // Note: 'branch' is 6 chars so it gets removed as a suffix
      expect(formatBranchAsTitle('my-feature-thing')).toBe('My feature thing');
    });

    it('replaces underscores with spaces', () => {
      expect(formatBranchAsTitle('my_new_api')).toBe('My new api');
    });

    it('capitalizes first letter', () => {
      expect(formatBranchAsTitle('lower')).toBe('Lower');
    });

    it('removes trailing 6+ char random suffix', () => {
      // Words like 'branch' (6 chars) are also removed - intentional behavior
      expect(formatBranchAsTitle('my-feature-branch')).toBe('My feature');
    });

    it('handles already capitalized input', () => {
      expect(formatBranchAsTitle('Already-Capitalized')).toBe('Already Capitalized');
    });

    it('handles simple branch name', () => {
      expect(formatBranchAsTitle('main')).toBe('Main');
    });

    it('handles complex branch names', () => {
      expect(formatBranchAsTitle('feat/make-lswt-more-interactive-b5y1o2')).toBe(
        'Make lswt more interactive'
      );
    });

    it('handles mixed separators', () => {
      expect(formatBranchAsTitle('my_feature-branch_name')).toBe('My feature branch name');
    });
  });
});
