/**
 * Pure config-resolution helpers for AI provider model/timeout selection.
 * No I/O — unit testable directly, no mocking required.
 */
import type { AIConfig, AIProviderName } from './types.js';
import { DEFAULT_AI_TIMEOUT_MS } from './types.js';

/** Legacy nested model fields, keyed by the AIProviderName the new flat field uses. */
const LEGACY_MODEL_KEYS: Partial<
  Record<AIProviderName, 'claude' | 'gemini' | 'openai' | 'ollama'>
> = {
  claude: 'claude',
  gemini: 'gemini',
  'gemini-api': 'gemini',
  openai: 'openai',
  ollama: 'ollama',
};

/**
 * Resolve the effective model: `ai.models.<name>` wins, then the legacy
 * nested `ai.<name>.model`, then undefined (let the provider default apply).
 */
export function resolveProviderModel(
  config: AIConfig,
  provider: AIProviderName
): string | undefined {
  const fromModels = config.models?.[provider];
  if (fromModels) return fromModels;

  const legacyKey = LEGACY_MODEL_KEYS[provider];
  if (legacyKey) return config[legacyKey]?.model;

  return undefined;
}

/**
 * Resolve the effective timeout (ms): `ai.providers.<name>.timeout` wins,
 * then `ai.timeout`, then the caller's provider-specific `fallback`.
 */
export function resolveProviderTimeout(
  config: AIConfig,
  provider: AIProviderName,
  fallback: number = DEFAULT_AI_TIMEOUT_MS
): number {
  return config.providers?.[provider]?.timeout ?? config.timeout ?? fallback;
}
