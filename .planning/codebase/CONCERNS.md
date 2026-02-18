# Codebase Concerns

**Analysis Date:** 2026-02-18

## Tech Debt

**Duplicate debug logging systems:**

- Issue: Two parallel debug logging systems coexist - a module-level `Logger` class in `src/lib/logger.ts` and an ad-hoc `debug()` function in `src/cli/newpr.ts` that uses `console.error` with the `DEBUG=newpr` env var. The CLI entry point does not use the shared logger.
- Files: `src/cli/newpr.ts` (lines 57-84), `src/lib/logger.ts`
- Impact: Debug output from newpr cannot be controlled via the logger's standard log-level API. Users get two separate env-var mechanisms for debugging.
- Fix approach: Replace the local `debug()` function and `DEBUG_ENABLED` constant in `newpr.ts` with the shared `logger` singleton. Wire `--verbose` flag to `logger.setLevel(LogLevel.DEBUG)`.

**`github.ts` uses shell-interpolated string for `gh` command:**

- Issue: `src/lib/github.ts` builds the GitHub CLI command via string concatenation (`gh ${escapedArgs.join(' ')}`) and passes it to `execSync` as a shell string. This relies on the custom `shellEscape()` function for safety, rather than using `execSync` with an array or `spawnSync`.
- Files: `src/lib/github.ts` (lines 206-227)
- Impact: The `shellEscape` function may not handle all edge-cases on all platforms (e.g. PowerShell on Windows, unusual branch-name characters). `git.ts` already uses `spawnSync` array form for safety. Inconsistency creates maintenance burden.
- Fix approach: Refactor `github.ts` exec function to use `spawnSync('gh', args)` like `git.ts` does, removing the custom `shellEscape` helper.

**`api/clean.ts` uses `execSync` with interpolated branch name:**

- Issue: `src/api/clean.ts` (lines 88, 101) builds `git branch -D "${branch}"` and `git push origin --delete "${branch}"` as interpolated strings passed to `execSync`. Branch names come from external PR metadata.
- Files: `src/api/clean.ts` (lines 86-110)
- Impact: Branch names containing shell metacharacters (e.g. backticks, `$()`) could trigger shell injection. While unusual in practice, it is a latent security risk.
- Fix approach: Replace `execSync` calls with calls to the existing `git.exec()` (spawnSync-based) wrapper, passing branch name as an array element.

**`manage-manifest.ts` uses `execSync` for `git ls-files`:**

- Issue: `src/lib/wtlink/manage-manifest.ts` (line 1683) calls `execSync('git ls-files --ignored ...')` as a shell string, bypassing the shared `git.exec()` abstraction.
- Files: `src/lib/wtlink/manage-manifest.ts` (lines 1681-1696)
- Impact: Potential cross-platform issues on Windows (shell quoting), and diverges from the project's established pattern of using `spawnSync`-based git wrappers.
- Fix approach: Replace with `git.exec(['ls-files', '--ignored', '--exclude-standard', '--others'])` or add a dedicated `git.getIgnoredFiles()` helper.

**`wtconfig.ts` uses `execSync` directly:**

- Issue: `src/cli/wtconfig.ts` imports and uses `execSync` from `child_process` for editor and environment detection.
- Files: `src/cli/wtconfig.ts` (line 16)
- Impact: Bypasses shared git wrapper, creating additional shell-string risk. Makes testing harder (requires mocking `execSync` separately).
- Fix approach: Delegate to `src/lib/wtconfig/environment.ts` helpers or the shared git abstraction layer.

**`newpr.ts` is a 1326-line god file:**

- Issue: `src/cli/newpr.ts` at 1326 lines handles arg parsing, progress logging, debug logging, prerequisite checks, plan generation orchestration, worktree creation, hook execution, and user interaction in a single file.
- Files: `src/cli/newpr.ts`
- Impact: High cognitive load for modifications. The file is difficult to unit-test directly because it mixes pure logic with side effects and process I/O.
- Fix approach: Extract `checkPrerequisites()`, `showLocalCommits()`, `showUncommittedChanges()`, `showStagedChanges()`, and `showUnstagedChanges()` display helpers into `src/lib/newpr/display.ts`. The file is already partially decomposed via `src/lib/newpr/` sub-modules.

**`manage-manifest.ts` is 2042 lines:**

- Issue: The largest file in the codebase mixes TUI state machines, file I/O, git operations, React-like signals, and manifest parsing logic.
- Files: `src/lib/wtlink/manage-manifest.ts`
- Impact: Very high complexity. Any change risks breaking the interactive TUI. Test coverage of this file is limited because the interactive portions require PTY simulation.
- Fix approach: Split into: `state.ts` (pure state transitions), `renderer.ts` (terminal rendering), `file-ops.ts` (file system operations), keeping `manage-manifest.ts` as orchestrator only.

**Hardcoded `'preview'` label in interactive PR display:**

- Issue: `src/lib/prs/interactive.ts` line 242 hardcodes `'preview'` as the label string with a `// TODO: get from config` comment.
- Files: `src/lib/prs/interactive.ts` (line 242)
- Impact: Users cannot configure the label used to identify preview environments. The config system supports this field but it is not wired through to the display.
- Fix approach: Pass `config.previewLabel` down from the caller through the interactive display function arguments.

## Security Considerations

**Branch names used in interpolated shell strings:**

- Risk: In `src/api/clean.ts`, branch names from `gh pr list` output (external data) are interpolated into shell command strings and passed to `execSync`.
- Files: `src/api/clean.ts` (lines 88, 101)
- Current mitigation: Branch names are git-sourced and typically well-formed, and the strings are double-quoted.
- Recommendations: Use `spawnSync`/`git.exec()` array form so the OS never interprets the branch name through a shell.

**`github.ts` `shellEscape` is not exhaustive:**

- Risk: The custom `shellEscape()` in `src/lib/github.ts` (lines 159-166) uses a regex allowlist but may not cover all shell metacharacters across bash, zsh, and PowerShell. Branch names or PR titles containing unusual characters could be mishandled.
- Files: `src/lib/github.ts` (lines 159-166)
- Current mitigation: `gh` CLI arguments are largely controlled by the application, not user-supplied raw strings.
- Recommendations: Eliminate string interpolation by switching to `spawnSync('gh', args)`.

**AI prompt injection via repo docs:**

- Risk: `src/lib/ai/repo-docs.ts` reads `README.md` and `package.json` contents into AI prompts. If these files contain adversarial content designed to manipulate the AI model (prompt injection), the generated branch/PR names could be malicious or misleading.
- Files: `src/lib/ai/repo-docs.ts`
- Current mitigation: Content is truncated at `MAX_README_LENGTH = 2000` and `MAX_DESCRIPTION_LENGTH = 500`.
- Recommendations: Add explicit sanitisation that strips markdown code blocks from README content before embedding in prompts.

## Performance Bottlenecks

**Synchronous `gh` CLI calls block the event loop:**

- Problem: All GitHub CLI operations in `src/lib/github.ts` use `execSync`, which blocks the Node.js event loop during network I/O (PR list fetches, auth checks).
- Files: `src/lib/github.ts`
- Cause: `execSync` was chosen for simplicity; the spinner animation works around it using the async `git.execAsync()` in some paths.
- Improvement path: Migrate `github.ts` to use `spawnSync` minimum, or ideally async spawn, to allow spinner animation during gh CLI calls.

**`git ls-files` with 50MB buffer on large repos:**

- Problem: `src/lib/wtlink/manage-manifest.ts` (line 1685) configures `maxBuffer: 50 * 1024 * 1024` for `git ls-files --ignored`.
- Files: `src/lib/wtlink/manage-manifest.ts` (line 1685)
- Cause: Precautionary sizing for large repos, but allocates 50MB up front on every invocation.
- Improvement path: Stream output incrementally or set a lower default with a user-configurable override.

**Multiple sequential `git` calls in state analysis:**

- Problem: `src/lib/state-detection.ts` and `src/lib/wtstate/analyze.ts` make multiple sequential synchronous git calls (branch, commit, status, worktree list) that could be parallelised.
- Files: `src/lib/state-detection.ts`, `src/lib/wtstate/analyze.ts`
- Cause: Imperative sequential design. Each function wraps a separate `spawnSync` call.
- Improvement path: Batch state-gathering into fewer git calls or run independent queries in parallel using `Promise.all` with `git.execAsync()`.

## Fragile Areas

**`newpr.ts` git state machine with 10 scenarios:**

- Files: `src/cli/newpr.ts`, `src/lib/newpr/scenario-handler.ts`, `src/lib/state-detection.ts`
- Why fragile: The 10-scenario state machine is tightly coupled: `analyzeGitState` → `detectScenario` → `getScenarioContext` → `executeStateAction`. Adding a new scenario requires changes in at least 4 files. Scenario 5 (`branch_same_as_main`) has a special `return null` re-analysis path in `src/lib/wtstate/analyze.ts` (line 56).
- Safe modification: Add integration tests in `src/integration/newpr.integration.test.ts` for any new scenario before changing the state machine.
- Test coverage: Integration tests exist for most scenarios. Scenario 9 (`detached_head`) and scenario 10 (`pr_worktree`) have lighter coverage.

**Interactive TUI in `manage-manifest.ts` uses raw terminal control:**

- Files: `src/lib/wtlink/manage-manifest.ts`
- Why fragile: The TUI writes raw ANSI escape sequences directly to `process.stdout` and uses `readline` for key capture. The `@preact/signals-core` reactive state model is non-standard for terminal UIs. Any change to the rendering pipeline risks breaking the display on different terminal emulators.
- Safe modification: Run `src/e2e/wtlink/wtlink.e2e.test.ts` and `src/e2e/wt/interactive-menu.e2e.test.ts` after all changes. The PTY-based E2E harness in `src/e2e/helpers/pty-wrapper.ts` is the only reliable way to validate TUI behaviour.
- Test coverage: E2E PTY tests exist but are inherently timing-sensitive.

**Stash reference is hardcoded to `'stash@{0}'`:**

- Files: `src/lib/git.ts` (line 595), `src/lib/newpr/actions.ts`
- Why fragile: `stash()` always returns `'stash@{0}'` regardless of whether other stashes existed before. If the user already had stashes and a concurrent operation pops or pushes another stash, the reference becomes invalid and `stashApply` will apply the wrong stash.
- Safe modification: After stashing, capture the actual stash ref from `git stash list --format=%gd -1` rather than returning the hardcoded string.
- Test coverage: Stash operations are mocked in unit tests; no integration test covers pre-existing stash conditions.

**`getRepoRoot()` throws on failure (not all callers handle this):**

- Files: `src/lib/git.ts` (line 142)
- Why fragile: `getRepoRoot()` throws an `Error` when not in a git repo, but callers in `src/api/create.ts`, `src/api/clean.ts`, and `src/api/state.ts` wrap it in try/catch blocks of varying quality. Callers that forget the try/catch will propagate raw unformatted errors.
- Safe modification: Consider returning `null` on failure (like `execSafe`) and updating callers to check, or add a dedicated `findRepoRoot()` wrapper that returns `null`.
- Test coverage: CLI-layer callers are unit tested, but the API-layer callers in `src/api/` have fewer direct tests.

## Test Coverage Gaps

**`src/api/` directory not included in coverage thresholds:**

- What's not tested: `src/api/create.ts`, `src/api/clean.ts`, `src/api/list.ts`, `src/api/state.ts` are not listed in `vitest.config.ts` coverage `include` array (`src/lib/**/*.ts`, `src/cli/**/*.ts`).
- Files: `vitest.config.ts` (line 18), `src/api/`
- Risk: Bugs in the programmatic API surface (used by MCP server and external consumers) can go undetected.
- Priority: High - these files form the public library API.

**MCP server has no meaningful unit tests:**

- What's not tested: `src/mcp/server.ts` dispatch logic, tool input validation, and error formatting are not covered.
- Files: `src/mcp/server.ts`, `src/mcp/server.test.ts`
- Risk: Regressions in MCP tool schemas or response formats will only surface when an AI agent calls the tool.
- Priority: Medium.

**E2E tests excluded from coverage measurement:**

- What's not tested: `src/e2e/**` is excluded from coverage `include`. The E2E tests exercise the full CLI pipeline but their coverage data is not incorporated.
- Files: `vitest.config.ts` (line 18)
- Risk: False sense of low coverage for CLI entry points; the CLI files may have higher real-world coverage than metrics show.
- Priority: Low (E2E tests run separately and are not typically counted toward unit coverage).

**Detached HEAD and PR worktree scenarios lack integration test coverage:**

- What's not tested: `newpr` scenario 9 (`detached_head`) and scenario 10 (`pr_worktree`) are handled in `src/lib/newpr/scenario-handler.ts` but have no corresponding integration test cases in `src/integration/newpr.integration.test.ts`.
- Files: `src/lib/newpr/scenario-handler.ts`, `src/integration/newpr.integration.test.ts`
- Risk: Regressions in detached HEAD handling silently break the tool for users who rebase or checkout specific commits.
- Priority: Medium.

## Dependencies at Risk

**`node-pty` is a native module in devDependencies:**

- Risk: `node-pty` requires native compilation and is known to have installation issues on some Windows environments and Node version upgrades. It is required for E2E PTY tests.
- Impact: CI failures on native compilation; developers on Windows may not be able to run E2E tests without additional tooling (Python, MSVC build tools).
- Migration plan: If `node-pty` becomes unmaintained, consider `@lydell/xterm-headless` or spawning a real TTY subprocess in the test harness.

**`inquirer` v9 (ESM-only) + `@preact/signals-core` is an unusual dependency pair:**

- Risk: Both `inquirer` v9 and `@preact/signals-core` are runtime production dependencies. Signals-core is designed for UI frameworks, not terminal apps. The API surface may change in minor versions.
- Impact: `manage-manifest.ts` depends on both simultaneously, creating a complex reactive terminal pattern not commonly tested in the Node ecosystem.
- Migration plan: Evaluate replacing signals-core with plain reactive state (e.g. Immer or a simple event emitter) to reduce the dependency surface.

---

_Concerns audit: 2026-02-18_
