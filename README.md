# git-worktree-tools

[![npm version](https://img.shields.io/npm/v/@camaradesuk/git-worktree-tools)](https://www.npmjs.com/package/@camaradesuk/git-worktree-tools)
[![CI](https://github.com/camaradesuk/git-worktree-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/camaradesuk/git-worktree-tools/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/camaradesuk/git-worktree-tools/graph/badge.svg?token=gJG6TuHvPK)](https://codecov.io/gh/camaradesuk/git-worktree-tools)

Cross-platform CLI tools for git worktree workflow management. Create PRs with dedicated worktrees, sync gitignored files, and manage your development workflow.

## Features

- **Unified CLI** — Single `wt` command with interactive menu or subcommands
- **Cross-platform** — Works natively on Windows, macOS, and Linux (no bash/WSL required)
- **Smart State Detection** — Intelligently handles 10+ git scenarios (uncommitted changes, local commits, existing branches, etc.)
- **PR + Worktree Workflow** — Create PRs and dedicated worktrees in one command
- **Config Syncing** — Share gitignored config files (.env, .vscode, etc.) between worktrees via hard links
- **Three-Tier Configuration** — Global, repo, and local config with JSON schema validation
- **Structured Logging** — Configurable log levels with file output support
- **AI Tool Integration** — JSON output mode and programmatic API for AI agents

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
# Interactive menu (recommended for exploration)
wt

# Create a new PR with worktree
wt new "Add user authentication feature"

# List worktrees with interactive selection
wt list

# Clean up merged/closed PRs
wt clean

# Initialize configuration
wt init
```

---

## The `wt` Command

The unified `wt` command provides access to all git-worktree-tools functionality through an interactive menu or subcommands.

### Interactive Mode

Run `wt` without arguments to launch the interactive menu:

```bash
wt
```

The menu provides guided workflows for:

- Creating new PRs (from description, existing PR, or current branch)
- Listing and navigating worktrees
- Cleaning up merged/closed PR worktrees
- Managing config file linking
- Viewing git state
- Editing configuration

### Subcommands

| Command              | Alias    | Description                         |
| -------------------- | -------- | ----------------------------------- |
| `wt`                 | -        | Interactive main menu               |
| `wt new <desc>`      | `wt n`   | Create a new PR with worktree       |
| `wt list`            | `wt ls`  | List worktrees with PR status       |
| `wt clean [pr]`      | `wt c`   | Clean up merged/closed PR worktrees |
| `wt link [cmd]`      | `wt l`   | Manage gitignored files via links   |
| `wt state`           | `wt s`   | Query git worktree state            |
| `wt config [cmd]`    | `wt cfg` | Configuration management            |
| `wt init`            | -        | Initialize configuration            |
| `wt completion <sh>` | -        | Generate shell completion scripts   |

### Global Options

```bash
wt -v               # Verbose output (debug level)
wt -vv              # Very verbose (trace level)
wt --debug          # Debug output
wt -q, --quiet      # Suppress non-essential output
wt --log-file FILE  # Write logs to file
```

---

## Commands Reference

### wt new / newpr

Create a new PR with an associated worktree.

```bash
wt new "Description of the feature"
wt new --branch my-feature "Feature description"
wt new --pr 123              # Work on existing PR
wt new --draft "WIP feature"
wt new --install --code      # Install deps and open editor
```

**Smart State Handling**: The tool detects your current git state and offers appropriate options:

- Uncommitted changes? Choose to commit, stash, or leave them
- Local commits on main? Include them or start fresh
- On a feature branch? Create PR for it or start new
- Detached HEAD? Create branch from current commit or main

### wt list / lswt

List and manage git worktrees with an interactive interface.

```bash
wt list                   # Interactive mode (default in terminal)
wt ls --no-interactive    # List-only mode
wt ls --status            # Include PR status (requires gh cli)
wt ls --json              # Output as JSON for scripting
wt ls --verbose           # Show more details
```

**Interactive Mode Shortcuts**:

| Key | Action                                     |
| --- | ------------------------------------------ |
| `e` | Open in editor (VS Code or Cursor)         |
| `t` | Open terminal at worktree path             |
| `p` | Open PR in browser / Create PR from branch |
| `d` | Show worktree details                      |
| `c` | Copy path to clipboard                     |
| `l` | Link config files (via wtlink)             |
| `r` | Remove worktree (not available for main)   |
| `/` | Fuzzy search worktrees                     |
| `q` | Quit                                       |

### wt clean / cleanpr

Clean up worktrees for merged or closed PRs.

```bash
wt clean              # Interactive cleanup
wt clean --all        # Clean all merged/closed automatically
wt clean --force      # Force remove even if not merged
wt clean --dry-run    # Preview what would be cleaned
```

### wt link / wtlink

Interactive CLI for managing configuration file links between git worktrees.

```bash
wt link                       # Interactive main menu
wt link manage                # Interactive file browser
wt link link                  # Create hard links based on manifest
wt link link ../my-app.pr42   # Link to specific worktree
wt link validate              # Verify manifest integrity
```

**Manifest format (`.wtlink`):**

```text
.vscode/settings.json
.editorconfig
.env.local
# .vscode/launch.json
```

- Active entries (no `#`) are hard-linked between worktrees
- Commented entries (`#`) are tracked but not linked

**Best practices:**

- **Good for linking:** `.vscode/settings.json`, `.editorconfig`, `.env.local`, certificates
- **Not for linking:** `node_modules/`, `dist/`, `build/`, `.git/`

See [wtlink documentation](#wtlink-details) for full details.

### wt state / wtstate

Query the current git state for AI agents and automation.

```bash
wt state              # Human-readable output
wt state --json       # Machine-readable JSON output
wt state --verbose    # Include file lists and commit details
wt state --base dev   # Specify base branch
```

**JSON output includes:**

- `scenario` — Git state scenario (e.g., `main_staged_same`)
- `currentBranch` — Current branch name
- `worktreeType` — Type: `main_worktree`, `pr_worktree`, or `other`
- `availableActions` — Actions available for this scenario
- `recommendedAction` — Suggested action to take

### wt config

Configuration management with interactive editing.

```bash
wt config              # Interactive config editor
wt cfg init            # Run setup wizard (alias for wt init)
wt cfg show            # Show current configuration
wt cfg set key value   # Set a configuration value
wt cfg get key         # Get a configuration value
wt cfg edit            # Open config in default editor
wt cfg validate        # Validate configuration
wt cfg schema          # Show JSON schema URL
```

### wt init

Initialize git-worktree-tools configuration.

```bash
wt init            # Interactive initialization
wt init --local    # Create local config (gitignored)
wt init --global   # Create global config
wt init --force    # Overwrite existing config
```

---

## Configuration

git-worktree-tools uses a three-tier configuration system:

| Level  | File                                       | Purpose              | Git Status |
| ------ | ------------------------------------------ | -------------------- | ---------- |
| Local  | `.worktreerc.local`                        | Personal overrides   | gitignored |
| Repo   | `.worktreerc` or `.worktreerc.json`        | Shared team settings | committed  |
| Global | `~/.config/git-worktree-tools/config.json` | User-wide defaults   | N/A        |

**Merge order:** defaults ← global ← repo ← local

### Creating Configuration

```bash
# Interactive setup (recommended)
wt init

# Or create specific configs
wt init --global   # User-wide defaults
wt init --local    # Personal repo overrides
```

### Example Configuration

```json
{
  "$schema": "https://unpkg.com/@camaradesuk/git-worktree-tools/schemas/worktreerc.schema.json",
  "baseBranch": "main",
  "draftPr": true,
  "branchPrefix": "feat",
  "preferredEditor": "vscode",
  "ai": {
    "provider": "auto",
    "branchName": true,
    "prDescription": true
  },
  "hooks": {
    "post-worktree": ["npm install", "code ."]
  },
  "logging": {
    "level": "info"
  }
}
```

### Configuration Options

| Option            | Type     | Default               | Description                                 |
| ----------------- | -------- | --------------------- | ------------------------------------------- |
| `baseBranch`      | string   | `"main"`              | Base branch for new PRs                     |
| `draftPr`         | boolean  | `false`               | Create PRs as drafts by default             |
| `worktreePattern` | string   | `"{repo}.pr{number}"` | Worktree directory naming pattern           |
| `worktreeParent`  | string   | `".."`                | Parent directory for worktrees              |
| `branchPrefix`    | string   | `"feat"`              | Prefix for auto-generated branch names      |
| `sharedRepos`     | string[] | `[]`                  | Sibling repos to also create worktrees for  |
| `preferredEditor` | string   | `"vscode"`            | Editor: `"vscode"`, `"cursor"`, or `"auto"` |
| `syncPatterns`    | string[] | `[]`                  | Patterns to sync between worktrees          |
| `ai`              | object   | `{}`                  | AI content generation settings              |
| `hooks`           | object   | `{}`                  | Lifecycle hook commands                     |
| `logging`         | object   | `{}`                  | Logging configuration                       |

### AI Content Generation

Enable AI-powered content generation for branch names and PR descriptions:

```json
{
  "ai": {
    "provider": "auto",
    "branchName": true,
    "prTitle": true,
    "prDescription": true,
    "commitMessage": true
  }
}
```

**Providers:** `"auto"` (detects available tools), `"claude"`, `"gemini"`, `"openai"`, `"ollama"`, `"none"`

### Lifecycle Hooks

Run custom commands at various points in the workflow:

```json
{
  "hooks": {
    "post-worktree": "npm install",
    "post-pr": ["echo 'PR created!'", "./notify-team.sh"],
    "pre-branch": {
      "command": "npm test",
      "failOnError": true,
      "timeout": 60000
    }
  }
}
```

**Available hooks:** `pre-analyze`, `post-analyze`, `pre-branch`, `post-branch`, `pre-commit`, `post-commit`, `pre-push`, `post-push`, `pre-pr`, `post-pr`, `pre-worktree`, `post-worktree`, `cleanup`

**Hook context variables** (environment variables):

| Variable           | Description       |
| ------------------ | ----------------- |
| `WT_BRANCH_NAME`   | New branch name   |
| `WT_PR_NUMBER`     | PR number         |
| `WT_PR_URL`        | PR URL            |
| `WT_WORKTREE_PATH` | New worktree path |
| `WT_REPO_ROOT`     | Main repo root    |
| `WT_BASE_BRANCH`   | Base branch       |
| `WT_DESCRIPTION`   | PR description    |

### Logging Configuration

```json
{
  "logging": {
    "level": "info",
    "logFile": "/path/to/logfile.log"
  }
}
```

**Levels:** `silent`, `error`, `warn`, `info`, `debug`, `trace`

CLI flags override config: `-v` (debug), `-vv` (trace), `-q` (silent), `--log-file`

---

## AI Tool Integration

All commands support `--json` for machine-readable output, enabling integration with AI CLI tools.

### Quick Start for AI Agents

```bash
# 1. Query current git state
STATE=$(wt state --json)

# 2. Extract recommended action
ACTION=$(echo $STATE | jq -r '.data.recommendedAction')

# 3. Execute with the chosen action
wt new "Add feature X" --non-interactive --action=$ACTION --json
```

### Non-Interactive Mode

```bash
wt new "Feature" --non-interactive --json
wt clean --all --json
wt link link --yes --json
```

### JSON Response Schema

```typescript
interface CommandResult<T> {
  success: boolean;
  command: string;
  timestamp: string;
  data?: T;
  error?: { code: string; message: string };
  warnings?: string[];
}
```

### Programmatic API

```typescript
import { queryState, createPr, listWorktrees } from '@camaradesuk/git-worktree-tools';

const state = queryState({ baseBranch: 'main' });
const result = await createPr({
  description: 'Add dark mode',
  action: 'commit_staged',
  draft: true,
});
```

See [docs/AI-TOOLING.md](docs/AI-TOOLING.md) for comprehensive AI integration documentation including error codes, available actions, and integration examples.

---

## Shell Completion

Enable tab completion for `wt` commands:

### Bash

```bash
wt completion bash >> ~/.bashrc
source ~/.bashrc
```

### Zsh

```bash
mkdir -p ~/.zsh/completions
wt completion zsh > ~/.zsh/completions/_wt
# Add to ~/.zshrc: fpath=(~/.zsh/completions $fpath)
```

### Fish

```bash
wt completion fish > ~/.config/fish/completions/wt.fish
```

---

## wtlink Details

The `wtlink` command provides an interactive TUI for managing configuration file links.

### Interactive UI Navigation

| Key | Action                                           |
| --- | ------------------------------------------------ |
| ↑/↓ | Navigate file list                               |
| ←/→ | Navigate into/out of folders (hierarchical view) |
| A   | Mark as "Will Link" (added to manifest)          |
| C   | Mark as "Track" (commented in manifest)          |
| S   | Mark as "Skip" (not in manifest)                 |
| 0-3 | Toggle filter visibility                         |
| V   | Toggle hierarchical/flat view                    |
| ?   | Show help                                        |
| Q   | Save and quit                                    |
| X   | Cancel without saving                            |

### Command Options

```bash
# manage - Discover and manage the manifest
wtlink manage                   # Interactive mode
wtlink manage --non-interactive # Auto-add new files as commented
wtlink manage --clean           # Remove stale entries
wtlink manage --dry-run         # Preview changes

# link - Create links between worktrees
wtlink link [source] [dest]     # Link from source to destination
wtlink link --dry-run           # Preview what would be linked
wtlink link --type symbolic     # Use symlinks instead of hard links
wtlink link --yes               # Skip confirmation prompts

# validate - Check manifest integrity
wtlink validate                 # Validate against current worktree
```

---

## Example Workflow

```bash
# Start in your main repo
cd ~/projects/my-app

# Create a new feature PR
wt new "Add dark mode support"
# → Creates branch: feat/add-dark-mode-support-xyz123
# → Creates PR: #42
# → Creates worktree: ~/projects/my-app.pr42
# → Runs post-worktree hooks (npm install, etc.)

# Work on the feature in the dedicated worktree
# ... make changes, commit, push ...

# Need another feature? No problem!
cd ~/projects/my-app
wt new "Fix login bug"
# → Creates worktree: ~/projects/my-app.pr43

# List your worktrees
wt list
# Interactive selection with PR status

# After PRs are merged, clean up
wt clean
# → Removes worktrees for merged PRs
# → Deletes local branches
```

---

## Development

```bash
git clone https://github.com/camaradesuk/git-worktree-tools.git
cd git-worktree-tools
npm install
npm run build
npm test
npm link  # For local development
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed development instructions.

---

## License

MIT
