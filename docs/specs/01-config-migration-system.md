# Config Migration System - Implementation Specification

**Status**: Draft - Pending Review
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: WSL Ubuntu / macOS / Windows
**PR**: #18

---

## Executive Summary

This specification defines a comprehensive config migration system for git-worktree-tools that enables schema versioning, detection of deprecated configurations, and guided migrations. The system addresses three key needs: (1) tracking config schema versions to enable future migrations, (2) detecting and migrating legacy `.wtlinkrc` files to the unified `.worktreerc` format, and (3) identifying unknown or deprecated keys with actionable suggestions.

The migration system follows a non-destructive philosophy—always creating backups, never auto-deleting without explicit consent, and providing dry-run capabilities for safe preview. Version bumps occur only for breaking schema changes, minimising unnecessary migration noise.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Detailed Design](#2-detailed-design)
3. [Execution Flow](#3-execution-flow)
4. [Edge Cases & Mitigations](#4-edge-cases--mitigations)
5. [Testing Strategy](#5-testing-strategy)
6. [Implementation Checklist](#6-implementation-checklist)
7. [Open Questions](#7-open-questions)
8. [References](#8-references)

---

## 1. High-Level Architecture

### 1.1 Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Config Migration System                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐       │
│  │    Detector    │──▶│    Analyser    │──▶│    Reporter    │       │
│  │                │   │                │   │                │       │
│  │ • Version chk  │   │ • Categorise   │   │ • Console fmt  │       │
│  │ • Legacy files │   │ • Prioritise   │   │ • JSON output  │       │
│  │ • Unknown keys │   │ • Fix actions  │   │ • Suggestions  │       │
│  └────────────────┘   └────────────────┘   └────────────────┘       │
│          │                    │                    │                 │
│          └────────────────────┼────────────────────┘                 │
│                               ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Migration Runner                          │   │
│  │                                                                │   │
│  │  • Interactive prompts for confirmation                        │   │
│  │  • Automatic mode with --yes flag                              │   │
│  │  • Dry-run preview mode                                        │   │
│  │  • Atomic writes with backup creation                          │   │
│  │  • Rollback on failure                                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| Component       | File Location                          | Responsibility                  | Est. Effort |
| --------------- | -------------------------------------- | ------------------------------- | ----------- |
| **Types**       | `src/lib/config-migration/types.ts`    | Shared interfaces and constants | 1h          |
| **Detector**    | `src/lib/config-migration/detector.ts` | Scan configs for issues         | 3h          |
| **Runner**      | `src/lib/config-migration/runner.ts`   | Execute migration actions       | 3h          |
| **Reporter**    | `src/lib/config-migration/reporter.ts` | Format output for display       | 1.5h        |
| **CLI Command** | `src/cli/wtconfig.ts` (extend)         | `wtconfig migrate` command      | 2h          |
| **Integration** | `src/lib/config.ts` (modify)           | Startup warnings                | 1h          |

**Total Estimated Effort**: 11.5 hours

### 1.3 Dependencies

**Internal Dependencies**:

- `src/lib/config.ts` - Config loading and saving
- `src/lib/config-validation.ts` - Schema validation utilities
- `src/lib/wtlink/config-manifest.ts` - Existing `.wtlinkrc` migration logic
- `src/lib/prompts.ts` - Interactive user prompts
- `src/lib/colors.ts` - Terminal formatting
- `src/lib/logger.ts` - Logging infrastructure

**External Dependencies**:

- Node.js `fs` - File system operations
- Node.js `path` - Path manipulation
- Node.js `crypto` - For backup file naming

### 1.4 Integration Points

1. **Config Loading Hook**: Emit warnings when migration needed
2. **wtconfig CLI**: New `migrate` subcommand
3. **wt Main Menu**: Optional "Config needs migration" banner
4. **JSON Schema**: Add `configVersion` property
5. **Validation System**: Recognise `configVersion` as valid key

---

## 2. Detailed Design

### 2.1 Data Structures

```typescript
// src/lib/config-migration/types.ts

/**
 * Current schema version - increment ONLY for breaking changes
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * Minimum version that can be migrated (older versions unsupported)
 */
export const MINIMUM_SUPPORTED_VERSION = 1;

/**
 * Issue severity levels
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Types of migration issues that can be detected
 */
export type IssueType =
  | 'missing_version' // No configVersion field present
  | 'outdated_version' // configVersion < CURRENT_CONFIG_VERSION
  | 'future_version' // configVersion > CURRENT (needs tool upgrade)
  | 'legacy_wtlinkrc' // Separate .wtlinkrc file exists
  | 'deprecated_key' // Key scheduled for removal
  | 'unknown_key' // Unrecognised key (possible typo)
  | 'invalid_value_type'; // Value has wrong type

/**
 * Represents a single detected issue
 */
export interface MigrationIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  details?: string;
  keyPath?: string; // e.g., 'hooks.post-worktree'
  currentValue?: unknown;
  suggestedValue?: unknown;
  suggestion?: string; // Human-readable fix suggestion
  autoFixable: boolean;
  fixAction?: MigrationAction;
}

/**
 * Action to execute during migration
 */
export interface MigrationAction {
  type:
    | 'set_key' // Set or update a key
    | 'remove_key' // Remove a key
    | 'rename_key' // Rename a key
    | 'merge_legacy_file' // Merge .wtlinkrc into config
    | 'delete_file'; // Delete a file (legacy cleanup)

  keyPath?: string;
  oldKey?: string; // For rename operations
  newKey?: string; // For rename operations
  value?: unknown; // For set operations
  filePath?: string; // For file operations
  description: string; // Human-readable description
}

/**
 * Result of running detection
 */
export interface DetectionResult {
  issues: MigrationIssue[];
  autoFixableCount: number;
  manualFixCount: number;
  migrationRecommended: boolean;
  currentVersion?: number;
  targetVersion: number;
  configPath?: string;
  legacyFilesFound: string[];
}

/**
 * Result of running migration
 */
export interface MigrationResult {
  success: boolean;
  actionsExecuted: MigrationAction[];
  actionsSkipped: MigrationAction[];
  errors: string[];
  backupPath?: string;
  newConfigPath?: string;
}

/**
 * Options for migration execution
 */
export interface MigrationOptions {
  dryRun?: boolean;
  deleteLegacyFiles?: boolean;
  createBackup?: boolean; // Default: true
  interactive?: boolean; // Default: true
}

/**
 * Registry of known configuration keys
 */
export const KNOWN_CONFIG_KEYS = new Set([
  'configVersion',
  'baseBranch',
  'draftPr',
  'worktreePattern',
  'worktreeParent',
  'branchPrefix',
  'sharedRepos',
  'hooks',
  'hookDefaults',
  'wtlink',
  'ai',
  'logging',
]);

/**
 * Deprecated keys with migration guidance
 */
export const DEPRECATED_KEYS: Record<
  string,
  {
    message: string;
    replacement?: string;
    transform?: (value: unknown) => unknown;
  }
> = {
  // Future deprecations would be registered here
  // Example:
  // 'syncPatterns': {
  //   message: 'syncPatterns is deprecated, use wtlink.enabled instead',
  //   replacement: 'wtlink.enabled',
  // },
};

/**
 * Version history for documentation and migration paths
 */
export const VERSION_HISTORY: Record<
  number,
  {
    released: string;
    description: string;
    breakingChanges: string[];
  }
> = {
  1: {
    released: '2026-01-13',
    description: 'Initial versioned configuration format',
    breakingChanges: [
      'wtlink configuration now integrated into .worktreerc',
      'Hooks system added',
      'AI configuration section added',
    ],
  },
};
```

### 2.2 API Design

```typescript
// Public API from src/lib/config-migration/index.ts

/**
 * Detect all migration issues in a repository
 */
export function detectMigrationIssues(repoRoot: string): DetectionResult;

/**
 * Quick check if any migration is needed (for startup banners)
 */
export function needsMigration(repoRoot: string): boolean;

/**
 * Execute migration with given options
 */
export function runMigration(
  repoRoot: string,
  detection: DetectionResult,
  options?: MigrationOptions
): Promise<MigrationResult>;

/**
 * Create a backup of current config
 */
export function createConfigBackup(configPath: string): string;

/**
 * Restore config from backup
 */
export function restoreFromBackup(backupPath: string, configPath: string): void;
```

### 2.3 State Management

The migration system is stateless—each invocation:

1. Reads current config state from disk
2. Analyses and generates actions
3. Executes actions atomically
4. Writes final state to disk

No persistent state is maintained between runs. Backup files serve as the rollback mechanism.

### 2.4 Design Patterns Applied

| Pattern             | Application                          | Rationale                         |
| ------------------- | ------------------------------------ | --------------------------------- |
| **Strategy**        | Different fix actions per issue type | Extensible action system          |
| **Command**         | `MigrationAction` objects            | Undoable, serialisable operations |
| **Builder**         | `DetectionResult` construction       | Complex object assembly           |
| **Template Method** | Reporter output formats              | Console vs JSON output            |

---

## 3. Execution Flow

### 3.1 Happy Path - Interactive Migration

```
User: wtconfig migrate

┌─ Step 1: Detection ─────────────────────────────────────────────┐
│  • Load .worktreerc (raw JSON, skip validation)                 │
│  • Check configVersion field                                    │
│  • Scan for .wtlinkrc legacy file                               │
│  • Check all keys against KNOWN_CONFIG_KEYS                     │
│  • Check for deprecated keys                                    │
│  • Return DetectionResult with all issues                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Step 2: Report ────────────────────────────────────────────────┐
│  Config Migration Report                                        │
│  ══════════════════════                                         │
│                                                                 │
│  ⚠ 3 issues found (2 auto-fixable, 1 manual)                   │
│                                                                 │
│  Warnings:                                                      │
│  • Missing configVersion field [auto-fix available]             │
│  • Legacy .wtlinkrc file found [auto-fix available]             │
│                                                                 │
│  Info:                                                          │
│  • Unknown key 'baseBranhc' - did you mean 'baseBranch'?        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Step 3: Confirm ───────────────────────────────────────────────┐
│  Apply 2 auto-fixable migrations? [Y/n]                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Step 4: Backup ────────────────────────────────────────────────┐
│  • Copy .worktreerc → .worktreerc.backup.1736784000000          │
│  • Record backup path for rollback                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Step 5: Execute ───────────────────────────────────────────────┐
│  • Write to temp file first                                     │
│  • Set configVersion: 1                                         │
│  • Merge .wtlinkrc → wtlink.enabled/disabled                    │
│  • Atomic rename temp → .worktreerc                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Step 6: Validate ──────────────────────────────────────────────┐
│  • Load migrated config                                         │
│  • Run full validation                                          │
│  • If invalid → rollback from backup                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Step 7: Report Success ────────────────────────────────────────┐
│  ✓ Migration complete. 2 actions applied.                       │
│    Backup saved to: .worktreerc.backup.1736784000000            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Alternative Flows

**Dry-Run Mode** (`wtconfig migrate --dry-run`):

- Skip steps 4-6
- Report what WOULD be done
- Exit with no changes

**Non-Interactive Mode** (`wtconfig migrate --yes`):

- Skip step 3 (confirmation)
- Execute all auto-fixable actions

**JSON Output** (`wtconfig migrate --json`):

- Output structured JSON instead of formatted text
- Useful for scripting and CI integration

### 3.3 Sequence Diagram

```
┌─────┐          ┌────────┐       ┌────────┐       ┌────────┐       ┌──────┐
│User │          │  CLI   │       │Detector│       │ Runner │       │Config│
└──┬──┘          └───┬────┘       └───┬────┘       └───┬────┘       └──┬───┘
   │                 │                │                │               │
   │ wtconfig migrate│                │                │               │
   │────────────────▶│                │                │               │
   │                 │                │                │               │
   │                 │ detect()       │                │               │
   │                 │───────────────▶│                │               │
   │                 │                │ loadConfig()   │               │
   │                 │                │───────────────────────────────▶│
   │                 │                │◀───────────────────────────────│
   │                 │                │ checkLegacy()  │               │
   │                 │                │───────────────────────────────▶│
   │                 │                │◀───────────────────────────────│
   │                 │◀───────────────│                │               │
   │                 │ DetectionResult│                │               │
   │                 │                │                │               │
   │◀────────────────│ Display Report │                │               │
   │                 │                │                │               │
   │ Confirm [Y]     │                │                │               │
   │────────────────▶│                │                │               │
   │                 │                │                │               │
   │                 │ runMigration() │                │               │
   │                 │───────────────────────────────▶│               │
   │                 │                │                │ backup()      │
   │                 │                │                │──────────────▶│
   │                 │                │                │ write()       │
   │                 │                │                │──────────────▶│
   │                 │                │                │◀──────────────│
   │                 │◀───────────────────────────────│               │
   │                 │ MigrationResult│                │               │
   │                 │                │                │               │
   │◀────────────────│ Success        │                │               │
   │                 │                │                │               │
```

---

## 4. Edge Cases & Mitigations

| #   | Edge Case / Failure Mode                      | Impact | Likelihood | Mitigation Strategy                                                                       |
| --- | --------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------- |
| 1   | **No .worktreerc exists**                     | Low    | Medium     | Create new file with just `configVersion` if user agrees; offer to initialise full config |
| 2   | **Config is invalid JSON**                    | High   | Low        | Parse error with line/column info; abort migration; suggest manual fix or editor          |
| 3   | **Config file is read-only**                  | High   | Low        | Check permissions before migration; clear error message with chmod suggestion             |
| 4   | **Disk full during write**                    | High   | Very Low   | Write to temp file first; atomic rename; detect write failure; rollback                   |
| 5   | **Concurrent config modification**            | Medium | Very Low   | File locking during migration; detect modification after backup                           |
| 6   | **Legacy .wtlinkrc has parse errors**         | Medium | Low        | Report parse error; skip .wtlinkrc migration only; continue with other fixes              |
| 7   | **Both config and legacy have wtlink**        | Medium | Medium     | Intelligent merge: union enabled, union disabled; warn about duplicates                   |
| 8   | **Unknown keys are intentional**              | Low    | Low        | Never auto-delete unknown keys; info-level warning only; suggest removal                  |
| 9   | **Migration interrupted (Ctrl+C)**            | High   | Low        | Signal handler for cleanup; atomic writes mean partial state impossible                   |
| 10  | **configVersion is non-integer**              | Low    | Very Low   | Coerce to integer if numeric string; error if completely invalid                          |
| 11  | **Future version (tool outdated)**            | High   | Low        | Block migration; clear upgrade instructions with npm command                              |
| 12  | **User in wrong directory**                   | Medium | Medium     | Verify git repo; check for .worktreerc in parent dirs; helpful error                      |
| 13  | **Multiple config files**                     | Medium | Low        | Warn about duplicates; use standard priority order; suggest cleanup                       |
| 14  | **Symlinked config file**                     | Low    | Very Low   | Resolve symlink for backup; preserve symlink for write; warn user                         |
| 15  | **Running from PR worktree**                  | Medium | Medium     | Detect worktree; warn that migration affects main repo config                             |
| 16  | **Very large .wtlinkrc (1000+ entries)**      | Low    | Very Low   | Process in chunks; show progress indicator; no memory issues                              |
| 17  | **Local config needs migration too**          | Low    | Low        | Detect .worktreerc.local; offer to migrate both; separate backups                         |
| 18  | **Backup directory missing**                  | Low    | Very Low   | Create .worktree-backups/ if needed; fallback to same directory                           |
| 19  | **Git hooks triggered by file changes**       | Low    | Low        | Migration is atomic; hooks see consistent state                                           |
| 20  | **Config has trailing commas (invalid JSON)** | Medium | Low        | Use JSON5 parser as fallback; suggest fix location                                        |

### 4.1 Detailed Mitigation: Atomic Write Pattern

```typescript
async function atomicWriteConfig(configPath: string, config: object): Promise<void> {
  const tempPath = `${configPath}.tmp.${process.pid}.${Date.now()}`;
  const content = JSON.stringify(config, null, 2) + '\n';

  try {
    // 1. Write to temporary file
    await fs.promises.writeFile(tempPath, content, { encoding: 'utf-8', mode: 0o644 });

    // 2. Sync to ensure data is on disk
    const fd = await fs.promises.open(tempPath, 'r');
    await fd.sync();
    await fd.close();

    // 3. Atomic rename (POSIX guarantees atomicity)
    await fs.promises.rename(tempPath, configPath);
  } catch (error) {
    // Clean up temp file on any failure
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
```

### 4.2 Detailed Mitigation: Intelligent wtlink Merge

```typescript
function mergeWtlinkConfigs(
  existing: { enabled?: string[]; disabled?: string[] } | undefined,
  legacy: { enabled: string[]; disabled: string[] }
): { enabled: string[]; disabled: string[]; conflicts: string[] } {
  const enabledSet = new Set<string>();
  const disabledSet = new Set<string>();
  const conflicts: string[] = [];

  // Add existing entries
  for (const file of existing?.enabled ?? []) {
    enabledSet.add(normalise(file));
  }
  for (const file of existing?.disabled ?? []) {
    disabledSet.add(normalise(file));
  }

  // Merge legacy entries
  for (const file of legacy.enabled) {
    const norm = normalise(file);
    if (disabledSet.has(norm)) {
      // Conflict: file is disabled in config but enabled in legacy
      conflicts.push(`${file}: enabled in .wtlinkrc but disabled in .worktreerc`);
      // Resolution: enabled wins (more recent intent)
      disabledSet.delete(norm);
    }
    enabledSet.add(norm);
  }

  for (const file of legacy.disabled) {
    const norm = normalise(file);
    if (!enabledSet.has(norm)) {
      disabledSet.add(norm);
    }
    // If already enabled, skip (enabled takes precedence)
  }

  return {
    enabled: Array.from(enabledSet).sort(),
    disabled: Array.from(disabledSet).sort(),
    conflicts,
  };
}

function normalise(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

**File**: `src/lib/config-migration/detector.test.ts`

| #   | Test Case                                         | Est. |
| --- | ------------------------------------------------- | ---- |
| 1   | Detects missing configVersion in empty config     | 5m   |
| 2   | Detects missing configVersion in populated config | 5m   |
| 3   | Detects outdated configVersion (< current)        | 5m   |
| 4   | Detects future configVersion (> current)          | 5m   |
| 5   | Returns no issues for up-to-date config           | 5m   |
| 6   | Detects legacy .wtlinkrc file existence           | 10m  |
| 7   | Does not flag legacy if wtlink in config          | 5m   |
| 8   | Detects unknown keys                              | 5m   |
| 9   | Suggests similar key for typos (Levenshtein)      | 10m  |
| 10  | Detects multiple issues simultaneously            | 10m  |
| 11  | Handles non-existent config gracefully            | 5m   |
| 12  | Handles invalid JSON config                       | 10m  |

**File**: `src/lib/config-migration/runner.test.ts`

| #   | Test Case                                | Est. |
| --- | ---------------------------------------- | ---- |
| 1   | Sets configVersion on missing            | 10m  |
| 2   | Updates outdated configVersion           | 5m   |
| 3   | Creates backup before migration          | 10m  |
| 4   | Merges legacy .wtlinkrc enabled entries  | 15m  |
| 5   | Merges legacy .wtlinkrc disabled entries | 10m  |
| 6   | Handles merge conflicts (enabled wins)   | 15m  |
| 7   | Deletes legacy file with --delete-legacy | 10m  |
| 8   | Preserves legacy file without flag       | 5m   |
| 9   | Dry-run makes no changes                 | 10m  |
| 10  | Atomic write survives interruption       | 15m  |
| 11  | Rollback on validation failure           | 15m  |
| 12  | Handles permission errors gracefully     | 10m  |

**File**: `src/lib/config-migration/reporter.test.ts`

| #   | Test Case                             | Est. |
| --- | ------------------------------------- | ---- |
| 1   | Formats issues by severity            | 10m  |
| 2   | Includes auto-fix indicators          | 5m   |
| 3   | JSON output matches schema            | 10m  |
| 4   | Empty issues produces success message | 5m   |

### 5.2 Integration Tests

**File**: `src/integration/config-migration.integration.test.ts`

| #   | Test Case                                   | Est. |
| --- | ------------------------------------------- | ---- |
| 1   | Full migration workflow in real git repo    | 20m  |
| 2   | Migration with .wtlinkrc and no .worktreerc | 15m  |
| 3   | Migration preserves all existing config     | 15m  |
| 4   | Migration works from PR worktree            | 10m  |
| 5   | Concurrent migration detection              | 15m  |

### 5.3 Manual Verification Steps

```bash
# Setup test environment
mkdir -p /tmp/test-migration && cd /tmp/test-migration
git init
echo '{"baseBranch": "develop"}' > .worktreerc
echo -e '.env.local\n.vscode/settings.json\n# .env' > .wtlinkrc

# Test 1: Dry run
wtconfig migrate --dry-run
# Expected: Shows what would be done, no file changes

# Test 2: Interactive migration
wtconfig migrate
# Expected: Prompts for confirmation, creates backup, migrates

# Test 3: Verify result
cat .worktreerc
# Expected: {"configVersion": 1, "baseBranch": "develop", "wtlink": {...}}

# Test 4: Verify backup
ls -la .worktreerc.backup.*
# Expected: Backup file exists

# Test 5: Run again (should be no-op)
wtconfig migrate
# Expected: "Config is up to date, no migration needed"

# Test 6: JSON output
wtconfig migrate --json
# Expected: Valid JSON with success: true
```

---

## 6. Implementation Checklist

### Phase 1: Foundation (Est: 2h)

- [ ] Create `src/lib/config-migration/` directory
- [ ] Create `types.ts` with all interfaces and constants
- [ ] Add `configVersion` to `WorktreeConfig` interface in `config.ts`
- [ ] Add `configVersion` to `KNOWN_TOP_LEVEL_KEYS` in `config-validation.ts`
- [ ] Update `schemas/worktreerc.schema.json` with configVersion property

### Phase 2: Detection (Est: 3h)

- [ ] Create `detector.ts` with `detectMigrationIssues()`
- [ ] Implement version checking logic
- [ ] Implement legacy file detection
- [ ] Implement unknown key detection with Levenshtein suggestions
- [ ] Implement `needsMigration()` quick check
- [ ] Write unit tests for detector

### Phase 3: Execution (Est: 3h)

- [ ] Create `runner.ts` with `runMigration()`
- [ ] Implement backup creation
- [ ] Implement atomic write pattern
- [ ] Implement version setting action
- [ ] Implement legacy file merge action
- [ ] Implement rollback on failure
- [ ] Write unit tests for runner

### Phase 4: Reporting (Est: 1.5h)

- [ ] Create `reporter.ts` with `formatMigrationReport()`
- [ ] Implement console output formatting
- [ ] Implement JSON output formatting
- [ ] Write unit tests for reporter

### Phase 5: CLI Integration (Est: 2h)

- [ ] Add `migrate` subcommand to `wtconfig.ts`
- [ ] Implement `--yes`, `--dry-run`, `--delete-legacy`, `--json` flags
- [ ] Add startup banner to `wt` when migration needed
- [ ] Update help text and documentation

### Phase 6: Testing & Polish (Est: 2h)

- [ ] Write integration tests
- [ ] Test on Windows, macOS, Linux
- [ ] Test edge cases from table above
- [ ] Update README with migration documentation

**Total Estimated Effort**: 13.5 hours

---

## 7. Open Questions

1. **Backup retention policy**: Should old backups be automatically cleaned up?
   - **Recommendation**: No automatic cleanup. Add `wtconfig cleanup-backups` command later if needed.

2. **Global config migration**: Should `~/.config/git-worktree-tools/config.json` also be migrated?
   - **Recommendation**: Yes, apply same system. Detect and migrate both.

3. **Warning frequency**: How often to show "migration available" banner?
   - **Recommendation**: Once per terminal session using environment variable.

4. **Nested key deprecation**: How to handle deprecating nested keys like `hooks.postWorktree` → `hooks.post-worktree`?
   - **Recommendation**: Support dot-notation in `keyPath` for nested keys.

---

## 8. References

- [Existing config-manifest.ts](../src/lib/wtlink/config-manifest.ts) - Reference implementation for .wtlinkrc handling
- [Config loading](../src/lib/config.ts) - Current configuration system
- [Config validation](../src/lib/config-validation.ts) - Validation infrastructure
- [JSON Schema](../schemas/worktreerc.schema.json) - Schema definition
- [Semantic Versioning](https://semver.org/) - Version numbering best practices
- [Levenshtein Distance Algorithm](https://en.wikipedia.org/wiki/Levenshtein_distance) - For typo suggestions

---

**Document End**

_This document must be reviewed and approved before implementation begins._
