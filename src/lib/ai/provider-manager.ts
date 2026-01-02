/**
 * AI Provider Manager
 *
 * Handles provider selection, auto-detection, and fallback logic.
 */

import type { AIProvider, AIConfig, AIProviderName, AIGenerationResult } from './types.js';
import { DEFAULT_AI_CONFIG } from './types.js';
import { FallbackProvider } from './fallback-provider.js';
import {
  ClaudeProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  ScriptProvider,
} from './cli-provider.js';

/**
 * Provider manager configuration
 */
export interface ProviderManagerOptions {
  /** AI configuration from .worktreerc */
  config?: AIConfig;
}

/**
 * AI Provider Manager
 *
 * Manages provider selection and provides a unified interface for AI generation.
 */
export class AIProviderManager {
  private config: AIConfig;
  private primaryProvider: AIProvider | null = null;
  private fallbackProvider: AIProvider | null = null;
  private initialized = false;

  constructor(options: ProviderManagerOptions = {}) {
    this.config = { ...DEFAULT_AI_CONFIG, ...options.config };
  }

  /**
   * Initialize providers based on configuration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.primaryProvider = await this.resolveProvider(this.config.provider ?? 'auto');

    if (this.config.fallback && this.config.fallback !== 'none') {
      this.fallbackProvider = await this.resolveProvider(this.config.fallback);
    }

    this.initialized = true;
  }

  /**
   * Resolve a provider by name
   */
  private async resolveProvider(name: AIProviderName): Promise<AIProvider | null> {
    switch (name) {
      case 'auto':
        return this.autoDetectProvider();

      case 'claude':
        return this.createClaudeProvider();

      case 'gemini':
        return this.createGeminiProvider();

      case 'openai':
        return this.createOpenAIProvider();

      case 'ollama':
        return this.createOllamaProvider();

      case 'script':
        return this.createScriptProvider();

      case 'none':
        return null;

      default:
        return null;
    }
  }

  /**
   * Auto-detect available AI provider
   */
  private async autoDetectProvider(): Promise<AIProvider | null> {
    // Try providers in order of preference
    const providers = [
      () => this.createClaudeProvider(),
      () => this.createGeminiProvider(),
      () => this.createOllamaProvider(),
      () => this.createOpenAIProvider(),
    ];

    for (const createProvider of providers) {
      const provider = await createProvider();
      if (provider && (await provider.isAvailable())) {
        return provider;
      }
    }

    return null;
  }

  private async createClaudeProvider(): Promise<AIProvider | null> {
    const provider = new ClaudeProvider(this.config.claude?.model);
    return (await provider.isAvailable()) ? provider : null;
  }

  private async createGeminiProvider(): Promise<AIProvider | null> {
    const provider = new GeminiProvider(this.config.gemini?.model);
    return (await provider.isAvailable()) ? provider : null;
  }

  private async createOllamaProvider(): Promise<AIProvider | null> {
    const provider = new OllamaProvider(this.config.ollama?.model, this.config.ollama?.host);
    return (await provider.isAvailable()) ? provider : null;
  }

  private async createOpenAIProvider(): Promise<AIProvider | null> {
    const provider = new OpenAIProvider(this.config.openai?.model, this.config.openai?.apiKeyEnv);
    return (await provider.isAvailable()) ? provider : null;
  }

  private async createScriptProvider(): Promise<AIProvider | null> {
    if (!this.config.script?.path) {
      return null;
    }
    const provider = new ScriptProvider(this.config.script.path);
    return (await provider.isAvailable()) ? provider : null;
  }

  /**
   * Get the active provider (primary or fallback)
   */
  async getProvider(): Promise<AIProvider> {
    await this.initialize();

    if (this.primaryProvider) {
      return this.primaryProvider;
    }

    if (this.fallbackProvider) {
      return this.fallbackProvider;
    }

    // Return fallback provider for basic generation
    return new FallbackProvider();
  }

  /**
   * Execute a generation with fallback support
   */
  private async executeWithFallback(
    operation: (provider: AIProvider) => Promise<AIGenerationResult>
  ): Promise<AIGenerationResult> {
    await this.initialize();

    // Try primary provider
    if (this.primaryProvider) {
      const result = await operation(this.primaryProvider);
      if (result.success) {
        return result;
      }

      // Try fallback if available
      if (this.fallbackProvider) {
        const fallbackResult = await operation(this.fallbackProvider);
        if (fallbackResult.success) {
          return fallbackResult;
        }
      }

      return result; // Return primary error
    }

    // Try fallback provider
    if (this.fallbackProvider) {
      return operation(this.fallbackProvider);
    }

    // Use basic fallback
    const fallback = new FallbackProvider();
    return operation(fallback);
  }

  /**
   * Check if AI generation is enabled for a feature
   */
  isEnabled(
    feature: 'branchName' | 'prTitle' | 'prDescription' | 'commitMessage' | 'planDocument'
  ): boolean {
    return this.config[feature] ?? false;
  }

  /**
   * Get the current configuration
   */
  getConfig(): AIConfig {
    return { ...this.config };
  }

  /**
   * Get information about available providers
   */
  async getAvailableProviders(): Promise<string[]> {
    const available: string[] = [];

    const providers: Array<[string, () => Promise<AIProvider | null>]> = [
      ['claude', () => this.createClaudeProvider()],
      ['gemini', () => this.createGeminiProvider()],
      ['ollama', () => this.createOllamaProvider()],
      ['openai', () => this.createOpenAIProvider()],
    ];

    for (const [name, create] of providers) {
      const provider = await create();
      if (provider) {
        available.push(name);
      }
    }

    return available;
  }

  /**
   * Get the name of the active provider
   */
  async getActiveProviderName(): Promise<string> {
    await this.initialize();
    if (this.primaryProvider) {
      return this.primaryProvider.name;
    }
    if (this.fallbackProvider) {
      return this.fallbackProvider.name;
    }
    return 'fallback';
  }

  /**
   * Generate a branch name
   */
  async generateBranchName(
    context: import('./types.js').BranchContext
  ): Promise<AIGenerationResult> {
    return this.executeWithFallback((provider) => provider.generateBranchName(context));
  }

  /**
   * Generate a PR title
   */
  async generatePRTitle(context: import('./types.js').PRContext): Promise<AIGenerationResult> {
    return this.executeWithFallback((provider) => provider.generatePRTitle(context));
  }

  /**
   * Generate a PR description
   */
  async generatePRDescription(
    context: import('./types.js').PRContext
  ): Promise<AIGenerationResult> {
    return this.executeWithFallback((provider) => provider.generatePRDescription(context));
  }

  /**
   * Generate a commit message
   */
  async generateCommitMessage(
    context: import('./types.js').CommitContext
  ): Promise<AIGenerationResult> {
    return this.executeWithFallback((provider) => provider.generateCommitMessage(context));
  }

  /**
   * Generate a plan document
   */
  async generatePlanDocument(
    context: import('./types.js').PlanContext
  ): Promise<AIGenerationResult> {
    return this.executeWithFallback((provider) => provider.generatePlanDocument(context));
  }
}

/**
 * Create a provider manager with configuration
 */
export function createAIProviderManager(config?: AIConfig): AIProviderManager {
  return new AIProviderManager({ config });
}

/**
 * Default singleton instance
 */
let defaultManager: AIProviderManager | null = null;

/**
 * Get or create the default provider manager
 */
export function getDefaultAIProviderManager(config?: AIConfig): AIProviderManager {
  if (!defaultManager || config) {
    defaultManager = createAIProviderManager(config);
  }
  return defaultManager;
}
