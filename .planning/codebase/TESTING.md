# Testing Patterns

**Analysis Date:** 2026-02-18

## Test Framework

**Runner:**

- Vitest 2.x
- Config: `/home/chris/workspace/git-worktree-tools/vitest.config.ts`
- `globals: true` — `describe`, `it`, `expect`, `vi`, `beforeEach`, etc. available without imports (but are still explicitly imported in test files)
- `environment: node`
- `testTimeout: 30000` / `hookTimeout: 30000`

**Assertion Library:**

- Vitest built-in (`expect`)

**Reporters:**

- `default` (console) + `junit` (writes to `test-results/junit.xml` for Codecov)

**Run Commands:**

```bash
npm test                  # Run all tests (vitest run)
npm run test:watch        # Watch mode (vitest)
npm run test:coverage     # Run with v8 coverage (vitest run --coverage)
```

## Test File Organization

**Location:**

- Unit tests: co-located with source file in same directory
  - `src/lib/git.ts` → `src/lib/git.test.ts`
  - `src/lib/newpr/actions.ts` → `src/lib/newpr/actions.test.ts`
- Integration tests: `src/integration/*.integration.test.ts`
- E2E tests: `src/e2e/**/*.e2e.test.ts` (organized by command)

**Naming:**

- Unit: `{module}.test.ts`
- Unit (explicit): `{module}.unit.test.ts` (when both unit and e2e exist for same file)
- Integration: `{feature}.integration.test.ts`
- E2E: `{command}/{command}.e2e.test.ts`

**Structure:**

```
src/
├── lib/
│   ├── git.ts
│   ├── git.test.ts               # unit
│   ├── newpr/
│   │   ├── actions.ts
│   │   └── actions.test.ts       # unit
├── integration/
│   └── newpr.integration.test.ts # integration
└── e2e/
    ├── helpers/                  # shared e2e utilities
    │   ├── cli-runner.ts
    │   ├── gh-mock.ts
    │   ├── scenario-harness.ts
    │   ├── test-context.ts
    │   └── index.ts
    └── newpr/
        └── newpr.e2e.test.ts     # e2e
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('module-name', () => {
  describe('functionName', () => {
    describe('specific scenario or input', () => {
      it('does expected thing', () => {
        // arrange
        // act
        // assert
      });
    });
  });
});
```

**Patterns:**

- `beforeEach(() => { vi.clearAllMocks(); })` in every suite that uses mocks
- `beforeAll` / `afterAll` for expensive setup (real git repos in integration/e2e tests)
- `beforeEach` for per-test reset in integration tests
- Helper functions defined at suite level for creating test fixtures: `createState()`, `makeDeps()`, `makeAction()`
- Discriminated union narrowing in assertions:
  ```typescript
  const result = parseArgs(['--help']);
  expect(result.kind).toBe('help');
  if (result.kind === 'success') {
    expect(result.options.mode).toBe('new');
  }
  ```

## Mocking

**Framework:** Vitest `vi` module — `vi.mock()`, `vi.fn()`, `vi.mocked()`

**Module Mocking Pattern:**

```typescript
// Mock entire module at top level (hoisted automatically)
vi.mock('./git.js', () => ({
  listWorktrees: vi.fn(),
  isWorktree: vi.fn(),
  getCurrentBranch: vi.fn(),
  getRepoRoot: vi.fn(),
}));

// Get typed mock reference
const mockListWorktrees = vi.mocked(listWorktrees);
```

**Child Process Mocking:**

```typescript
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

const mockSpawnSync = vi.mocked(spawnSync);

// Helper for success
function mockSpawnSuccess(stdout: string): SpawnSyncReturns<string> {
  return {
    status: 0,
    signal: null,
    output: ['', stdout, ''],
    pid: 123,
    stdout,
    stderr: '',
    error: undefined,
  };
}

// Helper for failure
function mockSpawnFailure(stderr: string): SpawnSyncReturns<string> {
  return {
    status: 1,
    signal: null,
    output: ['', '', stderr],
    pid: 123,
    stdout: '',
    stderr,
    error: undefined,
  };
}
```

**Dependency Injection Mocks:**
For functions that accept `deps` objects, use `vi.fn()` factories:

```typescript
const makeDeps = (overrides: Partial<ActionDeps> = {}): ActionDeps => ({
  gitAdd: vi.fn(),
  gitStash: vi.fn().mockReturnValue('stash@{0}'),
  gitPush: vi.fn(),
  gitCommit: vi.fn(),
  ...overrides,
});
```

**What to Mock:**

- `child_process` (`spawnSync`, `spawn`, `execSync`) when testing git.ts functions
- Module-level dependencies (`./git.js`, `./github.js`) when testing logic that calls them
- File system (`fs`) for config loading tests
- External CLIs (`gh`) via the E2E gh-mock helper

**What NOT to Mock:**

- Pure logic functions (formatters, parsers, validators) — test with real inputs
- Internal helper functions that are private implementation details
- The actual git module in integration tests — those test real git behavior

## Fixtures and Factories

**State Fixtures (unit tests):**

```typescript
// In state-detection.test.ts
function createState(overrides: Partial<GitState> = {}): GitState {
  return {
    worktreeType: 'main_worktree',
    branchType: 'main',
    currentBranch: 'main',
    commitRelationship: 'same',
    workingTreeStatus: 'clean',
    localCommits: [],
    stagedFiles: [],
    unstagedFiles: [],
    repoRoot: '/home/user/repo',
    repoName: 'repo',
    ...overrides,
  };
}
```

**Test Repository Setup (integration/e2e):**

```typescript
// Create a real git repo in a temp directory
const tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'test-prefix-')));

// Create bare origin
const bareRepoDir = path.join(tempDir, 'origin.git');
fs.mkdirSync(bareRepoDir);
execSync('git init --bare', { cwd: bareRepoDir });

// Create working repo
const repoDir = path.join(tempDir, 'main-repo');
execSync('git init', { cwd: repoDir });
execSync('git config user.email "test@test.com"', { cwd: repoDir });
execSync('git config user.name "Test User"', { cwd: repoDir });

// Teardown in afterAll
fs.rmSync(tempDir, { recursive: true, force: true });
```

**E2E Test Context (`src/e2e/helpers/test-context.ts`):**
The `createTestContext()` factory creates fully isolated test environments:

```typescript
const ctx = createTestContext({
  scenario: 'main_clean_same', // git state scenario
  ghMockOptions: { authenticated: true }, // gh CLI mock config
  skipGhMock: false, // whether to skip gh mock
});
// ctx.repoDir    - path to test git repo
// ctx.env        - env vars with gh mock paths
// ctx.cleanup()  - deletes temp dirs
// ctx.reset()    - resets repo to clean state
```

**Scenario Harness (`src/e2e/helpers/scenario-harness.ts`):**
Creates repos in specific git states (the 10 newpr scenarios) for targeted e2e testing.

**JSON Fixtures (`src/e2e/fixtures/gh-responses/`):**
Static JSON files mocking `gh` CLI responses: `pr-create.json`, `pr-list.json`, `pr-view.json`, `repo-info.json`

**Location summary:**

- Test helpers: `src/e2e/helpers/`
- JSON fixtures: `src/e2e/fixtures/`
- Shared test utilities: exported from `src/e2e/helpers/index.ts`

## Coverage

**Requirements:**

- All thresholds enforced at 80%: statements, branches, functions, lines
- Config: `/home/chris/workspace/git-worktree-tools/vitest.config.ts`
- Coverage scope: `src/lib/**/*.ts` and `src/cli/**/*.ts`
- Excluded from coverage: `*.test.ts`, `**/types.ts`, `**/index.ts`
- Provider: `@vitest/coverage-v8`

**View Coverage:**

```bash
npm run test:coverage        # generates text + json + html reports
# HTML report: coverage/index.html
```

**Policy:** NEVER exclude files from coverage to make thresholds pass. Write real tests instead. (See CLAUDE.md testing guidelines.)

## Test Types

**Unit Tests:**

- Scope: individual functions in `src/lib/` and `src/cli/`
- Approach: mock all external dependencies; test logic in isolation
- Fast, no filesystem or git operations
- Location: co-located `*.test.ts` files

**Integration Tests:**

- Scope: multiple modules working together with real git operations
- Approach: create real temp git repos using `execSync`, test actual git state transformations
- Location: `src/integration/*.integration.test.ts`
- Use `beforeAll`/`afterAll` for repo setup/teardown
- Example: `src/integration/newpr.integration.test.ts` tests that uncommitted changes are correctly transferred to new branches

**E2E Tests:**

- Framework: runs compiled CLI binaries via `runCli()` helper from `src/e2e/helpers/cli-runner.ts`
- Uses `node-pty` for PTY-based interactive tests (`src/e2e/helpers/pty-wrapper.ts`)
- Mocks the `gh` CLI with a fake binary (`src/e2e/helpers/gh-mock.ts`)
- Uses `describe.skipIf(!GH_AVAILABLE)` to gate tests on gh availability
- Location: `src/e2e/**/*.e2e.test.ts`

## Common Patterns

**Async Testing:**

```typescript
it('fetches remote asynchronously', async () => {
  mockSpawn.mockImplementation(() => createMockChildProcess('output'));
  const result = await git.execAsync(['fetch', 'origin']);
  expect(result).toBe('output');
});
```

**Error Testing:**

```typescript
it('throws on git failure', () => {
  mockSpawnSync.mockReturnValue(mockSpawnFailure('fatal: not a git repository'));
  expect(() => git.exec(['status'])).toThrow('Git command failed');
});

// Async errors
it('rejects on async git failure', async () => {
  mockSpawn.mockImplementation(() => createFailingChildProcess('error'));
  await expect(git.execAsync(['fetch'])).rejects.toThrow();
});
```

**Conditional E2E skipping:**

```typescript
import { GH_AVAILABLE } from '../helpers/index.js';

describe.skipIf(!GH_AVAILABLE)('newpr e2e - core functionality', () => {
  // tests only run when gh is available
});
```

**Cleanup with try/finally in E2E:**

```typescript
it('fails when gh not authenticated', () => {
  const ctx = createTestContext({ scenario: 'main_clean_same' });
  try {
    const result = runCli('newpr', ['test', '--non-interactive'], {
      cwd: ctx.repoDir,
      env: ctx.env,
    });
    expect(result.exitCode).not.toBe(0);
  } finally {
    ctx.cleanup(); // always cleanup temp dirs
  }
});
```

---

_Testing analysis: 2026-02-18_
