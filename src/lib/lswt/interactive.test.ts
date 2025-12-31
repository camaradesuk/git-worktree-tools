import { describe, it, expect } from 'vitest';
import {
  formatWorktreeChoiceWithColors,
  formatTypeBadgeWithColors,
  formatStatusWithColors,
} from './interactive.js';
import type { WorktreeDisplay } from './types.js';

describe('lswt/interactive', () => {
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

  describe('formatTypeBadgeWithColors', () => {
    it('formats main worktree badge', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[main]');
    });

    it('formats PR worktree badge', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[PR #42]');
    });

    it('formats draft PR badge with DRAFT indicator', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('DRAFT');
      expect(result).toContain('#42');
    });

    it('formats branch worktree badge', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-branch',
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[branch]');
    });

    it('formats detached worktree badge', () => {
      const worktree = makeWorktree({
        type: 'detached',
        branch: null,
      });
      const result = formatTypeBadgeWithColors(worktree);

      expect(result).toContain('[detached]');
    });
  });

  describe('formatStatusWithColors', () => {
    it('returns empty string when no status info', () => {
      const worktree = makeWorktree({
        type: 'branch',
        prState: null,
        hasChanges: false,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toBe('');
    });

    it('shows OPEN status for open PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'OPEN',
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('OPEN');
    });

    it('shows MERGED status for merged PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'MERGED',
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('MERGED');
    });

    it('shows CLOSED status for closed PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'CLOSED',
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('CLOSED');
    });

    it('shows has changes indicator', () => {
      const worktree = makeWorktree({
        type: 'branch',
        hasChanges: true,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('has changes');
    });

    it('shows clean status for main worktree without changes', () => {
      const worktree = makeWorktree({
        type: 'main',
        hasChanges: false,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('clean');
    });

    it('shows both PR state and changes', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 1,
        prState: 'OPEN',
        hasChanges: true,
      });
      const result = formatStatusWithColors(worktree);

      expect(result).toContain('OPEN');
      expect(result).toContain('has changes');
    });
  });

  describe('formatWorktreeChoiceWithColors', () => {
    it('includes type badge', () => {
      const worktree = makeWorktree({ type: 'main' });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('[main]');
    });

    it('includes branch name', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature-xyz',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('feature-xyz');
    });

    it('shows (detached) for detached worktrees', () => {
      const worktree = makeWorktree({
        type: 'detached',
        branch: null,
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('(detached)');
    });

    it('includes status for PR worktrees', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        branch: 'feat/something',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('[PR #42]');
      expect(result).toContain('feat/something');
      expect(result).toContain('OPEN');
    });

    it('includes draft indicator for draft PRs', () => {
      const worktree = makeWorktree({
        type: 'pr',
        prNumber: 42,
        prState: 'OPEN',
        isDraft: true,
        branch: 'feat/something',
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('DRAFT');
    });

    it('includes has changes indicator', () => {
      const worktree = makeWorktree({
        type: 'branch',
        branch: 'feature',
        hasChanges: true,
      });
      const result = formatWorktreeChoiceWithColors(worktree);

      expect(result).toContain('has changes');
    });
  });
});
