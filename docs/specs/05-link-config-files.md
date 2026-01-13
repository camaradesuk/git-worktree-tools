# Auto-Link Config Files on Worktree Creation - Implementation Specification

**Status**: Draft - Pending Review
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13

---

## Executive Summary

Add an optional prompt during worktree creation (`newpr`) that asks whether to link tracked configuration files (via `wtlink`) from the main worktree to the new feature worktree.

The behaviour is controlled by a new three-state configuration option `linkConfigFiles`:

- **`undefined`** (not set): Prompt the user interactively
- **`true`**: Auto-link without prompting
- **`false`**: Skip linking without prompting

---

## 1. High-Level Architecture

### 1.1 Integration Point

```
newpr CLI
    └── setupWorktree()           ← Integration point
            ├── Create shared repos symlinks (existing)
            └── NEW: Auto-link config files
                    ├── getEnabledFiles() from wtlink/config-manifest
                    ├── Prompt if config undefined
                    └── runWtlink() from wtlink/link-configs
```

### 1.2 Files to Modify

| File                             | Change                                              |
| -------------------------------- | --------------------------------------------------- |
| `src/lib/config.ts`              | Add `linkConfigFiles?: boolean` to `WorktreeConfig` |
| `src/lib/config-validation.ts`   | Add validation for new property                     |
| `schemas/worktreerc.schema.json` | Add JSON schema entry                               |
| `src/cli/newpr.ts`               | Integrate auto-link logic in `setupWorktree()`      |

---

## 2. Detailed Design

### 2.1 Config Schema Addition

```typescript
// src/lib/config.ts - WorktreeConfig interface
linkConfigFiles?: boolean;
```

### 2.2 Validation Addition

```typescript
// src/lib/config-validation.ts - KNOWN_TOP_LEVEL_KEYS array
'linkConfigFiles',

// Validation logic
if (obj.linkConfigFiles !== undefined && typeof obj.linkConfigFiles !== 'boolean') {
  errors.push({ path: 'linkConfigFiles', message: 'linkConfigFiles must be a boolean' });
}
```

### 2.3 setupWorktree Integration

```typescript
// src/cli/newpr.ts - in setupWorktree() after shared repos logic

const mainWorktreeRoot = git.getMainWorktreeRoot();
const enabledFiles = getEnabledFiles(mainWorktreeRoot);

if (enabledFiles.length > 0) {
  let shouldLink = false;

  if (config.linkConfigFiles === false) {
    // Explicitly disabled - skip
  } else if (config.linkConfigFiles === true) {
    // Explicitly enabled - auto-link
    shouldLink = true;
  } else if (!options.nonInteractive && !options.json) {
    // Not configured - prompt user
    console.log();
    console.log(colors.info(`Found ${enabledFiles.length} config file(s) to link:`));
    for (const file of enabledFiles.slice(0, 5)) {
      console.log(colors.dim(`  - ${file}`));
    }
    if (enabledFiles.length > 5) {
      console.log(colors.dim(`  ... and ${enabledFiles.length - 5} more`));
    }
    shouldLink = await promptConfirm('Link these config files from the main worktree?', true);
  } else {
    // Non-interactive/JSON mode - default to linking
    shouldLink = true;
  }

  if (shouldLink) {
    try {
      await runWtlink({
        source: mainWorktreeRoot,
        destination: worktreePath,
        dryRun: false,
        manifestFile: '.wtlinkrc',
        type: 'hard',
        yes: true,
      });
      progress(options, colors.success(`Linked ${enabledFiles.length} config file(s)`));
    } catch (error) {
      progress(options, colors.warning(`Failed to link config files: ${error}`));
    }
  }
}
```

---

## 3. Behaviour Matrix

| `linkConfigFiles` | Files in manifest | Non-interactive | Result                 |
| ----------------- | ----------------- | --------------- | ---------------------- |
| `undefined`       | Yes               | No              | **Prompt user**        |
| `undefined`       | Yes               | Yes             | **Auto-link**          |
| `undefined`       | No                | \*              | Skip (nothing to link) |
| `true`            | Yes               | \*              | **Auto-link**          |
| `true`            | No                | \*              | Skip (nothing to link) |
| `false`           | \*                | \*              | **Skip**               |

---

## 4. Edge Cases & Mitigations

| Edge Case                          | Mitigation                                            |
| ---------------------------------- | ----------------------------------------------------- |
| No files in wtlink manifest        | Check `getEnabledFiles().length` first; skip silently |
| Main worktree cannot be determined | Catch error, log warning, continue without linking    |
| wtlink `run()` throws error        | Catch, log warning, worktree creation still succeeds  |
| Files already linked               | wtlink handles internally (reports "already linked")  |
| Non-git-ignored file in manifest   | wtlink's safety check skips with DANGER warning       |
| JSON output mode                   | Suppress prompts, use non-interactive defaults        |

---

## 5. Testing Strategy

### 5.1 Unit Tests

**config-validation.test.ts:**

- [ ] Accept `linkConfigFiles: true`
- [ ] Accept `linkConfigFiles: false`
- [ ] Accept config without `linkConfigFiles`
- [ ] Reject `linkConfigFiles: "true"` (string)
- [ ] Reject `linkConfigFiles: 1` (number)

**newpr.test.ts (setupWorktree):**

- [ ] Links files when `linkConfigFiles: true` and files exist
- [ ] Skips linking when `linkConfigFiles: false`
- [ ] Skips linking when no files in manifest
- [ ] Handles link failures gracefully (warning only)

### 5.2 Manual Verification

```bash
# Test 1: Default behaviour (should prompt)
echo '{"wtlink":{"enabled":[".env.local"]}}' > .worktreerc
newpr "test feature"
# Expected: Prompt appears

# Test 2: Auto-link enabled
echo '{"linkConfigFiles":true,"wtlink":{"enabled":[".env.local"]}}' > .worktreerc
newpr "test feature"
# Expected: Links without prompting

# Test 3: Auto-link disabled
echo '{"linkConfigFiles":false,"wtlink":{"enabled":[".env.local"]}}' > .worktreerc
newpr "test feature"
# Expected: No prompt, no linking
```

---

## 6. Implementation Checklist

- [ ] Add `linkConfigFiles?: boolean` to `WorktreeConfig` in `src/lib/config.ts`
- [ ] Add `'linkConfigFiles'` to `KNOWN_TOP_LEVEL_KEYS` in `src/lib/config-validation.ts`
- [ ] Add boolean validation in `validateConfig()` in `src/lib/config-validation.ts`
- [ ] Add property to `schemas/worktreerc.schema.json`
- [ ] Add imports in `src/cli/newpr.ts` (getEnabledFiles, runWtlink, promptConfirm)
- [ ] Implement auto-link logic in `setupWorktree()`
- [ ] Add config validation tests
- [ ] Add setupWorktree tests
- [ ] Manual testing

---

## 7. Open Questions

1. **Default for non-interactive mode**: Should default to linking (current proposal) or skipping?

2. **Summary output**: Should `printSummary()` hide the "wtlink link" hint when files were auto-linked?

---

## 8. References

- [config-manifest.ts:258](src/lib/wtlink/config-manifest.ts#L258) - `getEnabledFiles()`
- [link-configs.ts:10](src/lib/wtlink/link-configs.ts#L10) - `LinkArgv` interface
- [newpr.ts:295](src/cli/newpr.ts#L295) - `setupWorktree()` integration point
- [config.ts:211](src/lib/config.ts#L211) - `WorktreeConfig` interface

---

_This document must be reviewed and approved before implementation begins._
