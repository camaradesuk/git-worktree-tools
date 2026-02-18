# Architecture

**Analysis Date:** 2026-02-18

## Pattern Overview

**Overall:** Layered CLI tool with programmatic API and MCP server surface

**Key Characteristics:**

- Four distinct layers: CLI entry points → programmatic API → domain libraries → core utilities
- Each domain (newpr, cleanpr, lswt, wtlink, wtstate, wtconfig) is modularized into its own `src/lib/<domain>/` subdirectory with `index.ts` barrel exports
- CLI tools (`src/cli/`) are thin wrappers: argument parsing, progress output, and user prompts only; business logic lives in `src/lib/`
- A separate `src/api/` layer wraps the library for side-effect-free programmatic use (returns `CommandResult<T>` typed structs)
- An `src/mcp/server.ts` MCP server exposes the `src/api/` layer to AI agents over stdio

## Layers

**Core Utilities:**

- Purpose: Shared cross-cutting infrastructure used by all other layers
- Location: `src/lib/` (flat files)
- Contains: `git.ts`, `github.ts`, `colors.ts`, `prompts.ts`, `errors.ts`, `constants.ts`, `logger.ts`, `json-output.ts`, `state-detection.ts`
- Depends on: Node.js builtins (`child_process`, `fs`, `path`, `os`), external CLI tools (`git`, `gh`)
- Used by: All domain libraries, CLI entry points, API layer

**Domain Libraries:**

- Purpose: Business logic for each tool, organized by feature domain
- Location: `src/lib/newpr/`, `src/lib/cleanpr/`, `src/lib/lswt/`, `src/lib/wtlink/`, `src/lib/wtstate/`, `src/lib/wtconfig/`, `src/lib/hooks/`, `src/lib/ai/`, `src/lib/config-migration/`, `src/lib/prs/`
- Contains: Pure functions, typed interfaces, domain types, `index.ts` barrel export
- Depends on: Core utilities
- Used by: CLI entry points, API layer

**CLI Entry Points:**

- Purpose: User-facing commands; orchestration, interactive prompts, user feedback
- Location: `src/cli/newpr.ts`, `src/cli/cleanpr.ts`, `src/cli/lswt.ts`, `src/cli/wtlink.ts`, `src/cli/wt.ts`, `src/cli/wtconfig.ts`, `src/cli/wtstate.ts`
- Contains: Argument parsing (yargs), prompt handling (inquirer), progress/error output, process.exit calls
- Depends on: Domain libraries, core utilities
- Used by: npm bin entries (`newpr`, `cleanpr`, `lswt`, `wtlink`, `wt`, `wtconfig`, `wtstate`)

**Programmatic API:**

- Purpose: Side-effect-free, structured API for programmatic use (MCP, library consumers)
- Location: `src/api/create.ts`, `src/api/list.ts`, `src/api/clean.ts`, `src/api/state.ts`, `src/api/index.ts`
- Contains: Typed option interfaces, `CommandResult<T>` return types, no interactive prompts
- Depends on: Domain libraries, core utilities
- Used by: `src/mcp/server.ts`, external npm library consumers

**MCP Server:**

- Purpose: Exposes worktree tools to AI agents via Model Context Protocol over stdio
- Location: `src/mcp/server.ts`
- Contains: Tool definitions, request handlers, MCP SDK wiring
- Depends on: `src/api/` layer, `src/lib/json-output.ts`
- Used by: `git-worktree-mcp` binary (AI agent integrations)

## Data Flow

**Interactive CLI Flow (e.g., `newpr`):**

1. `src/cli/newpr.ts` parses args via `src/lib/newpr/args.ts`
2. Calls `src/lib/git.ts` to detect repo state (branch, commits, staged files)
3. Calls `src/lib/state-detection.ts` to classify state into a `Scenario` enum value
4. Calls `src/lib/newpr/scenario-handler.ts` to get choices and message for the scenario
5. Calls `src/lib/prompts.ts` to present interactive choices to the user
6. Calls `src/lib/newpr/actions.ts` to execute the chosen `StateAction`
7. Calls `src/lib/github.ts` to create PR via `gh` CLI
8. Runs lifecycle hooks via `src/lib/hooks/executor.ts`
9. Optionally runs `src/lib/newpr/plan-generator.ts` to create AI planning docs
10. Outputs result to stdout (human text or JSON if `--json` flag set)

**MCP / Programmatic API Flow:**

1. `src/mcp/server.ts` receives tool call over stdio
2. Delegates to `src/api/create.ts` (or list/clean/state)
3. `src/api/` layer calls domain libraries directly (no prompts, no process.exit)
4. Returns `CommandResult<T>` with `{ success, data, error }` structure
5. MCP server serializes result as JSON and returns to caller

**State Management:**

- No persistent in-memory state; all state read fresh from git on each command invocation
- Config loaded from files at startup: `.worktreerc` (repo), `.worktreerc.local` (local override), `~/.config/git-worktree-tools/config.json` (global)
- Config priority: CLI flags > local config > repo config > global config > defaults

## Key Abstractions

**`GitState` / `Scenario`:**

- Purpose: Classifies the current git repository state into one of 12 scenarios for `newpr` decision logic
- Examples: `src/lib/state-detection.ts`
- Pattern: `analyzeGitState()` → `GitState` struct → `detectScenario()` → `Scenario` string union type

**`StateAction`:**

- Purpose: Describes what newpr should do (e.g., stash, commit, new branch, use existing branch)
- Examples: `src/lib/newpr/types.ts`, `src/lib/newpr/actions.ts`
- Pattern: Action value object with `action`, `branchFrom`, `stashUnstaged` fields; executed by `executeStateAction()`

**`CommandResult<T>`:**

- Purpose: Typed success/error envelope for the programmatic API and JSON CLI output
- Examples: `src/lib/json-output.ts`, `src/api/create.ts`
- Pattern: `{ success: true, data: T } | { success: false, error: ErrorInfo }` with `ErrorCode` enum

**`ResolvedConfig`:**

- Purpose: Merged, validated configuration from all config sources (global + repo + local)
- Examples: `src/lib/config.ts`, `src/lib/wtconfig/config-manager.ts`
- Pattern: Loaded by `loadConfig()` on startup; passed to all domain functions as a parameter

**`HookRunner` / `HookExecutor`:**

- Purpose: Lifecycle hooks executed before/after key workflow steps (pre-branch, post-worktree, post-pr, etc.)
- Examples: `src/lib/newpr/hook-runner.ts`, `src/lib/hooks/executor.ts`
- Pattern: Hook definitions in `.worktreerc` `hooks` key; executed via `spawnSync`

**`AIProviderManager` / `AIGenerationService`:**

- Purpose: Pluggable AI generation (branch names, PR titles/descriptions, plan documents)
- Examples: `src/lib/ai/provider-manager.ts`, `src/lib/ai/generation-service.ts`
- Pattern: Provider pattern with fallback; supports Claude, Gemini, OpenAI, Ollama, custom scripts

## Entry Points

**`newpr` binary:**

- Location: `src/cli/newpr.ts`
- Triggers: `newpr` shell command or `wt new` subcommand
- Responsibilities: Full PR creation workflow with interactive state-based decision making

**`cleanpr` binary:**

- Location: `src/cli/cleanpr.ts`
- Triggers: `cleanpr` shell command or `wt clean` subcommand
- Responsibilities: Remove worktrees for merged/closed PRs

**`lswt` binary:**

- Location: `src/cli/lswt.ts`
- Triggers: `lswt` shell command or `wt list` subcommand
- Responsibilities: List worktrees with PR status from GitHub

**`wt` unified binary:**

- Location: `src/cli/wt/` (subcommand modules: `new.ts`, `list.ts`, `clean.ts`, `state.ts`, `config.ts`, `link.ts`, `prs.ts`, `init.ts`, `completion.ts`)
- Triggers: `wt` shell command
- Responsibilities: Unified entry point delegating to all tools via yargs subcommands

**`git-worktree-mcp` binary:**

- Location: `src/mcp/server.ts`
- Triggers: MCP client (AI agent) connecting over stdio
- Responsibilities: Expose worktree tools as MCP tools for AI agent use

**Library entry:**

- Location: `src/index.ts`
- Triggers: `import '@camaradesuk/git-worktree-tools'`
- Responsibilities: Export all public APIs for programmatic use

## Error Handling

**Strategy:** Custom error class hierarchy; errors propagate upward to CLI layer for user-facing formatting; API layer catches and converts to `ErrorInfo` structs

**Patterns:**

- `src/lib/errors.ts` defines `WorktreeToolsError` base class with subtypes: `GitCommandError`, `GitHubCliError`, `ConfigurationError`, `WorktreeError`, `ManifestError`, `UserCancelledError`
- CLI layer: `try/catch` with `console.error` + `process.exit(1)` for fatal errors
- API layer: All functions return `CommandResult<T>` - errors never throw, always returned as `{ success: false, error: ErrorInfo }`
- `ErrorCode` enum in `src/lib/json-output.ts` provides machine-readable error classification

## Cross-Cutting Concerns

**Logging:** Singleton `logger` from `src/lib/logger.ts`; supports log levels (SILENT/ERROR/WARN/INFO/DEBUG/TRACE), console + file output, log rotation; configured via env vars (`GWT_LOG_LEVEL`, `GWT_LOG_FILE`) or config file

**Validation:** JSON Schema for `.worktreerc` at `schemas/worktreerc.schema.json`; runtime validation in `src/lib/config-validation.ts`

**Authentication:** No built-in auth; delegates to `gh` CLI for GitHub authentication; checked at startup via `github.isAuthenticated()`

**Cross-platform:** All `child_process` calls use `spawn`/`spawnSync` (not shell strings) to avoid Windows shell escaping issues; path operations use `path.join()`; config directories resolved platform-specifically in `src/lib/constants.ts`

---

_Architecture analysis: 2026-02-18_
