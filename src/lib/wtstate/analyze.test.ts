/**
 * wtstate analyze tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeState, formatText } from './analyze.js';
import type { WtstateResult, WtstateOptions } from './types.js';

// Mock the dependencies
vi.mock('../state-detection.js', () => ({
  analyzeGitState: vi.fn(),
  detectScenario: vi.fn(),
}));

vi.mock('../newpr/scenario-handler.js', () => ({
  getScenarioContext: vi.fn(),
}));

// Import after mocking
import { analyzeGitState, detectScenario } from '../state-detection.js';
import { getScenarioContext } from '../newpr/scenario-handler.js';

describe('wtstate/analyze', () => {
  const defaultOptions: WtstateOptions = {
    json: false,
    verbose: false,
    baseBranch: 'main',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('analyzeState', () => {
    it('returns analysis for clean main branch', () => {
      vi.mocked(analyzeGitState).mockReturnValue({
        currentBranch: 'main',
        baseBranch: 'main',
        isBaseBranch: true,
        commitRelation: 'same',
        stagedFiles: [],
        unstagedFiles: [],
        localCommits: [],
        worktreeType: 'main_worktree',
      });
      vi.mocked(detectScenario).mockReturnValue('main_clean_same');
      vi.mocked(getScenarioContext).mockReturnValue({
        message: 'What would you like to do?',
        choices: [
          { label: 'Create empty commit', action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false } },
        ],
      });

      const result = analyzeState(defaultOptions);

      expect(result.scenario).toBe('main_clean_same');
      expect(result.currentBranch).toBe('main');
      expect(result.hasChanges).toBe(false);
      expect(result.worktreeType).toBe('main_worktree');
    });

    it('returns analysis for branch with staged changes', () => {
      vi.mocked(analyzeGitState).mockReturnValue({
        currentBranch: 'feature-1',
        baseBranch: 'main',
        isBaseBranch: false,
        commitRelation: 'divergent',
        stagedFiles: ['file1.ts', 'file2.ts'],
        unstagedFiles: [],
        localCommits: ['Add feature'],
        worktreeType: 'pr_worktree',
      });
      vi.mocked(detectScenario).mockReturnValue('branch_with_changes');
      vi.mocked(getScenarioContext).mockReturnValue({
        message: 'Feature branch has uncommitted changes',
        choices: [
          { label: 'Commit all and create PR', action: { action: 'pr_for_branch_commit_all', branchFrom: 'head', stashUnstaged: false } },
        ],
      });

      const result = analyzeState({ ...defaultOptions, verbose: true });

      expect(result.scenario).toBe('branch_with_changes');
      expect(result.currentBranch).toBe('feature-1');
      expect(result.hasStagedChanges).toBe(true);
      expect(result.hasUnstagedChanges).toBe(false);
      expect(result.hasChanges).toBe(true);
      expect(result.stagedFiles).toEqual(['file1.ts', 'file2.ts']);
      expect(result.worktreeType).toBe('pr_worktree');
    });

    it('detects main worktree type for main branch', () => {
      vi.mocked(analyzeGitState).mockReturnValue({
        currentBranch: 'main',
        baseBranch: 'main',
        isBaseBranch: true,
        commitRelation: 'same',
        stagedFiles: [],
        unstagedFiles: [],
        localCommits: [],
        worktreeType: 'main_worktree',
      });
      vi.mocked(detectScenario).mockReturnValue('main_clean_same');
      vi.mocked(getScenarioContext).mockReturnValue({
        message: 'Ready to create a new branch',
        choices: [],
      });

      const result = analyzeState(defaultOptions);
      expect(result.worktreeType).toBe('main_worktree');
    });

    it('provides available actions for scenarios', () => {
      vi.mocked(analyzeGitState).mockReturnValue({
        currentBranch: 'main',
        baseBranch: 'main',
        isBaseBranch: true,
        commitRelation: 'same',
        stagedFiles: ['file.ts'],
        unstagedFiles: [],
        localCommits: [],
        worktreeType: 'main_worktree',
      });
      vi.mocked(detectScenario).mockReturnValue('main_staged_same');
      vi.mocked(getScenarioContext).mockReturnValue({
        message: 'You have staged changes',
        choices: [
          { label: 'Commit staged changes', action: { action: 'commit_staged', branchFrom: 'origin_main', stashUnstaged: false } },
          { label: 'Stash and empty', action: { action: 'stash_and_empty', branchFrom: 'origin_main', stashUnstaged: true } },
        ],
      });

      const result = analyzeState(defaultOptions);

      expect(result.availableActions.length).toBe(2);
      expect(result.availableActions[0]).toHaveProperty('key');
      expect(result.availableActions[0]).toHaveProperty('label');
      expect(result.availableActions[0].key).toBe('commit_staged');
    });

    it('recommends an action when available', () => {
      vi.mocked(analyzeGitState).mockReturnValue({
        currentBranch: 'main',
        baseBranch: 'main',
        isBaseBranch: true,
        commitRelation: 'same',
        stagedFiles: ['file.ts'],
        unstagedFiles: [],
        localCommits: [],
        worktreeType: 'main_worktree',
      });
      vi.mocked(detectScenario).mockReturnValue('main_staged_same');
      vi.mocked(getScenarioContext).mockReturnValue({
        message: 'You have staged changes',
        choices: [
          { label: 'Commit staged', action: { action: 'commit_staged', branchFrom: 'origin_main', stashUnstaged: false } },
        ],
      });

      const result = analyzeState(defaultOptions);

      expect(result.recommendedAction).toBe('commit_staged');
    });

    it('handles pr_worktree scenario with null recommended action', () => {
      vi.mocked(analyzeGitState).mockReturnValue({
        currentBranch: 'feature-x',
        baseBranch: 'main',
        isBaseBranch: false,
        commitRelation: 'divergent',
        stagedFiles: [],
        unstagedFiles: [],
        localCommits: [],
        worktreeType: 'pr_worktree',
      });
      vi.mocked(detectScenario).mockReturnValue('pr_worktree');
      vi.mocked(getScenarioContext).mockReturnValue(null);

      const result = analyzeState(defaultOptions);

      expect(result.scenario).toBe('pr_worktree');
      expect(result.recommendedAction).toBeNull();
      expect(result.availableActions).toEqual([]);
    });
  });

  describe('formatText', () => {
    const makeResult = (overrides: Partial<WtstateResult> = {}): WtstateResult => ({
      scenario: 'main_clean_same',
      scenarioDescription: 'On main, clean, synced with origin',
      currentBranch: 'main',
      baseBranch: 'main',
      worktreeType: 'main_worktree',
      hasChanges: false,
      hasStagedChanges: false,
      hasUnstagedChanges: false,
      localCommits: [],
      stagedFiles: [],
      unstagedFiles: [],
      availableActions: [{ key: 'empty_commit', label: 'Create empty commit' }],
      recommendedAction: 'empty_commit',
      ...overrides,
    });

    it('formats basic state info', () => {
      const result = makeResult();
      const text = formatText(result, false);

      expect(text).toContain('Scenario');
      expect(text).toContain('main_clean_same');
      expect(text).toContain('Branch');
      expect(text).toContain('main');
    });

    it('includes verbose info when verbose is true', () => {
      const result = makeResult({
        stagedFiles: ['file1.ts', 'file2.ts'],
        hasStagedChanges: true,
        hasChanges: true,
      });
      const text = formatText(result, true);

      expect(text).toContain('file1.ts');
      expect(text).toContain('file2.ts');
    });

    it('shows available actions', () => {
      const result = makeResult({
        availableActions: [
          { key: 'empty_commit', label: 'Create empty commit' },
          { key: 'commit_staged', label: 'Commit staged changes' },
        ],
      });
      const text = formatText(result, false);

      expect(text).toContain('Available actions:');
      expect(text).toContain('empty_commit');
    });

    it('shows recommended action', () => {
      const result = makeResult({
        recommendedAction: 'commit_staged',
      });
      const text = formatText(result, false);

      expect(text).toContain('Recommended');
      expect(text).toContain('commit_staged');
    });

    it('handles null branch (detached head)', () => {
      const result = makeResult({
        currentBranch: null,
        scenario: 'detached_head',
        scenarioDescription: 'In detached HEAD state',
      });
      const text = formatText(result, false);

      expect(text).toContain('detached');
    });

    it('includes local commits in verbose mode', () => {
      const result = makeResult({
        localCommits: ['abc123 First commit', 'def456 Second commit'],
      });
      const text = formatText(result, true);

      expect(text).toContain('Local commits:');
      expect(text).toContain('abc123 First commit');
      expect(text).toContain('def456 Second commit');
    });

    it('truncates many local commits in verbose mode', () => {
      const commits = Array.from({ length: 15 }, (_, i) => `commit${i} Message ${i}`);
      const result = makeResult({
        localCommits: commits,
      });
      const text = formatText(result, true);

      expect(text).toContain('... and 5 more');
    });

    it('shows worktree type', () => {
      const result = makeResult({
        worktreeType: 'pr_worktree',
      });
      const text = formatText(result, false);

      expect(text).toContain('Worktree type: pr_worktree');
    });
  });
});
