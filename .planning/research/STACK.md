# Stack Research

**Domain:** Node.js CLI tooling — git workflow automation
**Researched:** 2026-02-18
**Confidence:** HIGH (all version data verified via npm registry, engine requirements confirmed)

---

## Existing Stack Assessment

The existing stack is the primary input. Research focuses on: what to keep, what to add, and what to avoid.

| Package              | Current Version | Latest | Keep?             | Rationale                                                                                 |
| -------------------- | --------------- | ------ | ----------------- | ----------------------------------------------------------------------------------------- |
| yargs                | ^17.7.2         | 18.0.0 | **KEEP at ^17**   | yargs 18 requires Node ^20.19.0 — incompatible with project's Node >=18 requirement       |
| inquirer             | ^9.3.7          | 13.2.5 | **KEEP, upgrade** | ESM, Node >=18, actively maintained (updated Feb 2026). Used in 7+ source files.          |
| @preact/signals-core | ^1.8.0          | 1.13.0 | **KEEP**          | Used only in manage-manifest.ts for reactive TUI state. Minimal surface area, works well. |
| json5                | ^2.2.3          | 2.2.3  | **KEEP**          | Config parsing, no alternative needed                                                     |
| node-pty             | ^1.1.0 (devDep) | 1.1.0  | **KEEP**          | E2E PTY testing, no alternative                                                           |
| vitest               | ^2.1.9          | 4.0.18 | **UPGRADE**       | Active development, latest is 4.x                                                         |

---

## Recommended Stack

### Core Technologies — Keep All Existing

| Technology  | Pin To    | Purpose                                                             | Constraint                                                                                              |
| ----------- | --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --- | -------- | --- | ------------------------------------------------------------------------------------------------ |
| TypeScript  | ^5.3.0    | Type safety across CLI                                              | No change needed                                                                                        |
| Node.js ESM | (runtime) | Module system                                                       | Package is `"type": "module"` — all deps must be ESM-compatible                                         |
| yargs       | ^17.7.2   | Argument parsing                                                    | **Do NOT upgrade to v18**: yargs 18 dropped Node 18/19 (requires ^20.19.0                               |     | ^22.12.0 |     | >=23). Our package.json says `"node": ">=18"`. Yargs 17.7.2 is stable and last updated May 2025. |
| inquirer    | ^9.3.7    | Interactive confirmation prompts, list selection in automated flows | Keep v9 series. ESM, Node >=18. Updated Feb 2026 at v13.2.5 — consider upgrading to ^13.x after testing |

### New Libraries to Add

#### 1. Spinners and Task Lists — ora 8.x (NOT 9.x)

**Recommendation: `ora@^8.1.1`**

- **Why NOT ora 9.x**: ora 9.3.0 requires Node >=20. Incompatible with Node 18.
- **Why ora 8.x**: Last release of 8.x (8.2.2) requires Node >=18. Same author (sindresorhus) as the canonical spinners. ESM. Active.
- **Provides**: Elegant terminal spinner for long-running async operations (git fetch, PR creation, gh calls)
- **Use for**: `wt new` PR creation flow, `wt clean` batch operations, `wt list` PR status fetching

```bash
npm install ora@^8.1.1
```

**Why not listr2**: listr2 9+ requires Node >=20, listr2 10+ requires Node >=22. The Node 18-compatible version (listr2 8.2.5, updated Jan 2026) is an option for multi-task sequences but adds complexity. Ora alone suffices for this use case — it handles the individual spinner; sequential task flow is handled by the existing promise chain.

#### 2. Structured Audit Logging — consola 3.x

**Recommendation: `consola@^3.4.2`**

- **Why consola over winston**: consola is ESM-native (`"type": "module"`), designed for CLI tools, has a unified reporter API. Winston 3.x is CJS-origin and requires careful ESM import handling. consola has levels, file reporters, and plays well with NO_COLOR/CI detection built-in.
- **Why consola over pino**: pino is designed for high-throughput server logging (async, structured JSON). consola is designed for interactive CLI output plus optional file logging — exactly our need.
- **Node compat**: Node ^14.18.0 || >=16.10.0 — fully compatible with Node >=18.
- **Provides**: Log levels (debug/info/warn/error/success), file transport, colorized terminal output, CI-aware (disables colors in non-TTY)
- **Use for**: `~/.config/git-worktree-tools/debug.log` session audit trail, `--verbose` flag, `--debug` flag

```bash
npm install consola@^3.4.2
```

**Log file pattern**: Use `consola` with a `FileReporter` writing to `~/.local/share/git-worktree-tools/wt-YYYY-MM-DD.log` (XDG base dir on Linux, `%APPDATA%` on Windows).

#### 3. CLI Output Tables — Native (no new dep)

**Recommendation: Build on existing `colors.ts` with a thin `table.ts` utility (no new dependency)**

- **Why not cli-table3**: Last updated May 2024 (v0.6.5). Minimal maintenance signal.
- **Why not a new dep at all**: The `lswt` output format (2–4 columns, branch/path/status) is straightforward. A 30-line `formatTable(rows, headers)` function in `src/lib/table.ts` using string padding is cross-platform, zero-cost, and testable.
- **Exception**: If future commands need complex tables (sorting, pagination), revisit then.

### Supporting Libraries — For LLM-Friendly Output

The project already has an excellent `src/lib/json-output.ts` with `CommandResult<T>`, `ErrorCode`, and `--json` flags. This is the right foundation.

**No new library needed.** Extend the existing pattern:

```typescript
// Already exists — extend this, don't replace it
interface CommandResult<T> {
  success: boolean;
  command: string;
  timestamp: string;
  data?: T;
  error?: ErrorInfo;
  warnings?: string[];
}
```

**Add to each command's JSON output**:

- `schema_version: "1"` — lets LLM tools detect output format changes
- `exit_code: number` — so shell scripts can branch on it
- Ensure every `--help` output includes `--json` documentation

### Development Tools — Keep All, Minor Upgrades

| Tool                | Current | Latest    | Action                           |
| ------------------- | ------- | --------- | -------------------------------- |
| vitest              | ^2.1.9  | 4.0.18    | Upgrade to ^3.x (v4 is very new) |
| @vitest/coverage-v8 | ^2.1.9  | 4.0.18    | Match vitest version             |
| prettier            | ^3.7.4  | (current) | No change                        |
| eslint              | ^9.39.2 | (current) | No change                        |
| typescript          | ^5.3.0  | 5.8       | Upgrade to ^5.8                  |

---

## Installation

```bash
# Add spinner support (Node 18-compatible version)
npm install ora@^8.1.1

# Add structured CLI logging
npm install consola@^3.4.2

# No other new production dependencies needed

# Dev: upgrade vitest
npm install -D vitest@^3 @vitest/coverage-v8@^3
```

---

## Alternatives Considered

| Category    | Recommended                 | Alternative          | Why Not                                                                                 |
| ----------- | --------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| Spinners    | ora@^8.1.1                  | ora@^9.x             | Node >=20 required, breaks Node 18 support                                              |
| Spinners    | ora@^8.1.1                  | listr2@^8.2.5        | Overkill for single spinners; listr2 v9+ drops Node 18                                  |
| Logging     | consola@^3.4.2              | winston@^3.x         | CJS origin, heavier deps, not designed for CLI tools                                    |
| Logging     | consola@^3.4.2              | pino@^10.x           | Server-optimized, async transports add complexity for a CLI                             |
| Prompts     | inquirer@^9 (keep)          | @clack/prompts@^1    | Beautiful but would require rewriting 7+ source files. inquirer is fine and maintained. |
| Prompts     | inquirer@^9 (keep)          | @inquirer/prompts@^8 | New modular API (same author). Consider for future but not worth churn now.             |
| Tables      | custom table.ts             | cli-table3@^0.6      | Last updated May 2024, minimal maintenance                                              |
| Tables      | custom table.ts             | ink@^6               | React/JSX in a CLI tool adds React 19 peer dep — unjustified complexity                 |
| Arg parsing | yargs@^17 (keep)            | commander@^14        | Would require rewriting all command definitions. yargs 17 is stable.                    |
| Arg parsing | yargs@^17 (keep)            | yargs@^18            | Node >=20 only — breaks our Node 18 users                                               |
| TUI state   | @preact/signals-core (keep) | plain variables      | The signals model in manage-manifest.ts is intentional and well-tested. Leave it.       |

---

## What NOT to Use

| Avoid                                   | Why                                                                                                                             | Use Instead                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- | --- | ---------------------------------------- | ----------------------- |
| `ora@^9.x`                              | Requires Node >=20, breaks Node 18 support. Our package.json says `>=18`.                                                       | `ora@^8.1.1`                                                       |
| `listr2@^9.x` or `^10.x`                | v9 requires Node >=20, v10 requires Node >=22                                                                                   | `listr2@^8.2.5` if needed, or just `ora@^8`                        |
| `yargs@^18`                             | Requires `^20.19.0                                                                                                              |                                                                    | ^22.12.0 |     | >=23` — silently breaks Node 18/19 users | Stay on `yargs@^17.7.2` |
| `ink@^6`                                | React 19 peer dep, JSX transform, significant complexity for a git tool                                                         | Custom rendering with ANSI codes (already done)                    |
| `chalk`                                 | Already have custom `colors.ts` that respects NO_COLOR and isTTY. Adding chalk is a duplicate dep.                              | Keep `src/lib/colors.ts`                                           |
| `winston-daily-rotate-file`             | CJS, last meaningful update Feb 2024, tied to Winston's CJS architecture                                                        | consola with a file reporter                                       |
| `@clack/prompts` for replacing inquirer | Inquirer v9–v13 is well-maintained (updated Feb 2026). Migration cost would be rewriting 7 source files for no functional gain. | Keep inquirer, consider @inquirer/prompts migration post-milestone |

---

## Stack Patterns by Variant

**If running in CI (no TTY):**

- Spinners (ora) auto-detect non-TTY and fall back to plain text — no special handling
- consola auto-detects CI and disables color — no special handling
- All `--json` flag paths must work without TTY

**If running with `--json` flag (LLM/script consumer):**

- All console output goes through `json-output.ts` factory functions
- No spinners (suppress when `--json` active, check `options.json` before starting ora)
- Log file still writes (consola file transport independent of stdout)

**If running on Windows:**

- ora uses `cli-spinners` which has Windows-compatible fallbacks
- consola works on Windows
- Custom `colors.ts` already handles NO_COLOR
- yargs 17 has known Windows compatibility

---

## Version Compatibility Matrix

| Package                     | Node 18 | Node 20 | Node 22 | ESM Safe                |
| --------------------------- | ------- | ------- | ------- | ----------------------- |
| yargs@17.7.2                | YES     | YES     | YES     | YES (has ESM exports)   |
| inquirer@9.3.7              | YES     | YES     | YES     | YES (`"type":"module"`) |
| inquirer@13.2.5             | YES     | YES     | YES     | YES (`"type":"module"`) |
| @preact/signals-core@1.13.0 | YES     | YES     | YES     | YES                     |
| ora@8.1.1                   | YES     | YES     | YES     | YES                     |
| ora@9.3.0                   | NO      | YES     | YES     | YES                     |
| listr2@8.2.5                | YES     | YES     | YES     | YES                     |
| listr2@9.0.5                | NO      | YES     | YES     | YES                     |
| listr2@10.1.0               | NO      | NO      | YES     | YES                     |
| consola@3.4.2               | YES     | YES     | YES     | YES (`"type":"module"`) |
| vitest@2.x                  | YES     | YES     | YES     | YES                     |
| vitest@3.x                  | YES     | YES     | YES     | YES                     |

---

## Confidence Notes

| Claim                                                   | Confidence | Source                                           |
| ------------------------------------------------------- | ---------- | ------------------------------------------------ |
| yargs 18 requires Node ^20.19.0                         | HIGH       | npm registry metadata, `engines` field confirmed |
| ora 9.x requires Node >=20                              | HIGH       | npm registry metadata confirmed                  |
| listr2 10.x requires Node >=22                          | HIGH       | npm registry metadata confirmed                  |
| listr2 8.2.5 is Node 18-compatible, updated Jan 2026    | HIGH       | npm registry metadata confirmed                  |
| inquirer 9–13 is ESM, Node >=18                         | HIGH       | npm registry metadata confirmed                  |
| consola is ESM-native, Node >=16                        | HIGH       | npm registry metadata confirmed                  |
| @preact/signals-core used only in manage-manifest.ts    | HIGH       | grep confirmed, single file                      |
| inquirer used in 7+ source files                        | HIGH       | grep confirmed                                   |
| @clack/prompts 1.0.1 released Feb 2026                  | HIGH       | npm registry confirmed                           |
| Custom colors.ts already handles NO_COLOR + isTTY       | HIGH       | source code read                                 |
| json-output.ts already provides CommandResult<T> schema | HIGH       | source code read                                 |

---

## Sources

- npm registry `npm view [package] --json` — all version/engine data
- `/home/chris/workspace/git-worktree-tools/src/lib/colors.ts` — confirmed custom ANSI implementation
- `/home/chris/workspace/git-worktree-tools/src/lib/json-output.ts` — confirmed existing LLM-friendly output schema
- `/home/chris/workspace/git-worktree-tools/src/lib/prompts.ts` — confirmed custom prompt/spinner implementation
- `/home/chris/workspace/git-worktree-tools/package.json` — confirmed current dep versions and engine constraint `>=18`
- grep analysis of src/ — confirmed inquirer usage surface area (7 files), signals-core usage (1 file)

---

_Stack research for: Node.js CLI git worktree tooling — consistency/logging/LLM-friendly refactor_
_Researched: 2026-02-18_
