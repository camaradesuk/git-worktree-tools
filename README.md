# git-worktree-tools

Cross-platform CLI tools for git worktree workflow management. Create PRs with dedicated worktrees, sync gitignored files, and manage your development workflow.

## Features

- **Cross-platform**: Works natively on Windows, macOS, and Linux (no bash/WSL required)
- **Smart State Detection**: Intelligently handles 10+ git scenarios (uncommitted changes, local commits, existing branches, etc.)
- **PR + Worktree Workflow**: Create PRs and dedicated worktrees in one command
- **Shared Repos**: Automatically create worktrees in related repositories
- **File Syncing**: Sync gitignored files (node_modules, .env, etc.) between worktrees
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

# Sync gitignored files between worktrees
wtlink node_modules
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

List all worktrees with status information.

```bash
lswt              # List all worktrees
lswt --status     # Include PR status (open/merged/closed)
```

### wtlink

Sync gitignored files between worktrees using symlinks.

```bash
wtlink                    # Sync based on .worktreerc config
wtlink node_modules       # Sync specific directory
wtlink --restore          # Convert symlinks back to real files
```

## Configuration

Create a `.worktreerc` file in your repository root:

```json
{
  "sharedRepos": ["cluster-gitops", "infrastructure"],
  "baseBranch": "main",
  "draftPr": true,
  "syncPatterns": ["node_modules", ".env.local"]
}
```

### Options

| Option            | Type     | Default                | Description                                  |
| ----------------- | -------- | ---------------------- | -------------------------------------------- |
| `sharedRepos`     | string[] | `[]`                   | Sibling repos to also create worktrees for   |
| `baseBranch`      | string   | `"main"`               | Base branch for new PRs                      |
| `draftPr`         | boolean  | `false`                | Create PRs as drafts by default              |
| `worktreePattern` | string   | `"{repo}.pr{number}"`  | Worktree directory naming pattern            |
| `worktreeParent`  | string   | `".."`                 | Parent directory for worktrees               |
| `syncPatterns`    | string[] | `[]`                   | Files/directories to sync between worktrees  |

## Example Workflow

```bash
# Start in your main repo
cd ~/projects/my-app

# Create a new feature PR
newpr "Add dark mode support"
# → Creates branch: claude/add-dark-mode-support-xyz123
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
# ~/projects/my-app.pr42 claude/add-dark-mode-xyz123  #42    open
# ~/projects/my-app.pr43 claude/fix-login-bug-abc456  #43    open

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

## License

MIT
