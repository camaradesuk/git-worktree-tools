# git-worktree-tools Implementation Plan

## Implementation Status

> **Last Updated**: 2025-12-29

| Phase          | Status      | Notes                                                  |
| -------------- | ----------- | ------------------------------------------------------ |
| Setup          | ✅ Complete | TypeScript project configured, CI/CD workflows created |
| Core Libraries | ✅ Complete | All 6 libraries implemented with tests                 |
| CLI Tools      | ✅ Complete | newpr, cleanpr, lswt, wtlink all ported                |
| Testing        | ✅ Complete | 231 tests passing, cross-platform CI green             |
| npm Publishing | ⏳ Pending  | Requires NPM_TOKEN secret, then create v0.1.0 tag      |

## Overview

This document provides the comprehensive implementation plan for `@camaradesuk/git-worktree-tools` - a cross-platform Node.js/TypeScript CLI package for git worktree workflow management.

## Goals

- **Cross-platform**: Windows native, macOS, Linux (not dependent on bash/WSL)
- **Single install**: `npm install -g @camaradesuk/git-worktree-tools`
- **Generic**: Works with any git repository (not tied to specific repos)
- **Configurable**: Per-repo settings via `.worktreerc`
- **Bundled**: All tools in one package (newpr, cleanpr, lswt, wtlink)

---

## Architecture

### Project Structure

```
git-worktree-tools/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .github/
│   └── workflows/
│       ├── ci.yml              # Test on all platforms
│       └── release.yml         # npm publish on release
├── src/
│   ├── cli/
│   │   ├── newpr.ts            # Create PR + worktree
│   │   ├── cleanpr.ts          # Clean up worktrees
│   │   ├── lswt.ts             # List worktrees
│   │   └── wtlink.ts           # Sync gitignored files (yargs CLI)
│   ├── lib/
│   │   ├── git.ts              # Git operations wrapper
│   │   ├── github.ts           # GitHub CLI (gh) wrapper
│   │   ├── prompts.ts          # Interactive prompts (cross-platform)
│   │   ├── config.ts           # .worktreerc loading
│   │   ├── colors.ts           # Terminal colors (ANSI)
│   │   ├── errors.ts           # Custom error classes
│   │   ├── constants.ts        # Centralized defaults
│   │   ├── state-detection.ts  # Git state analysis (10 scenarios)
│   │   ├── wtlink/             # wtlink submodules
│   │   │   ├── link-configs.ts      # Hard link creation
│   │   │   ├── manage-manifest.ts   # Interactive TUI
│   │   │   ├── validate-manifest.ts # Manifest validation
│   │   │   └── main-menu.ts         # Interactive menu
│   │   └── *.test.ts           # Tests colocated with source
│   ├── integration/            # Integration tests
│   ├── e2e/                    # End-to-end tests
│   └── index.ts                # Programmatic API exports
└── docs/
    └── PLAN.md                 # This file
```

### Dependencies

**Runtime dependencies**:

- `yargs` ^17.7.2 - CLI argument parsing (wtlink subcommands)
- `inquirer` ^9.3.7 - Interactive prompts
- `@preact/signals-core` ^1.8.0 - Reactive state for wtlink TUI

**Built-in APIs used**:

- `child_process.execSync` / `spawn` - Run git/gh commands
- `fs` - File operations
- `path` - Cross-platform paths
- `os` - Platform detection
- `process.stdout.write` - ANSI colors

**Dev dependencies**:

- `typescript` ^5.3.0
- `vitest` ^2.1.9
- `@types/node` ^20.0.0

---

## Core Libraries

### lib/git.ts

Git operations wrapper providing cross-platform git command execution.

```typescript
// Key functions
export function getRepoRoot(cwd?: string): string;
export function getRepoName(repoRoot: string): string;
export function getCurrentBranch(cwd?: string): string;
export function isDetachedHead(cwd?: string): boolean;
export function getRemoteUrl(remote?: string, cwd?: string): string;
export function fetch(remote?: string, cwd?: string): void;
export function getCommitRelationship(baseBranch?: string, cwd?: string): CommitRelationship;
export function getWorkingTreeStatus(cwd?: string): WorkingTreeStatus;
export function listWorktrees(cwd?: string): Worktree[];
export function addWorktree(path: string, branch: string, cwd?: string): void;
export function removeWorktree(path: string, force?: boolean): void;
export function stash(options?: StashOptions): string | null;
export function stashApply(stashRef?: string, cwd?: string): void;
export function stashDrop(stashRef?: string, cwd?: string): void;
export function createBranch(name: string, startPoint?: string, cwd?: string): void;
export function checkout(ref: string, cwd?: string): void;
export function commit(message: string, options?: CommitOptions): string;
export function push(remote?: string, branch?: string, options?: PushOptions): void;
export function getCommitLog(range: string, format?: string, cwd?: string): string[];

// Types
export type CommitRelationship = 'same' | 'ahead' | 'behind' | 'ancestor' | 'divergent';
export type WorkingTreeStatus = 'clean' | 'staged_only' | 'unstaged_only' | 'both';

export interface Worktree {
  path: string;
  branch: string | null;
  commit: string;
  isMain: boolean;
  isBare: boolean;
}

export interface StashOptions {
  keepIndex?: boolean;
  message?: string;
  includeUntracked?: boolean;
}

export interface CommitOptions {
  all?: boolean;
  allowEmpty?: boolean;
}

export interface PushOptions {
  setUpstream?: boolean;
  force?: boolean;
}
```

### lib/github.ts

GitHub CLI (gh) wrapper for PR and repo operations.

```typescript
// Key functions
export function isGhInstalled(): boolean;
export function isAuthenticated(): boolean;
export function createPr(options: CreatePrOptions): PrInfo;
export function getPrStatus(prNumber: number, repo?: string): PrStatus;
export function listPrs(options?: ListPrsOptions): PrInfo[];
export function getRepoInfo(): RepoInfo;

// Types
export interface CreatePrOptions {
  title: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
  repo?: string;
}

export interface PrInfo {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
  headBranch: string;
  baseBranch: string;
}

export interface RepoInfo {
  owner: string;
  name: string;
  defaultBranch: string;
  url: string;
}
```

### lib/prompts.ts

Cross-platform interactive prompts using Node.js readline.

```typescript
// Key functions
export function promptChoice(prompt: string, options: PromptOption[]): Promise<number>;
export function promptConfirm(prompt: string, defaultValue?: boolean): Promise<boolean>;
export function promptInput(prompt: string, defaultValue?: string): Promise<string>;

// Types
export interface PromptOption {
  label: string;
  description?: string;
}
```

### lib/config.ts

Configuration loading from `.worktreerc` files.

```typescript
// Key functions
export function loadConfig(repoRoot: string): WorktreeConfig;
export function getDefaultConfig(): WorktreeConfig;

// Types
export interface WorktreeConfig {
  // Sibling repos to also create worktrees for (e.g., ["cluster-gitops"])
  sharedRepos?: string[];

  // Base branch for new PRs (default: "main")
  baseBranch?: string;

  // Create PRs as draft by default
  draftPr?: boolean;

  // Worktree directory pattern (default: "{repo}.pr{number}")
  worktreePattern?: string;

  // Parent directory for worktrees (default: same parent as main repo)
  worktreeParent?: string;

  // Branch name prefix for auto-generated branches (default: "claude")
  branchPrefix?: string;
}
```

### lib/colors.ts

ANSI color helpers for terminal output.

```typescript
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

export function red(text: string): string;
export function green(text: string): string;
export function yellow(text: string): string;
export function blue(text: string): string;
export function cyan(text: string): string;
export function bold(text: string): string;
export function dim(text: string): string;
export function success(text: string): string; // ✓ prefix + green
export function warning(text: string): string; // ⚠ prefix + yellow
export function error(text: string): string; // ✗ prefix + red
export function info(text: string): string; // ℹ prefix + blue
```

### lib/state-detection.ts

Git state analysis for intelligent scenario handling.

```typescript
// Key functions
export function analyzeGitState(cwd?: string): GitState;
export function detectScenario(state: GitState): Scenario;

// Types
export interface GitState {
  worktreeType: 'main_worktree' | 'pr_worktree' | 'other';
  branchType: 'main' | 'other' | 'detached';
  currentBranch: string | null;
  commitRelationship: CommitRelationship;
  workingTreeStatus: WorkingTreeStatus;
  localCommits: string[]; // Commit hashes ahead of origin/main
  stagedFiles: string[];
  unstagedFiles: string[];
}

export type Scenario =
  | 'main_clean_same' // Scenario 1
  | 'main_staged_same' // Scenario 2a
  | 'main_unstaged_same' // Scenario 2b
  | 'main_both_same' // Scenario 2c
  | 'main_clean_ahead' // Scenario 3
  | 'main_changes_ahead' // Scenario 4
  | 'branch_same_as_main' // Scenario 5
  | 'branch_ancestor' // Scenario 6
  | 'branch_divergent' // Scenario 7
  | 'branch_with_changes' // Scenario 8
  | 'detached_head' // Scenario 9
  | 'pr_worktree'; // Scenario 10
```

---

## Git State Detection Scenarios

The `newpr` tool handles 10 git state scenarios with intelligent user prompts:

### Scenario 1: On main, same commit as origin/main, clean working tree

**Detection**:

```
current_branch == "main" &&
HEAD == origin/main &&
working tree is clean
```

**User prompt**:

```
⚠ No changes detected from main branch.

You are on 'main' with no local commits or uncommitted changes.
A PR requires at least one commit difference from the base branch.

How would you like to proceed?
  1) Continue with empty initial commit
  2) Cancel - I'll make some changes first
```

---

### Scenario 2a: On main, same commit as origin/main, staged changes only

**User prompt**:

```
ℹ You have staged changes ready to commit:

   M src/services/web/package.json
   A src/new-file.ts

How would you like to proceed?
  1) Commit staged changes to the new PR branch
  2) Leave changes here and continue with empty initial commit
  3) Cancel
```

---

### Scenario 2b: On main, same commit as origin/main, unstaged changes only

**User prompt**:

```
ℹ You have unstaged changes:

 M src/services/web/package.json
?? src/new-file.ts

How would you like to proceed?
  1) Stage all and commit to the new PR branch
  2) Leave changes here and continue with empty initial commit
  3) Stash changes (will restore after)
  4) Cancel
```

---

### Scenario 2c: On main, same commit as origin/main, both staged and unstaged

**User prompt**:

```
ℹ You have both staged and unstaged changes:

Staged:
   M src/services/web/package.json

Unstaged:
 M src/app/component.ts
?? src/new-file.ts

How would you like to proceed?
  1) Commit staged to PR branch, move unstaged to new worktree
  2) Stage all and commit everything to the new PR branch
  3) Leave all changes here and continue with empty initial commit
  4) Stash all changes (will restore after)
  5) Cancel
```

**Implementation for option 1 (move unstaged to worktree)**:

1. Stash unstaged changes: `git stash push --keep-index -m "newpr: unstaged changes"`
2. Commit staged changes to new branch
3. Create PR and worktree
4. In new worktree: `git stash apply` to restore unstaged changes there
5. In main worktree: `git stash drop` to clean up

---

### Scenario 3: On main, ahead of origin/main (local commits), clean

**User prompt**:

```
ℹ You have local commits on 'main' not yet pushed:

  abc1234 feat: add user authentication
  def5678 fix: resolve login issue

These commits will NOT be included in the new PR branch by default.

How would you like to proceed?
  1) Use these commits for the PR (create branch from HEAD)
  2) Push commits to origin/main first, then create PR branch
  3) Start fresh from origin/main (ignore local commits)
  4) Cancel
```

---

### Scenario 4: On main, ahead of origin/main, has uncommitted changes

**User prompt**:

```
ℹ You have local commits AND uncommitted changes:

Local commits (not pushed):
  abc1234 feat: add user authentication

Uncommitted changes:
 M src/services/web/package.json

How would you like to proceed?
  1) Include commits + commit uncommitted changes to PR branch
  2) Include commits only, stash uncommitted changes
  3) Start fresh from origin/main (ignore all local work)
  4) Cancel
```

---

### Scenario 5: On different branch, same commit as main, clean

**User prompt**:

```
⚠ Branch 'feat/old-feature' is at the same commit as main.

No divergent commits detected. A PR requires at least one commit difference.

How would you like to proceed?
  1) Continue with empty initial commit (new branch from main)
  2) Cancel
```

---

### Scenario 6: On different branch, commits already in main's history (merged/rebased)

**User prompt**:

```
⚠ Branch 'feat/old-feature' appears to be already merged into main.

Current commit (abc1234) is an ancestor of origin/main.
Creating a PR would result in no changes.

How would you like to proceed?
  1) Continue with empty initial commit (new branch from main)
  2) Cancel - I'll check the branch status first
```

---

### Scenario 7: On different branch, divergent commits (not in main), clean

**User prompt**:

```
ℹ You are on branch 'feat/existing-work' with commits not in main:

  abc1234 feat: implement feature X
  def5678 fix: edge case handling

How would you like to proceed?
  1) Create PR for THIS branch (feat/existing-work → main)
  2) Create NEW branch from main (ignore current branch's commits)
  3) Cancel
```

---

### Scenario 8: On different branch, has uncommitted changes

Combines Scenario 7 logic with Scenario 2 change handling. Options depend on whether branch has divergent commits.

---

### Scenario 9: Detached HEAD state

**User prompt**:

```
⚠ You are in detached HEAD state at commit abc1234.

How would you like to proceed?
  1) Create branch from this commit
  2) Create branch from origin/main
  3) Cancel
```

---

### Scenario 10: Running from a PR worktree

**Detection**: Current directory matches worktree naming pattern (e.g., `*.pr[0-9]*`)

**User prompt**:

```
⚠ You are in a PR worktree (syrf.pr1234), not the main worktree.

Creating a new PR is best done from the main worktree.

How would you like to proceed?
  1) Continue anyway (create PR from this worktree's state)
  2) Cancel - I'll switch to the main worktree
```

---

## CLI Tools

### newpr

Create a new PR with associated worktree.

**Usage**:

```bash
newpr "Description of the feature"
newpr --branch my-feature "Feature description"
newpr --pr 123  # Work on existing PR
```

**Arguments**:

- `description` - PR title / feature description
- `--branch`, `-b` - Custom branch name (otherwise auto-generated)
- `--pr`, `-p` - Existing PR number to work on
- `--draft`, `-d` - Create as draft PR
- `--no-worktree` - Skip worktree creation

**Workflow**:

1. Analyze git state (detect scenario)
2. Present appropriate options based on scenario
3. Handle user choice (commit, stash, etc.)
4. Create branch from appropriate base
5. Create PR via `gh pr create`
6. Create worktree for PR
7. Handle shared repos (if configured)
8. Sync gitignored files (if configured)

---

### cleanpr

Clean up worktrees for merged/closed PRs.

**Usage**:

```bash
cleanpr           # Interactive cleanup
cleanpr --all     # Clean all merged/closed
cleanpr --force   # Force remove even if not merged
```

**Workflow**:

1. List all PR worktrees
2. Check PR status for each via `gh pr view`
3. Show list of cleanable worktrees
4. Prompt for confirmation
5. Remove worktrees and branches

---

### lswt

List worktrees with status information.

**Usage**:

```bash
lswt              # List all worktrees
lswt --status     # Include PR status (requires gh)
lswt --json       # Output as JSON for scripting
lswt --verbose    # Show more details (commit hashes, full paths)
```

**Output**:

```
WORKTREE                    BRANCH              PR     STATUS
/home/user/repo             main                -      -
/home/user/repo.pr123       feat/new-feature    #123   open
/home/user/repo.pr124       fix/bug             #124   merged
```

---

### wtlink

Interactive CLI for managing configuration file links between git worktrees. Uses hard links and a `.wtlinkrc` manifest to share config files while keeping build artifacts separate.

**Usage**:

```bash
wtlink                    # Interactive main menu
wtlink manage             # Interactive file browser to select files to share
wtlink link               # Create hard links based on manifest
wtlink link ../repo.pr42  # Link to specific worktree
wtlink validate           # Verify manifest integrity
```

**Workflow**:

1. **Discover** — Scan for git-ignored files in repository
2. **Decide** — Interactive UI to categorize each file (link, track, or skip)
3. **Link** — Create hard links from main worktree to feature worktrees
4. **Validate** — Ensure manifest entries exist and remain git-ignored

**Manifest format (`.wtlinkrc`)**:

```text
.vscode/settings.json
.editorconfig
.env.local
# .vscode/launch.json
```

- Active entries (no `#`) are hard-linked between worktrees
- Commented entries (`#`) are tracked but not currently linked

**Best candidates for linking**:

- `.vscode/settings.json`, `.editorconfig` — Editor config
- `.env.local`, `.env.development` — Local environment variables

**Not suitable for linking**:

- `node_modules/` — Use pnpm for shared dependencies instead
- `dist/`, `build/` — Build artifacts should be separate per worktree

---

## Configuration (.worktreerc)

Per-repository configuration file:

```json
{
  "sharedRepos": ["cluster-gitops", "camarades-infrastructure"],
  "baseBranch": "main",
  "draftPr": true,
  "worktreePattern": "{repo}.pr{number}",
  "worktreeParent": "..",
  "syncPatterns": ["node_modules", ".env.local", "coverage"]
}
```

---

## Testing Plan

### Unit Tests (colocated with source in `src/lib/`)

| File                               | Tests | Description                           |
| ---------------------------------- | ----- | ------------------------------------- |
| `colors.test.ts`                   | 12    | ANSI color formatting                 |
| `config.test.ts`                   | 11    | Config loading and defaults           |
| `state-detection.test.ts`          | 24    | Git state analysis (10 scenarios)     |
| `git.test.ts`                      | 59    | Git operations (mocked execSync)      |
| `github.test.ts`                   | 24    | GitHub CLI operations (mocked)        |
| `prompts.test.ts`                  | 27    | Interactive prompts (mocked readline) |
| `errors.test.ts`                   | 14    | Custom error classes                  |
| `wtlink/validate-manifest.test.ts` | 8     | Manifest validation                   |
| `wtlink/link-configs.test.ts`      | 10    | Hard link creation                    |

### Integration Tests (`src/integration/`)

| File                      | Tests | Description                      |
| ------------------------- | ----- | -------------------------------- |
| `git.integration.test.ts` | 26    | Real git operations in temp repo |

### End-to-End Tests (`src/e2e/`)

| File              | Tests | Description                                  |
| ----------------- | ----- | -------------------------------------------- |
| `cli.e2e.test.ts` | 16    | Full CLI command testing with real git repos |

**Integration test coverage:**

- Repository operations (getRepoRoot, getRepoName)
- Branch operations (create, delete, checkout)
- Working tree status detection
- Staged/unstaged file detection
- Worktree operations (add, remove, list)
- Stash operations (push, pop, keep-index)
- Commit operations with proper shell escaping

### CI/CD (.github/workflows/ci.yml)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test
      - run: npm run build
```

---

## Implementation Order

1. **Setup** (1 hour)
   - package.json, tsconfig.json, .gitignore
   - CI/CD workflows
   - README.md

2. **Core Libraries** (4 hours)
   - lib/colors.ts (30 min)
   - lib/config.ts (30 min)
   - lib/prompts.ts (1 hour)
   - lib/git.ts (1 hour)
   - lib/github.ts (30 min)
   - lib/state-detection.ts (1 hour)

3. **CLI Tools** (4 hours)
   - cli/newpr.ts (2 hours)
   - cli/cleanpr.ts (1 hour)
   - cli/lswt.ts (30 min)
   - cli/wtlink.ts (30 min)

4. **Testing** (2 hours)
   - Unit tests for all lib modules
   - Integration tests for CLI

5. **Polish** (1 hour)
   - README.md with examples
   - npm publish workflow
   - Final testing

**Total estimated effort: ~12 hours**

---

## Migration from syrf/scripts/

After publishing:

1. Install globally: `npm install -g @camaradesuk/git-worktree-tools`
2. Add `.worktreerc` to repositories
3. Remove old scripts from PATH
4. Archive syrf/scripts/ directory

The commands remain the same: `newpr`, `cleanpr`, `lswt`, `wtlink`

---

## Edge Cases

1. **Network unavailable**: `git fetch` fails - warn and use cached refs
2. **origin/main doesn't exist**: Fall back to configured baseBranch
3. **User hits Ctrl+C during prompt**: Ensure cleanup runs (signal handlers)
4. **Stash conflicts on restore**: Warn user to resolve manually
5. **Branch name collision**: Append suffix or prompt for different name
6. **Windows path limitations**: Use short paths if needed
7. **gh not installed**: Fall back to git-only operations where possible
