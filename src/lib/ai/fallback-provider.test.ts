/**
 * Fallback Provider Tests
 *
 * Tests the rule-based fallback provider for AI content generation.
 */

import { describe, it, expect } from 'vitest';
import { FallbackProvider } from './fallback-provider.js';
import type { BranchContext, PRContext, CommitContext, PlanContext } from './types.js';

describe('FallbackProvider', () => {
  const provider = new FallbackProvider();

  describe('provider info', () => {
    it('has correct name', () => {
      expect(provider.name).toBe('fallback');
    });

    it('is always available', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe('generateBranchName', () => {
    it('generates kebab-case branch name with prefix', async () => {
      const context: BranchContext = {
        description: 'Add user authentication',
        repoName: 'my-app',
        branchPrefix: 'feat',
      };

      const result = await provider.generateBranchName(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content).toMatch(/^feat\/add-user-authentication-[a-z0-9]+$/);
      expect(result.provider).toBe('fallback');
    });

    it('sanitizes special characters', async () => {
      const context: BranchContext = {
        description: 'Fix: bug #123 (urgent!) @user',
        repoName: 'my-app',
        branchPrefix: 'fix',
      };

      const result = await provider.generateBranchName(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content).not.toMatch(/[#@!():]/);
      expect(result.content).toMatch(/^fix\//);
    });

    it('truncates long descriptions', async () => {
      const context: BranchContext = {
        description:
          'This is a very long description that should be truncated to fit within the maximum branch name length',
        repoName: 'my-app',
        branchPrefix: 'feat',
        maxLength: 50,
      };

      const result = await provider.generateBranchName(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content!.length).toBeLessThanOrEqual(50);
    });

    it('handles empty description', async () => {
      const context: BranchContext = {
        description: '',
        repoName: 'my-app',
        branchPrefix: 'feat',
      };

      const result = await provider.generateBranchName(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      // When description is empty, we get prefix/-suffix pattern
      expect(result.content).toMatch(/^feat\/-[a-z0-9]+$/);
    });
  });

  describe('generatePRTitle', () => {
    it('returns the description as title', async () => {
      const context: PRContext = {
        description: 'Add user authentication',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      };

      const result = await provider.generatePRTitle(context);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Add user authentication');
      expect(result.provider).toBe('fallback');
    });

    it('capitalizes first letter', async () => {
      const context: PRContext = {
        description: 'add user authentication',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      };

      const result = await provider.generatePRTitle(context);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Add user authentication');
    });
  });

  describe('generatePRDescription', () => {
    it('generates basic PR description', async () => {
      const context: PRContext = {
        description: 'Add user authentication',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
        changedFiles: ['src/auth.ts', 'src/login.ts'],
      };

      const result = await provider.generatePRDescription(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content).toContain('Add user authentication');
      expect(result.provider).toBe('fallback');
    });

    it('includes commit information when provided', async () => {
      const context: PRContext = {
        description: 'Add user authentication',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
        commits: [
          { hash: 'abc123', message: 'Add login form' },
          { hash: 'def456', message: 'Add auth middleware' },
        ],
      };

      const result = await provider.generatePRDescription(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });
  });

  describe('generateCommitMessage', () => {
    it('generates commit message from staged files', async () => {
      const context: CommitContext = {
        stagedFiles: ['src/auth.ts', 'src/login.ts'],
        style: 'conventional',
      };

      const result = await provider.generateCommitMessage(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.provider).toBe('fallback');
    });

    it('handles single file', async () => {
      const context: CommitContext = {
        stagedFiles: ['README.md'],
        style: 'simple',
      };

      const result = await provider.generateCommitMessage(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });
  });

  describe('generatePlanDocument', () => {
    it('generates basic plan document', async () => {
      const context: PlanContext = {
        description: 'Add user authentication',
        branchName: 'feat/add-auth',
      };

      const result = await provider.generatePlanDocument(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content).toContain('Add user authentication');
      expect(result.provider).toBe('fallback');
    });

    it('includes tech stack when provided', async () => {
      const context: PlanContext = {
        description: 'Add user authentication',
        branchName: 'feat/add-auth',
        techStack: ['TypeScript', 'Node.js', 'Express'],
      };

      const result = await provider.generatePlanDocument(context);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });
  });
});
