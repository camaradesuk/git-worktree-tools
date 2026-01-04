# Git Worktree Tools: Comprehensive UX/UI Analysis & Improvement Recommendations

> **Date:** January 2026
> **Scope:** Complete analysis of the git-worktree-tools CLI suite with recommendations for improving user experience, tool integration, and workflow optimization.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [CLI UX Best Practices Review](#cli-ux-best-practices-review)
4. [Competitive Analysis](#competitive-analysis)
5. [Detailed Improvement Recommendations](#detailed-improvement-recommendations)
6. [Tool Integration Opportunities](#tool-integration-opportunities)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Appendices](#appendices)

---

## Executive Summary

### Overview

The git-worktree-tools suite consists of six CLI commands (`newpr`, `cleanpr`, `lswt`, `wtlink`, `wtstate`, `wtconfig`) designed to streamline git worktree workflows. After extensive analysis, this document identifies key opportunities to enhance user experience based on modern CLI design principles from [Command Line Interface Guidelines](https://clig.dev/) and best practices observed in successful tools like GitHub CLI (`gh`).

### Key Findings

| Category              | Current State                         | Priority | Impact |
| --------------------- | ------------------------------------- | -------- | ------ |
| **Discoverability**   | Limited cross-tool awareness          | High     | High   |
| **Help System**       | Basic, text-heavy                     | Medium   | High   |
| **Progress Feedback** | Inconsistent across tools             | High     | High   |
| **Error Handling**    | Good structure, can improve messaging | Medium   | Medium |
| **Tool Integration**  | Separate tools, minimal cohesion      | High     | High   |
| **Output Modes**      | Good JSON/human split                 | Low      | Low    |
| **Interactive UX**    | Strong in lswt, varies elsewhere      | Medium   | Medium |

### Top 10 Recommendations

1. **Unified Entry Point**: Add a `wt` master command that unifies all tools
2. **Contextual "Next Steps"**: Suggest related commands after each operation
3. **Enhanced Progress Indicators**: Consistent spinners/progress bars across all tools
4. **Improved Help System**: Examples-first help with common workflows
5. **Smart Defaults**: Environment-aware defaults that reduce flag usage
6. **Error Recovery Suggestions**: Every error should suggest a fix
7. **Tab Completion**: Shell completion for bash/zsh/fish
8. **Configuration Wizard**: Streamlined first-run experience
9. **Cross-tool Shortcuts**: Quick transitions between tools
10. **Rich Terminal UI**: Consider Ink/blessed for complex interactions

---

## Current State Analysis

### Tool-by-Tool Breakdown

#### 1. `newpr` - PR Creation Tool

**Current Strengths:**

- Excellent state detection (10+ scenarios)
- Smart handling of uncommitted changes
- Good JSON output for AI integration
- Lifecycle hooks for customization

**Current Weaknesses:**

- Help text is dense and overwhelming
- No progress visualization during multi-step process
- Scenario selection uses numbered prompts (less intuitive than arrow keys)
- No "undo" or recovery mechanism if something goes wrong mid-process

**User Flow Analysis:**

```
User invokes → Prerequisites check → State analysis → Scenario prompt →
Multiple git operations → PR creation → Worktree creation → Summary
```

**Pain Points Identified:**

1. Long wait times during fetch/push with no visual feedback
2. Error messages are informative but don't always suggest next steps
3. No way to preview what will happen before committing to action

#### 2. `lswt` - Worktree Listing Tool

**Current Strengths:**

- Best-in-class interactive mode with keyboard shortcuts
- Automatic TTY detection for output mode
- Clear visual hierarchy with color-coded badges
- Action shortcuts are well-documented in header

**Current Weaknesses:**

- Interactive mode clears screen (loses context)
- No fuzzy search for large worktree lists
- Remote PR listing could be more discoverable
- "Press Enter to continue" after actions breaks flow

**User Flow Analysis:**

```
User invokes → Gather worktrees → [Interactive: Select → Action → Result] or [List: Print table]
```

**Pain Points Identified:**

1. Can't filter/search worktrees by name or state
2. No batch operations (e.g., clean multiple at once from lswt)
3. Transitioning to other tools requires exiting

#### 3. `cleanpr` - Cleanup Tool

**Current Strengths:**

- Good grouping by PR state (merged/closed/open)
- Dry-run mode for safety
- Interactive selection with confirmation

**Current Weaknesses:**

- No undo mechanism for accidental cleanup
- Scanning message appears before visual feedback
- Individual confirmation for each item is tedious

**User Flow Analysis:**

```
User invokes → Scan worktrees → Query PR status → Group by state →
Select action → [Per-item confirm] → Execute cleanup → Summary
```

**Pain Points Identified:**

1. Scanning worktrees can be slow with no progress indicator
2. "Select individually" mode requires many confirmations
3. No "are you sure?" summary before bulk action

#### 4. `wtlink` - Config Linking Tool

**Current Strengths:**

- Sophisticated TUI for file management
- Good conflict detection
- Multiple link types (hard/symbolic)
- Safety warnings for dangerous operations

**Current Weaknesses:**

- Steeper learning curve than other tools
- No quick "link everything" mode
- Hierarchical navigation can be confusing
- Keyboard shortcuts differ from lswt

**User Flow Analysis:**

```
User invokes → [Main menu or subcommand] → Manage: File browser | Link: Source/dest selection | Validate: Check
```

**Pain Points Identified:**

1. Main menu is an extra step for power users
2. File discovery can be slow in large repos
3. No way to template/save common configurations

#### 5. `wtstate` - State Query Tool

**Current Strengths:**

- Clean, focused purpose
- Excellent JSON output for automation
- Includes recommended actions

**Current Weaknesses:**

- Human-readable output could be more informative
- No visual indicators in text mode
- Limited standalone utility (primarily for automation)

#### 6. `wtconfig` - Configuration Tool

**Current Strengths:**

- Interactive wizard for first-time setup
- Environment detection
- Supports global and local config

**Current Weaknesses:**

- Wizard is comprehensive but lengthy
- No quick "show what's different from defaults"
- Limited validation feedback

### Cross-Tool Observations

1. **Inconsistent Prompts**: `newpr` uses numbered choices, `lswt` uses arrow keys, `cleanpr` uses both
2. **Varying Help Styles**: Different levels of detail and formatting
3. **No Cross-References**: Tools don't suggest related tools
4. **Separate Learning Curves**: Each tool must be learned independently
5. **No Shared State**: Tools don't remember user preferences across invocations

---

## CLI UX Best Practices Review

Based on the [Command Line Interface Guidelines](https://clig.dev/) and research from [Evil Martians](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays), [Lucas F Costa](https://lucasfcosta.com/2022/06/01/ux-patterns-cli-tools.html), and [brandur.org](https://brandur.org/interfaces), here are the key principles and how the current tools measure up:

### 1. Human-First Design

> "Modern CLIs should prioritize human users over machine compatibility"

| Principle               | Current Status     | Recommendation              |
| ----------------------- | ------------------ | --------------------------- |
| Readable default output | Good               | Add more visual structure   |
| Color usage intentional | Good               | Standardize semantic colors |
| Machine output opt-in   | Excellent (--json) | No change needed            |

### 2. Discoverability

> "Discoverable CLIs have comprehensive help texts, provide lots of examples, suggest what command to run next"

| Principle             | Current Status | Recommendation              |
| --------------------- | -------------- | --------------------------- |
| Comprehensive help    | Adequate       | Lead with examples          |
| Suggest next commands | Missing        | Add post-action suggestions |
| Suggest on errors     | Partial        | Enhance all error messages  |
| Learn from GUIs       | Good (lswt)    | Extend to other tools       |

**Specific Gap**: After running `newpr`, the tool should suggest:

```
Next steps:
  cd /path/to/worktree     Navigate to new worktree
  lswt                     View all worktrees
  gh pr view               View PR in browser
```

### 3. Robustness

> "Print something within ~100ms to avoid appearing hung"

| Principle             | Current Status | Recommendation            |
| --------------------- | -------------- | ------------------------- |
| Immediate feedback    | Variable       | Add startup message       |
| Progress for long ops | Inconsistent   | Standardize spinners      |
| Timeout handling      | Basic          | Add configurable timeouts |
| Crash recovery        | Good (hooks)   | Document recovery steps   |

**Specific Gap**: The `newpr` fetch/push operations can take 5-10 seconds with no visual feedback.

### 4. Empathy in Errors

> "Catch expected errors and rewrite them for humans with actionable guidance"

Current error example:

```
Error: GitHub CLI not authenticated. Run: gh auth login
```

Improved error example:

```
Authentication required

GitHub CLI is installed but not logged in.

To fix this, run:
  gh auth login

Then try again with:
  newpr "Your feature description"

Need help? https://cli.github.com/manual/gh_auth_login
```

### 5. Configuration Hierarchy

> "Configuration precedence: flags → env vars → project config → user config → defaults"

| Level          | Current Status       | Recommendation         |
| -------------- | -------------------- | ---------------------- |
| Flags          | Good                 | Document all overrides |
| Env vars       | Partial (DEBUG only) | Add WT\_\* env vars    |
| Project config | Excellent            | No change              |
| User config    | Good (~/.worktreerc) | No change              |
| Smart defaults | Partial              | Enhance detection      |

### 6. Composability

> "Design for integration with other tools through standard mechanisms"

| Mechanism      | Current Status | Recommendation           |
| -------------- | -------------- | ------------------------ |
| stdin/stdout   | Good           | Document piping patterns |
| Exit codes     | Good (0/1)     | Consider nuanced codes   |
| JSON output    | Excellent      | Stable schema guarantee  |
| Env var output | Missing        | Add for shell scripting  |

---

## Competitive Analysis

### Comparison with Similar Tools

#### 1. wtp (Worktree Plus)

**Source**: [DEV.to - wtp](https://dev.to/satococoa/wtp-a-better-git-worktree-cli-tool-4i8l)

| Feature              | wtp                | git-worktree-tools    |
| -------------------- | ------------------ | --------------------- |
| Auto path generation | Yes                | Yes                   |
| Post-create hooks    | Yes (via .wtp.yml) | Yes (via .worktreerc) |
| PR integration       | No                 | Yes (core feature)    |
| Config syncing       | No                 | Yes (wtlink)          |
| Interactive UI       | No                 | Yes (lswt)            |

**Learnings to Apply:**

- wtp's single-command simplicity (`wtp add branch`) is appealing
- Consider adding aliases for common patterns

#### 2. wt (Worktrees Handler)

**Source**: [GitHub - taecontrol/wt](https://github.com/taecontrol/wt)

| Feature                   | wt  | git-worktree-tools           |
| ------------------------- | --- | ---------------------------- |
| Custom init/term commands | Yes | Partial (post-worktree hook) |
| Environment setup         | Yes | Via wtlink                   |
| GitHub integration        | No  | Yes                          |
| TUI                       | No  | Yes                          |

**Learnings to Apply:**

- wt's `.wt` file per-project is similar to `.worktreerc`
- Consider adding `terminate` hooks for cleanup

#### 3. worktree-cli (johnlindquist)

**Source**: [GitHub - johnlindquist/worktree-cli](https://github.com/johnlindquist/worktree-cli)

| Feature                   | worktree-cli | git-worktree-tools |
| ------------------------- | ------------ | ------------------ |
| Fuzzy search              | Yes          | No                 |
| Cursor editor focus       | Yes          | Configurable       |
| PR creation from worktree | Yes          | Yes                |
| Atomic rollback           | Yes          | Partial            |

**Learnings to Apply:**

- **Fuzzy search is a must-have** for repositories with many worktrees
- Atomic operations with rollback should be documented better

#### 4. GitHub CLI (gh)

**Source**: [GitHub CLI Manual](https://cli.github.com/manual/)

| Feature           | gh                 | git-worktree-tools |
| ----------------- | ------------------ | ------------------ |
| Consistent syntax | `gh <noun> <verb>` | Mixed patterns     |
| Alias support     | Yes                | No                 |
| Extension system  | Yes                | No                 |
| Web fallback      | Yes                | No                 |

**Learnings to Apply:**

- `gh` uses consistent `noun verb` pattern: `gh pr create`, `gh repo view`
- Consider: `wt pr create`, `wt list`, `wt link`
- Alias system would allow user customization

---

## Detailed Improvement Recommendations

### Category 1: Unified Command Interface

#### 1.1 Add Master `wt` Command

**Current State**: Six separate commands requiring users to remember each name.

**Proposed Change**: Add a `wt` master command that encompasses all functionality.

```bash
# Current (still works)
newpr "Feature"
lswt
cleanpr

# New unified interface
wt new "Feature"         # Same as newpr
wt list                  # Same as lswt
wt clean                 # Same as cleanpr
wt link                  # Same as wtlink
wt state                 # Same as wtstate
wt config                # Same as wtconfig

# Bonus: natural language variants
wt create pr "Feature"
wt show worktrees
wt remove merged
```

**Implementation**: Create `src/cli/wt.ts` that acts as a router:

```typescript
#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .scriptName('wt')
  .command('new <description>', 'Create new PR with worktree' /* ... */)
  .command('list', 'List worktrees' /* ... */)
  .command('clean', 'Clean merged worktrees' /* ... */)
  .command('link', 'Manage config links' /* ... */)
  .command('state', 'Query git state' /* ... */)
  .command('config', 'Configuration' /* ... */)
  .recommendCommands() // Suggests similar commands on typos
  .strict()
  .help()
  .parse();
```

**Benefits**:

- Single entry point to discover all functionality
- Tab completion works for subcommands
- Consistent with `gh`, `docker`, `npm` patterns
- Original commands remain as aliases

#### 1.2 Context-Aware Default Command

When running `wt` with no arguments in a git repository:

```
$ wt

Welcome to git-worktree-tools!

Current repository: my-app (main branch, clean)

Quick actions:
  wt new "description"    Create new PR with worktree
  wt list                 View 3 worktrees (1 open PR)
  wt clean                Clean 2 merged PRs

Run 'wt --help' for all commands
```

### Category 2: Enhanced Discoverability

#### 2.1 Post-Action Suggestions

Every successful operation should suggest related next steps:

```bash
$ newpr "Add dark mode"

✓ Created PR #42: Add dark mode
✓ Created worktree: ~/projects/my-app.pr42

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next steps:
  cd ~/projects/my-app.pr42    Navigate to worktree
  code .                       Open in VS Code
  wt link                      Sync config files
  gh pr view --web             Open PR in browser
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 2.2 Examples-First Help

Restructure help text to lead with common examples:

```
$ newpr --help

newpr - Create a new PR with a dedicated worktree

EXAMPLES
  newpr "Add user authentication"     Create PR from description
  newpr --pr 123                      Work on existing PR
  newpr --branch feat/login           Create PR for existing branch
  newpr --draft "WIP feature"         Create as draft PR

USAGE
  newpr <description> [options]
  newpr --pr <number> [options]
  newpr --branch <name> [options]

OPTIONS
  --draft, -d        Create as draft PR
  --base, -b         Base branch (default: main)
  --no-hooks         Skip lifecycle hooks
  --json             Output as JSON
  --non-interactive  Run without prompts

SCENARIOS
  newpr handles 10+ git states automatically:
  • Uncommitted changes → prompts to commit, stash, or leave
  • Local commits on main → include or start fresh
  • On feature branch → create PR or switch

  Run 'newpr --scenarios' for detailed scenario list

MORE INFO
  https://github.com/camaradesuk/git-worktree-tools#newpr
```

#### 2.3 Interactive Tutorial Mode

Add a `--tutorial` or `--learn` flag for first-time users:

```bash
$ wt --tutorial

Welcome to git-worktree-tools!

This tutorial will walk you through the basic workflow.
Press Enter to continue, or 'q' to quit at any time.

━━━ Step 1: Understanding Worktrees ━━━

Git worktrees let you work on multiple branches simultaneously
without switching branches or stashing changes.

[Diagram showing main repo + worktrees]

Press Enter to continue...
```

### Category 3: Progress & Feedback

#### 3.1 Standardized Progress Indicators

Create a shared progress system used by all tools:

```typescript
// src/lib/progress.ts
export interface ProgressOptions {
  type: 'spinner' | 'bar' | 'steps';
  message: string;
  total?: number;
}

export function createProgress(opts: ProgressOptions): Progress {
  if (!process.stdout.isTTY) {
    return new SilentProgress(opts);
  }

  switch (opts.type) {
    case 'spinner':
      return new SpinnerProgress(opts);
    case 'bar':
      return new BarProgress(opts);
    case 'steps':
      return new StepsProgress(opts);
  }
}
```

Usage in `newpr`:

```typescript
const progress = createProgress({
  type: 'steps',
  message: 'Creating PR',
  total: 5,
});

progress.update(1, 'Fetching from origin...');
await git.fetch('origin');

progress.update(2, 'Creating branch...');
await git.createBranch(branchName);

progress.update(3, 'Committing changes...');
await git.commit(message);

progress.update(4, 'Pushing to origin...');
await git.push();

progress.update(5, 'Creating pull request...');
const pr = await github.createPr(opts);

progress.complete('PR #42 created!');
```

Visual output:

```
Creating PR
  ✓ Fetching from origin
  ✓ Creating branch
  ✓ Committing changes
  ◐ Pushing to origin...
  ○ Creating pull request
```

#### 3.2 Estimated Time Remaining

For operations that can be timed:

```
Pushing to origin... 45% ━━━━━━━━━━━░░░░░░░░░░ ~12s remaining
```

#### 3.3 Immediate Startup Feedback

Every command should acknowledge invocation within 100ms:

```bash
$ newpr "Add feature"
newpr v1.5.0 • checking prerequisites...
```

### Category 4: Error Handling Improvements

#### 4.1 Error Message Template

Every error should follow this structure:

```
┌─ Error ─────────────────────────────────────────────┐
│ [Short summary of what went wrong]                  │
├─────────────────────────────────────────────────────┤
│ Details:                                            │
│   [Technical details if helpful]                    │
│                                                     │
│ To fix this:                                        │
│   1. [First option to resolve]                      │
│   2. [Alternative option if applicable]             │
│                                                     │
│ More help:                                          │
│   https://github.com/.../docs/errors#ERROR_CODE     │
└─────────────────────────────────────────────────────┘
```

Example:

```
┌─ Error ─────────────────────────────────────────────┐
│ Cannot create branch: uncommitted changes conflict  │
├─────────────────────────────────────────────────────┤
│ Details:                                            │
│   Your changes in 'src/index.ts' would be           │
│   overwritten when switching to origin/main.        │
│                                                     │
│ To fix this:                                        │
│   1. Commit your changes first:                     │
│      git add . && git commit -m "WIP"               │
│   2. Or stash your changes:                         │
│      git stash push                                 │
│   3. Or run with --stash flag:                      │
│      newpr "Feature" --stash                        │
│                                                     │
│ More help:                                          │
│   https://github.com/.../docs/errors#CHECKOUT_FAIL  │
└─────────────────────────────────────────────────────┘
```

#### 4.2 Recovery Mode

Add ability to recover from interrupted operations:

```bash
$ newpr "Feature"
# ... interrupted mid-process ...

$ newpr --recover
Found interrupted operation from 2 minutes ago:
  Action: Creating PR "Feature"
  Completed: branch created, changes committed
  Pending: push to origin, create PR

Options:
  1) Resume from push step
  2) Rollback all changes
  3) Ignore and start fresh

Enter choice [1-3]:
```

Implementation requires storing state to `.git/wt-recovery.json`.

### Category 5: Interactive UX Improvements

#### 5.1 Fuzzy Search for Worktree Selection

In `lswt` interactive mode, add `/` to start searching:

```
my-app worktrees
─────────────────────────────────────────────
  [main]         main                    clean
  [PR #42]       feat/add-auth          OPEN
  [PR #43]       fix/login-bug          OPEN
  [PR #38]       feat/dark-mode         MERGED

Search: auth█
Matches: [PR #42] feat/add-auth

↑/↓ navigate • enter select • / search • q quit
```

Library suggestion: Use `fzf`-style matching with [fuzzysort](https://www.npmjs.com/package/fuzzysort).

#### 5.2 Multi-Select for Batch Operations

In `cleanpr`, allow selecting multiple items at once:

```
Cleanable worktrees:
  [x] PR #38 feat/dark-mode      MERGED
  [ ] PR #35 fix/typo            MERGED
  [x] PR #32 chore/deps          CLOSED
  [ ] PR #29 feat/api-v2         MERGED

Space to toggle • a select all • Enter confirm • q cancel
```

#### 5.3 Preview Mode

Before destructive actions, show what will happen:

```bash
$ cleanpr --all --preview

Preview: Clean all merged/closed PRs
─────────────────────────────────────────────
This will:
  ✓ Remove worktree ~/projects/my-app.pr38
    └─ Delete local branch feat/dark-mode
    └─ Delete remote branch feat/dark-mode

  ✓ Remove worktree ~/projects/my-app.pr32
    └─ Delete local branch chore/deps
    └─ Keep remote branch (already deleted)

Total: 2 worktrees, 2 local branches, 1 remote branch

Proceed? [y/N]
```

#### 5.4 Consistent Prompt Style

Standardize all prompts to use arrow-key navigation:

```typescript
// Before (numbered)
console.log('1) Commit staged changes');
console.log('2) Stash and start fresh');
console.log('3) Cancel');
const choice = await promptChoiceIndex('Select action:', options);

// After (arrow keys)
const choice = await promptSelect({
  message: 'Select action:',
  options: [
    { label: 'Commit staged changes', value: 'commit' },
    { label: 'Stash and start fresh', value: 'stash' },
    { label: 'Cancel', value: 'cancel' },
  ],
});
```

### Category 6: Shell Integration

#### 6.1 Tab Completion

Generate shell completions for bash, zsh, and fish:

```bash
# Installation
wt completions bash > /etc/bash_completion.d/wt
wt completions zsh > ~/.zsh/completions/_wt
wt completions fish > ~/.config/fish/completions/wt.fish
```

Completion should include:

- Subcommands: `wt <tab>` → `new list clean link state config`
- Options: `wt new --<tab>` → `--draft --base --json`
- Dynamic values: `wt --pr <tab>` → list of open PRs
- Worktree paths: `wt link <tab>` → list of worktree directories

#### 6.2 Shell Aliases

Suggest useful aliases in documentation:

```bash
# ~/.bashrc or ~/.zshrc
alias wtn='wt new'
alias wtl='wt list'
alias wtc='wt clean --all'
alias wtcd='cd $(wt list --json | jq -r ".[0].path")'
```

#### 6.3 Integration with Shell Prompt

Provide a function for shell prompts showing current worktree:

```bash
# For bash/zsh
wt_prompt_info() {
  local wt_type=$(wt state --json 2>/dev/null | jq -r '.data.worktreeType // empty')
  case $wt_type in
    pr_worktree) echo " PR" ;;
    main_worktree) echo "" ;;
    *) echo "" ;;
  esac
}

# Usage in PS1
PS1='${USER}@${HOST} $(wt_prompt_info) $ '
```

### Category 7: Configuration Improvements

#### 7.1 Configuration Diff

Show what differs from defaults:

```bash
$ wt config diff

Configuration differences from defaults:
─────────────────────────────────────────────
  baseBranch:      main → develop
  draftPr:         false → true
  branchPrefix:    feat → feature

Defaults in use:
  worktreePattern: {repo}.pr{number}
  worktreeParent:  ..
```

#### 7.2 Config Profiles

Allow switching between configuration profiles:

```json
// .worktreerc
{
  "profiles": {
    "default": {
      "baseBranch": "main",
      "draftPr": false
    },
    "enterprise": {
      "baseBranch": "develop",
      "draftPr": true,
      "hooks": {
        "pre-push": "npm run lint"
      }
    }
  }
}
```

```bash
$ wt new "Feature" --profile enterprise
```

#### 7.3 Environment Variable Overrides

Support environment variables for CI/CD and scripting:

```bash
# Override base branch
WT_BASE_BRANCH=develop newpr "Feature"

# Force non-interactive
WT_NON_INTERACTIVE=1 newpr "Feature"

# Custom worktree parent
WT_WORKTREE_PARENT=/tmp/worktrees newpr "Feature"
```

---

## Tool Integration Opportunities

### 1. IDE/Editor Integration

#### VS Code Extension

Create a VS Code extension that provides:

- Worktree sidebar panel
- Quick switch between worktrees
- PR status in status bar
- Commands in command palette

```typescript
// Extension pseudocode
vscode.commands.registerCommand('wt.newPr', async () => {
  const description = await vscode.window.showInputBox({
    prompt: 'Enter PR description',
  });

  const terminal = vscode.window.createTerminal('newpr');
  terminal.sendText(`newpr "${description}"`);
  terminal.show();
});
```

#### JetBrains Plugin

Similar functionality for IntelliJ, WebStorm, etc.

### 2. Git GUI Integration

#### GitKraken Integration

Provide a script that GitKraken can call:

```bash
# .gitkraken/hooks/create-worktree.sh
#!/bin/bash
newpr --pr $1 --json
```

### 3. AI Assistant Integration

#### Enhanced MCP Server

Current MCP server is basic. Enhance with:

```typescript
// Additional MCP tools
server.tool('suggest_action', async (state: GitState) => {
  const analysis = await analyzeState(state);
  return {
    recommended: analysis.bestAction,
    alternatives: analysis.otherOptions,
    reasoning: analysis.explanation,
  };
});

server.tool('execute_workflow', async (workflow: string) => {
  // Execute predefined workflows
  // "create_feature" → newpr + cd + npm install
  // "cleanup_all" → cleanpr --all + git gc
});
```

#### Claude Code / Cursor Integration

Provide context-aware suggestions:

```typescript
// When user says "I want to work on a new feature"
const state = await wtstate({ json: true });
if (state.data.scenario === 'main_clean_same') {
  suggest("Run: newpr 'Your feature description'");
} else if (state.data.hasChanges) {
  suggest("You have uncommitted changes. Run: newpr 'Feature' to handle them");
}
```

### 4. GitHub Actions Integration

#### Workflow for PR Worktrees

```yaml
# .github/workflows/worktree-test.yml
name: Test in Worktree
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: camaradesuk/worktree-action@v1
        with:
          pr-number: ${{ github.event.pull_request.number }}
          command: npm test
```

### 5. Slack/Teams Notifications

#### Webhook Integration

```json
// .worktreerc
{
  "hooks": {
    "post-pr": {
      "command": "curl -X POST $SLACK_WEBHOOK -d '{\"text\": \"New PR: $WT_PR_URL\"}'",
      "if": "env:SLACK_WEBHOOK"
    }
  }
}
```

### 6. Terminal Multiplexer Integration

#### tmux/screen Session per Worktree

```bash
# When creating worktree, optionally create tmux session
$ wt new "Feature" --tmux

# Creates worktree and runs:
tmux new-session -d -s "pr-42" -c ~/projects/my-app.pr42
tmux send-keys -t "pr-42" "npm install && code ." Enter
```

### 7. Cross-Repository Worktrees

#### Shared Repos Enhancement

Current `sharedRepos` creates symlinks. Enhance to:

```json
// .worktreerc
{
  "sharedRepos": [
    {
      "name": "api-client",
      "path": "../api-client",
      "sync": true, // Create matching worktree
      "branch": "same" // Use same branch name
    }
  ]
}
```

When running `newpr "Feature"` in main repo:

1. Creates `my-app.pr42`
2. Creates `api-client.pr42` with same branch
3. Links them together

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)

| Item                            | Effort | Impact |
| ------------------------------- | ------ | ------ |
| Add post-action suggestions     | Low    | High   |
| Standardize progress spinners   | Low    | Medium |
| Improve error messages          | Medium | High   |
| Add `--dry-run` to all commands | Low    | Medium |

### Phase 2: Unified Experience (2-4 weeks)

| Item                              | Effort | Impact |
| --------------------------------- | ------ | ------ |
| Create `wt` master command        | Medium | High   |
| Standardize prompts to arrow keys | Medium | Medium |
| Add fuzzy search to lswt          | Medium | High   |
| Shell completion scripts          | Medium | High   |

### Phase 3: Advanced Features (4-8 weeks)

| Item                    | Effort | Impact |
| ----------------------- | ------ | ------ |
| VS Code extension       | High   | High   |
| Recovery mode           | High   | Medium |
| Enhanced MCP server     | Medium | Medium |
| Multi-select in cleanpr | Medium | Medium |

### Phase 4: Polish & Integration (Ongoing)

| Item                 | Effort | Impact |
| -------------------- | ------ | ------ |
| Tutorial mode        | Medium | Medium |
| Config profiles      | Medium | Low    |
| Cross-repo worktrees | High   | Medium |
| GitHub Action        | Medium | Low    |

---

## Appendices

### Appendix A: Color Palette Standardization

| Color  | Current Usage           | Recommended Usage           |
| ------ | ----------------------- | --------------------------- |
| Green  | Success, OPEN           | Success, positive actions   |
| Yellow | Warning, MERGED         | Warnings, attention needed  |
| Red    | Error, CLOSED, changes  | Errors, destructive actions |
| Cyan   | Info, prompts, main     | Info, interactive elements  |
| Blue   | Info, MERGED (conflict) | Links, secondary info       |
| Dim    | Secondary info          | Disabled, less important    |

### Appendix B: Keyboard Shortcut Standardization

| Shortcut | Action           | Used In  |
| -------- | ---------------- | -------- |
| `e`      | Open editor      | lswt     |
| `t`      | Open terminal    | lswt     |
| `c`      | Copy path        | lswt     |
| `d`      | Show details     | lswt     |
| `p`      | PR action        | lswt     |
| `l`      | Link configs     | lswt     |
| `r`      | Remove           | lswt     |
| `q`      | Quit             | All      |
| `/`      | Search           | Proposed |
| `a`      | Select all       | Proposed |
| `Space`  | Toggle selection | Proposed |
| `?`      | Help             | All      |
| `Enter`  | Confirm/Select   | All      |
| `Esc`    | Cancel/Back      | All      |

### Appendix C: JSON Output Schema Improvements

Add versioning and metadata:

```typescript
interface CommandResult<T> {
  version: '1.0'; // Schema version
  success: boolean;
  command: string;
  timestamp: string;
  duration: number; // Execution time in ms
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string; // How to fix
  };
  warnings?: string[];
  nextSteps?: Array<{
    // Suggested follow-up commands
    command: string;
    description: string;
  }>;
}
```

### Appendix D: Environment Variables

| Variable             | Description          | Default     |
| -------------------- | -------------------- | ----------- |
| `WT_BASE_BRANCH`     | Override base branch | From config |
| `WT_DRAFT`           | Create PRs as draft  | From config |
| `WT_NON_INTERACTIVE` | Disable prompts      | false       |
| `WT_WORKTREE_PARENT` | Worktree parent dir  | `..`        |
| `WT_BRANCH_PREFIX`   | Branch name prefix   | `feat`      |
| `WT_EDITOR`          | Preferred editor     | `vscode`    |
| `WT_DEBUG`           | Enable debug output  | false       |
| `WT_NO_HOOKS`        | Skip lifecycle hooks | false       |
| `WT_JSON`            | Force JSON output    | false       |

### Appendix E: Resources

- [Command Line Interface Guidelines](https://clig.dev/) - Comprehensive CLI design guide
- [CLI UX Best Practices: Progress Displays](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays) - Evil Martians
- [UX Patterns for CLI Tools](https://lucasfcosta.com/2022/06/01/ux-patterns-cli-tools.html) - Lucas F Costa
- [Learning from Terminals](https://brandur.org/interfaces) - Terminal interface philosophy
- [GitHub CLI Design Guidelines](https://github.com/primer/cli) - GitHub's CLI design system
- [Building CLI Applications with Node.js](https://buttercms.com/blog/building-a-command-line-interface-in-javascript-with-oclif/) - oclif tutorial

---

_This document is a living analysis. It should be updated as improvements are implemented and new patterns emerge._
