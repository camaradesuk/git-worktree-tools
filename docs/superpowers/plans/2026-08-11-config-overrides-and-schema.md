# Config Override Chain, Schema, and Provenance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the override chain (`CLI flag > env var > .worktreerc.local > .worktreerc > global config.json > built-in default`) real and uniform, close schema/validator drift that **already exists** in the repo, and make `wt config show --json` explain _why_ each value resolved as it did — per key, not per file.

## Correction to the design spec

Spec §1.4 claims `schemas/worktreerc.schema.json` "has **no `ai` section** — zero properties." **That is wrong.** `properties.ai` is a `$ref` to `#/definitions/AIConfig`, which has **18 properties**; `HooksConfig` has **13**. The original check inspected `properties.ai.properties` without following the `$ref`. Verified in this worktree:

```
properties.ai = {"$ref": "#/definitions/AIConfig"}
definitions.AIConfig property count: 18
definitions.HooksConfig property count: 13
```

So the schema task is **much smaller** than the spec describes: fix real drift, add a drift-guard test, and defer Part 2/3 keys to the end.

## Real drift found (verified, not in the spec)

1. **`gemini-api` is missing from the provider allow-lists** in four places, though it is a real, shipped provider (`AIProviderName` in `src/lib/ai/types.ts:214`, implemented by `GeminiAPIProvider`). Verified: `VALID_AI_PROVIDERS` (`config-validation.ts:28-37`) and the schema enum both omit it — so `ai.provider: "gemini-api"` is **rejected as invalid config today**.
2. **`ai.planPath` / `ai.planPathMode`** are typed in `AIConfig` and present in the schema, but absent from `validateAIConfig`'s `knownKeys` (`config-validation.ts:244-261`) — so they fail with "Unknown ai property".
3. **`global.warnNotGlobal`'s schema default is `false`**, contradicting the runtime default of `true` (`getDefaultConfig()`), and its own doc comment.

## Architecture

`src/lib/config-env.ts` (new) owns parsing/validating the four `GWT_AI_*` env vars in one place and applies them as a merge tier inside `loadConfigWithValidation`, so every `loadConfig` caller gets env support with no per-call-site wiring. CLI flags (`--ai-provider`, `--ai-timeout`) are `wt new`-specific and applied one tier higher at a single `loadConfigForRun` chokepoint in `src/cli/newpr.ts`. `src/lib/config-provenance.ts` (new) answers "which tier set this key" by walking `LoadedConfigSource[]` highest-priority-first.

## Global Constraints

- ESM: relative imports end in `.js`. Node ≥ 18. **No new runtime dependencies.**
- Use **`pnpm`, never `npm`** (lockfile pins prettier 3.8.1; npm resolves a version that reformats and reddens CI).
- Commit normally — **no `--no-verify`**. `pnpm exec prettier --write` on touched files first.
- **`pnpm run build` before any e2e test.**
- **Known-failing baseline: 14 tests / 4 files** (`config.test.ts` 4, `prs/actions.test.ts` 1, `newpr-full-flow.e2e` 6, `newpr/scenarios.e2e` 3). **Verified root cause for all 14** (not just the 4): the suite is not hermetic — `loadGlobalConfig()` reads the real `~/.config/git-worktree-tools/config.json`, and e2e subprocesses inherit it via `process.env` spreading. The failure diffs show this machine's real `worktreeParent: ".worktrees"`, `worktreePattern: "pr{number}.{slug}"`, `ai.provider: "claude"` verbatim. **Task 2 fixes this and is expected to bring the count to 0, not 10** — if you see a different number, report the actual number; do not assume.
- **Two disconnected config-resolution systems exist.** `wt config show/get/set/validate` resolve via `src/lib/wtconfig/config-manager.ts` (global path `~/.worktreerc`, **no local tier**), while `src/lib/config.ts`'s `loadConfigWithValidation` (used by `newpr`, AI, `generateWorktreePath`) uses `~/.config/git-worktree-tools/config.json` with all three tiers. Task 7 switches **`wt config show --json` only** to the correct system — provenance wired to the wrong one would be a lie. Do **not** refactor the other subcommands here; that's a separate, larger change.
- **The JSON schema is never loaded at runtime** (no `ajv`, no JSON import of it in `src/`). `wt config validate` validates purely via the hand-written `config-validation.ts`. The schema is editor/doc tooling, so nothing catches drift except the guard test in Task 1.
- **Dependency boundary:** Tasks 1–8 have **zero dependency** on Parts 2/3 and must not wait for them. Tasks 9–10 are **isolated** — they document Part 2's (`ai.providerPriority`, `ai.models.*`, `ai.timeout`) and Part 3's (`worktreeParentAnchor`) keys, and can be done last or dropped. Task 3 does add `providerPriority`/`timeout` as bare `AIConfig` fields (the env vars need somewhere to write), which is plumbing, not the schema/doc coverage. Expect a trivial merge overlap with Part 2 on `src/lib/ai/types.ts` — both add the same two optional fields with the same types; take either side.
- Coverage thresholds 80% over `src/lib/**` and `src/cli/**`. Never exclude a file to pass a check.

## File Structure

| File                                      | Responsibility                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/config-env.ts`                   | **Create.** Parse/validate the four `GWT_AI_*` vars; apply as a merge tier.                                              |
| `src/lib/config-env.test.ts`              | **Create.**                                                                                                              |
| `src/lib/config-provenance.ts`            | **Create.** Per-key "which tier set this" over `LoadedConfigSource[]`.                                                   |
| `src/lib/config-provenance.test.ts`       | **Create.**                                                                                                              |
| `src/lib/config.ts`                       | **Modify.** `LoadConfigOptions.env`; apply env tier in `loadConfigWithValidation`.                                       |
| `src/lib/config.test.ts`                  | **Modify.** Env-override integration tests.                                                                              |
| `src/lib/ai/types.ts`                     | **Modify.** Add `providerPriority?`, `timeout?` to `AIConfig`.                                                           |
| `src/lib/config-validation.ts`            | **Modify.** Add `gemini-api`; allow `planPath`/`planPathMode`/`providerPriority`/`timeout`; validate the two new fields. |
| `src/lib/config-validation.test.ts`       | **Modify.**                                                                                                              |
| `src/lib/wtconfig/config-manager.ts`      | **Modify.** Add `gemini-api`/`script` to its separate `validProviders`.                                                  |
| `src/lib/wtconfig/config-manager.test.ts` | **Modify.**                                                                                                              |
| `schemas/worktreerc.schema.json`          | **Modify.** Add `gemini-api` to enums; fix `warnNotGlobal` default.                                                      |
| `src/lib/schema-coverage.test.ts`         | **Create.** Drift guard: key coverage + schema-default vs `getDefaultConfig()` parity.                                   |
| `vitest.setup.ts`                         | **Create (Task 2).** Isolate `XDG_CONFIG_HOME`/`APPDATA`/`LOCALAPPDATA`.                                                 |
| `vitest.config.ts`                        | **Modify (Task 2).** Register `setupFiles`.                                                                              |
| `src/lib/test-env.test.ts`                | **Create (Task 2).** Hermeticity guard.                                                                                  |
| `src/cli/wt/new.ts`                       | **Modify.** `--ai-provider` / `--ai-timeout`.                                                                            |
| `src/lib/newpr/types.ts`                  | **Modify.** `Options.aiProvider` / `Options.aiTimeout`.                                                                  |
| `src/cli/newpr.ts`                        | **Modify.** Exported `loadConfigForRun()`; replace the 4 `loadConfig(repoRoot)` sites.                                   |
| `src/cli/newpr-config-overrides.test.ts`  | **Create.**                                                                                                              |
| `src/cli/wt/config.ts`                    | **Modify.** `handleShow`'s JSON branch → `loadConfigWithValidation` + provenance.                                        |
| `src/cli/wt/config.test.ts`               | **Modify.**                                                                                                              |
| `README.md`, `docs/AI-TOOLING.md`         | **Modify.** Override chain, env vars, provenance.                                                                        |

---

### Task 1: Fix real schema/validator drift + permanent drift-guard test

Drift that exists today, independent of this plan.

**Files:** Create `src/lib/schema-coverage.test.ts`; modify `schemas/worktreerc.schema.json`, `src/lib/config-validation.ts`(+test), `src/lib/wtconfig/config-manager.ts`(+test), `README.md`.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/schema-coverage.test.ts`:

```typescript
/**
 * Guards schemas/worktreerc.schema.json against drifting from the actual
 * implementation. The schema is never loaded at runtime (no ajv, no JSON
 * import of it in src/) — it exists for editor autocomplete and
 * `wt config schema`, so nothing catches drift except this test.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../../schemas/worktreerc.schema.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSchema(): any {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveNode(node: any, definitions: any): any {
  return node.$ref ? definitions[node.$ref.split('/').pop()] : node;
}

/** Flatten declared leaf properties into dot-paths, following $refs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenSchemaKeys(properties: any, definitions: any, prefix = ''): string[] {
  const out: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [key, rawNode] of Object.entries<any>(properties || {})) {
    const nodePath = prefix ? `${prefix}.${key}` : key;
    const node = resolveNode(rawNode, definitions);
    if (node.type === 'object' && node.properties) {
      out.push(...flattenSchemaKeys(node.properties, definitions, nodePath));
    } else {
      out.push(nodePath);
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectSchemaDefaults(
  properties: any,
  definitions: any,
  prefix = ''
): [string, unknown][] {
  const out: [string, unknown][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [key, rawNode] of Object.entries<any>(properties || {})) {
    const nodePath = prefix ? `${prefix}.${key}` : key;
    const node = resolveNode(rawNode, definitions);
    if (node.type === 'object' && node.properties) {
      out.push(...collectSchemaDefaults(node.properties, definitions, nodePath));
    } else if ('default' in node) {
      out.push([nodePath, node.default]);
    }
  }
  return out;
}

function getAtPath(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

describe('schema coverage (schemas/worktreerc.schema.json)', () => {
  const schema = loadSchema();
  const schemaKeys = flattenSchemaKeys(schema.properties, schema.definitions);

  it('declares gemini-api as a valid ai.provider and ai.fallback value', () => {
    expect(schema.definitions.AIConfig.properties.provider.enum).toContain('gemini-api');
    expect(schema.definitions.AIConfig.properties.fallback.enum).toContain('gemini-api');
  });

  // Keep in sync with WorktreeConfig / AIConfig / HooksConfig.
  const DOCUMENTED_KEYS = [
    'configVersion',
    'sharedRepos',
    'baseBranch',
    'draftPr',
    'worktreePattern',
    'worktreeParent',
    'syncPatterns',
    'branchPrefix',
    'previewLabel',
    'preferredEditor',
    'linkConfigFiles',
    'ai.provider',
    'ai.fallback',
    'ai.branchName',
    'ai.prTitle',
    'ai.prDescription',
    'ai.commitMessage',
    'ai.planDocument',
    'ai.branchStyle',
    'ai.commitStyle',
    'ai.prTemplate',
    'ai.planTemplate',
    'ai.planPath',
    'ai.planPathMode',
    'ai.claude.model',
    'ai.gemini.model',
    'ai.openai.model',
    'ai.ollama.model',
    'ai.ollama.host',
    'ai.script.path',
    'hooks.pre-analyze',
    'hooks.post-analyze',
    'hooks.pre-branch',
    'hooks.post-branch',
    'hooks.pre-commit',
    'hooks.post-commit',
    'hooks.pre-push',
    'hooks.post-push',
    'hooks.pre-pr',
    'hooks.post-pr',
    'hooks.pre-worktree',
    'hooks.post-worktree',
    'hooks.cleanup',
    'hookDefaults.timeout',
    'hookDefaults.maxTimeout',
    'plugins',
    'generators.branchName',
    'generators.prTitle',
    'generators.prDescription',
    'generators.commitMessage',
    'integrations.linear.teamId',
    'integrations.linear.apiKeyEnv',
    'integrations.jira.projectKey',
    'integrations.jira.baseUrl',
    'integrations.jira.apiTokenEnv',
    'integrations.slack.webhookUrl',
    'integrations.slack.channel',
    'logging.level',
    'logging.logFile',
    'logging.timestamps',
    'global.warnNotGlobal',
    'global.logging.level',
    'global.logging.logFile',
    'global.logging.timestamps',
    'wtlink.enabled',
    'wtlink.disabled',
  ];

  it.each(DOCUMENTED_KEYS)('schema documents %s', (key) => {
    expect(schemaKeys).toContain(key);
  });

  it('every schema leaf default matches the runtime default in getDefaultConfig()', () => {
    const defaults = getDefaultConfig();
    const mismatches: string[] = [];
    for (const [key, schemaDefault] of collectSchemaDefaults(
      schema.properties,
      schema.definitions
    )) {
      const actual = getAtPath(defaults, key);
      if (actual !== undefined && JSON.stringify(actual) !== JSON.stringify(schemaDefault)) {
        mismatches.push(
          `${key}: schema says ${JSON.stringify(schemaDefault)}, runtime default is ${JSON.stringify(actual)}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
```

Add to `src/lib/config-validation.test.ts`:

```typescript
describe('ai provider/key allow-list (drift regression)', () => {
  it('accepts gemini-api as ai.provider', () => {
    expect(validateConfig({ ai: { provider: 'gemini-api' } }).valid).toBe(true);
  });

  it('accepts gemini-api as ai.fallback', () => {
    expect(validateConfig({ ai: { provider: 'auto', fallback: 'gemini-api' } }).valid).toBe(true);
  });

  it('accepts ai.planPath and ai.planPathMode (documented AIConfig fields)', () => {
    const result = validateConfig({
      ai: { planPath: 'PLAN-{prNumber}-{slug}.md', planPathMode: 'prompt' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

And to `src/lib/wtconfig/config-manager.test.ts`:

```typescript
it('accepts gemini-api and script as ai.provider', () => {
  expect(validateConfig({ ai: { provider: 'gemini-api' } }).valid).toBe(true);
  expect(validateConfig({ ai: { provider: 'script' } }).valid).toBe(true);
});
```

- [ ] **Step 2: Run and see them fail.** `pnpm exec vitest run src/lib/schema-coverage.test.ts src/lib/config-validation.test.ts src/lib/wtconfig/config-manager.test.ts`. Expect: the `gemini-api` enum test, the three `validateConfig` tests, and `global.warnNotGlobal` in the default-parity test. `DOCUMENTED_KEYS` coverage should already pass — that confirms the schema's `ai`/`hooks` sections are complete, contradicting the spec.

- [ ] **Step 3: Fix the drift.**
  - `schemas/worktreerc.schema.json`: add `"gemini-api"` to `definitions.AIConfig.properties.provider.enum` and `.fallback.enum`; change `definitions.GlobalSettings.properties.warnNotGlobal.default` from `false` to `true` (runtime default is `true` in `getDefaultConfig()`, matching its own doc comment).
  - `src/lib/config-validation.ts`: add `'gemini-api'` to `VALID_AI_PROVIDERS` (line ~28); add `'planPath'`, `'planPathMode'` to `knownKeys` in `validateAIConfig` (line ~244).
  - `src/lib/wtconfig/config-manager.ts` (~line 331) `validProviders`: add `'gemini-api'`, `'script'`.
  - `README.md`: update the providers list to include `"gemini-api"`.

- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Format and commit** — `fix: close schema/validator drift (gemini-api, planPath/planPathMode, warnNotGlobal default)`.

---

### Task 2 (Optional, recommended): Hermetic config tests

Not required for the rest of the plan. Recommended because the suite silently reads the developer's real global config — exactly the confusion this plan's provenance work exists to remove.

**Files:** Create `vitest.setup.ts`, `src/lib/test-env.test.ts`; modify `vitest.config.ts`.

- [ ] **Step 1: Failing test** — `src/lib/test-env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { getGlobalConfigDir } from './constants.js';

describe('test environment hermeticity', () => {
  it('resolves the global config dir under an isolated tmp dir, never the real home', () => {
    const dir = getGlobalConfigDir();
    expect(dir).not.toBe(path.join(os.homedir(), '.config', 'git-worktree-tools'));
    expect(dir.startsWith(os.tmpdir())).toBe(true);
  });
});
```

- [ ] **Step 2: Run and see it fail** on a machine with a real global config.

- [ ] **Step 3: Implement.** Create `vitest.setup.ts`:

```typescript
/**
 * Isolates every test run from the developer's real global config, so
 * loadGlobalConfig() never reads ~/.config/git-worktree-tools/config.json.
 * e2e tests spawn the CLI with `...process.env` spread in, so overriding
 * here covers unit AND e2e subprocess env — no changes needed in src/e2e.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const isolatedConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwt-test-config-'));
process.env.XDG_CONFIG_HOME = isolatedConfigDir;
process.env.APPDATA = isolatedConfigDir; // Windows config path
process.env.LOCALAPPDATA = isolatedConfigDir; // Windows log/data path
process.env.GWT_ALLOW_LOCAL = process.env.GWT_ALLOW_LOCAL ?? '1';
```

Add `setupFiles: ['./vitest.setup.ts'],` to `vitest.config.ts`'s `test` block.

- [ ] **Step 4: Run and see it pass, then check the real baseline.** `pnpm run build && pnpm test`. **Expected: 0 failures, not 10.** If different, report the actual number and which tests — do not assume.
- [ ] **Step 5: Format and commit** — `test: isolate global config dir so the suite never reads the developer's real config`.

---

### Task 3: `GWT_AI_*` env parsing + `AIConfig` plumbing

**Files:** Create `src/lib/config-env.ts`(+test); modify `src/lib/ai/types.ts`, `src/lib/config-validation.ts`(+test).

- [ ] **Step 1: Failing tests** — `src/lib/config-env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readEnvOverrides, applyEnvOverrides } from './config-env.js';
import { getDefaultConfig } from './config.js';

describe('readEnvOverrides', () => {
  it('returns {} when no GWT_AI_* vars are set', () => {
    expect(readEnvOverrides({})).toEqual({});
  });

  it('parses GWT_AI_PROVIDER', () => {
    expect(readEnvOverrides({ GWT_AI_PROVIDER: 'claude' })).toEqual({ aiProvider: 'claude' });
  });

  it('rejects an invalid GWT_AI_PROVIDER', () => {
    expect(() => readEnvOverrides({ GWT_AI_PROVIDER: 'bogus' })).toThrow('GWT_AI_PROVIDER');
  });

  it('parses GWT_AI_PRIORITY as a trimmed comma-separated list', () => {
    expect(readEnvOverrides({ GWT_AI_PRIORITY: ' openai, claude ,ollama ' })).toEqual({
      aiProviderPriority: ['openai', 'claude', 'ollama'],
    });
  });

  it('rejects an unknown provider inside GWT_AI_PRIORITY', () => {
    expect(() => readEnvOverrides({ GWT_AI_PRIORITY: 'openai,bogus' })).toThrow('GWT_AI_PRIORITY');
  });

  it('rejects "auto" inside GWT_AI_PRIORITY (a meta-value, not a concrete provider)', () => {
    expect(() => readEnvOverrides({ GWT_AI_PRIORITY: 'auto,claude' })).toThrow('GWT_AI_PRIORITY');
  });

  it('parses GWT_NO_AI truthy and falsy values', () => {
    expect(readEnvOverrides({ GWT_NO_AI: '1' })).toEqual({ noAi: true });
    expect(readEnvOverrides({ GWT_NO_AI: 'true' })).toEqual({ noAi: true });
    expect(readEnvOverrides({ GWT_NO_AI: '0' })).toEqual({ noAi: false });
  });

  it('rejects a non-boolean-ish GWT_NO_AI', () => {
    expect(() => readEnvOverrides({ GWT_NO_AI: 'yes' })).toThrow('GWT_NO_AI');
  });

  it('parses GWT_AI_TIMEOUT as a positive integer', () => {
    expect(readEnvOverrides({ GWT_AI_TIMEOUT: '5000' })).toEqual({ aiTimeout: 5000 });
  });

  it('rejects non-integer, zero, or negative GWT_AI_TIMEOUT', () => {
    expect(() => readEnvOverrides({ GWT_AI_TIMEOUT: '5000.5' })).toThrow('GWT_AI_TIMEOUT');
    expect(() => readEnvOverrides({ GWT_AI_TIMEOUT: '0' })).toThrow('GWT_AI_TIMEOUT');
    expect(() => readEnvOverrides({ GWT_AI_TIMEOUT: '-5' })).toThrow('GWT_AI_TIMEOUT');
  });
});

describe('applyEnvOverrides', () => {
  it('is a no-op when there are no overrides', () => {
    const config = getDefaultConfig();
    expect(applyEnvOverrides(config, {})).toBe(config);
  });

  it('applies aiProvider onto config.ai.provider', () => {
    expect(applyEnvOverrides(getDefaultConfig(), { aiProvider: 'claude' }).ai.provider).toBe(
      'claude'
    );
  });

  it('GWT_NO_AI beats GWT_AI_PROVIDER when both are set', () => {
    const result = applyEnvOverrides(getDefaultConfig(), { aiProvider: 'claude', noAi: true });
    expect(result.ai.provider).toBe('none');
  });

  it('applies aiProviderPriority and aiTimeout', () => {
    const result = applyEnvOverrides(getDefaultConfig(), {
      aiProviderPriority: ['openai', 'claude'],
      aiTimeout: 15000,
    });
    expect(result.ai.providerPriority).toEqual(['openai', 'claude']);
    expect(result.ai.timeout).toBe(15000);
  });
});
```

- [ ] **Step 2: Run and see it fail** (module doesn't exist).

- [ ] **Step 3: Implement.** Add to `AIConfig` in `src/lib/ai/types.ts`:

```typescript
  /**
   * Ordered list of providers to try when `provider` is 'auto'.
   * Overridable via GWT_AI_PRIORITY (comma-separated), highest first.
   */
  providerPriority?: AIProviderName[];

  /** Per-generation-call timeout in ms. Overridable via GWT_AI_TIMEOUT and --ai-timeout. */
  timeout?: number;
```

Create `src/lib/config-env.ts`:

```typescript
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
const VALID_PRIORITY_PROVIDER_NAMES = VALID_PROVIDER_NAMES.filter(
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
```

In `config-validation.ts`: add `'providerPriority'`, `'timeout'` to `knownKeys`, and after the `ollama`/`script` block:

```typescript
if (obj.providerPriority !== undefined) {
  const isValidList =
    Array.isArray(obj.providerPriority) &&
    obj.providerPriority.every((p) => typeof p === 'string' && VALID_AI_PROVIDERS.includes(p));
  if (!isValidList) {
    errors.push({
      path: 'ai.providerPriority',
      message: `ai.providerPriority must be an array of provider names: ${VALID_AI_PROVIDERS.join(', ')}`,
    });
  }
}

if (obj.timeout !== undefined && (typeof obj.timeout !== 'number' || obj.timeout <= 0)) {
  errors.push({
    path: 'ai.timeout',
    message: 'ai.timeout must be a positive number (milliseconds)',
  });
}
```

Add matching validation tests.

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `feat: add GWT_AI_* environment variable overrides`.

---

### Task 4: Wire env overrides into `loadConfigWithValidation`

**Files:** modify `src/lib/config.ts`, `src/lib/config.test.ts`.

- [ ] **Step 1: Failing tests** — add to `config.test.ts`, using the file's existing `mkdtempSync` pattern:

```typescript
describe('loadConfigWithValidation env overrides', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-env-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('GWT_AI_PROVIDER overrides ai.provider even when .worktreerc sets it', () => {
    fs.writeFileSync(
      path.join(tempDir, '.worktreerc'),
      JSON.stringify({ ai: { provider: 'claude' } })
    );
    const config = loadConfig(tempDir, { env: { GWT_AI_PROVIDER: 'ollama' } as NodeJS.ProcessEnv });
    expect(config.ai.provider).toBe('ollama');
  });

  it('throws naming the variable for an invalid GWT_AI_PROVIDER', () => {
    expect(() =>
      loadConfig(tempDir, { env: { GWT_AI_PROVIDER: 'bogus' } as NodeJS.ProcessEnv })
    ).toThrow(/GWT_AI_PROVIDER/);
  });

  it('GWT_AI_PRIORITY parses into ai.providerPriority', () => {
    const config = loadConfig(tempDir, {
      env: { GWT_AI_PRIORITY: 'openai,claude,ollama' } as NodeJS.ProcessEnv,
    });
    expect(config.ai.providerPriority).toEqual(['openai', 'claude', 'ollama']);
  });

  it('GWT_NO_AI forces ai.provider to none, beating GWT_AI_PROVIDER', () => {
    const config = loadConfig(tempDir, {
      env: { GWT_AI_PROVIDER: 'claude', GWT_NO_AI: '1' } as NodeJS.ProcessEnv,
    });
    expect(config.ai.provider).toBe('none');
  });

  it('GWT_AI_TIMEOUT sets ai.timeout as a number', () => {
    const config = loadConfig(tempDir, { env: { GWT_AI_TIMEOUT: '15000' } as NodeJS.ProcessEnv });
    expect(config.ai.timeout).toBe(15000);
  });

  it('throws for a non-numeric GWT_AI_TIMEOUT', () => {
    expect(() =>
      loadConfig(tempDir, { env: { GWT_AI_TIMEOUT: 'soon' } as NodeJS.ProcessEnv })
    ).toThrow(/GWT_AI_TIMEOUT/);
  });

  it('with no GWT_AI_* vars set, behaves exactly as before', () => {
    const config = loadConfig(tempDir, { env: {} as NodeJS.ProcessEnv });
    expect(config.ai.provider).toBe('none');
    expect(config.ai.providerPriority).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and see it fail** (`LoadConfigOptions` has no `env`).

- [ ] **Step 3: Implement.** Import `readEnvOverrides`/`applyEnvOverrides`. Extend `LoadConfigOptions`:

```typescript
  /** Environment to read GWT_AI_* overrides from. Defaults to process.env; override in tests. */
  env?: NodeJS.ProcessEnv;
```

In `loadConfigWithValidation`, immediately after the merge loop and before determining the primary config path:

```typescript
// Apply environment-variable overrides — beats every file tier, is beaten
// by CLI flags (applied one tier higher at the call site). Throws
// ConfigurationError (→ INVALID_CONFIG) for an invalid value; never falls
// back silently.
const envOverrides = readEnvOverrides(options.env ?? process.env);
merged = applyEnvOverrides(merged, envOverrides);
```

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `feat: apply GWT_AI_* env overrides in loadConfigWithValidation`.

---

### Task 5: `--ai-provider` / `--ai-timeout` flags on `wt new`

**Files:** modify `src/cli/wt/new.ts`, `src/lib/newpr/types.ts`, `src/cli/newpr.ts`; create `src/cli/newpr-config-overrides.test.ts`.

> **Coordination note:** Part 1 may already have added a `loadConfigForRun()` to `src/cli/newpr.ts` for `--skip-ai`. If it exists on this branch, **extend it** rather than defining a second one — add the `aiProvider`/`aiTimeout` handling to the existing function and keep its `--skip-ai` behaviour intact.

- [ ] **Step 1: Failing test** — `src/cli/newpr-config-overrides.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfigForRun } from './newpr.js';
import { getDefaultOptions } from '../lib/newpr/args.js';

describe('loadConfigForRun', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newpr-config-overrides-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses config.ai unchanged when no CLI overrides are given', () => {
    fs.writeFileSync(
      path.join(tempDir, '.worktreerc'),
      JSON.stringify({ ai: { provider: 'claude' } })
    );
    expect(loadConfigForRun(tempDir, getDefaultOptions()).ai.provider).toBe('claude');
  });

  it('applies options.aiProvider over the file-resolved provider', () => {
    fs.writeFileSync(
      path.join(tempDir, '.worktreerc'),
      JSON.stringify({ ai: { provider: 'claude' } })
    );
    const config = loadConfigForRun(tempDir, { ...getDefaultOptions(), aiProvider: 'ollama' });
    expect(config.ai.provider).toBe('ollama');
  });

  it('applies options.aiTimeout', () => {
    const config = loadConfigForRun(tempDir, { ...getDefaultOptions(), aiTimeout: 20000 });
    expect(config.ai.timeout).toBe(20000);
  });

  it('CLI flag beats an env override for the same run', () => {
    fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({}));
    process.env.GWT_AI_PROVIDER = 'gemini';
    try {
      const config = loadConfigForRun(tempDir, { ...getDefaultOptions(), aiProvider: 'ollama' });
      expect(config.ai.provider).toBe('ollama');
    } finally {
      delete process.env.GWT_AI_PROVIDER;
    }
  });
});
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement.** Add to `Options` in `src/lib/newpr/types.ts`:

```typescript
  /** Override ai.provider for this run (--ai-provider flag) */
  aiProvider?: string;
  /** Override ai.timeout (ms) for this run (--ai-timeout flag) */
  aiTimeout?: number;
```

Add to `NewArgs` and the yargs builder in `src/cli/wt/new.ts`:

```typescript
      .option('ai-provider', {
        type: 'string',
        description: 'Override the AI provider for this run',
        choices: [
          'auto', 'claude', 'gemini', 'gemini-api', 'openai', 'ollama', 'script', 'fallback', 'none',
        ],
      })
      .option('ai-timeout', {
        type: 'number',
        description: 'Override the AI generation timeout (milliseconds) for this run',
      })
```

and to the handler's options object: `aiProvider: argv['ai-provider'], aiTimeout: argv['ai-timeout'],`.

In `src/cli/newpr.ts`, add (or extend) the exported helper:

```typescript
/**
 * Load config for a run, applying invocation-level AI overrides from CLI
 * flags. CLI flags are the highest tier — they beat env vars, which
 * loadConfig() has already applied.
 */
export function loadConfigForRun(repoRoot: string, options: Options): ResolvedConfig {
  const config = loadConfig(repoRoot);
  if (!options.aiProvider && options.aiTimeout === undefined) {
    return config;
  }
  return {
    ...config,
    ai: {
      ...config.ai,
      ...(options.aiProvider ? { provider: options.aiProvider as AIConfig['provider'] } : {}),
      ...(options.aiTimeout !== undefined ? { timeout: options.aiTimeout } : {}),
    },
  };
}
```

Replace the `loadConfig(repoRoot)` call sites with `loadConfigForRun(repoRoot, options)` (each has `options` in scope).

- [ ] **Step 4: Run and see it pass**, then `pnpm exec vitest run src/cli/newpr.test.ts` to confirm the call-site replacements regressed nothing.
- [ ] **Step 5: Format and commit** — `feat: add --ai-provider/--ai-timeout flags to wt new`.

---

### Task 6: Per-key config provenance module

**Files:** create `src/lib/config-provenance.ts`(+test).

- [ ] **Step 1: Failing tests** — `src/lib/config-provenance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveKeyProvenance, resolveConfigProvenance } from './config-provenance.js';
import type { LoadedConfigSource } from './config.js';

function source(
  level: 'global' | 'repo' | 'local',
  path: string,
  config: Record<string, unknown>
): LoadedConfigSource {
  return { path, level, config, validation: null } as LoadedConfigSource;
}

describe('resolveKeyProvenance', () => {
  it('returns the default tier when no source defines the key', () => {
    expect(resolveKeyProvenance('worktreeParent', '..', [])).toEqual({
      value: '..',
      tier: 'default',
      source: null,
    });
  });

  it('finds the key in a single global source', () => {
    const sources = [
      source('global', '/home/user/.config/git-worktree-tools/config.json', {
        worktreeParent: '.worktrees',
      }),
    ];
    expect(resolveKeyProvenance('worktreeParent', '.worktrees', sources)).toEqual({
      value: '.worktrees',
      tier: 'global',
      source: '/home/user/.config/git-worktree-tools/config.json',
    });
  });

  it('reproduces the hybrid-path case: global sets the parent, repo sets the pattern', () => {
    const sources = [
      source('global', '/home/user/.config/git-worktree-tools/config.json', {
        worktreeParent: '.worktrees',
        worktreePattern: 'pr{number}.{slug}',
      }),
      source('repo', '/repo/.worktreerc', { worktreePattern: '{repo}.pr{number}' }),
    ];
    expect(resolveKeyProvenance('worktreeParent', '.worktrees', sources).tier).toBe('global');
    expect(resolveKeyProvenance('worktreePattern', '{repo}.pr{number}', sources).tier).toBe('repo');
  });

  it('local beats repo beats global for the same key', () => {
    const sources = [
      source('global', '/g', { baseBranch: 'from-global' }),
      source('repo', '/r/.worktreerc', { baseBranch: 'from-repo' }),
      source('local', '/r/.worktreerc.local', { baseBranch: 'from-local' }),
    ];
    expect(resolveKeyProvenance('baseBranch', 'from-local', sources).tier).toBe('local');
  });

  it('resolves nested dotted paths', () => {
    const sources = [source('repo', '/r/.worktreerc', { ai: { provider: 'claude' } })];
    expect(resolveKeyProvenance('ai.provider', 'claude', sources).tier).toBe('repo');
  });

  it('env override beats every file tier', () => {
    const sources = [source('local', '/r/.worktreerc.local', { ai: { provider: 'claude' } })];
    expect(
      resolveKeyProvenance(
        'ai.provider',
        'ollama',
        sources,
        {},
        { 'ai.provider': 'GWT_AI_PROVIDER' }
      )
    ).toEqual({ value: 'ollama', tier: 'env', source: 'GWT_AI_PROVIDER' });
  });

  it('flag override beats env and every file tier', () => {
    const sources = [source('local', '/r/.worktreerc.local', { ai: { provider: 'claude' } })];
    expect(
      resolveKeyProvenance(
        'ai.provider',
        'gemini',
        sources,
        { 'ai.provider': '--ai-provider' },
        { 'ai.provider': 'GWT_AI_PROVIDER' }
      )
    ).toEqual({ value: 'gemini', tier: 'flag', source: '--ai-provider' });
  });
});

describe('resolveConfigProvenance', () => {
  it('resolves a batch of key paths', () => {
    const sources = [source('repo', '/r/.worktreerc', { baseBranch: 'develop' })];
    const result = resolveConfigProvenance(
      ['baseBranch', 'draftPr'],
      { baseBranch: 'develop', draftPr: false },
      sources
    );
    expect(result.baseBranch.tier).toBe('repo');
    expect(result.draftPr.tier).toBe('default');
  });
});
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement** — `src/lib/config-provenance.ts`:

```typescript
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
```

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `feat: add per-key config provenance resolution`.

---

### Task 7: Wire provenance into `wt config show --json`

Also fixes the disconnected-systems bug: `handleShow`'s JSON branch moves from `wtconfig/config-manager.ts` (wrong global path, no local tier) to `loadConfigWithValidation`.

**Files:** modify `src/cli/wt/config.ts`, `src/cli/wt/config.test.ts`.

- [ ] **Step 1: Failing tests.** Give the existing `loadConfigWithValidation` mock a default return (so current tests keep working), then add provenance cases asserting `createSuccessResult` is called with a `provenance` object mapping `worktreeParent` → `tier: 'global'` and `worktreePattern` → `tier: 'repo'`, plus an env-var case asserting `'ai.provider'` → `tier: 'env', source: 'GWT_AI_PROVIDER'`.

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement.** Add imports for `resolveConfigProvenance` and `envOverrideSourceMap`. Add the curated key list:

```typescript
/**
 * Keys reported with per-key provenance in `wt config show --json`. Kept
 * smaller than the full schema — these are the settings most likely to
 * prompt a "which file did this come from?" question.
 */
const PROVENANCE_KEYS = [
  'baseBranch',
  'draftPr',
  'branchPrefix',
  'worktreePattern',
  'worktreeParent',
  'preferredEditor',
  'sharedRepos',
  'ai.provider',
  'ai.fallback',
  'ai.providerPriority',
  'ai.timeout',
  'ai.branchName',
  'ai.prTitle',
  'ai.prDescription',
  'ai.commitMessage',
  'ai.planDocument',
];
```

Replace `handleShow`'s JSON branch:

```typescript
if (json) {
  const { config, sources } = loadConfigWithValidation(repoRoot ?? undefined, {
    warnOnErrors: false,
  });
  const provenance = resolveConfigProvenance(
    PROVENANCE_KEYS,
    config as unknown as Record<string, unknown>,
    sources,
    {},
    envOverrideSourceMap()
  );
  const result = createSuccessResult('wtconfig', {
    subcommand: 'show',
    source: sources.length > 0 ? sources[sources.length - 1].path : null,
    config,
    provenance,
  });
  console.log(formatJsonResult(result));
  return;
}
// The human-readable path below is intentionally unchanged for now — it
// still uses wtconfig/config-manager.ts. Unifying it is a known follow-up.
```

- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Format and commit** — `feat: report per-key config provenance in wt config show --json`.

---

### Task 8: Documentation

**Files:** modify `README.md`, `docs/AI-TOOLING.md`.

- [ ] **Step 1: README.** After the existing merge-order line, add the full chain, an env-var table (`GWT_AI_PROVIDER`, `GWT_AI_PRIORITY`, `GWT_NO_AI`, `GWT_AI_TIMEOUT`) noting that an invalid value fails fast with `INVALID_CONFIG` naming the variable, and a short note that `wt config show --json` reports per-key provenance.

- [ ] **Step 2: `docs/AI-TOOLING.md`.** Add a "Config Overrides for Agent Callers" section after the JSON Output Mode section: env-var table with validation rules, the `--ai-provider`/`--ai-timeout` flags (distinguishing them from `--force-ai`/`--skip-ai`, which control _whether_ generation runs — cross-reference "Supplying PR content directly" rather than duplicating it), and a worked `provenance` JSON example showing `tier` ∈ `flag|env|local|repo|global|default`.

- [ ] **Step 3:** `pnpm exec prettier --check README.md docs/AI-TOOLING.md`.
- [ ] **Step 4: Commit** — `docs: document the config override chain, env vars, and per-key provenance`.

---

## ISOLATED — depends on Part 2

### Task 9: Schema + docs for Part 2's provider-selection keys

**Do last, or drop entirely if Part 2 hasn't merged.** Nothing in Tasks 1–8 depends on it. Confirm the exact shape Part 2 shipped before writing — "generic `ai.models` map vs. per-provider objects" is a real design choice affecting the schema.

- [ ] **Step 1:** Add `'ai.providerPriority'`, `'ai.timeout'`, `'ai.models.*'` to `DOCUMENTED_KEYS`.
- [ ] **Step 2:** Run and see it fail.
- [ ] **Step 3:** Add `providerPriority` (array with provider enum), `timeout` (number, minimum 1), and `models` (object keyed by provider) to `definitions.AIConfig.properties`.
- [ ] **Step 4:** Run and see it pass.
- [ ] **Step 5:** Add README/AI-TOOLING rows noting `GWT_AI_PRIORITY`/`GWT_AI_TIMEOUT` are the env forms.
- [ ] **Step 6: Commit** — `docs: schema coverage for ai.providerPriority/ai.timeout/ai.models`.

---

## ISOLATED — depends on Part 3

### Task 10: Schema + docs for `worktreeParentAnchor`

**Do last, or drop entirely if Part 3 hasn't merged.**

- [ ] **Step 1:** Add `'worktreeParentAnchor'` to `DOCUMENTED_KEYS`.
- [ ] **Step 2:** Run and see it fail.
- [ ] **Step 3:** Add to the top-level `properties`:

```json
"worktreeParentAnchor": {
  "type": "string",
  "enum": ["main-worktree", "repo-root"],
  "default": "main-worktree",
  "description": "What a relative worktreeParent resolves against. 'main-worktree' (default) anchors to the stable main worktree/bare-repo container root regardless of which worktree you invoke from. 'repo-root' preserves the legacy behaviour of resolving against the current worktree's root."
}
```

- [ ] **Step 4:** Run and see it pass.
- [ ] **Step 5:** Add a README row plus a worked bare-repo-container example, cross-referencing Part 3 rather than duplicating it.
- [ ] **Step 6: Commit** — `docs: schema coverage for worktreeParentAnchor`.
