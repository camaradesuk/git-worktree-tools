# Design: Gemini API Provider for AI PR Generation

## Problem

All current AI providers shell out to CLI tools (`claude -p`, `gemini -p`, `codex exec`). These CLIs are interactive agent tools that perform heavy initialization (MCP servers, session management, auth flows) before making API calls. When invoked via `spawnSync` for a one-shot prompt, they hang or timeout silently.

The result: AI PR generation is configured and enabled in `.worktreerc`, but never actually works. Errors are silently swallowed in `generatePRContentAsync`, so the user sees their raw description as the PR title with no indication that AI was attempted and failed.

## Solution

Add a `GeminiAPIProvider` that calls the Gemini REST API directly using Node's built-in `fetch`. No CLI subprocess, no new dependencies.

## Architecture

### Provider hierarchy

```
BaseAIProvider (abstract)
├── GeminiAPIProvider   (NEW - direct fetch to REST API)
├── ClaudeProvider      (CLI - existing, kept for backwards compat)
├── GeminiProvider      (CLI - existing, kept for backwards compat)
├── OllamaProvider      (existing, works if ollama running)
├── OpenAIProvider      (CLI - existing)
├── ScriptProvider      (existing)
└── FallbackProvider    (existing, no AI - returns raw description)
```

### Auto-detection priority (`provider: "auto"`)

API-based providers first, CLI-based as fallback:

1. **Gemini API** - if `GEMINI_API_KEY` env var is set
2. **Ollama** - if server is running locally
3. **Claude CLI** - if `claude` is on PATH
4. **Gemini CLI** - if `gemini` is on PATH
5. **OpenAI CLI** - if `codex` is on PATH

### Provider name disambiguation

- `provider: "auto"` — uses the priority order above
- `provider: "gemini"` — still maps to the CLI-based `GeminiProvider` (backwards compat). Users with `GEMINI_API_KEY` should use `"auto"` or `"gemini-api"` explicitly.
- `provider: "gemini-api"` — explicitly selects the new API provider

### Error visibility

Current behavior: errors are `logger.debug` only — completely invisible.

New behavior (messages printed from `generatePRContentAsync` in `config.ts`):

- **Success**: `✨ AI-generated PR content (gemini-api)`
- **Failure**: `⚠ AI generation failed (gemini-api): <reason>` — then falls through to current behavior (raw description as title, empty body). PR still gets created.
- **No provider**: `ℹ No AI provider configured — set GEMINI_API_KEY for AI-generated PR content`

The existing `printStatus` calls in `newpr.ts` (lines 734-736 and 1108-1109) will be removed — all status messaging moves into `generatePRContentAsync` to avoid duplication. The `PRGenerationResult.aiGenerated` field is still set so callers can check programmatically if needed.

AI is always best-effort. The PR creation flow never blocks or fails due to AI errors.

## Files changed

### New file: `src/lib/ai/gemini-api-provider.ts` (~100 lines)

```typescript
export class GeminiAPIProvider extends BaseAIProvider {
  readonly name = 'gemini-api';

  constructor(model = 'gemini-2.5-flash') { ... }

  static checkAvailability(): Promise<boolean> {
    // Check GEMINI_API_KEY env var exists and is non-empty
    return Promise.resolve(Boolean(process.env.GEMINI_API_KEY));
  }

  async isAvailable(): Promise<boolean> {
    return GeminiAPIProvider.checkAvailability();
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    // Auth via x-goog-api-key header (not query param — avoids key leaking in error URLs)
    // POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    // Headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }
    // Body: { contents: [{ parts: [{ text: prompt }] }] }
    // Timeout: 30 seconds via AbortController
    //
    // Response parsing (defensive):
    //   - Check candidates array is non-empty
    //   - Check finishReason !== 'SAFETY' (content blocked by safety filters)
    //   - Extract candidates[0].content.parts[0].text
    //   - Return clear error messages for each failure mode
    //
    // HTTP error handling:
    //   - 401/403: "Invalid or blocked API key — check GEMINI_API_KEY"
    //   - 429: "Rate limit exceeded — retry later"
    //   - Other non-2xx: include status code in error message
    //   - Non-JSON response: "Unexpected response from Gemini API"
  }
}
```

### Modified: `src/lib/ai/provider-manager.ts`

- Import `GeminiAPIProvider`
- Add `'gemini-api'` case to `resolveProvider()`
- Add `GeminiAPIProvider` as first entry in `getLazyProviderFactories()` (before CLI providers)
- Add `createGeminiAPIProvider()` helper method

### Modified: `src/lib/ai/types.ts`

- Add `'gemini-api'` to `AIProviderName` union type
- Update `AIConfig.provider` docstring to include `'gemini-api'`

### Modified: `src/lib/ai/index.ts`

- Export `GeminiAPIProvider` from the new file

### Modified: `src/lib/config.ts`

- In `generatePRContentAsync`: replace silent `logger.debug` with visible `printStatus('warning', ...)` on failure
- Add `printStatus('info', ...)` when no provider is available
- Include provider name in success message: `printStatus('info', '✨ AI-generated PR content (...)')`

### Modified: `src/cli/newpr.ts`

- Remove the `if (prContent.aiGenerated) { printStatus(...) }` blocks at lines 734-736 and 1108-1110 — status messaging is now handled inside `generatePRContentAsync`

### Tests

- Unit tests for `GeminiAPIProvider` with mocked `fetch`
- Test auto-detection priority order
- Test error visibility (warning messages on failure)
- Test defensive response parsing (empty candidates, safety blocks, non-JSON)

## Config

No config changes required. Existing `.worktreerc` works as-is:

```json
{
  "ai": {
    "provider": "auto",
    "prTitle": true,
    "prDescription": true
  }
}
```

Both `GeminiAPIProvider` and `GeminiProvider` (CLI) share the `ai.gemini` config section — they use the same model names, so this is intentional:

```json
{
  "ai": {
    "gemini": { "model": "gemini-2.5-flash" }
  }
}
```

## Env var

`GEMINI_API_KEY` — read from `process.env` at runtime. Free tier available at https://aistudio.google.com/apikey (no billing required).

## API details

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Auth: `x-goog-api-key` header (not query param — prevents key leaking in error messages/logs)
- Default model: `gemini-2.5-flash`
- Timeout: 30 seconds via `AbortController`
- No streaming — single request/response
- No new dependencies — uses Node's built-in `fetch` (stable since Node 18.13+)
