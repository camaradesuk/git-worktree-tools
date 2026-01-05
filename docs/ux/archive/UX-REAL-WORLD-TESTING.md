# Git Worktree Tools: Real-World UX Testing Results

> **Date:** January 2026
> **Methodology:** Direct CLI invocation and output capture

This document supplements the [UX Improvement Analysis](./UX-IMPROVEMENT-ANALYSIS.md) with actual CLI output and specific issues identified through hands-on testing.

---

## Table of Contents

1. [Testing Environment](#testing-environment)
2. [lswt Output Analysis](#lswt-output-analysis)
3. [newpr Output Analysis](#newpr-output-analysis)
4. [cleanpr Output Analysis](#cleanpr-output-analysis)
5. [wtlink Output Analysis](#wtlink-output-analysis)
6. [wtstate Output Analysis](#wtstate-output-analysis)
7. [wtconfig Output Analysis](#wtconfig-output-analysis)
8. [Critical UX Issues Identified](#critical-ux-issues-identified)
9. [Recommendations Summary](#recommendations-summary)

---

## Testing Environment

- **Platform**: Linux (WSL2)
- **Node.js**: v24.11.0
- **Package Version**: 1.5.0
- **Repository**: git-worktree-tools (single worktree configuration)

---

## lswt Output Analysis

### Help Text (Good)

```
lswt - List git worktrees with PR status

USAGE
  lswt [options]

OPTIONS
  -s, --status       Include PR status from GitHub (open/merged/closed)
  -j, --json         Output as JSON
  -v, --verbose      Show more details (commit hashes, full paths)
  -i, --interactive  Enable interactive mode (default in TTY)
  --no-interactive   Disable interactive mode
  -h, --help         Show this help message

EXAMPLES
  lswt                  # Interactive mode (default in terminal)
  lswt --no-interactive # List-only mode
  lswt --status         # Include PR status (requires gh cli)
  lswt --json           # Output as JSON for scripting
  lswt | cat            # Automatically uses list mode when piped

INTERACTIVE MODE
  When running in a terminal, lswt enters interactive mode where you can
  select a worktree and perform actions like:
  - Open in editor (VSCode/Cursor)
  - Open terminal at worktree path
  ...

SHORTCUTS (in interactive mode)
  e - Open in editor       t - Open terminal
  p - Open/Create PR       d - Show details
  c - Copy path            r - Remove worktree
  l - Link configs         q - Quit
```

**Strengths:**

- Clear examples section
- Shortcut reference included
- Good use of formatting

**Issues:**

- Interactive mode section truncates list (uses `...`)
- Missing information about what `--status` shows

### Non-Interactive Output (Good)

```
git-worktree-tools worktrees:

  [main] *
    Branch: main
    Path:   .

1 worktrees · 1 with changes
```

**Strengths:**

- Clean, readable format
- Change indicator (`*`) is clear
- Summary line is helpful

**Issues:**

- No timestamp or context about when this was checked
- Relative path `.` could confuse users about actual location

### Verbose Output (Good)

```
git-worktree-tools worktrees:

  [main] *
    Branch: main
    Path:   /home/chris/workspace/git-worktree-tools
    Commit: ba694903bc1dfeb8f0fa2a7b994f64d453694cdf

1 worktrees · 1 with changes
```

**Strengths:**

- Full commit hash shown
- Full path shown

**Issues:**

- No indication of what branch the commit is on
- No indication of remote tracking status

### JSON Output (Excellent)

```json
[
  {
    "path": "/home/chris/workspace/git-worktree-tools",
    "name": "git-worktree-tools",
    "branch": "main",
    "commit": "ba694903bc1dfeb8f0fa2a7b994f64d453694cdf",
    "type": "main",
    "prNumber": null,
    "prState": null,
    "isDraft": null,
    "hasChanges": true
  }
]
```

**Strengths:**

- Consistent structure
- All fields present (even if null)
- Easy to parse

---

## newpr Output Analysis

### Help Text (Good)

```
newpr - Create or setup a PR with a dedicated worktree

Usage:
  newpr "description"           Create new branch + PR + worktree
  newpr --pr <NUMBER>           Setup worktree for existing PR
  newpr --branch <NAME>         Create PR for existing branch + worktree

Options:
  -b, --base BRANCH     Base branch for PR (default: main)
  -i, --install         Install dependencies after setup
  -c, --code            Open editor to the new worktree
  -r, --ready           Create PR as ready for review (default: draft)
  --no-wtlink           Skip wtlink config sync
  --no-hooks            Disable lifecycle hooks (for security)
  -h, --help            Show this help message

AI/Automation Options:
  --json                Output result as JSON for programmatic parsing
  -y, --yes, --non-interactive
                        Skip all interactive prompts, use defaults
  --action ACTION       Pre-specify action for scenario handling
                        (use with --non-interactive)

Actions:
  empty_commit          Create empty initial commit
  commit_staged         Commit staged changes to new branch
  ...

Examples:
  newpr "Add user authentication"
  newpr "Fix login bug" --install --code
  newpr --pr 1234
  newpr --branch feat/my-feature

  # AI/Automation usage
  newpr "Add dark mode" --non-interactive --json
  newpr "Fix bug" --non-interactive --action=commit_staged --json
```

**Strengths:**

- Clear usage patterns
- Action list is comprehensive
- AI/Automation section is helpful

**Issues:**

- Action list is long and overwhelming
- No indication of which actions are most common
- `--draft` flag mentioned in README but help shows `--ready` (confusing default)

### Error Output - Missing Description (Good)

```json
{
  "success": false,
  "command": "newpr",
  "timestamp": "2026-01-04T05:47:09.066Z",
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "Description required. Usage: newpr \"feature description\""
  }
}
```

**Strengths:**

- Clear error code
- Helpful suggestion in message
- Proper JSON structure

### Error Output - Invalid PR Number (Good)

```json
{
  "success": false,
  "command": "newpr",
  "timestamp": "2026-01-04T05:47:09.278Z",
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "PR number must be numeric"
  }
}
```

**Strengths:**

- Clear and concise

**Issues:**

- Could suggest correct format: `newpr --pr 123`

### Error Output - Hook Failure (Issue Identified)

```json
{
  "success": false,
  "command": "newpr",
  "timestamp": "2026-01-04T05:47:44.523Z",
  "error": {
    "code": "UNKNOWN_ERROR",
    "message": "Git command failed: git commit -m feat: test feature\n\n🤖 Created with newpr\nsrc/e2e/helpers/pty-wrapper.ts(92,30): error TS2307: Cannot find module 'node-pty'...\nhusky - pre-commit script failed (code 2)\n"
  }
}
```

**Critical Issues:**

1. **Error code is `UNKNOWN_ERROR`** - should be `HOOK_FAILED` or `PRE_COMMIT_FAILED`
2. **Raw TypeScript compilation errors exposed** - user doesn't need to see this
3. **No recovery suggestion** - should suggest `--no-hooks` or fixing the issue
4. **Multiline message in JSON** - makes parsing harder

**Recommended Fix:**

```json
{
  "success": false,
  "command": "newpr",
  "timestamp": "2026-01-04T05:47:44.523Z",
  "error": {
    "code": "PRE_COMMIT_HOOK_FAILED",
    "message": "Pre-commit hook failed with exit code 2",
    "details": {
      "hook": "pre-commit",
      "exitCode": 2,
      "source": "husky"
    },
    "suggestion": "Fix the issues and try again, or use --no-hooks to skip git hooks"
  }
}
```

---

## cleanpr Output Analysis

### Help Text (Good)

```
cleanpr - Clean up PR worktrees after merge/close

USAGE
  cleanpr                         Interactive cleanup of merged/closed PRs
  cleanpr <PR_NUMBER>             Clean specific PR worktree
  cleanpr --all                   Clean all merged/closed PRs automatically
  cleanpr <PR_NUMBER> [options]   Clean with options

OPTIONS
  -r, --remote    Also delete the remote branch
  -f, --force     Force removal even if worktree has uncommitted changes
  -a, --all       Clean all merged/closed PR worktrees (non-interactive)
  -h, --help      Show this help message

AI/AUTOMATION OPTIONS
  --json          Output result as JSON for programmatic parsing
  -n, --dry-run   Preview what would be cleaned without making changes
```

**Strengths:**

- Clear separation of options
- Dry-run option is prominent

### Dry Run Output (Good)

```json
{
  "success": true,
  "command": "cleanpr",
  "timestamp": "2026-01-04T05:46:44.572Z",
  "data": {
    "cleaned": [],
    "skipped": [],
    "totalCleaned": 0,
    "totalSkipped": 0
  }
}
```

**Issues:**

- Empty arrays provide no feedback
- For dry-run with no worktrees, could say "No PR worktrees found"

### Error - PR Not Found (Good)

```json
{
  "success": false,
  "command": "cleanpr",
  "timestamp": "2026-01-04T05:47:14.190Z",
  "error": {
    "code": "PR_NOT_FOUND",
    "message": "No worktree found for PR #999"
  }
}
```

**Issues:**

- Could include expected path: "Expected at: ~/projects/repo.pr999"
- Could suggest checking `lswt` for available worktrees

---

## wtlink Output Analysis

### Help Text (Adequate)

```
wtlink [command] [options]

Commands:
  wtlink manage                       Discover and manage the worktree config ma
                                      nifest
  wtlink link [source] [destination]  Link config files from a source worktree t
                                      o a destination
  wtlink validate [source]            Validate that manifest entries exist and a
                                      re safely ignored

Options:
      --version        Show version number                             [boolean]
      --manifest-file  The name of the manifest file.
                                                 [string] [default: ".wtlinkrc"]
      --json           Output result as JSON for programmatic parsing (AI/automa
                       tion)                          [boolean] [default: false]
  -h, --help           Show help                                       [boolean]
```

**Issues:**

- Text wrapping breaks description mid-word ("ma\nnifest")
- No examples shown at top level
- No quick start for common use case

### Manage Subcommand Help (Good)

```
wtlink manage

Options:
  -n, --non-interactive  Run in non-interactive mode, adding new files as commen
                         ted out                      [boolean] [default: false]
  -c, --clean            Run in clean mode, removing stale entries automatically
                                                      [boolean] [default: false]
  -d, --dry-run          Show what changes would be made without writing any fil
                         es                           [boolean] [default: false]
  -b, --backup           Create a backup of the manifest before updating
                                                      [boolean] [default: false]
```

**Issues:**

- Same text wrapping issue
- No description of what "manage" does at the top

### Dry Run Output (Good but Overwhelming)

```
Dry run mode: Adding new files as commented out.

[DRY RUN] The following changes would be made to the manifest:
- Backup existing manifest to /home/chris/workspace/git-worktree-tools/.wtlinkrc.bak
- Write the following content to .wtlinkrc:
.claude/settings.local.json
# .husky/_/.gitignore
# .husky/_/applypatch-msg
# .husky/_/commit-msg
... [hundreds of files]
```

**Critical Issues:**

1. **Output is extremely long** - lists every ignored file
2. **No pagination or summary** - scrolls past terminal history
3. **Mixes important files with build artifacts** - `.husky/` files mixed with `dist/` files
4. **No categorization** - could group by directory or type

**Recommended Fix:**

```
[DRY RUN] The following changes would be made:

Summary:
  1 active entry (will be linked)
  432 new entries found (would be added as commented)

Categories:
  .husky/         19 files
  coverage/       44 files
  dist/           350 files
  node_modules/   19 files (binaries only)

To see full list, use --verbose flag
```

### Link Error (Critical Issue)

```
Error: Unable to detect an alternate worktree to use as the source. Provide the source path explicitly.
    at detectSourceWorktree (file:///...link-configs.js:88:15)
    ...
```

**Critical Issues:**

1. **Raw Error object thrown** - not a user-friendly message
2. **Stack trace exposed** - user doesn't need this
3. **No suggestion for resolution** - should say "Usage: wtlink link <source> <dest>"
4. **No explanation** - should explain what a "source worktree" is

**Recommended Fix:**

```
Unable to detect source worktree automatically.

You're running from the main worktree with only one worktree available.
To link config files, you need at least two worktrees.

To fix:
  1. Create a PR worktree first: newpr "My feature"
  2. Then link configs: wtlink link . ../my-repo.pr42

Or specify both paths explicitly:
  wtlink link /path/to/source /path/to/destination
```

### Validate Output (Good)

```
Manifest .wtlinkrc is valid. Checked 1 entries.
```

**Strengths:**

- Clear and concise
- Shows count of entries

**Issues:**

- No detail about what was checked
- Could benefit from `--verbose` mode showing each entry

---

## wtstate Output Analysis

### Human-Readable Output (Excellent)

```
Scenario: main_unstaged_same
  On main branch, same as origin/main, unstaged changes only

Branch: main
Base: main
Worktree type: main_worktree

Changes:
  Staged: no
  Unstaged: yes
  Local commits: 0

Available actions:
  commit_all: Stage all and commit to the new PR branch (recommended)
  empty_commit: Leave changes here and continue with empty initial commit
  stash_and_empty: Stash changes (will restore after)

Recommended: commit_all
```

**Strengths:**

- Excellent structure
- Clear labels
- Recommended action highlighted
- Scenario explanation is helpful

**Issues:**

- Could use color coding for visual hierarchy
- "Worktree type" could be explained

### Verbose Mode (Good)

```
Scenario: main_unstaged_same
  On main branch, same as origin/main, unstaged changes only

...

Unstaged files:
  docs/UX-IMPROVEMENT-ANALYSIS.md

Available actions:
  ...
```

**Strengths:**

- Shows actual file names
- Good for debugging

### JSON Output (Excellent)

```json
{
  "success": true,
  "command": "wtstate",
  "timestamp": "2026-01-04T05:46:34.181Z",
  "data": {
    "scenario": "main_unstaged_same",
    "scenarioDescription": "On main branch, same as origin/main, unstaged changes only",
    "currentBranch": "main",
    "baseBranch": "main",
    "worktreeType": "main_worktree",
    "hasChanges": true,
    "hasStagedChanges": false,
    "hasUnstagedChanges": true,
    "localCommits": [],
    "stagedFiles": [],
    "unstagedFiles": [],
    "availableActions": [
      {
        "key": "commit_all",
        "label": "Stage all and commit to the new PR branch"
      },
      ...
    ],
    "recommendedAction": "commit_all"
  }
}
```

**This is the best output in the entire suite. Other tools should follow this pattern.**

---

## wtconfig Output Analysis

### Help Text (Issue Identified)

```
[INFO] wtconfig - Configuration management for git-worktree-tools

[WARN] Usage:
  wtconfig init             Run interactive setup wizard
  wtconfig show             Show current configuration
  ...

[WARN] Configuration Locations:
  Global:     ~/.worktreerc (applies to all repos)
  Repository: .worktreerc or .worktreerc.json (repo-specific)

[WARN] Examples:
  ...
```

**Critical Issues:**

1. **`[INFO]` and `[WARN]` prefixes in help text** - makes no sense
2. **"WARN" for examples?** - very confusing
3. **Inconsistent with other tools** - lswt and cleanpr don't use prefixes

**Recommended Fix:**
Remove all log-level prefixes from help output. Help text is informational by nature.

### Show Output (Adequate)

```
[INFO] Current Configuration

Source: /home/chris/workspace/git-worktree-tools/.worktreerc

{
  baseBranch: "main" (default)
  draftPr: false (default)
  branchPrefix: "feat" (default)
  worktreePattern: "{repo}.pr{number}" (default)
  worktreeParent: ".." (default)
  preferredEditor: "vscode" (default)
  [OK] syncPatterns: ["node_modules"]
}
```

**Issues:**

1. **`[INFO]` prefix** - unnecessary
2. **`[OK]` inline** - what does this mean?
3. **Mixed format** - some values show (default), one shows [OK]
4. **Not valid JSON** - can't be parsed

### Validate Output (Good)

```
[INFO] Validating: /home/chris/workspace/git-worktree-tools/.worktreerc
[OK] Configuration is valid.
```

**Issues:**

- Prefix inconsistency with other tools
- Could show what was validated

---

## Critical UX Issues Identified

### Priority 1: Critical Bugs

| Issue                  | Tool     | Description                                                 | Severity |
| ---------------------- | -------- | ----------------------------------------------------------- | -------- |
| Raw error stack traces | wtlink   | `wtlink link` throws raw Error with stack trace             | Critical |
| Wrong error code       | newpr    | Hook failures show `UNKNOWN_ERROR` instead of `HOOK_FAILED` | High     |
| Log prefixes in help   | wtconfig | `[WARN]` and `[INFO]` in help text                          | High     |

### Priority 2: Consistency Issues

| Issue                  | Tool     | Description                                     | Severity |
| ---------------------- | -------- | ----------------------------------------------- | -------- |
| Help text formatting   | wtlink   | Text wraps mid-word                             | Medium   |
| Output format mismatch | wtconfig | Show output isn't valid JSON or standard format | Medium   |
| Error suggestions      | all      | Not all errors suggest how to fix               | Medium   |

### Priority 3: UX Enhancements

| Issue               | Tool          | Description                                     | Severity |
| ------------------- | ------------- | ----------------------------------------------- | -------- |
| Overwhelming output | wtlink manage | Lists 400+ files with no pagination             | Medium   |
| Missing next steps  | all           | After success, no suggestion of what to do next | Low      |
| Relative paths      | lswt          | `.` as path can confuse                         | Low      |

---

## Recommendations Summary

### Immediate Fixes (Do First)

1. **Fix wtlink error handling** - Catch errors and format them nicely
2. **Fix wtconfig log prefixes** - Remove `[INFO]`, `[WARN]`, `[OK]` from output
3. **Add `HOOK_FAILED` error code** - Replace `UNKNOWN_ERROR` for hook failures

### Short-Term Improvements

4. **Add output pagination** to `wtlink manage` - Summarize, don't list everything
5. **Add suggestions to all errors** - "To fix this, try..."
6. **Fix help text wrapping** - Configure yargs properly for terminal width

### Medium-Term Enhancements

7. **Add `--suggest-next` flag** - Show next commands after success
8. **Standardize output format** - All tools should use same patterns
9. **Add colors to wtstate** - Visual hierarchy for human output

---

## Appendix: Raw Output Captures

All outputs captured on 2026-01-04 from git-worktree-tools v1.5.0.

Commands tested:

- `node dist/cli/lswt.js --help`
- `node dist/cli/lswt.js --no-interactive`
- `node dist/cli/lswt.js --json`
- `node dist/cli/lswt.js --verbose --no-interactive`
- `node dist/cli/newpr.js --help`
- `node dist/cli/newpr.js --non-interactive --json` (no args - error)
- `node dist/cli/newpr.js --pr abc --json` (invalid - error)
- `node dist/cli/cleanpr.js --help`
- `node dist/cli/cleanpr.js --dry-run --all --json`
- `node dist/cli/cleanpr.js 999 --json` (not found - error)
- `node dist/cli/wtlink.js --help`
- `node dist/cli/wtlink.js manage --help`
- `node dist/cli/wtlink.js link --help`
- `node dist/cli/wtlink.js manage --non-interactive --dry-run`
- `node dist/cli/wtlink.js validate`
- `node dist/cli/wtlink.js link --dry-run` (error)
- `node dist/cli/wtstate.js`
- `node dist/cli/wtstate.js --json`
- `node dist/cli/wtstate.js --verbose`
- `node dist/cli/wtconfig.js --help`
- `node dist/cli/wtconfig.js show`
- `node dist/cli/wtconfig.js validate`
- `cd /tmp && node /path/to/lswt.js` (not in git repo - error)
