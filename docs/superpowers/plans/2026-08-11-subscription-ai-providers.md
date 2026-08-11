# Plan: Subscription-First AI Providers, Trustworthy Availability, and `wt ai doctor`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Date:** 2026-08-11
**Implements:** §4 ("Part 2 — Provider selection and the codex subscription") of `docs/superpowers/specs/2026-08-07-agent-pr-content-and-layouts-design.md`
**Builds on:** Part 1 (already on this branch) — `PRGenerationResult.provider`/`.error`, `describeFailures()`, `context.needed`, `--skip-ai`. This plan does not touch `src/lib/newpr/pr-content.ts` or its test file at all.

## Goal

An `ai.provider: "auto"` run on a machine with `codex`, `claude`, and an **invalid** `GEMINI_API_KEY` must end up using `codex` or `claude` — not silently produce template content because a metered API key that happens to be present (but does not work) won selection and nothing tried the next candidate. Every attempt must be visible via `aiError` (already wired by Part 1). `wt ai doctor` must show, on this exact machine, that `GEMINI_API_KEY` is invalid — via a real probe, not `Boolean(process.env.GEMINI_API_KEY)`.

## Architecture

```
AIProviderManager (auto mode)
  ├─ orderedFactoriesForAuto()   # config.providerPriority ?? DEFAULT_AI_PROVIDER_PRIORITY
  ├─ buildAutoChain()            # every AVAILABLE provider, in priority order
  └─ executeWithFallback()       # walks the FULL chain on success:false, not just primary+1

config-resolvers.ts (new, pure, no I/O)
  ├─ resolveProviderModel(config, name)
  └─ resolveProviderTimeout(config, name, fallback?)

cli-provider.ts
  ├─ OpenAIProvider (codex) — rewritten: --output-last-message tmpfile, -s read-only,
  │                           --skip-git-repo-check, --color never, configurable timeout+model
  └─ ClaudeProvider         — configurable model/timeout; stale hardcoded model REMOVED
                              (omit --model entirely when unset so it cannot go stale again)

doctor.ts (new)      — probes + pickAutoProvider() (pure, table-driven tested)
doctor-report.ts (new) — runDiagnostics(); separate file so its test can cleanly mock the probes
src/cli/wt/ai.ts (new) — `wt ai doctor [--json] [--offline]`
```

## Global Constraints

- ESM: every relative import ends in `.js`. Node >= 18. **No new runtime dependencies** (codex/claude are spawned CLIs).
- Use **`pnpm`, never `npm`** — the lockfile pins prettier 3.8.1; npm resolves a different version that formats differently and turns CI red.
- Commit normally (**no `--no-verify`**); run `pnpm exec prettier --write` on touched files first.
- **Known-failing baseline: 14 tests / 4 files** — `src/lib/config.test.ts` (4), `src/lib/prs/actions.test.ts` (1), `src/e2e/newpr-full-flow.e2e.test.ts` (6), `src/e2e/newpr/scenarios.e2e.test.ts` (3). Pre-existing: the suite reads the developer's real `~/.config/git-worktree-tools/config.json`. A task succeeds if it adds no NEW failures.
- `pnpm run build` before any e2e test.
- **Never let a test invoke a real AI provider or spend real quota.** Every `spawnSync`/`fetch` in a unit test is mocked. `wt ai doctor`'s live probes are real when a human runs it; tests use `--offline` or inject fakes.
- **Do not modify `src/lib/newpr/pr-content.ts` or `src/lib/newpr/pr-content.test.ts`.** Its two invariant matrices (32 + 16 rows) must stay green. Verified safe: `resolvePRContent` takes `generate` as an injected function parameter, so nothing here can reach it.
- The config identifier for the codex provider **stays `'openai'`** (`AIProviderName`) for backward compatibility. Only the display name (`OpenAIProvider.name`, log lines, `aiError`, doctor output) says `codex`. Renaming touches `config-validation.ts`, `config-editor.ts` and the legacy `wtconfig/config-manager.ts`; it is not required by this part and is deferred.
- `schemas/worktreerc.schema.json`'s `AIConfig` has `"additionalProperties": false` — **any new `AIConfig` field must be mirrored into the schema in the same task**, or schema-aware tooling flags a valid config as invalid.
- **Cross-part coordination:** Part 4 (`feat/config-overrides-and-schema`) also edits `schemas/worktreerc.schema.json`. Task 7 here adds only the four new `ai.*` properties. Expect a small merge conflict in that file; resolve by keeping both sets of properties.
- The `gemini` **CLI** provider is dropped from the default priority (the spec lists exactly four) but remains selectable via explicit `ai.provider: "gemini"` or a user's own `ai.providerPriority`. This is re-prioritisation, not removal.
- `--output-schema` (constraining codex output to a JSON Schema) is background in the spec, not one of the six deliverables — explicitly deferred.

## File Structure

| File                                  | Change                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/ai/types.ts`                 | Add `providerPriority`, `timeout`, `providers`, `models` to `AIConfig`; add `DEFAULT_AI_PROVIDER_PRIORITY`, `DEFAULT_AI_TIMEOUT_MS` |
| `src/lib/ai/config-resolvers.ts`      | **New.** `resolveProviderModel`, `resolveProviderTimeout` — pure                                                                    |
| `src/lib/ai/config-resolvers.test.ts` | **New.**                                                                                                                            |
| `src/lib/ai/gemini-api-provider.ts`   | Configurable timeout; explicit `API_KEY_INVALID` message                                                                            |
| `src/lib/ai/cli-provider.ts`          | Rewrite `OpenAIProvider.generate()`; configurable model/timeout for all CLI providers                                               |
| `src/lib/ai/cli-provider.test.ts`     | Rewrite codex tests; add claude model/timeout tests                                                                                 |
| `src/lib/ai/provider-manager.ts`      | `orderedFactoriesForAuto()`, `buildAutoChain()`, rewritten `executeWithFallback()`, `getAutoSelectionPreview()`                     |
| `src/lib/ai/provider-manager.test.ts` | Rewrite two priority-order tests; add fallthrough + table-driven matrix                                                             |
| `src/lib/ai/doctor.ts`                | **New.** Probes + `pickAutoProvider()`                                                                                              |
| `src/lib/ai/doctor.test.ts`           | **New.**                                                                                                                            |
| `src/lib/ai/doctor-report.ts`         | **New.** `runDiagnostics()`                                                                                                         |
| `src/lib/ai/doctor-report.test.ts`    | **New.**                                                                                                                            |
| `src/cli/wt/ai.ts`                    | **New.** `wt ai doctor`                                                                                                             |
| `src/cli/wt/ai.test.ts`               | **New.**                                                                                                                            |
| `src/cli/wt.ts`                       | Register `aiCommand`                                                                                                                |
| `src/cli/wt.unit.test.ts`             | Assert `ai` registered                                                                                                              |
| `src/lib/config-validation.ts`        | Validate `ai.providerPriority` entries and `ai.timeout`                                                                             |
| `src/lib/config-validation.test.ts`   | New cases                                                                                                                           |
| `schemas/worktreerc.schema.json`      | Add the four new `AIConfig` properties                                                                                              |
| `src/lib/schema.test.ts`              | Assert new keys present                                                                                                             |

---

### Task 1 — Pure config resolvers (`resolveProviderModel` / `resolveProviderTimeout`)

**Why first:** every later task depends on these. Zero I/O, so no mocking.

**Files:** Create `src/lib/ai/config-resolvers.ts`, `src/lib/ai/config-resolvers.test.ts`; modify `src/lib/ai/types.ts`.

**Interfaces produced:** `resolveProviderModel(config: AIConfig, provider: AIProviderName): string | undefined`; `resolveProviderTimeout(config: AIConfig, provider: AIProviderName, fallback?: number): number`; constants `DEFAULT_AI_PROVIDER_PRIORITY`, `DEFAULT_AI_TIMEOUT_MS`.

- [ ] **Step 1: Extend `types.ts`**

Add after `AIConfig`, before `DEFAULT_AI_CONFIG`:

```ts
/**
 * Ordered list of providers to try when `provider` is `'auto'`.
 * Subscription-first: codex and claude are flat-rate against subscriptions
 * already paid for; gemini-api is metered per token; ollama is a local last
 * resort. Overridable at every config tier via `ai.providerPriority`.
 *
 * NOTE: the wire identifier for the codex CLI provider is `'openai'` (kept
 * for backward compatibility with existing .worktreerc files); its display
 * name is `'codex'`.
 */
export const DEFAULT_AI_PROVIDER_PRIORITY: AIProviderName[] = [
  'openai',
  'claude',
  'gemini-api',
  'ollama',
];

/** Default per-generation timeout (ms) applied to every provider unless overridden. */
export const DEFAULT_AI_TIMEOUT_MS = 60_000;
```

Add to the `AIConfig` interface, after `script?`:

```ts
  /** Ordered provider names to try when `provider` is `'auto'`. */
  providerPriority?: AIProviderName[];

  /** Default generation timeout in ms for every provider unless overridden. Default 60000. */
  timeout?: number;

  /** Per-provider overrides, keyed by provider name. */
  providers?: Partial<Record<AIProviderName, { timeout?: number }>>;

  /**
   * Per-provider model override. Takes precedence over the legacy
   * `claude.model` / `gemini.model` / `openai.model` nested fields.
   */
  models?: Partial<Record<AIProviderName, string>>;
```

- [ ] **Step 2: Write the failing tests** — `src/lib/ai/config-resolvers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { resolveProviderModel, resolveProviderTimeout } from './config-resolvers.js';
import { DEFAULT_AI_TIMEOUT_MS } from './types.js';
import type { AIConfig } from './types.js';

describe('resolveProviderModel', () => {
  it('returns undefined when nothing is configured', () => {
    expect(resolveProviderModel({}, 'claude')).toBeUndefined();
  });

  it('reads the new ai.models.<provider> field', () => {
    const config: AIConfig = { models: { claude: 'claude-opus-4-6' } };
    expect(resolveProviderModel(config, 'claude')).toBe('claude-opus-4-6');
  });

  it('falls back to the legacy ai.claude.model field', () => {
    const config: AIConfig = { claude: { model: 'claude-legacy' } };
    expect(resolveProviderModel(config, 'claude')).toBe('claude-legacy');
  });

  it('prefers ai.models.<provider> over the legacy nested field', () => {
    const config: AIConfig = {
      models: { claude: 'claude-new' },
      claude: { model: 'claude-legacy' },
    };
    expect(resolveProviderModel(config, 'claude')).toBe('claude-new');
  });

  it('maps gemini-api model lookups onto the legacy gemini.model field', () => {
    const config: AIConfig = { gemini: { model: 'gemini-legacy' } };
    expect(resolveProviderModel(config, 'gemini-api')).toBe('gemini-legacy');
  });

  it('maps the codex provider (config key "openai") onto ai.openai.model', () => {
    const config: AIConfig = { openai: { model: 'o1-mini' } };
    expect(resolveProviderModel(config, 'openai')).toBe('o1-mini');
  });
});

describe('resolveProviderTimeout', () => {
  it('returns DEFAULT_AI_TIMEOUT_MS when nothing is configured', () => {
    expect(resolveProviderTimeout({}, 'claude')).toBe(DEFAULT_AI_TIMEOUT_MS);
  });

  it('uses ai.timeout as the global default', () => {
    expect(resolveProviderTimeout({ timeout: 15_000 }, 'claude')).toBe(15_000);
  });

  it('prefers ai.providers.<name>.timeout over ai.timeout', () => {
    const config: AIConfig = { timeout: 15_000, providers: { claude: { timeout: 5_000 } } };
    expect(resolveProviderTimeout(config, 'claude')).toBe(5_000);
  });

  it('uses the caller-supplied fallback when neither is configured', () => {
    expect(resolveProviderTimeout({}, 'ollama', 120_000)).toBe(120_000);
  });

  it('still prefers an explicit ai.timeout over the caller-supplied fallback', () => {
    expect(resolveProviderTimeout({ timeout: 9_000 }, 'ollama', 120_000)).toBe(9_000);
  });
});
```

- [ ] **Step 3: Run and see it fail**

`pnpm exec vitest run src/lib/ai/config-resolvers.test.ts` → `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement** — `src/lib/ai/config-resolvers.ts`

```ts
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
```

- [ ] **Step 5: Run and see it pass**, then commit

```bash
pnpm exec vitest run src/lib/ai/config-resolvers.test.ts
pnpm exec prettier --write src/lib/ai/types.ts src/lib/ai/config-resolvers.ts src/lib/ai/config-resolvers.test.ts
git add src/lib/ai/types.ts src/lib/ai/config-resolvers.ts src/lib/ai/config-resolvers.test.ts
git commit -m "feat(ai): add provider priority/timeout/model config resolution"
```

---

### Task 2 — Fix the codex provider (`OpenAIProvider`)

**Risk area.** Covers correct flags, temp-file read, cleanup on success/throw, non-zero exit, empty output, timeout.

**Files:** modify `src/lib/ai/cli-provider.ts`, `src/lib/ai/cli-provider.test.ts`.

**Interfaces consumed:** `DEFAULT_AI_TIMEOUT_MS` (Task 1).

**Key technique:** the mocked `spawnSync` **writes the fake answer to the real path passed via `--output-last-message`**, mirroring real `codex exec`. The provider's real `fs` calls then run against a real tiny temp file — no `fs` mocking, matching the existing `github.test.ts` convention.

- [ ] **Step 1: Write the failing tests** — replace the `OpenAIProvider` describe block in `cli-provider.test.ts`; add `import * as fs from 'fs';`

```ts
describe('OpenAIProvider (Codex CLI)', () => {
  function findFlagValue(args: string[], flag: string): string | undefined {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  }

  function mockCodexExec(opts: {
    installed?: boolean;
    status?: number | null;
    signal?: NodeJS.Signals | null;
    stderr?: string;
    lastMessage?: string | null; // null = codex never wrote the file
    error?: Error;
  }) {
    const {
      installed = true,
      status = 0,
      signal = null,
      stderr = '',
      lastMessage = 'ok',
      error,
    } = opts;

    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if ((cmd === 'which' || cmd === 'where') && (args as string[])?.[0] === 'codex') {
        return {
          status: installed ? 0 : 1,
          stdout: installed ? '/usr/bin/codex' : '',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        };
      }

      if (cmd === 'codex') {
        const argv = args as string[];
        const outputFile = findFlagValue(argv, '--output-last-message');
        if (lastMessage !== null && outputFile) {
          fs.writeFileSync(outputFile, lastMessage, 'utf-8');
        }
        return { status, signal, stdout: '', stderr, pid: 0, output: [], error };
      }

      throw new Error(`unexpected spawnSync call: ${cmd}`);
    });
  }

  const ctx = { description: 'Add auth', repoName: 'repo', branchPrefix: 'feat' };

  it('returns true when codex is installed', async () => {
    mockCodexExec({ installed: true });
    expect(await new OpenAIProvider().isAvailable()).toBe(true);
  });

  it('returns false when codex is not installed', async () => {
    mockCodexExec({ installed: false });
    expect(await new OpenAIProvider().isAvailable()).toBe(false);
  });

  it('invokes codex exec with the safe, non-interactive flag set', async () => {
    mockCodexExec({ lastMessage: 'feat/add-auth' });

    await new OpenAIProvider().generateBranchName(ctx);

    const codexCall = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'codex')!;
    const args = codexCall[1] as string[];

    expect(args[0]).toBe('exec');
    expect(args).toContain('--skip-git-repo-check');
    expect(args).toEqual(expect.arrayContaining(['-s', 'read-only']));
    expect(args).toEqual(expect.arrayContaining(['--color', 'never']));
    expect(args).toContain('--output-last-message');
    expect(args).not.toContain('-m');
  });

  it('includes -m <model> only when a model is configured', async () => {
    mockCodexExec({ lastMessage: 'feat/add-auth' });

    await new OpenAIProvider('gpt-5.6-codex').generateBranchName(ctx);

    const [, args] = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'codex')!;
    expect(args as string[]).toEqual(expect.arrayContaining(['-m', 'gpt-5.6-codex']));
  });

  it('reads the answer from the --output-last-message file, not stdout', async () => {
    mockCodexExec({ lastMessage: 'feat/add-auth' });

    const result = await new OpenAIProvider().generateBranchName(ctx);

    expect(result.success).toBe(true);
    expect(result.content).toBe('feat/add-auth');
    expect(result.provider).toBe('codex');
  });

  it('deletes the temp file after a successful run', async () => {
    mockCodexExec({ lastMessage: 'feat/add-auth' });
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    await new OpenAIProvider().generateBranchName(ctx);

    const outputFile = writeSpy.mock.calls[0][0] as string;
    expect(fs.existsSync(outputFile)).toBe(false);
  });

  it('deletes the temp file even when codex exits non-zero', async () => {
    mockCodexExec({ status: 1, stderr: 'boom', lastMessage: 'partial' });
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    const result = await new OpenAIProvider().generateBranchName(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
    const outputFile = writeSpy.mock.calls[0][0] as string;
    expect(fs.existsSync(outputFile)).toBe(false);
  });

  it('returns an error when the output file was never written', async () => {
    mockCodexExec({ status: 0, lastMessage: null });

    const result = await new OpenAIProvider().generateBranchName(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('no output');
  });

  it('returns an error on empty output', async () => {
    mockCodexExec({ status: 0, lastMessage: '   ' });

    const result = await new OpenAIProvider().generateBranchName(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('treats a timeout (killed by signal) as a failure and cleans up', async () => {
    mockCodexExec({ status: null, signal: 'SIGTERM', lastMessage: 'unfinished' });
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    const result = await new OpenAIProvider(undefined, 100).generateBranchName(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timeout|signal/i);
    const outputFile = writeSpy.mock.calls[0][0] as string;
    expect(fs.existsSync(outputFile)).toBe(false);
  });

  it('cleans up even when spawnSync itself errors', async () => {
    mockCodexExec({ lastMessage: null, error: new Error('ENOENT') });

    const result = await new OpenAIProvider().generateBranchName(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it('passes the configured timeout to spawnSync', async () => {
    mockCodexExec({ lastMessage: 'ok' });

    await new OpenAIProvider(undefined, 12_345).generateBranchName(ctx);

    const [, , opts] = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'codex')!;
    expect((opts as { timeout: number }).timeout).toBe(12_345);
  });
});
```

- [ ] **Step 2: Run and see it fail**

`pnpm exec vitest run src/lib/ai/cli-provider.test.ts` — current code runs `codex exec "prompt"`, no temp file, reads stdout.

- [ ] **Step 3: Implement** — replace `OpenAIProvider` in `cli-provider.ts`; add `import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path'; import * as crypto from 'crypto';` and import `DEFAULT_AI_TIMEOUT_MS` from `./types.js`

```ts
/**
 * OpenAI Codex CLI provider.
 *
 * Uses `codex exec` non-interactively and reads the answer from a temp file
 * via --output-last-message: codex's stdout carries the agent's reasoning
 * preamble and token accounting, which is not the answer.
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'codex';
  private model?: string;
  private timeoutMs: number;

  constructor(model?: string, timeoutMs: number = DEFAULT_AI_TIMEOUT_MS) {
    super();
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  static checkAvailability(): Promise<boolean> {
    return Promise.resolve(commandExists('codex'));
  }

  async isAvailable(): Promise<boolean> {
    return OpenAIProvider.checkAvailability();
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    const outputFile = path.join(
      os.tmpdir(),
      `gwt-codex-${process.pid}-${crypto.randomBytes(6).toString('hex')}.txt`
    );

    try {
      const args = [
        'exec',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '--color',
        'never',
        '--output-last-message',
        outputFile,
      ];
      if (this.model) {
        args.push('-m', this.model);
      }
      args.push(prompt);

      const result = spawnSync('codex', args, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024 * 10,
        timeout: this.timeoutMs,
      });

      if (result.error) {
        throw result.error;
      }
      if (result.signal) {
        throw new Error(
          `codex exec was killed by signal ${result.signal} (likely timed out after ${this.timeoutMs}ms)`
        );
      }
      if (result.status !== 0) {
        throw new Error(result.stderr || `codex exec failed with exit code ${result.status}`);
      }
      if (!fs.existsSync(outputFile)) {
        throw new Error('codex exec produced no output file');
      }

      const output = fs.readFileSync(outputFile, 'utf-8').trim();
      if (!output) {
        throw new Error('codex exec produced an empty response');
      }

      return createSuccessResult(output, this.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Codex CLI error: ${message}`, this.name);
    } finally {
      try {
        if (fs.existsSync(outputFile)) {
          fs.rmSync(outputFile, { force: true });
        }
      } catch {
        // Best effort: a leftover temp file must never mask the real error.
      }
    }
  }
}
```

- [ ] **Step 4: Update the pre-existing `mockSpawnForCodex` helper**

Earlier tests in the same file build codex **stdout** responses. The new implementation ignores stdout, so update that helper to also write to the `--output-last-message` path (same technique as `mockCodexExec`).

- [ ] **Step 5: Run, see it pass, commit**

```bash
pnpm exec vitest run src/lib/ai/cli-provider.test.ts
pnpm exec prettier --write src/lib/ai/cli-provider.ts src/lib/ai/cli-provider.test.ts
git add src/lib/ai/cli-provider.ts src/lib/ai/cli-provider.test.ts
git commit -m "fix(ai): codex provider reads --output-last-message, adds safe flags and timeout"
```

---

### Task 3 — `ClaudeProvider`: configurable model (remove stale hardcode) + timeout

**Files:** modify `src/lib/ai/cli-provider.ts`, `src/lib/ai/cli-provider.test.ts`.

- [ ] **Step 1: Write the failing tests** — add to the `ClaudeProvider` describe block

```ts
function mockClaude(stdout = 'feat/x') {
  vi.mocked(spawnSync).mockImplementation((cmd) => {
    if (cmd === 'which' || cmd === 'where') {
      return { status: 0, stdout: '/usr/bin/claude', stderr: '', pid: 0, output: [], signal: null };
    }
    return { status: 0, stdout, stderr: '', pid: 0, output: [], signal: null };
  });
}

it('omits --model when no model is configured (uses the CLI default)', async () => {
  mockClaude();
  await new ClaudeProvider().generateBranchName({
    description: 'x',
    repoName: 'r',
    branchPrefix: 'feat',
  });

  const claudeCall = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'claude')!;
  expect(claudeCall[1] as string[]).not.toContain('--model');
});

it('passes --model when a model is configured', async () => {
  mockClaude();
  await new ClaudeProvider('claude-opus-4-6').generateBranchName({
    description: 'x',
    repoName: 'r',
    branchPrefix: 'feat',
  });

  const [, args] = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'claude')!;
  expect(args as string[]).toEqual(expect.arrayContaining(['--model', 'claude-opus-4-6']));
});

it('passes the configured timeout through to spawnSync', async () => {
  mockClaude('ok');
  await new ClaudeProvider(undefined, 9_999).generateBranchName({
    description: 'x',
    repoName: 'r',
    branchPrefix: 'feat',
  });

  const [, , opts] = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'claude')!;
  expect((opts as { timeout: number }).timeout).toBe(9_999);
});
```

- [ ] **Step 2: Run and see it fail** — current code always pushes a hardcoded `--model`, and `execCommand` hardcodes `timeout: 60000`.

- [ ] **Step 3: Implement** — widen `execCommand` and rewrite `ClaudeProvider`

```ts
function execCommand(
  cmd: string,
  args: string[],
  input?: string,
  timeoutMs: number = DEFAULT_AI_TIMEOUT_MS
): string {
  const result = spawnSync(cmd, args, {
    input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10,
    timeout: timeoutMs,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(
      `${cmd} was killed by signal ${result.signal} (likely timed out after ${timeoutMs}ms)`
    );
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed with exit code ${result.status}`);
  }

  return result.stdout;
}

export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'claude';
  private model?: string;
  private timeoutMs: number;

  constructor(model?: string, timeoutMs: number = DEFAULT_AI_TIMEOUT_MS) {
    super();
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  static checkAvailability(): Promise<boolean> {
    return Promise.resolve(commandExists('claude'));
  }

  async isAvailable(): Promise<boolean> {
    return ClaudeProvider.checkAvailability();
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    try {
      const args = ['-p', prompt];
      if (this.model) {
        args.push('--model', this.model);
      }
      const output = execCommand('claude', args, undefined, this.timeoutMs);
      return createSuccessResult(output.trim(), this.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Claude CLI error: ${message}`, this.name);
    }
  }
}
```

Also thread a `timeoutMs` constructor param through `GeminiProvider(model?, timeoutMs = DEFAULT_AI_TIMEOUT_MS)` and `OllamaProvider(model?, host?, timeoutMs = 120_000)` — Ollama keeps a generous local-model default, wired via `resolveProviderTimeout(config, 'ollama', 120_000)` in Task 5.

- [ ] **Step 4: Run the whole file, confirm untouched provider tests still pass, commit**

```bash
pnpm exec vitest run src/lib/ai/cli-provider.test.ts
pnpm exec prettier --write src/lib/ai/cli-provider.ts src/lib/ai/cli-provider.test.ts
git add src/lib/ai/cli-provider.ts src/lib/ai/cli-provider.test.ts
git commit -m "fix(ai): configurable claude model/timeout; remove stale hardcoded model default"
```

---

### Task 4 — `GeminiAPIProvider`: configurable timeout, explicit invalid-key message

The real repro returns **HTTP 400** with `reason: "API_KEY_INVALID"` — not 401/403 as the current code assumes, so the invalid key currently falls through to a generic message.

**Files:** modify `src/lib/ai/gemini-api-provider.ts`, `src/lib/ai/gemini-api-provider.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it('names an invalid API key explicitly on HTTP 400 API_KEY_INVALID', async () => {
  process.env.GEMINI_API_KEY = 'invalid-key';
  mockFetch.mockResolvedValue({
    ok: false,
    status: 400,
    json: () =>
      Promise.resolve({
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
          reason: 'API_KEY_INVALID',
        },
      }),
  });

  const result = await new GeminiAPIProvider().generateBranchName(branchContext);

  expect(result.success).toBe(false);
  expect(result.error).toContain('Invalid or blocked API key');
});

it('passes the configured timeout to the AbortController', async () => {
  vi.useFakeTimers();
  process.env.GEMINI_API_KEY = 'test-key';
  mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves

  const resultPromise = new GeminiAPIProvider(undefined, 5_000).generateBranchName(branchContext);
  await vi.advanceTimersByTimeAsync(5_001);
  const result = await resultPromise;

  expect(result.success).toBe(false);
  expect(result.error).toContain('timed out');
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run and see both fail.**

- [ ] **Step 3: Implement**

Add `private timeoutMs: number;`, import `DEFAULT_AI_TIMEOUT_MS`, drop the module-level `TIMEOUT_MS`, and use `this.timeoutMs` in the `setTimeout` and the abort message:

```ts
constructor(model?: string, timeoutMs: number = DEFAULT_AI_TIMEOUT_MS) {
  super();
  this.model = model || DEFAULT_MODEL;
  this.timeoutMs = timeoutMs;
}
```

Widen the error branch:

```ts
if (!response.ok) {
  let body: { error?: { reason?: string; message?: string } } | undefined;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error body — fall through to the generic branches.
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    body?.error?.reason === 'API_KEY_INVALID'
  ) {
    return createErrorResult('Invalid or blocked API key — check GEMINI_API_KEY', this.name);
  }
  if (response.status === 429) {
    return createErrorResult('Rate limit exceeded — retry later', this.name);
  }
  return createErrorResult(`Gemini API error: HTTP ${response.status}`, this.name);
}
```

- [ ] **Step 4: Run, see it pass, commit**

```bash
pnpm exec prettier --write src/lib/ai/gemini-api-provider.ts src/lib/ai/gemini-api-provider.test.ts
git add src/lib/ai/gemini-api-provider.ts src/lib/ai/gemini-api-provider.test.ts
git commit -m "fix(ai): gemini-api names API_KEY_INVALID explicitly, configurable timeout"
```

---

### Task 5 — Provider manager: subscription-first priority + full auto-chain fallthrough

**Risk area, and the direct fix for the spec's §1.1 incident.**

**Files:** modify `src/lib/ai/provider-manager.ts`, `src/lib/ai/provider-manager.test.ts`.

**Two existing tests change meaning intentionally** — they encode the OLD priority as behaviour. Replace them in place:

- `'initializes with auto provider detection'` (asserts `gemini-api` wins) → rewrite to assert codex wins.
- `'skips unavailable providers during auto-detection'` (asserts the `gemini` CLI wins) → rewrite: with codex/claude/gemini-api unavailable, `ollama` wins (the CLI `gemini` is no longer in the default priority).

- [ ] **Step 1: Write the failing tests** (replacements plus new cases)

```ts
it('auto mode picks codex (config key "openai") first by default', async () => {
  const codexProvider = mockProvider('codex', true);
  vi.mocked(OpenAIProvider).mockImplementation(
    () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
  );

  const manager = new AIProviderManager({ config: { provider: 'auto' } });
  await manager.initialize();

  expect(await manager.getActiveProviderName()).toBe('codex');
});

it('auto mode falls through to ollama when codex, claude and gemini-api are unavailable', async () => {
  const ollamaProvider = mockProvider('ollama', true);
  vi.mocked(OllamaProvider).mockImplementation(
    () => ollamaProvider as unknown as InstanceType<typeof OllamaProvider>
  );
  (OpenAIProvider as unknown as { checkAvailability: () => Promise<boolean> }).checkAvailability =
    vi.fn().mockResolvedValue(false);
  (ClaudeProvider as unknown as { checkAvailability: () => Promise<boolean> }).checkAvailability =
    vi.fn().mockResolvedValue(false);
  (
    GeminiAPIProvider as unknown as { checkAvailability: () => Promise<boolean> }
  ).checkAvailability = vi.fn().mockResolvedValue(false);

  const manager = new AIProviderManager({ config: { provider: 'auto' } });
  await manager.initialize();

  expect(await manager.getActiveProviderName()).toBe('ollama');
});

it('respects a custom ai.providerPriority order', async () => {
  const ollamaProvider = mockProvider('ollama', true);
  vi.mocked(OllamaProvider).mockImplementation(
    () => ollamaProvider as unknown as InstanceType<typeof OllamaProvider>
  );

  const manager = new AIProviderManager({
    config: { provider: 'auto', providerPriority: ['ollama', 'claude'] },
  });
  await manager.initialize();

  expect(await manager.getActiveProviderName()).toBe('ollama');
});

describe('auto-mode fallthrough on failure', () => {
  it('advances past a provider that is available but returns success:false', async () => {
    const codexProvider = mockProvider('codex', true, {
      success: false,
      error: 'Codex CLI error: exit 1',
      provider: 'codex',
    });
    const claudeProvider = mockProvider('claude', true, {
      success: true,
      content: 'feat/from-claude',
      provider: 'claude',
    });
    vi.mocked(OpenAIProvider).mockImplementation(
      () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
    );
    vi.mocked(ClaudeProvider).mockImplementation(
      () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
    );

    const manager = new AIProviderManager({ config: { provider: 'auto' } });
    const result = await manager.generateBranchName({
      description: 'x',
      repoName: 'r',
      branchPrefix: 'feat',
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe('feat/from-claude');
    expect(codexProvider.generateBranchName).toHaveBeenCalled();
    expect(claudeProvider.generateBranchName).toHaveBeenCalled();
  });

  it('walks the FULL chain, not just primary+1', async () => {
    const codexProvider = mockProvider('codex', true, {
      success: false,
      error: 'e1',
      provider: 'codex',
    });
    const claudeProvider = mockProvider('claude', true, {
      success: false,
      error: 'e2',
      provider: 'claude',
    });
    const geminiApiProvider = mockProvider('gemini-api', true, {
      success: true,
      content: 'feat/from-gemini-api',
      provider: 'gemini-api',
    });
    vi.mocked(OpenAIProvider).mockImplementation(
      () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
    );
    vi.mocked(ClaudeProvider).mockImplementation(
      () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
    );
    vi.mocked(GeminiAPIProvider).mockImplementation(
      () => geminiApiProvider as unknown as InstanceType<typeof GeminiAPIProvider>
    );

    const manager = new AIProviderManager({ config: { provider: 'auto' } });
    const result = await manager.generateBranchName({
      description: 'x',
      repoName: 'r',
      branchPrefix: 'feat',
    });

    expect(result.content).toBe('feat/from-gemini-api');
  });

  it('reports the LAST failure when every candidate fails', async () => {
    const codexProvider = mockProvider('codex', true, {
      success: false,
      error: 'codex broke',
      provider: 'codex',
    });
    const claudeProvider = mockProvider('claude', true, {
      success: false,
      error: 'claude broke',
      provider: 'claude',
    });
    vi.mocked(OpenAIProvider).mockImplementation(
      () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
    );
    vi.mocked(ClaudeProvider).mockImplementation(
      () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
    );
    (
      GeminiAPIProvider as unknown as { checkAvailability: () => Promise<boolean> }
    ).checkAvailability = vi.fn().mockResolvedValue(false);
    (OllamaProvider as unknown as { checkAvailability: () => Promise<boolean> }).checkAvailability =
      vi.fn().mockResolvedValue(false);

    const manager = new AIProviderManager({ config: { provider: 'auto' } });
    const result = await manager.generateBranchName({
      description: 'x',
      repoName: 'r',
      branchPrefix: 'feat',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('claude broke');
    expect(result.provider).toBe('claude');
  });

  it('preserves explicit-fallback behaviour for non-auto provider + fallback config', async () => {
    const claudeProvider = mockProvider('claude', true, {
      success: false,
      error: 'API error',
      provider: 'claude',
    });
    const geminiProvider = mockProvider('gemini', true, {
      success: true,
      content: 'fallback-branch',
      provider: 'gemini',
    });
    vi.mocked(ClaudeProvider).mockImplementation(
      () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
    );
    vi.mocked(GeminiProvider).mockImplementation(
      () => geminiProvider as unknown as InstanceType<typeof GeminiProvider>
    );

    const manager = new AIProviderManager({
      config: { provider: 'claude', fallback: 'gemini' },
    });
    const result = await manager.generateBranchName({
      description: 'x',
      repoName: 'r',
      branchPrefix: 'feat',
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe('fallback-branch');
  });
});

describe('table-driven auto selection', () => {
  const CASES: Array<{
    name: string;
    available: Record<'openai' | 'claude' | 'gemini-api' | 'ollama', boolean>;
    expectedWinner: string | null;
  }> = [
    {
      name: 'all available -> codex wins',
      available: { openai: true, claude: true, 'gemini-api': true, ollama: true },
      expectedWinner: 'codex',
    },
    {
      name: 'codex down -> claude wins',
      available: { openai: false, claude: true, 'gemini-api': true, ollama: true },
      expectedWinner: 'claude',
    },
    {
      name: 'codex+claude down -> gemini-api wins',
      available: { openai: false, claude: false, 'gemini-api': true, ollama: true },
      expectedWinner: 'gemini-api',
    },
    {
      name: 'only ollama available -> ollama wins',
      available: { openai: false, claude: false, 'gemini-api': false, ollama: true },
      expectedWinner: 'ollama',
    },
    {
      name: 'nothing available -> no winner',
      available: { openai: false, claude: false, 'gemini-api': false, ollama: false },
      expectedWinner: null,
    },
  ];

  it.each(CASES)('$name', async ({ available, expectedWinner }) => {
    (OpenAIProvider as unknown as { checkAvailability: () => Promise<boolean> }).checkAvailability =
      vi.fn().mockResolvedValue(available.openai);
    (ClaudeProvider as unknown as { checkAvailability: () => Promise<boolean> }).checkAvailability =
      vi.fn().mockResolvedValue(available.claude);
    (
      GeminiAPIProvider as unknown as { checkAvailability: () => Promise<boolean> }
    ).checkAvailability = vi.fn().mockResolvedValue(available['gemini-api']);
    (OllamaProvider as unknown as { checkAvailability: () => Promise<boolean> }).checkAvailability =
      vi.fn().mockResolvedValue(available.ollama);

    if (available.openai) {
      vi.mocked(OpenAIProvider).mockImplementation(
        () => mockProvider('codex', true) as unknown as InstanceType<typeof OpenAIProvider>
      );
    }
    if (available.claude) {
      vi.mocked(ClaudeProvider).mockImplementation(
        () => mockProvider('claude', true) as unknown as InstanceType<typeof ClaudeProvider>
      );
    }
    if (available['gemini-api']) {
      vi.mocked(GeminiAPIProvider).mockImplementation(
        () => mockProvider('gemini-api', true) as unknown as InstanceType<typeof GeminiAPIProvider>
      );
    }
    if (available.ollama) {
      vi.mocked(OllamaProvider).mockImplementation(
        () => mockProvider('ollama', true) as unknown as InstanceType<typeof OllamaProvider>
      );
    }

    const manager = new AIProviderManager({ config: { provider: 'auto' } });
    await manager.initialize();
    const winner = expectedWinner === null ? 'fallback' : await manager.getActiveProviderName();
    expect(winner).toBe(expectedWinner ?? 'fallback');
  });
});
```

- [ ] **Step 2: Run and confirm the rewritten and new tests fail.**

- [ ] **Step 3: Implement** — in `provider-manager.ts`

```ts
import { resolveProviderModel, resolveProviderTimeout } from './config-resolvers.js';
import { DEFAULT_AI_PROVIDER_PRIORITY } from './types.js';
```

Give every factory a resolved model + timeout, then add the chain logic:

```ts
  private autoChain: AIProvider[] = [];

  /** Factories in the order `auto` should try them: config override, else subscription-first default. */
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
```

- [ ] **Step 4: Run, see everything pass, commit**

```bash
pnpm exec vitest run src/lib/ai/provider-manager.test.ts
pnpm exec prettier --write src/lib/ai/provider-manager.ts src/lib/ai/provider-manager.test.ts
git add src/lib/ai/provider-manager.ts src/lib/ai/provider-manager.test.ts
git commit -m "fix(ai): subscription-first priority order, full auto-chain fallthrough on failure"
```

---

### Task 6 — Validate the new config fields

**Files:** modify `src/lib/config-validation.ts`, `src/lib/config-validation.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it('accepts a valid ai.providerPriority list', () => {
  expect(validateConfig({ ai: { providerPriority: ['openai', 'claude', 'ollama'] } }).valid).toBe(
    true
  );
});

it('rejects an unknown provider name inside ai.providerPriority', () => {
  const result = validateConfig({ ai: { providerPriority: ['openai', 'not-a-provider'] } });
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.path === 'ai.providerPriority')).toBe(true);
});

it('rejects a non-array ai.providerPriority', () => {
  expect(validateConfig({ ai: { providerPriority: 'openai' as unknown as string[] } }).valid).toBe(
    false
  );
});

it('rejects a non-numeric ai.timeout', () => {
  const result = validateConfig({ ai: { timeout: 'fast' as unknown as number } });
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => e.path === 'ai.timeout')).toBe(true);
});

it('accepts a numeric ai.timeout', () => {
  expect(validateConfig({ ai: { timeout: 30_000 } }).valid).toBe(true);
});
```

- [ ] **Step 2: Run and see it fail** — both currently return `valid: true`.

- [ ] **Step 3: Implement** — inside the existing `if (config.ai !== undefined)` block, reusing the `VALID_AI_PROVIDERS` constant already used for `ai.provider`/`ai.fallback` (read the file to confirm its exact name before editing):

```ts
if (config.ai.providerPriority !== undefined) {
  if (!Array.isArray(config.ai.providerPriority)) {
    errors.push({ path: 'ai.providerPriority', message: 'Must be an array' });
  } else {
    const invalid = config.ai.providerPriority.filter((p) => !VALID_AI_PROVIDERS.includes(p));
    if (invalid.length > 0) {
      errors.push({
        path: 'ai.providerPriority',
        message: `Unknown provider(s): ${invalid.join(', ')}. Must be one of: ${VALID_AI_PROVIDERS.join(', ')}`,
      });
    }
  }
}

if (config.ai.timeout !== undefined && typeof config.ai.timeout !== 'number') {
  errors.push({ path: 'ai.timeout', message: 'Must be a number (milliseconds)' });
}
```

- [ ] **Step 4: Run, see it pass, commit**

```bash
pnpm exec prettier --write src/lib/config-validation.ts src/lib/config-validation.test.ts
git add src/lib/config-validation.ts src/lib/config-validation.test.ts
git commit -m "feat(config): validate ai.providerPriority and ai.timeout"
```

---

### Task 7 — Mirror the new fields into the JSON schema

`AIConfig` has `"additionalProperties": false`, so without this the new keys are reported invalid by schema-aware tooling.

**Files:** modify `schemas/worktreerc.schema.json`, `src/lib/schema.test.ts`.

**Merge-conflict note:** Part 4 also edits this file. Keep both property sets when resolving.

- [ ] **Step 1: Write the failing tests**

```ts
it('AIConfig documents providerPriority, timeout, providers and models', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const aiProps = schema.definitions.AIConfig.properties;

  expect(aiProps.providerPriority).toBeDefined();
  expect(aiProps.providerPriority.type).toBe('array');
  expect(aiProps.timeout).toBeDefined();
  expect(aiProps.timeout.type).toBe('number');
  expect(aiProps.providers).toBeDefined();
  expect(aiProps.models).toBeDefined();
});

it('a .worktreerc using the new ai fields validates against the schema', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  expect(
    validate({
      ai: {
        provider: 'auto',
        providerPriority: ['openai', 'claude', 'gemini-api', 'ollama'],
        timeout: 45_000,
        providers: { openai: { timeout: 30_000 } },
        models: { claude: 'claude-opus-4-6' },
      },
    })
  ).toBe(true);
});
```

- [ ] **Step 2: Run and see it fail** — `additionalProperties: false` rejects every new key.

- [ ] **Step 3: Implement** — add to `definitions.AIConfig.properties`

```json
"providerPriority": {
  "type": "array",
  "items": {
    "type": "string",
    "enum": ["auto", "claude", "gemini", "gemini-api", "openai", "ollama", "script", "fallback", "none"]
  },
  "description": "Ordered provider names to try when provider is 'auto'. Default: [\"openai\", \"claude\", \"gemini-api\", \"ollama\"] (subscription-first; 'openai' is the codex CLI)."
},
"timeout": {
  "type": "number",
  "description": "Default per-generation timeout in milliseconds for every provider unless overridden. Default: 60000."
},
"providers": {
  "type": "object",
  "description": "Per-provider overrides, keyed by provider name.",
  "additionalProperties": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "timeout": { "type": "number", "description": "Per-provider timeout override in milliseconds." }
    }
  }
},
"models": {
  "type": "object",
  "description": "Per-provider model override, keyed by provider name. Takes precedence over the legacy claude.model / gemini.model / openai.model fields.",
  "additionalProperties": { "type": "string" }
}
```

- [ ] **Step 4: Run, see it pass, commit**

```bash
pnpm exec prettier --write schemas/worktreerc.schema.json src/lib/schema.test.ts
git add schemas/worktreerc.schema.json src/lib/schema.test.ts
git commit -m "feat(schema): document ai.providerPriority/timeout/providers/models"
```

---

### Task 8 — `doctor.ts`: diagnostic types + `pickAutoProvider()`

Build the table-driven-testable core before any real probe.

**Files:** create `src/lib/ai/doctor.ts`, `src/lib/ai/doctor.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { pickAutoProvider, type ProviderDiagnostic } from './doctor.js';

function diag(name: string, overrides: Partial<ProviderDiagnostic> = {}): ProviderDiagnostic {
  return {
    name,
    displayName: name,
    installed: true,
    authenticated: true,
    reachable: true,
    model: undefined,
    timeoutMs: 60_000,
    error: undefined,
    ...overrides,
  };
}

describe('pickAutoProvider', () => {
  it('picks the first provider in priority order that is installed', () => {
    const result = pickAutoProvider([diag('openai'), diag('claude')], ['openai', 'claude']);
    expect(result.selected).toBe('openai');
    expect(result.reason).toContain('installed');
  });

  it('skips a provider that is not installed', () => {
    const result = pickAutoProvider(
      [diag('openai', { installed: false }), diag('claude')],
      ['openai', 'claude']
    );
    expect(result.selected).toBe('claude');
  });

  it('skips a provider whose authenticated check explicitly failed', () => {
    const result = pickAutoProvider(
      [diag('gemini-api', { authenticated: false }), diag('ollama')],
      ['gemini-api', 'ollama']
    );
    expect(result.selected).toBe('ollama');
  });

  it('does NOT skip a provider whose authenticated check is merely "unknown"', () => {
    // Mirrors the manager's cheap-availability semantics on purpose.
    const result = pickAutoProvider([diag('claude', { authenticated: 'unknown' })], ['claude']);
    expect(result.selected).toBe('claude');
  });

  it('returns null with a reason when nothing is installed', () => {
    const result = pickAutoProvider(
      [diag('openai', { installed: false }), diag('claude', { installed: false })],
      ['openai', 'claude']
    );
    expect(result.selected).toBeNull();
    expect(result.reason).toContain('no provider');
  });

  it('flags a selected-but-unreachable provider (the GEMINI_API_KEY bug, reproduced)', () => {
    const result = pickAutoProvider(
      [
        diag('gemini-api', {
          authenticated: true,
          reachable: false,
          error: 'HTTP 400: API_KEY_INVALID',
        }),
      ],
      ['gemini-api']
    );

    expect(result.selected).toBe('gemini-api');
    expect(result.warning).toContain('API_KEY_INVALID');
  });

  it('ignores priority entries with no matching diagnostic', () => {
    const result = pickAutoProvider([diag('claude')], ['openai', 'claude']);
    expect(result.selected).toBe('claude');
  });
});
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement** — `src/lib/ai/doctor.ts` (types + pure function only)

```ts
/**
 * `wt ai doctor` diagnostics.
 *
 * Split deliberately: the pure `pickAutoProvider()` mirrors what
 * AIProviderManager does at runtime (cheap availability check, not a live
 * probe) so the two cannot drift. The live-probe layer is separate.
 */

export interface ProviderDiagnostic {
  /** Config-facing identifier (e.g. 'openai'). */
  name: string;
  /** Human-facing label (e.g. 'codex'). */
  displayName: string;
  installed: boolean;
  authenticated: boolean | 'unknown';
  reachable: boolean | 'unknown';
  model: string | undefined;
  timeoutMs: number;
  /** Reachability failure detail, e.g. "HTTP 400: API_KEY_INVALID". */
  error?: string;
}

export interface AutoSelection {
  selected: string | null;
  reason: string;
  /** Set when the selected provider fails a deeper check than selection uses. */
  warning?: string;
}

/**
 * What `auto` would select given cheap availability data (installed +
 * authenticated !== false) — matching AIProviderManager.buildAutoChain()'s
 * criterion exactly, on purpose.
 */
export function pickAutoProvider(
  diagnostics: ProviderDiagnostic[],
  priority: string[]
): AutoSelection {
  const byName = new Map(diagnostics.map((d) => [d.name, d]));

  for (const name of priority) {
    const d = byName.get(name);
    if (!d) continue;
    if (!d.installed) continue;
    if (d.authenticated === false) continue;

    const warning =
      d.reachable === false
        ? `${d.displayName} is selected by auto, but a live reachability probe failed: ${d.error ?? 'unknown reason'}`
        : undefined;

    return {
      selected: d.name,
      reason: `${d.displayName} is installed${d.authenticated === true ? ' and authenticated' : ''}, first in priority order`,
      warning,
    };
  }

  return {
    selected: null,
    reason: 'no provider in the priority list is installed and authenticated',
  };
}
```

- [ ] **Step 4: Run, see it pass, commit**

```bash
pnpm exec prettier --write src/lib/ai/doctor.ts src/lib/ai/doctor.test.ts
git add src/lib/ai/doctor.ts src/lib/ai/doctor.test.ts
git commit -m "feat(ai): pickAutoProvider pure selection function for wt ai doctor"
```

---

### Task 9 — Real per-provider probes (all mocked in tests)

**Design note recorded during planning:** `codex login status` is a real, free, quota-free auth check (verified on this machine: prints "Logged in using ChatGPT"). **`claude` has no equivalent** — so `authenticated` stays `'unknown'` for claude unless a live probe runs. That is deliberate honesty rather than guessing from a credentials-file heuristic, which would be wrong on macOS where auth lives in the Keychain.

`--offline` skips every live call, which is what makes this testable without spending quota. Ollama's `/api/tags` is free and local, so it always runs.

**Files:** modify `src/lib/ai/doctor.ts`, `src/lib/ai/doctor.test.ts`.

- [ ] **Step 1: Write the failing tests** — mock `spawnSync` and `fetch`; assert the mapping from raw output to `installed`/`authenticated`/`reachable`/`error`. Cover, per provider: not installed; authenticated true/false; offline mode makes no live call; non-offline maps a real failure (for gemini-api, the HTTP 400 `API_KEY_INVALID` body) into `reachable: false` with the reason in `error`.

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement** — add to `doctor.ts`

```ts
export interface ProbeOptions {
  /** Skip every live network/subprocess reachability call. */
  offline: boolean;
}

function commandInstalled(cmd: string): boolean {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
  return result.status === 0;
}

export async function probeCodex(options: ProbeOptions): Promise<Partial<ProviderDiagnostic>> {
  const installed = commandInstalled('codex');
  if (!installed) {
    return { installed: false, authenticated: 'unknown', reachable: 'unknown' };
  }

  // `codex login status` is a free, local, quota-free REAL check — distinct
  // from `reachable`, which proves auth + network + model actually answer.
  const statusResult = spawnSync('codex', ['login', 'status'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  const authenticated =
    statusResult.status === 0 && !/not logged in/i.test(statusResult.stdout ?? '');

  if (options.offline || !authenticated) {
    return { installed: true, authenticated, reachable: 'unknown' };
  }

  const outputFile = path.join(
    os.tmpdir(),
    `gwt-doctor-codex-${process.pid}-${crypto.randomBytes(6).toString('hex')}.txt`
  );
  try {
    const result = spawnSync(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '--color',
        'never',
        '--output-last-message',
        outputFile,
        'Reply with exactly: OK',
      ],
      { encoding: 'utf-8', timeout: 20_000 }
    );
    const output = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf-8').trim() : '';
    const reachable = result.status === 0 && output.length > 0;
    return {
      installed: true,
      authenticated,
      reachable,
      error: reachable ? undefined : result.stderr || 'no output',
    };
  } catch (error) {
    return {
      installed: true,
      authenticated,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      if (fs.existsSync(outputFile)) fs.rmSync(outputFile, { force: true });
    } catch {
      // best effort
    }
  }
}

export async function probeClaude(options: ProbeOptions): Promise<Partial<ProviderDiagnostic>> {
  const installed = commandInstalled('claude');
  if (!installed) {
    return { installed: false, authenticated: 'unknown', reachable: 'unknown' };
  }

  // No free `claude auth status` equivalent exists, so stay honest.
  if (options.offline) {
    return { installed: true, authenticated: 'unknown', reachable: 'unknown' };
  }

  const result = spawnSync('claude', ['-p', 'Reply with exactly: OK'], {
    encoding: 'utf-8',
    timeout: 20_000,
  });
  const reachable = result.status === 0 && Boolean(result.stdout?.trim());
  return {
    installed: true,
    authenticated: reachable ? true : 'unknown',
    reachable,
    error: reachable ? undefined : result.stderr || 'no output',
  };
}

export async function probeGeminiApi(options: ProbeOptions): Promise<Partial<ProviderDiagnostic>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { installed: true, authenticated: false, reachable: 'unknown' };
  }
  if (options.offline) {
    return { installed: true, authenticated: true, reachable: 'unknown' };
  }

  // The probe this task exists for: catches an invalid key as HTTP 400
  // API_KEY_INVALID instead of Boolean(env) reporting "available".
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }] }),
      }
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { reason?: string; message?: string };
      };
      const reason = body?.error?.reason ?? `HTTP ${response.status}`;
      return {
        installed: true,
        authenticated: true,
        reachable: false,
        error: `${reason}: ${body?.error?.message ?? 'request failed'}`,
      };
    }

    return { installed: true, authenticated: true, reachable: true };
  } catch (error) {
    return {
      installed: true,
      authenticated: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function probeOllama(
  _options: ProbeOptions,
  host = 'http://localhost:11434'
): Promise<Partial<ProviderDiagnostic>> {
  // Free and local — always runs, even offline.
  const result = spawnSync('curl', ['-s', `${host}/api/tags`], {
    encoding: 'utf-8',
    timeout: 5_000,
  });
  const reachable = result.status === 0;
  return { installed: reachable, authenticated: true, reachable };
}
```

- [ ] **Step 4: Run, see it pass, commit**

```bash
pnpm exec prettier --write src/lib/ai/doctor.ts src/lib/ai/doctor.test.ts
git add src/lib/ai/doctor.ts src/lib/ai/doctor.test.ts
git commit -m "feat(ai): real per-provider reachability probes for wt ai doctor"
```

---

### Task 10 — `runDiagnostics()` in its own module

**Why a separate file:** `vi.mock('./doctor.js')` does not intercept same-module internal calls, so `runDiagnostics` must live outside `doctor.ts` for its test to mock the probes cleanly.

**Files:** create `src/lib/ai/doctor-report.ts`, `src/lib/ai/doctor-report.test.ts`.

- [ ] **Step 1: Write the failing tests** — `doctor-report.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import type { AIConfig } from './types.js';

vi.mock('./doctor.js', () => ({
  probeCodex: vi.fn(),
  probeClaude: vi.fn(),
  probeGeminiApi: vi.fn(),
  probeOllama: vi.fn(),
  pickAutoProvider: vi.fn(),
}));

import {
  probeCodex,
  probeClaude,
  probeGeminiApi,
  probeOllama,
  pickAutoProvider,
} from './doctor.js';
import { runDiagnostics } from './doctor-report.js';

function mockAllProbes() {
  vi.mocked(probeCodex).mockResolvedValue({
    installed: true,
    authenticated: true,
    reachable: true,
  });
  vi.mocked(probeClaude).mockResolvedValue({
    installed: true,
    authenticated: 'unknown',
    reachable: 'unknown',
  });
  vi.mocked(probeGeminiApi).mockResolvedValue({
    installed: true,
    authenticated: false,
    reachable: 'unknown',
  });
  vi.mocked(probeOllama).mockResolvedValue({
    installed: false,
    authenticated: true,
    reachable: false,
  });
}

describe('runDiagnostics', () => {
  it('assembles one diagnostic per provider, in default priority order', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'openai', reason: 'first available' });

    const report = await runDiagnostics({ provider: 'auto' }, { offline: true });

    expect(report.providers.map((p) => p.name)).toEqual([
      'openai',
      'claude',
      'gemini-api',
      'ollama',
    ]);
    expect(report.providers[0].displayName).toBe('codex');
    expect(report.selected).toBe('openai');
  });

  it('passes the configured model and timeout into each diagnostic', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'openai', reason: 'x' });

    const config: AIConfig = {
      provider: 'auto',
      models: { openai: 'gpt-5.6-codex' },
      timeout: 12_000,
    };
    const report = await runDiagnostics(config, { offline: true });

    const codexDiag = report.providers.find((p) => p.name === 'openai')!;
    expect(codexDiag.model).toBe('gpt-5.6-codex');
    expect(codexDiag.timeoutMs).toBe(12_000);
  });

  it('honours ai.providerPriority for ordering and for pickAutoProvider input', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'claude', reason: 'x' });

    await runDiagnostics(
      { provider: 'auto', providerPriority: ['claude', 'openai'] },
      {
        offline: true,
      }
    );

    const [, priorityArg] = vi.mocked(pickAutoProvider).mock.calls[0];
    expect(priorityArg).toEqual(['claude', 'openai']);
  });

  it('surfaces a non-auto configured mode', async () => {
    mockAllProbes();
    vi.mocked(pickAutoProvider).mockReturnValue({ selected: 'claude', reason: 'configured' });

    const report = await runDiagnostics({ provider: 'claude' }, { offline: true });
    expect(report.configuredMode).toBe('claude');
  });
});
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement** — `src/lib/ai/doctor-report.ts`

```ts
import type { AIConfig, AIProviderName } from './types.js';
import { DEFAULT_AI_PROVIDER_PRIORITY } from './types.js';
import { resolveProviderModel, resolveProviderTimeout } from './config-resolvers.js';
import {
  probeCodex,
  probeClaude,
  probeGeminiApi,
  probeOllama,
  pickAutoProvider,
  type ProviderDiagnostic,
  type ProbeOptions,
} from './doctor.js';

export interface AiDoctorReport {
  configuredMode: AIProviderName;
  providers: ProviderDiagnostic[];
  selected: string | null;
  selectionReason: string;
  selectionWarning?: string;
}

const PROBES: Record<
  string,
  {
    displayName: string;
    probe: (options: ProbeOptions) => Promise<Partial<ProviderDiagnostic>>;
    fallbackTimeout?: number;
  }
> = {
  openai: { displayName: 'codex', probe: probeCodex },
  claude: { displayName: 'claude', probe: probeClaude },
  'gemini-api': { displayName: 'gemini-api', probe: probeGeminiApi },
  ollama: { displayName: 'ollama', probe: probeOllama, fallbackTimeout: 120_000 },
};

export async function runDiagnostics(
  config: AIConfig,
  options: ProbeOptions
): Promise<AiDoctorReport> {
  const priority = config.providerPriority ?? DEFAULT_AI_PROVIDER_PRIORITY;

  const providers: ProviderDiagnostic[] = [];
  for (const name of priority) {
    const spec = PROBES[name];
    if (!spec) continue; // e.g. the 'gemini' CLI or 'script' — no probe defined yet

    const partial = await spec.probe(options);
    providers.push({
      name,
      displayName: spec.displayName,
      installed: partial.installed ?? false,
      authenticated: partial.authenticated ?? 'unknown',
      reachable: partial.reachable ?? 'unknown',
      model: resolveProviderModel(config, name),
      timeoutMs: resolveProviderTimeout(config, name, spec.fallbackTimeout),
      error: partial.error,
    });
  }

  const selection = pickAutoProvider(providers, priority);

  return {
    configuredMode: config.provider ?? 'auto',
    providers,
    selected: selection.selected,
    selectionReason: selection.reason,
    selectionWarning: selection.warning,
  };
}
```

- [ ] **Step 4: Run, see it pass, commit**

```bash
pnpm exec prettier --write src/lib/ai/doctor-report.ts src/lib/ai/doctor-report.test.ts
git add src/lib/ai/doctor-report.ts src/lib/ai/doctor-report.test.ts
git commit -m "feat(ai): assemble wt ai doctor report from probes + pickAutoProvider"
```

---

### Task 11 — `wt ai doctor` CLI command

**Files:** create `src/cli/wt/ai.ts`, `src/cli/wt/ai.test.ts`; modify `src/cli/wt.ts`, `src/cli/wt.unit.test.ts`.

- [ ] **Step 1: Write the failing tests** — `src/cli/wt/ai.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/ai/doctor-report.js', () => ({ runDiagnostics: vi.fn() }));
vi.mock('../../lib/config.js', () => ({ loadConfig: vi.fn() }));
vi.mock('../../lib/git.js', () => ({ getRepoRoot: vi.fn(() => '/repo') }));

import { runDiagnostics } from '../../lib/ai/doctor-report.js';
import { loadConfig } from '../../lib/config.js';
import { aiCommand } from './ai.js';

const FAKE_REPORT = {
  configuredMode: 'auto',
  providers: [
    {
      name: 'openai',
      displayName: 'codex',
      installed: true,
      authenticated: true,
      reachable: true,
      model: undefined,
      timeoutMs: 60000,
    },
    {
      name: 'gemini-api',
      displayName: 'gemini-api',
      installed: true,
      authenticated: true,
      reachable: false,
      model: undefined,
      timeoutMs: 60000,
      error: 'API_KEY_INVALID: API key not valid.',
    },
  ],
  selected: 'openai',
  selectionReason: 'codex is installed and authenticated, first in priority order',
};

describe('wt ai doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockReturnValue({ ai: { provider: 'auto' } } as never);
    vi.mocked(runDiagnostics).mockResolvedValue(FAKE_REPORT as never);
  });

  it('prints JSON with --json and does not exit 1', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'doctor',
      json: true,
    });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.success).toBe(true);
    expect(output.data.selected).toBe('openai');
    expect(exitSpy).not.toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes --offline through to runDiagnostics', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'doctor',
      json: true,
      offline: true,
    });
    expect(runDiagnostics).toHaveBeenCalledWith(expect.anything(), { offline: true });
  });

  it('defaults offline to false', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'doctor',
      json: true,
    });
    expect(runDiagnostics).toHaveBeenCalledWith(expect.anything(), { offline: false });
  });

  it('exits 1 with INVALID_ARGUMENT on an unknown subcommand', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await (aiCommand.handler as (argv: unknown) => Promise<void>)({
      subcommand: 'bogus',
      json: true,
    });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.success).toBe(false);
    expect(output.error.code).toBe('INVALID_ARGUMENT');
    expect(exitSpy).toHaveBeenCalledWith(1);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement** — `src/cli/wt/ai.ts`, positional-subcommand style matching `wt/link.ts` and `wt/config.ts`

```ts
/**
 * wt ai - AI provider diagnostics
 */
import type { CommandModule } from 'yargs';
import * as git from '../../lib/git.js';
import { loadConfig } from '../../lib/config.js';
import { runDiagnostics } from '../../lib/ai/doctor-report.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
} from '../../lib/json-output.js';
import { setJsonMode, print, printDim, printStatus, printError } from '../../lib/ui/index.js';

interface AiArgs {
  subcommand?: string;
  json?: boolean;
  offline?: boolean;
}

function repoRootOrUndefined(): string | undefined {
  try {
    return git.getRepoRoot();
  } catch {
    return undefined;
  }
}

async function runDoctor(argv: AiArgs): Promise<void> {
  const json = Boolean(argv.json);
  const offline = Boolean(argv.offline);
  setJsonMode(json);

  const config = loadConfig(repoRootOrUndefined());
  const report = await runDiagnostics(config.ai, { offline });

  if (json) {
    console.log(formatJsonResult(createSuccessResult('wt ai doctor', report)));
    return;
  }

  print(`AI provider diagnostics (mode: ${report.configuredMode}${offline ? ', offline' : ''})`);
  for (const p of report.providers) {
    const mark = p.name === report.selected ? '→' : ' ';
    printStatus(p.installed ? 'info' : 'warning', `${mark} ${p.displayName}`);
    printDim(
      `    installed: ${p.installed}  authenticated: ${p.authenticated}  reachable: ${p.reachable}`
    );
    if (p.model) printDim(`    model: ${p.model}`);
    printDim(`    timeout: ${p.timeoutMs}ms`);
    if (p.error) printDim(`    error: ${p.error}`);
  }
  print('');
  print(`auto would select: ${report.selected ?? '(none — falls back to template content)'}`);
  printDim(report.selectionReason);
  if (report.selectionWarning) {
    printStatus('warning', report.selectionWarning);
  }
}

export const aiCommand: CommandModule<object, AiArgs> = {
  command: ['ai [subcommand]'],
  describe: 'AI provider diagnostics (wt ai doctor)',
  builder: (yargs) =>
    yargs
      .positional('subcommand', { describe: 'Subcommand: doctor', type: 'string' })
      .option('json', { type: 'boolean', description: 'Output as JSON', default: false })
      .option('offline', {
        type: 'boolean',
        description: 'Skip live reachability probes (no quota spent)',
        default: false,
      })
      .example('$0 ai doctor', 'Show provider diagnostics and what auto would select')
      .example('$0 ai doctor --json', 'JSON output for AI agents')
      .example('$0 ai doctor --offline', 'Skip live probes (fast, no quota spent)'),
  handler: async (argv) => {
    const json = Boolean(argv.json);
    try {
      if (argv.subcommand !== 'doctor') {
        const message = `Unknown ai subcommand: ${argv.subcommand ?? '(none)'}. Try: wt ai doctor`;
        if (json) {
          console.log(
            formatJsonResult(createErrorResult('wt ai', ErrorCode.INVALID_ARGUMENT, message))
          );
        } else {
          printError({ title: message });
        }
        process.exit(1);
        return;
      }

      await runDoctor(argv);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (json) {
        console.log(
          formatJsonResult(createErrorResult('wt ai', ErrorCode.OPERATION_FAILED, message))
        );
      } else {
        printError({ title: message });
      }
      process.exit(1);
    }
  },
};
```

- [ ] **Step 4: Register the command** — in `src/cli/wt.ts` add `import { aiCommand } from './wt/ai.js';`, `.command(aiCommand)`, and `.example('wt ai doctor', 'Diagnose AI provider availability')`. Update `src/cli/wt.unit.test.ts`'s registration assertions to include `ai`.

- [ ] **Step 5: Run, see it pass, commit**

```bash
pnpm exec vitest run src/cli/wt/ai.test.ts src/cli/wt.unit.test.ts
pnpm exec prettier --write src/cli/wt/ai.ts src/cli/wt/ai.test.ts src/cli/wt.ts src/cli/wt.unit.test.ts
git add src/cli/wt/ai.ts src/cli/wt/ai.test.ts src/cli/wt.ts src/cli/wt.unit.test.ts
git commit -m "feat(cli): add wt ai doctor command"
```

---

### Task 12 — Full-suite verification gate (no commit)

- [ ] **Step 1:** `pnpm run build` — must succeed.
- [ ] **Step 2:** `pnpm test` — compare against the documented baseline of **14 tests / 4 files**. Exit criterion: exactly those 14, nothing new. If `config.test.ts` shows more than its baseline 4, that is this plan's regression, not a pre-existing one.
- [ ] **Step 3:** `pnpm exec vitest run src/lib/newpr/pr-content.test.ts` — confirm both invariant matrices still pass. This is the file this plan must never touch; this is the evidence, not the assumption.
- [ ] **Step 4:** `pnpm run lint`.
- [ ] **Step 5:** Manual smoke, real machine, real providers: `node dist/cli/wt.js ai doctor --json` should report `gemini-api` as installed+authenticated but **not reachable**, with `API_KEY_INVALID` in its `error`, and `auto` selecting codex or claude. This is the spec's §1.1 incident, now diagnosable in one command. Paste the output into the PR description.

---

## Compatibility notes for the PR description

- `ai.provider: "openai"` (the codex CLI) keeps working exactly as configured — no migration needed. Its display name was already `codex`.
- **Behaviour change for existing `auto` users:** codex/claude now win over `gemini-api` by default. That is the point of this part, but call it out explicitly per the spec's §8 rollout note, since it changes which model actually runs.
- `ai.claude.model` / `ai.gemini.model` / `ai.openai.model` keep working; `ai.models.<provider>` is additive and wins when both are set.
- Nothing in Part 1 is touched.

## Deferred follow-ups

- Rename the `'openai'` config identifier to `'codex'` for full consistency (touches `config-validation.ts`, `config-editor.ts`, `wtconfig/config-manager.ts`; needs a migration path).
- Use `codex exec --output-schema` to constrain title/branch-name responses to a JSON Schema.
- Add doctor probes for the `gemini` CLI and `script` providers.
