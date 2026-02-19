/**
 * Tests for printWorktreeTable (extracted shared table display)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the UI module
vi.mock('../ui/index.js', () => ({
  printTable: vi.fn(),
  printStatus: vi.fn(),
  changeIndicator: vi.fn((hasChanges: boolean) => (hasChanges ? ' *' : '')),
}));

// Mock the colors module (preserve all exports, override specific ones for assertions)
vi.mock('../colors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../colors.js')>();
  return {
    ...actual,
    cyan: vi.fn((s: string) => `[cyan:${s}]`),
    green: vi.fn((s: string) => `[green:${s}]`),
    yellow: vi.fn((s: string) => `[yellow:${s}]`),
    red: vi.fn((s: string) => `[red:${s}]`),
    blue: vi.fn((s: string) => `[blue:${s}]`),
    dim: vi.fn((s: string) => `[dim:${s}]`),
    bold: vi.fn((s: string) => `[bold:${s}]`),
  };
});

import { printWorktreeTable } from './table.js';
import { printTable, printStatus, changeIndicator } from '../ui/index.js';
import type { WorktreeDisplay, ListOptions } from './types.js';

function makeWorktree(overrides: Partial<WorktreeDisplay> = {}): WorktreeDisplay {
  return {
    path: '/home/user/repo',
    name: 'repo',
    branch: 'main',
    commit: 'abc1234',
    type: 'main',
    prNumber: null,
    prState: null,
    isDraft: null,
    hasChanges: false,
    ...overrides,
  };
}

function defaultOptions(overrides: Partial<ListOptions> = {}): ListOptions {
  return {
    showStatus: false,
    json: false,
    verbose: false,
    ...overrides,
  };
}

describe('printWorktreeTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows info message for empty worktree list', () => {
    printWorktreeTable([], defaultOptions(), '/home/user');

    expect(printStatus).toHaveBeenCalledWith('info', 'No worktrees found.');
    expect(printTable).not.toHaveBeenCalled();
  });

  it('calls printTable with correct title for basic list', () => {
    const worktrees = [makeWorktree({ path: '/home/user/myrepo', name: 'myrepo', branch: 'main' })];

    printWorktreeTable(worktrees, defaultOptions(), '/home/user');

    expect(printTable).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    expect(callArgs.title).toBe('myrepo worktrees:');
  });

  it('strips .prN suffix from repo name in title', () => {
    const worktrees = [
      makeWorktree({ path: '/home/user/myrepo.pr42', name: 'myrepo.pr42', branch: 'feat/stuff' }),
    ];

    printWorktreeTable(worktrees, defaultOptions(), '/home/user');

    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    expect(callArgs.title).toBe('myrepo worktrees:');
  });

  it('creates rows with branch and path fields', () => {
    const worktrees = [
      makeWorktree({
        path: '/home/user/repo',
        branch: 'main',
        type: 'main',
      }),
      makeWorktree({
        path: '/home/user/repo.pr99',
        branch: 'feat/auth',
        type: 'pr',
        prNumber: 99,
        prState: 'OPEN',
      }),
    ];

    printWorktreeTable(worktrees, defaultOptions(), '/tmp');

    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    expect(callArgs.rows).toHaveLength(2);

    // First row: main worktree
    expect(callArgs.rows[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'Branch', value: 'main' }),
        expect.objectContaining({ key: 'Path' }),
      ])
    );

    // Second row: PR worktree
    expect(callArgs.rows[1].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'Branch', value: 'feat/auth' }),
        expect.objectContaining({ key: 'Path' }),
      ])
    );
  });

  it('shows detached label when branch is null', () => {
    const worktrees = [
      makeWorktree({
        path: '/home/user/repo',
        branch: null,
        type: 'detached',
      }),
    ];

    printWorktreeTable(worktrees, defaultOptions(), '/tmp');

    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    // Branch field should show dimmed "(detached)"
    const branchField = callArgs.rows[0].fields.find((f) => f.key === 'Branch');
    expect(branchField?.value).toBe('[dim:(detached)]');
  });

  it('includes commit hash in verbose mode', () => {
    const worktrees = [
      makeWorktree({
        path: '/home/user/repo',
        branch: 'main',
        commit: 'deadbeef',
      }),
    ];

    printWorktreeTable(worktrees, defaultOptions({ verbose: true }), '/tmp');

    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    const commitField = callArgs.rows[0].fields.find((f) => f.key === 'Commit');
    expect(commitField).toBeDefined();
    expect(commitField?.value).toBe('[dim:deadbeef]');
  });

  it('does not include commit hash in non-verbose mode', () => {
    const worktrees = [
      makeWorktree({
        path: '/home/user/repo',
        branch: 'main',
        commit: 'deadbeef',
      }),
    ];

    printWorktreeTable(worktrees, defaultOptions({ verbose: false }), '/tmp');

    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    const commitField = callArgs.rows[0].fields.find((f) => f.key === 'Commit');
    expect(commitField).toBeUndefined();
  });

  it('passes change indicator to row', () => {
    const worktrees = [makeWorktree({ path: '/home/user/repo', hasChanges: true })];

    printWorktreeTable(worktrees, defaultOptions(), '/tmp');

    expect(changeIndicator).toHaveBeenCalledWith(true);
    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    expect(callArgs.rows[0].indicator).toBe(' *');
  });

  it('passes empty change indicator for clean worktree', () => {
    const worktrees = [makeWorktree({ path: '/home/user/repo', hasChanges: false })];

    printWorktreeTable(worktrees, defaultOptions(), '/tmp');

    expect(changeIndicator).toHaveBeenCalledWith(false);
    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    expect(callArgs.rows[0].indicator).toBe('');
  });

  it('applies correct color for main worktree type', () => {
    const worktrees = [makeWorktree({ path: '/home/user/repo', type: 'main' })];

    printWorktreeTable(worktrees, defaultOptions(), '/tmp');

    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    // formatTypeLabel returns { text: '[main]', color: 'cyan' } for main type
    expect(callArgs.rows[0].label).toBe('[cyan:[main]]');
  });

  it('applies correct color for open PR worktree type', () => {
    const worktrees = [
      makeWorktree({
        path: '/home/user/repo.pr5',
        type: 'pr',
        prNumber: 5,
        prState: 'OPEN',
      }),
    ];

    printWorktreeTable(worktrees, defaultOptions(), '/tmp');

    const callArgs = vi.mocked(printTable).mock.calls[0][0];
    // formatTypeLabel returns { text: '[PR #5 OPEN]', color: 'green' }
    expect(callArgs.rows[0].label).toBe('[green:[PR #5 OPEN]]');
  });

  describe('summary line', () => {
    it('shows total worktree count', () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main' }),
        makeWorktree({ path: '/home/user/repo.pr1', type: 'branch' }),
      ];

      printWorktreeTable(worktrees, defaultOptions(), '/tmp');

      const callArgs = vi.mocked(printTable).mock.calls[0][0];
      expect(callArgs.summary).toContain('2 worktrees');
    });

    it('shows PR count when PRs exist', () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main' }),
        makeWorktree({ path: '/home/user/repo.pr1', type: 'pr', prNumber: 1 }),
        makeWorktree({ path: '/home/user/repo.pr2', type: 'pr', prNumber: 2 }),
      ];

      printWorktreeTable(worktrees, defaultOptions(), '/tmp');

      const callArgs = vi.mocked(printTable).mock.calls[0][0];
      expect(callArgs.summary).toContain('2 PRs');
    });

    it('shows open count when open PRs exist', () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main' }),
        makeWorktree({ path: '/home/user/repo.pr1', type: 'pr', prNumber: 1, prState: 'OPEN' }),
        makeWorktree({
          path: '/home/user/repo.pr2',
          type: 'pr',
          prNumber: 2,
          prState: 'MERGED',
        }),
      ];

      printWorktreeTable(worktrees, defaultOptions(), '/tmp');

      const callArgs = vi.mocked(printTable).mock.calls[0][0];
      expect(callArgs.summary).toContain('1 open');
    });

    it('shows changes count in red when worktrees have changes', () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main', hasChanges: false }),
        makeWorktree({ path: '/home/user/repo.pr1', type: 'pr', prNumber: 1, hasChanges: true }),
        makeWorktree({ path: '/home/user/repo.pr2', type: 'pr', prNumber: 2, hasChanges: true }),
      ];

      printWorktreeTable(worktrees, defaultOptions(), '/tmp');

      const callArgs = vi.mocked(printTable).mock.calls[0][0];
      // red() is mocked to wrap in [red:...]
      expect(callArgs.summary).toContain('[red:2 with changes]');
    });

    it('does not show PR count when no PRs exist', () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main' }),
        makeWorktree({ path: '/home/user/repo2', type: 'branch' }),
      ];

      printWorktreeTable(worktrees, defaultOptions(), '/tmp');

      const callArgs = vi.mocked(printTable).mock.calls[0][0];
      expect(callArgs.summary).not.toContain('PRs');
    });

    it('does not show changes count when no worktrees have changes', () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main', hasChanges: false }),
      ];

      printWorktreeTable(worktrees, defaultOptions(), '/tmp');

      const callArgs = vi.mocked(printTable).mock.calls[0][0];
      expect(callArgs.summary).not.toContain('with changes');
    });

    it('joins summary parts with middle dot separator', () => {
      const worktrees = [
        makeWorktree({ path: '/home/user/repo', type: 'main' }),
        makeWorktree({
          path: '/home/user/repo.pr1',
          type: 'pr',
          prNumber: 1,
          prState: 'OPEN',
          hasChanges: true,
        }),
      ];

      printWorktreeTable(worktrees, defaultOptions(), '/tmp');

      const callArgs = vi.mocked(printTable).mock.calls[0][0];
      // Should be: "2 worktrees · 1 PRs · 1 open · [red:1 with changes]"
      expect(callArgs.summary).toMatch(/\d+ worktrees/);
      // Parts are joined by ' · '
      const parts = callArgs.summary!.split(' \u00b7 ');
      expect(parts.length).toBeGreaterThanOrEqual(2);
    });
  });
});
