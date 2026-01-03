# Testing Strategy Improvements

> This document outlines recommended improvements to the testing architecture, identified during a comprehensive review. Implementation is planned for a future PR.

## Executive Summary

The git-worktree-tools project has a **solid, enterprise-grade testing architecture** with clear separation between unit, integration, and E2E tests. The 231+ tests achieve 80% coverage thresholds, with thoughtful edge case handling for cross-platform git operations.

**Overall Quality Score: 8.5/10**

---

## Current Architecture Overview

### Test Distribution

| Category          | Files | Purpose                            |
| ----------------- | ----- | ---------------------------------- |
| Unit Tests        | 19    | Mocked dependencies, fast, focused |
| Integration Tests | 4     | Real git operations in temp repos  |
| E2E Tests         | 2     | Compiled CLI execution             |

### Framework Stack

- **Vitest** v2.1.9 - Test runner with globals enabled
- **@vitest/coverage-v8** - V8-based coverage
- 80% thresholds enforced (statements, branches, functions, lines)

---

## Strengths

### 1. Excellent Test Layering

Clear separation of concerns:

```
Unit (mocked)     → Fast, deterministic, focused
Integration       → Real git in temp directories
E2E               → Compiled CLI execution
```

### 2. Comprehensive Edge Case Coverage

- Whitespace handling (critical for git output parsing)
- Cross-platform paths (Windows `C:\Users\RUNNER~1\...`)
- Detached HEAD states
- User cancellation flows (SIGINT, quit commands)
- All 10 git state scenarios documented and tested

### 3. Good Object Factory Pattern

```typescript
const makeGitState = (overrides = {}) => ({
  worktreeType: 'main_worktree',
  branchType: 'main',
  ...overrides,
});
```

### 4. Proper Lifecycle Management

- `beforeEach()` clears mocks consistently
- Integration tests create/destroy temp repos
- E2E tests verify build exists before running

### 5. Parameterized Tests for Scenario Coverage

```typescript
it.each(scenarios)('should return description for %s', (scenario) => {
  const description = getScenarioDescription(scenario);
  expect(description).toBeTruthy();
});
```

---

## Areas for Improvement

### HIGH PRIORITY

#### 1. Duplicated Mock Definitions (~150 lines of repetition)

**Problem:** Each CLI test file independently mocks the same modules:

- `newpr.test.ts` mocks `git.js` with 25 functions
- `cleanpr.test.ts` mocks `git.js` with 3 functions
- `lswt.test.ts` mocks `git.js` with 1 function

**Impact:**

- Maintenance burden when API changes
- Inconsistent mock coverage across tests
- Dead code (mocked functions never used)

**Recommendation:** Create shared mock utilities:

```typescript
// src/__tests__/mocks/git.mock.ts
export const createGitMock = () => ({
  getRepoRoot: vi.fn(),
  getRepoName: vi.fn(),
  getCurrentBranch: vi.fn(),
  // ... all git functions
});

// In vitest.setup.ts or individual tests
vi.mock('../lib/git.js', () => createGitMock());
```

#### 2. Inconsistent Factory Naming

**Problem:** Different naming conventions across tests:

- `makeGitState()` (scenario-handler.test.ts)
- `createState()` (state-detection.test.ts)
- `makeWorktreeInfo()` (cleanpr.test.ts)

**Recommendation:** Standardize on `make*()` pattern and consolidate in a shared file:

```typescript
// src/__tests__/factories/index.ts
export { makeGitState } from './git-state.factory';
export { makeWorktreeInfo } from './worktree.factory';
export { makePrInfo } from './pr.factory';
```

#### 3. Mock Reset Strategy Varies

**Problem:** Inconsistent cleanup patterns:

```typescript
// Most tests
vi.clearAllMocks();

// CLI tests (correct for dynamic imports)
vi.resetAllMocks();
vi.resetModules();

// One-off
consoleSpy.mockClear(); // Only clears console
```

**Recommendation:** Document and standardize in `vitest.setup.ts`:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

### MEDIUM PRIORITY

#### 4. Missing Negative Assertions

**Problem:** Tests verify functions ARE called but rarely verify functions are NOT called inappropriately.

**Example improvement:**

```typescript
it('does not apply stash when using commits', () => {
  // ... setup for "use_commits" action
  expect(mockStashApply).not.toHaveBeenCalled();
  expect(mockStashDrop).not.toHaveBeenCalled();
});
```

#### 5. E2E Error Scenarios Underexplored

**Current coverage:**

- Help output
- Manifest validation (happy path)
- Hard link creation

**Missing scenarios:**

- Invalid CLI arguments
- Missing repository
- Permission errors
- Network failures (github commands)
- Corrupted manifest files

#### 6. TUI Modules Excluded from Coverage

**Currently excluded:**

- `main-menu.ts`
- `manage-manifest.ts`
- `link-configs.ts`

**Justification:** Interactive terminal I/O is hard to test.

**Recommendation:** Extract testable logic into separate functions:

```typescript
// manage-manifest.ts
export function parseManifestEntry(line: string): ManifestEntry { ... }
export function validateManifestFormat(content: string): ValidationResult { ... }

// manage-manifest.ui.ts (excluded from coverage)
export async function promptForEntry(): Promise<ManifestEntry> { ... }
```

### LOW PRIORITY

#### 7. Missing Snapshot Tests for Complex Output

**Opportunity:** `lswt` formatter output is complex and would benefit from snapshot testing:

```typescript
it('formats worktree list correctly', () => {
  const output = formatWorktreeList(worktrees, options);
  expect(output).toMatchSnapshot();
});
```

#### 8. No Conditional Skip for Integration Tests

**Problem:** If git is unavailable, integration tests fail rather than skip.

**Recommendation:**

```typescript
const gitAvailable = (() => {
  try {
    execSync('git --version');
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!gitAvailable)('git integration', () => {
  /* ... */
});
```

#### 9. GitHub Mock Mode Documentation

**Observation:** `github.ts` has two mocking approaches:

1. `vi.mock()` in tests
2. Built-in mock mode (`enableMockMode()`)

**Recommendation:** Document when to use each approach in CONTRIBUTING.md.

---

## Suggested File Structure Changes

```
src/
├── __tests__/
│   ├── mocks/
│   │   ├── git.mock.ts
│   │   ├── github.mock.ts
│   │   ├── prompts.mock.ts
│   │   └── child-process.mock.ts
│   ├── factories/
│   │   ├── git-state.factory.ts
│   │   ├── worktree.factory.ts
│   │   ├── pr-info.factory.ts
│   │   └── index.ts
│   └── helpers/
│       ├── spawn-result.ts
│       └── temp-repo.ts
├── lib/
│   └── *.test.ts (import from __tests__/)
└── vitest.setup.ts (global mock configuration)
```

---

## Metrics Summary

| Metric                     | Current    | Target   |
| -------------------------- | ---------- | -------- |
| Test count                 | 231+       | -        |
| Coverage threshold         | 80%        | 85%      |
| Duplicated mock code       | ~150 lines | 0        |
| Shared test utilities      | 0 files    | 3+ files |
| E2E error scenarios        | 2          | 8+       |
| Factory naming consistency | 70%        | 100%     |

---

## Implementation Checklist

- [ ] Create `src/__tests__/mocks/` directory with shared mock utilities
- [ ] Consolidate CLI test mocks to use shared utilities
- [ ] Standardize factory naming to `make*()` pattern
- [ ] Create `src/__tests__/factories/` with shared factories
- [ ] Add `vitest.setup.ts` with global mock configuration
- [ ] Add negative assertions to critical test cases
- [ ] Expand E2E tests for error scenarios
- [ ] Extract testable logic from TUI modules
- [ ] Add snapshot tests for `lswt` formatters
- [ ] Add conditional skip for integration tests when git unavailable
- [ ] Document GitHub mock mode usage in CONTRIBUTING.md
