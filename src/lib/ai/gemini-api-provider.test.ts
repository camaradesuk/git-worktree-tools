/**
 * GeminiAPIProvider Tests
 *
 * Tests for direct Gemini REST API provider (no CLI subprocess).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiAPIProvider } from './gemini-api-provider.js';

describe('GeminiAPIProvider', () => {
  const originalEnv = process.env;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  /**
   * Helper to create a successful Gemini API response
   */
  function createGeminiResponse(text: string, finishReason = 'STOP') {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          candidates: [
            {
              content: {
                parts: [{ text }],
              },
              finishReason,
            },
          ],
        }),
    };
  }

  /**
   * Helper to create an HTTP error response
   */
  function createErrorResponse(status: number, body = '{}') {
    return {
      ok: false,
      status,
      json: () => Promise.resolve(JSON.parse(body)),
      text: () => Promise.resolve(body),
    };
  }

  describe('name', () => {
    it('returns gemini-api', () => {
      const provider = new GeminiAPIProvider();
      expect(provider.name).toBe('gemini-api');
    });
  });

  describe('isAvailable', () => {
    it('returns true when GEMINI_API_KEY is set', async () => {
      process.env.GEMINI_API_KEY = 'test-api-key-123';

      const provider = new GeminiAPIProvider();
      const available = await provider.isAvailable();

      expect(available).toBe(true);
    });

    it('returns false when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;

      const provider = new GeminiAPIProvider();
      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('returns false when GEMINI_API_KEY is empty string', async () => {
      process.env.GEMINI_API_KEY = '';

      const provider = new GeminiAPIProvider();
      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('static checkAvailability', () => {
    it('returns true when GEMINI_API_KEY is set', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      expect(await GeminiAPIProvider.checkAvailability()).toBe(true);
    });

    it('returns false when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      expect(await GeminiAPIProvider.checkAvailability()).toBe(false);
    });
  });

  describe('generateBranchName (exercises generate())', () => {
    const branchContext = {
      description: 'Add user authentication',
      repoName: 'test-repo',
      branchPrefix: 'feat',
    };

    it('sends correct request to Gemini API', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createGeminiResponse('feat/add-user-auth'));

      const provider = new GeminiAPIProvider();
      await provider.generateBranchName(branchContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': 'test-key',
          },
        })
      );

      // Verify body structure
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toHaveProperty('contents');
      expect(body.contents[0].parts[0]).toHaveProperty('text');
    });

    it('uses custom model when provided', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createGeminiResponse('feat/add-auth'));

      const provider = new GeminiAPIProvider('gemini-2.0-flash');
      await provider.generateBranchName(branchContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        expect.any(Object)
      );
    });

    it('returns success result on valid response', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createGeminiResponse('feat/add-user-auth'));

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(true);
      expect(result.content).toBe('feat/add-user-auth');
      expect(result.provider).toBe('gemini-api');
    });

    it('returns error when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GEMINI_API_KEY');
      expect(result.provider).toBe('gemini-api');
    });

    it('returns error for 401 response', async () => {
      process.env.GEMINI_API_KEY = 'bad-key';
      mockFetch.mockResolvedValue(createErrorResponse(401));

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or blocked API key');
    });

    it('returns error for 403 response', async () => {
      process.env.GEMINI_API_KEY = 'blocked-key';
      mockFetch.mockResolvedValue(createErrorResponse(403));

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or blocked API key');
    });

    it('returns error for 429 response', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createErrorResponse(429));

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('returns error for other HTTP errors with status code', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createErrorResponse(500));

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('returns error for empty candidates array', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ candidates: [] }),
      });

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No response generated');
    });

    it('returns error for missing candidates', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No response generated');
    });

    it('returns error when finishReason is SAFETY', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createGeminiResponse('', 'SAFETY'));

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content blocked by safety filters');
    });

    it('returns error for empty text in response', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: { parts: [{ text: '' }] },
                finishReason: 'STOP',
              },
            ],
          }),
      });

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty response from Gemini API');
    });

    it('returns error for missing text in parts', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: { parts: [{}] },
                finishReason: 'STOP',
              },
            ],
          }),
      });

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty response from Gemini API');
    });

    it('returns error on fetch timeout (AbortError)', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Request timed out');
    });

    it('returns error on network failure', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('fetch failed');
    });

    it('returns error for non-JSON response', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      const provider = new GeminiAPIProvider();
      const result = await provider.generateBranchName(branchContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('uses default model gemini-2.5-flash', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createGeminiResponse('feat/test'));

      const provider = new GeminiAPIProvider();
      await provider.generateBranchName(branchContext);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('gemini-2.5-flash'),
        expect.any(Object)
      );
    });

    it('passes AbortSignal to fetch', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      mockFetch.mockResolvedValue(createGeminiResponse('feat/test'));

      const provider = new GeminiAPIProvider();
      await provider.generateBranchName(branchContext);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('signal');
      expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
    });
  });
});
