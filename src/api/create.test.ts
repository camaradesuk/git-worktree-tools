import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
  getRepoName: vi.fn(),
  getMainWorktreeRoot: vi.fn(),
  fetch: vi.fn(),
  remoteBranchExists: vi.fn(),
  push: vi.fn(),
  addWorktree: vi.fn(),
  checkout: vi.fn(),
}));

vi.mock('../lib/github.js', () => ({
  isGhInstalled: vi.fn(),
  isAuthenticated: vi.fn(),
  getPr: vi.fn(),
  getPrByBranch: vi.fn(),
  createPr: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadConfig: vi.fn(),
  generateBranchName: vi.fn(),
  generateWorktreePath: vi.fn(),
}));

vi.mock('../lib/state-detection.js', () => ({
  analyzeGitState: vi.fn(),
  detectScenario: vi.fn(),
}));

vi.mock('../lib/newpr/index.js', () => ({
  getScenarioContext: vi.fn(),
  isExistingBranchAction: vi.fn(),
  executeStateAction: vi.fn(),
  getBranchPoint: vi.fn(),
  createActionDeps: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));

import * as fs from 'fs';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import { loadConfig, generateWorktreePath } from '../lib/config.js';
import { setupPrWorktree } from './create.js';
import type { ResolvedConfig } from '../lib/config.js';
import type { PrInfo } from '../lib/github.js';

const fakeConfig = {} as ResolvedConfig; // opaque here — generateWorktreePath is mocked

const makePrInfo = (overrides: Partial<PrInfo> = {}): PrInfo => ({
  number: 42,
  title: 'Test PR',
  state: 'OPEN',
  headBranch: 'feat/x',
  baseBranch: 'main',
  url: 'https://github.com/org/repo/pull/42',
  isDraft: false,
  ...overrides,
});

describe('setupPrWorktree', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(github.isGhInstalled).mockReturnValue(true);
    vi.mocked(github.isAuthenticated).mockReturnValue(true);
  });

  it('anchors the generated worktree path to the main worktree root', async () => {
    vi.mocked(git.getRepoRoot).mockReturnValue('/container/pr/pr1.other');
    vi.mocked(git.getRepoName).mockReturnValue('container');
    vi.mocked(git.getMainWorktreeRoot).mockReturnValue('/container');
    vi.mocked(loadConfig).mockReturnValue(fakeConfig);
    vi.mocked(github.getPr).mockReturnValue(makePrInfo());
    vi.mocked(generateWorktreePath).mockReturnValue('/container/pr/pr42.feature-x');
    vi.mocked(fs.existsSync).mockReturnValue(true); // short-circuits at WORKTREE_EXISTS

    const result = await setupPrWorktree({ prNumber: 42 });

    expect(generateWorktreePath).toHaveBeenCalledWith(
      fakeConfig,
      '/container/pr/pr1.other',
      'container',
      42,
      'feat/x',
      '/container'
    );
    expect(result.success).toBe(false);
  });

  it('falls back to repoRoot when the main worktree root cannot be determined', async () => {
    vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
    vi.mocked(git.getRepoName).mockReturnValue('repo');
    vi.mocked(git.getMainWorktreeRoot).mockImplementation(() => {
      throw new Error('not a git repo');
    });
    vi.mocked(loadConfig).mockReturnValue(fakeConfig);
    vi.mocked(github.getPr).mockReturnValue(makePrInfo());
    vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr42');
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await setupPrWorktree({ prNumber: 42 });

    expect(generateWorktreePath).toHaveBeenCalledWith(
      fakeConfig,
      '/repo',
      'repo',
      42,
      'feat/x',
      '/repo'
    );
  });
});
