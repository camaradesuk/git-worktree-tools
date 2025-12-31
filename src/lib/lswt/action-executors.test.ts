import { describe, it, expect, vi } from 'vitest';
import { executeAction, createDefaultExecutorDeps } from './action-executors.js';
import type { WorktreeDisplay, EnvironmentInfo } from './types.js';
import type { WorktreeConfig } from '../config.js';
import type { ExecutorDeps } from './action-executors.js';

describe('lswt/action-executors', () => {
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
  });

  describe('link_configs action', () => {
    it('returns error for main worktree', async () => {
      const worktree = makeWorktree({ type: 'main' });

      // Mock git.getRepoRoot
      vi.mock('../git.js', () => ({
        getRepoRoot: () => '/home/user/repo',
      }));

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
  });
});
