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
 * Lazy provider factory that delays creation until availability is confirmed
 * This avoids creating provider instances that won't be used.
 */
interface LazyProviderFactory {
  name: string;
  checkAvailability: () => Promise<boolean>;
  create: () => AIProvider;
}

/**
 * AI Provider Manager
 *
 * Manages provider selection and provides a unified interface for AI generation.
 * Uses lazy initialization to avoid creating provider instances that won't be used.
 */
export class AIProviderManager {
  private config: AIConfig;
  private primaryProvider: AIProvider | null = null;
  private fallbackProvider: AIProvider | null = null;
  private initialized = false;
  /** Cache of availability check results to avoid re-checking */
  private availabilityCache: Map<string, boolean> = new Map();

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
   * Get lazy provider factories for auto-detection
   * These check availability before creating full provider instances.
   */
  private getLazyProviderFactories(): LazyProviderFactory[] {
    return [
      {
        name: 'claude',
        checkAvailability: () => ClaudeProvider.checkAvailability(),
        create: () => new ClaudeProvider(this.config.claude?.model),
      },
      {
        name: 'gemini',
        checkAvailability: () => GeminiProvider.checkAvailability(),
        create: () => new GeminiProvider(this.config.gemini?.model),
      },
      {
        name: 'ollama',
        checkAvailability: () => OllamaProvider.checkAvailability(this.config.ollama?.host),
        create: () => new OllamaProvider(this.config.ollama?.model, this.config.ollama?.host),
      },
      {
        name: 'openai',
        checkAvailability: () => OpenAIProvider.checkAvailability(),
        create: () => new OpenAIProvider(),
      },
    ];
  }

  /**
   * Check if a provider is available (with caching)
   */
  private async isProviderAvailable(factory: LazyProviderFactory): Promise<boolean> {
    // Check cache first
    if (this.availabilityCache.has(factory.name)) {
      return this.availabilityCache.get(factory.name)!;
    }

    // Check availability and cache result
    const available = await factory.checkAvailability();
    this.availabilityCache.set(factory.name, available);
    return available;
  }

  /**
   * Auto-detect available AI provider using lazy initialization
   * Only creates provider instance after confirming availability.
   */
  private async autoDetectProvider(): Promise<AIProvider | null> {
    const factories = this.getLazyProviderFactories();

    for (const factory of factories) {
      const available = await this.isProviderAvailable(factory);
      if (available) {
        // Only create the provider if it's available
        return factory.create();
      }
    }

    return null;
  }

  private async createClaudeProvider(): Promise<AIProvider | null> {
    const factory = this.getLazyProviderFactories().find((f) => f.name === 'claude')!;
    return (await this.isProviderAvailable(factory)) ? factory.create() : null;
  }

  private async createGeminiProvider(): Promise<AIProvider | null> {
    const factory = this.getLazyProviderFactories().find((f) => f.name === 'gemini')!;
    return (await this.isProviderAvailable(factory)) ? factory.create() : null;
  }

  private async createOllamaProvider(): Promise<AIProvider | null> {
    const factory = this.getLazyProviderFactories().find((f) => f.name === 'ollama')!;
    return (await this.isProviderAvailable(factory)) ? factory.create() : null;
  }

  private async createOpenAIProvider(): Promise<AIProvider | null> {
    const factory = this.getLazyProviderFactories().find((f) => f.name === 'openai')!;
    return (await this.isProviderAvailable(factory)) ? factory.create() : null;
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
   * Uses cached availability checks to avoid redundant provider creation.
   */
  async getAvailableProviders(): Promise<string[]> {
    const available: string[] = [];
    const factories = this.getLazyProviderFactories();

    for (const factory of factories) {
      if (await this.isProviderAvailable(factory)) {
        available.push(factory.name);
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
