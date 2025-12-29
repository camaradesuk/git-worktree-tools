# git-worktree-tools - Claude Session Context

## Project Overview

`@camaradesuk/git-worktree-tools` is a cross-platform Node.js/TypeScript CLI package for git worktree workflow management.

**Repository**: https://github.com/camaradesuk/git-worktree-tools

## Goals

- **Cross-platform**: Windows native, macOS, Linux (no bash/WSL dependency)
- **Single install**: `npm install -g @camaradesuk/git-worktree-tools`
- **Generic**: Works with any git repository (configurable via `.worktreerc`)
- **Bundled tools**: newpr, cleanpr, lswt, wtlink

## Current Status

### Completed

- [x] Repository created and TypeScript project set up
- [x] Core libraries implemented:
  - `src/lib/git.ts` - Git operations wrapper
  - `src/lib/github.ts` - GitHub CLI integration
  - `src/lib/prompts.ts` - Interactive prompts
  - `src/lib/config.ts` - Repository config via `.worktreerc`
  - `src/lib/colors.ts` - Cross-platform ANSI colors
  - `src/lib/state-detection.ts` - Git state analysis (10 scenarios)
- [x] CLI tools ported from bash:
  - `src/cli/newpr.ts` - Create PRs with worktree management
  - `src/cli/cleanpr.ts` - Clean up merged/closed PR worktrees
  - `src/cli/lswt.ts` - List worktrees with PR status
  - `src/cli/wtlink.ts` - Manage gitignored files via hard links
- [x] Unit tests (231 tests passing)
- [x] CI/CD workflows:
  - `.github/workflows/ci.yml` - Cross-platform testing (Ubuntu/macOS/Windows, Node 18/20/22)
  - `.github/workflows/release.yml` - npm publish on version tags

### Pending: npm Publishing

To publish to npm, the user needs to:

1. **Create npm account** (if not already done) at https://www.npmjs.com/signup

2. **Generate npm access token**:
   - Go to https://www.npmjs.com/settings/~/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token

3. **Add token to GitHub repository secrets**:
   - Go to https://github.com/camaradesuk/git-worktree-tools/settings/secrets/actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: (paste the npm token)

4. **Create a version tag to trigger release**:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. The release workflow will automatically:
   - Build and test
   - Publish to npm with provenance
   - Create a GitHub Release with auto-generated release notes

## Project Structure

```
git-worktree-tools/
├── .github/workflows/
│   ├── ci.yml              # Cross-platform CI
│   └── release.yml         # npm publish workflow
├── docs/
│   └── PLAN.md             # Detailed implementation plan
├── src/
│   ├── cli/
│   │   ├── newpr.ts        # Create PR with worktree
│   │   ├── cleanpr.ts      # Clean merged/closed worktrees
│   │   ├── lswt.ts         # List worktrees with status
│   │   └── wtlink.ts       # Sync gitignored files
│   ├── lib/
│   │   ├── git.ts          # Git operations
│   │   ├── github.ts       # GitHub CLI wrapper
│   │   ├── prompts.ts      # Interactive prompts
│   │   ├── config.ts       # Config file handling
│   │   ├── colors.ts       # ANSI colors
│   │   ├── state-detection.ts  # Git state analysis
│   │   ├── errors.ts       # Custom error classes
│   │   ├── constants.ts    # Centralized defaults
│   │   ├── wtlink/         # wtlink submodules
│   │   │   ├── link-configs.ts      # Hard link creation
│   │   │   ├── manage-manifest.ts   # Interactive TUI
│   │   │   ├── validate-manifest.ts # Manifest validation
│   │   │   └── main-menu.ts         # Interactive menu
│   │   └── *.test.ts       # Unit tests
│   ├── e2e/                # End-to-end tests
│   ├── integration/        # Integration tests
│   └── index.ts            # Library exports
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Git State Scenarios (newpr tool)

The newpr tool handles 10 git state scenarios intelligently:

| # | State | Description |
|---|-------|-------------|
| 1 | main_clean_same | On main, same as origin/main, clean |
| 2a | main_staged_same | On main, same as origin/main, staged changes |
| 2b | main_unstaged_same | On main, same as origin/main, unstaged changes |
| 2c | main_both_same | On main, same as origin/main, both staged and unstaged |
| 3 | main_clean_ahead | On main, ahead of origin/main, clean |
| 4 | main_changes_ahead | On main, ahead of origin/main, with changes |
| 5 | branch_same_as_main | On feature branch at same commit as main |
| 6 | branch_ancestor | On feature branch already merged into main |
| 7 | branch_divergent | On feature branch with commits not in main |
| 8 | branch_with_changes | On feature branch with uncommitted changes |
| 9 | detached_head | In detached HEAD state |
| 10 | pr_worktree | Running from a PR worktree |

## Development Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Watch mode for build
npm run dev
```

## Configuration (.worktreerc)

Users can create a `.worktreerc` or `.worktreerc.json` in their repo root:

```json
{
  "baseBranch": "main",
  "draftPr": false,
  "worktreePattern": "{repo}.pr{number}",
  "worktreeParent": "..",
  "branchPrefix": "claude",
  "sharedRepos": ["cluster-gitops"]
}
```

## Source Scripts Reference

The TypeScript implementations were ported from bash scripts in `/home/chris/workspace/syrf/scripts/`:
- `newpr` → `src/cli/newpr.ts`
- `cleanpr` → `src/cli/cleanpr.ts`
- `lswt` → `src/cli/lswt.ts`

The `wtlink` tool was created based on the user's existing Node.js package functionality.

## Notes for Continuation

- All tests pass locally and in CI (Ubuntu, macOS, Windows)
- The npm publish workflow requires `NPM_TOKEN` secret to be set
- CI uses Node 18/20/22 matrix testing
- Path handling has been fixed for cross-platform compatibility
- The package uses ESM modules (`"type": "module"`)
