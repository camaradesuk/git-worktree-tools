# Agent-Supplied PR Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a caller pass an exact PR title and body to `wt new`, and report back which source each field came from.

**Architecture:** A new focused module `src/lib/newpr/pr-content.ts` owns all content resolution — reading `--body-file`, validating mutually exclusive flags, and applying per-field precedence over the existing AI generation path. `src/cli/wt/new.ts` gains four flags that populate `Options`; `src/cli/newpr.ts` calls the resolver at its two PR-creation sites instead of inlining title/body decisions. Provenance travels out through `NewprResultData` in the JSON envelope.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), yargs, vitest, pnpm.

## Global Constraints

- Package is ESM (`"type": "module"`). **All relative imports must end in `.js`**, even when the source file is `.ts`.
- Node ≥ 18. No new runtime dependencies.
- Test framework is vitest with tests colocated as `*.test.ts` beside the source file.
- Coverage thresholds are 80% statements/branches/functions/lines over `src/lib/**` and `src/cli/**`. Per `CLAUDE.md`: never exclude a file from coverage to make a check pass — write real tests, mocking interactive and external pieces.
- **Do not name any new flag with a `--no-` prefix.** yargs boolean-negation collides with `.strict()` in this CLI, which is why `--no-hooks`, `--no-wtlink`, and `--no-plan` are currently rejected as `Unknown argument`. The new skip flag is `--skip-ai`.
- **Commit normally — do NOT use `--no-verify`.** The 13 pre-existing unformatted files were fixed in commit `d38f622`, so the pre-commit hook (`tsc --noEmit`, repo-wide `prettier --check .`, then lint-staged) now passes. **Always run `pnpm exec prettier --write` on the files you touched** before committing, so the repo-wide check stays green.
- Existing behaviour must be preserved when none of the new flags are passed.
- **Known-failing test baseline on this machine: 14 tests across 4 files.** These fail on pristine `HEAD` too — they are NOT your responsibility and must NOT be "fixed":
  - `src/lib/config.test.ts` — 4 failures
  - `src/lib/prs/actions.test.ts` — 1 failure
  - `src/e2e/newpr-full-flow.e2e.test.ts` — 6 failures
  - `src/e2e/newpr/scenarios.e2e.test.ts` — 3 failures

  **Cause:** the suite is not hermetic — `loadConfig` reads the developer's real global config at `~/.config/git-worktree-tools/config.json`, which on this machine sets `ai.provider: "claude"`, `worktreePattern: "pr{number}.{slug}"`, and `worktreeParent: ".worktrees"`. Tests asserting built-in defaults therefore see the developer's values. CI has no global config, so it passes there.

  **Your task succeeds if it introduces no NEW failures beyond these 14.** Compare against the baseline; do not report the baseline as your own failure.

- **`pnpm run build` must be run before any e2e test**, because the e2e suite executes the compiled CLI from `dist/`. Without it, ~170 e2e tests fail spuriously.

---

## File Structure

| File                                   | Responsibility                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib/newpr/pr-content.ts`          | **Create.** Content resolution: flag validation, `--body-file` reading, per-field precedence, provenance. |
| `src/lib/newpr/pr-content.test.ts`     | **Create.** Unit tests for the above.                                                                     |
| `src/lib/newpr/types.ts`               | **Modify.** Add the four content fields to `Options`.                                                     |
| `src/cli/wt/new.ts`                    | **Modify.** Declare the four yargs flags; map them into `Options`.                                        |
| `src/lib/config.ts`                    | **Modify.** Add `provider`/`error` to `PRGenerationResult`; stop the silent-failure return.               |
| `src/lib/json-output.ts`               | **Modify.** Add provenance fields to `NewprResultData`.                                                   |
| `src/cli/newpr.ts`                     | **Modify.** Call `resolvePRContent` at both PR-creation sites; emit provenance.                           |
| `docs/AI-TOOLING.md`, `README.md`      | **Modify.** Document the flags for agents and humans.                                                     |
| `~/.claude/skills/start-work/SKILL.md` | **Modify.** Compose and pass content. Outside the repo — not part of the PR.                              |

### Precedence rules this plan implements

Resolved **independently per field**:

```
default:      flag  →  AI  →  template
--force-ai:   AI    →  flag  →  template
--skip-ai:    flag  →  template
```

`--force-ai` inverting precedence is a decision this plan locks in: the spec says it "runs AI generation even when flags supply content", and running generation whose result is then discarded would be pointless. AI wins where it succeeds; flags fill in where it fails.

When both title and body come from flags and `--force-ai` is absent, **no LLM call is made**.

---

### Task 1: Content override reading and validation

**Files:**

- Create: `src/lib/newpr/pr-content.ts`
- Create: `src/lib/newpr/pr-content.test.ts`

**Interfaces:**

- Consumes: `WorktreeToolsError` from `src/lib/errors.ts:11`.
- Produces: `ContentSource`, `ContentOverrides`, `ResolvedPRContent`, `PRContentError`, `readBodyOverride(overrides: ContentOverrides): string | undefined`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/newpr/pr-content.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBodyOverride, PRContentError } from './pr-content.js';

describe('readBodyOverride', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-content-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when neither body nor bodyFile is given', () => {
    expect(readBodyOverride({})).toBeUndefined();
  });

  it('returns the inline body when only body is given', () => {
    expect(readBodyOverride({ body: 'hello' })).toBe('hello');
  });

  it('reads file contents when only bodyFile is given', () => {
    const file = path.join(tmpDir, 'body.md');
    fs.writeFileSync(file, '## Summary\n\nreal content\n');
    expect(readBodyOverride({ bodyFile: file })).toBe('## Summary\n\nreal content\n');
  });

  it('throws PRContentError when both body and bodyFile are given', () => {
    expect(() => readBodyOverride({ body: 'a', bodyFile: '/tmp/x.md' })).toThrow(PRContentError);
    expect(() => readBodyOverride({ body: 'a', bodyFile: '/tmp/x.md' })).toThrow(
      /mutually exclusive/i
    );
  });

  it('throws PRContentError when bodyFile cannot be read', () => {
    const missing = path.join(tmpDir, 'nope.md');
    expect(() => readBodyOverride({ bodyFile: missing })).toThrow(PRContentError);
    expect(() => readBodyOverride({ bodyFile: missing })).toThrow(/nope\.md/);
  });

  it('accepts an empty inline body as an intentional empty override', () => {
    expect(readBodyOverride({ body: '' })).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/newpr/pr-content.test.ts`
Expected: FAIL — cannot resolve `./pr-content.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/newpr/pr-content.ts`:

```typescript
/**
 * PR content resolution.
 *
 * Decides the final PR title and body from three possible sources —
 * caller-supplied flags, AI generation, and the built-in template — and
 * reports which source won for each field.
 */

import * as fs from 'fs';
import { WorktreeToolsError } from '../errors.js';

/** Where a resolved field's value came from. */
export type ContentSource = 'flag' | 'ai' | 'template';

/** Caller-supplied content options, straight from the CLI flags. */
export interface ContentOverrides {
  /** Exact PR title (--title) */
  title?: string;
  /** Exact PR body (--body) */
  body?: string;
  /** Path to a file holding the PR body (--body-file) */
  bodyFile?: string;
  /** Run AI generation even when flags supply content (--force-ai) */
  forceAi?: boolean;
  /** Skip AI generation entirely (--skip-ai) */
  skipAi?: boolean;
}

/** Fully resolved PR content plus provenance. */
export interface ResolvedPRContent {
  title: string;
  body: string;
  titleSource: ContentSource;
  bodySource: ContentSource;
  /** Provider that produced content, or null if AI did not contribute. */
  aiProvider: string | null;
  /** Why AI produced nothing, or null if it was not attempted or it succeeded. */
  aiError: string | null;
}

/** Raised when caller-supplied content flags are invalid or unreadable. */
export class PRContentError extends WorktreeToolsError {
  constructor(message: string) {
    super(message);
    this.name = 'PRContentError';
  }
}

/**
 * Resolve the body override from --body / --body-file.
 *
 * Returns undefined when the caller supplied neither. An empty string is a
 * meaningful value (an intentional empty body), so it is preserved.
 *
 * @throws PRContentError if both flags are given, or the file cannot be read.
 */
export function readBodyOverride(overrides: ContentOverrides): string | undefined {
  const { body, bodyFile } = overrides;

  if (body !== undefined && bodyFile !== undefined) {
    throw new PRContentError('--body and --body-file are mutually exclusive; pass only one.');
  }

  if (body !== undefined) {
    return body;
  }

  if (bodyFile !== undefined) {
    try {
      return fs.readFileSync(bodyFile, 'utf8');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new PRContentError(`Could not read --body-file '${bodyFile}': ${reason}`);
    }
  }

  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/newpr/pr-content.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Format and commit**

```bash
pnpm exec prettier --write src/lib/newpr/pr-content.ts src/lib/newpr/pr-content.test.ts
git add src/lib/newpr/pr-content.ts src/lib/newpr/pr-content.test.ts
git commit -m "feat(newpr): add PR content override reading and validation"
```

---

### Task 2: Per-field precedence resolution

**Files:**

- Modify: `src/lib/config.ts` (extend `PRGenerationResult`, remove the silent-failure return)
- Modify: `src/lib/newpr/pr-content.ts` (add `resolvePRContent`)
- Modify: `src/lib/newpr/pr-content.test.ts`

**Interfaces:**

- Consumes: `generatePRContentAsync(config, context)` from `src/lib/config.ts:880`; `ResolvedConfig` and `PRGenerationContext` from `src/lib/config.ts:855`.
- Produces: `resolvePRContent(params): Promise<ResolvedPRContent>` where `params` is
  `{ config: ResolvedConfig; context: PRGenerationContext; overrides: ContentOverrides; defaultBody: string; generate?: GenerateFn }`.
  `GenerateFn` is `(config: ResolvedConfig, context: PRGenerationContext) => Promise<PRGenerationResult>`, injectable so tests need not mock the module graph.

- [ ] **Step 1: Extend `PRGenerationResult` and stop the silent failure**

In `src/lib/config.ts`, replace the interface at line 869:

```typescript
export interface PRGenerationResult {
  title: string;
  description: string;
  aiGenerated: boolean;
  /** Provider that generated content, or null when AI did not contribute. */
  provider?: string | null;
  /** Why generation produced nothing, or null when not attempted / successful. */
  error?: string | null;
}
```

In `generatePRContentAsync`, change the `defaultResult` declaration (line 884) to include the new fields, and replace the silent tail so a failed attempt is always reported:

```typescript
const defaultResult: PRGenerationResult = {
  title: context.description,
  description: '',
  aiGenerated: false,
  provider: null,
  error: null,
};
```

Set the provider on the **success** return inside the `if (anyGenerated)` block — `providerName` is
already computed there for the status message, and dropping it leaves `aiProvider` reporting `null`
on every successful generation, which defeats the provenance this task exists to deliver:

```typescript
if (anyGenerated) {
  printStatus('info', `✨ AI-generated PR content (${providerName})`);
  return { title, description, aiGenerated: true, provider: providerName };
}
```

Then, immediately after that `if (anyGenerated) { ... }` block and before the `catch`, add:

```typescript
// A provider was attempted but produced nothing. Previously this
// returned defaultResult with no diagnostic at all.
return {
  ...defaultResult,
  error: `AI provider '${providerName}' returned no content`,
};
```

and in the existing `catch` block (line 943), replace `// Fall through to defaults on error` so it returns the reason rather than falling through:

```typescript
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      printStatus('warning', `⚠ AI generation failed: ${reason}`);
      return { ...defaultResult, error: reason };
    }
```

Add a regression test for the provider field in `src/lib/config.test.ts`, beside the existing
`generatePRContentAsync` AI tests: assert that on successful generation the returned `provider`
equals the provider name the mocked AI service reported. Without it, nothing in the suite catches
a dropped `provider` — the `resolvePRContent` tests inject the field explicitly and cannot detect it.

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/newpr/pr-content.test.ts`. Add `resolvePRContent` to the **existing**
import of `./pr-content.js` at the top of the file rather than adding a second import
statement, and add the type import beside it:

```typescript
// top of file: extend the existing import
import { readBodyOverride, resolvePRContent, PRContentError } from './pr-content.js';
import type { ResolvedConfig, PRGenerationResult, PRGenerationContext } from '../config.js';

// appended below the existing describe block:

const CONTEXT: PRGenerationContext = {
  description: 'add dark mode',
  branchName: 'feat/dark-mode',
  baseBranch: 'main',
  changedFiles: [],
  commitMessages: [],
};

const TEMPLATE = '## Summary\n\nadd dark mode\n';

/** Minimal config stub; only the `ai` branch is read by resolvePRContent. */
function configWithAi(provider: string): ResolvedConfig {
  return { ai: { provider } } as unknown as ResolvedConfig;
}

/** A generate() that must never be called. */
const neverGenerate = async (): Promise<PRGenerationResult> => {
  throw new Error('generate() should not have been called');
};

function generatorReturning(result: Partial<PRGenerationResult>) {
  const calls: number[] = [];
  const fn = async (): Promise<PRGenerationResult> => {
    calls.push(1);
    return {
      title: '',
      description: '',
      aiGenerated: false,
      provider: null,
      error: null,
      ...result,
    };
  };
  return { fn, calls };
}

describe('resolvePRContent', () => {
  it('uses both flags verbatim and never calls AI', async () => {
    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'feat: dark mode', body: 'real body' },
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.title).toBe('feat: dark mode');
    expect(result.body).toBe('real body');
    expect(result.titleSource).toBe('flag');
    expect(result.bodySource).toBe('flag');
    expect(result.aiProvider).toBeNull();
    expect(result.aiError).toBeNull();
  });

  it('fills only the missing field from AI when just --title is given', async () => {
    const { fn, calls } = generatorReturning({
      title: 'ai title',
      description: 'ai body',
      aiGenerated: true,
      provider: 'codex',
    });

    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'flag title' },
      defaultBody: TEMPLATE,
      generate: fn,
    });

    expect(calls).toHaveLength(1);
    expect(result.title).toBe('flag title');
    expect(result.titleSource).toBe('flag');
    expect(result.body).toBe('ai body');
    expect(result.bodySource).toBe('ai');
    expect(result.aiProvider).toBe('codex');
  });

  it('falls back to the template when AI produces nothing', async () => {
    const { fn } = generatorReturning({
      aiGenerated: false,
      error: "AI provider 'gemini-api' returned no content",
    });

    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: {},
      defaultBody: TEMPLATE,
      generate: fn,
    });

    expect(result.title).toBe('add dark mode');
    expect(result.titleSource).toBe('template');
    expect(result.body).toBe(TEMPLATE);
    expect(result.bodySource).toBe('template');
    expect(result.aiError).toBe("AI provider 'gemini-api' returned no content");
  });

  it('skips AI entirely with skipAi, using flags then template', async () => {
    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { skipAi: true, title: 'flag title' },
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.title).toBe('flag title');
    expect(result.titleSource).toBe('flag');
    expect(result.body).toBe(TEMPLATE);
    expect(result.bodySource).toBe('template');
    expect(result.aiError).toBeNull();
  });

  it('skips AI when the configured provider is none', async () => {
    const result = await resolvePRContent({
      config: configWithAi('none'),
      context: CONTEXT,
      overrides: {},
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.titleSource).toBe('template');
    expect(result.bodySource).toBe('template');
  });

  it('lets AI win over flags when forceAi is set', async () => {
    const { fn, calls } = generatorReturning({
      title: 'ai title',
      description: 'ai body',
      aiGenerated: true,
      provider: 'claude',
    });

    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'flag title', body: 'flag body', forceAi: true },
      defaultBody: TEMPLATE,
      generate: fn,
    });

    expect(calls).toHaveLength(1);
    expect(result.title).toBe('ai title');
    expect(result.titleSource).toBe('ai');
    expect(result.body).toBe('ai body');
    expect(result.bodySource).toBe('ai');
  });

  it('falls back from AI to flags when forceAi generation fails', async () => {
    const { fn } = generatorReturning({ aiGenerated: false, error: 'timeout' });

    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'flag title', body: 'flag body', forceAi: true },
      defaultBody: TEMPLATE,
      generate: fn,
    });

    expect(result.title).toBe('flag title');
    expect(result.titleSource).toBe('flag');
    expect(result.body).toBe('flag body');
    expect(result.bodySource).toBe('flag');
    expect(result.aiError).toBe('timeout');
  });

  it('reads the body from bodyFile', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-content-resolve-'));
    const file = path.join(dir, 'body.md');
    fs.writeFileSync(file, 'from file');

    try {
      const result = await resolvePRContent({
        config: configWithAi('none'),
        context: CONTEXT,
        overrides: { bodyFile: file },
        defaultBody: TEMPLATE,
        generate: neverGenerate,
      });

      expect(result.body).toBe('from file');
      expect(result.bodySource).toBe('flag');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/newpr/pr-content.test.ts`
Expected: FAIL — `resolvePRContent` is not exported.

- [ ] **Step 4: Write the implementation**

Append to `src/lib/newpr/pr-content.ts`:

```typescript
import { generatePRContentAsync } from '../config.js';
import type { ResolvedConfig, PRGenerationContext, PRGenerationResult } from '../config.js';

/** Signature of the AI generation call, injectable for testing. */
export type GenerateFn = (
  config: ResolvedConfig,
  context: PRGenerationContext
) => Promise<PRGenerationResult>;

export interface ResolvePRContentParams {
  config: ResolvedConfig;
  context: PRGenerationContext;
  overrides: ContentOverrides;
  /** Template body used when neither a flag nor AI supplies one. */
  defaultBody: string;
  /** Override the generation call (tests only). */
  generate?: GenerateFn;
}

/**
 * Resolve the final PR title and body.
 *
 * Precedence is applied independently per field:
 *   default     flag -> AI -> template
 *   --force-ai  AI -> flag -> template
 *   --skip-ai   flag -> template
 *
 * AI is only invoked when it could actually change the outcome, so supplying
 * both --title and --body (without --force-ai) makes no LLM call.
 */
export async function resolvePRContent({
  config,
  context,
  overrides,
  defaultBody,
  generate = generatePRContentAsync,
}: ResolvePRContentParams): Promise<ResolvedPRContent> {
  const titleOverride = overrides.title;
  const bodyOverride = readBodyOverride(overrides);

  const hasTitleFlag = titleOverride !== undefined;
  const hasBodyFlag = bodyOverride !== undefined;

  const aiDisabled = overrides.skipAi === true || config.ai?.provider === 'none';
  const forceAi = overrides.forceAi === true;
  const needsAi = !aiDisabled && (forceAi || !hasTitleFlag || !hasBodyFlag);

  let generated: PRGenerationResult | null = null;
  if (needsAi) {
    generated = await generate(config, context);
  }

  const aiTitle = generated?.aiGenerated && generated.title ? generated.title : undefined;
  const aiBody =
    generated?.aiGenerated && generated.description ? generated.description : undefined;

  // Ordered candidate lists differ only in whether AI outranks flags.
  const titleCandidates: Array<[string | undefined, ContentSource]> = forceAi
    ? [
        [aiTitle, 'ai'],
        [titleOverride, 'flag'],
      ]
    : [
        [titleOverride, 'flag'],
        [aiTitle, 'ai'],
      ];

  const bodyCandidates: Array<[string | undefined, ContentSource]> = forceAi
    ? [
        [aiBody, 'ai'],
        [bodyOverride, 'flag'],
      ]
    : [
        [bodyOverride, 'flag'],
        [aiBody, 'ai'],
      ];

  const [title, titleSource] = pick(titleCandidates, context.description, 'template');
  const [body, bodySource] = pick(bodyCandidates, defaultBody, 'template');

  const aiContributed = titleSource === 'ai' || bodySource === 'ai';

  return {
    title,
    body,
    titleSource,
    bodySource,
    aiProvider: aiContributed ? (generated?.provider ?? null) : null,
    aiError: generated?.error ?? null,
  };
}

/** Return the first defined candidate with its source, else the fallback. */
function pick(
  candidates: Array<[string | undefined, ContentSource]>,
  fallback: string,
  fallbackSource: ContentSource
): [string, ContentSource] {
  for (const [value, source] of candidates) {
    if (value !== undefined) {
      return [value, source];
    }
  }
  return [fallback, fallbackSource];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/newpr/pr-content.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Verify nothing else broke**

Run: `pnpm exec vitest run src/lib/config.test.ts && pnpm exec tsc --noEmit`
Expected: PASS and no type errors. `PRGenerationResult` gained only optional fields, so existing callers still compile.

- [ ] **Step 7: Format and commit**

```bash
pnpm exec prettier --write src/lib/newpr/pr-content.ts src/lib/newpr/pr-content.test.ts src/lib/config.ts
git add src/lib/newpr/pr-content.ts src/lib/newpr/pr-content.test.ts src/lib/config.ts
git commit -m "feat(newpr): resolve PR content by per-field precedence with provenance"
```

---

### Task 3: CLI flags

**Files:**

- Modify: `src/lib/newpr/types.ts:15-55` (the `Options` interface)
- Modify: `src/cli/wt/new.ts` (`NewArgs`, builder, handler)
- Create: `src/cli/wt/new.test.ts`

**Interfaces:**

- Consumes: `ContentOverrides` from Task 1.
- Produces: `Options.title`, `Options.body`, `Options.bodyFile`, `Options.forceAi`, `Options.skipAi` — all optional, read by Task 4.

- [ ] **Step 1: Add the fields to `Options`**

In `src/lib/newpr/types.ts`, inside the `Options` interface after the `noHooks` field:

```typescript
  // Caller-supplied PR content
  /** Exact PR title (--title) */
  title?: string;
  /** Exact PR body (--body) */
  body?: string;
  /** Path to a file containing the PR body (--body-file) */
  bodyFile?: string;
  /** Run AI generation even when title/body flags are supplied (--force-ai) */
  forceAi?: boolean;
  /** Skip AI generation entirely (--skip-ai) */
  skipAi?: boolean;
```

- [ ] **Step 2: Write the failing test**

Create `src/cli/wt/new.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const runNewprHandler = vi.fn();
vi.mock('../newpr.js', () => ({ runNewprHandler }));
vi.mock('../../lib/ui/index.js', () => ({
  setJsonMode: vi.fn(),
  printError: vi.fn(),
}));

const { newCommand } = await import('./new.js');

/** Invoke the command's handler with a parsed-argv-like object. */
async function invoke(argv: Record<string, unknown>) {
  runNewprHandler.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (newCommand.handler as any)({ base: 'main', ...argv });
  return runNewprHandler.mock.calls[0][0];
}

describe('wt new content flags', () => {
  beforeEach(() => {
    runNewprHandler.mockReset();
  });

  it('passes --title through to Options.title', async () => {
    const options = await invoke({ title: 'feat: dark mode' });
    expect(options.title).toBe('feat: dark mode');
  });

  it('passes --body and --body-file through unchanged', async () => {
    const withBody = await invoke({ body: 'inline' });
    expect(withBody.body).toBe('inline');

    const withFile = await invoke({ 'body-file': '/tmp/body.md' });
    expect(withFile.bodyFile).toBe('/tmp/body.md');
  });

  it('passes --force-ai and --skip-ai as booleans', async () => {
    const options = await invoke({ 'force-ai': true, 'skip-ai': true });
    expect(options.forceAi).toBe(true);
    expect(options.skipAi).toBe(true);
  });

  it('leaves content options undefined when no flags are given', async () => {
    const options = await invoke({});
    expect(options.title).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(options.bodyFile).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/cli/wt/new.test.ts`
Expected: FAIL — `options.title` is `undefined`.

- [ ] **Step 4: Declare the flags**

In `src/cli/wt/new.ts`, add to the `NewArgs` interface:

```typescript
  title?: string;
  body?: string;
  'body-file'?: string;
  'force-ai'?: boolean;
  'skip-ai'?: boolean;
```

Add to the builder chain, immediately after the `.option('action', {...})` block:

```typescript
      .option('title', {
        type: 'string',
        description: 'Exact PR title (skips AI title generation)',
      })
      .option('body', {
        type: 'string',
        description: 'Exact PR body (skips AI description generation)',
      })
      .option('body-file', {
        type: 'string',
        description: 'Read the PR body from a file (preferred for multi-line markdown)',
      })
      .option('force-ai', {
        type: 'boolean',
        description: 'Run AI generation even when --title/--body are supplied',
        default: false,
      })
      .option('skip-ai', {
        type: 'boolean',
        description: 'Skip AI generation entirely for this invocation',
        default: false,
      })
      .example(
        '$0 new "Add dark mode" --title "feat: dark mode" --body-file /tmp/body.md',
        'Supply exact PR content'
      )
```

Add to the `options` object in the handler, after `noHooks`:

```typescript
      title: argv.title,
      body: argv.body,
      bodyFile: argv['body-file'],
      forceAi: !!argv['force-ai'],
      skipAi: !!argv['skip-ai'],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/cli/wt/new.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify the flags parse against the real CLI**

```bash
pnpm run build
node dist/cli/wt.js new --help | grep -E "title|body-file|force-ai|skip-ai"
```

Expected: all four flags listed. This also confirms none of them trips the `.strict()` negation problem.

- [ ] **Step 7: Format and commit**

```bash
pnpm exec prettier --write src/cli/wt/new.ts src/cli/wt/new.test.ts src/lib/newpr/types.ts
git add src/cli/wt/new.ts src/cli/wt/new.test.ts src/lib/newpr/types.ts
git commit -m "feat(wt): add --title/--body/--body-file/--force-ai/--skip-ai to wt new"
```

---

### Task 4: Wire resolution into PR creation and the JSON envelope

**Files:**

- Modify: `src/lib/json-output.ts:83-91` (`NewprResultData`)
- Modify: `src/cli/newpr.ts` — the branch-mode site at lines 726-755 and the new-PR site at lines 1096-1125
- Modify: `src/lib/json-output.test.ts`

**Interfaces:**

- Consumes: `resolvePRContent`, `PRContentError` from Task 1/2; `Options.title|body|bodyFile|forceAi|skipAi` from Task 3.
- Produces: `NewprResultData.titleSource|bodySource|aiProvider|aiError`.

- [ ] **Step 1: Extend `NewprResultData`**

In `src/lib/json-output.ts`, replace the interface at line 83:

```typescript
export interface NewprResultData {
  prNumber: number;
  prUrl: string;
  branch: string;
  worktreePath: string;
  draft: boolean;
  scenario?: string;
  actionTaken?: string;
  /** Where the PR title came from: caller flag, AI, or the built-in template. */
  titleSource?: 'flag' | 'ai' | 'template';
  /** Where the PR body came from. */
  bodySource?: 'flag' | 'ai' | 'template';
  /** Provider that generated content, or null. */
  aiProvider?: string | null;
  /** Why AI generation produced nothing, or null. */
  aiError?: string | null;
}
```

- [ ] **Step 2: Write the failing test**

Append to `src/lib/json-output.test.ts`:

```typescript
describe('NewprResultData provenance', () => {
  it('carries content provenance through a success envelope', () => {
    const result = createSuccessResult('newpr', {
      prNumber: 22,
      prUrl: 'https://github.com/o/r/pull/22',
      branch: 'feat/x',
      worktreePath: '/tmp/wt',
      draft: true,
      titleSource: 'flag' as const,
      bodySource: 'ai' as const,
      aiProvider: 'codex',
      aiError: null,
    });

    const parsed = JSON.parse(formatJsonResult(result));
    expect(parsed.data.titleSource).toBe('flag');
    expect(parsed.data.bodySource).toBe('ai');
    expect(parsed.data.aiProvider).toBe('codex');
    expect(parsed.data.aiError).toBeNull();
  });
});
```

If `createSuccessResult` and `formatJsonResult` are not already imported at the top of that test file, add them to the existing import from `./json-output.js`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/json-output.test.ts`
Expected: FAIL — type error on the unknown properties (or an assertion failure).

- [ ] **Step 4: Replace both PR-creation sites in `src/cli/newpr.ts`**

Add to the imports at the top:

```typescript
import { resolvePRContent, PRContentError } from '../lib/newpr/pr-content.js';
```

**Site A — branch mode (currently lines 726-755).** Replace the `generatePRContentAsync` call, the `defaultBody` constant, and the `github.createPr` call with:

```typescript
const defaultBody = `## Summary

PR created from existing branch: \`${branchName}\`

## Changes

-

## Test Plan

- [ ]

---
🤖 PR created with \`newpr --branch\``;

let prContent;
try {
  prContent = await resolvePRContent({
    config,
    context: {
      description: descriptionFromBranch,
      branchName,
      baseBranch: options.baseBranch,
      changedFiles: git.getChangedFiles(`origin/${options.baseBranch}`, branchName),
      commitMessages: git.getCommitMessages(`origin/${options.baseBranch}`, branchName),
    },
    overrides: {
      title: options.title,
      body: options.body,
      bodyFile: options.bodyFile,
      forceAi: options.forceAi,
      skipAi: options.skipAi,
    },
    defaultBody,
  });
} catch (error) {
  if (error instanceof PRContentError) {
    exitWithError(error.message, ErrorCode.INVALID_ARGUMENT, options.json);
  }
  throw error;
}

const pr = github.createPr({
  title: prContent.title,
  body: prContent.body,
  base: options.baseBranch,
  head: branchName,
  draft: options.draft,
});
```

**Site B — new-PR mode (currently lines 1096-1125).** Replace that block with:

```typescript
const defaultBody = `## Summary

${description}

## Changes

-

## Test Plan

- [ ]

---
🤖 PR created with \`newpr\``;

let prContent;
try {
  prContent = await resolvePRContent({
    config,
    context: {
      description,
      branchName,
      baseBranch: options.baseBranch,
      changedFiles: git.getChangedFiles(`origin/${options.baseBranch}`, branchName),
      commitMessages: git.getCommitMessages(`origin/${options.baseBranch}`, branchName),
    },
    overrides: {
      title: options.title,
      body: options.body,
      bodyFile: options.bodyFile,
      forceAi: options.forceAi,
      skipAi: options.skipAi,
    },
    defaultBody,
  });
} catch (error) {
  if (error instanceof PRContentError) {
    exitWithError(error.message, ErrorCode.INVALID_ARGUMENT, options.json);
  }
  throw error;
}

const pr = github.createPr({
  title: prContent.title,
  body: prContent.body,
  base: options.baseBranch,
  head: branchName,
  draft: options.draft,
});
```

Note the indentation differs between the two sites: Site A sits at two-space indentation, Site B at four. Match the surrounding code.

- [ ] **Step 5: Thread provenance through `printSummary`**

Both PR-creation sites report through the shared `printSummary` helper at
`src/cli/newpr.ts:387`, so the fields are added in exactly one place.

Widen its `extra` parameter (line 393):

```typescript
  extra?: {
    draft?: boolean;
    scenario?: string;
    actionTaken?: string;
    titleSource?: 'flag' | 'ai' | 'template';
    bodySource?: 'flag' | 'ai' | 'template';
    aiProvider?: string | null;
    aiError?: string | null;
  }
```

and add the fields to the `data` object it builds (line 396):

```typescript
const data: NewprResultData = {
  prNumber,
  prUrl,
  branch: branchName,
  worktreePath,
  draft: extra?.draft ?? options.draft,
  scenario: extra?.scenario,
  actionTaken: extra?.actionTaken,
  titleSource: extra?.titleSource,
  bodySource: extra?.bodySource,
  aiProvider: extra?.aiProvider ?? null,
  aiError: extra?.aiError ?? null,
};
```

Then, at **each** `printSummary(...)` call that follows a PR creation, pass the resolved
provenance in the `extra` argument alongside the existing keys:

```typescript
      titleSource: prContent.titleSource,
      bodySource: prContent.bodySource,
      aiProvider: prContent.aiProvider,
      aiError: prContent.aiError,
```

Find those call sites with `grep -n "printSummary(" src/cli/newpr.ts`. Only the calls on a
path that created a PR have a `prContent` in scope; leave any others unchanged.

- [ ] **Step 6: Run the full suite**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: PASS with no type errors.

- [ ] **Step 7: Format and commit**

```bash
pnpm exec prettier --write src/cli/newpr.ts src/lib/json-output.ts src/lib/json-output.test.ts
git add src/cli/newpr.ts src/lib/json-output.ts src/lib/json-output.test.ts
git commit -m "feat(newpr): use caller-supplied PR content and report provenance in JSON"
```

---

### Task 5: End-to-end verification against a real PR

**Files:**

- No source changes. This task proves the feature works through the real binary.

**Interfaces:**

- Consumes: everything from Tasks 1-4.

- [ ] **Step 1: Build**

Run: `pnpm run build`
Expected: clean build.

- [ ] **Step 2: Verify the no-LLM path with a dry inspection**

```bash
cat > /tmp/wt-e2e-body.md <<'EOF'
## Summary

End-to-end check that --body-file content reaches the PR verbatim.

## Test Plan

- [x] Body arrived intact
EOF
node dist/cli/wt.js new --help | grep -c "body-file"
```

Expected: `1`.

- [ ] **Step 3: Create a throwaway PR through the real path**

Run from the repository root (not the worktree), so a fresh worktree is created:

```bash
node <path-to-worktree>/dist/cli/wt.js new "e2e content flag check" \
  --title "test: e2e content flag check" \
  --body-file /tmp/wt-e2e-body.md \
  --draft --non-interactive --action=empty_commit --json
```

Expected JSON: `"titleSource": "flag"`, `"bodySource": "flag"`, `"aiProvider": null`.

- [ ] **Step 4: Confirm GitHub received the content verbatim**

```bash
gh pr view <N> --json title,body --jq '.title, .body'
```

Expected: the title matches `test: e2e content flag check` exactly, and the body matches `/tmp/wt-e2e-body.md` byte-for-byte — no `## Changes` stub, no empty bullets.

- [ ] **Step 5: Tear down the throwaway PR**

```bash
gh pr close <N> --delete-branch
node <path-to-worktree>/dist/cli/wt.js clean <N> --force
```

- [ ] **Step 6: Record the evidence**

Paste the observed JSON envelope and the `gh pr view` output into the PR description of PR #22, under a "Verification" heading. Per the repository's evidence standard, the claim that this works must rest on that observed output.

---

### Task 6: Documentation

**Files:**

- Modify: `docs/AI-TOOLING.md` (agent-facing)
- Modify: `README.md` (human-facing)

**Interfaces:**

- Consumes: the flag names and provenance field names from Tasks 3-4. They must match exactly.

- [ ] **Step 1: Add the agent-facing section to `docs/AI-TOOLING.md`**

Insert a new section near the existing `wt new` JSON documentation:

````markdown
### Supplying PR content directly

An agent driving `wt` usually has far better context for the PR title and body than the
tool can reconstruct — it holds the conversation that produced the work. Pass that content
in rather than relying on generation:

```bash
wt new "add dark mode" \
  --title "feat: add dark mode toggle to settings" \
  --body-file /tmp/pr-body.md \
  --non-interactive --action=empty_commit --json
```

`--body-file` is strongly preferred over `--body` for anything multi-line: PR bodies contain
backticks, quotes, and `$`, all of which are hazardous through shell quoting.

**Precedence**, applied independently to the title and the body:

| Flags        | Order                  |
| ------------ | ---------------------- |
| _(default)_  | `flag` → AI → template |
| `--force-ai` | AI → `flag` → template |
| `--skip-ai`  | `flag` → template      |

Supplying both `--title` and a body flag without `--force-ai` makes **no LLM call at all**.

**Verifying your content was used.** The JSON envelope reports the origin of each field:

```jsonc
{
  "data": {
    "prNumber": 42,
    "titleSource": "flag", // "flag" | "ai" | "template"
    "bodySource": "flag",
    "aiProvider": null, // provider that generated content, else null
    "aiError": null, // why generation produced nothing, else null
  },
}
```

Assert `titleSource === "flag"` and `bodySource === "flag"` to confirm your content landed.
A `"template"` value means the field fell back to the built-in stub; check `aiError`.

**Errors.** Passing both `--body` and `--body-file`, or a `--body-file` that cannot be read,
fails with `INVALID_ARGUMENT` rather than silently falling back — so a broken path is never
mistaken for accepted content.
````

- [ ] **Step 2: Add the human-facing note to `README.md`**

In the `wt new` command reference, add the four flags to the options list with one-line
descriptions matching `--help`, and add one worked example:

````markdown
Supply exact PR content instead of generating it:

```bash
wt new "add dark mode" --title "feat: dark mode" --body-file ./pr-body.md
```
````

- [ ] **Step 3: Verify docs match the implementation**

```bash
pnpm run build
node dist/cli/wt.js new --help | grep -E "^\s+--(title|body|body-file|force-ai|skip-ai)"
```

Expected: every flag documented in Steps 1-2 appears, with matching descriptions. Fix any drift.

- [ ] **Step 4: Format and commit**

```bash
pnpm exec prettier --write docs/AI-TOOLING.md README.md
git add docs/AI-TOOLING.md README.md
git commit -m "docs: document agent-supplied PR content flags"
```

---

### Task 7: Update the `start-work` skill

**Files:**

- Modify: `/home/chris/.claude/skills/start-work/SKILL.md`

**Note:** This file lives outside the repository and is **not** part of PR #22. Commit it separately if that directory is version-controlled; otherwise just edit in place.

**Version-gap caveat (required).** The flags this skill starts passing only exist in the `wt` built from this branch. The globally installed `wt` (currently 1.14.0) rejects unknown arguments under yargs `.strict()`, so until the new version is published and installed globally, `start-work` would fail against the old binary. The skill text must therefore state: the flags require `@camaradesuk/git-worktree-tools` newer than 1.14.0, and the provenance check in Step 3 is what surfaces a mismatch — if `wt` is too old the call fails with `INVALID_ARGUMENT: Unknown argument: title`, which the skill must report rather than swallow.

**Interfaces:**

- Consumes: the flags from Task 3 and the provenance fields from Task 4.

- [ ] **Step 1: Add a content-drafting step before the `wt new` invocation**

Insert this before the step that runs `wt new`:

```markdown
**Draft the PR content before creating the PR.**

At creation time the branch holds only an empty commit, so there is no diff to describe.
Write the PR body from what you know from the conversation — intent, not implementation:

1. **Summary** — what is being built and why, in two or three sentences.
2. **Approach** — the planned implementation, at the level of components and their
   responsibilities.
3. **Scope** — what is explicitly in and out.
4. **Test plan** — how it will be verified.

Write the body to `/tmp/start-work-body-$$.md`. Draft a conventional-commit-style title
(`feat: ...`, `fix: ...`) that names the change, not the task.
```

- [ ] **Step 2: Update the `wt new` invocation**

Replace the existing command with:

```bash
wt new "<description>" \
  --title "<drafted title>" \
  --body-file /tmp/start-work-body-$$.md \
  --ready --non-interactive --action=empty_commit --json
```

Keep the existing `--code` and `--base <branch>` options available as before.

- [ ] **Step 3: Add a provenance check after the call**

```markdown
Confirm the content landed: the JSON response must report `"titleSource": "flag"` and
`"bodySource": "flag"`. If either says `"template"` or `"ai"`, the flags did not take
effect — report this rather than continuing silently, and check `aiError`.
```

- [ ] **Step 4: Add the post-first-commit refresh step**

After the step that amends the first real commit and force-pushes:

```markdown
**Refresh the PR body if scope drifted.** The body written at creation described intent;
the first commit is the first real evidence. If what landed diverges from what was planned,
update the description now:

`gh pr edit <N> --body-file /tmp/start-work-body-$$.md`

Leave it unchanged when the work matches the stated intent. `/refresh-pr` and `/ship-pr`
will audit it again before merge.
```

- [ ] **Step 5: Clean up the temp file**

Add a final note instructing removal of `/tmp/start-work-body-$$.md` once the PR is created and any refresh is done.

- [ ] **Step 6: Verify the skill end-to-end**

Run `/start-work` on a small throwaway task and confirm the created PR has a real
multi-section body rather than the stub. Close and clean up the throwaway PR afterwards.

---

## Remaining plans

This plan covers **Part 1** of the spec only. The other three parts are independent and get
their own plans, each producing working software on its own:

| Plan                            | Spec section | Summary                                                                                                                                                         |
| ------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 — Subscription AI providers   | §4           | Priority `codex → claude → gemini-api → ollama`, fall-through on provider failure, `codex exec --output-last-message` isolation, `ai.models.*`, `wt ai doctor`. |
| 3 — Flexible worktree layouts   | §5           | Anchor placement to `getMainWorktreeRoot()`, `worktreeParentAnchor` escape hatch, nested patterns, bare-layout detection in `wt init`.                          |
| 4 — Overrides and documentation | §6           | Env-var layer, `ai.*` JSON schema section, per-key provenance in `wt config show --json`, README/AI-TOOLING coverage.                                           |

Part 1 is sequenced first because it delivers the PR-quality improvement on its own and
depends on nothing in Parts 2-4. Part 2 builds on the `PRGenerationResult.error` field added
in Task 2 here.
