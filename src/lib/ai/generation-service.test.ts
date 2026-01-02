/**
 * Generation Service Tests
 *
 * Tests the high-level AI generation service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIGenerationService, createAIGenerationService } from './generation-service.js';
import type { AIConfig } from './types.js';

// Mock the provider-manager module
vi.mock('./provider-manager.js', () => {
  const mockManager = {
    initialize: vi.fn().mockResolvedValue(undefined),
    generateBranchName: vi.fn().mockResolvedValue({
      success: true,
      content: 'feat/test-branch',
      provider: 'mock',
    }),
    generatePRTitle: vi.fn().mockResolvedValue({
      success: true,
      content: 'Test PR Title',
      provider: 'mock',
    }),
    generatePRDescription: vi.fn().mockResolvedValue({
      success: true,
      content: '## Summary\n\nTest description',
      provider: 'mock',
    }),
    generateCommitMessage: vi.fn().mockResolvedValue({
      success: true,
      content: 'feat: test commit',
      provider: 'mock',
    }),
  };

  return {
    getDefaultAIProviderManager: vi.fn().mockReturnValue(mockManager),
  };
});

describe('AIGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('returns false when provider is none', () => {
      const config: AIConfig = {
        provider: 'none',
        branchName: true,
        prTitle: true,
      };
      const service = new AIGenerationService(config);

      expect(service.isEnabled()).toBe(false);
    });

    it('returns false when no features are enabled', () => {
      const config: AIConfig = {
        provider: 'claude',
        branchName: false,
        prTitle: false,
        prDescription: false,
        commitMessage: false,
        planDocument: false,
      };
      const service = new AIGenerationService(config);

      expect(service.isEnabled()).toBe(false);
    });

    it('returns true when provider and at least one feature enabled', () => {
      const config: AIConfig = {
        provider: 'claude',
        branchName: true,
        prTitle: false,
        prDescription: false,
      };
      const service = new AIGenerationService(config);

      expect(service.isEnabled()).toBe(true);
    });

    it('returns true with fallback provider', () => {
      const config: AIConfig = {
        provider: 'fallback',
        branchName: true,
      };
      const service = new AIGenerationService(config);

      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('generateBranchName', () => {
    it('returns error when disabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        branchName: false,
      };
      const service = new AIGenerationService(config);

      const result = await service.generateBranchName({
        description: 'Add auth',
        repoName: 'my-app',
        branchPrefix: 'feat',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
      expect(result.provider).toBe('none');
    });

    it('generates branch name when enabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        branchName: true,
      };
      const service = new AIGenerationService(config);

      const result = await service.generateBranchName({
        description: 'Add auth',
        repoName: 'my-app',
        branchPrefix: 'feat',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('feat/test-branch');
    });
  });

  describe('generatePRTitle', () => {
    it('returns error when disabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        prTitle: false,
      };
      const service = new AIGenerationService(config);

      const result = await service.generatePRTitle({
        description: 'Add auth',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('generates PR title when enabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        prTitle: true,
      };
      const service = new AIGenerationService(config);

      const result = await service.generatePRTitle({
        description: 'Add auth',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Test PR Title');
    });
  });

  describe('generatePRDescription', () => {
    it('returns error when disabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        prDescription: false,
      };
      const service = new AIGenerationService(config);

      const result = await service.generatePRDescription({
        description: 'Add auth',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('generates PR description when enabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        prDescription: true,
      };
      const service = new AIGenerationService(config);

      const result = await service.generatePRDescription({
        description: 'Add auth',
        branchName: 'feat/add-auth',
        baseBranch: 'main',
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('Summary');
    });
  });

  describe('generateCommitMessage', () => {
    it('returns error when disabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        commitMessage: false,
      };
      const service = new AIGenerationService(config);

      const result = await service.generateCommitMessage({
        stagedFiles: ['src/auth.ts'],
        style: 'conventional',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('generates commit message when enabled', async () => {
      const config: AIConfig = {
        provider: 'claude',
        commitMessage: true,
      };
      const service = new AIGenerationService(config);

      const result = await service.generateCommitMessage({
        stagedFiles: ['src/auth.ts'],
        style: 'conventional',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('feat: test commit');
    });
  });
});

describe('createAIGenerationService', () => {
  it('creates a service with the given config', () => {
    const config: AIConfig = {
      provider: 'claude',
      branchName: true,
    };

    const service = createAIGenerationService(config);

    expect(service).toBeInstanceOf(AIGenerationService);
    expect(service.isEnabled()).toBe(true);
  });
});
