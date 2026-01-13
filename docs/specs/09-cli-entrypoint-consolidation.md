# Clarifying Questions: CLI Entrypoint Consolidation

## Context Summary

After analysing the codebase, I've identified the current architecture and the consolidation opportunity:

**Current State:**

- A **unified `wt` command** exists (`src/cli/wt.ts`) using yargs with 9 subcommands: `new`, `list`, `clean`, `link`, `state`, `config`, `init`, `completion`, `prs`
- **7 standalone CLI binaries** in `package.json`: `wt`, `newpr`, `cleanpr`, `lswt`, `wtlink`, `wtstate`, `wtconfig`, `git-worktree-mcp`
- The `wt` subcommands currently **spawn child processes** via `runSubcommand()` to execute the standalone commands (e.g., `wt new` spawns `newpr` as a subprocess)
- Core business logic has already been extracted to library modules (`src/lib/newpr/`, `src/lib/lswt/`, `src/lib/cleanpr/`, etc.)

**Key Finding from Research:**
Best practices favour consolidated subcommands (e.g., `wt new`, `wt clean`) over standalone commands (`newpr`, `cleanpr`), following patterns from tools like `git`, `npm`, and `docker`. The [npm blog](https://blog.npmjs.org/post/119317128765/adding-subcommands-to-your-command-line-tool.html) and [Node.js CLI best practices](https://github.com/lirantal/nodejs-cli-apps-best-practices) both recommend this approach.

**The Consolidation Opportunity:**
Rather than spawning child processes, `wt` subcommands could directly import and call the handler functions from the lib modules. This would:

- Eliminate subprocess startup overhead (~100-200ms per command)
- Reduce the number of npm bin entries
- Provide unified help, logging, and configuration

---

## Questions for Clarification

### 1. Scope & Requirements

#### Q1: Which commands should be the "canonical" interface?

**Context:** Currently users can run either `wt new "feature"` or `newpr "feature"` for the same result. Consolidation requires deciding which is primary.

**Select one:**

- [ ] **`wt` only** — Remove all standalone binaries except `wt` and `git-worktree-mcp` ⭐ _Recommended - cleaner, follows modern CLI conventions_
- [ ] **`wt` primary with legacy aliases** — Keep standalone commands as thin wrappers that call `wt` (for backwards compatibility)
- [ ] **Both fully supported** — Keep both approaches indefinitely with shared implementation
- [ ] Other: **\*\***\_\_\_**\*\***

---

#### Q2: Should this be a breaking change?

**Context:** Removing the standalone commands (newpr, lswt, etc.) would break existing scripts and muscle memory.

- [ ] **Yes, breaking** — v2.0.0 with clear migration guide ⭐ _Recommended - cleaner long-term_
- [ ] **No, deprecation first** — Warn for 2-3 minor releases before removal
- [ ] Other: **\*\***\_\_\_**\*\***

---

### 2. Technical Approach

#### Q3: How should the `wt` subcommands invoke the underlying logic?

**Context:** Currently subcommands spawn child processes. The consolidation would change this.

**Select one:**

- [ ] **Direct import** — `wt new` imports and calls handler functions from `src/lib/newpr/` directly ⭐ _Recommended - fastest, simplest_
- [ ] **Shared entry module** — Create a new `src/lib/cli-handlers.ts` that both `wt` and standalone commands use
- [ ] **Keep spawn but optimise** — Use worker threads or async spawn instead of sync spawn
- [ ] Other: **\*\***\_\_\_**\*\***

---

#### Q4: What should happen to the standalone CLI files?

**Context:** Files like `src/cli/newpr.ts`, `src/cli/lswt.ts` are currently full implementations.

**Select one:**

- [ ] **Delete entirely** — Move handler logic to `wt` subcommands, remove standalone files ⭐ _Recommended if Q1 = "wt only"_
- [ ] **Convert to thin wrappers** — Standalone files just re-export from `wt` subcommands
- [ ] **Invert the dependency** — `wt` subcommands become thin wrappers calling standalone handlers
- [ ] Other: **\*\***\_\_\_**\*\***

---

#### Q5: How should shell completion work?

**Context:** Currently `wt completion` exists. Standalone commands don't have completion.

**Select one:**

- [ ] **`wt` completion only** — Users add `wt` completion to their shell ⭐ _Recommended_
- [ ] **Generate aliases** — Completion script also includes aliases for `newpr`, `lswt`, etc.
- [ ] Other: **\*\***\_\_\_**\*\***

---

### 3. User Experience

#### Q6: What command aliases should be supported in the unified `wt` tool?

**Context:** Currently `wt` supports short aliases like `wt n` for `wt new` and `wt ls` for `wt list`.

**Select all that apply:**

- [ ] Keep existing short aliases (`n`, `ls`, `c`, `l`, `s`, `cfg`) ⭐ _Recommended_
- [ ] Add legacy command names as aliases (`wt newpr`, `wt cleanpr`, `wt lswt`)
- [ ] Add single-letter aliases for all commands
- [ ] Other: **\*\***\_\_\_**\*\***

---

#### Q7: How verbose should deprecation warnings be?

**Context:** If keeping standalone commands temporarily, we need to guide users to `wt`.

**Select one:**

- [ ] **Once per session** — Show deprecation warning on first invocation only ⭐ _Recommended_
- [ ] **Every time** — Always warn when using deprecated commands
- [ ] **Silent with flag** — No warnings by default, `--warn-deprecated` to enable
- [ ] Other: **\*\***\_\_\_**\*\***

---

### 4. Testing & Quality

#### Q8: What's the testing strategy for the consolidated command?

**Select all that apply:**

- [ ] Unit tests for handler functions (already exist in `src/lib/*/`) ⭐ _Recommended_
- [ ] Integration tests for `wt` subcommands
- [ ] E2E tests verifying both old and new interfaces work during deprecation
- [ ] Other: **\*\***\_\_\_**\*\***

---

## Quick Answers Summary

_For your convenience, copy and fill in:_

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

## My Recommendations

If you want me to proceed with sensible defaults, here's what I would choose:

| Question | My Recommendation            | Reasoning                                                |
| -------- | ---------------------------- | -------------------------------------------------------- |
| Q1       | `wt` only                    | Cleaner interface, follows `git`/`docker`/`npm` patterns |
| Q2       | Breaking (v2.0.0)            | Clean break is better than extended deprecation period   |
| Q3       | Direct import                | Eliminates subprocess overhead, simplifies debugging     |
| Q4       | Delete standalone files      | Reduces maintenance burden, single source of truth       |
| Q5       | `wt` completion only         | Simpler, users only need one completion setup            |
| Q6       | Keep existing + legacy names | Ease migration: `wt newpr` works as alias for `wt new`   |
| Q7       | Once per session             | Informs without annoying                                 |
| Q8       | Unit + integration           | Leverage existing lib tests, add wt-specific integration |

---

## Next Steps

Reply with your answers using any format:

- Fill in the checkboxes above
- Use the quick answers summary
- Just type your preferences in plain text
- Say "use your recommendations" to accept my defaults
- Answer some and say "use your judgement for the rest"

_After clarification, I'll proceed with the full ultraplan specification._

---

## Sources

- [npm Blog: Adding subcommands to your command line tool](https://blog.npmjs.org/post/119317128765/adding-subcommands-to-your-command-line-tool.html)
- [Node.js CLI Apps Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices)
- [oclif: The Open CLI Framework](https://oclif.io/)
- [Existing CLI Refactoring Plan](../archive/CLI_REFACTORING_PLAN.md)
- [TUI Consolidation Spec](./06-tui-consolidation.md)
