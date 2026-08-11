/**
 * Environment-variable configuration overrides.
 *
 * Parses and validates GWT_AI_* in exactly one place. An invalid value always
 * throws ConfigurationError naming the offending variable (surfaced as
 * INVALID_CONFIG) — never a silent fallback to the default, unlike
 * GWT_LOG_LEVEL, which is the anti-pattern this deliberately avoids.
 */
import { ConfigurationError } from './errors.js';
import type { AIProviderName } from './ai/types.js';
import type { ResolvedConfig } from './config.js';

const VALID_PROVIDER_NAMES: AIProviderName[] = [
  'auto',
  'claude',
  'gemini',
  'gemini-api',
  'openai',
  'ollama',
  'script',
  'fallback',
  'none',
];

// 'auto'/'fallback'/'none' are meta-values — meaningless as one entry among
// several to try in priority order.
// Explicitly typed as AIProviderName[] (not inferred) so TS 5.5+'s automatic
// type-predicate inference doesn't narrow this to a literal union that
// rejects a same-typed `entry as AIProviderName` at the .includes() call
// below.
const VALID_PRIORITY_PROVIDER_NAMES: AIProviderName[] = VALID_PROVIDER_NAMES.filter(
  (p) => p !== 'auto' && p !== 'fallback' && p !== 'none'
);

export interface EnvConfigOverrides {
  aiProvider?: AIProviderName;
  aiProviderPriority?: AIProviderName[];
  aiTimeout?: number;
  noAi?: boolean;
}

function invalid(varName: string, value: string, reason: string): never {
  throw new ConfigurationError(`Invalid ${varName}: "${value}" — ${reason}`, { field: varName });
}

export function readEnvOverrides(env: NodeJS.ProcessEnv = process.env): EnvConfigOverrides {
  const overrides: EnvConfigOverrides = {};

  if (env.GWT_AI_PROVIDER !== undefined) {
    const value = env.GWT_AI_PROVIDER;
    if (!VALID_PROVIDER_NAMES.includes(value as AIProviderName)) {
      invalid('GWT_AI_PROVIDER', value, `must be one of: ${VALID_PROVIDER_NAMES.join(', ')}`);
    }
    overrides.aiProvider = value as AIProviderName;
  }

  if (env.GWT_AI_PRIORITY !== undefined) {
    const entries = env.GWT_AI_PRIORITY.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length === 0) {
      invalid('GWT_AI_PRIORITY', env.GWT_AI_PRIORITY, 'must list at least one provider');
    }
    for (const entry of entries) {
      if (!VALID_PRIORITY_PROVIDER_NAMES.includes(entry as AIProviderName)) {
        invalid(
          'GWT_AI_PRIORITY',
          env.GWT_AI_PRIORITY,
          `contains "${entry}"; must be one of: ${VALID_PRIORITY_PROVIDER_NAMES.join(', ')}`
        );
      }
    }
    overrides.aiProviderPriority = entries as AIProviderName[];
  }

  if (env.GWT_NO_AI !== undefined) {
    const value = env.GWT_NO_AI.toLowerCase();
    if (!['1', 'true', '0', 'false'].includes(value)) {
      invalid('GWT_NO_AI', env.GWT_NO_AI, 'must be one of: 1, true, 0, false');
    }
    overrides.noAi = value === '1' || value === 'true';
  }

  if (env.GWT_AI_TIMEOUT !== undefined) {
    const parsed = Number(env.GWT_AI_TIMEOUT);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      invalid('GWT_AI_TIMEOUT', env.GWT_AI_TIMEOUT, 'must be a positive integer (milliseconds)');
    }
    overrides.aiTimeout = parsed;
  }

  return overrides;
}

/**
 * Apply env overrides onto a resolved config. Env beats every file tier but is
 * beaten by CLI flags (applied one tier higher at the call site).
 *
 * GWT_NO_AI wins over GWT_AI_PROVIDER — mirroring --skip-ai beating
 * --force-ai: "disable" is a stronger signal than "prefer this provider".
 */
export function applyEnvOverrides(
  config: ResolvedConfig,
  overrides: EnvConfigOverrides
): ResolvedConfig {
  if (Object.keys(overrides).length === 0) return config;

  return {
    ...config,
    ai: {
      ...config.ai,
      ...(overrides.aiProvider ? { provider: overrides.aiProvider } : {}),
      ...(overrides.aiProviderPriority ? { providerPriority: overrides.aiProviderPriority } : {}),
      ...(overrides.aiTimeout !== undefined ? { timeout: overrides.aiTimeout } : {}),
      ...(overrides.noAi ? { provider: 'none' as const } : {}),
    },
  };
}

/**
 * Maps each *actually-set* env var to the config key path it affects, for
 * provenance reporting. Order matters: GWT_NO_AI is checked after
 * GWT_AI_PROVIDER so it wins 'ai.provider' when both are set, matching
 * applyEnvOverrides.
 */
export function envOverrideSourceMap(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const map: Record<string, string> = {};
  if (env.GWT_AI_PROVIDER !== undefined) map['ai.provider'] = 'GWT_AI_PROVIDER';
  if (env.GWT_NO_AI !== undefined) map['ai.provider'] = 'GWT_NO_AI';
  if (env.GWT_AI_PRIORITY !== undefined) map['ai.providerPriority'] = 'GWT_AI_PRIORITY';
  if (env.GWT_AI_TIMEOUT !== undefined) map['ai.timeout'] = 'GWT_AI_TIMEOUT';
  return map;
}
