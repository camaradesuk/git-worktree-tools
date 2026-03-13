---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/ai/gemini-api-provider.ts
  - src/lib/ai/gemini-api-provider.test.ts
  - src/lib/ai/provider-manager.ts
  - src/lib/ai/types.ts
  - src/lib/ai/index.ts
  - src/lib/config.ts
  - src/cli/newpr.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - 'GeminiAPIProvider calls Gemini REST API directly via fetch (no CLI subprocess)'
    - 'Auto-detection tries gemini-api first (before CLI providers) when GEMINI_API_KEY is set'
    - "provider: 'gemini-api' explicitly selects the new API provider"
    - "provider: 'gemini' still maps to CLI-based GeminiProvider (backwards compat)"
    - 'AI generation failures print visible warnings (not silently swallowed)'
    - 'No duplicate AI status messages in newpr output'
  artifacts:
    - path: 'src/lib/ai/gemini-api-provider.ts'
      provides: 'GeminiAPIProvider class extending BaseAIProvider'
      exports: ['GeminiAPIProvider']
    - path: 'src/lib/ai/gemini-api-provider.test.ts'
      provides: 'Unit tests for GeminiAPIProvider with mocked fetch'
  key_links:
    - from: 'src/lib/ai/provider-manager.ts'
      to: 'src/lib/ai/gemini-api-provider.ts'
      via: 'import and factory registration'
      pattern: 'GeminiAPIProvider'
    - from: 'src/lib/ai/gemini-api-provider.ts'
      to: 'https://generativelanguage.googleapis.com'
      via: 'fetch with x-goog-api-key header'
      pattern: 'generativelanguage.googleapis.com'
    - from: 'src/lib/config.ts'
      to: 'src/lib/ui/status.ts'
      via: 'printStatus for error visibility'
      pattern: 'printStatus'
---

<objective>
Implement a GeminiAPIProvider that calls the Gemini REST API directly via Node's built-in fetch,
bypassing CLI tools that hang on one-shot prompts. Also make AI generation errors visible to users
and clean up duplicate status messages in newpr.ts.

Purpose: The existing CLI-based AI providers (claude -p, gemini -p, codex exec) shell out to
interactive agent tools that hang or timeout silently. This adds a working provider using direct
HTTP, makes failures visible, and establishes the pattern for future API providers.

Output: Working gemini-api provider, updated auto-detection priority, visible error messaging,
clean newpr output.
</objective>

<execution_context>
@/home/chris/.claude/get-shit-done/workflows/execute-plan.md
@/home/chris/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/superpowers/specs/2026-03-13-gemini-api-provider-design.md

<interfaces>
<!-- Key types and contracts from existing codebase -->

From src/lib/ai/base-provider.ts:

```typescript
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  abstract isAvailable(): Promise<boolean>;
  protected abstract generate(prompt: string): Promise<AIGenerationResult>;
  // Inherited: generateBranchName, generatePRTitle, generatePRDescription, etc.
}
export function createSuccessResult(content: string, provider: string): AIGenerationResult;
export function createErrorResult(error: string, provider: string): AIGenerationResult;
```

From src/lib/ai/types.ts:

```typescript
export type AIProviderName =
  | 'auto'
  | 'claude'
  | 'gemini'
  | 'openai'
  | 'ollama'
  | 'script'
  | 'fallback'
  | 'none';
export interface AIGenerationResult {
  success: boolean;
  content?: string;
  error?: string;
  provider: string;
}
export interface AIConfig {
  provider?: AIProviderName;
  gemini?: { model?: string }; /* ... */
}
```

From src/lib/ai/provider-manager.ts:

```typescript
interface LazyProviderFactory {
  name: string;
  checkAvailability: () => Promise<boolean>;
  create: () => AIProvider;
}
// resolveProvider: switch on AIProviderName
// getLazyProviderFactories: returns LazyProviderFactory[] for auto-detection order
// createXxxProvider helper methods follow pattern: find factory, check availability, create or return null
```

From src/lib/ui/status.ts:

```typescript
export function printStatus(type: StatusType, message: string): void;
// StatusType = 'info' | 'success' | 'warning' | 'error'
```

From src/lib/config.ts:

```typescript
export async function generatePRContentAsync(
  config: ResolvedConfig,
  context: PRGenerationContext
): Promise<PRGenerationResult>;
// Currently uses logger.debug for errors (invisible to user)
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create GeminiAPIProvider with tests</name>
  <files>src/lib/ai/gemini-api-provider.ts, src/lib/ai/gemini-api-provider.test.ts, src/lib/ai/types.ts, src/lib/ai/index.ts</files>
  <behavior>
    - isAvailable returns true when GEMINI_API_KEY env var is set and non-empty
    - isAvailable returns false when GEMINI_API_KEY is unset or empty
    - Static checkAvailability() follows same logic as isAvailable
    - generate() sends POST to generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    - generate() uses x-goog-api-key header for auth (not query param)
    - generate() uses AbortController with 30s timeout
    - generate() extracts text from candidates[0].content.parts[0].text on success
    - generate() returns clear error for 401/403 ("Invalid or blocked API key")
    - generate() returns clear error for 429 ("Rate limit exceeded")
    - generate() returns clear error for other HTTP errors with status code
    - generate() returns error for empty candidates array
    - generate() returns error when finishReason is 'SAFETY'
    - generate() returns error for non-JSON responses
    - generate() returns error on fetch timeout (AbortError)
    - Default model is 'gemini-2.5-flash'
    - Provider name is 'gemini-api'
  </behavior>
  <action>
    1. Update `src/lib/ai/types.ts`:
       - Add `'gemini-api'` to the `AIProviderName` union type (between `'gemini'` and `'openai'`)
       - Update the `AIConfig.provider` docstring to include `'gemini-api'`

    2. Create `src/lib/ai/gemini-api-provider.ts` (~100 lines):
       - Import `BaseAIProvider`, `createSuccessResult`, `createErrorResult` from `./base-provider.js`
       - Import `AIGenerationResult` from `./types.js`
       - Class `GeminiAPIProvider extends BaseAIProvider`
       - `readonly name = 'gemini-api'`
       - Constructor takes `model = 'gemini-2.5-flash'`, stores as private field
       - `static checkAvailability(): Promise<boolean>` -- checks `process.env.GEMINI_API_KEY` is truthy
       - `async isAvailable(): Promise<boolean>` -- delegates to static method
       - `protected async generate(prompt: string): Promise<AIGenerationResult>`:
         - Read key from `process.env.GEMINI_API_KEY`
         - If no key, return error result "GEMINI_API_KEY environment variable is not set"
         - Build URL: `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`
         - Create AbortController with 30s timeout via setTimeout
         - fetch POST with headers `{ 'Content-Type': 'application/json', 'x-goog-api-key': key }`
         - Body: `{ contents: [{ parts: [{ text: prompt }] }] }`
         - HTTP error handling in order: 401/403, 429, other non-2xx
         - Parse JSON response defensively:
           - No candidates or empty → error "No response generated"
           - finishReason === 'SAFETY' → error "Content blocked by safety filters"
           - Extract `candidates[0].content.parts[0].text`
           - If no text → error "Empty response from Gemini API"
         - Catch blocks: AbortError → "Request timed out (30s)", TypeError (fetch/network) → include message, generic → include message
         - Always clearTimeout in finally block

    3. Update `src/lib/ai/index.ts`:
       - Add `export { GeminiAPIProvider } from './gemini-api-provider.js';`

    4. Create `src/lib/ai/gemini-api-provider.test.ts`:
       - Mock global `fetch` using `vi.fn()` (vi.stubGlobal('fetch', ...))
       - Test availability based on GEMINI_API_KEY env var (set/unset/empty)
       - Test successful generation with properly structured response
       - Test HTTP error handling: 401, 403, 429, 500
       - Test defensive parsing: empty candidates, SAFETY finishReason, missing text
       - Test timeout handling (AbortError)
       - Test non-JSON response handling
       - Follow existing test patterns from cli-provider.test.ts (beforeEach/afterEach env cleanup)

  </action>
  <verify>
    <automated>cd /home/chris/workspace/git-worktree-tools && pnpm test -- --run src/lib/ai/gemini-api-provider.test.ts</automated>
  </verify>
  <done>
    - GeminiAPIProvider class exists with all documented error handling
    - AIProviderName union includes 'gemini-api'
    - All unit tests pass covering success, HTTP errors, safety blocks, timeouts, empty responses
    - GeminiAPIProvider exported from src/lib/ai/index.ts
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire provider into manager, add error visibility, clean up newpr</name>
  <files>src/lib/ai/provider-manager.ts, src/lib/config.ts, src/cli/newpr.ts</files>
  <action>
    1. Update `src/lib/ai/provider-manager.ts`:
       - Add import: `import { GeminiAPIProvider } from './gemini-api-provider.js';`
       - In `resolveProvider()` switch: add `case 'gemini-api': return this.createGeminiAPIProvider();` (before the existing `'gemini'` case)
       - In `getLazyProviderFactories()`: add GeminiAPIProvider as FIRST entry in the returned array (before claude/gemini/ollama/openai):
         ```
         {
           name: 'gemini-api',
           checkAvailability: () => GeminiAPIProvider.checkAvailability(),
           create: () => new GeminiAPIProvider(this.config.gemini?.model),
         },
         ```
       - Add private helper method `createGeminiAPIProvider()` following the existing pattern (find factory by name, check availability, create or return null)

    2. Update `src/lib/config.ts` -- `generatePRContentAsync` function:
       - Add import for `printStatus` from `'./ui/index.js'` at top of file
       - After the `if (anyGenerated)` block (around line 935-937), add success status message:
         ```typescript
         if (anyGenerated) {
           printStatus('info', `\u2728 AI-generated PR content (${titleResult?.provider ?? descResult?.provider ?? 'ai'})`);
           return { title, description, aiGenerated: true };
         }
         ```
         To get the provider name, capture it from `titleResult` or `descResult` (whichever succeeded). Both are `AIGenerationResult` which has a `provider` field.
       - In the `catch` block (around line 938-944), change `logger.debug(...)` to:
         ```typescript
         const reason = error instanceof Error ? error.message : String(error);
         printStatus('warning', `\u26A0 AI generation failed: ${reason}`);
         ```
         Keep the fall-through to defaults behavior.
       - After the AI-enabled check (the `if (config.ai.provider !== 'none' && ...)` block), when AI is not enabled/configured, do NOT add a message (the "No AI provider" info message only makes sense if provider is 'auto' and nothing was found -- this is already handled by the fallback returning the raw description).

    3. Update `src/cli/newpr.ts`:
       - Remove lines 734-736 (the `if (prContent.aiGenerated) { printStatus('info', '\u2728 AI-generated PR content'); }` block in `modeExistingBranch`)
       - Remove lines 1108-1110 (the same pattern in `modeNewFeature`)
       - These status messages are now emitted from within `generatePRContentAsync` itself, avoiding duplication
       - After removal, verify that no other code references the removed blocks

    4. Run the full test suite to ensure no regressions.

  </action>
  <verify>
    <automated>cd /home/chris/workspace/git-worktree-tools && pnpm test -- --run</automated>
  </verify>
  <done>
    - provider-manager resolveProvider handles 'gemini-api' case
    - Auto-detection priority: gemini-api (first) > claude > gemini > ollama > openai
    - generatePRContentAsync prints visible status on success and warning on failure
    - newpr.ts no longer has duplicate AI status message blocks
    - All 231+ existing tests still pass
    - Build succeeds (pnpm run build)
  </done>
</task>

</tasks>

<verification>
1. `pnpm test -- --run` -- all tests pass including new gemini-api-provider tests
2. `pnpm run build` -- TypeScript compiles without errors
3. Grep verification:
   - `grep -n "gemini-api" src/lib/ai/types.ts` shows it in AIProviderName union
   - `grep -n "GeminiAPIProvider" src/lib/ai/provider-manager.ts` shows import and factory
   - `grep -n "GeminiAPIProvider" src/lib/ai/index.ts` shows export
   - `grep -n "printStatus" src/lib/config.ts` shows error visibility calls
   - `grep -n "aiGenerated" src/cli/newpr.ts` should return NO matches (blocks removed)
</verification>

<success_criteria>

- GeminiAPIProvider makes direct HTTP calls to Gemini REST API (no subprocess)
- Auto-detection prioritizes API-based providers over CLI-based ones
- AI generation errors are visible to the user as warnings (not swallowed)
- No duplicate status messages in newpr output
- All tests pass, build succeeds
  </success_criteria>

<output>
After completion, create `.planning/quick/1-implement-gemini-api-provider-for-ai-pr-/1-SUMMARY.md`
</output>
