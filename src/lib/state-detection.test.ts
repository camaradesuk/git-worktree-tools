import { describe, it, expect } from 'vitest';
import {
  detectScenario,
  getScenarioDescription,
  hasChanges,
  hasLocalCommits,
  formatFileList,
  formatCommitList,
  type GitState,
} from './state-detection.js';

describe('state-detection', () => {
  // Helper to create a minimal GitState for testing
  function createState(overrides: Partial<GitState> = {}): GitState {
    return {
      worktreeType: 'main_worktree',
      branchType: 'main',
      currentBranch: 'main',
      commitRelationship: 'same',
      workingTreeStatus: 'clean',
      localCommits: [],
      stagedFiles: [],
      unstagedFiles: [],
      repoRoot: '/home/user/repo',
      repoName: 'repo',
      ...overrides,
    };
  }

  describe('detectScenario', () => {
    it('should detect main_clean_same scenario', () => {
      const state = createState();
      expect(detectScenario(state)).toBe('main_clean_same');
    });

    it('should detect main_staged_same scenario', () => {
      const state = createState({
        workingTreeStatus: 'staged_only',
      });
      expect(detectScenario(state)).toBe('main_staged_same');
    });

    it('should detect main_unstaged_same scenario', () => {
      const state = createState({
        workingTreeStatus: 'unstaged_only',
      });
      expect(detectScenario(state)).toBe('main_unstaged_same');
    });

    it('should detect main_both_same scenario', () => {
      const state = createState({
        workingTreeStatus: 'both',
      });
      expect(detectScenario(state)).toBe('main_both_same');
    });

    it('should detect main_clean_ahead scenario', () => {
      const state = createState({
        commitRelationship: 'ahead',
        localCommits: ['abc123 Some commit'],
      });
      expect(detectScenario(state)).toBe('main_clean_ahead');
    });

    it('should detect main_changes_ahead scenario', () => {
      const state = createState({
        commitRelationship: 'ahead',
        workingTreeStatus: 'staged_only',
        localCommits: ['abc123 Some commit'],
      });
      expect(detectScenario(state)).toBe('main_changes_ahead');
    });

    it('should detect branch_same_as_main scenario', () => {
      const state = createState({
        branchType: 'other',
        currentBranch: 'feature-branch',
      });
      expect(detectScenario(state)).toBe('branch_same_as_main');
    });

    it('should detect branch_ancestor scenario', () => {
      const state = createState({
        branchType: 'other',
        currentBranch: 'feature-branch',
        commitRelationship: 'ancestor',
      });
      expect(detectScenario(state)).toBe('branch_ancestor');
    });

    it('should detect branch_divergent scenario', () => {
      const state = createState({
        branchType: 'other',
        currentBranch: 'feature-branch',
        commitRelationship: 'divergent',
        localCommits: ['abc123 Some commit'],
      });
      expect(detectScenario(state)).toBe('branch_divergent');
    });

    it('should detect branch_with_changes scenario', () => {
      const state = createState({
        branchType: 'other',
        currentBranch: 'feature-branch',
        workingTreeStatus: 'both',
      });
      expect(detectScenario(state)).toBe('branch_with_changes');
    });

    it('should detect detached_head scenario', () => {
      const state = createState({
        branchType: 'detached',
        currentBranch: null,
      });
      expect(detectScenario(state)).toBe('detached_head');
    });

    it('should detect pr_worktree scenario', () => {
      const state = createState({
        worktreeType: 'pr_worktree',
        branchType: 'other',
        currentBranch: 'claude/feature-abc123',
      });
      expect(detectScenario(state)).toBe('pr_worktree');
    });
  });

  describe('getScenarioDescription', () => {
    it('should return description for each scenario', () => {
      expect(getScenarioDescription('main_clean_same')).toContain('main branch');
      expect(getScenarioDescription('detached_head')).toContain('detached');
      expect(getScenarioDescription('pr_worktree')).toContain('PR worktree');
    });
  });

  describe('hasChanges', () => {
    it('should return false for clean state', () => {
      const state = createState();
      expect(hasChanges(state)).toBe(false);
    });

    it('should return true for staged changes', () => {
      const state = createState({ workingTreeStatus: 'staged_only' });
      expect(hasChanges(state)).toBe(true);
    });

    it('should return true for unstaged changes', () => {
      const state = createState({ workingTreeStatus: 'unstaged_only' });
      expect(hasChanges(state)).toBe(true);
    });

    it('should return true for both staged and unstaged', () => {
      const state = createState({ workingTreeStatus: 'both' });
      expect(hasChanges(state)).toBe(true);
    });
  });

  describe('hasLocalCommits', () => {
    it('should return false when no local commits', () => {
      const state = createState();
      expect(hasLocalCommits(state)).toBe(false);
    });

    it('should return true when there are local commits', () => {
      const state = createState({ localCommits: ['abc123 feat: add feature'] });
      expect(hasLocalCommits(state)).toBe(true);
    });
  });

  describe('formatFileList', () => {
    it('should return empty string for empty list', () => {
      expect(formatFileList([])).toBe('');
    });

    it('should format file list with default prefix', () => {
      const result = formatFileList(['file1.ts', 'file2.ts']);
      expect(result).toBe('file1.ts\nfile2.ts');
    });

    it('should format file list with custom prefix', () => {
      const result = formatFileList(['file1.ts', 'file2.ts'], '  ');
      expect(result).toBe('  file1.ts\n  file2.ts');
    });
  });

  describe('formatCommitList', () => {
    it('should return empty string for empty list', () => {
      expect(formatCommitList([])).toBe('');
    });

    it('should format commit list with indentation', () => {
      const result = formatCommitList(['abc123 First commit', 'def456 Second commit']);
      expect(result).toBe('  abc123 First commit\n  def456 Second commit');
    });
  });
});
