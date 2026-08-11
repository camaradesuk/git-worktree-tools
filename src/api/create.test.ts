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
  getChangedFiles: vi.fn(),
  getCommitMessages: vi.fn(),
  getCurrentBranch: vi.fn(),
  exec: vi.fn(),
  getStagedFiles: vi.fn(),
  commit: vi.fn(),
  stash: vi.fn(),
  stashApply: vi.fn(),
  stashDrop: vi.fn(),
  stashPop: vi.fn(),
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
  generatePRContentAsync: vi.fn(),
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

// worktree-setup.js does real filesystem work (mkdir, .gitignore edits) when the
// worktree parent dir resolves inside repoRoot. Every fixture below places the
// worktree path outside repoRoot, so isInsideRepo() short-circuits — this mock
// exists purely as a belt-and-braces guard against ever hitting the real fs.
vi.mock('../lib/worktree-setup.js', () => ({
  ensureWorktreeParentDir: vi.fn().mockResolvedValue({
    created: false,
    gitignoreUpdated: false,
    declined: false,
  }),
}));

vi.mock('fs', () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn() },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import * as fs from 'fs';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import {
  loadConfig,
  generateBranchName,
  generateWorktreePath,
  generatePRContentAsync,
} from '../lib/config.js';
import { analyzeGitState, detectScenario } from '../lib/state-detection.js';
import {
  getScenarioContext,
  isExistingBranchAction,
  executeStateAction,
  getBranchPoint,
  createActionDeps,
} from '../lib/newpr/index.js';
import { setupPrWorktree, createPr } from './create.js';
import type { ResolvedConfig } from '../lib/config.js';
import type { PrInfo } from '../lib/github.js';
import type { PRGenerationResult } from '../lib/config.js';

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

describe('createPr', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(github.isGhInstalled).mockReturnValue(true);
    vi.mocked(github.isAuthenticated).mockReturnValue(true);
  });

  it('anchors the worktree path to the main worktree root for an existing PR on an existing branch', async () => {
    vi.mocked(git.getRepoRoot).mockReturnValue('/container/pr/pr1.other');
    vi.mocked(git.getRepoName).mockReturnValue('container');
    vi.mocked(git.getMainWorktreeRoot).mockReturnValue('/container');
    vi.mocked(loadConfig).mockReturnValue(fakeConfig);
    vi.mocked(generateBranchName).mockReturnValue('feat/current');
    vi.mocked(analyzeGitState).mockReturnValue({
      currentBranch: 'feat/current',
    } as unknown as ReturnType<typeof analyzeGitState>);
    vi.mocked(detectScenario).mockReturnValue('branch_with_changes');
    const action = { action: 'commit_and_push', branchFrom: 'current' } as unknown as Parameters<
      typeof isExistingBranchAction
    >[0];
    vi.mocked(getScenarioContext).mockReturnValue({
      message: '',
      choices: [{ label: 'Commit and push', action }],
    } as unknown as ReturnType<typeof getScenarioContext>);
    vi.mocked(isExistingBranchAction).mockReturnValue(true);
    vi.mocked(createActionDeps).mockReturnValue({} as ReturnType<typeof createActionDeps>);
    vi.mocked(executeStateAction).mockReturnValue({ success: true, stashRef: null });
    vi.mocked(git.remoteBranchExists).mockReturnValue(true);
    vi.mocked(github.getPrByBranch).mockReturnValue(makePrInfo());
    vi.mocked(generateWorktreePath).mockReturnValue('/container/pr/pr42.feature-x');
    vi.mocked(fs.existsSync).mockReturnValue(true); // skip addWorktree

    const result = await createPr({ description: 'Add feature' });

    expect(generateWorktreePath).toHaveBeenCalledWith(
      fakeConfig,
      '/container/pr/pr1.other',
      'container',
      42,
      'feat/current',
      '/container'
    );
    expect(result.success).toBe(true);
  });
});

/** A generatePRContentAsync result where AI contributed nothing to either field. */
const noAiResult = (description: string): PRGenerationResult => ({
  title: description,
  description: '',
  aiGenerated: false,
  titleGenerated: false,
  descriptionGenerated: false,
  provider: null,
  error: null,
});

describe('createPr - existing branch PR content resolution', () => {
  const currentBranch = 'feat/add-widget';
  const derivedTitle = 'Add Widget';
  const defaultBody = `## Summary\n\nPR created from existing branch: \`${currentBranch}\`\n\n## Changes\n\n-\n\n## Test Plan\n\n- [ ]\n\n---\n🤖 PR created with \`newpr\``;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(github.isGhInstalled).mockReturnValue(true);
    vi.mocked(github.isAuthenticated).mockReturnValue(true);
    vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
    vi.mocked(git.getRepoName).mockReturnValue('repo');
    vi.mocked(git.getMainWorktreeRoot).mockReturnValue('/repo');
    vi.mocked(loadConfig).mockReturnValue(fakeConfig);
    vi.mocked(analyzeGitState).mockReturnValue({
      currentBranch,
    } as unknown as ReturnType<typeof analyzeGitState>);
    vi.mocked(detectScenario).mockReturnValue('branch_with_changes');

    const action = { action: 'commit_and_push', branchFrom: 'current' } as unknown as Parameters<
      typeof isExistingBranchAction
    >[0];
    vi.mocked(getScenarioContext).mockReturnValue({
      message: '',
      choices: [{ label: 'Commit and push', action }],
    } as unknown as ReturnType<typeof getScenarioContext>);
    vi.mocked(isExistingBranchAction).mockReturnValue(true);
    vi.mocked(createActionDeps).mockReturnValue({} as ReturnType<typeof createActionDeps>);
    vi.mocked(executeStateAction).mockReturnValue({ success: true, stashRef: null });
    vi.mocked(git.remoteBranchExists).mockReturnValue(true); // already on remote, skip push
    vi.mocked(github.getPrByBranch).mockReturnValue(undefined); // no PR yet -> create one
    vi.mocked(git.getChangedFiles).mockReturnValue([]);
    vi.mocked(git.getCommitMessages).mockReturnValue([]);
    vi.mocked(generatePRContentAsync).mockResolvedValue(noAiResult(derivedTitle));
    vi.mocked(github.createPr).mockReturnValue(
      makePrInfo({ number: 50, headBranch: currentBranch })
    );
    vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr50');
    vi.mocked(fs.existsSync).mockReturnValue(true); // skip addWorktree branch
  });

  it('falls back to the derived title and the byte-identical template body when nothing is supplied', async () => {
    const result = await createPr({ description: 'Add feature' });

    expect(github.createPr).toHaveBeenCalledWith({
      title: derivedTitle,
      body: defaultBody,
      base: 'main',
      head: currentBranch,
      draft: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.titleSource).toBe('template');
    expect(result.data?.bodySource).toBe('template');
  });

  it('lets caller-supplied title and body win over AI and the template', async () => {
    const result = await createPr({
      description: 'Add feature',
      title: 'Exact title',
      body: 'Exact body',
    });

    expect(generatePRContentAsync).not.toHaveBeenCalled();
    expect(github.createPr).toHaveBeenCalledWith({
      title: 'Exact title',
      body: 'Exact body',
      base: 'main',
      head: currentBranch,
      draft: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.titleSource).toBe('flag');
    expect(result.data?.bodySource).toBe('flag');
  });

  it('resolves title from the flag and body from AI independently when only title is supplied', async () => {
    vi.mocked(generatePRContentAsync).mockResolvedValue({
      title: derivedTitle,
      description: 'AI-generated body',
      aiGenerated: true,
      titleGenerated: false,
      descriptionGenerated: true,
      provider: 'claude',
      error: null,
    });

    const result = await createPr({
      description: 'Add feature',
      title: 'Caller-supplied title',
    });

    expect(github.createPr).toHaveBeenCalledWith({
      title: 'Caller-supplied title',
      body: 'AI-generated body',
      base: 'main',
      head: currentBranch,
      draft: false,
    });
    expect(result.data?.titleSource).toBe('flag');
    expect(result.data?.bodySource).toBe('ai');
    expect(result.data?.aiProvider).toBe('claude');
  });

  it('resolves body from the flag and title from AI independently when only body is supplied', async () => {
    vi.mocked(generatePRContentAsync).mockResolvedValue({
      title: 'AI-generated title',
      description: '',
      aiGenerated: true,
      titleGenerated: true,
      descriptionGenerated: false,
      provider: 'claude',
      error: null,
    });

    const result = await createPr({
      description: 'Add feature',
      body: 'Caller-supplied body',
    });

    expect(github.createPr).toHaveBeenCalledWith({
      title: 'AI-generated title',
      body: 'Caller-supplied body',
      base: 'main',
      head: currentBranch,
      draft: false,
    });
    expect(result.data?.titleSource).toBe('ai');
    expect(result.data?.bodySource).toBe('flag');
    expect(result.data?.aiProvider).toBe('claude');
  });

  it('forwards forceAi so AI wins over a supplied title', async () => {
    vi.mocked(generatePRContentAsync).mockResolvedValue({
      title: 'AI-generated title',
      description: '',
      aiGenerated: true,
      titleGenerated: true,
      descriptionGenerated: false,
      provider: 'claude',
      error: null,
    });

    const result = await createPr({
      description: 'Add feature',
      title: 'Caller-supplied title',
      forceAi: true,
    });

    expect(generatePRContentAsync).toHaveBeenCalled();
    expect(github.createPr).toHaveBeenCalledWith({
      title: 'AI-generated title',
      body: defaultBody,
      base: 'main',
      head: currentBranch,
      draft: false,
    });
    expect(result.data?.titleSource).toBe('ai');
    expect(result.data?.bodySource).toBe('template');
  });
});

describe('createPr - new branch PR content resolution', () => {
  const description = 'Add new feature';
  const branchName = 'feat/add-new-feature';
  const defaultBody = `## Summary\n\n${description}\n\n## Changes\n\n-\n\n## Test Plan\n\n- [ ]\n\n---\n🤖 PR created with \`newpr\``;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(github.isGhInstalled).mockReturnValue(true);
    vi.mocked(github.isAuthenticated).mockReturnValue(true);
    vi.mocked(git.getRepoRoot).mockReturnValue('/repo');
    vi.mocked(git.getRepoName).mockReturnValue('repo');
    vi.mocked(git.getMainWorktreeRoot).mockReturnValue('/repo');
    vi.mocked(loadConfig).mockReturnValue(fakeConfig);
    vi.mocked(generateBranchName).mockReturnValue(branchName);
    vi.mocked(analyzeGitState).mockReturnValue({
      currentBranch: 'main',
    } as unknown as ReturnType<typeof analyzeGitState>);
    vi.mocked(detectScenario).mockReturnValue('main_clean_ahead');

    const action = {
      action: 'empty_commit',
      branchFrom: 'origin_main',
      stashUnstaged: false,
    } as unknown as Parameters<typeof isExistingBranchAction>[0];
    vi.mocked(getScenarioContext).mockReturnValue({
      message: '',
      choices: [{ label: 'Empty commit', action }],
    } as unknown as ReturnType<typeof getScenarioContext>);
    vi.mocked(isExistingBranchAction).mockReturnValue(false);
    vi.mocked(git.remoteBranchExists).mockReturnValue(false); // branch not on remote yet
    vi.mocked(git.getCurrentBranch).mockReturnValue('main');
    vi.mocked(createActionDeps).mockReturnValue({} as ReturnType<typeof createActionDeps>);
    vi.mocked(executeStateAction).mockReturnValue({ success: true, stashRef: null });
    vi.mocked(getBranchPoint).mockReturnValue('origin/main');
    vi.mocked(git.getStagedFiles).mockReturnValue([]);
    vi.mocked(git.getChangedFiles).mockReturnValue([]);
    vi.mocked(git.getCommitMessages).mockReturnValue([]);
    vi.mocked(generatePRContentAsync).mockResolvedValue(noAiResult(description));
    vi.mocked(github.createPr).mockReturnValue(makePrInfo({ number: 51, headBranch: branchName }));
    vi.mocked(generateWorktreePath).mockReturnValue('/repo.pr51');
  });

  it('falls back to the description as title and the byte-identical template body when nothing is supplied', async () => {
    const result = await createPr({ description });

    expect(github.createPr).toHaveBeenCalledWith({
      title: description,
      body: defaultBody,
      base: 'main',
      head: branchName,
      draft: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.titleSource).toBe('template');
    expect(result.data?.bodySource).toBe('template');
  });

  it('lets caller-supplied title and body win over AI and the template', async () => {
    const result = await createPr({
      description,
      title: 'Exact title',
      body: 'Exact body',
    });

    expect(generatePRContentAsync).not.toHaveBeenCalled();
    expect(github.createPr).toHaveBeenCalledWith({
      title: 'Exact title',
      body: 'Exact body',
      base: 'main',
      head: branchName,
      draft: false,
    });
    expect(result.data?.titleSource).toBe('flag');
    expect(result.data?.bodySource).toBe('flag');
  });

  it('resolves title from the flag and body from AI independently when only title is supplied', async () => {
    vi.mocked(generatePRContentAsync).mockResolvedValue({
      title: description,
      description: 'AI-generated body',
      aiGenerated: true,
      titleGenerated: false,
      descriptionGenerated: true,
      provider: 'gemini',
      error: null,
    });

    const result = await createPr({
      description,
      title: 'Caller-supplied title',
    });

    expect(github.createPr).toHaveBeenCalledWith({
      title: 'Caller-supplied title',
      body: 'AI-generated body',
      base: 'main',
      head: branchName,
      draft: false,
    });
    expect(result.data?.titleSource).toBe('flag');
    expect(result.data?.bodySource).toBe('ai');
    expect(result.data?.aiProvider).toBe('gemini');
  });

  it('resolves body from the flag and title from AI independently when only body is supplied', async () => {
    vi.mocked(generatePRContentAsync).mockResolvedValue({
      title: 'AI-generated title',
      description: '',
      aiGenerated: true,
      titleGenerated: true,
      descriptionGenerated: false,
      provider: 'gemini',
      error: null,
    });

    const result = await createPr({
      description,
      body: 'Caller-supplied body',
    });

    expect(github.createPr).toHaveBeenCalledWith({
      title: 'AI-generated title',
      body: 'Caller-supplied body',
      base: 'main',
      head: branchName,
      draft: false,
    });
    expect(result.data?.titleSource).toBe('ai');
    expect(result.data?.bodySource).toBe('flag');
    expect(result.data?.aiProvider).toBe('gemini');
  });

  it('forwards skipAi so AI is never invoked, even when content is missing', async () => {
    const result = await createPr({
      description,
      skipAi: true,
    });

    expect(generatePRContentAsync).not.toHaveBeenCalled();
    expect(github.createPr).toHaveBeenCalledWith({
      title: description,
      body: defaultBody,
      base: 'main',
      head: branchName,
      draft: false,
    });
    expect(result.data?.titleSource).toBe('template');
    expect(result.data?.bodySource).toBe('template');
    expect(result.data?.aiError).toBe('AI skipped (--skip-ai)');
  });

  it('returns INVALID_ARGUMENT for an unreadable bodyFile without ever pushing to git', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const result = await createPr({
      description,
      bodyFile: '/nonexistent/body.md',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGUMENT');
    // The whole point: validation must happen before any git mutation, so a
    // bad --body-file must never leave a pushed branch with no PR behind it.
    expect(git.push).not.toHaveBeenCalled();
    expect(git.exec).not.toHaveBeenCalled();
    expect(github.createPr).not.toHaveBeenCalled();
  });

  // A blank title is a *defined* value, so it suppresses generation and then
  // reaches `gh pr create`, which rejects it — after the push, orphaning the
  // branch exactly as an unreadable --body-file did before it was hoisted.
  it.each([
    ['title', { title: '   ' }],
    ['body', { body: '  \n ' }],
  ])('rejects a whitespace-only %s without ever pushing to git', async (_label, override) => {
    const result = await createPr({ description, ...override });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_ARGUMENT');
    expect(result.error?.message).toMatch(/must not be empty or whitespace-only/);
    expect(git.push).not.toHaveBeenCalled();
    expect(github.createPr).not.toHaveBeenCalled();
  });
});
