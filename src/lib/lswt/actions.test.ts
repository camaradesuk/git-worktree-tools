import { describe, it, expect } from 'vitest';
import {
  buildActionMenu,
  formatWorktreeChoice,
  formatShortcutLegend,
  getActionShortcut,
  ACTION_SHORTCUTS,
} from './actions.js';
import type { WorktreeDisplay, EnvironmentInfo } from './types.js';

describe('lswt/actions', () => {
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
    isWSL: false,
    ...overrides,
  });

  describe('ACTION_SHORTCUTS', () => {
    it('has shortcuts for all main actions', () => {
      expect(ACTION_SHORTCUTS.open_editor).toBe('e');
      expect(ACTION_SHORTCUTS.open_terminal).toBe('t');
      expect(ACTION_SHORTCUTS.open_pr_url).toBe('p');
      expect(ACTION_SHORTCUTS.create_pr).toBe('p');
      expect(ACTION_SHORTCUTS.checkout_pr).toBe('w');
      expect(ACTION_SHORTCUTS.show_details).toBe('d');
      expect(ACTION_SHORTCUTS.copy_path).toBe('c');
      expect(ACTION_SHORTCUTS.remove_worktree).toBe('r');
      expect(ACTION_SHORTCUTS.link_configs).toBe('l');
      expect(ACTION_SHORTCUTS.exit).toBe('q');
    });

    it('has null shortcut for back action', () => {
      expect(ACTION_SHORTCUTS.back).toBeNull();
    });
  });

  describe('getActionShortcut', () => {
    it('returns shortcut for action', () => {
      expect(getActionShortcut('open_editor')).toBe('e');
      expect(getActionShortcut('open_terminal')).toBe('t');
      expect(getActionShortcut('exit')).toBe('q');
    });

    it('returns null for back action', () => {
      expect(getActionShortcut('back')).toBeNull();
    });
  });

  describe('buildActionMenu', () => {
    describe('for main worktree', () => {
      it('includes common actions', () => {
        const worktree = makeWorktree({ type: 'main' });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('open_editor');
        expect(values).toContain('open_terminal');
        expect(values).toContain('copy_path');
        expect(values).toContain('show_details');
        expect(values).toContain('link_configs');
        expect(values).toContain('back');
        expect(values).toContain('exit');
      });

      it('does not include remove_worktree for main', () => {
        const worktree = makeWorktree({ type: 'main' });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).not.toContain('remove_worktree');
      });

      it('does not include PR actions for main', () => {
        const worktree = makeWorktree({ type: 'main' });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).not.toContain('open_pr_url');
        expect(values).not.toContain('create_pr');
      });
    });

    describe('for PR worktree', () => {
      it('includes open_pr_url action', () => {
        const worktree = makeWorktree({
          type: 'pr',
          prNumber: 123,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('open_pr_url');
      });

      it('includes remove_worktree action', () => {
        const worktree = makeWorktree({
          type: 'pr',
          prNumber: 123,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('remove_worktree');
      });

      it('labels remove with PR status when merged', () => {
        const worktree = makeWorktree({
          type: 'pr',
          prNumber: 123,
          prState: 'MERGED',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const removeAction = menu.find((m) => m.value === 'remove_worktree');
        expect(removeAction?.name).toContain('merged');
      });

      it('labels remove with PR status when closed', () => {
        const worktree = makeWorktree({
          type: 'pr',
          prNumber: 123,
          prState: 'CLOSED',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const removeAction = menu.find((m) => m.value === 'remove_worktree');
        expect(removeAction?.name).toContain('closed');
      });

      it('does not include create_pr', () => {
        const worktree = makeWorktree({
          type: 'pr',
          prNumber: 123,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).not.toContain('create_pr');
      });
    });

    describe('for branch worktree', () => {
      it('includes create_pr action', () => {
        const worktree = makeWorktree({
          type: 'branch',
          branch: 'feature-branch',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('create_pr');
      });

      it('includes remove_worktree action', () => {
        const worktree = makeWorktree({
          type: 'branch',
          branch: 'feature-branch',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('remove_worktree');
      });

      it('does not include open_pr_url', () => {
        const worktree = makeWorktree({
          type: 'branch',
          branch: 'feature-branch',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).not.toContain('open_pr_url');
      });
    });

    describe('for detached worktree', () => {
      it('includes remove_worktree action', () => {
        const worktree = makeWorktree({
          type: 'detached',
          branch: null,
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('remove_worktree');
      });

      it('does not include PR-related actions', () => {
        const worktree = makeWorktree({
          type: 'detached',
          branch: null,
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).not.toContain('open_pr_url');
        expect(values).not.toContain('create_pr');
      });
    });

    describe('for remote_pr worktree', () => {
      it('includes checkout_pr action', () => {
        const worktree = makeWorktree({
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
          prTitle: 'Add new feature',
          prUrl: 'https://github.com/owner/repo/pull/42',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('checkout_pr');
      });

      it('includes open_pr_url action', () => {
        const worktree = makeWorktree({
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('open_pr_url');
      });

      it('includes show_details action', () => {
        const worktree = makeWorktree({
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('show_details');
      });

      it('includes back and exit actions', () => {
        const worktree = makeWorktree({
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).toContain('back');
        expect(values).toContain('exit');
      });

      it('does not include local-only actions', () => {
        const worktree = makeWorktree({
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const values = menu.map((m) => m.value);
        expect(values).not.toContain('open_editor');
        expect(values).not.toContain('open_terminal');
        expect(values).not.toContain('copy_path');
        expect(values).not.toContain('remove_worktree');
        expect(values).not.toContain('link_configs');
        expect(values).not.toContain('create_pr');
      });

      it('has correct shortcuts for remote PR actions', () => {
        const worktree = makeWorktree({
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const checkoutAction = menu.find((m) => m.value === 'checkout_pr');
        const prUrlAction = menu.find((m) => m.value === 'open_pr_url');
        const detailsAction = menu.find((m) => m.value === 'show_details');
        const exitAction = menu.find((m) => m.value === 'exit');

        expect(checkoutAction?.shortcut).toBe('w');
        expect(prUrlAction?.shortcut).toBe('p');
        expect(detailsAction?.shortcut).toBe('d');
        expect(exitAction?.shortcut).toBe('q');
      });

      it('returns limited action set with exactly 5 items', () => {
        const worktree = makeWorktree({
          type: 'remote_pr',
          prNumber: 42,
          prState: 'OPEN',
        });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        expect(menu).toHaveLength(5);
        expect(menu.map((m) => m.value)).toEqual([
          'checkout_pr',
          'open_pr_url',
          'show_details',
          'back',
          'exit',
        ]);
      });
    });

    describe('editor action', () => {
      it('is enabled when VSCode is available', () => {
        const worktree = makeWorktree();
        const env = makeEnv({ hasVscode: true, defaultEditor: 'vscode' });
        const menu = buildActionMenu(worktree, env);

        const editorAction = menu.find((m) => m.value === 'open_editor');
        expect(editorAction?.disabled).toBeUndefined();
        expect(editorAction?.name).toContain('VSCode');
      });

      it('is enabled when Cursor is available', () => {
        const worktree = makeWorktree();
        const env = makeEnv({
          hasVscode: false,
          hasCursor: true,
          defaultEditor: 'cursor',
        });
        const menu = buildActionMenu(worktree, env);

        const editorAction = menu.find((m) => m.value === 'open_editor');
        expect(editorAction?.disabled).toBeUndefined();
        expect(editorAction?.name).toContain('Cursor');
      });

      it('is disabled when no editor is available', () => {
        const worktree = makeWorktree();
        const env = makeEnv({
          hasVscode: false,
          hasCursor: false,
          defaultEditor: null,
        });
        const menu = buildActionMenu(worktree, env);

        const editorAction = menu.find((m) => m.value === 'open_editor');
        expect(editorAction?.disabled).toBe('No editor found (VSCode or Cursor)');
      });
    });

    describe('shortcuts', () => {
      it('assigns shortcuts to actions', () => {
        const worktree = makeWorktree({ type: 'pr', prNumber: 1 });
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const editorAction = menu.find((m) => m.value === 'open_editor');
        const terminalAction = menu.find((m) => m.value === 'open_terminal');
        const copyAction = menu.find((m) => m.value === 'copy_path');
        const exitAction = menu.find((m) => m.value === 'exit');

        expect(editorAction?.shortcut).toBe('e');
        expect(terminalAction?.shortcut).toBe('t');
        expect(copyAction?.shortcut).toBe('c');
        expect(exitAction?.shortcut).toBe('q');
      });

      it('back action has no shortcut', () => {
        const worktree = makeWorktree();
        const env = makeEnv();
        const menu = buildActionMenu(worktree, env);

        const backAction = menu.find((m) => m.value === 'back');
        expect(backAction?.shortcut).toBeUndefined();
      });
    });
  });

  describe('formatWorktreeChoice', () => {
    it('formats main worktree', () => {
      const worktree = makeWorktree({ type: 'main', hasChanges: false });
      const result = formatWorktreeChoice(worktree);

      expect(result).toContain('[main]');
      expect(result).toContain('main');
      expect(result).toContain('clean');
    });

    it('formats PR worktree with status', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        branch: 'feat/something',
      });
      const result = formatWorktreeChoice(worktree);

      expect(result).toContain('[PR #42]');
      expect(result).toContain('feat/something');
      expect(result).toContain('OPEN');
    });

    it('formats PR worktree as draft', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
        branch: 'feat/something',
      });
      const result = formatWorktreeChoice(worktree);

      expect(result).toContain('[PR #42 DRAFT]');
    });

    it('formats branch worktree', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });
      const result = formatWorktreeChoice(worktree);

      expect(result).toContain('[branch]');
      expect(result).toContain('feature-branch');
    });

    it('formats detached worktree', () => {
      const worktree = makeWorktree({
        type: 'detached',
        branch: null,
      });
      const result = formatWorktreeChoice(worktree);

      expect(result).toContain('[detached]');
      expect(result).toContain('(detached)');
    });

    it('shows has changes indicator', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature',
        hasChanges: true,
      });
      const result = formatWorktreeChoice(worktree);

      expect(result).toContain('has changes');
    });
  });

  describe('formatShortcutLegend', () => {
    it('includes common shortcuts for all worktree types', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatShortcutLegend(worktree);

      expect(result).toContain('[e] editor');
      expect(result).toContain('[t] terminal');
      expect(result).toContain('[d] details');
      expect(result).toContain('[c] copy');
      expect(result).toContain('[l] link');
      expect(result).toContain('[q] quit');
    });

    it('shows remove shortcut dimmed for main worktree', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatShortcutLegend(worktree);

      // Main worktree shows remove as disabled with reason
      expect(result).toContain('[r] remove (main)');
    });

    it('includes remove shortcut for non-main worktrees', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'OPEN',
      });
      const result = formatShortcutLegend(worktree);

      expect(result).toContain('[r] remove');
      // Should not have the disabled reason
      expect(result).not.toContain('[r] remove (main)');
    });

    it('shows PR shortcut for PR worktrees', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'OPEN',
      });
      const result = formatShortcutLegend(worktree);

      expect(result).toContain('[p] PR');
    });

    it('shows create PR shortcut for branch worktrees', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature',
      });
      const result = formatShortcutLegend(worktree);

      expect(result).toContain('[p] create PR');
    });

    it('returns dot-separated list with brackets', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatShortcutLegend(worktree);

      expect(result).toMatch(/\[e\] editor/);
      expect(result).toContain(' · ');
    });

    it('shows limited shortcuts for remote_pr worktrees', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
      });
      const result = formatShortcutLegend(worktree);

      expect(result).toContain('[w] worktree');
      expect(result).toContain('[p] PR');
      expect(result).toContain('[d] details');
      expect(result).toContain('[q] quit');
    });

    it('excludes editor and terminal shortcuts for remote_pr', () => {
      const worktree = makeWorktree({
        type: 'remote_pr',
        prNumber: 42,
        prState: 'OPEN',
      });
      const result = formatShortcutLegend(worktree);

      expect(result).not.toContain('[e] editor');
      expect(result).not.toContain('[t] terminal');
      expect(result).not.toContain('[c] copy');
      expect(result).not.toContain('[l] link');
      expect(result).not.toContain('[r] remove');
    });

    it('shows disabled shortcuts dimmed for main worktree', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatShortcutLegend(worktree);

      // Remove shortcut should show (main) reason
      expect(result).toContain('[r] remove (main)');
      // PR shortcut should show (n/a) reason
      expect(result).toContain('[p] PR (n/a)');
    });
  });
});
