# Requirements: git-worktree-tools

**Defined:** 2026-02-18
**Core Value:** Every `wt` subcommand behaves consistently, predictably, and leaves a clear audit trail — so developers trust the tool and can debug it when something goes wrong.

## v1 Requirements

### Logging

- [ ] **LOG-01**: User can control all debug output via `GWT_LOG_LEVEL` — shared logger wired into all 4 legacy CLI entry points (`newpr`, `cleanpr`, `lswt`, `wtlink`)
- [ ] **LOG-02**: `newpr` debug output routes through shared logger singleton; local `debug()` function and `DEBUG=newpr` env var removed
- [ ] **LOG-03**: All commands write structured entries to a persistent audit log file with rotation (default: `~/.local/share/git-worktree-tools/audit.log`)
- [ ] **LOG-04**: All `wt` subcommands respect `--verbose` (DEBUG level) and `--quiet` (ERROR only) flags consistently

### UI Consistency

- [ ] **UI-01**: All commands use shared `src/lib/ui/` output primitives (`printTable`, `printHeader`, `printStatus`, `printError`) instead of inline `console.log` calls
- [ ] **UI-02**: ✓/✗/⚠/ℹ icons carry the same semantic meaning (success/error/warning/info) across all commands
- [ ] **UI-03**: All async operations use the same spinner style and formatting (consistent library and configuration)
- [ ] **UI-04**: All errors display as title + detail + hint — no raw stack traces or unformatted error objects exposed to users

### Menu Reliability

- [ ] **MENU-01**: `wt` interactive menu actions for link management invoke code that actually exists in `wtlink.ts` (list/sync/add/remove subcommands fixed or re-wired)
- [ ] **MENU-02**: No interactive menu silently exits; all menus have explicit Back/Done options; submenus return to their parent menu
- [ ] **MENU-03**: `wt prs` uses a single working code path for listing PRs; broken/duplicate path removed
- [ ] **MENU-04**: Interrupting any command with Ctrl+C restores terminal state cleanly (raw mode exited, cursor restored)

### LLM Ergonomics

- [ ] **LLM-01**: Every `wt` subcommand outputs valid `CommandResult<T>` JSON when `--json` is passed; no code paths exit without JSON output in JSON mode
- [ ] **LLM-02**: `wt --help` and all subcommand `--help` text is accurate, complete, and current (no stale flags, no missing subcommands)
- [ ] **LLM-03**: MCP server tool descriptions and input schemas in `src/mcp/server.ts` are fully documented and annotated
- [ ] **LLM-04**: `wt completion` generates working shell completions for all subcommands and flags (bash/zsh/fish)

### CLI Unification

- [ ] **UNI-01**: `newpr`, `cleanpr`, `lswt`, `wtlink` binaries delegate to corresponding `wt` subcommands and print a deprecation notice
- [ ] **UNI-02**: `wt` subcommands call library functions directly rather than spawning child processes via `runSubcommand()`
- [ ] **UNI-03**: `--verbose`, `--quiet`, `--json`, and `--no-color` flags work consistently and are available across all `wt` subcommands
- [ ] **UNI-04**: README and all help text present `wt` as the canonical entry point; legacy commands documented as deprecated aliases

## v2 Requirements

### Testing Infrastructure

- **TEST-01**: `src/api/` directory included in coverage thresholds (currently excluded)
- **TEST-02**: MCP server has unit tests for tool dispatch and error formatting
- **TEST-03**: Integration tests for detached HEAD (scenario 9) and PR worktree (scenario 10) in `newpr`

### Security / Robustness

- **SEC-01**: `api/clean.ts` branch names use `spawnSync` array form (not interpolated shell strings)
- **SEC-02**: `github.ts` exec function uses `spawnSync('gh', args)` instead of string concatenation
- **SEC-03**: Stash reference captures actual ref instead of hardcoded `stash@{0}`

### Performance

- **PERF-01**: `github.ts` migrated from `execSync` to async spawn for network I/O operations
- **PERF-02**: `manage-manifest.ts` `git ls-files` buffer size reduced from 50MB hardcoded to configurable

## Out of Scope

| Feature                           | Reason                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Real-time notifications / chat    | Not a communication tool                                                                   |
| GUI / web dashboard               | CLI-first, always                                                                          |
| GitLab / Bitbucket support        | `gh` CLI dependency makes this non-trivial; deferred                                       |
| Plugin system                     | Premature; wait for stable `wt` surface                                                    |
| `manage-manifest.ts` TUI refactor | 2042-line fragile component; only fix actual bugs with PTY tests in place, not consistency |
| `inquirer` v9 → v13 upgrade       | Affects 7 files; no functional gain for this milestone                                     |
| `vitest` v3 upgrade               | Housekeeping; separate PR                                                                  |

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| LOG-01      | Phase 1 | Pending |
| LOG-02      | Phase 1 | Pending |
| LOG-03      | Phase 1 | Pending |
| LOG-04      | Phase 1 | Pending |
| UI-01       | Phase 2 | Pending |
| UI-02       | Phase 2 | Pending |
| UI-03       | Phase 2 | Pending |
| UI-04       | Phase 2 | Pending |
| MENU-01     | Phase 3 | Pending |
| MENU-02     | Phase 3 | Pending |
| MENU-03     | Phase 3 | Pending |
| MENU-04     | Phase 3 | Pending |
| LLM-01      | Phase 4 | Pending |
| LLM-02      | Phase 4 | Pending |
| LLM-03      | Phase 4 | Pending |
| LLM-04      | Phase 4 | Pending |
| UNI-01      | Phase 5 | Pending |
| UNI-02      | Phase 5 | Pending |
| UNI-03      | Phase 5 | Pending |
| UNI-04      | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---

_Requirements defined: 2026-02-18_
_Last updated: 2026-02-18 after roadmap creation_
