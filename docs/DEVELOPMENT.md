# Local Development & Testing

## Running Unit Tests

```bash
pnpm test              # Run all tests once
pnpm run test:watch    # Watch mode for development
pnpm run test:coverage # Run with coverage report
```

## Testing CLI Commands Locally

### Option 1: Use pnpm link (recommended for testing like a real install)

```bash
pnpm run build         # Build the TypeScript
pnpm link --global     # Create global symlink

# Now you can run commands directly:
wt --help             # Unified command (recommended)
wt new --help
wt list --help
wt clean --help
wt link --help
wt state --help
wt config --help
wt init --help

# Or individual commands:
newpr --help
cleanpr --help
lswt --help
wtlink --help
wtstate --help
wtconfig --help
```

**Note:** If you already have `@camaradesuk/git-worktree-tools` installed globally, `pnpm link --global` will override it with a symlink to your local dev copy. The original installed version remains in the global store, but the symlink takes precedence.

### Option 2: Run directly without linking

```bash
pnpm run build
node dist/cli/wt.js --help         # Unified command
node dist/cli/newpr.js --help
node dist/cli/cleanpr.js --help
node dist/cli/lswt.js --help
node dist/cli/wtlink.js --help
node dist/cli/wtstate.js --help
node dist/cli/wtconfig.js --help
```

### Option 3: Use npx from the project directory

```bash
pnpm run build
npx wt --help
npx newpr --help
```

## Development Workflow

Run the TypeScript compiler in watch mode:

```bash
pnpm run dev           # Rebuilds on file changes
```

Then in another terminal, run your commands to test changes.

## Restoring Global Install After Testing

```bash
# Remove the symlink
pnpm uninstall --global @camaradesuk/git-worktree-tools

# If the original global install is gone, reinstall:
npm install -g @camaradesuk/git-worktree-tools
```

## Checking Current Installation

```bash
# List global packages
pnpm list --global

# See where the command points
which wt               # Unix/macOS/Linux
where wt               # Windows
```

## Alternative: Shell Alias

If you want to keep your global install intact while testing, create a shell alias:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias wt-dev="node /path/to/git-worktree-tools/dist/cli/wt.js"
alias newpr-dev="node /path/to/git-worktree-tools/dist/cli/newpr.js"
alias cleanpr-dev="node /path/to/git-worktree-tools/dist/cli/cleanpr.js"
alias lswt-dev="node /path/to/git-worktree-tools/dist/cli/lswt.js"
alias wtlink-dev="node /path/to/git-worktree-tools/dist/cli/wtlink.js"
alias wtstate-dev="node /path/to/git-worktree-tools/dist/cli/wtstate.js"
alias wtconfig-dev="node /path/to/git-worktree-tools/dist/cli/wtconfig.js"
```

## Linting & Formatting

```bash
pnpm run lint          # Check for linting issues
pnpm run lint:fix      # Auto-fix linting issues
pnpm run format        # Format code with Prettier
pnpm run format:check  # Check formatting without changes
```

## Project Structure

```text
git-worktree-tools/
├── src/
│   ├── cli/
│   │   ├── wt.ts               # Unified CLI entry point
│   │   ├── wt/                 # wt subcommands
│   │   │   ├── new.ts
│   │   │   ├── list.ts
│   │   │   ├── clean.ts
│   │   │   ├── link.ts
│   │   │   ├── state.ts
│   │   │   ├── config.ts
│   │   │   ├── init.ts
│   │   │   ├── completion.ts
│   │   │   └── interactive-menu.ts
│   │   ├── newpr.ts           # Standalone newpr command
│   │   ├── cleanpr.ts         # Standalone cleanpr command
│   │   ├── lswt.ts            # Standalone lswt command
│   │   ├── wtlink.ts          # Standalone wtlink command
│   │   ├── wtstate.ts         # Standalone wtstate command
│   │   └── wtconfig.ts        # Standalone wtconfig command
│   ├── lib/
│   │   ├── git.ts             # Git operations wrapper
│   │   ├── github.ts          # GitHub CLI integration
│   │   ├── config.ts          # Configuration loading/merging
│   │   ├── global-config.ts   # Three-tier config support
│   │   ├── logger.ts          # Structured logging system
│   │   ├── prompts.ts         # Interactive prompts
│   │   ├── colors.ts          # ANSI color helpers
│   │   ├── state-detection.ts # Git state analysis
│   │   ├── constants.ts       # Centralized defaults
│   │   ├── errors.ts          # Custom error classes
│   │   └── wtlink/            # wtlink submodules
│   ├── integration/           # Integration tests
│   ├── e2e/                   # End-to-end tests
│   └── index.ts               # Programmatic API exports
├── schemas/
│   └── worktreerc.schema.json # JSON schema for config
├── docs/
│   ├── AI-TOOLING.md          # AI integration guide
│   ├── DEVELOPMENT.md         # This file
│   └── PLAN.md                # Implementation plan
└── package.json
```
