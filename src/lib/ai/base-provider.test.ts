/**
 * Base Provider Tests
 *
 * Tests the utility functions and base provider class for AI content generation.
 */

import { describe, it, expect } from 'vitest';
import {
  createSuccessResult,
  createErrorResult,
  sanitizeBranchName,
  createBranchNamePrompt,
  createPRTitlePrompt,
  createPRDescriptionPrompt,
  createCommitMessagePrompt,
  createPlanDocumentPrompt,
  BaseAIProvider,
} from './base-provider.js';
import type {
  BranchContext,
  PRContext,
  CommitContext,
  PlanContext,
  AIGenerationResult,
} from './types.js';

describe('Result helpers', () => {
  describe('createSuccessResult', () => {
    it('creates a success result with content', () => {
      const result = createSuccessResult('test content', 'test-provider');

      expect(result.success).toBe(true);
      expect(result.content).toBe('test content');
      expect(result.provider).toBe('test-provider');
      expect(result.error).toBeUndefined();
    });
  });

  describe('createErrorResult', () => {
    it('creates an error result with message', () => {
      const result = createErrorResult('Something went wrong', 'test-provider');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
      expect(result.provider).toBe('test-provider');
      expect(result.content).toBeUndefined();
    });
  });
});

describe('sanitizeBranchName', () => {
  it('converts to lowercase', () => {
    expect(sanitizeBranchName('AddUserAuth')).toBe('adduserauth');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeBranchName('add user auth')).toBe('add-user-auth');
  });

  it('replaces special characters with hyphens', () => {
    expect(sanitizeBranchName('fix: bug #123 (urgent!)')).toBe('fix-bug-123-urgent');
  });

  it('removes leading and trailing hyphens', () => {
    expect(sanitizeBranchName('--test--branch--')).toBe('test-branch');
  });

  it('collapses multiple hyphens', () => {
    expect(sanitizeBranchName('test   branch')).toBe('test-branch');
  });

  it('truncates to max length', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeBranchName(longName, 20)).toBe('a'.repeat(20));
  });

  it('uses default max length of 50', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeBranchName(longName)).toBe('a'.repeat(50));
  });

  it('handles empty string', () => {
    expect(sanitizeBranchName('')).toBe('');
  });
});

describe('Prompt generators', () => {
  describe('createBranchNamePrompt', () => {
    it('includes task description', () => {
      const context: BranchContext = {
        description: 'Add user authentication',
        repoName: 'my-app',
        branchPrefix: 'feat',
      };

      const prompt = createBranchNamePrompt(context);

      expect(prompt).toContain('Add user authentication');
      expect(prompt).toContain('my-app');
      expect(prompt).toContain('feat');
    });

    it('includes existing branches warning when provided', () => {
      const context: BranchContext = {
        description: 'Add feature',
        repoName: 'my-app',
        branchPrefix: 'feat',
        existingBranches: ['feat/other-feature', 'feat/old-work'],
      };

      const prompt = createBranchNamePrompt(context);

      expect(prompt).toContain('Existing branches to avoid');
      expect(prompt).toContain('feat/other-feature');
    });

    it('includes max length requirement', () => {
      const context: BranchContext = {
        description: 'Add feature',
        repoName: 'my-app',
        branchPrefix: 'feat',
        maxLength: 40,
      };

      const prompt = createBranchNamePrompt(context);

      expect(prompt).toContain('40 characters');
    });
  });

  describe('createPRTitlePrompt', () => {
    it('includes description and branch info', () => {
      const context: PRContext = {
        description: 'Add user authentication',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      };

      const prompt = createPRTitlePrompt(context);

      expect(prompt).toContain('Add user authentication');
      expect(prompt).toContain('feat/add-auth');
      expect(prompt).toContain('main');
    });

    it('includes commits when provided', () => {
      const context: PRContext = {
        description: 'Add feature',
        branchName: 'feat/test',
        baseBranch: 'main',
        commits: [
          { hash: 'abc123', message: 'Initial implementation' },
          { hash: 'def456', message: 'Add tests' },
        ],
      };

      const prompt = createPRTitlePrompt(context);

      expect(prompt).toContain('Commits');
      expect(prompt).toContain('Initial implementation');
      expect(prompt).toContain('Add tests');
    });

    it('includes changed files when provided', () => {
      const context: PRContext = {
        description: 'Add feature',
        branchName: 'feat/test',
        baseBranch: 'main',
        changedFiles: ['src/auth.ts', 'src/login.ts'],
      };

      const prompt = createPRTitlePrompt(context);

      expect(prompt).toContain('Changed files');
      expect(prompt).toContain('src/auth.ts');
    });
  });

  describe('createPRDescriptionPrompt', () => {
    it('includes all context information', () => {
      const context: PRContext = {
        description: 'Add authentication',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
        commits: [{ hash: 'abc', message: 'Initial commit' }],
        changedFiles: ['src/auth.ts'],
        diff: '+ added line\n- removed line',
      };

      const prompt = createPRDescriptionPrompt(context);

      expect(prompt).toContain('Add authentication');
      expect(prompt).toContain('abc');
      expect(prompt).toContain('src/auth.ts');
      expect(prompt).toContain('+ added line');
    });

    it('includes format structure', () => {
      const context: PRContext = {
        description: 'Test',
        branchName: 'test',
        baseBranch: 'main',
      };

      const prompt = createPRDescriptionPrompt(context);

      expect(prompt).toContain('## Summary');
      expect(prompt).toContain('## Changes');
      expect(prompt).toContain('## Test Plan');
    });
  });

  describe('createCommitMessagePrompt', () => {
    it('includes staged files and style', () => {
      const context: CommitContext = {
        stagedFiles: ['src/feature.ts', 'src/feature.test.ts'],
        style: 'conventional',
      };

      const prompt = createCommitMessagePrompt(context);

      expect(prompt).toContain('src/feature.ts');
      expect(prompt).toContain('conventional');
    });

    it('includes different style guides', () => {
      const gitmojiContext: CommitContext = {
        stagedFiles: ['src/test.ts'],
        style: 'gitmoji',
      };

      const simpleContext: CommitContext = {
        stagedFiles: ['src/test.ts'],
        style: 'simple',
      };

      const gitmojiPrompt = createCommitMessagePrompt(gitmojiContext);
      const simplePrompt = createCommitMessagePrompt(simpleContext);

      expect(gitmojiPrompt).toContain('emoji');
      expect(simplePrompt).toContain('simple, descriptive');
    });

    it('includes recent commits when provided', () => {
      const context: CommitContext = {
        stagedFiles: ['src/test.ts'],
        recentCommits: ['feat: previous feature', 'fix: previous bug'],
      };

      const prompt = createCommitMessagePrompt(context);

      expect(prompt).toContain('Recent commits');
      expect(prompt).toContain('feat: previous feature');
    });
  });

  describe('createPlanDocumentPrompt', () => {
    it('includes task and branch info', () => {
      const context: PlanContext = {
        description: 'Implement user dashboard',
        branchName: 'feat/user-dashboard',
      };

      const prompt = createPlanDocumentPrompt(context);

      expect(prompt).toContain('Implement user dashboard');
      expect(prompt).toContain('feat/user-dashboard');
    });

    it('includes tech stack when provided', () => {
      const context: PlanContext = {
        description: 'Add feature',
        branchName: 'feat/test',
        techStack: ['TypeScript', 'React', 'Node.js'],
      };

      const prompt = createPlanDocumentPrompt(context);

      expect(prompt).toContain('Tech stack');
      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('React');
    });

    it('includes repo structure when provided', () => {
      const context: PlanContext = {
        description: 'Add feature',
        branchName: 'feat/test',
        repoStructure: ['src/', 'src/components/', 'src/lib/'],
      };

      const prompt = createPlanDocumentPrompt(context);

      expect(prompt).toContain('Repository structure');
      expect(prompt).toContain('src/components/');
    });
  });
});

describe('BaseAIProvider', () => {
  // Create a concrete implementation for testing
  class TestProvider extends BaseAIProvider {
    readonly name = 'test';
    mockResponse: AIGenerationResult = createSuccessResult('mock response', 'test');

    async isAvailable(): Promise<boolean> {
      return true;
    }

    protected async generate(_prompt: string): Promise<AIGenerationResult> {
      return this.mockResponse;
    }
  }

  const provider = new TestProvider();

  describe('generateBranchName', () => {
    it('cleans up response and ensures prefix', async () => {
      provider.mockResponse = createSuccessResult('"feat/add-auth"', 'test');

      const result = await provider.generateBranchName({
        description: 'Add auth',
        repoName: 'my-app',
        branchPrefix: 'feat',
      });

      expect(result.success).toBe(true);
      // Quotes should be removed
      expect(result.content).toBe('feat/add-auth');
    });

    it('adds prefix if missing', async () => {
      provider.mockResponse = createSuccessResult('add-auth', 'test');

      const result = await provider.generateBranchName({
        description: 'Add auth',
        repoName: 'my-app',
        branchPrefix: 'feat',
      });

      expect(result.success).toBe(true);
      expect(result.content).toMatch(/^feat\//);
    });

    it('returns error result on failure', async () => {
      provider.mockResponse = createErrorResult('API error', 'test');

      const result = await provider.generateBranchName({
        description: 'Add auth',
        repoName: 'my-app',
        branchPrefix: 'feat',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });
  });

  describe('generatePRTitle', () => {
    it('cleans up response', async () => {
      provider.mockResponse = createSuccessResult('"Add user authentication"\n', 'test');

      const result = await provider.generatePRTitle({
        description: 'Add auth',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Add user authentication');
    });
  });

  describe('generatePRDescription', () => {
    it('returns description as-is', async () => {
      const description = '## Summary\n\nThis PR adds auth.';
      provider.mockResponse = createSuccessResult(description, 'test');

      const result = await provider.generatePRDescription({
        description: 'Add auth',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe(description);
    });
  });

  describe('generateCommitMessage', () => {
    it('cleans up response', async () => {
      provider.mockResponse = createSuccessResult("'feat: add authentication'\n", 'test');

      const result = await provider.generateCommitMessage({
        stagedFiles: ['src/auth.ts'],
        style: 'conventional',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('feat: add authentication');
    });
  });

  describe('generatePlanDocument', () => {
    it('returns plan document as-is', async () => {
      const plan = '# Plan: Add Auth\n\n**Branch:** `feat/add-auth`';
      provider.mockResponse = createSuccessResult(plan, 'test');

      const result = await provider.generatePlanDocument({
        description: 'Add auth',
        branchName: 'feat/add-auth',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe(plan);
    });
  });
});
