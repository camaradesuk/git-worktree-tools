/**
 * AI Content Generation Module
 *
 * Provides AI-powered generation for:
 * - Branch names
 * - PR titles and descriptions
 * - Commit messages
 * - Plan documents
 *
 * Supports multiple providers: Claude, Gemini, OpenAI, Ollama, custom scripts.
 */

// Types
export type {
  AIProvider,
  AIConfig,
  AIProviderName,
  AIGenerationResult,
  BranchContext,
  PRContext,
  CommitContext,
  PlanContext,
  CommitInfo,
  RepoDocumentationContext,
} from './types.js';

export { DEFAULT_AI_CONFIG } from './types.js';

// Repository documentation
export {
  gatherRepoDocumentation,
  formatDocsForPrompt,
  hasDocumentation,
  type RepoDocumentation,
} from './repo-docs.js';

// Base provider utilities
export {
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

// Provider implementations
export { FallbackProvider } from './fallback-provider.js';
export {
  ClaudeProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  ScriptProvider,
} from './cli-provider.js';

// Provider manager
export {
  AIProviderManager,
  createAIProviderManager,
  getDefaultAIProviderManager,
  type ProviderManagerOptions,
} from './provider-manager.js';

// Generation service
export { AIGenerationService, createAIGenerationService } from './generation-service.js';
