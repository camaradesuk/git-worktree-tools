# Local Development & Testing

## Running Unit Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode for development
npm run test:coverage # Run with coverage report
```

## Testing CLI Commands Locally

### Option 1: Use npm link (recommended for testing like a real install)

```bash
npm run build         # Build the TypeScript
npm link              # Create global symlink

# Now you can run commands directly:
newpr --help
cleanpr --help
lswt --help
wtlink --help
wtstate --help
```

**Note:** If you already have `@camaradesuk/git-worktree-tools` installed globally, `npm link` will override it with a symlink to your local dev copy. The original installed version remains in the global `node_modules`, but the symlink takes precedence.

### Option 2: Run directly without linking

```bash
npm run build
node dist/cli/newpr.js --help
node dist/cli/cleanpr.js --help
node dist/cli/lswt.js --help
node dist/cli/wtlink.js --help
node dist/cli/wtstate.js --help
```

### Option 3: Use npx from the project directory

```bash
npm run build
npx newpr --help
```

## Development Workflow

Run the TypeScript compiler in watch mode:

```bash
npm run dev           # Rebuilds on file changes
```

Then in another terminal, run your commands to test changes.

## Restoring Global Install After Testing

```bash
# Remove the symlink
npm unlink -g @camaradesuk/git-worktree-tools

# If the original global install is gone, reinstall:
npm install -g @camaradesuk/git-worktree-tools
```

## Checking Current Installation

```bash
# List global packages
npm ls -g --depth=0

# See where the command points
which newpr            # Unix/macOS/Linux
where newpr            # Windows
```

## Alternative: Shell Alias

If you want to keep your global install intact while testing, create a shell alias:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias newpr-dev="node /path/to/git-worktree-tools/dist/cli/newpr.js"
alias cleanpr-dev="node /path/to/git-worktree-tools/dist/cli/cleanpr.js"
alias lswt-dev="node /path/to/git-worktree-tools/dist/cli/lswt.js"
alias wtlink-dev="node /path/to/git-worktree-tools/dist/cli/wtlink.js"
alias wtstate-dev="node /path/to/git-worktree-tools/dist/cli/wtstate.js"
```

## Linting & Formatting

```bash
npm run lint          # Check for linting issues
npm run lint:fix      # Auto-fix linting issues
npm run format        # Format code with Prettier
npm run format:check  # Check formatting without changes
```
