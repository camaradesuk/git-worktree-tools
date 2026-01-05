# CI Lint Failure Analysis

## Incident Summary

When asked to "ensure linting check will pass before pushing", I ran local checks and declared the branch ready to push. However, the CI PR lint job subsequently failed.

## What I Ran Locally

```bash
npm run lint          # ESLint - passed with 17 warnings, 0 errors
npm run format:check  # Prettier - initially failed, then fixed
npm run format        # Fixed formatting issues
# Committed formatting fixes
npm run format:check  # Verified - passed
npm run lint          # Verified - passed (17 warnings)
```

## What CI Actually Runs

Looking at `.github/workflows/ci.yml` lines 40-63, the `lint` job runs **three** commands:

```yaml
- name: Run ESLint
  run: npm run lint

- name: Check formatting
  run: npm run format:check

- name: TypeScript check
  run: npm run build
```

## Root Cause: Incomplete Local Verification

**I only ran 2 of the 3 CI lint checks locally.**

I did NOT run `npm run build` (TypeScript compilation) as part of my pre-push verification. The CI lint job includes TypeScript compilation as its third step, which could fail due to:

- Type errors introduced in the changes
- Missing type imports
- Interface mismatches
- Strict null checks violations

## Why My Prediction Was Wrong

1. **Incomplete understanding of CI workflow**: I assumed "lint" meant only ESLint + Prettier, but the CI lint job also includes TypeScript compilation.

2. **Semantic confusion**: The CI job is named "Lint" but actually runs three distinct checks:
   - ESLint (code quality rules)
   - Prettier (formatting)
   - TypeScript (type checking)

3. **False confidence from partial success**: When ESLint and Prettier passed, I declared readiness without verifying ALL checks that CI would run.

## Prevention Strategies

### 1. Create a Combined Pre-Push Check Script

Add to `package.json`:

```json
{
  "scripts": {
    "ci:lint": "npm run lint && npm run format:check && npm run build",
    "prepush": "npm run ci:lint && npm test"
  }
}
```

### 2. Always Reference CI Workflow Before Declaring Readiness

Before saying "ready to push", explicitly verify by:

1. Reading `.github/workflows/ci.yml`
2. Running ALL commands from the relevant job(s)
3. Only declaring ready when ALL CI commands pass locally

### 3. Use a Checklist

Before pushing, verify:

- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm run build` passes (TypeScript)
- [ ] `npm test` passes

### 4. Run the Exact CI Commands

Instead of running individual commands, run the exact sequence from CI:

```bash
# Replicate CI lint job exactly
npm ci                 # Clean install (matches CI)
npm run lint           # Step 1
npm run format:check   # Step 2
npm run build          # Step 3 (MISSED THIS!)
```

## Lessons Learned

1. **"Lint" is overloaded terminology** - In this project, the CI "lint" job includes TypeScript checking, not just ESLint.

2. **Verify against source of truth** - The CI workflow file is the authoritative definition of what passes. Always check it.

3. **Partial verification creates false confidence** - 2 out of 3 checks passing doesn't mean CI will pass.

4. **ESLint warnings vs errors** - While the 17 ESLint warnings didn't fail CI (they're `warn` level, not `error`), this was a red flag I should have investigated more carefully.

## Actual TypeScript Errors Found

Running `npm run build` reveals the actual CI failures:

```
src/lib/ai/provider-manager.test.ts(17,15): error TS2339: Property 'checkAvailability' does not exist on type 'Mock<Procedure>'.

src/lib/cleanpr/worktree-info.test.ts(195,5): error TS2304: Cannot find name 'beforeEach'.

src/lib/cleanpr/worktree-info.test.ts(254,11): error TS2353: Object literal may only specify known properties, and 'headRefName' does not exist in type 'PrInfo'.
```

### Error Analysis

1. **provider-manager.test.ts:17** - Mock type doesn't include static `checkAvailability` method
2. **worktree-info.test.ts:195** - Missing `beforeEach` import from vitest
3. **worktree-info.test.ts:254** - Mock `PrInfo` object has extra properties not in the type

### Why These Passed Vitest But Failed TSC

Vitest runs tests at runtime where JavaScript is dynamically typed. TypeScript compilation (`tsc`) performs static type checking which is stricter. Code can pass tests but fail type checking.

## Key Takeaway

**ESLint and Prettier passing does NOT mean the code will compile.** TypeScript compilation is a separate, critical check that must always be run before declaring code ready.
