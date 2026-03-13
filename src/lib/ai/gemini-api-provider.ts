/**
 * Gemini API Provider
 *
 * Calls the Gemini REST API directly via Node's built-in fetch.
 * No CLI subprocess, no new dependencies.
 *
 * Auth: GEMINI_API_KEY environment variable
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 */

import { BaseAIProvider, createSuccessResult, createErrorResult } from './base-provider.js';
import type { AIGenerationResult } from './types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 30_000;

/**
 * AI provider that calls the Gemini REST API directly via fetch.
 *
 * Preferred over CLI-based GeminiProvider because:
 * - No subprocess overhead or interactive-agent hangs
 * - Clear error messages on failure
 * - Works with free-tier API keys from https://aistudio.google.com/apikey
 */
export class GeminiAPIProvider extends BaseAIProvider {
  readonly name = 'gemini-api';
  private model: string;

  constructor(model?: string) {
    super();
    this.model = model || DEFAULT_MODEL;
  }

  /**
   * Check if GEMINI_API_KEY is set (static, for lazy factory use)
   */
  static checkAvailability(): Promise<boolean> {
    return Promise.resolve(Boolean(process.env.GEMINI_API_KEY));
  }

  async isAvailable(): Promise<boolean> {
    return GeminiAPIProvider.checkAvailability();
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return createErrorResult('GEMINI_API_KEY environment variable is not set', this.name);
    }

    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      });

      // HTTP error handling
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return createErrorResult('Invalid or blocked API key — check GEMINI_API_KEY', this.name);
        }
        if (response.status === 429) {
          return createErrorResult('Rate limit exceeded — retry later', this.name);
        }
        return createErrorResult(`Gemini API error: HTTP ${response.status}`, this.name);
      }

      // Parse response defensively
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();

      const candidates = data?.candidates;
      if (!candidates || candidates.length === 0) {
        return createErrorResult('No response generated', this.name);
      }

      const candidate = candidates[0];
      if (candidate.finishReason === 'SAFETY') {
        return createErrorResult('Content blocked by safety filters', this.name);
      }

      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) {
        return createErrorResult('Empty response from Gemini API', this.name);
      }

      return createSuccessResult(text, this.name);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return createErrorResult('Request timed out (30s)', this.name);
      }
      if (error instanceof TypeError) {
        return createErrorResult(`Network error: ${error.message}`, this.name);
      }
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Gemini API error: ${message}`, this.name);
    } finally {
      clearTimeout(timeout);
    }
  }
}
