# Coding Conventions

**Analysis Date:** 2026-02-18

## Naming Patterns

**Files:**

- kebab-case for all source files: `state-detection.ts`, `config-migration.ts`, `plan-generator.ts`
- Test files co-located with source, suffixed `.test.ts`: `git.test.ts` alongside `git.ts`
- Unit-specific tests use `.unit.test.ts`: `wt.unit.test.ts`, `init.unit.test.ts`
- Integration tests suffixed `.integration.test.ts`: `newpr.integration.test.ts`
- E2E tests suffixed `.e2e.test.ts`: `newpr.e2e.test.ts`
- Directories use kebab-case: `config-migration/`, `wtlink/`, `action-deps.ts`
- `index.ts` barrel files in each feature subdirectory export public API

**Functions:**

- camelCase for all functions: `executeStateAction`, `getBranchPoint`, `getRepoRoot`
- Boolean-returning functions prefixed with `is`, `has`, `check`: `isWorktree()`, `hasRemote()`, `isDetachedHead()`
- Async versions of sync functions suffixed `Async`: `fetchAsync()`, `addWorktreeAsync()`, `pushAsync()`
- Safe/non-throwing variants suffixed `Safe`: `execSafe()`, `getRefCommit()` (internally uses execSafe)
- Factory/creator helpers named `make*`, `create*`: `makeDeps()`, `createTestContext()`
- Format helpers named `format*`: `formatJsonResult()`, `formatValidationErrors()`

**Variables:**

- camelCase for all variables and parameters: `repoRoot`, `baseBranch`, `worktreePath`
- Boolean variables use descriptive names without `is` prefix when clear from context: `authenticated`, `force`, `draft`
- Constants are SCREAMING_SNAKE_CASE: `DEFAULT_BASE_BRANCH`, `CONFIG_FILE_NAMES`, `MAX_LOG_FILE_SIZE`

**Types and Interfaces:**

- PascalCase for all types, interfaces, classes, and enums: `WorktreeToolsError`, `GitState`, `ResolvedConfig`
- Interface names are descriptive nouns without `I` prefix: `Worktree`, `Options`, `ActionDeps`
- Type aliases for unions use PascalCase: `CommitRelationship`, `WorkingTreeStatus`, `Mode`
- Discriminated unions use `kind` as the discriminant field: `{ kind: 'success'; ... } | { kind: 'error'; ... }`
- Enums use PascalCase name with ALL_CAPS members: `LogLevel.SILENT`, `LogLevel.ERROR`

## Code Style

**Formatting:**

- Tool: Prettier 3.x
- Config: `/home/chris/workspace/git-worktree-tools/.prettierrc`
- `singleQuote: true` — use single quotes for strings
- `semi: true` — semicolons required
- `tabWidth: 2` — 2-space indentation
- `trailingComma: "es5"` — trailing commas in multiline objects/arrays
- `printWidth: 100` — max 100 characters per line

**Linting:**

- Tool: ESLint 9.x with TypeScript ESLint (`typescript-eslint`)
- Config: `/home/chris/workspace/git-worktree-tools/eslint.config.mjs`
- Extends `eslint.configs.recommended` and `tseslint.configs.recommended`
- `@typescript-eslint/no-unused-vars`: warn (vars/args prefixed `_` are ignored)
- `@typescript-eslint/no-explicit-any`: warn
- `no-console`: off (CLIs use console.log extensively for output)
- `prefer-const`: warn

**Pre-commit Hooks:**

- husky + lint-staged enforces formatting on commit
- `.ts/.tsx`: `eslint --fix` + `prettier --write`
- `.js/.json/.md/.yml`: `prettier --write`

## Import Organization

**Order (conventional, not enforced by linter):**

1. Node.js built-ins: `import fs from 'fs'`, `import path from 'path'`, `import os from 'os'`
2. External packages: `import inquirer from 'inquirer'`, `import yargs from 'yargs'`
3. Internal modules using relative paths with `.js` extension: `import * as git from './git.js'`

**Path Aliases:** None — no `@/` aliases. All imports use relative paths.

**ESM Requirements:** All internal imports must use `.js` extension even for `.ts` source files (NodeNext module resolution). Example:

```typescript
import { exec, execSafe } from './git.js';
import type { StateAction } from './types.js';
```

**Namespace imports for modules with many exports:**

```typescript
import * as git from '../lib/git.js';
import * as colors from '../lib/colors.js';
import * as github from '../lib/github.js';
```

**Named imports for specific functions/types:**

```typescript
import { loadConfig, generateBranchNameAsync } from '../lib/config.js';
import type { GitState, Scenario } from './state-detection.js';
```

## Error Handling

**Custom Error Classes:**
All errors extend `WorktreeToolsError` (base class in `src/lib/errors.ts`):

- `GitCommandError` — git command failures, carries `command`, `exitCode`, `stderr`
- `GitHubCliError` — gh CLI failures, carries `command`, `stderr`
- `ConfigurationError` — config parse/validation failures, carries `configFile`, `field`
- `WorktreeError` — worktree operations, carries `worktreePath`, `branch`
- `ManifestError` — wtlink manifest issues, carries `manifestPath`, `issues`
- `UserCancelledError` — user pressed Ctrl+C or cancelled a prompt

**Type Guards:**

```typescript
import { isWorktreeToolsError, isGitCommandError } from '../lib/errors.js';

if (isWorktreeToolsError(err)) {
  /* handle */
}
```

**Safe/Nullable Pattern:**
Functions that may legitimately fail return `null` rather than throwing:

```typescript
export function execSafe(args: string[], options = {}): string | null {
  try {
    return exec(args, { ...options, silent: true });
  } catch {
    return null;
  }
}
```

**CLI Entry Point Pattern:**
CLI commands wrap errors at the top level and exit with code 1:

```typescript
process.exit(1); // on unhandled errors
```

**Error-as-Unknown:**
Catch clauses use `unknown` and narrow with `instanceof` or type guards:

```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
}
```

## Logging

**Framework:** Singleton `logger` instance from `src/lib/logger.ts`

**Log Levels:** SILENT < ERROR < WARN < INFO < DEBUG < TRACE (numeric enum in `src/lib/constants.ts`)

**Usage Pattern:**

```typescript
import { logger } from '../lib/logger.js';

logger.info('Starting operation %s', name);
logger.debug('Details:', { data });
logger.error('Failed: %s', err.message);
```

**Child Loggers for context:**

```typescript
const log = logger.child('newpr');
log.info('Creating PR...');
```

**Debug Logging in CLIs:**
CLI files use a separate `DEBUG` environment variable pattern:

```typescript
const DEBUG_ENABLED = process.env.DEBUG === 'newpr' || process.env.DEBUG === '*';
function debug(message: string, data?: Record<string, unknown>): void {
  if (!DEBUG_ENABLED) return;
  console.error(colors.dim(`[DEBUG] ${message}`));
}
```

## Comments

**When to Comment:**

- Every exported function, class, type, and interface gets a JSDoc comment
- Non-obvious implementation decisions get inline comments
- Cross-platform workarounds explain the "why" clearly

**JSDoc Style:**

```typescript
/**
 * Execute a git command and return output
 * Uses spawnSync for cross-platform compatibility (avoids shell escaping issues on Windows)
 */
export function exec(args: string[], options: { cwd?: string; silent?: boolean } = {}): string {
```

**Section Dividers:**
Long files use separator comments for visual grouping:

```typescript
// ============================================================================
// Async versions of operations for use with spinners
// ============================================================================
```

## Function Design

**Size:** Functions are focused on a single responsibility. Longer functions (~50-100 lines) appear in CLI orchestration files (`src/cli/newpr.ts`), but lib functions stay small.

**Parameters:**

- Options bags use inline interface types for 3+ optional params: `options: { cwd?: string; force?: boolean; createBranch?: boolean } = {}`
- `cwd?: string` is typically the last parameter for git operation functions
- Required options come before optional options in parameter lists

**Return Values:**

- Discriminated unions for parse/handler results: `{ kind: 'success'; ... } | { kind: 'error'; message: string }`
- Boolean for existence/validity checks: `branchExists()`, `hasRemote()`
- `null` for not-found / safe-fail scenarios
- `void` for side-effect-only operations

## Module Design

**Exports:**

- `src/lib/*/index.ts` files re-export all public API from the subdirectory
- No default exports — all named exports
- Types exported separately with `export type {}` syntax

**Barrel Files:**
Each feature subdirectory (`src/lib/newpr/`, `src/lib/lswt/`, `src/lib/cleanpr/`) has an `index.ts` that:

- Re-exports public functions from submodules
- Re-exports types with `export type`
- Does NOT contain implementation code

**Dependency Injection Pattern:**
Testable functions accept `deps` objects instead of calling modules directly:

```typescript
export interface ActionDeps {
  gitAdd: (path: string, cwd?: string) => void;
  gitStash: (options?: StashOptions, cwd?: string) => string | null;
  gitPush: (options?: PushOptions, cwd?: string) => void;
  gitCommit: (options: CommitOptions, cwd?: string) => string;
}

export function executeStateAction(
  action: StateAction,
  description: string,
  branchName: string,
  deps: ActionDeps,
  cwd?: string
): ActionResult { ... }
```

---

_Convention analysis: 2026-02-18_
