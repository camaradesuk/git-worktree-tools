# Design: Agent-Supplied PR Content, Subscription AI Providers, and Flexible Worktree Layouts

**Date:** 2026-08-07
**Status:** Approved design, pending implementation plan
**Scope:** `wt new` content generation, AI provider selection, worktree path resolution, config override surface, documentation

---

## 1. Problem statement

Three related problems, each verified against the running tool rather than inferred.

### 1.1 PRs are born as stubs

`wt new` was run against this repository to create PR #22 (the PR carrying this spec). The
repository's `.worktreerc` has `ai.provider: "auto"` with `prTitle: true` and
`prDescription: true`, and `GEMINI_API_KEY` is set in the environment. The PR that came out:

```
TITLE: design spec for agent-supplied PR content, codex subscription provider, and
       bare-repo worktree layout support

BODY:
## Summary
design spec for agent-supplied PR content, codex subscription provider, and
bare-repo worktree layout support

## Changes
-

## Test Plan
- [ ]

---
🤖 PR created with `newpr`
```

The title is the raw description echoed back. The body is the literal template from
`src/cli/newpr.ts:1104-1117` with empty bullets. The branch name
(`feat/design-spec-for-agent-supplied-pr-content-codex-su-0cw4ql`) carries the random suffix
from the rule-based `generateBranchName`, so AI did not run for the branch either.

Two distinct causes, both confirmed:

**Cause A — no channel for caller-supplied content.** `wt new` has no `--title` or `--body`
flag. A coding agent driving the CLI holds the entire conversation — requirements, plan,
constraints — and cannot pass any of it in. The `start-work` skill currently invokes
`wt new "<description>" --ready --non-interactive --action=empty_commit --json`, so a
one-line description is the only content that reaches the tool.

**Cause B — the AI path failed silently.** Neither the success message
(`✨ AI-generated PR content`, `src/lib/config.ts:940`) nor the failure warning
(`⚠ AI generation failed`, `src/lib/config.ts:946`) appeared. Direct testing found why:

```
$ curl -s -X POST ".../gemini-2.5-flash:generateContent" -H "x-goog-api-key: $GEMINI_API_KEY" ...
HTTP: 400
{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.",
          "status":"INVALID_ARGUMENT","reason":"API_KEY_INVALID"}}

$ claude -p "Say OK"
OK
```

`GEMINI_API_KEY` is set but invalid. `GeminiAPIProvider.checkAvailability()`
(`src/lib/ai/gemini-api-provider.ts:39`) returns `Boolean(process.env.GEMINI_API_KEY)` — it
tests for _presence_, not validity. `gemini-api` is first in the auto-detection priority list
(`src/lib/ai/provider-manager.ts:108`: `gemini-api → claude → gemini → ollama → codex`), so
it always wins selection here. Its call then fails and returns an error _result_ rather than
throwing, so the `catch` at `config.ts:943` never fires, `anyGenerated` stays `false`, and
`generatePRContentAsync` falls to `return defaultResult` at `config.ts:950` with **no
diagnostic output at all**.

There is no automatic fall-through to the next provider in the priority list.
`executeWithFallback` (`provider-manager.ts:225`) only engages when an explicit `fallback`
provider is configured. A working `claude` CLI sat unused behind a broken first choice.

### 1.2 Paid-for subscriptions go unused

The machine has `claude` (Claude subscription) and `codex` (ChatGPT/Codex subscription) CLIs
installed and authenticated, plus a local `ollama`. Under the current priority order, an
always-"available" `gemini-api` means neither subscription CLI is ever reached. The `codex`
provider is last in a list that never gets past position one.

The `OpenAIProvider` (`src/lib/ai/cli-provider.ts:215`) is also not fit for purpose as
written: it runs `codex exec "prompt"` and captures raw stdout, which includes the agent's
reasoning preamble and token accounting rather than only the final answer. The installed
`codex` CLI (v0.144.0) offers the flags needed to fix this — `--output-last-message <FILE>`,
`--output-schema <FILE>`, `--json`, `-s read-only`, `--skip-git-repo-check`, `--color never`.

### 1.3 Worktree placement breaks on non-standard layouts

`generateWorktreePath` (`src/lib/config.ts:770-778`) resolves a relative `worktreeParent`
against `repoRoot`, which is `git rev-parse --show-toplevel` — the **current worktree**, not a
stable anchor. Consequences:

- From inside a linked worktree, the parent is computed relative to that worktree. With
  `worktreeParent: "pr"`, invoking from `/syrf/pr/pr2467.x` targets
  `/syrf/pr/pr2467.x/pr` instead of `/syrf/pr`. The destination moves depending on where the
  user happens to be standing.
- Bare-repository container layouts are unsupported. `/home/chris/workspace/syrf` is not
  itself a git repository: it contains `.bare/` (the bare clone), `main/`, `pr/` (40
  worktrees named `pr<N>.<slug>`), `.worktrees/`, and `agents/`. `git rev-parse
--show-toplevel` from any of these returns that individual worktree, never the container.

A correct anchor already exists but is unused for placement: `getMainWorktreeRoot`
(`src/lib/git.ts:694`) resolves via `git rev-parse --git-common-dir`. Verified behaviour:

```
$ cd /home/chris/workspace/syrf/main && git rev-parse --git-common-dir
/home/chris/workspace/syrf/.bare
```

`getMainWorktreeRoot` takes the dirname of that (basename is `.bare`, not `.git`, so the
non-`.git` branch at `git.ts:710-718` applies), yielding `/home/chris/workspace/syrf` — the
container. For a conventional repository it yields the repository root. It is the stable
anchor in both cases.

**Discovery is not affected.** `listWorktrees` (`src/lib/git.ts:368`) shells `git worktree
list`, which is authoritative and already enumerates every syrf worktree regardless of
location. Only _placement_ of new worktrees is broken.

### 1.4 Settings are neither overridable nor documented

- `schemas/worktreerc.schema.json` has **no `ai` section** — zero properties. No editor
  autocomplete, no `wt config validate` coverage, nothing for `wt config schema` to report.
- `docs/AI-TOOLING.md` (860 lines, the agent-facing guide) contains the word "provider"
  **zero times**. The AI subsystem is entirely undocumented for agent callers.
- `README.md` does not mention `ai.provider`, `GEMINI_API_KEY`, or codex.
- `GEMINI_API_KEY` is the only environment variable consulted anywhere in config or AI code.
  There is no environment override for provider choice.
- `wt config show` reports a single winning source file (`src/cli/wt/config.ts:175-194`), not
  per-key provenance.

The cost of the last point is demonstrable. Global config
(`~/.config/git-worktree-tools/config.json`) sets `worktreeParent: ".worktrees"` and
`worktreePattern: "pr{number}.{slug}"`; the repo `.worktreerc` overrides only the pattern
(`{repo}.pr{number}`). The merge produced
`.worktrees/git-worktree-tools.pr22` — a hybrid path that neither file specifies and no
single file explains.

---

## 2. Goals and non-goals

### Goals

1. A driving agent can supply an exact PR title and body, and know whether they were used.
2. When no caller content is supplied, generation prefers flat-rate subscription CLIs, tries
   the next provider on failure, and never fails silently.
3. Worktree placement is correct and stable for bare-repo containers and nested layouts,
   with no behaviour change for conventional repositories.
4. Every decision above is overridable at every tier and documented for both humans and
   agents, including at runtime.

### Non-goals

- No callback channel from `wt` into a driving Claude Code session. Verified unavailable:
  Claude Code does not implement MCP sampling (only tool calls are supported), and no
  supported mechanism exists for a subprocess to request an LLM turn from its parent session.
  Content flows _into_ the CLI as arguments; it is never requested back out.
- No changes to worktree _discovery_, `wt clean`, or `wt list` — `git worktree list` already
  handles every layout.
- Deferred to separate work: `wt path <N>`, `wt sync`, and migrating `post-merge-cleanup` off
  hand-rolled bash.

---

## 3. Part 1 — Agent-supplied PR content

### 3.1 New flags on `wt new`

| Flag                 | Type    | Purpose                                                   |
| -------------------- | ------- | --------------------------------------------------------- |
| `--title <string>`   | string  | Exact PR title, used verbatim                             |
| `--body <string>`    | string  | Exact PR body, used verbatim                              |
| `--body-file <path>` | path    | Read body from a file (preferred for multi-line markdown) |
| `--force-ai`         | boolean | Run AI generation even when flags supply content          |
| `--skip-ai`          | boolean | Skip AI generation entirely for this invocation           |

`--skip-ai` is deliberately **not** named `--no-ai`: yargs boolean-negation collides with
`.strict()` in this CLI, which is why the existing `--no-hooks`, `--no-wtlink`, and
`--no-plan` flags are rejected as unknown arguments (see §9). New flags avoid the `--no-`
prefix so they work irrespective of whether that bug is fixed.

`--body` and `--body-file` are mutually exclusive; supplying both is an `INVALID_ARGUMENT`
error. A `--body-file` path that cannot be read is an `INVALID_ARGUMENT` error rather than a
silent fallback, so an agent learns its content did not land.

`--body-file` is the recommended form for agents: PR bodies are multi-line markdown
containing backticks, quotes, and `$`, all of which are hazardous through shell quoting.

### 3.2 Precedence

Resolved **independently per field**, so `--title` alone is valid and leaves the body to be
generated:

```
explicit flag  →  AI provider  →  template default
```

When both `--title` and a body flag are supplied, **no LLM call is made** for PR content —
saving latency and quota. `--force-ai` overrides this for callers who want generation
regardless.

### 3.3 Provenance in the JSON envelope

`NewprResultData` (`src/lib/json-output.ts:83`) gains:

```jsonc
{
  "titleSource": "flag" | "ai" | "template",
  "bodySource":  "flag" | "ai" | "template",
  "aiProvider":  "codex" | "claude" | ... | null,   // which provider produced content
  "aiError":     "<message>" | null                 // why generation was skipped or failed
}
```

This closes the silent-failure gap for machine callers: an agent can assert its content was
used, and surface `aiError` when it was not. `aiError` is populated whenever a provider was
attempted and did not produce content — including the previously silent
`success === false` path.

### 3.4 `start-work` skill changes

1. Before invoking `wt`, draft a real PR title and an intent-focused body from conversation
   context: what is being built, why, the planned approach, and scope boundaries. At creation
   time there is no diff — the branch holds a single empty commit — so the body documents
   _intent_, which is precisely what the agent knows and the tool cannot infer.
2. Write the body to a temp file; pass `--title` and `--body-file`.
3. Verify `titleSource`/`bodySource` are `"flag"` in the JSON response; warn if not.
4. After the first real commit is amended and pushed, refresh the PR body via `gh pr edit`
   if the delivered scope diverged from the stated intent.

The existing `refresh-pr` / `ship-pr` metadata audit continues to true the PR up at merge
time. The lifecycle is: **intent at creation → refined after first commit → verified at
ship**.

This flag interface is agent-agnostic — Codex CLI, Gemini CLI, `agy`, or a CI script driving
`wt` all gain the same capability.

---

## 4. Part 2 — Provider selection and the codex subscription

### 4.1 Availability must be trustworthy

`isAvailable()` currently conflates "credential present" with "provider works", which is what
allowed an invalid `GEMINI_API_KEY` to capture selection. Two changes:

1. **Failure advances the chain.** When `ai.provider` is `auto`, a provider that fails to
   produce content causes the manager to try the next entry in the priority list. This
   applies to the `success === false` result path, not only to thrown exceptions. Today only
   an explicitly configured `fallback` provider is consulted.
2. **Failures are always reported.** Every attempt appends to a diagnostics list surfaced as
   `aiError` in JSON and as a `⚠` line in human output. The silent
   `return defaultResult` path at `config.ts:950` is removed.

### 4.2 Priority order

New default, subscription-first:

```
codex  →  claude  →  gemini-api  →  ollama
```

Rationale: `codex` and `claude` are flat-rate against subscriptions already paid for;
`gemini-api` is metered per token; `ollama` is a local last resort. Codex leads to preserve
Anthropic quota for the interactive session.

Exposed as `ai.providerPriority`, an array, overridable at every config tier.

### 4.3 Fixing the codex provider

Replace the bare `codex exec "prompt"` invocation with:

```
codex exec \
  --output-last-message <tmpfile> \
  --skip-git-repo-check \
  -s read-only \
  --color never \
  [-m <model>] \
  <prompt>
```

and read the answer from `<tmpfile>` rather than stdout. `--output-schema <FILE>` constrains
structured cases (title, branch name) to a JSON Schema.

- `-s read-only` and `--skip-git-repo-check` prevent the agentic loop from taking actions or
  stalling on repository checks.
- The temp file is created with a unique name and removed in a `finally` block.

**Latency.** `codex exec` runs an agentic loop, not a single completion, so it is slower than
a REST call — expect roughly 15–45s for a PR description. Mitigations: a default 60s timeout
(`ai.timeout`, per-provider overridable) that advances to the next provider rather than
hanging, and `ai.models.codex` to select a faster model. Under Part 1 this path does not run
at all when an agent supplies content.

The same treatment applies to `ClaudeProvider`, whose default model
(`claude-sonnet-4-20250514`, `cli-provider.ts:54`) is stale and becomes a configurable
`ai.models.claude`.

### 4.4 `wt ai doctor`

A new diagnostic subcommand, `--json` capable, reporting for each provider: installed,
authenticated, reachable (a real probe, not an env-var presence check), configured model, and
whether it is the one `auto` would select right now — with the reason. Running it against the
current machine would have reported the invalid `GEMINI_API_KEY` immediately instead of
leaving a stub PR as the only symptom.

---

## 5. Part 3 — Worktree layout anchoring

### 5.1 Anchor placement to the main worktree

In `generateWorktreePath`, resolve a relative `worktreeParent` against
`getMainWorktreeRoot()` instead of the current worktree root. Absolute `worktreeParent`
values are unaffected.

This is a strict fix: for a conventional repository invoked from its root the two anchors are
identical, so behaviour does not change. It corrects the case of invoking from inside a linked
worktree, and makes bare-repo containers work.

### 5.2 Escape hatch

`worktreeParentAnchor: "main-worktree" | "repo-root"`, defaulting to `"main-worktree"`.
Anyone depending on worktree-relative resolution sets `"repo-root"` and retains today's
behaviour exactly.

### 5.3 Nested patterns

`worktreePattern` already tolerates path separators. The syrf container is then expressed as:

```jsonc
{
  "worktreeParent": "pr",
  "worktreePattern": "pr{number}.{slug}",
}
```

yielding `/home/chris/workspace/syrf/pr/pr2600.<slug>` — matching the 40 existing worktrees
and the `pr<N>.` prefix that `focus-worktree` and `post-merge-cleanup` glob for.

Committing `.worktreerc` inside the repository makes it present in every worktree, so config
resolves identically from `main/` or any `pr/*` and never depends on the non-repository
container directory.

### 5.4 Layout detection in `wt init`

When `git rev-parse --git-common-dir` has a basename other than `.git`, `wt init` recognises a
bare-container layout, reports it, and offers to scaffold the corresponding `worktreeParent` /
`worktreePattern` pair rather than the sibling-directory default.

---

## 6. Part 4 — Override surface and documentation

### 6.1 One precedence chain

Applied uniformly to every setting and documented once:

```
CLI flag  >  env var  >  .worktreerc.local  >  .worktreerc  >  global config.json  >  built-in default
```

The three right-hand tiers exist today (`src/lib/config.ts:479-556`); this adds the CLI-flag
and environment layers explicitly.

### 6.2 Knobs

| Decision               | Config key                                  | CLI flag                           | Env var                              |
| ---------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------ |
| Provider order         | `ai.providerPriority`                       | `--ai-provider <name>`             | `GWT_AI_PROVIDER`, `GWT_AI_PRIORITY` |
| Disable AI             | `ai.provider: "none"`                       | `--skip-ai`                        | `GWT_NO_AI`                          |
| Force AI despite flags | —                                           | `--force-ai`                       | —                                    |
| Per-provider model     | `ai.models.<provider>`                      | —                                  | —                                    |
| Timeout                | `ai.timeout`, `ai.providers.<name>.timeout` | `--ai-timeout <ms>`                | `GWT_AI_TIMEOUT`                     |
| PR content             | —                                           | `--title`, `--body`, `--body-file` | —                                    |
| Placement anchor       | `worktreeParentAnchor`                      | —                                  | —                                    |
| Worktree location      | `worktreeParent`, `worktreePattern`         | —                                  | —                                    |

`GWT_AI_PRIORITY` accepts a comma-separated list (`codex,claude,ollama`).

Environment variables are parsed and validated in one place, with an invalid value producing
an `INVALID_CONFIG` error naming the variable — never a silent fallback to default.

### 6.3 Four documentation surfaces

1. **`schemas/worktreerc.schema.json`** — populate the missing `ai` section in full: every
   key with `description`, `enum`, and `default`, plus the new `providerPriority`, `models`,
   `timeout`, and `worktreeParentAnchor`. Highest leverage, because it simultaneously drives
   editor autocomplete, `wt config validate`, and `wt config schema` (readable by agents at
   runtime).
2. **`README.md`** — human-facing table of every AI and layout key with defaults, plus a
   "which model will `auto` actually pick, and why" explainer, and a worked bare-repo layout
   example.
3. **`docs/AI-TOOLING.md`** — agent-facing section covering the new flags, the per-field
   precedence rules, the `titleSource`/`bodySource`/`aiError` fields, and how to force or skip
   a provider. Also documents the recommended `--body-file` pattern.
4. **Runtime introspection** — documentation drifts; runtime answers do not:
   - `wt config show --json` gains **per-key provenance**: each value reports the tier, file
     path, env var, or flag that set it. This is what makes a hybrid result like
     `.worktrees/git-worktree-tools.pr22` self-explaining.
   - `wt ai doctor --json` (§4.4) reports live provider status and the selection decision.

---

## 7. Testing strategy

Per the repository's testing guidelines, interactive and external-dependency code is mocked
rather than excluded from coverage.

**Unit**

- Content precedence: each combination of `--title` / `--body` / `--body-file` / `--force-ai`
  / `--skip-ai` against AI-enabled and AI-disabled config, asserting resolved values and
  `titleSource` / `bodySource`.
- `--body` plus `--body-file` yields `INVALID_ARGUMENT`; unreadable `--body-file` yields
  `INVALID_ARGUMENT`.
- `generateWorktreePath` anchoring: conventional repo from root (unchanged), conventional repo
  from a linked worktree (corrected), bare container from several worktrees (stable), absolute
  `worktreeParent` (unchanged), and `worktreeParentAnchor: "repo-root"` (legacy behaviour).
- Provider chain: first provider returning `success: false` advances to the next; all
  providers failing populates `aiError` and returns the template; `aiError` is never null when
  a provider was attempted and produced nothing.
- Codex argument construction, temp-file read, and temp-file cleanup on both success and
  throw, with `spawnSync` mocked.
- Config resolution: env var beats local file; CLI flag beats env var; invalid env value
  raises `INVALID_CONFIG`; provenance reports the correct origin per key.

**Integration**

- A bare-repository fixture (`.bare/` plus two linked worktrees) exercising placement from
  each worktree.

**E2E** (existing PTY harness with gh mocked)

- `wt new --title ... --body-file ...` produces a PR whose title and body match the inputs
  byte-for-byte, with no provider invoked.

**Schema**

- Assert every documented `ai.*` and layout key is present in
  `schemas/worktreerc.schema.json` with a description, so schema and implementation cannot
  drift.

---

## 8. Compatibility and rollout

- All new flags are additive; omitting them preserves current behaviour.
- The placement anchor change is behaviour-preserving for conventional repositories invoked
  from the repository root — the overwhelmingly common case — and is reversible via
  `worktreeParentAnchor: "repo-root"`.
- The priority-order change alters which model runs for users on `auto` with multiple
  providers installed. It is a default, fully overridable by `ai.providerPriority`, and the
  release note will state the new order explicitly.
- Removing the silent fallback surfaces failures that were previously invisible. This will
  make existing broken configurations (such as the invalid `GEMINI_API_KEY` on this machine)
  newly visible as warnings. That is the intent; it does not block PR creation, which
  continues to fall back to the template.

---

## 9. Out of scope

Tracked separately, not part of this spec:

- `wt path <N>` — resolve a PR number to a worktree path, replacing `find` globs in
  `focus-worktree` and `post-merge-cleanup`.
- `wt sync` — merge the base branch into every active worktree with stash handling,
  replacing the hand-rolled bash in `post-merge-cleanup`.
- Migrating `post-merge-cleanup` to `wt clean --json`.
- Packaging the worktree skills as a plugin versioned alongside the CLI.
- An `AnthropicAPIProvider` (direct REST, `ANTHROPIC_API_KEY`) as a peer to
  `GeminiAPIProvider`.
- **Bug found while validating this design:** `--no-hooks`, `--no-wtlink`, and `--no-plan` are
  rejected with `Unknown argument: hooks` (etc.) because yargs boolean-negation collides with
  `.strict()`. Reproduced against the installed CLI; these flags are documented in `--help`
  but unusable.
- Removing the unused `inquirer` dependency (declared but never imported; prompts are
  hand-rolled readline).
