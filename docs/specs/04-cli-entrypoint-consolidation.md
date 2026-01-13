# CLI Entrypoint Consolidation - Implementation Specification

**Status**: 📋 Planning (Awaiting Decisions)
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13

---

## Executive Summary

Consolidate the CLI interface by making `wt` the primary command, replacing the current architecture where `wt` subcommands spawn standalone binaries (`newpr`, `cleanpr`, etc.) as child processes.

The current architecture has:

- A **unified `wt` command** (`src/cli/wt.ts`) with 9 subcommands
- **7 standalone CLI binaries** in `package.json`
- `wt` subcommands that **spawn child processes** to execute standalone commands

The proposed consolidation would:

- Eliminate subprocess startup overhead (~100-200ms per command)
- Reduce the number of npm bin entries
- Provide unified help, logging, and configuration
- Follow modern CLI patterns from `git`, `npm`, and `docker`

---

## 1. Current Architecture Analysis

### 1.1 Existing Commands

| Standalone Binary  | `wt` Subcommand | Library Module               |
| ------------------ | --------------- | ---------------------------- |
| `newpr`            | `wt new`        | `src/lib/newpr/`             |
| `cleanpr`          | `wt clean`      | `src/lib/cleanpr/`           |
| `lswt`             | `wt list`       | `src/lib/lswt/`              |
| `wtlink`           | `wt link`       | `src/lib/wtlink/`            |
| `wtstate`          | `wt state`      | `src/lib/state-detection.ts` |
| `wtconfig`         | `wt config`     | `src/lib/config.ts`          |
| `git-worktree-mcp` | N/A             | `src/mcp/`                   |

### 1.2 Current Execution Flow

```text
User runs: wt new "feature"
    └── wt.ts parses args
        └── runSubcommand() spawns child process
            └── newpr "feature" executes as separate process
                └── Returns exit code
```

### 1.3 Files Involved

| File                  | Role                                   |
| --------------------- | -------------------------------------- |
| `src/cli/wt.ts`       | Unified command with yargs subcommands |
| `src/cli/newpr.ts`    | Standalone newpr binary                |
| `src/cli/cleanpr.ts`  | Standalone cleanpr binary              |
| `src/cli/lswt.ts`     | Standalone lswt binary                 |
| `src/cli/wtlink.ts`   | Standalone wtlink binary               |
| `src/cli/wtstate.ts`  | Standalone wtstate binary              |
| `src/cli/wtconfig.ts` | Standalone wtconfig binary             |
| `package.json`        | Defines bin entries for all commands   |

---

## 2. Design Questions (Awaiting Decisions)

### 2.1 Scope & Requirements

#### Q1: Which commands should be the "canonical" interface?

**Context:** Currently users can run either `wt new "feature"` or `newpr "feature"` for the same result.

**Options:**

- [ ] **`wt` only** — Remove all standalone binaries except `wt` and `git-worktree-mcp` _(Recommended - cleaner, follows modern CLI conventions)_
- [ ] **`wt` primary with legacy aliases** — Keep standalone commands as thin wrappers that call `wt`
- [ ] **Both fully supported** — Keep both approaches indefinitely with shared implementation
- [ ] Other: **\*\***\_\_\_**\*\***

#### Q2: Should this be a breaking change?

**Context:** Removing standalone commands would break existing scripts and muscle memory.

**Options:**

- [ ] **Yes, breaking** — v2.0.0 with clear migration guide _(Recommended - cleaner long-term)_
- [ ] **No, deprecation first** — Warn for 2-3 minor releases before removal
- [ ] Other: **\*\***\_\_\_**\*\***

---

### 2.2 Technical Approach

#### Q3: How should `wt` subcommands invoke the underlying logic?

**Context:** Currently subcommands spawn child processes via `runSubcommand()`.

**Options:**

- [ ] **Direct import** — `wt new` imports and calls handler functions directly _(Recommended - fastest, simplest)_
- [ ] **Shared entry module** — Create `src/lib/cli-handlers.ts` for both interfaces
- [ ] **Keep spawn but optimise** — Use worker threads or async spawn
- [ ] Other: **\*\***\_\_\_**\*\***

#### Q4: What should happen to the standalone CLI files?

**Context:** Files like `src/cli/newpr.ts` are currently full implementations.

**Options:**

- [ ] **Delete entirely** — Move handler logic to `wt` subcommands _(Recommended if Q1 = "wt only")_
- [ ] **Convert to thin wrappers** — Standalone files re-export from `wt`
- [ ] **Invert the dependency** — `wt` subcommands call standalone handlers
- [ ] Other: **\*\***\_\_\_**\*\***

#### Q5: How should shell completion work?

**Context:** Currently `wt completion` exists. Standalone commands lack completion.

**Options:**

- [ ] **`wt` completion only** — Users add `wt` completion to their shell _(Recommended)_
- [ ] **Generate aliases** — Completion script includes aliases for legacy commands
- [ ] Other: **\*\***\_\_\_**\*\***

---

### 2.3 User Experience

#### Q6: What command aliases should be supported?

**Context:** `wt` supports short aliases like `wt n` for `wt new`.

**Options (select all that apply):**

- [ ] Keep existing short aliases (`n`, `ls`, `c`, `l`, `s`, `cfg`) _(Recommended)_
- [ ] Add legacy command names as aliases (`wt newpr`, `wt cleanpr`, `wt lswt`)
- [ ] Add single-letter aliases for all commands
- [ ] Other: **\*\***\_\_\_**\*\***

#### Q7: How verbose should deprecation warnings be?

**Context:** If keeping standalone commands temporarily, we need to guide users to `wt`.

**Options:**

- [ ] **Once per session** — Show deprecation warning on first invocation only _(Recommended)_
- [ ] **Every time** — Always warn when using deprecated commands
- [ ] **Silent with flag** — No warnings by default, `--warn-deprecated` to enable
- [ ] Other: **\*\***\_\_\_**\*\***

---

### 2.4 Testing & Quality

#### Q8: What's the testing strategy for the consolidated command?

**Options (select all that apply):**

- [ ] Unit tests for handler functions (already exist in `src/lib/*/`) _(Recommended)_
- [ ] Integration tests for `wt` subcommands
- [ ] E2E tests verifying both old and new interfaces during deprecation
- [ ] Other: **\*\***\_\_\_**\*\***

---

## 3. Proposed Architecture (Pending Decisions)

### 3.1 Target Execution Flow

```text
User runs: wt new "feature"
    └── wt.ts parses args
        └── Directly calls newprHandler(args)
            └── Returns result (no subprocess)
```

### 3.2 Estimated Performance Improvement

| Metric               | Current        | After Consolidation |
| -------------------- | -------------- | ------------------- |
| Command startup time | ~200-300ms     | ~100-150ms          |
| Process count        | 2 (wt + child) | 1 (wt only)         |
| Memory overhead      | ~50MB per proc | ~50MB total         |

---

## 4. Recommendations Summary

If proceeding with sensible defaults:

| Question | Recommendation          | Reasoning                                                |
| -------- | ----------------------- | -------------------------------------------------------- |
| Q1       | `wt` only               | Cleaner interface, follows `git`/`docker`/`npm` patterns |
| Q2       | Breaking (v2.0.0)       | Clean break better than extended deprecation             |
| Q3       | Direct import           | Eliminates subprocess overhead, simplifies debugging     |
| Q4       | Delete standalone files | Reduces maintenance burden, single source of truth       |
| Q5       | `wt` completion only    | Simpler, users only need one completion setup            |
| Q6       | Keep existing + legacy  | Ease migration: `wt newpr` works as alias for `wt new`   |
| Q7       | Once per session        | Informs without annoying                                 |
| Q8       | Unit + integration      | Leverage existing lib tests, add wt-specific integration |

---

## 5. Implementation Checklist (Pending Decisions)

- [ ] Decide on Q1-Q8 (scope and technical approach)
- [ ] Create detailed implementation plan based on decisions
- [ ] Refactor `wt.ts` to directly import handler functions
- [ ] Update/remove standalone CLI files per Q4 decision
- [ ] Update `package.json` bin entries
- [ ] Add deprecation warnings if keeping legacy commands
- [ ] Update shell completion scripts
- [ ] Add integration tests for `wt` subcommands
- [ ] Update documentation and migration guide
- [ ] Update CHANGELOG with breaking changes

---

## 6. Testing Strategy (Pending Decisions)

### 6.1 Unit Tests

Existing tests in `src/lib/*/` cover handler logic.

### 6.2 Integration Tests (To Be Added)

```typescript
// Example: wt new integration test
describe('wt new', () => {
  it('should create worktree with PR', async () => {
    // Test wt new directly without subprocess
  });

  it('should support --json output', async () => {
    // Verify JSON output matches standalone command
  });
});
```

### 6.3 Migration Tests (If Deprecation Path)

```typescript
describe('legacy command deprecation', () => {
  it('should show deprecation warning on first use', () => {
    // Verify warning appears once per session
  });

  it('should still execute the command successfully', () => {
    // Ensure backwards compatibility
  });
});
```

---

## 7. Quick Answers Template

Copy and fill in to provide decisions:

```text
Q1: [wt only / legacy aliases / both]
Q2: [breaking / deprecation]
Q3: [direct import / shared module / spawn]
Q4: [delete / thin wrappers / invert]
Q5: [wt only / generate aliases]
Q6: [existing / legacy names / single-letter / other]
Q7: [once / every time / silent]
Q8: [unit / integration / e2e / all]
```

---

## 8. References

- [npm Blog: Adding subcommands to CLI tools](https://blog.npmjs.org/post/119317128765/adding-subcommands-to-your-command-line-tool.html)
- [Node.js CLI Apps Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices)
- [oclif: The Open CLI Framework](https://oclif.io/)
- [wt.ts](src/cli/wt.ts) - Current unified command implementation
- [TUI Consolidation Spec](./06-tui-consolidation.md) - Related consolidation effort

---

_This specification is awaiting decisions on design questions before implementation can proceed._
