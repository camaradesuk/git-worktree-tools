/**
 * Shared Gemini API error-body parsing.
 *
 * One real payload shape, one parser — used by both `gemini-api-provider.ts`
 * (the actual generation path) and `doctor.ts` (the `wt ai doctor` live
 * probe), so they can never again disagree about what a given failure means.
 *
 * The REAL shape (verified via a live curl against this machine's actual
 * invalid GEMINI_API_KEY) nests the machine-readable `reason` (e.g.
 * `"API_KEY_INVALID"`) inside a `google.rpc.ErrorInfo` entry in
 * `error.details[]`:
 *
 * ```json
 * {
 *   "error": {
 *     "code": 400,
 *     "message": "API key not valid. Please pass a valid API key.",
 *     "status": "INVALID_ARGUMENT",
 *     "details": [
 *       { "@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "API_KEY_INVALID", ... },
 *       { "@type": "type.googleapis.com/google.rpc.LocalizedMessage", "message": "..." }
 *     ]
 *   }
 * }
 * ```
 *
 * A flat `error.reason` is also checked as a fallback, in case Google ever
 * simplifies the response shape.
 */

export interface GeminiErrorBody {
  error?: {
    reason?: string;
    message?: string;
    details?: Array<{ reason?: string }>;
  };
}

/**
 * Extract the machine-readable failure reason (e.g. "API_KEY_INVALID") from
 * a Gemini API error body, checking the real nested `details[]` shape first
 * and falling back to a flat `error.reason`. Returns `undefined` if no
 * reason is present in either shape.
 */
export function extractGeminiErrorReason(body: GeminiErrorBody | undefined): string | undefined {
  const fromDetails = body?.error?.details?.find((d) => typeof d?.reason === 'string')?.reason;
  return fromDetails ?? body?.error?.reason;
}
