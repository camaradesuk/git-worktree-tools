import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectScenario,
  getScenarioDescription,
  hasChanges,
  hasLocalCommits,
  formatFileList,
  formatCommitList,
  detectWorktreeType,
  detectBranchType,
  analyzeGitState,
  type GitState,
  type Scenario,
} from './state-detection.js';
import * as git from './git.js';

// Mock the git module
vi.mock('./git.js', () => ({
  listWorktrees: vi.fn(),
  isWorktree: vi.fn(),
  isDetachedHead: vi.fn(),
  getCurrentBranch: vi.fn(),
  getRepoRoot: vi.fn(),
  getRepoName: vi.fn(),
  getCommitRelationship: vi.fn(),
  getWorkingTreeStatus: vi.fn(),
  getCommitsAhead: vi.fn(),
  getStagedFiles: vi.fn(),
  getUnstagedFiles: vi.fn(),
}));

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

    // Tests for 'behind' state on main branch (Bug fix: should respect working tree status)
    it('should detect main_clean_same scenario when behind origin', () => {
      const state = createState({
        commitRelationship: 'behind',
        workingTreeStatus: 'clean',
      });
      expect(detectScenario(state)).toBe('main_clean_same');
    });

    it('should detect main_unstaged_same scenario when behind origin with unstaged changes', () => {
      const state = createState({
        commitRelationship: 'behind',
        workingTreeStatus: 'unstaged_only',
      });
      expect(detectScenario(state)).toBe('main_unstaged_same');
    });

    it('should detect main_staged_same scenario when behind origin with staged changes', () => {
      const state = createState({
        commitRelationship: 'behind',
        workingTreeStatus: 'staged_only',
      });
      expect(detectScenario(state)).toBe('main_staged_same');
    });

    it('should detect main_both_same scenario when behind origin with both changes', () => {
      const state = createState({
        commitRelationship: 'behind',
        workingTreeStatus: 'both',
      });
      expect(detectScenario(state)).toBe('main_both_same');
    });

    // Tests for 'divergent' state on main branch
    it('should detect main_clean_ahead scenario when divergent on main', () => {
      const state = createState({
        commitRelationship: 'divergent',
        workingTreeStatus: 'clean',
      });
      expect(detectScenario(state)).toBe('main_clean_ahead');
    });

    it('should detect main_changes_ahead scenario when divergent on main with changes', () => {
      const state = createState({
        commitRelationship: 'divergent',
        workingTreeStatus: 'unstaged_only',
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
        currentBranch: 'feat/feature-abc123',
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

  describe('detectScenario - additional edge cases', () => {
    it('should treat main branch behind as main_clean_same', () => {
      const state = createState({
        branchType: 'main',
        commitRelationship: 'behind',
      });
      expect(detectScenario(state)).toBe('main_clean_same');
    });

    it('should treat main branch divergent as main_clean_ahead', () => {
      const state = createState({
        branchType: 'main',
        commitRelationship: 'divergent',
      });
      // Divergent means both ahead and behind - treat like ahead since local commits exist
      expect(detectScenario(state)).toBe('main_clean_ahead');
    });

    it('should treat branch behind as branch_same_as_main', () => {
      const state = createState({
        branchType: 'other',
        currentBranch: 'feature-branch',
        commitRelationship: 'behind',
      });
      expect(detectScenario(state)).toBe('branch_same_as_main');
    });

    it('should detect branch_divergent for ahead relationship', () => {
      const state = createState({
        branchType: 'other',
        currentBranch: 'feature-branch',
        commitRelationship: 'ahead',
        localCommits: ['abc123 Some commit'],
      });
      expect(detectScenario(state)).toBe('branch_divergent');
    });
  });

  describe('getScenarioDescription - all scenarios', () => {
    const scenarios: Scenario[] = [
      'main_clean_same',
      'main_staged_same',
      'main_unstaged_same',
      'main_both_same',
      'main_clean_ahead',
      'main_changes_ahead',
      'branch_same_as_main',
      'branch_ancestor',
      'branch_divergent',
      'branch_with_changes',
      'detached_head',
      'pr_worktree',
    ];

    it.each(scenarios)('should return description for %s', (scenario) => {
      const description = getScenarioDescription(scenario);
      expect(description).toBeTruthy();
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('detectWorktreeType', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect pr_worktree from path pattern', () => {
      const result = detectWorktreeType('/home/user/project.pr123');
      expect(result).toBe('pr_worktree');
    });

    it('should detect main_worktree when isMain is true', () => {
      vi.mocked(git.listWorktrees).mockReturnValue([
        {
          path: '/home/user/project',
          branch: 'main',
          isMain: true,
          commit: 'abc123',
          isBare: false,
          isLocked: false,
          isPrunable: false,
        },
      ]);
      vi.mocked(git.isWorktree).mockReturnValue(false);

      const result = detectWorktreeType('/home/user/project');
      expect(result).toBe('main_worktree');
    });

    it('should detect pr_worktree for secondary worktree', () => {
      vi.mocked(git.listWorktrees).mockReturnValue([
        {
          path: '/home/user/project',
          branch: 'main',
          isMain: true,
          commit: 'abc123',
          isBare: false,
          isLocked: false,
          isPrunable: false,
        },
        {
          path: '/home/user/project-feature',
          branch: 'feature',
          isMain: false,
          commit: 'def456',
          isBare: false,
          isLocked: false,
          isPrunable: false,
        },
      ]);
      vi.mocked(git.isWorktree).mockReturnValue(true);

      const result = detectWorktreeType('/home/user/project-feature');
      expect(result).toBe('pr_worktree');
    });

    it('should default to main_worktree for unknown path', () => {
      vi.mocked(git.listWorktrees).mockReturnValue([]);
      vi.mocked(git.isWorktree).mockReturnValue(false);

      const result = detectWorktreeType('/home/user/unknown');
      expect(result).toBe('main_worktree');
    });
  });

  describe('detectBranchType', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect detached state', () => {
      vi.mocked(git.isDetachedHead).mockReturnValue(true);
      vi.mocked(git.getCurrentBranch).mockReturnValue(null);

      const result = detectBranchType('main');
      expect(result).toBe('detached');
    });

    it('should detect main branch', () => {
      vi.mocked(git.isDetachedHead).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');

      const result = detectBranchType('main');
      expect(result).toBe('main');
    });

    it('should detect other branch', () => {
      vi.mocked(git.isDetachedHead).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('feature-branch');

      const result = detectBranchType('main');
      expect(result).toBe('other');
    });
  });

  describe('analyzeGitState', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(git.getRepoRoot).mockReturnValue('/home/user/project');
      vi.mocked(git.getRepoName).mockReturnValue('project');
      vi.mocked(git.listWorktrees).mockReturnValue([
        {
          path: '/home/user/project',
          branch: 'main',
          isMain: true,
          commit: 'abc123',
          isBare: false,
          isLocked: false,
          isPrunable: false,
        },
      ]);
      vi.mocked(git.isWorktree).mockReturnValue(false);
      vi.mocked(git.isDetachedHead).mockReturnValue(false);
      vi.mocked(git.getCurrentBranch).mockReturnValue('main');
      vi.mocked(git.getCommitRelationship).mockReturnValue('same');
      vi.mocked(git.getWorkingTreeStatus).mockReturnValue('clean');
      vi.mocked(git.getCommitsAhead).mockReturnValue([]);
      vi.mocked(git.getStagedFiles).mockReturnValue([]);
      vi.mocked(git.getUnstagedFiles).mockReturnValue([]);
    });

    it('should return complete git state', () => {
      const state = analyzeGitState('main');

      expect(state.worktreeType).toBe('main_worktree');
      expect(state.branchType).toBe('main');
      expect(state.currentBranch).toBe('main');
      expect(state.commitRelationship).toBe('same');
      expect(state.workingTreeStatus).toBe('clean');
      expect(state.localCommits).toEqual([]);
      expect(state.stagedFiles).toEqual([]);
      expect(state.unstagedFiles).toEqual([]);
      expect(state.repoRoot).toBe('/home/user/project');
      expect(state.repoName).toBe('project');
    });

    it('should handle feature branch state', () => {
      vi.mocked(git.getCurrentBranch).mockReturnValue('feature-branch');
      vi.mocked(git.getCommitRelationship).mockReturnValue('ahead');
      vi.mocked(git.getCommitsAhead).mockReturnValue(['abc123 Add feature']);
      vi.mocked(git.getWorkingTreeStatus).mockReturnValue('staged_only');
      vi.mocked(git.getStagedFiles).mockReturnValue(['src/feature.ts']);

      const state = analyzeGitState('main');

      expect(state.branchType).toBe('other');
      expect(state.currentBranch).toBe('feature-branch');
      expect(state.commitRelationship).toBe('ahead');
      expect(state.localCommits).toEqual(['abc123 Add feature']);
      expect(state.stagedFiles).toEqual(['src/feature.ts']);
    });

    it('should use default base branch when not provided', () => {
      const state = analyzeGitState();

      expect(state).toBeDefined();
      expect(git.getCommitRelationship).toHaveBeenCalled();
    });
  });
});
