# External Integrations

**Analysis Date:** 2026-02-18

## APIs & External Services

**GitHub (via GitHub CLI):**

- Service: GitHub API, accessed exclusively through the `gh` CLI tool
- SDK/Client: No direct HTTP client; all calls via `execSync('gh ...')` in `src/lib/github.ts`
- Auth: GitHub CLI authentication (`gh auth login`); CI uses `GH_TOKEN` / `GITHUB_TOKEN` env vars
- Operations used: `gh pr create`, `gh pr view`, `gh pr list`, `gh pr checkout`, `gh repo view`, `gh api user`, `gh auth status`

**Model Context Protocol (MCP):**

- Service: MCP-compatible AI agents (Claude, etc.)
- SDK/Client: `@modelcontextprotocol/sdk` ^1.25.1
- Transport: stdio (`StdioServerTransport`)
- Entry point: `src/mcp/server.ts` (binary: `git-worktree-mcp`)
- Tools exposed: `worktree_get_state`, `worktree_create_pr`, `worktree_list`, `worktree_clean`

## Data Storage

**Databases:**

- None - no database used

**File Storage:**

- Local filesystem only
- Worktree directories created as sibling directories of the repo
- Hard links managed by wtlink tool (`src/lib/wtlink/`)
- Manifest stored in `.wtlinkrc` at repo root

**Caching:**

- None - no caching layer

## Authentication & Identity

**Git:**

- Standard git credential management (system keychain, SSH keys, etc.)
- No custom auth layer

**GitHub:**

- Delegated entirely to GitHub CLI (`gh`)
- CI uses `GITHUB_TOKEN` (auto-provided by GitHub Actions) and `GH_TOKEN`

**npm Publishing:**

- `NPM_TOKEN` secret in GitHub repository (required for release workflow)
- Published with provenance (`NPM_CONFIG_PROVENANCE=true`)

## Monitoring & Observability

**Error Tracking:**

- None - no error tracking service integrated

**Coverage:**

- Codecov - coverage reports uploaded in CI via `codecov/codecov-action@v5`
- Token: `CODECOV_TOKEN` GitHub Actions secret
- JUnit test results also uploaded to Codecov Test Analytics (`test-results/junit.xml`)

**Logs:**

- console.log/error only; no structured logging library

## CI/CD & Deployment

**Hosting:**

- npm registry: `https://registry.npmjs.org` (public package `@camaradesuk/git-worktree-tools`)
- Source: GitHub (https://github.com/camaradesuk/git-worktree-tools)

**CI Pipeline:**

- GitHub Actions
- `.github/workflows/ci.yml` - test matrix (Ubuntu/macOS/Windows × Node 18/20/22), lint, coverage, dry-run publish
- `.github/workflows/release.yml` - triggered after CI success on main; runs `semantic-release`
- `.github/workflows/publish.yml` - additional publish workflow

**Release Process:**

- semantic-release ^25.0.2 with conventional commits
- Plugins: commit-analyzer, release-notes-generator, changelog, npm (with provenance), git, github
- Automatically bumps version in `package.json`, updates `CHANGELOG.md`, creates GitHub Release, publishes to npm

## Environment Configuration

**Required env vars (CI):**

- `GH_TOKEN` / `GITHUB_TOKEN` - GitHub authentication for test operations
- `NPM_TOKEN` - npm publish token (GitHub Actions secret)
- `CODECOV_TOKEN` - Codecov upload token (GitHub Actions secret)

**Runtime env vars:**

- `NEWPR_MOCK_GITHUB=1` - Enable mock mode for GitHub CLI calls (testing only)

**Secrets location:**

- GitHub Actions repository secrets (Settings > Secrets and variables > Actions)
- No `.env` file convention; local development uses system `gh` auth

## Webhooks & Callbacks

**Incoming:**

- None

**Outgoing:**

- None - no outgoing webhooks; all GitHub interaction is pull-based via `gh` CLI

## External Tools (Runtime Dependencies)

**git:**

- Required: all git operations via `execSync('git ...')` in `src/lib/git.ts`
- Must be in system PATH

**gh (GitHub CLI):**

- Required for PR creation and listing: `src/lib/github.ts`
- Must be in system PATH and authenticated
- Gracefully detected via `isGhInstalled()` / `isAuthenticated()` before use

---

_Integration audit: 2026-02-18_
