# Git Worktree Tools: UX Action Plan

> **Summary of findings from [UX Improvement Analysis](./UX-IMPROVEMENT-ANALYSIS.md) and [Real-World Testing](./UX-REAL-WORLD-TESTING.md)**

---

## Critical Bugs to Fix Immediately

These issues break user expectations and should be addressed first:

| #   | Issue                              | Tool     | Current Behavior                                                  | Expected Behavior                                |
| --- | ---------------------------------- | -------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Raw stack trace on error           | wtlink   | `Error: Unable to detect... at detectSourceWorktree (file:///...` | User-friendly message with suggestion            |
| 2   | Wrong error code for hook failures | newpr    | `"code": "UNKNOWN_ERROR"` for pre-commit failures                 | `"code": "HOOK_FAILED"` or `"PRE_COMMIT_FAILED"` |
| 3   | Log prefixes in help text          | wtconfig | `[WARN] Usage:` and `[INFO] wtconfig` in help output              | Clean help text without log prefixes             |

### Fix #1: wtlink Error Handling

**File:** `src/lib/wtlink/link-configs.ts:88`

```typescript
// Current (line ~88)
throw new Error('Unable to detect an alternate worktree...');

// Should be
console.error(colors.error('Unable to detect source worktree automatically.'));
console.error('');
console.error('You are running from the main worktree with only one worktree available.');
console.error('To link config files, you need at least two worktrees.');
console.error('');
console.error(colors.dim('To fix:'));
console.error(colors.dim('  1. Create a PR worktree: newpr "My feature"'));
console.error(colors.dim('  2. Then link configs: wtlink link . ../my-repo.pr42'));
process.exit(1);
```

### Fix #2: Add HOOK_FAILED Error Code

**File:** `src/lib/json-output.ts`

Add to `ErrorCode` enum:

```typescript
export enum ErrorCode {
  // ... existing codes
  HOOK_FAILED = 'HOOK_FAILED',
  PRE_COMMIT_FAILED = 'PRE_COMMIT_FAILED',
}
```

**File:** `src/cli/newpr.ts` - catch hook failures specifically

### Fix #3: Remove Log Prefixes from wtconfig

**File:** `src/cli/wtconfig.ts`

Remove `[INFO]`, `[WARN]`, `[OK]` prefixes from help and output text.

---

## High-Priority UX Improvements

### 1. Overwhelming Output in wtlink manage

**Current:** Lists 400+ files with no summary or pagination

**Fix:** Add summary mode by default:

```
[DRY RUN] Summary of changes:
  1 active entry (will be linked)
  432 new entries found (would be added as commented)

Categories:
  .husky/         19 files
  coverage/       44 files
  dist/           350 files

Use --verbose to see full list
```

### 2. Text Wrapping in wtlink Help

**Current:** Descriptions wrap mid-word due to yargs defaults

**Fix:** Set proper terminal width in yargs configuration:

```typescript
yargs(hideBin(process.argv)).wrap(Math.min(100, yargs.terminalWidth()));
// ...
```

### 3. Add Error Suggestions Everywhere

Every error should suggest how to fix it:

```typescript
// Pattern to follow
interface ErrorWithSuggestion {
  code: ErrorCode;
  message: string;
  suggestion?: string;  // Add this field
}

// Example
{
  code: 'PR_NOT_FOUND',
  message: 'No worktree found for PR #999',
  suggestion: 'Run "lswt" to see available worktrees'
}
```

---

## Medium-Priority Enhancements

### 1. Post-Action Suggestions

After successful operations, show next steps:

```
✓ Created PR #42: Add dark mode
✓ Created worktree: ~/projects/my-app.pr42

Next steps:
  cd ~/projects/my-app.pr42    Navigate to worktree
  wt link                      Sync config files
  gh pr view --web             Open PR in browser
```

**Implementation:** Add `--suggest-next` flag (default on for interactive mode)

### 2. Consistent Prompt Style

Standardize on arrow-key navigation (like lswt) instead of numbered choices:

| Tool    | Current          | Target     |
| ------- | ---------------- | ---------- |
| newpr   | Numbered (1,2,3) | Arrow keys |
| cleanpr | Mixed            | Arrow keys |
| lswt    | Arrow keys       | Keep       |
| wtlink  | Arrow keys       | Keep       |

### 3. Add Colors to wtstate

Currently plain text, could benefit from visual hierarchy.

---

## Strategic Improvements (Larger Effort)

### 1. Unified `wt` Command

Create a master command that unifies all tools:

```bash
wt new "Feature"    # same as newpr
wt list            # same as lswt
wt clean           # same as cleanpr
wt link            # same as wtlink
wt state           # same as wtstate
wt config          # same as wtconfig
```

**Benefit:** Single entry point, better discoverability, tab completion

### 2. Shell Tab Completion

Generate completion scripts for bash/zsh/fish:

```bash
wt completions bash > /etc/bash_completion.d/wt
wt completions zsh > ~/.zsh/completions/_wt
```

### 3. Fuzzy Search in lswt

Add `/` to start searching in interactive mode:

```
Search: auth█
Matches: [PR #42] feat/add-auth
```

---

## Best Practices Adopted from Research

From [clig.dev](https://clig.dev/) and other sources:

1. **Print something within 100ms** - Every command should acknowledge invocation immediately
2. **Suggest on errors** - Every error should suggest a fix
3. **Suggest next commands** - After success, show what to do next
4. **Machine output opt-in** - `--json` flag (already implemented)
5. **Examples-first help** - Show common examples before options
6. **Consistent syntax** - Use same patterns across all tools

---

## Testing Checklist

Before releasing fixes, verify:

- [ ] `wtlink link --dry-run` shows friendly error (not stack trace)
- [ ] `newpr "test" --non-interactive --json` with hook failure shows `HOOK_FAILED`
- [ ] `wtconfig --help` has no `[INFO]` or `[WARN]` prefixes
- [ ] `wtlink manage --non-interactive --dry-run` shows summary (not 400 lines)
- [ ] All `--json` outputs include `suggestion` field on errors

---

## Files to Modify

| File                                | Changes                               |
| ----------------------------------- | ------------------------------------- |
| `src/lib/wtlink/link-configs.ts`    | Improve error handling                |
| `src/lib/json-output.ts`            | Add HOOK_FAILED error code            |
| `src/cli/newpr.ts`                  | Catch and properly code hook failures |
| `src/cli/wtconfig.ts`               | Remove log prefixes from output       |
| `src/cli/wtlink.ts`                 | Fix yargs terminal width              |
| `src/lib/wtlink/manage-manifest.ts` | Add summary mode                      |

---

## Priority Order

1. **This week:** Fix 3 critical bugs (stack trace, error code, log prefixes)
2. **Next sprint:** Add error suggestions, fix output verbosity
3. **Future:** Unified `wt` command, shell completion, fuzzy search

---

_See [UX-IMPROVEMENT-ANALYSIS.md](./UX-IMPROVEMENT-ANALYSIS.md) for full recommendations and [UX-REAL-WORLD-TESTING.md](./UX-REAL-WORLD-TESTING.md) for detailed test results._
