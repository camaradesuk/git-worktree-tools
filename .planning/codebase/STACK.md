# Technology Stack

**Analysis Date:** 2026-02-18

## Languages

**Primary:**

- TypeScript 5.3+ - All source code in `src/`

**Secondary:**

- JSON/JSON5 - Configuration files (`.worktreerc`, schemas)

## Runtime

**Environment:**

- Node.js >=18 (required minimum, tested on 18/20/22)
- Node.js 24.11.0 (developer local environment)

**Module System:**

- ESM (`"type": "module"` in `package.json`)
- TypeScript target: ES2022, module: NodeNext

**Package Manager:**

- npm 11.7.0
- Lockfile: `package-lock.json` (present)

## Frameworks

**CLI Argument Parsing:**

- yargs ^17.7.2 - CLI argument handling in all CLI entry points

**Interactive Prompts:**

- inquirer ^9.3.7 - Interactive TUI prompts (`src/lib/prompts.ts`, `src/lib/wtlink/`)

**MCP (Model Context Protocol):**

- @modelcontextprotocol/sdk ^1.25.1 - MCP server in `src/mcp/server.ts`

**Reactive State:**

- @preact/signals-core ^1.8.0 - Signals-based reactivity

**Config Parsing:**

- json5 ^2.2.3 - JSON5 config file parsing in `src/lib/config.ts`

**Testing:**

- vitest ^2.1.9 - Test runner and assertion framework
- @vitest/coverage-v8 ^2.1.9 - V8-based code coverage

**Build:**

- TypeScript compiler (tsc) - No bundler; compiles to `dist/`

**Terminal I/O (Testing):**

- node-pty ^1.1.0 - PTY testing for interactive CLI flows

## Key Dependencies

**Critical:**

- `yargs` ^17.7.2 - All CLI argument parsing; commands fail without it
- `inquirer` ^9.3.7 - Interactive prompts for PR creation and worktree management
- `@modelcontextprotocol/sdk` ^1.25.1 - MCP server enabling AI agent integration
- `json5` ^2.2.3 - `.worktreerc` config parsing

**Infrastructure:**

- `@preact/signals-core` ^1.8.0 - Reactive state for UI components

## Configuration

**TypeScript:**

- `tsconfig.json` - target ES2022, module NodeNext, strict mode, outDir `dist/`

**Linting:**

- `eslint.config.js` - ESLint 9 flat config with typescript-eslint and prettier plugin
- Key rules: no-unused-vars warn (ignoring `_` prefix), no-explicit-any warn, no-console off

**Formatting:**

- `.prettierrc` - singleQuote, semi, tabWidth 2, trailingComma es5, printWidth 100

**Git Hooks:**

- `.husky/` - Husky 9 hooks
- `lint-staged` ^16.2.7 - Lint+format on staged files

**Testing:**

- `vitest.config.ts` - globals true, node environment, 30s timeout
- Coverage thresholds: 80% statements/branches/functions/lines
- Coverage includes: `src/lib/**/*.ts`, `src/cli/**/*.ts`
- JUnit XML output: `test-results/junit.xml`

**Release:**

- `.releaserc.json` - semantic-release config (conventional commits → version bump → npm publish)
- `codecov.yml` - 80% project coverage target, 70% patch target

**Worktree Config:**

- `.worktreerc` - JSON5 with `$schema` reference, configures baseBranch, worktreePattern, hooks, AI config

**Schema:**

- `schemas/` - JSON schema for `.worktreerc` validation

## Platform Requirements

**Development:**

- Node.js >=18
- Git installed and in PATH
- GitHub CLI (`gh`) installed and authenticated

**Production:**

- Node.js >=18
- Git in PATH
- GitHub CLI (`gh`) in PATH for GitHub operations
- Cross-platform: Ubuntu, macOS, Windows

**Published Package:**

- npm: `@camaradesuk/git-worktree-tools`
- Includes: `dist/`, `schemas/`, `README.md`, `LICENSE`

---

_Stack analysis: 2026-02-18_
