# AI Tool Integration Guide

This guide documents all features that enable AI agents (Claude Code, Gemini CLI, Codex CLI, etc.) to autonomously use git-worktree-tools for managing git worktrees and PR workflows.

## Table of Contents

- [Quick Start for AI Agents](#quick-start-for-ai-agents)
- [Non-Interactive Mode](#non-interactive-mode)
- [JSON Output Mode](#json-output-mode)
- [State Query Command (wtstate)](#state-query-command-wtstate)
- [Action Selection (--action flag)](#action-selection---action-flag)
- [Structured Error Codes](#structured-error-codes)
- [Dry-Run Mode](#dry-run-mode)
- [Programmatic API](#programmatic-api)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Integration Examples](#integration-examples)
- [Best Practices](#best-practices)

---

## Quick Start for AI Agents

The recommended workflow for AI agents is a three-step "look before you leap" pattern:

```bash
# 1. Query current git state
STATE=$(wtstate --json)

# 2. Extract recommended action
ACTION=$(echo $STATE | jq -r '.data.recommendedAction')

# 3. Execute with the chosen action
newpr "Add feature X" --non-interactive --action=$ACTION --json
```

This pattern ensures AI agents understand the repository state before taking action and handle all git scenarios correctly.

---

## Non-Interactive Mode

All CLI commands support non-interactive mode to bypass user prompts.

### newpr

```bash
# Non-interactive flags (equivalent)
newpr "Description" --non-interactive
newpr "Description" --yes
newpr "Description" -y

# Combined with JSON output
newpr "Description" --non-interactive --json

# With specific action
newpr "Description" --non-interactive --action=commit_staged --json
```

### cleanpr

```bash
# Clean all merged/closed PRs automatically
cleanpr --all

# Clean specific PR without prompts
cleanpr 42

# Preview without making changes
cleanpr --all --dry-run --json
```

### wtlink

```bash
# Link configs without prompts
wtlink link --yes

# Manage manifest non-interactively
wtlink manage --non-interactive
```

### lswt

```bash
# List-only mode (no interactive selection)
lswt --no-interactive

# JSON output (implicitly non-interactive)
lswt --json
```

---

## JSON Output Mode

All commands support `--json` for machine-readable output following a consistent schema.

### Standard Response Schema

Every command returns JSON matching this TypeScript interface:

```typescript
interface CommandResult<T> {
  success: boolean; // Whether the command succeeded
  command: string; // Command that was executed (e.g., "newpr", "cleanpr")
  timestamp: string; // ISO 8601 timestamp
  data?: T; // Command-specific data (present on success)
  error?: {
    // Error details (present on failure)
    code: string; // Machine-readable error code (see ErrorCode enum)
    message: string; // Human-readable error message
    details?: object; // Additional context
  };
  warnings?: string[]; // Non-fatal warnings
}
```

### Command-Specific Examples

#### newpr --json

**Success:**

```json
{
  "success": true,
  "command": "newpr",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "data": {
    "prNumber": 42,
    "prUrl": "https://github.com/org/repo/pull/42",
    "branch": "feat/add-dark-mode-xyz123",
    "worktreePath": "/home/user/repo.pr42",
    "draft": false,
    "scenario": "main_staged_same",
    "actionTaken": "commit_staged"
  }
}
```

**Failure:**

```json
{
  "success": false,
  "command": "newpr",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "error": {
    "code": "GH_NOT_AUTHENTICATED",
    "message": "GitHub CLI is not authenticated. Run 'gh auth login' first.",
    "details": {}
  }
}
```

#### cleanpr --json

**Success:**

```json
{
  "success": true,
  "command": "cleanpr",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "data": {
    "cleaned": [
      {
        "prNumber": 41,
        "branch": "feat/old-feature",
        "path": "/home/user/repo.pr41",
        "prState": "merged",
        "localBranchDeleted": true,
        "remoteBranchDeleted": false
      }
    ],
    "skipped": [],
    "totalCleaned": 1,
    "totalSkipped": 0
  }
}
```

#### wtstate --json

```json
{
  "success": true,
  "command": "wtstate",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "data": {
    "scenario": "main_staged_same",
    "scenarioDescription": "On main branch, same as origin/main, staged changes only",
    "currentBranch": "main",
    "baseBranch": "main",
    "worktreeType": "main_worktree",
    "hasChanges": true,
    "hasStagedChanges": true,
    "hasUnstagedChanges": false,
    "localCommits": [],
    "stagedFiles": ["src/feature.ts"],
    "unstagedFiles": [],
    "availableActions": [
      { "key": "commit_staged", "label": "Commit staged changes to new PR" },
      { "key": "stash_and_empty", "label": "Stash changes and create empty commit" }
    ],
    "recommendedAction": "commit_staged"
  }
}
```

#### lswt --json

```json
{
  "success": true,
  "command": "lswt",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "data": {
    "worktrees": [
      {
        "path": "/home/user/repo",
        "branch": "main",
        "isMain": true,
        "prNumber": null,
        "prState": null
      },
      {
        "path": "/home/user/repo.pr42",
        "branch": "feat/add-dark-mode",
        "isMain": false,
        "prNumber": 42,
        "prState": "open"
      }
    ],
    "total": 2
  }
}
```

---

## State Query Command (wtstate)

The `wtstate` command enables AI agents to query the current git state before taking action.

### Usage

```bash
wtstate                    # Human-readable output
wtstate --json             # Machine-readable JSON output (recommended)
wtstate --verbose          # Include file lists and commit details
wtstate --base develop     # Specify base branch (default: main)
```

### Output Fields

| Field                 | Type           | Description                                              |
| --------------------- | -------------- | -------------------------------------------------------- |
| `scenario`            | string         | Git state scenario identifier (e.g., `main_staged_same`) |
| `scenarioDescription` | string         | Human-readable scenario description                      |
| `currentBranch`       | string \| null | Current branch name (null if detached HEAD)              |
| `baseBranch`          | string         | Base branch for comparison                               |
| `worktreeType`        | enum           | `main_worktree`, `pr_worktree`, or `other`               |
| `hasChanges`          | boolean        | Whether there are any uncommitted changes                |
| `hasStagedChanges`    | boolean        | Whether there are staged changes                         |
| `hasUnstagedChanges`  | boolean        | Whether there are unstaged changes                       |
| `localCommits`        | string[]       | Commits not pushed to origin                             |
| `stagedFiles`         | string[]       | Files staged for commit (with `--verbose`)               |
| `unstagedFiles`       | string[]       | Modified but unstaged files (with `--verbose`)           |
| `availableActions`    | array          | Actions available for this scenario                      |
| `recommendedAction`   | string \| null | Suggested action to take                                 |

### Git State Scenarios

The tool detects 10+ git state scenarios:

| Scenario              | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `main_clean_same`     | On main, same as origin/main, no changes               |
| `main_staged_same`    | On main, same as origin/main, staged changes only      |
| `main_unstaged_same`  | On main, same as origin/main, unstaged changes only    |
| `main_both_same`      | On main, same as origin/main, both staged and unstaged |
| `main_clean_ahead`    | On main, ahead of origin/main, no changes              |
| `main_changes_ahead`  | On main, ahead of origin/main, with changes            |
| `branch_same_as_main` | On feature branch at same commit as main               |
| `branch_ancestor`     | On feature branch already merged into main             |
| `branch_divergent`    | On feature branch with commits not in main             |
| `branch_with_changes` | On feature branch with uncommitted changes             |
| `detached_head`       | In detached HEAD state                                 |
| `pr_worktree`         | Running from a PR worktree                             |

---

## Action Selection (--action flag)

The `--action` flag allows pre-specifying which action to take for a detected scenario, enabling fully autonomous operation.

### Available Actions

| Action                       | Description                                | Typical Scenario                       |
| ---------------------------- | ------------------------------------------ | -------------------------------------- |
| `empty_commit`               | Create empty initial commit                | `main_clean_same`                      |
| `commit_staged`              | Commit staged changes to new branch        | `main_staged_same`                     |
| `commit_all`                 | Stage all and commit to new branch         | `main_unstaged_same`, `main_both_same` |
| `stash_and_empty`            | Stash changes, create empty commit         | `main_*` scenarios                     |
| `use_commits`                | Use local commits (branch from HEAD)       | `main_clean_ahead`                     |
| `push_then_branch`           | Push to main first, then create branch     | `main_clean_ahead`                     |
| `use_commits_and_commit_all` | Include commits + commit uncommitted       | `main_changes_ahead`                   |
| `use_commits_and_stash`      | Include commits, stash uncommitted         | `main_changes_ahead`                   |
| `create_pr_for_branch`       | Create PR for existing branch              | `branch_divergent`                     |
| `pr_for_branch_commit_all`   | Create PR for branch, commit changes first | `branch_with_changes`                  |
| `pr_for_branch_stash`        | Create PR for branch, stash changes        | `branch_with_changes`                  |
| `branch_from_detached`       | Create branch from detached HEAD           | `detached_head`                        |

### Usage Example

```bash
# Query state first
STATE=$(wtstate --json)
SCENARIO=$(echo $STATE | jq -r '.data.scenario')
ACTION=$(echo $STATE | jq -r '.data.recommendedAction')

# Execute with selected action
newpr "Add feature" --non-interactive --action=$ACTION --json
```

### Action Validation

If an invalid action is provided for the current scenario, the command returns an error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_ACTION",
    "message": "Action 'commit_staged' is not valid for scenario 'main_clean_same'. Valid actions: empty_commit, stash_and_empty"
  }
}
```

---

## Structured Error Codes

All commands use consistent error codes for programmatic error handling.

### Error Code Reference

| Code                   | Description                                |
| ---------------------- | ------------------------------------------ |
| **Git Errors**         |                                            |
| `NOT_GIT_REPO`         | Not inside a git repository                |
| `DETACHED_HEAD`        | In detached HEAD state                     |
| `UNCOMMITTED_CHANGES`  | Has uncommitted changes blocking operation |
| `BRANCH_EXISTS`        | Branch already exists                      |
| `WORKTREE_EXISTS`      | Worktree already exists                    |
| `BRANCH_NOT_FOUND`     | Branch not found                           |
| `MERGE_CONFLICT`       | Merge conflict encountered                 |
| `STASH_FAILED`         | Failed to stash changes                    |
| **GitHub Errors**      |                                            |
| `GH_NOT_INSTALLED`     | GitHub CLI not installed                   |
| `GH_NOT_AUTHENTICATED` | GitHub CLI not authenticated               |
| `PR_NOT_FOUND`         | Pull request not found                     |
| `PR_ALREADY_EXISTS`    | PR already exists for branch               |
| `PR_CREATE_FAILED`     | Failed to create pull request              |
| **Config Errors**      |                                            |
| `INVALID_CONFIG`       | Invalid configuration file                 |
| **User Errors**        |                                            |
| `USER_CANCELLED`       | User cancelled the operation               |
| `INVALID_ARGUMENT`     | Invalid argument provided                  |
| `MISSING_ARGUMENT`     | Required argument missing                  |
| `INVALID_ACTION`       | Invalid action for scenario                |
| **Hook Errors**        |                                            |
| `HOOK_FAILED`          | Lifecycle hook failed                      |
| **System Errors**      |                                            |
| `UNKNOWN_ERROR`        | Unexpected error                           |
| `OPERATION_FAILED`     | Generic operation failure                  |

### Error Handling Example

```bash
RESULT=$(newpr "Feature" --non-interactive --json 2>&1)
SUCCESS=$(echo $RESULT | jq -r '.success')
ERROR_CODE=$(echo $RESULT | jq -r '.error.code // empty')

if [ "$SUCCESS" = "false" ]; then
  case "$ERROR_CODE" in
    "GH_NOT_AUTHENTICATED")
      gh auth login
      ;;
    "INVALID_ACTION")
      # Re-query state and retry
      ;;
    *)
      echo "Failed: $ERROR_CODE"
      ;;
  esac
fi
```

---

## Dry-Run Mode

Preview what would happen without making changes.

### cleanpr --dry-run

```bash
cleanpr --all --dry-run --json
```

Returns:

```json
{
  "success": true,
  "command": "cleanpr",
  "data": {
    "wouldClean": [
      {
        "prNumber": 41,
        "branch": "feat/old-feature",
        "path": "/home/user/repo.pr41",
        "prState": "merged"
      }
    ],
    "totalWouldClean": 1
  }
}
```

### wtlink --dry-run

```bash
wtlink link --dry-run --json
```

---

## Programmatic API

For deeper integration, use the programmatic API directly in Node.js/TypeScript.

### Installation

```typescript
import {
  queryState,
  listWorktrees,
  cleanWorktrees,
  createPr,
  setupPrWorktree,
} from '@camaradesuk/git-worktree-tools';
```

### API Functions

#### queryState(options)

Query the current git state without side effects.

```typescript
import { queryState } from '@camaradesuk/git-worktree-tools';

const result = queryState({
  baseBranch: 'main', // optional, defaults to 'main'
  verbose: true, // optional, include file lists
});

if (result.success) {
  console.log(`Scenario: ${result.data.scenario}`);
  console.log(`Recommended: ${result.data.recommendedAction}`);
}
```

#### listWorktrees(options)

List all git worktrees with PR status.

```typescript
import { listWorktrees } from '@camaradesuk/git-worktree-tools';

const result = await listWorktrees({
  showStatus: true, // Fetch PR status from GitHub
});

if (result.success) {
  for (const wt of result.data.worktrees) {
    console.log(`${wt.path} - PR #${wt.prNumber || 'N/A'}`);
  }
}
```

#### cleanWorktrees(options)

Clean up worktrees for merged/closed PRs.

```typescript
import { cleanWorktrees } from '@camaradesuk/git-worktree-tools';

const result = await cleanWorktrees({
  prNumber: 42, // Clean specific PR, or omit for all
  deleteRemote: true, // Also delete remote branches
  force: false, // Force remove even if not merged
  dryRun: true, // Preview mode
});

if (result.success) {
  console.log(`Cleaned ${result.data.totalCleaned} worktrees`);
}
```

#### createPr(options)

Create a new PR with worktree.

```typescript
import { createPr } from '@camaradesuk/git-worktree-tools';

const result = await createPr({
  description: 'Add dark mode',
  action: 'commit_staged', // Pre-specify action
  draft: true, // Create as draft
  baseBranch: 'main', // Base branch
  branch: 'feat/dark-mode', // Custom branch name (optional)
});

if (result.success) {
  console.log(`Created PR #${result.data.prNumber}`);
  console.log(`Worktree: ${result.data.worktreePath}`);
}
```

---

## Lifecycle Hooks

Configure commands to run at various points in the workflow.

### Available Hooks

| Hook            | When                      | Critical |
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

**Critical hooks** abort the workflow on failure. Non-critical hooks log warnings but continue.

### Hook Configuration (.worktreerc)

```json
{
  "hooks": {
    "post-worktree": "npm install",
    "post-pr": ["echo 'PR #{{PR_NUMBER}} created!'", "./notify.sh"],
    "pre-branch": {
      "command": "npm test",
      "failOnError": true,
      "timeout": 60000,
      "if": "exists:package.json"
    }
  }
}
```

### Hook Context Variables

Available as environment variables in hook commands:

| Variable           | Description                 |
| ------------------ | --------------------------- |
| `WT_BRANCH_NAME`   | New branch name             |
| `WT_PR_NUMBER`     | PR number                   |
| `WT_PR_URL`        | PR URL                      |
| `WT_WORKTREE_PATH` | New worktree path           |
| `WT_REPO_ROOT`     | Main repo root              |
| `WT_BASE_BRANCH`   | Base branch (main)          |
| `WT_DESCRIPTION`   | PR description              |
| `WT_SCENARIO`      | Detected git state scenario |
| `WT_ACTION`        | Action taken                |

### Hook Conditions

```json
{
  "hooks": {
    "post-worktree": {
      "command": "pnpm install",
      "if": "exists:pnpm-lock.yaml"
    }
  }
}
```

Available conditions:

- `exists:<file>` - File exists
- `not:<condition>` - Negate condition
- `env:<VAR_NAME>` - Environment variable is set
- `has-changes` - Has uncommitted changes
- `has-staged` - Has staged changes
- `scenario:<name>` - Matches specific scenario

### Hook Failures with JSON Output

When a hook fails and `--json` is enabled, the error uses the `HOOK_FAILED` error code:

```json
{
  "success": false,
  "command": "newpr",
  "error": {
    "code": "HOOK_FAILED",
    "message": "Aborted by pre-commit hook."
  }
}
```

---

## Integration Examples

### Claude Code Configuration

Add to your project's `.mcp.json` or Claude Code settings:

```json
{
  "mcpServers": {
    "git-worktree-tools": {
      "command": "npx",
      "args": ["@camaradesuk/git-worktree-tools-mcp"]
    }
  }
}
```

### Gemini CLI Configuration

Add to `GEMINI.md`:

```markdown
## Git Worktree Management

This project uses git-worktree-tools for PR workflows.

### Commands

- `wtstate --json` - Query git state
- `newpr "description" --non-interactive --json` - Create PR
- `cleanpr --all --json` - Clean merged PRs
- `lswt --json --status` - List worktrees

### Workflow

1. Always query state first: `wtstate --json`
2. Use `recommendedAction` from the response
3. Parse JSON output for structured results
```

### CI/CD Pipeline Integration

```yaml
# .github/workflows/auto-pr.yml
jobs:
  create-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install git-worktree-tools
        run: npm install -g @camaradesuk/git-worktree-tools

      - name: Create PR
        run: |
          RESULT=$(newpr "Automated update" --non-interactive --action=commit_staged --json)
          echo "PR_URL=$(echo $RESULT | jq -r '.data.prUrl')" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Shell Script Wrapper

```bash
#!/bin/bash
# smart-pr.sh - AI-friendly PR creation wrapper

set -e

DESCRIPTION="${1:-Automated changes}"

# Query state
STATE=$(wtstate --json)
SCENARIO=$(echo $STATE | jq -r '.data.scenario')
RECOMMENDED=$(echo $STATE | jq -r '.data.recommendedAction')

# Handle scenarios that can't create PRs
if [ "$SCENARIO" = "pr_worktree" ]; then
  echo "Already in a PR worktree, skipping PR creation"
  exit 0
fi

if [ "$RECOMMENDED" = "null" ]; then
  echo "No available action for scenario: $SCENARIO"
  exit 1
fi

# Create PR
RESULT=$(newpr "$DESCRIPTION" --non-interactive --action="$RECOMMENDED" --json)

if [ "$(echo $RESULT | jq -r '.success')" = "true" ]; then
  PR_URL=$(echo $RESULT | jq -r '.data.prUrl')
  echo "Created PR: $PR_URL"
else
  ERROR=$(echo $RESULT | jq -r '.error.message')
  echo "Failed: $ERROR"
  exit 1
fi
```

---

## Best Practices

### 1. Always Query State First

Before creating a PR, query the current git state:

```bash
STATE=$(wtstate --json)
```

This prevents errors from invalid actions and helps AI agents understand the context.

### 2. Use Recommended Actions

The `recommendedAction` field provides the safest default:

```bash
ACTION=$(echo $STATE | jq -r '.data.recommendedAction')
```

### 3. Handle All Error Codes

Check error codes programmatically:

```bash
ERROR_CODE=$(echo $RESULT | jq -r '.error.code // empty')
case "$ERROR_CODE" in
  "GH_NOT_AUTHENTICATED") # Handle auth ;;
  "INVALID_ACTION") # Query state and retry ;;
esac
```

### 4. Use Dry-Run for Preview

Before destructive operations:

```bash
cleanpr --all --dry-run --json
```

### 5. Configure Hooks for Automation

Automate repetitive tasks:

```json
{
  "hooks": {
    "post-worktree": "npm install",
    "post-pr": "./scripts/notify-team.sh"
  }
}
```

### 6. Prefer JSON Output

Always use `--json` for programmatic access:

```bash
newpr "Feature" --non-interactive --json
```

### 7. Validate Before Execute

Check scenario compatibility before executing:

```bash
AVAILABLE=$(echo $STATE | jq -r '.data.availableActions[].key' | grep -c "^$ACTION$")
if [ "$AVAILABLE" -eq 0 ]; then
  echo "Action $ACTION not available for current scenario"
  exit 1
fi
```

---

## Troubleshooting

### Common Issues

**"INVALID_ACTION" error**

- Query state first with `wtstate --json`
- Use one of the actions from `availableActions`

**"GH_NOT_AUTHENTICATED" error**

- Run `gh auth login` to authenticate GitHub CLI

**"USER_CANCELLED" in non-interactive mode**

- Ensure `--non-interactive` or `--yes` flag is provided
- Check that `--action` is specified if required

**Hook failures**

- Check hook command syntax in `.worktreerc`
- Use `--dry-run` in hooks to test
- Check `WT_*` environment variables are available

### Debug Mode

For verbose output during troubleshooting:

```bash
DEBUG=worktree:* newpr "Feature" --non-interactive --json
```

---

## Version Compatibility

| Feature                  | Minimum Version |
| ------------------------ | --------------- |
| JSON output (`--json`)   | 1.2.0           |
| Non-interactive mode     | 1.2.0           |
| `wtstate` command        | 1.2.0           |
| `--action` flag          | 1.2.0           |
| Programmatic API         | 1.2.0           |
| Lifecycle hooks          | 1.3.0           |
| `HOOK_FAILED` error code | 1.3.0           |
| `--dry-run` for cleanpr  | 1.2.0           |
