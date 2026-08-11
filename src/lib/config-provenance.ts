/**
 * Per-key provenance for resolved configuration values.
 *
 * Answers "which tier set this, and where" for a single config key. This is
 * what makes a hybrid result self-explaining instead of a mystery neither
 * file alone accounts for (e.g. global sets worktreeParent while the repo
 * config overrides only worktreePattern).
 */
import type { LoadedConfigSource } from './config.js';

export type ProvenanceTier = 'flag' | 'env' | 'local' | 'repo' | 'global' | 'default';

export interface ProvenanceEntry {
  value: unknown;
  tier: ProvenanceTier;
  /** File path, env var name, flag name, or null for 'default'. */
  source: string | null;
}

function getAtPath(obj: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Resolve provenance for one dotted key path. Checks tiers highest-first:
 * flag > env > local > repo > global > default. Walks each source's RAW
 * (unresolved) config, not the merged result — otherwise an object key like
 * `ai` would make every sub-key look like it came from whichever tier last
 * touched any part of `ai`.
 */
export function resolveKeyProvenance(
  keyPath: string,
  resolvedValue: unknown,
  sources: LoadedConfigSource[],
  flagOverrides: Record<string, string> = {},
  envOverrides: Record<string, string> = {}
): ProvenanceEntry {
  if (keyPath in flagOverrides) {
    return { value: resolvedValue, tier: 'flag', source: flagOverrides[keyPath] };
  }
  if (keyPath in envOverrides) {
    return { value: resolvedValue, tier: 'env', source: envOverrides[keyPath] };
  }
  // sources is ordered global -> repo -> local; walk highest priority first.
  for (let i = sources.length - 1; i >= 0; i--) {
    const src = sources[i];
    if (getAtPath(src.config, keyPath) !== undefined) {
      return { value: resolvedValue, tier: src.level, source: src.path };
    }
  }
  return { value: resolvedValue, tier: 'default', source: null };
}

/** Resolve provenance for several key paths against one resolved config. */
export function resolveConfigProvenance(
  keyPaths: string[],
  resolvedConfig: Record<string, unknown>,
  sources: LoadedConfigSource[],
  flagOverrides: Record<string, string> = {},
  envOverrides: Record<string, string> = {}
): Record<string, ProvenanceEntry> {
  const result: Record<string, ProvenanceEntry> = {};
  for (const keyPath of keyPaths) {
    result[keyPath] = resolveKeyProvenance(
      keyPath,
      getAtPath(resolvedConfig, keyPath),
      sources,
      flagOverrides,
      envOverrides
    );
  }
  return result;
}
