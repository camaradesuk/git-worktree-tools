/**
 * AI Generation Service
 *
 * High-level service for generating content using AI.
 * Handles provider initialization, caching, and error handling.
 */

import { getDefaultAIProviderManager } from './provider-manager.js';
import type {
  AIConfig,
  AIGenerationResult,
  BranchContext,
  PRContext,
  CommitContext,
} from './types.js';

/**
 * Service for generating AI content
 */
export class AIGenerationService {
  private initialized = false;

  constructor(private config: AIConfig) {}

  /**
   * Initialize the service (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Get manager with our config - this will create a new one with the config
    const manager = getDefaultAIProviderManager(this.config);
    await manager.initialize();
    this.initialized = true;
  }

  /**
   * Generate a branch name from description
   */
  async generateBranchName(context: BranchContext): Promise<AIGenerationResult> {
    if (!this.config.branchName) {
      return {
        success: false,
        error: 'AI branch name generation is disabled',
        provider: 'none',
      };
    }

    await this.ensureInitialized();
    const manager = getDefaultAIProviderManager();
    return manager.generateBranchName(context);
  }

  /**
   * Generate a PR title
   */
  async generatePRTitle(context: PRContext): Promise<AIGenerationResult> {
    if (!this.config.prTitle) {
      return {
        success: false,
        error: 'AI PR title generation is disabled',
        provider: 'none',
      };
    }

    await this.ensureInitialized();
    const manager = getDefaultAIProviderManager();
    return manager.generatePRTitle(context);
  }

  /**
   * Generate a PR description
   */
  async generatePRDescription(context: PRContext): Promise<AIGenerationResult> {
    if (!this.config.prDescription) {
      return {
        success: false,
        error: 'AI PR description generation is disabled',
        provider: 'none',
      };
    }

    await this.ensureInitialized();
    const manager = getDefaultAIProviderManager();
    return manager.generatePRDescription(context);
  }

  /**
   * Generate a commit message
   */
  async generateCommitMessage(context: CommitContext): Promise<AIGenerationResult> {
    if (!this.config.commitMessage) {
      return {
        success: false,
        error: 'AI commit message generation is disabled',
        provider: 'none',
      };
    }

    await this.ensureInitialized();
    const manager = getDefaultAIProviderManager();
    return manager.generateCommitMessage(context);
  }

  /**
   * Check if AI generation is enabled for any feature
   */
  isEnabled(): boolean {
    return (
      this.config.provider !== 'none' &&
      Boolean(
        this.config.branchName ||
          this.config.prTitle ||
          this.config.prDescription ||
          this.config.commitMessage ||
          this.config.planDocument
      )
    );
  }
}

/**
 * Create an AI generation service with the given config
 */
export function createAIGenerationService(config: AIConfig): AIGenerationService {
  return new AIGenerationService(config);
}
