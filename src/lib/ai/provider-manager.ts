/**
 * AI Provider Manager
 *
 * Handles provider selection, auto-detection, and fallback logic.
 */

import type { AIProvider, AIConfig, AIProviderName, AIGenerationResult } from './types.js';
import { DEFAULT_AI_CONFIG, DEFAULT_AI_PROVIDER_PRIORITY } from './types.js';
import { resolveProviderModel, resolveProviderTimeout } from './config-resolvers.js';
import { FallbackProvider } from './fallback-provider.js';
import {
  ClaudeProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  ScriptProvider,
} from './cli-provider.js';
import { GeminiAPIProvider } from './gemini-api-provider.js';

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
  /**
   * Every AVAILABLE provider in `auto` priority order. In explicit-provider
   * mode this holds just the resolved primary (or is empty).
   */
  private autoChain: AIProvider[] = [];

  constructor(options: ProviderManagerOptions = {}) {
    this.config = { ...DEFAULT_AI_CONFIG, ...options.config };
  }

  /**
   * Factories in the order `auto` should try them: config override, else the
   * subscription-first default (`DEFAULT_AI_PROVIDER_PRIORITY`).
   */
  private orderedFactoriesForAuto(): LazyProviderFactory[] {
    const priority = this.config.providerPriority ?? DEFAULT_AI_PROVIDER_PRIORITY;
    const byName = new Map(this.getLazyProviderFactories().map((f) => [f.name, f]));
    return priority
      .map((name) => byName.get(name))
      .filter((f): f is LazyProviderFactory => Boolean(f));
  }

  /** Every AVAILABLE provider in priority order. Lazy: nothing unavailable is constructed. */
  private async buildAutoChain(): Promise<AIProvider[]> {
    const chain: AIProvider[] = [];
    for (const factory of this.orderedFactoriesForAuto()) {
      if (await this.isProviderAvailable(factory)) {
        chain.push(factory.create());
      }
    }
    return chain;
  }

  /**
   * Initialize providers based on configuration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if ((this.config.provider ?? 'auto') === 'auto') {
      this.autoChain = await this.buildAutoChain();
      this.primaryProvider = this.autoChain[0] ?? null;
    } else {
      this.primaryProvider = await this.resolveProvider(this.config.provider ?? 'auto');
      this.autoChain = this.primaryProvider ? [this.primaryProvider] : [];
    }

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

      case 'gemini-api':
        return this.createGeminiAPIProvider();

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
        name: 'gemini-api',
        checkAvailability: () => GeminiAPIProvider.checkAvailability(),
        create: () =>
          new GeminiAPIProvider(
            resolveProviderModel(this.config, 'gemini-api'),
            resolveProviderTimeout(this.config, 'gemini-api')
          ),
      },
      {
        name: 'claude',
        checkAvailability: () => ClaudeProvider.checkAvailability(),
        create: () =>
          new ClaudeProvider(
            resolveProviderModel(this.config, 'claude'),
            resolveProviderTimeout(this.config, 'claude')
          ),
      },
      {
        name: 'gemini',
        checkAvailability: () => GeminiProvider.checkAvailability(),
        create: () =>
          new GeminiProvider(
            resolveProviderModel(this.config, 'gemini'),
            resolveProviderTimeout(this.config, 'gemini')
          ),
      },
      {
        name: 'ollama',
        checkAvailability: () => OllamaProvider.checkAvailability(this.config.ollama?.host),
        create: () =>
          new OllamaProvider(
            resolveProviderModel(this.config, 'ollama') ?? this.config.ollama?.model,
            this.config.ollama?.host,
            resolveProviderTimeout(this.config, 'ollama', 120_000)
          ),
      },
      {
        name: 'openai',
        checkAvailability: () => OpenAIProvider.checkAvailability(),
        create: () =>
          new OpenAIProvider(
            resolveProviderModel(this.config, 'openai'),
            resolveProviderTimeout(this.config, 'openai')
          ),
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

  private async createGeminiAPIProvider(): Promise<AIProvider | null> {
    const factory = this.getLazyProviderFactories().find((f) => f.name === 'gemini-api')!;
    return (await this.isProviderAvailable(factory)) ? factory.create() : null;
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

    // Walk every available candidate in priority order. In `auto` this is the
    // whole chain; in explicit-provider mode it is the single configured
    // primary. A `success:false` result therefore always advances to the next
    // real candidate instead of being mistaken for "no more options" — which
    // is what let an invalid GEMINI_API_KEY win selection and then fail
    // silently.
    let lastResult: AIGenerationResult | null = null;
    for (const provider of this.autoChain) {
      const result = await operation(provider);
      if (result.success) return result;
      lastResult = result;
    }

    // Explicit ai.fallback is tried once after the chain, preserving
    // pre-existing behaviour for non-auto configurations exactly.
    if (this.fallbackProvider && !this.autoChain.includes(this.fallbackProvider)) {
      const fallbackResult = await operation(this.fallbackProvider);
      if (fallbackResult.success) return fallbackResult;
      lastResult = fallbackResult;
    }

    if (lastResult) return lastResult;

    return operation(new FallbackProvider());
  }

  /**
   * What `auto` would pick right now, plus the priority order behind it.
   * Used by `wt ai doctor` so its explanation cannot drift from the real
   * selection logic.
   */
  async getAutoSelectionPreview(): Promise<{ priority: string[]; selected: string | null }> {
    await this.initialize();
    return {
      priority: this.orderedFactoriesForAuto().map((f) => f.name),
      selected: this.autoChain[0]?.name ?? null,
    };
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
