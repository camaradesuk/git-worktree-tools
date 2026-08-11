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
