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
    // Ask only for the fields that could actually be used. Without --force-ai
    // a flag always beats generation, so generating that field would burn
    // latency and quota on a result guaranteed to lose.
    generated = await generate(config, {
      ...context,
      needed: {
        title: forceAi || !hasTitleFlag,
        description: forceAi || !hasBodyFlag,
      },
    });
  }

  // AI was never attempted because it is disabled (--skip-ai or
  // ai.provider === 'none'). Record *why*, distinguishing the case where
  // --force-ai was also supplied and had no effect, so aiError is never
  // silently null on a skip path (spec §3.3 / docs/AI-TOOLING.md).
  const aiSkippedReason = aiDisabled ? describeAiSkipReason(overrides) : null;

  // Use the PER-FIELD flags, not the truthiness of the returned strings.
  // `generatePRContentAsync` seeds `title` with `context.description` and
  // returns it untouched when only the description was generated, so a
  // truthy-content check would report titleSource: 'ai' for text no model
  // ever produced — and provenance accuracy is the point of these fields.
  const aiTitle = generated?.titleGenerated && generated.title ? generated.title : undefined;
  const aiBody =
    generated?.descriptionGenerated && generated.description ? generated.description : undefined;

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
    aiError: generated?.error ?? aiSkippedReason,
  };
}

/**
 * Explain why AI generation was not attempted at all.
 *
 * Only called when AI is disabled (--skip-ai or ai.provider === 'none');
 * distinguishes --force-ai being present-but-ineffective from a plain skip,
 * per docs/AI-TOOLING.md's guidance to "check aiError for why generation
 * didn't run".
 */
function describeAiSkipReason(overrides: ContentOverrides): string {
  const forceAiIneffective = overrides.forceAi === true;

  if (overrides.skipAi === true) {
    return forceAiIneffective
      ? 'AI skipped (--skip-ai overrides --force-ai)'
      : 'AI skipped (--skip-ai)';
  }

  // Otherwise disabled via config: ai.provider === 'none'.
  return forceAiIneffective
    ? "AI disabled (ai.provider = 'none'); --force-ai had no effect"
    : "AI disabled (ai.provider = 'none')";
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
