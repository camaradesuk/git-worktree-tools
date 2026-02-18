# Codebase Structure

**Analysis Date:** 2026-02-18

## Directory Layout

```
git-worktree-tools/
├── src/                    # TypeScript source
│   ├── index.ts            # Library entry point (all public exports)
│   ├── cli/                # CLI entry points (thin wrappers)
│   │   ├── newpr.ts        # newpr binary
│   │   ├── cleanpr.ts      # cleanpr binary
│   │   ├── lswt.ts         # lswt binary
│   │   ├── wtlink.ts       # wtlink binary
│   │   ├── wtstate.ts      # wtstate binary
│   │   ├── wtconfig.ts     # wtconfig binary
│   │   └── wt/             # wt unified binary subcommands
│   │       ├── new.ts      # wt new → newpr
│   │       ├── list.ts     # wt list → lswt
│   │       ├── clean.ts    # wt clean → cleanpr
│   │       ├── state.ts    # wt state → wtstate
│   │       ├── config.ts   # wt config → wtconfig
│   │       ├── link.ts     # wt link → wtlink
│   │       ├── prs.ts      # wt prs → PR management
│   │       ├── init.ts     # wt init → setup wizard
│   │       ├── completion.ts # shell completion
│   │       ├── interactive-menu.ts # interactive TUI
│   │       └── run-command.ts # shared subprocess runner
│   ├── lib/                # Domain libraries and utilities
│   │   ├── git.ts          # Git operations (spawn-based, cross-platform)
│   │   ├── github.ts       # GitHub CLI (gh) wrapper
│   │   ├── colors.ts       # ANSI color utilities
│   │   ├── prompts.ts      # Inquirer interactive prompts
│   │   ├── config.ts       # Config loading + AI generation helpers
│   │   ├── config-editor.ts  # Interactive config editor TUI
│   │   ├── config-validation.ts # JSON Schema validation
│   │   ├── state-detection.ts   # Git state → Scenario classification
│   │   ├── errors.ts       # Custom error class hierarchy
│   │   ├── constants.ts    # Centralized defaults and platform paths
│   │   ├── logger.ts       # Singleton logger with file rotation
│   │   ├── json-output.ts  # CommandResult<T> / ErrorCode structs
│   │   ├── global-config.ts # XDG/AppData global config loading
│   │   ├── global-check.ts # Prerequisite checks (git, gh installed)
│   │   ├── schema.test.ts  # JSON schema tests
│   │   ├── newpr/          # newpr business logic
│   │   │   ├── index.ts    # Barrel export
│   │   │   ├── types.ts    # StateAction, Options, Mode types
│   │   │   ├── args.ts     # Argument parsing
│   │   │   ├── scenario-handler.ts # Scenario → choices (pure)
│   │   │   ├── actions.ts  # StateAction execution
│   │   │   ├── action-deps.ts  # Dependency injection factory
│   │   │   ├── hook-runner.ts  # Lifecycle hook orchestration
│   │   │   ├── plan-generator.ts # AI plan document generation
│   │   │   └── *.test.ts   # Co-located unit tests
│   │   ├── cleanpr/        # cleanpr business logic
│   │   │   ├── index.ts
│   │   │   ├── args.ts
│   │   │   ├── cleanup.ts
│   │   │   ├── types.ts
│   │   │   └── worktree-info.ts
│   │   ├── lswt/           # lswt business logic
│   │   │   ├── index.ts
│   │   │   ├── args.ts
│   │   │   ├── formatters.ts
│   │   │   ├── fuzzy-search.ts
│   │   │   ├── interactive.ts
│   │   │   ├── types.ts
│   │   │   ├── action-executors.ts
│   │   │   ├── actions.ts
│   │   │   ├── environment.ts
│   │   │   └── worktree-info.ts
│   │   ├── prs/            # PR management logic
│   │   │   ├── data.ts
│   │   │   ├── details.ts
│   │   │   ├── filters.ts
│   │   │   ├── formatters.ts
│   │   │   ├── interactive.ts
│   │   │   ├── actions.ts
│   │   │   └── types.ts
│   │   ├── wtlink/         # Hard-link config sync
│   │   │   ├── index.ts
│   │   │   ├── config-manifest.ts
│   │   │   ├── link-configs.ts
│   │   │   ├── main-menu.ts
│   │   │   ├── manage-manifest.ts
│   │   │   └── validate-manifest.ts
│   │   ├── wtstate/        # Git state analysis for wtstate CLI
│   │   │   ├── index.ts
│   │   │   ├── args.ts
│   │   │   ├── analyze.ts
│   │   │   └── types.ts
│   │   ├── wtconfig/       # Config management (wizard, manager)
│   │   │   ├── index.ts
│   │   │   ├── config-manager.ts
│   │   │   ├── environment.ts
│   │   │   └── types.ts
│   │   ├── hooks/          # Lifecycle hook system
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── executor.ts
│   │   │   ├── confirmation.ts
│   │   │   └── templates.ts
│   │   ├── ai/             # AI content generation
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── base-provider.ts
│   │   │   ├── cli-provider.ts     # Claude, Gemini, OpenAI, Ollama providers
│   │   │   ├── fallback-provider.ts
│   │   │   ├── generation-service.ts
│   │   │   ├── provider-manager.ts
│   │   │   └── repo-docs.ts
│   │   └── config-migration/  # Config schema migration
│   │       ├── index.ts
│   │       ├── detector.ts
│   │       ├── reporter.ts
│   │       ├── runner.ts
│   │       └── types.ts
│   ├── api/                # Programmatic API (no prompts, returns CommandResult<T>)
│   │   ├── index.ts        # Public API exports
│   │   ├── state.ts        # queryState()
│   │   ├── list.ts         # listWorktrees()
│   │   ├── clean.ts        # cleanWorktrees()
│   │   └── create.ts       # createPr() / setupPrWorktree()
│   ├── mcp/                # MCP server (AI agent interface)
│   │   └── server.ts       # stdio MCP server exposing api/ layer
│   ├── e2e/                # End-to-end tests (real git repos)
│   │   ├── cli.e2e.test.ts
│   │   ├── newpr-full-flow.e2e.test.ts
│   │   ├── helpers/        # Shared e2e test utilities
│   │   ├── fixtures/       # Static fixtures (gh API responses)
│   │   └── <domain>/       # Per-domain e2e test files
│   └── integration/        # Integration tests (real git, mocked gh)
│       ├── git.integration.test.ts
│       ├── newpr.integration.test.ts
│       └── prs.integration.test.ts
├── dist/                   # Compiled JS output (TypeScript build artifact)
├── schemas/
│   └── worktreerc.schema.json  # JSON Schema for .worktreerc validation
├── docs/
│   ├── specs/              # Feature specification documents
│   └── ux/                 # UX design notes
├── .planning/
│   └── codebase/           # GSD codebase analysis documents
├── .github/
│   ├── workflows/
│   │   ├── ci.yml          # Cross-platform CI (Ubuntu/macOS/Windows, Node 18/20/22)
│   │   └── release.yml     # npm publish via semantic-release
│   └── ISSUE_TEMPLATE/
├── .husky/                 # Git hooks (pre-commit lint-staged)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
├── .releaserc.json         # semantic-release config
├── .worktreerc             # Tool's own config (dogfooding)
└── .wtlinkrc               # Tool's own wtlink manifest
```

## Directory Purposes

**`src/cli/`:**

- Purpose: Binary entry points. Thin orchestration only - argument parsing, progress output, interactive prompts, process.exit
- Contains: One `.ts` file per binary; `wt/` subdirectory for unified `wt` subcommands
- Key files: `src/cli/newpr.ts`, `src/cli/wt/interactive-menu.ts`

**`src/lib/`:**

- Purpose: All business logic, domain functions, and utilities
- Contains: Flat utility files + feature-domain subdirectories
- Key files: `src/lib/git.ts`, `src/lib/state-detection.ts`, `src/lib/errors.ts`, `src/lib/json-output.ts`, `src/lib/constants.ts`

**`src/api/`:**

- Purpose: Programmatic API surface with no side effects, typed results, no interactive prompts
- Contains: One file per logical API group; barrel `index.ts`
- Key files: `src/api/create.ts`, `src/api/state.ts`

**`src/mcp/`:**

- Purpose: MCP server for AI agent integration
- Contains: Single `server.ts` file
- Key files: `src/mcp/server.ts`

**`src/e2e/`:**

- Purpose: End-to-end tests running actual CLI commands against real temporary git repositories
- Contains: Test files organized by domain; `helpers/` for shared utilities; `fixtures/` for static API responses

**`src/integration/`:**

- Purpose: Integration tests that call library functions against a real git repo (not full CLI)
- Contains: Per-domain integration test files

**`dist/`:**

- Purpose: TypeScript compiled output
- Generated: Yes
- Committed: No (in `.gitignore`)

**`schemas/`:**

- Purpose: JSON Schema definitions published with the npm package
- Generated: No
- Committed: Yes

## Key File Locations

**Entry Points:**

- `src/index.ts`: Library public API (all domain exports)
- `src/cli/newpr.ts`: newpr CLI entry
- `src/cli/wt/interactive-menu.ts`: Main `wt` interactive menu TUI
- `src/mcp/server.ts`: MCP server entry

**Configuration:**

- `src/lib/constants.ts`: All defaults, config file names, platform-specific paths
- `src/lib/config.ts`: Config loading, merging, AI generation helpers
- `src/lib/global-config.ts`: XDG/AppData global config loading
- `schemas/worktreerc.schema.json`: Config JSON Schema
- `tsconfig.json`: TypeScript compiler options
- `vitest.config.ts`: Test runner config

**Core Logic:**

- `src/lib/git.ts`: All git operations (spawn-based)
- `src/lib/github.ts`: All `gh` CLI interactions
- `src/lib/state-detection.ts`: `Scenario` detection from `GitState`
- `src/lib/json-output.ts`: `CommandResult<T>`, `ErrorCode`, structured output

**Testing:**

- Unit tests co-located: `src/lib/**/*.test.ts`
- E2E tests: `src/e2e/`
- Integration tests: `src/integration/`

## Naming Conventions

**Files:**

- Kebab-case: `state-detection.ts`, `config-manager.ts`, `action-deps.ts`
- Domain entry barrels always named `index.ts`
- Test files: `<name>.test.ts` (unit), `<name>.integration.test.ts` (integration), `<name>.e2e.test.ts` (e2e)
- Unit tests: `<name>.unit.test.ts` when both unit and e2e exist for same name (e.g., `wt.unit.test.ts`)

**Directories:**

- Kebab-case: `config-migration/`, `wtlink/`, `newpr/`
- Domain subdirectories named after the feature, not the tool binary (e.g., `lswt/` not `list/`)

**Exports:**

- Types exported as `export type { ... }` from barrel `index.ts`
- Functions exported as `export { ... }` from barrel `index.ts`
- No default exports; all named exports

## Where to Add New Code

**New CLI command:**

- Binary entry point: `src/cli/<commandname>.ts`
- Business logic: `src/lib/<commandname>/` with `index.ts` barrel
- Tests: co-located `src/lib/<commandname>/*.test.ts`
- Register binary in `package.json` `bin` field
- Add yargs subcommand in `src/cli/wt/` if it belongs in `wt`

**New library feature to an existing domain:**

- Implementation: Add file in `src/lib/<domain>/`
- Export: Add to `src/lib/<domain>/index.ts` barrel
- Tests: Co-locate as `src/lib/<domain>/<file>.test.ts`

**New programmatic API function:**

- Implementation: Add to relevant `src/api/<category>.ts`
- Export: Add to `src/api/index.ts`

**Utilities / shared helpers:**

- Shared helpers: `src/lib/` flat files (e.g., add to `src/lib/git.ts` or create a new `src/lib/<util>.ts`)

**New MCP tool:**

- Add tool definition and handler in `src/mcp/server.ts`
- Implement backing function in `src/api/`

## Special Directories

**`dist/`:**

- Purpose: TypeScript build output; mirrors `src/` structure with `.js` and `.d.ts` files
- Generated: Yes (via `tsc`)
- Committed: No

**`.planning/`:**

- Purpose: GSD planning documents (phases, codebase analysis)
- Generated: No (human/AI authored)
- Committed: Yes

**`coverage/`:**

- Purpose: Vitest v8 coverage reports
- Generated: Yes
- Committed: No

---

_Structure analysis: 2026-02-18_
