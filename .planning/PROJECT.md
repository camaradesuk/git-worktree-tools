# git-worktree-tools

## What This Is

`@camaradesuk/git-worktree-tools` is a cross-platform Node.js/TypeScript CLI for git worktree workflow management. It provides a unified `wt` command (with legacy aliases `newpr`, `cleanpr`, `lswt`, `wtlink`) and an MCP server for AI agent integration. The tool manages the full lifecycle of feature-branch worktrees: creating PRs, listing worktrees with live GitHub status, cleaning up merged branches, and syncing gitignored files across worktrees.

## Core Value

Every `wt` subcommand behaves consistently, predictably, and leaves a clear audit trail — so developers trust the tool and can debug it when something goes wrong.

## Requirements

### Validated

- ✓ Cross-platform worktree management (Windows/macOS/Linux) — existing
- ✓ `newpr` — create PR with worktree, state-based decision logic (10 scenarios) — existing
- ✓ `cleanpr` — remove worktrees for merged/closed PRs — existing
- ✓ `lswt` — list worktrees with GitHub PR status — existing
- ✓ `wtlink` — sync gitignored files via hard links — existing
- ✓ `wt` unified entry point with yargs subcommands — existing (partial)
- ✓ MCP server exposing worktree tools to AI agents — existing
- ✓ JSON output mode (`--json` flag) for machine-readable output — existing
- ✓ Structured logger with log levels (`logger.ts`) — existing
- ✓ Config system (`.worktreerc`, local overrides, global config) — existing
- ✓ Lifecycle hook system (pre/post hooks in `.worktreerc`) — existing
- ✓ AI generation for branch names, PR titles, plan docs — existing

### Active

- [ ] `wt` is the single primary entry point; `newpr`, `cleanpr`, `lswt`, `wtlink` become deprecated aliases
- [ ] All subcommands share a consistent visual style: same output formatting, same color/icon conventions, same progress indicators
- [ ] Navigation is consistent across all interactive menus: back always works, menus never silently exit, options are predictable
- [ ] `wt prs` lists PRs through one path only — the broken duplicate removed, the working one fixed
- [ ] Logging is exhaustive and routed through the shared `logger` singleton: debug visibility for troubleshooting + persistent audit trail
- [ ] The ad-hoc `debug()` + `DEBUG=newpr` mechanism in `newpr.ts` removed and replaced with the shared logger
- [ ] Help text is accurate, complete, and current for all subcommands
- [ ] LLM-friendly: `--json` output documented, MCP tools annotated, CLI help structured for machine parsing

### Out of Scope

- Real-time chat or notifications — not a communication tool
- GUI / web dashboard — CLI-first, always
- Support for non-GitHub remotes (GitLab, Bitbucket) — deferred to future milestone; `gh` CLI dependency makes this non-trivial
- Plugin system — premature; wait for stable `wt` surface first

## Context

- The codebase already has a good foundation: a shared `logger.ts` singleton, a `CommandResult<T>` API layer, JSON output support, and a partially-implemented `wt` unified binary
- The main inconsistency source: four independently-evolved CLI entry points (`src/cli/newpr.ts`, `src/cli/cleanpr.ts`, `src/cli/lswt.ts`, `src/cli/wtlink.ts`) each developed their own output patterns before the `wt` unification effort began
- Known bugs: `wt prs` has two code paths for listing PRs; one returns empty results
- Known fragile area: `manage-manifest.ts` (2042-line TUI) — any UI changes there require running E2E PTY tests
- The `src/api/` layer is not in coverage thresholds — risk area for MCP regressions
- Duplicate logging: `newpr.ts` uses a local `debug()` + `DEBUG=newpr` env var; all other paths use the shared `logger`

## Constraints

- **Tech stack**: TypeScript + Node.js ESM; must remain cross-platform (no bash dependencies)
- **Compatibility**: `newpr`, `cleanpr`, `lswt`, `wtlink` binaries must continue working as aliases — no breaking changes for existing users
- **Testing**: E2E PTY tests required for any change to interactive TUI menus; `node-pty` is a native dep and can be flaky on Windows CI
- **External deps**: `gh` CLI and `git` CLI are required runtime dependencies (not bundled)

## Key Decisions

| Decision                                             | Rationale                                                                             | Outcome   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| `wt` becomes primary; others become aliases          | Unification without breaking existing scripts                                         | — Pending |
| Shared `logger` singleton for all debug/audit output | Eliminate duplicate logging mechanisms, single control point                          | — Pending |
| No new UI framework for TUI                          | `manage-manifest.ts` already uses signals-core; introducing another pattern adds risk | — Pending |

---

_Last updated: 2026-02-18 after initialization_
