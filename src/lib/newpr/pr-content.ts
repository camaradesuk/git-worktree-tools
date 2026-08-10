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
