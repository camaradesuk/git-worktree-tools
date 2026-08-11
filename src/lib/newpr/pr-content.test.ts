import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBodyOverride, resolvePRContent, PRContentError } from './pr-content.js';
import type { ResolvedConfig, PRGenerationResult, PRGenerationContext } from '../config.js';

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
      titleGenerated: true,
      descriptionGenerated: true,
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

  it('skips AI entirely with skipAi, using flags then template, and reports why in aiError', async () => {
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
    // aiError must be non-null on every skip path (docs/AI-TOOLING.md tells
    // agents to check it for why generation didn't run).
    expect(result.aiError).toBe('AI skipped (--skip-ai)');
  });

  it('skips AI when the configured provider is none, and reports why in aiError', async () => {
    const result = await resolvePRContent({
      config: configWithAi('none'),
      context: CONTEXT,
      overrides: {},
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.titleSource).toBe('template');
    expect(result.bodySource).toBe('template');
    expect(result.aiError).toBe("AI disabled (ai.provider = 'none')");
  });

  it('reports that --skip-ai wins over --force-ai in aiError, when both are given', async () => {
    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { skipAi: true, forceAi: true, title: 'flag title' },
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.titleSource).toBe('flag');
    expect(result.aiError).toBe('AI skipped (--skip-ai overrides --force-ai)');
  });

  it('reports that --force-ai had no effect when ai.provider is none, in aiError', async () => {
    const result = await resolvePRContent({
      config: configWithAi('none'),
      context: CONTEXT,
      overrides: { forceAi: true, title: 'flag title' },
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.titleSource).toBe('flag');
    expect(result.aiError).toBe("AI disabled (ai.provider = 'none'); --force-ai had no effect");
  });

  it('lets AI win over flags when forceAi is set', async () => {
    const { fn, calls } = generatorReturning({
      title: 'ai title',
      description: 'ai body',
      aiGenerated: true,
      titleGenerated: true,
      descriptionGenerated: true,
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

describe('resolvePRContent per-field provenance', () => {
  // Regression: `generatePRContentAsync` seeds `title` with
  // `context.description` and returns it untouched when ai.prTitle is off (or
  // title generation fails) while description generation succeeds. A
  // truthy-content check then reported titleSource:'ai' for text no model
  // produced. The shape below is what the real function returns in that case
  // — note `title` is NON-EMPTY and equals context.description, which is
  // exactly what `generatorReturning`'s `title: ''` default hides.
  it("reports titleSource 'template' when only the description was AI-generated", async () => {
    const generate = async (): Promise<PRGenerationResult> => ({
      title: CONTEXT.description, // seeded, NOT model output
      description: 'a real AI-written body',
      aiGenerated: true,
      titleGenerated: false,
      descriptionGenerated: true,
      provider: 'codex',
      error: null,
    });

    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: {},
      defaultBody: TEMPLATE,
      generate,
    });

    expect(result.title).toBe(CONTEXT.description);
    expect(result.titleSource).toBe('template');
    expect(result.body).toBe('a real AI-written body');
    expect(result.bodySource).toBe('ai');
  });

  it("reports bodySource 'template' when only the title was AI-generated", async () => {
    const generate = async (): Promise<PRGenerationResult> => ({
      title: 'feat: a real AI-written title',
      description: '',
      aiGenerated: true,
      titleGenerated: true,
      descriptionGenerated: false,
      provider: 'claude',
      error: null,
    });

    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: {},
      defaultBody: TEMPLATE,
      generate,
    });

    expect(result.title).toBe('feat: a real AI-written title');
    expect(result.titleSource).toBe('ai');
    expect(result.body).toBe(TEMPLATE);
    expect(result.bodySource).toBe('template');
  });
});

describe('resolvePRContent requests only the fields it can use', () => {
  /** Capture the context handed to the generator. */
  function capturingGenerator() {
    const contexts: PRGenerationContext[] = [];
    const fn = async (
      _c: ResolvedConfig,
      ctx: PRGenerationContext
    ): Promise<PRGenerationResult> => {
      contexts.push(ctx);
      return {
        title: 'ai title',
        description: 'ai body',
        aiGenerated: true,
        titleGenerated: true,
        descriptionGenerated: true,
        provider: 'codex',
        error: null,
      };
    };
    return { fn, contexts };
  }

  it('does not request a title when --title was supplied', async () => {
    const { fn, contexts } = capturingGenerator();

    await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'flag title' },
      defaultBody: TEMPLATE,
      generate: fn,
    });

    expect(contexts[0].needed).toEqual({ title: false, description: true });
  });

  it('does not request a description when a body flag was supplied', async () => {
    const { fn, contexts } = capturingGenerator();

    await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { body: 'flag body' },
      defaultBody: TEMPLATE,
      generate: fn,
    });

    expect(contexts[0].needed).toEqual({ title: true, description: false });
  });

  it('requests both fields when --force-ai is set, even with both flags', async () => {
    const { fn, contexts } = capturingGenerator();

    await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'flag title', body: 'flag body', forceAi: true },
      defaultBody: TEMPLATE,
      generate: fn,
    });

    expect(contexts[0].needed).toEqual({ title: true, description: true });
  });

  it('surfaces a partial failure: generated title, failed description', async () => {
    const generate = async (): Promise<PRGenerationResult> => ({
      title: 'a real AI title',
      description: '',
      aiGenerated: true,
      titleGenerated: true,
      descriptionGenerated: false,
      provider: 'codex',
      // What generatePRContentAsync now reports when one half fails.
      error: "AI generation produced no content (description via 'codex': rate limited)",
    });

    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: {},
      defaultBody: TEMPLATE,
      generate,
    });

    expect(result.titleSource).toBe('ai');
    expect(result.bodySource).toBe('template');
    // The half that failed must still be diagnosable, not reported as null.
    expect(result.aiError).toContain('rate limited');
  });
});

describe('resolvePRContent aiError reflects whether AI was actually wanted', () => {
  // Regression: --skip-ai / provider:'none' set a skip reason unconditionally,
  // so supplying BOTH flags (where nothing was wanted from AI) reported an
  // aiError. docs/AI-TOOLING.md defines that as the "generation not needed"
  // SUCCESS case, with aiProvider and aiError both null.
  it('leaves aiError null when both flags are supplied and AI is disabled', async () => {
    const result = await resolvePRContent({
      config: configWithAi('none'),
      context: CONTEXT,
      overrides: { title: 'flag title', body: 'flag body' },
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.titleSource).toBe('flag');
    expect(result.bodySource).toBe('flag');
    expect(result.aiProvider).toBeNull();
    expect(result.aiError).toBeNull();
  });

  it('leaves aiError null when both flags are supplied with --skip-ai', async () => {
    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'flag title', body: 'flag body', skipAi: true },
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.aiError).toBeNull();
  });

  it('still reports the skip reason when a field actually needed AI', async () => {
    const result = await resolvePRContent({
      config: configWithAi('auto'),
      context: CONTEXT,
      overrides: { title: 'flag title', skipAi: true },
      defaultBody: TEMPLATE,
      generate: neverGenerate,
    });

    expect(result.bodySource).toBe('template');
    expect(result.aiError).toBe('AI skipped (--skip-ai)');
  });
});

// ---------------------------------------------------------------------------
// Exhaustive invariant matrix.
//
// Every combination of the five inputs that decide PR content, with EXPLICIT
// expected values. The expectations are written out by hand as a spec rather
// than computed, so this table cannot silently agree with a bug in the code
// it checks.
//
// The column that matters most is `called`: whether a provider was invoked at
// all. Several defects in this feature were "an AI call happened when the
// flags promised none" or the reverse, and only an explicit assertion on
// invocation catches those.
// ---------------------------------------------------------------------------

type MatrixRow = {
  aiEnabled: boolean;
  skipAi: boolean;
  forceAi: boolean;
  hasTitle: boolean;
  hasBody: boolean;
  called: boolean;
  titleSource: 'flag' | 'ai' | 'template';
  bodySource: 'flag' | 'ai' | 'template';
  /** null = aiError must be null; string = aiError must contain this. */
  err: string | null;
};

const MATRIX: MatrixRow[] = [
  // --- provider enabled, no skip, no force -------------------------------
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: false,
    hasTitle: false,
    hasBody: false,
    called: true,
    titleSource: 'ai',
    bodySource: 'ai',
    err: null,
  },
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: false,
    hasTitle: false,
    hasBody: true,
    called: true,
    titleSource: 'ai',
    bodySource: 'flag',
    err: null,
  },
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: false,
    hasTitle: true,
    hasBody: false,
    called: true,
    titleSource: 'flag',
    bodySource: 'ai',
    err: null,
  },
  // Both supplied: the headline "no LLM call at all" guarantee.
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: false,
    hasTitle: true,
    hasBody: true,
    called: false,
    titleSource: 'flag',
    bodySource: 'flag',
    err: null,
  },

  // --- provider enabled, --force-ai (AI outranks flags) ------------------
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: true,
    hasTitle: false,
    hasBody: false,
    called: true,
    titleSource: 'ai',
    bodySource: 'ai',
    err: null,
  },
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: true,
    hasTitle: false,
    hasBody: true,
    called: true,
    titleSource: 'ai',
    bodySource: 'ai',
    err: null,
  },
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: true,
    hasTitle: true,
    hasBody: false,
    called: true,
    titleSource: 'ai',
    bodySource: 'ai',
    err: null,
  },
  {
    aiEnabled: true,
    skipAi: false,
    forceAi: true,
    hasTitle: true,
    hasBody: true,
    called: true,
    titleSource: 'ai',
    bodySource: 'ai',
    err: null,
  },

  // --- --skip-ai: never call a provider ----------------------------------
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: false,
    hasTitle: false,
    hasBody: false,
    called: false,
    titleSource: 'template',
    bodySource: 'template',
    err: 'AI skipped (--skip-ai)',
  },
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: false,
    hasTitle: false,
    hasBody: true,
    called: false,
    titleSource: 'template',
    bodySource: 'flag',
    err: 'AI skipped (--skip-ai)',
  },
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: false,
    hasTitle: true,
    hasBody: false,
    called: false,
    titleSource: 'flag',
    bodySource: 'template',
    err: 'AI skipped (--skip-ai)',
  },
  // Nothing was wanted from AI, so skipping it is not a degradation.
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: false,
    hasTitle: true,
    hasBody: true,
    called: false,
    titleSource: 'flag',
    bodySource: 'flag',
    err: null,
  },

  // --- --skip-ai beats --force-ai, and says so ---------------------------
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: true,
    hasTitle: false,
    hasBody: false,
    called: false,
    titleSource: 'template',
    bodySource: 'template',
    err: 'overrides --force-ai',
  },
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: true,
    hasTitle: false,
    hasBody: true,
    called: false,
    titleSource: 'template',
    bodySource: 'flag',
    err: 'overrides --force-ai',
  },
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: true,
    hasTitle: true,
    hasBody: false,
    called: false,
    titleSource: 'flag',
    bodySource: 'template',
    err: 'overrides --force-ai',
  },
  // --force-ai was explicitly asked for and silently did nothing: say so.
  {
    aiEnabled: true,
    skipAi: true,
    forceAi: true,
    hasTitle: true,
    hasBody: true,
    called: false,
    titleSource: 'flag',
    bodySource: 'flag',
    err: 'overrides --force-ai',
  },

  // --- provider 'none' ---------------------------------------------------
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: false,
    hasTitle: false,
    hasBody: false,
    called: false,
    titleSource: 'template',
    bodySource: 'template',
    err: "ai.provider = 'none'",
  },
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: false,
    hasTitle: false,
    hasBody: true,
    called: false,
    titleSource: 'template',
    bodySource: 'flag',
    err: "ai.provider = 'none'",
  },
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: false,
    hasTitle: true,
    hasBody: false,
    called: false,
    titleSource: 'flag',
    bodySource: 'template',
    err: "ai.provider = 'none'",
  },
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: false,
    hasTitle: true,
    hasBody: true,
    called: false,
    titleSource: 'flag',
    bodySource: 'flag',
    err: null,
  },

  // --- provider 'none' + --force-ai (force had no effect) ----------------
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: true,
    hasTitle: false,
    hasBody: false,
    called: false,
    titleSource: 'template',
    bodySource: 'template',
    err: 'had no effect',
  },
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: true,
    hasTitle: false,
    hasBody: true,
    called: false,
    titleSource: 'template',
    bodySource: 'flag',
    err: 'had no effect',
  },
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: true,
    hasTitle: true,
    hasBody: false,
    called: false,
    titleSource: 'flag',
    bodySource: 'template',
    err: 'had no effect',
  },
  {
    aiEnabled: false,
    skipAi: false,
    forceAi: true,
    hasTitle: true,
    hasBody: true,
    called: false,
    titleSource: 'flag',
    bodySource: 'flag',
    err: 'had no effect',
  },

  // --- provider 'none' + --skip-ai (both disable; skip is reported) ------
  {
    aiEnabled: false,
    skipAi: true,
    forceAi: false,
    hasTitle: false,
    hasBody: false,
    called: false,
    titleSource: 'template',
    bodySource: 'template',
    err: 'AI skipped (--skip-ai)',
  },
  {
    aiEnabled: false,
    skipAi: true,
    forceAi: false,
    hasTitle: false,
    hasBody: true,
    called: false,
    titleSource: 'template',
    bodySource: 'flag',
    err: 'AI skipped (--skip-ai)',
  },
  {
    aiEnabled: false,
    skipAi: true,
    forceAi: false,
    hasTitle: true,
    hasBody: false,
    called: false,
    titleSource: 'flag',
    bodySource: 'template',
    err: 'AI skipped (--skip-ai)',
  },
  {
    aiEnabled: false,
    skipAi: true,
    forceAi: false,
    hasTitle: true,
    hasBody: true,
    called: false,
    titleSource: 'flag',
    bodySource: 'flag',
    err: null,
  },

  {
    aiEnabled: false,
    skipAi: true,
    forceAi: true,
    hasTitle: false,
    hasBody: false,
    called: false,
    titleSource: 'template',
    bodySource: 'template',
    err: 'overrides --force-ai',
  },
  {
    aiEnabled: false,
    skipAi: true,
    forceAi: true,
    hasTitle: false,
    hasBody: true,
    called: false,
    titleSource: 'template',
    bodySource: 'flag',
    err: 'overrides --force-ai',
  },
  {
    aiEnabled: false,
    skipAi: true,
    forceAi: true,
    hasTitle: true,
    hasBody: false,
    called: false,
    titleSource: 'flag',
    bodySource: 'template',
    err: 'overrides --force-ai',
  },
  {
    aiEnabled: false,
    skipAi: true,
    forceAi: true,
    hasTitle: true,
    hasBody: true,
    called: false,
    titleSource: 'flag',
    bodySource: 'flag',
    err: 'overrides --force-ai',
  },
];

describe('resolvePRContent invariant matrix', () => {
  it('covers every combination of the five deciding inputs exactly once', () => {
    expect(MATRIX).toHaveLength(32);
    const keys = MATRIX.map(
      (r) => `${r.aiEnabled}|${r.skipAi}|${r.forceAi}|${r.hasTitle}|${r.hasBody}`
    );
    expect(new Set(keys).size).toBe(32);
  });

  for (const row of MATRIX) {
    const label = [
      row.aiEnabled ? 'ai=on' : 'ai=none',
      row.skipAi ? '--skip-ai' : '-',
      row.forceAi ? '--force-ai' : '-',
      row.hasTitle ? '--title' : '-',
      row.hasBody ? '--body' : '-',
    ].join(' ');

    it(`${label} -> called=${row.called} title=${row.titleSource} body=${row.bodySource}`, async () => {
      let calls = 0;
      const generate = async (): Promise<PRGenerationResult> => {
        calls += 1;
        return {
          title: 'AI TITLE',
          description: 'AI BODY',
          aiGenerated: true,
          titleGenerated: true,
          descriptionGenerated: true,
          provider: 'codex',
          error: null,
        };
      };

      const result = await resolvePRContent({
        config: configWithAi(row.aiEnabled ? 'auto' : 'none'),
        context: CONTEXT,
        overrides: {
          title: row.hasTitle ? 'FLAG TITLE' : undefined,
          body: row.hasBody ? 'FLAG BODY' : undefined,
          forceAi: row.forceAi || undefined,
          skipAi: row.skipAi || undefined,
        },
        defaultBody: TEMPLATE,
        generate,
      });

      // The invariant that most defects violated.
      expect(calls).toBe(row.called ? 1 : 0);

      expect(result.titleSource).toBe(row.titleSource);
      expect(result.bodySource).toBe(row.bodySource);

      const expectedTitle = { flag: 'FLAG TITLE', ai: 'AI TITLE', template: CONTEXT.description }[
        row.titleSource
      ];
      const expectedBody = { flag: 'FLAG BODY', ai: 'AI BODY', template: TEMPLATE }[row.bodySource];
      expect(result.title).toBe(expectedTitle);
      expect(result.body).toBe(expectedBody);

      if (row.err === null) {
        expect(result.aiError).toBeNull();
      } else {
        expect(result.aiError).toContain(row.err);
      }

      // aiProvider is set exactly when AI actually supplied a field.
      const aiContributed = row.titleSource === 'ai' || row.bodySource === 'ai';
      expect(result.aiProvider).toBe(aiContributed ? 'codex' : null);
    });
  }
});

// ---------------------------------------------------------------------------
// Second matrix: what the generator actually produced.
//
// The first matrix always has the generator succeed at BOTH fields, so it
// cannot tell `titleGenerated` from `aiGenerated` — and the provenance bug
// that shipped lived exactly there (a seeded title reported as 'ai'). This
// table varies the per-field outcome instead, over the flag combinations that
// actually invoke a provider.
// ---------------------------------------------------------------------------

type Outcome = 'both' | 'title-only' | 'body-only' | 'neither';

function generatorWithOutcome(outcome: Outcome): GenerateFn {
  return async (_c, ctx) => {
    const titleGenerated = outcome === 'both' || outcome === 'title-only';
    const descriptionGenerated = outcome === 'both' || outcome === 'body-only';
    return {
      // Mirrors generatePRContentAsync: `title` is SEEDED with the caller's
      // description and returned even when the model never touched it.
      title: titleGenerated ? 'AI TITLE' : ctx.description,
      description: descriptionGenerated ? 'AI BODY' : '',
      aiGenerated: titleGenerated || descriptionGenerated,
      titleGenerated,
      descriptionGenerated,
      provider: titleGenerated || descriptionGenerated ? 'codex' : null,
      error: outcome === 'neither' ? 'AI generation produced no content (…)' : null,
    };
  };
}

type OutcomeRow = {
  flags: 'none' | 'title' | 'body' | 'force+both';
  outcome: Outcome;
  titleSource: 'flag' | 'ai' | 'template';
  bodySource: 'flag' | 'ai' | 'template';
};

const OUTCOME_MATRIX: OutcomeRow[] = [
  // No flags: AI fills what it can, template covers the rest.
  { flags: 'none', outcome: 'both', titleSource: 'ai', bodySource: 'ai' },
  { flags: 'none', outcome: 'title-only', titleSource: 'ai', bodySource: 'template' },
  // The shipped bug: seeded title must NOT be reported as 'ai'.
  { flags: 'none', outcome: 'body-only', titleSource: 'template', bodySource: 'ai' },
  { flags: 'none', outcome: 'neither', titleSource: 'template', bodySource: 'template' },

  // --title supplied: flag wins the title regardless of the outcome.
  { flags: 'title', outcome: 'both', titleSource: 'flag', bodySource: 'ai' },
  { flags: 'title', outcome: 'title-only', titleSource: 'flag', bodySource: 'template' },
  { flags: 'title', outcome: 'body-only', titleSource: 'flag', bodySource: 'ai' },
  { flags: 'title', outcome: 'neither', titleSource: 'flag', bodySource: 'template' },

  // --body supplied: flag wins the body regardless of the outcome.
  { flags: 'body', outcome: 'both', titleSource: 'ai', bodySource: 'flag' },
  { flags: 'body', outcome: 'title-only', titleSource: 'ai', bodySource: 'flag' },
  { flags: 'body', outcome: 'body-only', titleSource: 'template', bodySource: 'flag' },
  { flags: 'body', outcome: 'neither', titleSource: 'template', bodySource: 'flag' },

  // --force-ai with both flags: AI wins where it produced, flag fills the gap.
  { flags: 'force+both', outcome: 'both', titleSource: 'ai', bodySource: 'ai' },
  { flags: 'force+both', outcome: 'title-only', titleSource: 'ai', bodySource: 'flag' },
  { flags: 'force+both', outcome: 'body-only', titleSource: 'flag', bodySource: 'ai' },
  { flags: 'force+both', outcome: 'neither', titleSource: 'flag', bodySource: 'flag' },
];

describe('resolvePRContent generator-outcome matrix', () => {
  for (const row of OUTCOME_MATRIX) {
    it(`${row.flags} + generated:${row.outcome} -> title=${row.titleSource} body=${row.bodySource}`, async () => {
      const overrides = {
        none: {},
        title: { title: 'FLAG TITLE' },
        body: { body: 'FLAG BODY' },
        'force+both': { title: 'FLAG TITLE', body: 'FLAG BODY', forceAi: true },
      }[row.flags];

      const result = await resolvePRContent({
        config: configWithAi('auto'),
        context: CONTEXT,
        overrides,
        defaultBody: TEMPLATE,
        generate: generatorWithOutcome(row.outcome),
      });

      expect(result.titleSource).toBe(row.titleSource);
      expect(result.bodySource).toBe(row.bodySource);

      const expectedTitle = { flag: 'FLAG TITLE', ai: 'AI TITLE', template: CONTEXT.description }[
        row.titleSource
      ];
      const expectedBody = { flag: 'FLAG BODY', ai: 'AI BODY', template: TEMPLATE }[row.bodySource];
      expect(result.title).toBe(expectedTitle);
      expect(result.body).toBe(expectedBody);

      const aiContributed = row.titleSource === 'ai' || row.bodySource === 'ai';
      expect(result.aiProvider).toBe(aiContributed ? 'codex' : null);
    });
  }
});
