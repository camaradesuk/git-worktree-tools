# Phase 4: JSON Output and LLM Ergonomics - Research

**Researched:** 2026-02-18
**Domain:** CLI JSON output consistency, MCP server annotations, shell completions
**Confidence:** HIGH

## Summary

Phase 4 targets four areas that make git-worktree-tools fully machine-consumable: (1) patching every CLI code path so `--json` always produces valid JSON, (2) auditing help text for accuracy, (3) enriching the MCP server with annotations and output schemas, and (4) ensuring shell completions cover all subcommands and flags.

The codebase already has a solid JSON output foundation: `CommandResult<T>` envelope, `ErrorCode` enum (18 codes), factory functions (`createSuccessResult`, `createErrorResult`, `formatJsonResult`), and a JSON mode gate (`setJsonMode`/`print`/`printErr`). However, audit reveals several CLIs with gaps where error paths bypass JSON output, one CLI (`prs`) uses a custom JSON type instead of `CommandResult<T>`, and two CLIs (`wtconfig`, `wt init`) have no JSON support at all. The MCP server (5 tools) uses the low-level `Server` API with no `annotations` or `outputSchema`, and its descriptions lack example responses.

**Primary recommendation:** Systematic audit-and-patch of every `process.exit(1)` and `.catch()` in all CLIs to ensure JSON output, then annotate MCP tools with `ToolAnnotations` and `outputSchema` using the existing `CommandResult<T>` types.

## Standard Stack

### Core

| Library                     | Version | Purpose                                         | Why Standard                                            |
| --------------------------- | ------- | ----------------------------------------------- | ------------------------------------------------------- |
| `@modelcontextprotocol/sdk` | ^1.25.1 | MCP server implementation                       | Official SDK, supports `annotations` and `outputSchema` |
| yargs                       | ^17.7.2 | CLI arg parsing (prs, wtlink, wt)               | Already used across all yargs-based CLIs                |
| Custom arg parser           | N/A     | CLI arg parsing (newpr, lswt, cleanpr, wtstate) | 4 CLIs use manual `parseArgs()` instead of yargs        |

### Supporting

| Library                  | Version | Purpose                                            | When to Use                 |
| ------------------------ | ------- | -------------------------------------------------- | --------------------------- |
| `src/lib/json-output.ts` | N/A     | `CommandResult<T>`, `ErrorCode`, factory functions | Every JSON output path      |
| `src/lib/ui/output.ts`   | N/A     | `setJsonMode()`, `print()`, `printErr()` JSON gate | All CLIs with `--json` flag |
| `src/lib/ui/error.ts`    | N/A     | `printError()`, `errorToDisplay()`                 | CLI error catch handlers    |

### Alternatives Considered

| Instead of                    | Could Use                  | Tradeoff                                                                                                                                                                                                                                                 |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual `Tool[]` array for MCP | `McpServer` high-level API | High-level API has `tool()` method with annotations/outputSchema support built-in, but would require rewriting the entire server; current low-level approach works fine by adding `annotations` and `outputSchema` fields to the `Tool` objects directly |

## Architecture Patterns

### Existing JSON Output Pattern

Every CLI that supports `--json` follows this pattern:

```
src/
├── cli/
│   └── <command>.ts          # CLI entry point
│       ├── hasJsonFlag()     # Early check before yargs parsing
│       ├── setJsonMode()     # Activate JSON mode gate
│       ├── outputJsonError() # JSON error output helper
│       └── main().catch()    # Final error handler (must check JSON)
├── lib/
│   ├── json-output.ts        # CommandResult<T>, ErrorCode, factories
│   └── ui/
│       ├── output.ts         # setJsonMode(), print(), printErr()
│       └── error.ts          # printError(), errorToDisplay()
└── api/
    └── <command>.ts           # Returns CommandResult<T> (used by MCP)
```

### Pattern 1: CLI Error Catch with JSON Awareness

**What:** Every `main().catch()` and `.fail()` handler must check JSON mode and output structured JSON errors.
**When to use:** All CLI entry points.
**Example (from `src/cli/lswt.ts` - correct pattern):**

```typescript
main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const jsonMode = hasJsonFlag(process.argv.slice(2));
  if (jsonMode) {
    outputJsonError(ErrorCode.UNKNOWN_ERROR, message);
  } else {
    console.error(colors.error(`Error: ${message}`));
  }
  process.exit(1);
});
```

### Pattern 2: MCP Tool Definition with Annotations

**What:** Each MCP tool should include `annotations` and `outputSchema` alongside `inputSchema`.
**When to use:** All tools in `src/mcp/server.ts`.
**Example (from MCP SDK v1.25.1 types):**

```typescript
const tool: Tool = {
  name: 'worktree_get_state',
  description: 'Analyze current git state...',
  annotations: {
    title: 'Get Worktree State',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    /* ... */
  },
  // outputSchema is available on Tool type in SDK v1.25.1
};
```

### Pattern 3: CommandResult<T> Envelope

**What:** Standard JSON envelope for all command output.
**When to use:** All `--json` output paths.

```typescript
interface CommandResult<T> {
  success: boolean;
  command: string;
  timestamp: string;
  data?: T; // Present when success is true
  error?: ErrorInfo; // Present when success is false
  warnings?: string[];
}

interface ErrorInfo {
  code: ErrorCode;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}
```

### Anti-Patterns to Avoid

- **Bypassing JSON gate with `console.log()` / `console.error()`:** Always use `print()` / `printErr()` for messages that should be suppressed in JSON mode. Direct console usage leaks human-readable text into JSON output.
- **Custom JSON types instead of `CommandResult<T>`:** The `prs` command uses `PrsJsonOutput` which duplicates the `CommandResult` structure. All JSON output should use `CommandResult<T>`.
- **Missing JSON check in error paths:** Several `.fail()` and `.catch()` handlers output human text without checking `--json` flag. Every error exit must be JSON-aware.

## Don't Hand-Roll

| Problem               | Don't Build                                               | Use Instead                                    | Why                                                                |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| JSON error output     | Custom `JSON.stringify({ error: ... })`                   | `createErrorResult()` + `formatJsonResult()`   | Ensures consistent envelope with ErrorCode, suggestion, timestamp  |
| JSON mode gating      | Manual `if (jsonMode)` checks on every `console.log`      | `setJsonMode()` + `print()`/`printErr()`       | Phase 2 decision 02-01 established this as the single gate         |
| Error-to-code mapping | Manual switch on error message                            | `getErrorCodeFromError()` + `errorToDisplay()` | Phase 2 decision 02-02 established this pattern                    |
| MCP error responses   | Inline `JSON.stringify({ success: false, error: {...} })` | `createErrorResult()` from `json-output.ts`    | MCP server already uses API layer which returns `CommandResult<T>` |

**Key insight:** The infrastructure for JSON output already exists and is well-designed. The work is auditing all code paths to ensure they USE the infrastructure consistently, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Error Paths That Skip JSON Output

**What goes wrong:** A CLI has `--json` support on the happy path but an early error exit (e.g., "not in a git repo") outputs human text to stderr instead of JSON to stdout.
**Why it happens:** Error paths are added before JSON mode is initialized, or `.fail()` / `.catch()` handlers are written without considering JSON mode.
**How to avoid:** For every `process.exit(1)` call in every CLI, verify that JSON mode is checked and a `CommandResult` error is output.
**Warning signs:** `console.error()` calls not wrapped in JSON mode checks near `process.exit(1)`.

**Specific instances found:**

| File                  | Line(s) | Issue                                                                                              |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `src/cli/wtstate.ts`  | 30-35   | Parse error path outputs `colors.error()` without JSON check                                       |
| `src/cli/wtstate.ts`  | 98-101  | `main().catch()` outputs to stderr without JSON check                                              |
| `src/cli/wtlink.ts`   | 272-283 | `.fail()` handler uses `printError()` (respects JSON gate) but does NOT output a JSON error object |
| `src/cli/wtlink.ts`   | 292-300 | `.catch()` handler same issue                                                                      |
| `src/cli/wt.ts`       | 169-176 | `.fail()` handler uses `printError()` but does NOT output JSON error                               |
| `src/cli/wt.ts`       | 178-182 | `.catch()` handler same issue                                                                      |
| `src/cli/wtconfig.ts` | 65-67   | `main().catch()` outputs to stderr with no JSON support                                            |
| `src/cli/prs.ts`      | 107-108 | `isMain` detection relies on fragile `import.meta.url` check                                       |

### Pitfall 2: PrsJsonOutput Type Inconsistency

**What goes wrong:** `prs --json` output follows a structure similar to `CommandResult<T>` but is a separate type (`PrsJsonOutput` in `src/lib/prs/types.ts`), meaning consumers must handle two different JSON schemas.
**Why it happens:** The `prs` command was developed with its own types before the `CommandResult<T>` pattern was established.
**How to avoid:** Migrate `prs` JSON output to use `CommandResult<PrsData>` where `PrsData` contains the existing data structure.
**Warning signs:** JSON output with `success`, `command`, `timestamp` fields but not using `createSuccessResult()` / `formatJsonResult()`.

### Pitfall 3: Commands Without Any JSON Support

**What goes wrong:** `wtconfig` (except `migrate`) and `wt init` have no `--json` flag at all. AI agents calling these commands get human-formatted text that's hard to parse.
**Why it happens:** These commands were built as purely interactive tools.
**How to avoid:** Add `--json` support to all commands, even if it's minimal (e.g., `wtconfig show --json` outputs the merged config as JSON, `wtconfig validate --json` outputs validation results as JSON).
**Warning signs:** CLI entry points with no `json` option in their arg parser.

### Pitfall 4: MCP Descriptions Lack Response Examples

**What goes wrong:** An LLM calling MCP tools doesn't know what response structure to expect, leading to parsing errors or incorrect assumptions about the data shape.
**Why it happens:** MCP tools were implemented with minimal descriptions focused on input parameters.
**How to avoid:** Add example JSON responses to each tool description, and add `outputSchema` to define the response structure programmatically.
**Warning signs:** Tool descriptions that only describe what the tool does, not what it returns.

### Pitfall 5: Shell Completion Scripts Missing New Flags/Commands

**What goes wrong:** After adding `--json` to commands that didn't have it, or after adding the `prs` subcommand, the completion scripts don't include the new options.
**Why it happens:** Completion scripts (`src/cli/wt/completion.ts`) are static string templates that must be manually updated.
**How to avoid:** After any flag/command changes in Phase 4, audit and update all three completion scripts (bash, zsh, fish).
**Warning signs:** Commands or flags that work but don't auto-complete.

**Specific completion gaps found:**

- `prs` subcommand is **missing** from all three completion scripts (bash delegates to yargs, but zsh and fish have explicit command lists without `prs`)
- `init` subcommand is **missing** from zsh and fish completion scripts
- `config/cfg` completions list only `show`, `init`, `edit` - missing `set`, `get`, `validate`, `migrate`
- `clean/c` completions are missing `--delete-remote` flag
- `state/s` completions are missing `--verbose` and `--base-branch` flags

## Code Examples

### Example 1: Fixing wtstate Parse Error JSON Gap

```typescript
// BEFORE (src/cli/wtstate.ts lines 30-35):
if (result.kind === 'error') {
  if (result.message) {
    console.error(colors.error(result.message));
  }
  process.exit(1);
}

// AFTER:
if (result.kind === 'error') {
  // Need to check if --json was in raw args since parseArgs failed
  const jsonMode = process.argv.slice(2).includes('--json');
  if (jsonMode) {
    const errorResult = createErrorResult(
      'wtstate',
      ErrorCode.INVALID_ARGUMENT,
      result.message || 'Invalid arguments'
    );
    console.log(formatJsonResult(errorResult));
  } else if (result.message) {
    console.error(colors.error(result.message));
  }
  process.exit(1);
}
```

### Example 2: Adding MCP Tool Annotations

```typescript
// Source: @modelcontextprotocol/sdk v1.25.1 ToolAnnotations interface
{
  name: 'worktree_get_state',
  description: 'Analyze current git state and return available actions.\n\n'
    + 'Returns a CommandResult<WtstateResultData> with:\n'
    + '- scenario: Git state scenario identifier\n'
    + '- availableActions: Actions the user can take\n'
    + '- recommendedAction: Best default action\n\n'
    + 'Call this BEFORE creating a PR to understand options.',
  annotations: {
    title: 'Get Worktree State',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: { /* existing */ },
}
```

### Example 3: Migrating PrsJsonOutput to CommandResult<T>

```typescript
// BEFORE (src/lib/prs/command.ts):
const output: PrsJsonOutput = {
  success: true,
  command: 'prs',
  timestamp: new Date().toISOString(),
  data: { total, filters, prs: filteredPrs },
};
console.log(JSON.stringify(output, null, 2));

// AFTER:
interface PrsResultData {
  total: number;
  filters: {
    /* ... */
  };
  prs: PrDisplayItem[];
}
const result = createSuccessResult<PrsResultData>('prs', {
  total: filteredPrs.length,
  filters: {
    /* ... */
  },
  prs: filteredPrs,
});
console.log(formatJsonResult(result));
```

### Example 4: Adding JSON Support to wtconfig show

```typescript
// New --json support for wtconfig show
async function showConfig(jsonMode: boolean): Promise<void> {
  const repoRoot = findRepoRoot();
  const config = loadMergedConfig(repoRoot ?? undefined);
  const source = getConfigSource(repoRoot ?? undefined);

  if (jsonMode) {
    const result = createSuccessResult('wtconfig', {
      subcommand: 'show',
      source: source.type === 'none' ? null : source.path,
      config,
    });
    console.log(formatJsonResult(result));
    return;
  }
  // ... existing human-readable output
}
```

## State of the Art

| Old Approach                           | Current Approach                                              | When Changed                        | Impact                                              |
| -------------------------------------- | ------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| MCP tools with basic descriptions only | MCP tools with `annotations` + `outputSchema`                 | MCP SDK 2025-04 (spec v2025-06-18)  | AI agents get semantic metadata about tool behavior |
| `Tool` type with only `inputSchema`    | `Tool` type with `inputSchema`, `outputSchema`, `annotations` | `@modelcontextprotocol/sdk` ^1.25.1 | Enables structured output validation and tool hints |
| Custom JSON output per command         | Unified `CommandResult<T>` envelope                           | This project's Phase 2              | Consistent JSON structure across all commands       |

**Deprecated/outdated:**

- Using MCP tools without `annotations`: While still functional, `annotations` are part of the MCP spec and help AI agents make better tool selection decisions (e.g., knowing `worktree_get_state` is read-only avoids unnecessary confirmation prompts).

## Comprehensive Audit Results

### CLI JSON Mode Support Matrix

| CLI            | `--json` Flag  |  Happy Path JSON  |   Error Path JSON    |   `.fail()` JSON   | `.catch()` JSON | Notes                                                            |
| -------------- | :------------: | :---------------: | :------------------: | :----------------: | :-------------: | ---------------------------------------------------------------- |
| `newpr`        |      Yes       |        Yes        |         Yes          | N/A (manual args)  |       Yes       | Most comprehensive. Uses `exitWithError()` helper.               |
| `lswt`         |      Yes       |        Yes        |         Yes          | N/A (manual args)  |       Yes       | Clean implementation.                                            |
| `cleanpr`      |      Yes       |        Yes        |         Yes          | N/A (manual args)  |       Yes       | Handles specific PR, all PRs, dry-run.                           |
| `wtstate`      |      Yes       |        Yes        | **NO** (parse error) | N/A (manual args)  |     **NO**      | Two gaps: parse error + main().catch()                           |
| `wtlink`       |      Yes       |      Partial      |       Partial        |       **NO**       |     **NO**      | Subcommand handlers unclear. .fail()/.catch() don't output JSON. |
| `prs`          |      Yes       | Yes (custom type) |         Yes          | N/A (yargs via wt) |       Yes       | Uses `PrsJsonOutput` not `CommandResult<T>`                      |
| `wtconfig`     | `migrate` only |  `migrate` only   |    `migrate` only    | N/A (manual args)  |     **NO**      | show/set/get/edit/validate have no JSON support                  |
| `wt` (unified) |   Inherited    |     Inherited     |      Inherited       |       **NO**       |     **NO**      | `.fail()` and `.catch()` don't output JSON                       |
| `wt init`      |       No       |        No         |          No          |        N/A         |       N/A       | Purely interactive, no JSON support                              |

### MCP Tool Annotation Matrix

| Tool                 | `annotations` | `outputSchema` |   Description Quality    | Suggested Annotations                                               |
| -------------------- | :-----------: | :------------: | :----------------------: | ------------------------------------------------------------------- |
| `worktree_get_state` |      No       |       No       | Good (explains workflow) | readOnly=true, destructive=false, idempotent=true, openWorld=false  |
| `worktree_create_pr` |      No       |       No       | Good (mentions actions)  | readOnly=false, destructive=false, idempotent=false, openWorld=true |
| `worktree_setup_pr`  |      No       |       No       |          Basic           | readOnly=false, destructive=false, idempotent=true, openWorld=true  |
| `worktree_list`      |      No       |       No       |         Minimal          | readOnly=true, destructive=false, idempotent=true, openWorld=true   |
| `worktree_clean`     |      No       |       No       |          Basic           | readOnly=false, destructive=true, idempotent=true, openWorld=false  |

### Shell Completion Coverage

| Subcommand |    bash     |  zsh   |  fish  |               Flags Complete                |
| ---------- | :---------: | :----: | :----: | :-----------------------------------------: |
| new/n      | Yes (yargs) |  Yes   |  Yes   |     Mostly (missing some action values)     |
| list/ls    | Yes (yargs) |  Yes   |  Yes   |        Mostly (missing `--refresh`)         |
| clean/c    | Yes (yargs) |  Yes   |  Yes   |          Missing `--delete-remote`          |
| link/l     | Yes (yargs) |  Yes   |  Yes   |         Minimal (only subcommands)          |
| state/s    | Yes (yargs) |  Yes   |  Yes   |    Missing `--verbose`, `--base-branch`     |
| config/cfg | Yes (yargs) |  Yes   |  Yes   | Missing `set`, `get`, `validate`, `migrate` |
| prs        | Yes (yargs) | **NO** | **NO** |              N/A - not listed               |
| init       | Yes (yargs) | **NO** | **NO** |              N/A - not listed               |
| completion | Yes (yargs) |  Yes   |  Yes   |                     Yes                     |

## Open Questions

1. **Should `wt init` get `--json` support?**
   - What we know: `wt init` is a purely interactive wizard with multi-step prompts. Adding `--json` to an interactive-only command has limited value.
   - What's unclear: Whether AI agents need to programmatically run the wizard or just need to read/write config directly.
   - Recommendation: Skip `--json` for `wt init` but ensure `wtconfig show --json` and `wtconfig set` work for programmatic config management. Document this explicitly.

2. **Should `outputSchema` be added to MCP tools?**
   - What we know: The MCP SDK v1.25.1 `Tool` type supports `outputSchema`. The API layer already returns `CommandResult<T>` which has well-defined TypeScript interfaces.
   - What's unclear: Whether current MCP clients (Claude, Cursor, etc.) actually use `outputSchema` for validation or display. The low-level `Server` API requires manual `outputSchema` on the `Tool` object (not the high-level `McpServer.tool()` method).
   - Recommendation: Add `outputSchema` to all tools since it's a small effort and future-proofs the server. The schemas can be derived from the existing TypeScript interfaces.

3. **Should `prs` JSON output be migrated to `CommandResult<T>`?**
   - What we know: `PrsJsonOutput` has the same top-level structure (`success`, `command`, `timestamp`, `data`) as `CommandResult<T>`, but is a separate type.
   - What's unclear: Whether any external consumers depend on the current `PrsJsonOutput` shape.
   - Recommendation: Migrate to `CommandResult<PrsResultData>`. The shape is compatible, so this is a non-breaking change. The `error` field on `CommandResult` adds value for error cases.

## Sources

### Primary (HIGH confidence)

- **Codebase audit** - Direct reading of all CLI entry points, MCP server, JSON output module, API layer, completion scripts, and UI output module
- **`@modelcontextprotocol/sdk` v1.25.1 TypeScript types** - `ToolAnnotations` interface at `node_modules/@modelcontextprotocol/sdk/dist/esm/spec.types.d.ts:1097-1135`, `Tool` type with `outputSchema` and `annotations` fields
- **`src/lib/json-output.ts`** - `CommandResult<T>`, `ErrorCode` enum (18 codes), factory functions
- **`src/lib/ui/output.ts`** - `setJsonMode()`, `print()`, `printErr()` JSON gate (Phase 2 decision 02-01)
- **`src/lib/ui/error.ts`** - `printError()`, `errorToDisplay()` (Phase 2 decision 02-02)

### Secondary (MEDIUM confidence)

- **MCP specification** - Tool annotations and outputSchema are part of the MCP spec (2025-06-18 revision). Verified via SDK type definitions.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries already in use, versions verified from package.json and node_modules
- Architecture: HIGH - Patterns derived directly from existing codebase audit
- Pitfalls: HIGH - Every gap identified by reading the actual source code line-by-line
- Completions: HIGH - Compared completion scripts against actual command/flag definitions

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable domain - internal codebase audit, no external API changes expected)
