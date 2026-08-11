import { describe, it, expect } from 'vitest';
import { extractGeminiErrorReason } from './gemini-error.js';

describe('extractGeminiErrorReason', () => {
  it('extracts the reason from the real nested error.details[] shape', () => {
    const body = {
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'API_KEY_INVALID',
            domain: 'googleapis.com',
            metadata: { service: 'generativelanguage.googleapis.com' },
          },
          {
            '@type': 'type.googleapis.com/google.rpc.LocalizedMessage',
            locale: 'en-US',
            message: 'API key not valid. Please pass a valid API key.',
          },
        ],
      },
    };

    expect(extractGeminiErrorReason(body)).toBe('API_KEY_INVALID');
  });

  it('falls back to a flat error.reason field', () => {
    const body = { error: { reason: 'API_KEY_INVALID', message: 'x' } };
    expect(extractGeminiErrorReason(body)).toBe('API_KEY_INVALID');
  });

  it('prefers the nested details[] reason over a flat error.reason if both are present', () => {
    const body = {
      error: {
        reason: 'FLAT_REASON',
        details: [{ reason: 'NESTED_REASON' }],
      },
    };
    expect(extractGeminiErrorReason(body)).toBe('NESTED_REASON');
  });

  it('returns undefined when neither shape has a reason', () => {
    expect(extractGeminiErrorReason({ error: { message: 'no reason here' } })).toBeUndefined();
  });

  it('returns undefined for an undefined body', () => {
    expect(extractGeminiErrorReason(undefined)).toBeUndefined();
  });

  it('returns undefined when details[] entries have no reason field', () => {
    const body = { error: { details: [{ '@type': 'x' } as { reason?: string }] } };
    expect(extractGeminiErrorReason(body)).toBeUndefined();
  });

  // The body is untrusted JSON off the wire, so it can contradict the type.
  // This parser runs inside an error handler: throwing here would replace a
  // clear diagnostic with a stack trace, so malformed shapes must degrade.
  it.each([
    ['details is a string', { error: { details: 'not-an-array' } }],
    ['details is an object', { error: { details: { reason: 'X' } } }],
    ['details is null', { error: { details: null } }],
    ['details entry is null', { error: { details: [null] } }],
    ['error is a string', { error: 'boom' }],
    ['flat reason is not a string', { error: { reason: 42 } }],
  ])('does not throw and returns undefined when %s', (_label, body) => {
    expect(() => extractGeminiErrorReason(body as never)).not.toThrow();
    expect(extractGeminiErrorReason(body as never)).toBeUndefined();
  });
});
