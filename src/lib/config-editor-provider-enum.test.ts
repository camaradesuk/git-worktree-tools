/**
 * Drift guard: config-editor.ts's `ai.provider` / `ai.fallback` enum
 * pickers vs. config-validation.ts's VALID_AI_PROVIDERS allow-list.
 *
 * config-editor.ts is a closed-enum picker with no freeform input, so a
 * provider that's valid everywhere else (schema, config-validation.ts,
 * wtconfig/config-manager.ts) is genuinely unreachable through
 * `wt config edit` if it's missing here — exactly what happened to
 * gemini-api. schema-coverage.test.ts only inspects the JSON schema file
 * and structurally cannot catch this drift, so this file exists
 * specifically to.
 *
 * Deliberately does NOT import config-editor.test.ts's mocked
 * './config-validation.js' — this file imports both modules for real so it
 * sees their actual exported data, not a test double.
 */
import { describe, it, expect } from 'vitest';
import { CONFIG_CATEGORIES } from './config-editor.js';
import { VALID_AI_PROVIDERS } from './config-validation.js';

// 'fallback' is an internal/resolved provider name (the composite
// primary+fallback wrapper — see src/lib/ai/fallback-provider.ts), not a
// value a user should pick from the ai.provider/ai.fallback editor. It's
// intentionally absent from the picker and from README's documented
// provider list, so it's excluded from the expected set here too.
const USER_SELECTABLE_PROVIDERS = VALID_AI_PROVIDERS.filter((p) => p !== 'fallback');

function findEnumValues(key: 'ai.provider' | 'ai.fallback'): string[] | undefined {
  for (const category of CONFIG_CATEGORIES) {
    const property = category.properties.find((p) => p.key === key);
    if (property) return property.enumValues;
  }
  return undefined;
}

describe('config-editor provider enum drift guard', () => {
  it('ai.provider enum matches VALID_AI_PROVIDERS (minus the internal "fallback" meta-value)', () => {
    expect(findEnumValues('ai.provider')).toEqual(USER_SELECTABLE_PROVIDERS);
  });

  it('ai.fallback enum matches VALID_AI_PROVIDERS (minus the internal "fallback" meta-value)', () => {
    expect(findEnumValues('ai.fallback')).toEqual(USER_SELECTABLE_PROVIDERS);
  });

  it('gemini-api is selectable in both pickers (regression guard)', () => {
    expect(findEnumValues('ai.provider')).toContain('gemini-api');
    expect(findEnumValues('ai.fallback')).toContain('gemini-api');
  });
});
