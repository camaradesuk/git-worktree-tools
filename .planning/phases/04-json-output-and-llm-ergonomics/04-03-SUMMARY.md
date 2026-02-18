---
phase: 04-json-output-and-llm-ergonomics
plan: 03
subsystem: mcp
tags: [mcp, annotations, outputSchema, json-schema, tool-hints]

# Dependency graph
requires:
  - phase: 02-shared-ui-primitives
    provides: CommandResult<T> envelope, createErrorResult(), ErrorCode enum
provides:
  - MCP tool annotations (ToolAnnotations) on all 5 tools with behavioral hints
  - MCP outputSchema (JSON Schema) on all 5 tools matching CommandResult<T>
  - Enriched tool descriptions with example JSON responses
  - Consistent error responses using createErrorResult() across all MCP handlers
affects: [04-json-output-and-llm-ergonomics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - MCP tool annotations pattern with title + 4 boolean hints
    - CommandResult-based outputSchema on all MCP tools
    - Shared commandResultBase object for DRY outputSchema definitions

key-files:
  created: []
  modified:
    - src/mcp/server.ts
    - src/mcp/server.test.ts

key-decisions:
  - 'Export tools array from server.ts for test access; mock MCP SDK server/transport to prevent startup'
  - 'Auto-fixed default/catch error paths to use createErrorResult() for full consistency (Rule 2)'
  - 'Used shared commandResultBase object to DRY common CommandResult fields across all 5 outputSchemas'

patterns-established:
  - 'MCP annotation pattern: every tool gets annotations{title, readOnlyHint, destructiveHint, idempotentHint, openWorldHint} + outputSchema{CommandResult<T>}'
  - "MCP description pattern: every tool description includes 'Returns a CommandResult JSON with:' bullets and 'Example success response:' JSON"

# Metrics
duration: 14min
completed: 2026-02-18
---

# Phase 4 Plan 3: MCP Tool Annotations Summary

**All 5 MCP tools annotated with ToolAnnotations behavioral hints, CommandResult outputSchema, and enriched descriptions with example JSON responses**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-18T21:41:21Z
- **Completed:** 2026-02-18T21:55:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added ToolAnnotations (title + 4 boolean hints) to all 5 MCP tools with correct behavioral semantics
- Added outputSchema with JSON Schema matching CommandResult<T> envelope to all 5 MCP tools
- Enriched all 5 tool descriptions with structured response format documentation and example JSON
- Replaced all inline JSON.stringify error responses with createErrorResult() for consistency
- Added 10 new tests verifying annotations, outputSchema, and description content

## Task Commits

Each task was committed atomically:

1. **Task 1: Add annotations, outputSchema, and enriched descriptions to all 5 MCP tools** - `3d98e59` (feat)
2. **Task 2: Add tests for MCP tool annotations and outputSchema** - `5ef79fb` (test)

## Files Created/Modified

- `src/mcp/server.ts` - Added annotations, outputSchema, enriched descriptions to all 5 tools; replaced inline error JSON with createErrorResult(); exported tools array for testing
- `src/mcp/server.test.ts` - Added 10 tests for tool definition annotations, outputSchema, behavioral hints, and description content

## Decisions Made

- **Export tools array from server.ts for test access:** Mocked MCP SDK Server/StdioServerTransport to prevent server startup during test import. This is the cleanest way to test static tool definitions without extracting them to a separate file.
- **Shared commandResultBase object:** Created a reusable object with common CommandResult<T> fields (success, command, timestamp, error, warnings) to avoid repeating the same schema properties in all 5 outputSchemas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Migrated default/catch error handlers to createErrorResult()**

- **Found during:** Task 1 (Adding annotations to MCP tools)
- **Issue:** Plan specified fixing inline errors in create_pr/setup_pr only, but the default case handler and top-level catch block also used inline JSON.stringify with inconsistent error envelopes (missing timestamp, command, suggestion)
- **Fix:** Replaced both remaining inline error constructions with createErrorResult() calls
- **Files modified:** src/mcp/server.ts
- **Verification:** All error paths now produce full CommandResult envelope with timestamps and suggestions
- **Committed in:** 3d98e59 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for consistent error response format across all MCP handler paths. No scope creep.

## Issues Encountered

- Pre-commit hook checks all tracked files for formatting, not just staged files. Multiple unrelated files from previous phase work had uncommitted changes that caused the hook to fail. Resolved by stashing unrelated files before each commit and restoring afterward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 5 MCP tools now fully annotated with behavioral hints, output schemas, and enriched descriptions
- AI agents can now select tools based on annotations (read-only, destructive, idempotent) and parse responses using outputSchema
- Ready for Phase 4 Plan 4 (shell completions)

## Self-Check: PASSED

- [x] src/mcp/server.ts exists
- [x] src/mcp/server.test.ts exists
- [x] 04-03-SUMMARY.md exists
- [x] Commit 3d98e59 exists (Task 1)
- [x] Commit 5ef79fb exists (Task 2)

---

_Phase: 04-json-output-and-llm-ergonomics_
_Completed: 2026-02-18_
