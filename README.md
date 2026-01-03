# git-worktree-tools

[![npm version](https://img.shields.io/npm/v/@camaradesuk/git-worktree-tools)](https://www.npmjs.com/package/@camaradesuk/git-worktree-tools)
[![CI](https://github.com/camaradesuk/git-worktree-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/camaradesuk/git-worktree-tools/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/camaradesuk/git-worktree-tools/graph/badge.svg?token=gJG6TuHvPK)](https://codecov.io/gh/camaradesuk/git-worktree-tools)

Cross-platform CLI tools for git worktree workflow management. Create PRs with dedicated worktrees, sync gitignored files, and manage your development workflow.

## Features

- **Cross-platform**: Works natively on Windows, macOS, and Linux (no bash/WSL required)
- **Smart State Detection**: Intelligently handles 10+ git scenarios (uncommitted changes, local commits, existing branches, etc.)
- **PR + Worktree Workflow**: Create PRs and dedicated worktrees in one command
- **Shared Repos**: Automatically create worktrees in related repositories
- **Config Syncing**: Share gitignored config files (.env, .vscode, etc.) between worktrees via hard links
- **Configurable**: Per-repo settings via `.worktreerc`

## Installation

```bash
npm install -g @camaradesuk/git-worktree-tools
```

**Prerequisites**:

- Node.js 18+
- Git
- GitHub CLI (`gh`) for PR operations

## Quick Start

```bash
# Create a new PR with worktree
newpr "Add user authentication feature"

# List all worktrees
lswt

# Clean up merged/closed PR worktrees
cleanpr

# Manage shared config files between worktrees
wtlink

# Query git state (for AI agents)
wtstate --json

# Configure settings with interactive wizard
wtconfig init
```

## Commands

### newpr

Create a new PR with an associated worktree.

```bash
newpr "Description of the feature"
newpr --branch my-feature "Feature description"
newpr --pr 123  # Work on existing PR
newpr --draft "WIP feature"
```

**Smart State Handling**: The tool detects your current git state and offers appropriate options:

- Uncommitted changes? Choose to commit, stash, or leave them
- Local commits on main? Include them or start fresh
- On a feature branch? Create PR for it or start new
- Detached HEAD? Create branch from current commit or main

### cleanpr

Clean up worktrees for merged or closed PRs.

```bash
cleanpr           # Interactive cleanup
cleanpr --all     # Clean all merged/closed automatically
cleanpr --force   # Force remove even if not merged
```

### lswt

List and manage git worktrees with an interactive interface.

```bash
lswt                  # Interactive mode (default in terminal)
lswt --no-interactive # List-only mode
lswt --status         # Include PR status (requires gh cli)
lswt --json           # Output as JSON for scripting
lswt --verbose        # Show more details (commit hashes, full paths)
lswt | cat            # Automatically uses list mode when piped
```

**Interactive mode** (enabled by default when running in a terminal):

When running in a TTY terminal, `lswt` enters interactive mode where you can select a worktree and perform actions:

| Shortcut | Action                                     |
| -------- | ------------------------------------------ |
| `e`      | Open in editor (VSCode or Cursor)          |
| `t`      | Open terminal at worktree path             |
| `p`      | Open PR in browser / Create PR from branch |
| `d`      | Show worktree details                      |
| `c`      | Copy path to clipboard                     |
| `l`      | Link config files (via wtlink)             |
| `r`      | Remove worktree (not available for main)   |
| `q`      | Quit                                       |

Use `--no-interactive` to disable interactive mode, or pipe output to automatically switch to list mode.

### wtlink

Interactive CLI for managing configuration file links between git worktrees. Share config files while keeping build artifacts separate using hard links and a manifest file.

```bash
wtlink                    # Interactive main menu
wtlink manage             # Interactive file browser to select files to share
wtlink link               # Create hard links based on manifest
wtlink link ../my-app.pr42  # Link to specific worktree
wtlink validate           # Verify manifest integrity
```

**Command options:**

```bash
# manage - Discover and manage the manifest
wtlink manage                   # Interactive mode
wtlink manage --non-interactive # Auto-add new files as commented
wtlink manage --clean           # Remove stale entries automatically
wtlink manage --dry-run         # Preview changes without writing
wtlink manage --backup          # Create .wtlinkrc.bak before updating

# link - Create links between worktrees
wtlink link [source] [dest]     # Link from source to destination
wtlink link --dry-run           # Preview what would be linked
wtlink link --type symbolic     # Use symlinks instead of hard links
wtlink link --yes               # Skip confirmation prompts

# validate - Check manifest integrity
wtlink validate                 # Validate against current worktree
wtlink validate ../other-wt     # Validate against specific source
```

**How it works:**

1. **Discover** — Scans for git-ignored files in your repository
2. **Decide** — Interactive UI to categorize each file (link, track, or skip)
3. **Link** — Creates hard links from main worktree to feature worktrees
4. **Validate** — Ensures manifest entries exist and remain git-ignored

**Interactive UI navigation:**

| Key | Action                                           |
| --- | ------------------------------------------------ |
| ↑/↓ | Navigate file list                               |
| ←/→ | Navigate into/out of folders (hierarchical view) |
| A   | Mark as "Will Link" (added to manifest)          |
| C   | Mark as "Track" (commented in manifest)          |
| S   | Mark as "Skip" (not in manifest)                 |
| 0   | Toggle showing undecided items                   |
| 1   | Toggle showing "Will Link" items                 |
| 2   | Toggle showing "Track" items                     |
| 3   | Toggle showing "Skip" items                      |
| V   | Toggle hierarchical/flat view                    |
| ?   | Show help                                        |
| Q   | Save and quit                                    |
| X   | Cancel without saving                            |

**Folder operations:** Actions on folders apply to all files inside. The UI shows a breakdown of child states for each folder.

**Safety confirmations:** Before linking, the tool shows source and destination worktrees with their branch names and warns about potentially dangerous operations:

- **Yellow warning** — Source is not on a base branch (main/master/develop). This is unusual since config files should typically flow from main to feature branches.
- **Red warning** — Destination is a base branch. This would overwrite your main worktree's config files, which is usually not intended.

The tool recognizes `main`, `master`, and `develop` as base branches. Use `--yes` to skip these confirmations if you're sure about your operation.

**Conflict detection:** When linking, if a file already exists at the destination with different content, you'll be prompted to:

- **Replace** — Delete destination and create link
- **Ignore** — Keep destination file as-is
- **Remove** — Remove entry from manifest

**Manifest format (`.wtlinkrc`):**

The manifest lives in your repository root and tracks which files to share:

```text
.vscode/settings.json
.editorconfig
.env.local
# .vscode/launch.json
```

- Active entries (no `#`) are hard-linked between worktrees
- Commented entries (`#`) are tracked but not currently linked
- Files marked "Skip" are not added to the manifest at all

**Best practices:**

✅ **Good candidates for linking:**

- `.vscode/settings.json`, `.editorconfig` — Editor config
- `.env.local`, `.env.development` — Local environment variables
- `certificates/`, `credentials/` — Local dev certificates

❌ **Not suitable for linking:**

- `node_modules/` — Use [pnpm](https://pnpm.io) for shared dependencies instead
- `dist/`, `build/` — Build artifacts should be separate per worktree
- `.git/` — Never link git internals

### wtstate

Query the current git state for AI agents and automation. Returns structured information about the repository state, available actions, and recommended next steps.

```bash
wtstate              # Human-readable output
wtstate --json       # Machine-readable JSON output
wtstate --verbose    # Include file lists and commit details
wtstate --base dev   # Specify base branch (default: main)
```

**JSON output includes:**

- `scenario` — Current git state scenario (e.g., `main_staged_same`, `branch_with_changes`)
- `scenarioDescription` — Human-readable description
- `currentBranch` — Current branch name (null if detached HEAD)
- `baseBranch` — Base branch for comparison
- `worktreeType` — Type: `main_worktree`, `pr_worktree`, or `other`
- `hasChanges`, `hasStagedChanges`, `hasUnstagedChanges` — Change flags
- `localCommits` — List of local commits not in origin
- `availableActions` — Actions available for this scenario
- `recommendedAction` — Suggested action to take

### wtconfig

Configuration management with an interactive setup wizard.

```bash
wtconfig init           # Run interactive setup wizard
wtconfig show           # Show current configuration
wtconfig set <key> <val> # Set a configuration value
wtconfig get <key>      # Get a configuration value
wtconfig edit           # Open config in default editor
wtconfig validate       # Validate configuration
```

**Setup wizard detects:**

- Operating system and installed tools
- Git configuration (version, user, email)
- GitHub CLI authentication
- Available AI tools (Claude Code, Gemini CLI, Ollama)
- Package manager (npm, pnpm, yarn, bun)
- IDE availability (VS Code, Cursor)

**Configuration locations:**

- **Global:** `~/.worktreerc` (applies to all repos)
- **Repository:** `.worktreerc` or `.worktreerc.json` (repo-specific)

Repository config overrides global settings.

**Example AI workflow:**

```bash
# 1. Query state
STATE=$(wtstate --json)

# 2. Extract recommended action
ACTION=$(echo $STATE | jq -r '.data.recommendedAction')

# 3. Execute with chosen action
newpr "Add feature" --non-interactive --action=$ACTION --json
```

## AI Tool Integration

All commands support `--json` for machine-readable output, enabling integration with AI CLI tools like Claude Code, Gemini CLI, and Codex.

> **Comprehensive Guide:** See [docs/AI-TOOLING.md](docs/AI-TOOLING.md) for detailed documentation including programmatic API, error codes, lifecycle hooks, and integration examples.

### Quick Start for AI Agents

The recommended workflow is a three-step "look before you leap" pattern:

```bash
# 1. Query current git state
STATE=$(wtstate --json)

# 2. Extract recommended action
ACTION=$(echo $STATE | jq -r '.data.recommendedAction')

# 3. Execute with the chosen action
newpr "Add feature X" --non-interactive --action=$ACTION --json
```

### Non-Interactive Mode

```bash
# Create PR without prompts
newpr "Feature X" --non-interactive --json
newpr "Fix bug" --non-interactive --action=commit_staged --json

# Clean PRs with dry-run preview
cleanpr --all --dry-run --json
cleanpr --all --json

# Link configs without prompts
wtlink link --yes --json
```

### JSON Output Schema

All commands return consistent JSON:

```typescript
interface CommandResult<T> {
  success: boolean; // Whether the command succeeded
  command: string; // Command name (e.g., "newpr", "cleanpr")
  timestamp: string; // ISO 8601 timestamp
  data?: T; // Command-specific data (on success)
  error?: {
    // Error details (on failure)
    code: string; // Machine-readable error code
    message: string; // Human-readable message
  };
  warnings?: string[]; // Non-fatal warnings
}
```

### Structured Error Codes

Error codes enable programmatic error handling:

| Code                   | Description                  |
| ---------------------- | ---------------------------- |
| `NOT_GIT_REPO`         | Not inside a git repository  |
| `GH_NOT_AUTHENTICATED` | GitHub CLI not authenticated |
| `INVALID_ACTION`       | Invalid action for scenario  |
| `HOOK_FAILED`          | Lifecycle hook failed        |
| `USER_CANCELLED`       | Operation cancelled          |
| `PR_CREATE_FAILED`     | Failed to create PR          |

See [docs/AI-TOOLING.md](docs/AI-TOOLING.md#structured-error-codes) for the complete list.

### Available Actions for `--action` Flag

| Action                       | Description                                |
| ---------------------------- | ------------------------------------------ |
| `empty_commit`               | Create empty initial commit                |
| `commit_staged`              | Commit staged changes to new branch        |
| `commit_all`                 | Stage all and commit to new branch         |
| `stash_and_empty`            | Stash changes, create empty commit         |
| `use_commits`                | Use local commits (branch from HEAD)       |
| `push_then_branch`           | Push to main first, then create branch     |
| `use_commits_and_commit_all` | Include commits + commit uncommitted       |
| `use_commits_and_stash`      | Include commits, stash uncommitted         |
| `create_pr_for_branch`       | Create PR for existing branch              |
| `pr_for_branch_commit_all`   | Create PR for branch, commit changes first |
| `pr_for_branch_stash`        | Create PR for branch, stash changes        |
| `branch_from_detached`       | Create branch from detached HEAD           |

### Programmatic API

For deeper integration, use the programmatic API:

```typescript
import {
  queryState,
  listWorktrees,
  cleanWorktrees,
  createPr,
} from '@camaradesuk/git-worktree-tools';

// Query git state
const state = queryState({ baseBranch: 'main' });
if (state.success) {
  console.log(`Scenario: ${state.data.scenario}`);
  console.log(`Recommended: ${state.data.recommendedAction}`);
}

// Create PR
const result = await createPr({
  description: 'Add dark mode',
  action: 'commit_staged',
  draft: true,
});
```

See [docs/AI-TOOLING.md](docs/AI-TOOLING.md#programmatic-api) for complete API documentation.

## Configuration

Create a `.worktreerc` file in your repository root, or use `wtconfig init` to generate one interactively:

```json
{
  "baseBranch": "main",
  "draftPr": true,
  "branchPrefix": "feat",
  "ai": {
    "provider": "auto",
    "branchName": true,
    "prDescription": true
  },
  "hooks": {
    "post-worktree": "npm install"
  }
}
```

### Options

| Option            | Type     | Default               | Description                                                |
| ----------------- | -------- | --------------------- | ---------------------------------------------------------- |
| `sharedRepos`     | string[] | `[]`                  | Sibling repos to also create worktrees for                 |
| `baseBranch`      | string   | `"main"`              | Base branch for new PRs                                    |
| `draftPr`         | boolean  | `false`               | Create PRs as drafts by default                            |
| `worktreePattern` | string   | `"{repo}.pr{number}"` | Worktree directory naming pattern                          |
| `worktreeParent`  | string   | `".."`                | Parent directory for worktrees                             |
| `branchPrefix`    | string   | `"feat"`              | Prefix for auto-generated branch names                     |
| `preferredEditor` | string   | `"vscode"`            | Editor for lswt interactive: "vscode", "cursor", or "auto" |
| `ai`              | object   | `{}`                  | AI content generation settings (see below)                 |
| `hooks`           | object   | `{}`                  | Lifecycle hook commands (see below)                        |

### AI Content Generation

Enable AI-powered content generation for branch names and PR descriptions:

```json
{
  "ai": {
    "provider": "auto", // "auto" | "claude" | "gemini" | "openai" | "ollama" | "none"
    "branchName": true, // Generate smart branch names from description
    "prTitle": true, // Generate PR titles
    "prDescription": true // Generate PR descriptions from changes
  }
}
```

When `provider` is `"auto"`, the tool detects available AI tools in order: Claude Code → Gemini CLI → Ollama → OpenAI API.

### Lifecycle Hooks

Run custom commands at various points in the `newpr` workflow:

```json
{
  "hooks": {
    "post-worktree": "npm install",
    "post-pr": ["echo 'PR created!'", "./notify-team.sh"],
    "pre-branch": {
      "command": "npm test",
      "failOnError": true
    }
  }
}
```

**Available hooks:**

| Hook            | Description               | Critical |
| --------------- | ------------------------- | -------- |
| `pre-analyze`   | Before git state analysis | Yes      |
| `post-analyze`  | After state analysis      | No       |
| `pre-branch`    | Before branch creation    | Yes      |
| `post-branch`   | After branch creation     | No       |
| `pre-commit`    | Before initial commit     | Yes      |
| `post-commit`   | After initial commit      | No       |
| `pre-push`      | Before push to origin     | Yes      |
| `post-push`     | After push to origin      | No       |
| `pre-pr`        | Before PR creation        | Yes      |
| `post-pr`       | After PR creation         | No       |
| `pre-worktree`  | Before worktree creation  | Yes      |
| `post-worktree` | After worktree creation   | No       |
| `cleanup`       | On error (for rollback)   | No       |

**Critical hooks** abort the workflow if they fail. Non-critical hooks show a warning but continue.

**Hook definition formats:**

```json
{
  "hooks": {
    // Simple command
    "post-worktree": "npm install",

    // Multiple commands (run in sequence)
    "post-pr": ["echo 'Done!'", "./scripts/notify.sh"],

    // Complex definition
    "pre-commit": {
      "command": "npm test",
      "timeout": 60000,
      "failOnError": true,
      "if": "exists:package.json"
    }
  }
}
```

**Hook context variables** (available as environment variables):

| Variable           | Description        |
| ------------------ | ------------------ |
| `WT_BRANCH_NAME`   | New branch name    |
| `WT_PR_NUMBER`     | PR number          |
| `WT_PR_URL`        | PR URL             |
| `WT_WORKTREE_PATH` | New worktree path  |
| `WT_REPO_ROOT`     | Main repo root     |
| `WT_BASE_BRANCH`   | Base branch (main) |
| `WT_DESCRIPTION`   | PR description     |

> **Note:** File syncing between worktrees is managed by `wtlink` using its own `.wtlinkrc` manifest. See the [wtlink section](#wtlink) for details.

## Example Workflow

```bash
# Start in your main repo
cd ~/projects/my-app

# Create a new feature PR
newpr "Add dark mode support"
# → Creates branch: feat/add-dark-mode-support-xyz123
# → Creates PR: #42
# → Creates worktree: ~/projects/my-app.pr42
# → Switches to worktree

# Work on the feature in the dedicated worktree
# ... make changes, commit, push ...

# Need to work on another feature? No problem!
cd ~/projects/my-app
newpr "Fix login bug"
# → Creates another worktree: ~/projects/my-app.pr43

# List your worktrees
lswt
# WORKTREE              BRANCH                         PR     STATUS
# ~/projects/my-app     main                           -      -
# ~/projects/my-app.pr42 feat/add-dark-mode-xyz123  #42    open
# ~/projects/my-app.pr43 feat/fix-login-bug-abc456  #43    open

# After PRs are merged, clean up
cleanpr
# → Removes worktrees for merged PRs
# → Deletes local branches
```

## Development

```bash
# Clone the repo
git clone https://github.com/camaradesuk/git-worktree-tools.git
cd git-worktree-tools

# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Link for local development
npm link
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed local development instructions, including how to test CLI commands without affecting your global install.

## License

MIT
