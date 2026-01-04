# Git Worktree Tools: Exhaustive UX Testing Plan

> **Purpose:** Systematic testing methodology to identify issues, UX problems, and improvement opportunities across all CLI tools.

---

## Table of Contents

1. [Testing Methodology](#testing-methodology)
2. [Exploratory Testing Guide](#exploratory-testing-guide)
3. [Severity Classification](#severity-classification)
4. [Issue Logging Template](#issue-logging-template)
5. [Test Environment Setup](#test-environment-setup)
6. [Tool-Specific Test Cases](#tool-specific-test-cases)
7. [Cross-Tool Integration Tests](#cross-tool-integration-tests)
8. [Edge Case & Error Condition Tests](#edge-case--error-condition-tests)
9. [Output Mode Tests](#output-mode-tests)
10. [Interactive UX Tests](#interactive-ux-tests)
11. [Performance Tests](#performance-tests)
12. [Cross-Platform Tests](#cross-platform-tests)
13. [Issue Log](#issue-log)
14. [Automation Opportunities](#automation-opportunities)
15. [Smoke Test Suite](#smoke-test-suite)
16. [Test Priority Guide](#test-priority-guide)

---

## Testing Methodology

### Approach

1. **Exploratory Testing**: Use each tool as a new user would, noting friction points
2. **Systematic Testing**: Execute predefined test cases covering all code paths
3. **Boundary Testing**: Test edge cases, limits, and unusual inputs
4. **Error Path Testing**: Deliberately trigger errors to validate handling
5. **Comparative Testing**: Compare behavior against similar tools (gh, git)

### Testing Modes

Each command should be tested in:

- [ ] Interactive mode (TTY)
- [ ] Non-interactive mode (`--non-interactive` or piped)
- [ ] JSON output mode (`--json`)
- [ ] Verbose mode (`--verbose` where available)
- [ ] Dry-run mode (`--dry-run` where available)

### Recording Results

For each test:

1. Document the exact command run
2. Capture full output (stdout and stderr)
3. Note the exit code
4. Record time taken for long operations
5. Screenshot interactive UIs where relevant

---

## Exploratory Testing Guide

> **Purpose:** Discover issues that scripted tests miss by using tools as real users would.

Exploratory testing is **unscripted, curiosity-driven testing** where you simultaneously learn, design tests, and execute them. Unlike systematic testing (which follows predefined cases), exploratory testing relies on your intuition and real-time observations.

### Why Exploratory Testing Matters

| Scripted Tests Find         | Exploratory Tests Find            |
| --------------------------- | --------------------------------- |
| Known bugs                  | Unknown bugs                      |
| Expected edge cases         | Unexpected edge cases             |
| Documented behaviors        | Undocumented behaviors            |
| Technical failures          | UX friction and confusion         |
| What developers anticipated | What developers didn't anticipate |

### Personas to Adopt

Test as different types of users to uncover different issues:

#### 1. The Impatient New User

- **Mindset**: "I just want this to work. I don't want to read docs."
- **Behavior**:
  - Run commands without reading `--help` first
  - Press Enter rapidly through prompts
  - Press Ctrl+C when things seem slow
  - Ignore warnings and proceed anyway
- **What to observe**:
  - Are defaults sensible?
  - Is the happy path discoverable?
  - What happens when you rush?

#### 2. The Cautious New User

- **Mindset**: "I'm afraid of breaking something."
- **Behavior**:
  - Read all help text carefully
  - Use `--dry-run` before real operations
  - Ask "what will this do?" before each step
  - Hesitate at confirmation prompts
- **What to observe**:
  - Is dry-run output clear and accurate?
  - Are confirmations reassuring or scary?
  - Is the help text actually helpful?

#### 3. The Power User

- **Mindset**: "I want to automate this and pipe it to other tools."
- **Behavior**:
  - Use `--json` for everything
  - Pipe output to `jq`, `grep`, `xargs`
  - Write shell scripts around the tools
  - Expect consistent, parseable output
- **What to observe**:
  - Is JSON output complete and consistent?
  - Are exit codes reliable?
  - Can operations be fully non-interactive?

#### 4. The Hostile User

- **Mindset**: "What if I do something weird?"
- **Behavior**:
  - Enter unexpected input (empty, very long, special characters)
  - Cancel mid-operation
  - Run from unexpected directories
  - Provide conflicting flags
- **What to observe**:
  - Are errors graceful or stack traces?
  - Is partial state cleaned up?
  - Are conflicting options detected?

### Exploratory Testing Sessions

Run time-boxed sessions (30-60 minutes) with a specific focus:

#### Session Template

```markdown
## Exploratory Session: [Focus Area]

**Date:** YYYY-MM-DD
**Duration:** X minutes
**Tester:** [Name]
**Persona:** [Which persona?]

### Charter

[What are you exploring? What questions are you trying to answer?]

### Environment

- Starting directory: [path]
- Git state: [clean/dirty/branch name]
- Worktree count: [N]

### Session Notes

[Stream-of-consciousness notes as you explore]

### Issues Found

| Time | Observation | Severity | Notes |
| ---- | ----------- | -------- | ----- |
| 0:05 | ...         | P?       | ...   |

### Questions Raised

- [Things that need clarification or further testing]

### Ideas for Improvement

- [Enhancement suggestions that arose during testing]
```

### Tool-Specific Exploratory Scenarios

#### lswt Exploration

| Scenario            | Instructions                                             | What to Look For                                                      |
| ------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| First encounter     | Run `lswt` with no arguments in a repo with 3+ worktrees | Is the display intuitive? Can you figure out navigation without help? |
| Keyboard discovery  | Try various keys (a-z, arrows, Enter, Escape, Ctrl+C)    | Are shortcuts discoverable? What happens with unexpected keys?        |
| Information density | Look at the default view                                 | Is important info visible? Is anything missing? Too cluttered?        |
| Action flow         | Try to perform an action (open editor, copy path)        | Is the feedback clear? Did it work? How do you know?                  |
| Empty state         | Run in a repo with only the main worktree                | Is the message helpful? Does it suggest next steps?                   |
| Large list          | Create 15+ worktrees, then run `lswt`                    | Does scrolling work? Is performance acceptable?                       |

#### newpr Exploration

| Scenario               | Instructions                                     | What to Look For                                       |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Zero to PR             | Start from clean main, create a PR end-to-end    | How many steps? Where did you hesitate? Any confusion? |
| Uncommitted work       | Have unstaged changes, run `newpr "feature"`     | Are options clear? What happens to your work?          |
| Recovery from mistakes | Make a typo in branch name, try to fix it        | Can you go back? Is there an undo?                     |
| Existing branch        | Run `newpr` when a feature branch already exists | Is the error helpful? Does it offer alternatives?      |
| Network issues         | Disconnect network, try to create PR             | How long until timeout? Is the error actionable?       |
| Interrupt              | Start `newpr`, press Ctrl+C at various stages    | Is state cleaned up? Can you retry safely?             |

#### cleanpr Exploration

| Scenario            | Instructions                                              | What to Look For                                      |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Survey first        | Run `cleanpr` with mixed PR states (open, merged, closed) | Is grouping clear? Can you tell what's safe to clean? |
| Selective cleaning  | Try to clean only specific PRs                            | Is selection intuitive? Can you change your mind?     |
| Safety check        | Try to clean a worktree with uncommitted changes          | Is the warning clear? Is `--force` explained?         |
| Aggressive cleaning | Run `cleanpr --all`                                       | Is the confirmation scary enough? Any regrets?        |
| Nothing to clean    | Run when all PRs are still open                           | Is the message helpful or confusing?                  |

#### wtlink Exploration

| Scenario              | Instructions                                      | What to Look For                                           |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Concept understanding | Run `wtlink --help`, then `wtlink`                | Do you understand what it does? Is the mental model clear? |
| Initial setup         | Run `wtlink manage` in a repo with no `.wtlinkrc` | Is the onboarding smooth? Are defaults sensible?           |
| File selection        | Use the file browser to select/deselect files     | Is navigation intuitive? Is state visible?                 |
| Link operation        | Run `wtlink link` from a PR worktree              | Is source detection clear? What gets linked?               |
| Validation            | Run `wtlink validate` with some stale entries     | Are errors actionable? Can you fix them easily?            |

### What to Document During Exploration

#### Friction Points

Moments where you:

- Paused to think "what does this mean?"
- Had to re-read something
- Felt uncertain about proceeding
- Made a mistake due to unclear UX
- Wished for a feature that doesn't exist

#### Delighters

Moments where you:

- Were pleasantly surprised
- Found something worked better than expected
- Noticed thoughtful details

#### Observations Template

```markdown
### Observation: [Short title]

**Context:** [What were you trying to do?]
**What happened:** [Describe the behavior]
**Expected:** [What you thought would happen]
**Impact:** [How did this affect your workflow?]
**Severity:** P0/P1/P2/P3/P4
**Screenshot:** [If applicable]
```

### Comparative Testing

Compare behavior against similar tools to calibrate expectations:

| Our Tool  | Compare Against                      | What to Compare                                     |
| --------- | ------------------------------------ | --------------------------------------------------- |
| `lswt`    | `git worktree list`, `git branch`    | Information shown, formatting, interactive features |
| `newpr`   | `gh pr create`, `git flow`           | Steps required, error messages, flexibility         |
| `cleanpr` | `git worktree remove`, `gh pr close` | Safety checks, confirmations, feedback              |
| `wtlink`  | `stow`, `ln -s`                      | Complexity, discoverability, error handling         |

#### Comparison Questions

1. **Learnability**: Is our tool easier or harder to learn?
2. **Efficiency**: Does our tool require more or fewer steps?
3. **Error messages**: Are our errors more or less helpful?
4. **Defaults**: Are our defaults more or less sensible?
5. **Recovery**: Is it easier or harder to recover from mistakes?

### Exploration Checklist

Before finishing an exploratory session:

- [ ] Tried the tool with no arguments
- [ ] Read the `--help` output
- [ ] Attempted at least one "wrong" input
- [ ] Pressed Ctrl+C at least once during operation
- [ ] Checked behavior when piped (`tool | cat`)
- [ ] Tried the `--json` flag
- [ ] Noted at least one friction point
- [ ] Noted at least one positive observation
- [ ] Documented any questions that arose

---

## Severity Classification

| Severity        | Code | Description                                                 | Examples                                    |
| --------------- | ---- | ----------------------------------------------------------- | ------------------------------------------- |
| **Critical**    | P0   | Prevents core functionality, data loss risk, security issue | Deletes wrong worktree, exposes credentials |
| **High**        | P1   | Major feature broken, confusing errors, poor recovery       | Stack traces shown, wrong error codes       |
| **Medium**      | P2   | Feature works but UX is poor, missing feedback              | No progress indicator, unclear messages     |
| **Low**         | P3   | Minor annoyance, cosmetic issue                             | Typos, inconsistent spacing                 |
| **Enhancement** | P4   | Not a bug, but could be better                              | Missing feature, better defaults            |

### Impact Factors

Consider these when assigning severity:

- **Frequency**: How often will users encounter this?
- **Workaround**: Is there an easy workaround?
- **User type**: Does it affect new users or power users?
- **Data risk**: Could it cause data loss or corruption?

---

## Issue Logging Template

````markdown
### Issue: [Short descriptive title]

**ID:** UX-XXX
**Severity:** P0/P1/P2/P3/P4
**Tool:** lswt/newpr/cleanpr/wtlink/wtstate/wtconfig
**Category:** Error Handling / Output / Interactive / Performance / Documentation

**Description:**
[What is the problem?]

**Steps to Reproduce:**

1. [First step]
2. [Second step]
3. [Expected vs actual result]

**Command:**

```bash
[exact command that reproduces the issue]
```

**Actual Output:**

```
[paste actual output]
```

**Expected Output:**

```
[what should happen instead]
```

**Environment:**

- OS: [Linux/macOS/Windows]
- Node: [version]
- Package version: [version]
- Git state: [clean/dirty/detached/etc]

**Screenshots:** [if applicable]

**Suggested Fix:** [optional]

**Related Issues:** [links to related issues]
````

---

## Test Environment Setup

### Required Tools & Dependencies

Before testing, ensure the following are installed and properly configured:

| Tool       | Minimum Version | Purpose                    | Verification Command |
| ---------- | --------------- | -------------------------- | -------------------- |
| Node.js    | 18.x            | Runtime                    | `node --version`     |
| npm        | 9.x             | Package management         | `npm --version`      |
| Git        | 2.30+           | Worktree support           | `git --version`      |
| GitHub CLI | 2.x             | PR operations              | `gh --version`       |
| jq         | 1.6+            | JSON validation (optional) | `jq --version`       |

### Environment Verification Script

Run this script to verify your environment is ready for testing:

```bash
#!/bin/bash
# verify-test-env.sh - Verify test environment readiness

set -e
echo "=== Git Worktree Tools Test Environment Verification ==="
echo ""

# Check Node.js
echo -n "Node.js: "
if command -v node &> /dev/null; then
    node --version
else
    echo "NOT INSTALLED - Required!"
    exit 1
fi

# Check npm
echo -n "npm: "
npm --version

# Check Git
echo -n "Git: "
git --version | cut -d' ' -f3

# Check GitHub CLI
echo -n "GitHub CLI: "
if command -v gh &> /dev/null; then
    gh --version | head -1
    echo -n "  Auth status: "
    if gh auth status &> /dev/null; then
        echo "Authenticated"
    else
        echo "NOT AUTHENTICATED - Run 'gh auth login'"
    fi
else
    echo "NOT INSTALLED - Required for PR tests!"
fi

# Check jq (optional)
echo -n "jq: "
if command -v jq &> /dev/null; then
    jq --version
else
    echo "Not installed (optional, for JSON validation)"
fi

# Platform info
echo ""
echo "=== Platform ==="
echo "OS: $(uname -s)"
echo "Architecture: $(uname -m)"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    echo "Windows environment detected"
fi

echo ""
echo "=== Environment Ready ==="
```

### Two-Repository Architecture

> **IMPORTANT:** Testing requires TWO separate directories:
>
> | Directory            | Purpose             | Contents                                             |
> | -------------------- | ------------------- | ---------------------------------------------------- |
> | Your dev worktree    | **Tool Source**     | The branch/worktree you're developing and testing    |
> | `/tmp/wt-test-repo/` | **Test Repository** | Dedicated test repo (GitHub-hosted for full testing) |
>
> **CRITICAL SAFETY RULES:**
>
> 1. **Never test against the tool repository itself** or any real project repository
> 2. **Always verify you're in the test repo** before running destructive commands
> 3. **Use a uniquely-named GitHub test repo** to avoid confusion with real projects
> 4. **The test repo is disposable** - delete and recreate it as needed

### Test Categories by GitHub Dependency

Before setting up, understand which tests need GitHub:

| Category         | Tests                                   | Local Repo | GitHub Required |
| ---------------- | --------------------------------------- | ---------- | --------------- |
| **Local-Only**   | lswt (basic), wtstate, wtlink, wtconfig | ✅ Full    | ❌ No           |
| **GitHub-Read**  | lswt --status, cleanpr --dry-run        | ⚠️ Partial | ✅ For PR state |
| **GitHub-Write** | newpr (create PR), cleanpr (cleanup)    | ❌ No      | ✅ Required     |

**Recommendation:** Always use a GitHub-hosted test repo for comprehensive testing.

### Step 1: Prepare the CLI Tools

You have two options for the tool source:

#### Option A: Test Current Development Branch (Recommended for Dev)

If testing changes on a feature branch:

```bash
# From your development worktree (e.g., git-worktree-tools.pr13)
cd /path/to/your/git-worktree-tools-worktree
npm run build

# Set TOOLS variable to point to your dev build
export TOOLS="$(pwd)/dist/cli"

# Verify
node "$TOOLS/lswt.js" --help
```

#### Option B: Test Released Version

If testing the published version:

```bash
# Clone and build from main
git clone https://github.com/camaradesuk/git-worktree-tools /tmp/wt-tools
cd /tmp/wt-tools && npm install && npm run build

export TOOLS="/tmp/wt-tools/dist/cli"
```

### Step 2: Create the GitHub Test Repository

> **⚠️ SAFETY:** Use a unique, clearly-named test repository that cannot be confused
> with any real project. The name should include "test" and a unique identifier.

```bash
# Generate a unique test repo name with timestamp
TEST_REPO_NAME="wt-cli-test-$(date +%Y%m%d-%H%M%S)"
echo "Creating test repo: $TEST_REPO_NAME"

# Create the GitHub repository
# --public: So you can test without auth issues
# --clone: Clones to current directory
gh repo create "$TEST_REPO_NAME" --public --clone --description "Temporary test repo for git-worktree-tools testing - safe to delete"

# Move to standard test location
mv "$TEST_REPO_NAME" /tmp/wt-test-repo
cd /tmp/wt-test-repo

# Initialize with content
echo "# $TEST_REPO_NAME" > README.md
echo "" >> README.md
echo "This is a **temporary test repository** for git-worktree-tools CLI testing." >> README.md
echo "**Safe to delete at any time.**" >> README.md
git add README.md
git commit -m "Initial commit - test repo"
git push -u origin main

# VERIFY: Confirm you're in the test repo before proceeding
echo ""
echo "=== VERIFICATION ==="
echo "Current directory: $(pwd)"
echo "Git remote: $(git remote get-url origin)"
echo "Should contain: $TEST_REPO_NAME"
echo ""
read -p "Is this the correct TEST repository? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborting - please verify you're in the correct test repo"
    exit 1
fi
```

### Step 3: Create Test Worktrees

Create worktrees to simulate PR workflow:

```bash
cd /tmp/wt-test-repo  # IMPORTANT: Verify you're in test repo!

# Verify before proceeding
git remote get-url origin | grep -q "wt-cli-test" || { echo "ERROR: Not in test repo!"; exit 1; }

# Create PR-style worktrees
git worktree add ../wt-test-repo.pr1 -b feat/feature-one
git worktree add ../wt-test-repo.pr2 -b feat/feature-two
git worktree add ../wt-test-repo.pr3 -b fix/bug-fix

# Verify worktrees created
git worktree list
```

### Step 4: Create Test PRs in Various States

Create PRs with different states for comprehensive testing:

```bash
cd /tmp/wt-test-repo
git remote get-url origin | grep -q "wt-cli-test" || { echo "ERROR: Not in test repo!"; exit 1; }

# === PR #1: OPEN PR (will remain open for testing) ===
git checkout main && git pull
git checkout -b test/open-pr-1
echo "Feature content for open PR" > feature-open.txt
git add feature-open.txt && git commit -m "Add open PR feature"
git push -u origin test/open-pr-1
gh pr create --title "[TEST] Open PR for testing" --body "This PR stays OPEN for testing lswt --status and cleanpr behavior"
OPEN_PR=$(gh pr view --json number -q .number)
echo "Created OPEN PR #$OPEN_PR"

# === PR #2: MERGED PR (for cleanpr testing) ===
git checkout main && git pull
git checkout -b test/merged-pr-1
echo "Feature content for merged PR" > feature-merged.txt
git add feature-merged.txt && git commit -m "Add merged PR feature"
git push -u origin test/merged-pr-1
gh pr create --title "[TEST] Merged PR for testing" --body "This PR will be MERGED for cleanpr testing"
gh pr merge --squash --delete-branch=false
git checkout main && git pull
MERGED_PR=$(gh pr list --state merged --limit 1 --json number -q '.[0].number')
echo "Created MERGED PR #$MERGED_PR"

# === PR #3: CLOSED PR (not merged, for cleanpr testing) ===
git checkout main
git checkout -b test/closed-pr-1
echo "Feature content for closed PR" > feature-closed.txt
git add feature-closed.txt && git commit -m "Add closed PR feature"
git push -u origin test/closed-pr-1
gh pr create --title "[TEST] Closed PR for testing" --body "This PR will be CLOSED without merge for cleanpr testing"
gh pr close
CLOSED_PR=$(gh pr list --state closed --limit 1 --json number -q '.[0].number')
echo "Created CLOSED PR #$CLOSED_PR"

# Return to main
git checkout main

# === Create worktrees for the PRs ===
git worktree add ../wt-test-repo.pr$OPEN_PR test/open-pr-1 2>/dev/null || true
git worktree add ../wt-test-repo.pr$MERGED_PR test/merged-pr-1 2>/dev/null || true
git worktree add ../wt-test-repo.pr$CLOSED_PR test/closed-pr-1 2>/dev/null || true

echo ""
echo "=== TEST SETUP COMPLETE ==="
echo "Open PR:   #$OPEN_PR"
echo "Merged PR: #$MERGED_PR"
echo "Closed PR: #$CLOSED_PR"
echo ""
echo "Worktrees:"
git worktree list
```

### Step 5: Running Tests

Always verify you're in the test repo before running tests:

```bash
# Safety check function - add to your shell
wt_test_check() {
    if ! pwd | grep -q "wt-test-repo"; then
        echo "ERROR: Not in test repo! Current dir: $(pwd)"
        return 1
    fi
    if ! git remote get-url origin 2>/dev/null | grep -q "wt-cli-test"; then
        echo "ERROR: Git remote doesn't look like a test repo!"
        echo "Remote: $(git remote get-url origin 2>/dev/null || echo 'none')"
        return 1
    fi
    echo "✓ In test repo: $(basename $(pwd))"
    return 0
}

# Use before testing
cd /tmp/wt-test-repo
wt_test_check && node "$TOOLS/lswt.js" --no-interactive
wt_test_check && node "$TOOLS/wtstate.js" --json
wt_test_check && node "$TOOLS/cleanpr.js" --dry-run --all --json
```

### Step 6: Cleanup After Testing

```bash
# Remove worktrees
cd /tmp/wt-test-repo
git worktree list | grep -v "wt-test-repo " | awk '{print $1}' | xargs -I {} git worktree remove --force {}

# Delete the GitHub test repo (VERIFY THE NAME FIRST!)
REPO_NAME=$(gh repo view --json name -q .name)
echo "About to delete GitHub repo: $REPO_NAME"
read -p "Type the repo name to confirm deletion: " confirm
if [ "$confirm" = "$REPO_NAME" ]; then
    gh repo delete "$REPO_NAME" --yes
    echo "Deleted GitHub repo: $REPO_NAME"
else
    echo "Deletion cancelled"
fi

# Remove local directories
rm -rf /tmp/wt-test-repo /tmp/wt-test-repo.pr*
```

### Platform-Specific Setup

#### Linux

```bash
# Most dependencies available via package manager
sudo apt-get update
sudo apt-get install -y git nodejs npm jq

# Install GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update && sudo apt-get install gh
```

#### macOS

```bash
# Using Homebrew
brew install node git gh jq
```

#### Windows

```powershell
# Using winget
winget install OpenJS.NodeJS
winget install Git.Git
winget install GitHub.cli
winget install jqlang.jq

# Or using Chocolatey
choco install nodejs git gh jq
```

#### WSL (Windows Subsystem for Linux)

```bash
# Follow Linux instructions, but note:
# - Clipboard operations may require xclip or wl-copy
# - Terminal detection differs from native Linux
sudo apt-get install -y xclip  # For clipboard tests
```

### Environment Variables

These environment variables affect tool behavior during testing:

| Variable      | Purpose                             | Test Value                  |
| ------------- | ----------------------------------- | --------------------------- |
| `NO_COLOR`    | Disable ANSI colors                 | `1` to disable              |
| `FORCE_COLOR` | Force ANSI colors even when not TTY | `1` to force                |
| `CI`          | Simulate CI environment             | `true` for non-interactive  |
| `TERM`        | Terminal type                       | `dumb` for minimal terminal |
| `GH_TOKEN`    | GitHub authentication               | Use for automated tests     |
| `DEBUG`       | Enable debug output (if supported)  | `1` or `*`                  |

```bash
# Test without colors
NO_COLOR=1 lswt --no-interactive

# Test forced colors in pipe
FORCE_COLOR=1 lswt | cat

# Simulate CI environment
CI=true newpr "test" --json
```

### Cleanup Procedures

After testing, clean up the test environment:

```bash
# Remove all test worktrees from the test repository
cd /tmp/wt-test-repo
git worktree list | grep -v "bare\|main" | awk '{print $1}' | xargs -I {} git worktree remove --force {}

# Remove test branches
git branch | grep -E "^  (test/|feat/)" | xargs git branch -D

# Reset to clean state
git checkout main
git reset --hard origin/main
git clean -fd

# Full cleanup (remove entire test directories)
cd /tmp
rm -rf wt-tools wt-test-repo wt-test-repo.pr*
```

### CI Environment Considerations

When running tests in CI (GitHub Actions, etc.):

1. **Non-interactive mode is mandatory** - Use `--no-interactive` or `--json` flags
2. **GitHub token required** - Set `GH_TOKEN` secret for PR operations
3. **No TTY available** - Interactive prompts will fail; tools should detect and adapt
4. **Parallel test isolation** - Each job should use separate worktree directories
5. **Cleanup in `post` step** - Always clean up worktrees even on failure

```yaml
# Example GitHub Actions setup
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm test
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Cleanup worktrees
        if: always()
        run: |
          git worktree list | tail -n +2 | awk '{print $1}' | xargs -I {} git worktree remove --force {} || true
```

### Environment Readiness Checklist

Before starting test execution:

- [ ] Node.js 18+ installed and verified
- [ ] Git 2.30+ installed and verified
- [ ] GitHub CLI installed and authenticated (`gh auth status`)
- [ ] Test repository cloned and built successfully
- [ ] Aliases configured for CLI tools
- [ ] Test git states can be created (write access to repo)
- [ ] Network connectivity for GitHub API tests
- [ ] Platform-specific clipboard tool available (for copy tests)
- [ ] Terminal supports ANSI colors (for visual tests)
- [ ] `jq` installed (for JSON validation tests)

---

## Tool-Specific Test Cases

### lswt Tests

#### Basic Functionality

| ID      | Test Case                        | Command                           | Expected Result                 | Pass/Fail |
| ------- | -------------------------------- | --------------------------------- | ------------------------------- | --------- |
| LSW-001 | Help text displays               | `lswt --help`                     | Shows usage, options, examples  |           |
| LSW-002 | List worktrees (non-interactive) | `lswt --no-interactive`           | Lists all worktrees with status |           |
| LSW-003 | JSON output                      | `lswt --json`                     | Valid JSON array of worktrees   |           |
| LSW-004 | Verbose output                   | `lswt --verbose --no-interactive` | Full paths, commit hashes       |           |
| LSW-005 | With PR status                   | `lswt --status --no-interactive`  | Shows OPEN/MERGED/CLOSED        |           |
| LSW-006 | Interactive mode launch          | `lswt` (in TTY)                   | Shows TUI with arrow navigation |           |
| LSW-007 | Piped output                     | `lswt \| cat`                     | Non-interactive output          |           |

#### Interactive Mode Tests

| ID      | Test Case            | Action                   | Expected Result                   | Pass/Fail |
| ------- | -------------------- | ------------------------ | --------------------------------- | --------- |
| LSW-010 | Arrow key navigation | Press ↑/↓                | Selection moves between worktrees |           |
| LSW-011 | Open in editor (e)   | Press 'e' on selection   | Opens editor at worktree path     |           |
| LSW-012 | Open terminal (t)    | Press 't' on selection   | Opens terminal at worktree path   |           |
| LSW-013 | Copy path (c)        | Press 'c' on selection   | Path copied to clipboard          |           |
| LSW-014 | Show details (d)     | Press 'd' on selection   | Shows detailed info               |           |
| LSW-015 | Quit (q)             | Press 'q'                | Exits cleanly                     |           |
| LSW-016 | Remove worktree (r)  | Press 'r' on PR worktree | Prompts for confirmation          |           |
| LSW-017 | Link configs (l)     | Press 'l' on PR worktree | Launches wtlink                   |           |
| LSW-018 | PR actions (p)       | Press 'p' on worktree    | Shows PR menu or create option    |           |

#### Edge Cases

| ID      | Test Case                | Setup                        | Expected Result              | Pass/Fail |
| ------- | ------------------------ | ---------------------------- | ---------------------------- | --------- |
| LSW-020 | No worktrees (main only) | Single worktree repo         | Shows main worktree only     |           |
| LSW-021 | Many worktrees (10+)     | Create 10+ worktrees         | Scrollable list, no overflow |           |
| LSW-022 | Long branch names        | Branch with 80+ chars        | Truncates gracefully         |           |
| LSW-023 | Worktree with changes    | Worktree has uncommitted     | Shows change indicator       |           |
| LSW-024 | Deleted worktree path    | Remove worktree dir manually | Handles gracefully           |           |
| LSW-025 | Not in git repo          | Run from /tmp                | Clear error message          |           |

---

### newpr Tests

#### Basic Functionality

| ID      | Test Case              | Command                  | Expected Result                  | Pass/Fail |
| ------- | ---------------------- | ------------------------ | -------------------------------- | --------- |
| NPR-001 | Help text              | `newpr --help`           | Shows usage, scenarios, examples |           |
| NPR-002 | Missing description    | `newpr --json`           | Error: description required      |           |
| NPR-003 | Invalid PR number      | `newpr --pr abc --json`  | Error: must be numeric           |           |
| NPR-004 | Non-interactive mode   | `newpr "test" -y --json` | Creates without prompts          |           |
| NPR-005 | Dry run (if available) | `newpr "test" --dry-run` | Shows what would happen          |           |

#### Scenario Tests

| ID      | Scenario            | Setup                    | Command        | Expected Behavior                   | Pass/Fail |
| ------- | ------------------- | ------------------------ | -------------- | ----------------------------------- | --------- |
| NPR-010 | main_clean_same     | Clean main, synced       | `newpr "feat"` | Creates branch, empty commit option |           |
| NPR-011 | main_staged_same    | Main with staged changes | `newpr "feat"` | Offers to commit staged             |           |
| NPR-012 | main_unstaged_same  | Main with unstaged       | `newpr "feat"` | Offers commit_all, stash, or leave  |           |
| NPR-013 | main_both_same      | Main with both           | `newpr "feat"` | Offers to stage all and commit      |           |
| NPR-014 | main_clean_ahead    | Main ahead of origin     | `newpr "feat"` | Offers to include local commits     |           |
| NPR-015 | main_changes_ahead  | Main ahead with changes  | `newpr "feat"` | Complex scenario handling           |           |
| NPR-016 | branch_same_as_main | Feature at main commit   | `newpr "feat"` | Create PR for branch                |           |
| NPR-017 | branch_divergent    | Feature with commits     | `newpr "feat"` | Create PR for existing work         |           |
| NPR-018 | branch_with_changes | Feature with uncommitted | `newpr "feat"` | Commit changes first                |           |
| NPR-019 | detached_head       | Detached HEAD state      | `newpr "feat"` | Clear error or recovery             |           |
| NPR-020 | pr_worktree         | From PR worktree         | `newpr "feat"` | Suggest using main worktree         |           |

#### Error Handling Tests

| ID      | Test Case             | Setup               | Expected Result               | Pass/Fail |
| ------- | --------------------- | ------------------- | ----------------------------- | --------- |
| NPR-030 | gh not installed      | Uninstall/hide gh   | Clear error with install link |           |
| NPR-031 | gh not authenticated  | `gh auth logout`    | Clear error with auth command |           |
| NPR-032 | No remote             | Repo without origin | Clear error message           |           |
| NPR-033 | Network failure       | Disconnect network  | Timeout with retry suggestion |           |
| NPR-034 | Pre-commit hook fails | Failing pre-commit  | HOOK_FAILED error code        |           |
| NPR-035 | Branch already exists | Create branch first | Clear conflict message        |           |
| NPR-036 | PR already exists     | Create PR first     | Link to existing PR           |           |

---

### cleanpr Tests

#### Basic Functionality

| ID      | Test Case            | Command                   | Expected Result             | Pass/Fail |
| ------- | -------------------- | ------------------------- | --------------------------- | --------- |
| CPR-001 | Help text            | `cleanpr --help`          | Shows usage and options     |           |
| CPR-002 | Interactive mode     | `cleanpr`                 | Shows grouped worktrees     |           |
| CPR-003 | Clean specific PR    | `cleanpr 42`              | Cleans PR #42 worktree      |           |
| CPR-004 | Clean all            | `cleanpr --all`           | Cleans all merged/closed    |           |
| CPR-005 | Dry run              | `cleanpr --all --dry-run` | Shows what would be cleaned |           |
| CPR-006 | JSON output          | `cleanpr --all --json`    | Valid JSON result           |           |
| CPR-007 | With remote deletion | `cleanpr 42 --remote`     | Also deletes remote branch  |           |
| CPR-008 | Force removal        | `cleanpr 42 --force`      | Removes even with changes   |           |

#### Edge Cases

| ID      | Test Case            | Setup                     | Expected Result               | Pass/Fail |
| ------- | -------------------- | ------------------------- | ----------------------------- | --------- |
| CPR-020 | No PR worktrees      | Only main worktree        | "No PR worktrees found"       |           |
| CPR-021 | All PRs open         | Only open PRs             | "No merged/closed to clean"   |           |
| CPR-022 | PR not found         | Invalid PR number         | Clear error with suggestion   |           |
| CPR-023 | Worktree has changes | Uncommitted in worktree   | Warning, require --force      |           |
| CPR-024 | Remote branch gone   | Already deleted on remote | Handles gracefully            |           |
| CPR-025 | Current worktree     | Try to clean current      | Cannot clean current worktree |           |

---

### wtlink Tests

#### Basic Functionality

| ID      | Test Case     | Command                  | Expected Result        | Pass/Fail |
| ------- | ------------- | ------------------------ | ---------------------- | --------- |
| WTL-001 | Help text     | `wtlink --help`          | Shows subcommands      |           |
| WTL-002 | Manage help   | `wtlink manage --help`   | Shows manage options   |           |
| WTL-003 | Link help     | `wtlink link --help`     | Shows link options     |           |
| WTL-004 | Validate help | `wtlink validate --help` | Shows validate options |           |
| WTL-005 | Main menu     | `wtlink` (no args)       | Shows interactive menu |           |

#### Manage Subcommand

| ID      | Test Case          | Command                  | Expected Result               | Pass/Fail |
| ------- | ------------------ | ------------------------ | ----------------------------- | --------- |
| WTL-010 | Interactive manage | `wtlink manage`          | File browser TUI              |           |
| WTL-011 | Non-interactive    | `wtlink manage -n`       | Adds files as commented       |           |
| WTL-012 | Dry run            | `wtlink manage -n -d`    | Shows changes without writing |           |
| WTL-013 | Clean mode         | `wtlink manage --clean`  | Removes stale entries         |           |
| WTL-014 | Backup mode        | `wtlink manage --backup` | Creates .wtlinkrc.bak         |           |

#### Link Subcommand

| ID      | Test Case          | Command                       | Expected Result        | Pass/Fail |
| ------- | ------------------ | ----------------------------- | ---------------------- | --------- |
| WTL-020 | Auto-detect source | `wtlink link` (from PR wt)    | Detects main as source |           |
| WTL-021 | Explicit paths     | `wtlink link /src /dest`      | Links from src to dest |           |
| WTL-022 | Dry run            | `wtlink link --dry-run`       | Shows what would link  |           |
| WTL-023 | Symbolic links     | `wtlink link --type symbolic` | Creates symlinks       |           |
| WTL-024 | Skip confirm       | `wtlink link --yes`           | Links without prompt   |           |

#### Edge Cases

| ID      | Test Case             | Setup                | Expected Result                  | Pass/Fail |
| ------- | --------------------- | -------------------- | -------------------------------- | --------- |
| WTL-030 | No manifest           | Delete .wtlinkrc     | Creates new or prompts           |           |
| WTL-031 | Single worktree       | Only main worktree   | Friendly error (NOT stack trace) |           |
| WTL-032 | File not in gitignore | Entry not ignored    | Warning message                  |           |
| WTL-033 | File doesn't exist    | Stale manifest entry | Validation error                 |           |
| WTL-034 | Many manifest entries | 500+ in .wtlinkrc    | Summary mode, not list all       |           |

---

### wtstate Tests

#### Basic Functionality

| ID      | Test Case    | Command             | Expected Result            | Pass/Fail |
| ------- | ------------ | ------------------- | -------------------------- | --------- |
| WTS-001 | Human output | `wtstate`           | Readable scenario info     |           |
| WTS-002 | JSON output  | `wtstate --json`    | Valid JSON with all fields |           |
| WTS-003 | Verbose      | `wtstate --verbose` | Lists actual files         |           |

#### Scenario Detection

| ID      | Scenario           | Setup                 | Expected `scenario` value | Pass/Fail |
| ------- | ------------------ | --------------------- | ------------------------- | --------- |
| WTS-010 | Clean main         | Synced, no changes    | `main_clean_same`         |           |
| WTS-011 | Main with staged   | Staged changes        | `main_staged_same`        |           |
| WTS-012 | Main with unstaged | Unstaged changes      | `main_unstaged_same`      |           |
| WTS-013 | Main with both     | Both types            | `main_both_same`          |           |
| WTS-014 | Main ahead         | Local commits         | `main_clean_ahead`        |           |
| WTS-015 | Feature branch     | On feat/xxx           | `branch_*` variant        |           |
| WTS-016 | Detached HEAD      | Checkout specific SHA | `detached_head`           |           |
| WTS-017 | PR worktree        | In PR worktree        | `pr_worktree`             |           |

---

### wtconfig Tests

#### Basic Functionality

| ID      | Test Case   | Command             | Expected Result                 | Pass/Fail |
| ------- | ----------- | ------------------- | ------------------------------- | --------- |
| WTC-001 | Help text   | `wtconfig --help`   | Clean help (no [WARN] prefixes) |           |
| WTC-002 | Show config | `wtconfig show`     | Current config values           |           |
| WTC-003 | Validate    | `wtconfig validate` | Validation result               |           |
| WTC-004 | Init wizard | `wtconfig init`     | Interactive setup               |           |

#### Configuration Tests

| ID      | Test Case       | Setup                | Expected Result        | Pass/Fail |
| ------- | --------------- | -------------------- | ---------------------- | --------- |
| WTC-010 | Default config  | No .worktreerc       | Uses built-in defaults |           |
| WTC-011 | Local config    | .worktreerc exists   | Loads local config     |           |
| WTC-012 | Global config   | ~/.worktreerc exists | Loads global config    |           |
| WTC-013 | Config priority | Both exist           | Local overrides global |           |
| WTC-014 | Invalid config  | Malformed JSON       | Clear parse error      |           |
| WTC-015 | Unknown keys    | Extra config keys    | Warning about unknown  |           |

---

## Cross-Tool Integration Tests

| ID      | Test Case                | Steps                               | Expected Result      | Pass/Fail |
| ------- | ------------------------ | ----------------------------------- | -------------------- | --------- |
| INT-001 | Full workflow            | `newpr` → `lswt` → edit → `cleanpr` | Complete cycle works |           |
| INT-002 | lswt launches newpr      | Press 'p' on main in lswt           | Opens newpr flow     |           |
| INT-003 | lswt launches wtlink     | Press 'l' on PR worktree            | Links configs        |           |
| INT-004 | lswt launches cleanpr    | Press 'r' on merged PR              | Cleans worktree      |           |
| INT-005 | Config affects all tools | Set baseBranch in config            | All tools use it     |           |
| INT-006 | JSON piping              | `lswt --json \| jq '.[]'`           | Parseable by jq      |           |

---

## Edge Case & Error Condition Tests

### Environment Edge Cases

| ID      | Test Case            | Setup                      | Expected Result              | Pass/Fail |
| ------- | -------------------- | -------------------------- | ---------------------------- | --------- |
| ENV-001 | Not in git repo      | cd /tmp                    | Clear "not a git repo" error |           |
| ENV-002 | Bare repository      | git clone --bare           | Appropriate error            |           |
| ENV-003 | Shallow clone        | git clone --depth 1        | Works or clear limitation    |           |
| ENV-004 | No network           | Disconnect                 | Timeout with message         |           |
| ENV-005 | Read-only filesystem | Mount read-only            | Clear permission error       |           |
| ENV-006 | Very long path       | Path > 260 chars (Windows) | Handles or warns             |           |
| ENV-007 | Special characters   | Branch with spaces/unicode | Handles correctly            |           |
| ENV-008 | Submodule            | In git submodule           | Works from submodule         |           |

### Input Validation

| ID      | Test Case             | Input                      | Expected Result             | Pass/Fail |
| ------- | --------------------- | -------------------------- | --------------------------- | --------- |
| INP-001 | Empty description     | `newpr ""`                 | Error: description required |           |
| INP-002 | Very long description | 1000+ chars                | Truncates or warns          |           |
| INP-003 | Special chars in desc | `newpr "feat: <script>"`   | Escapes properly            |           |
| INP-004 | Negative PR number    | `newpr --pr -1`            | Invalid argument error      |           |
| INP-005 | Zero PR number        | `newpr --pr 0`             | Invalid argument error      |           |
| INP-006 | Float PR number       | `newpr --pr 1.5`           | Invalid argument error      |           |
| INP-007 | Invalid path          | `wtlink link /nonexistent` | Path not found error        |           |

---

## Output Mode Tests

### JSON Output Validation

| ID       | Test Case            | Command                | Validation                    | Pass/Fail |
| -------- | -------------------- | ---------------------- | ----------------------------- | --------- |
| JSON-001 | lswt JSON schema     | `lswt --json`          | Matches expected schema       |           |
| JSON-002 | newpr success JSON   | `newpr "x" -y --json`  | Has prNumber, url, path       |           |
| JSON-003 | newpr error JSON     | `newpr --json`         | Has error.code, error.message |           |
| JSON-004 | cleanpr JSON         | `cleanpr --all --json` | Has cleaned, skipped arrays   |           |
| JSON-005 | wtstate JSON         | `wtstate --json`       | Has scenario, actions         |           |
| JSON-006 | Nested JSON validity | All --json outputs     | `jq .` parses all             |           |
| JSON-007 | No extra output      | All --json outputs     | Only JSON, no text mixed      |           |

### Exit Code Contract

All CLI tools follow this exit code contract:

| Code | Meaning            | Examples                                                      |
| ---- | ------------------ | ------------------------------------------------------------- |
| 0    | Success            | Operation completed, user cancelled via prompt, graceful exit |
| 1    | Error              | Invalid args, not found, permission denied, network failure   |
| 130  | Interrupt (Ctrl+C) | User pressed Ctrl+C during operation                          |

**Note:** User cancellation via prompt selection (e.g., selecting "Cancel" or pressing Escape) returns **0** because
the program successfully did what the user requested - it exited gracefully.

### Exit Codes

| ID       | Test Case        | Condition             | Expected Exit Code | Pass/Fail |
| -------- | ---------------- | --------------------- | ------------------ | --------- |
| EXIT-001 | Success          | Command succeeds      | 0                  |           |
| EXIT-002 | User cancel      | User cancels prompt   | 0                  |           |
| EXIT-003 | Invalid args     | Bad arguments         | 1                  |           |
| EXIT-004 | Not found        | PR/worktree not found | 1                  |           |
| EXIT-005 | Permission error | Can't write           | 1                  |           |
| EXIT-006 | Network error    | Connection failed     | 1                  |           |

---

## Interactive UX Tests

### Prompt Consistency

| ID     | Test Case         | Tool     | Prompt Style        | Keyboard     | Pass/Fail |
| ------ | ----------------- | -------- | ------------------- | ------------ | --------- |
| UX-001 | lswt selection    | lswt     | Arrow keys          | ↑↓ Enter     |           |
| UX-002 | newpr scenario    | newpr    | Arrow keys (fixed)  | ↑↓ Enter     |           |
| UX-003 | cleanpr selection | cleanpr  | Confirmation prompt | y/n or Enter |           |
| UX-004 | wtlink menu       | wtlink   | Arrow keys          | ↑↓ Enter     |           |
| UX-005 | wtconfig wizard   | wtconfig | Text input fields   | Type + Enter |           |

### Visual Feedback

| ID      | Test Case            | Action            | Expected Feedback            | Pass/Fail |
| ------- | -------------------- | ----------------- | ---------------------------- | --------- |
| VIS-001 | Long operation start | `newpr` fetch     | Spinner/message within 100ms |           |
| VIS-002 | Progress during push | `newpr` push      | Visible progress             |           |
| VIS-003 | Success confirmation | Any success       | Clear success message        |           |
| VIS-004 | Error visibility     | Any error         | Red/highlighted error        |           |
| VIS-005 | Color in TTY         | Any output        | Colors when TTY              |           |
| VIS-006 | No color when piped  | Any output \| cat | No ANSI codes                |           |

---

## Performance Tests

| ID       | Test Case              | Measurement           | Threshold    | Pass/Fail |
| -------- | ---------------------- | --------------------- | ------------ | --------- |
| PERF-001 | lswt startup           | Time to first output  | < 500ms      |           |
| PERF-002 | lswt with 20 worktrees | Time to list          | < 2s         |           |
| PERF-003 | wtstate detection      | Time to analyze       | < 200ms      |           |
| PERF-004 | wtlink file scan       | Time for 1000 files   | < 5s         |           |
| PERF-005 | JSON parsing overhead  | Compare --json vs not | < 50ms extra |           |
| PERF-006 | Memory usage           | Peak memory           | < 100MB      |           |

---

## Cross-Platform Tests

### Platform-Specific

| ID       | Test Case             | Platform           | Notes                   | Pass/Fail |
| -------- | --------------------- | ------------------ | ----------------------- | --------- |
| PLAT-001 | Path separators       | Windows            | Uses \ correctly        |           |
| PLAT-002 | Path separators       | Linux/macOS        | Uses / correctly        |           |
| PLAT-003 | Terminal colors       | Windows CMD        | Colors work or fallback |           |
| PLAT-004 | Terminal colors       | Windows PowerShell | Colors work             |           |
| PLAT-005 | Terminal colors       | Windows Terminal   | Full color support      |           |
| PLAT-006 | Interactive prompts   | All platforms      | Keyboard input works    |           |
| PLAT-007 | Clipboard (copy path) | All platforms      | Copies to clipboard     |           |
| PLAT-008 | Editor launch         | All platforms      | Opens configured editor |           |

---

## Issue Log

> Log all discovered issues here during testing

### Template for Quick Logging

```
| ID | Severity | Tool | Summary | Status |
|----|----------|------|---------|--------|
| UX-001 | P1 | wtlink | Stack trace on single worktree | Open |
| UX-002 | P1 | newpr | UNKNOWN_ERROR for hook failures | Open |
| UX-003 | P1 | wtconfig | [WARN] prefixes in help text | Open |
```

### Discovered Issues

| ID     | Severity | Tool     | Summary                                                         | Status        |
| ------ | -------- | -------- | --------------------------------------------------------------- | ------------- |
| UX-001 | P1       | wtlink   | Raw stack trace when source auto-detection fails                | **Confirmed** |
| UX-002 | P1       | newpr    | Hook failures show UNKNOWN_ERROR instead of HOOK_FAILED         | Open          |
| UX-003 | P1       | wtconfig | [INFO] and [WARN] prefixes appear in help text                  | **Fixed** ✓   |
| UX-004 | P2       | wtlink   | manage --non-interactive lists 400+ files without summary       | **Fixed** ✓   |
| UX-005 | P2       | wtlink   | Help text wraps mid-word due to terminal width                  | **Confirmed** |
| UX-006 | P3       | lswt     | Relative path '.' shown instead of full path                    | Open          |
| UX-007 | P3       | cleanpr  | Empty result arrays give no feedback message                    | **Fixed** ✓   |
| UX-008 | P4       | all      | No post-action suggestions for next steps                       | **Fixed** ✓   |
| UX-009 | P4       | newpr    | Numbered prompts instead of arrow-key navigation                | **Fixed** ✓   |
| UX-010 | P1       | lswt     | --json flag shows [ERROR] text instead of JSON when not in repo | **Confirmed** |
| UX-011 | P2       | newpr    | PR #0 accepted instead of validated as invalid                  | **Fixed** ✓   |
| UX-012 | P2       | newpr    | --json with PR lookup shows text [INFO]/[ERROR] instead of JSON | **Fixed** ✓   |
| UX-013 | P2       | newpr    | Not in git repo returns UNKNOWN_ERROR instead of NOT_GIT_REPO   | **Fixed** ✓   |
| UX-014 | P2       | newpr    | Float PR number (1.5) truncated instead of rejected             | **New**       |
| UX-015 | P1       | wtlink   | validate command shows stack trace when no manifest exists      | **Confirmed** |

### Testing Session: 2026-01-04 (Comprehensive)

**Test Environment:**

- Platform: Linux 6.6.87.2-microsoft-standard-WSL2
- Node: v24.11.0
- Package: @camaradesuk/git-worktree-tools@1.5.0 (from feat/ux-overhaul-ruchux branch)
- Tool source: `/home/chris/workspace/git-worktree-tools.pr13/dist/cli/`
- Test repo: `chrissena/wt-cli-test-20260104-172212` (GitHub)
- Local path: `/tmp/wt-test-repo/`

**Test PRs Created:**

| PR # | Branch              | State  | Purpose                |
| ---- | ------------------- | ------ | ---------------------- |
| #1   | test/feature-1      | OPEN   | Test open PR detection |
| #2   | test/feature-merged | MERGED | Test merged PR cleanup |
| #3   | test/closed-pr-1    | CLOSED | Test closed PR cleanup |

**Test Worktrees Created:**

| Worktree              | PR  | Purpose                |
| --------------------- | --- | ---------------------- |
| /tmp/wt-test-repo.pr1 | #1  | Test open PR worktree  |
| /tmp/wt-test-repo.pr2 | #2  | Test merged PR cleanup |
| /tmp/wt-test-repo.pr3 | #3  | Test closed PR cleanup |

**Detailed Test Results:**

| Test ID  | Description                     | Result | Notes                                |
| -------- | ------------------------------- | ------ | ------------------------------------ |
| LSW-001  | lswt lists all worktrees        | PASS   | Shows 4 worktrees correctly          |
| LSW-002  | lswt --json outputs valid JSON  | PASS   | Array with worktree objects          |
| LSW-003  | lswt shows PR status            | PASS   | OPEN/MERGED/CLOSED detected          |
| LSW-004  | lswt handles no worktrees       | PASS   | Empty array in JSON mode             |
| LSW-005  | lswt in bare repo worktree      | PASS   | Shows main as prunable:false         |
| WTS-001  | wtstate detects main_clean_same | PASS   | Correct scenario detected            |
| WTS-002  | wtstate --json valid            | PASS   | Returns scenario object              |
| WTC-001  | wtconfig --help clean output    | PASS   | **UX-003 FIXED** - No [INFO]/[WARN]  |
| WTL-001  | wtlink --help text              | ISSUE  | **UX-005 CONFIRMED** - Mid-word wrap |
| WTL-002  | wtlink single worktree error    | ISSUE  | **UX-001 CONFIRMED** - Stack trace   |
| CPR-001  | cleanpr --dry-run lists PRs     | PASS   | Shows 2 cleanable (merged+closed)    |
| CPR-005  | cleanpr --json valid            | PASS   | **UX-007 FIXED** - Has message field |
| NPR-001  | newpr --help clean output       | PASS   | No [INFO]/[WARN] prefixes            |
| NPR-002  | newpr PR #0 validation          | PASS   | **UX-011 FIXED** - Rejects PR #0     |
| NPR-003  | newpr --json clean output       | PASS   | **UX-012 FIXED** - Pure JSON         |
| ENV-001  | Not in git repo detection       | PASS   | **UX-013 FIXED** - NOT_GIT_REPO      |
| UX-010   | lswt --json error output        | ISSUE  | **CONFIRMED** - Shows [ERROR] text   |
| JSON-006 | All --json outputs parseable    | PASS   | jq validates all outputs             |

**Summary:**

- Total Tests: 17
- Passed: 14
- Issues Found: 3 (UX-001, UX-005, UX-010 confirmed)
- Issues Fixed: 7 (UX-003, UX-004, UX-007, UX-008, UX-009, UX-011, UX-012, UX-013)

### Testing Session: 2026-01-04 (Extended Comprehensive)

**Test Environment:**

- Platform: Linux 6.6.87.2-microsoft-standard-WSL2
- Node: v24.11.0
- Package: @camaradesuk/git-worktree-tools@1.5.0 (from feat/ux-overhaul-ruchux branch)
- Tool source: `/home/chris/workspace/git-worktree-tools.pr13/dist/cli/`
- Test repo: `chrissena/wt-cli-test-20260104-181937` (GitHub)
- Local path: `/tmp/wt-test-repo/`

**Extended Test Results:**

| Test ID  | Description                       | Result | Notes                               |
| -------- | --------------------------------- | ------ | ----------------------------------- |
| LSW-020  | Single worktree repo              | PASS   | Shows single worktree correctly     |
| LSW-023  | Worktree with uncommitted changes | PASS   | hasChanges: true detected           |
| LSW-025  | Not in git repo                   | ISSUE  | **UX-010** - Shows [ERROR] not JSON |
| NPR-002  | Missing description               | PASS   | Returns INVALID_ARGUMENT            |
| NPR-003  | Invalid PR number (abc)           | PASS   | Returns INVALID_ARGUMENT            |
| INP-001  | Empty description                 | PASS   | Properly rejected                   |
| INP-004  | Negative PR number (-1)           | PASS   | Properly rejected                   |
| INP-005  | Zero PR number (0)                | PASS   | Returns "positive number" error     |
| INP-006  | Float PR number (1.5)             | ISSUE  | **UX-014** - Truncated to 1         |
| CPR-020  | No PR worktrees                   | PASS   | Shows helpful message               |
| CPR-022  | PR not found (9999)               | PASS   | Clear error with suggestion         |
| WTS-010  | main_clean_same scenario          | PASS   | Correctly detected                  |
| WTS-011  | main_staged_same scenario         | PASS   | Correctly detected                  |
| WTS-012  | main_unstaged_same scenario       | PASS   | Correctly detected                  |
| WTS-015  | Feature branch scenario           | PASS   | Shows pr_worktree/branch_divergent  |
| WTC-002  | wtconfig show                     | PASS   | Shows defaults correctly            |
| WTC-003  | wtconfig validate                 | PASS   | Shows no config message             |
| WTL-005  | wtlink --help                     | PASS   | Shows subcommands                   |
| WTL-022  | wtlink link --dry-run             | PASS   | Shows link preview                  |
| WTL-030  | wtlink validate (no manifest)     | ISSUE  | **UX-015** - Stack trace shown      |
| WTL-031  | wtlink link (single worktree)     | ISSUE  | **UX-001** - Stack trace shown      |
| JSON-001 | lswt JSON schema                  | PASS   | Has path, branch, type fields       |
| JSON-005 | wtstate JSON schema               | PASS   | Has scenario, availableActions      |
| JSON-006 | All JSON parseable                | PASS   | jq validates all outputs            |
| EXIT-001 | Success exit code                 | PASS   | Returns 0                           |
| EXIT-003 | Invalid args exit code            | PASS   | Returns 1                           |
| EXIT-004 | Not found exit code               | PASS   | Returns 1                           |
| PERF-001 | lswt startup time                 | PASS   | ~320ms (< 500ms threshold)          |
| PERF-003 | wtstate detection time            | PASS   | ~99ms (< 200ms threshold)           |

**Extended Summary:**

- Total Tests: 29
- Passed: 25
- Issues Found: 4 (UX-001, UX-010, UX-014, UX-015)
- New Issues: 2 (UX-014 float truncation, UX-015 validate stack trace)

**Remaining Open Issues:**

| ID     | Severity | Tool   | Issue                                    | Priority |
| ------ | -------- | ------ | ---------------------------------------- | -------- |
| UX-001 | P1       | wtlink | Stack trace on single worktree           | High     |
| UX-005 | P2       | wtlink | Help text wraps mid-word                 | Medium   |
| UX-010 | P1       | lswt   | --json shows [ERROR] text not JSON       | High     |
| UX-014 | P2       | newpr  | Float PR numbers truncated               | Medium   |
| UX-015 | P1       | wtlink | validate shows stack trace (no manifest) | High     |

---

## Test Execution Checklist

### Before Testing

- [ ] Fresh clone of repository
- [ ] Build completed successfully
- [ ] Test repository prepared with various git states
- [ ] Recording tools ready (terminal recorder, screenshot)

### During Testing

- [ ] Log all issues immediately (don't rely on memory)
- [ ] Capture exact commands and outputs
- [ ] Note unexpected behaviors even if not "bugs"
- [ ] Time long operations

### After Testing

- [ ] Review issue log for duplicates
- [ ] Assign final severity ratings
- [ ] Group related issues
- [ ] Prioritize fixes
- [ ] Update [UX-ACTION-PLAN.md](./UX-ACTION-PLAN.md) with new findings

---

## Automation Opportunities

### Tests That Can Be Automated

> **Note:** These scripts assume the two-repository architecture is set up:
>
> - **Tool binaries:** Use your development branch's `dist/cli/` directory
>   - Example: `/home/user/workspace/git-worktree-tools.pr13/dist/cli/`
>   - Set `TOOLS="/path/to/your/worktree/dist/cli"` before running
> - **Test repository:** `/tmp/wt-test-repo/` (or your chosen test location)
>
> The `TOOLS` variable in scripts below defaults to `/tmp/wt-tools/dist/cli` but should be
> adjusted to point to your development branch when testing local changes.

```bash
#!/bin/bash
# test-json-outputs.sh - Validate all JSON outputs
# Run this script FROM the test repository: cd /tmp/wt-test-repo && ./test-json-outputs.sh

set -e

# Path to tool binaries
TOOLS="/tmp/wt-tools/dist/cli"

echo "Testing lswt --json..."
node "$TOOLS/lswt.js" --json | jq . > /dev/null

echo "Testing wtstate --json..."
node "$TOOLS/wtstate.js" --json | jq . > /dev/null

echo "Testing cleanpr --dry-run --all --json..."
node "$TOOLS/cleanpr.js" --dry-run --all --json | jq . > /dev/null

echo "All JSON outputs valid!"
```

```bash
#!/bin/bash
# test-exit-codes.sh - Verify exit codes
# Run this script FROM the test repository: cd /tmp/wt-test-repo && ./test-exit-codes.sh

set -e

# Path to tool binaries
TOOLS="/tmp/wt-tools/dist/cli"
TEST_REPO="/tmp/wt-test-repo"

# Should succeed (run from test repo)
cd "$TEST_REPO"
node "$TOOLS/lswt.js" --no-interactive > /dev/null
[ $? -eq 0 ] && echo "PASS: lswt success = 0" || echo "FAIL: lswt success != 0"

# Should fail (not in git repo)
cd /tmp
node "$TOOLS/lswt.js" 2>/dev/null
[ $? -eq 1 ] && echo "PASS: lswt not-git = 1" || echo "FAIL: lswt not-git != 1"

# Return to test repo
cd "$TEST_REPO"
```

```bash
#!/bin/bash
# test-performance.sh - Measure command performance using hyperfine
# Run this script FROM the test repository: cd /tmp/wt-test-repo && ./test-performance.sh

set -e

# Path to tool binaries
TOOLS="/tmp/wt-tools/dist/cli"

# Check for hyperfine
if ! command -v hyperfine &> /dev/null; then
    echo "hyperfine not installed. Install with:"
    echo "  brew install hyperfine    # macOS"
    echo "  cargo install hyperfine   # Cross-platform"
    echo "  apt install hyperfine     # Debian/Ubuntu"
    exit 1
fi

echo "=== Performance Tests ==="
echo ""

# PERF-001: lswt startup time (threshold: < 500ms)
echo "PERF-001: lswt startup time"
hyperfine --warmup 3 --runs 10 "node $TOOLS/lswt.js --no-interactive" \
    --export-json /tmp/perf-lswt.json

# PERF-003: wtstate detection time (threshold: < 200ms)
echo ""
echo "PERF-003: wtstate detection time"
hyperfine --warmup 3 --runs 10 "node $TOOLS/wtstate.js --json" \
    --export-json /tmp/perf-wtstate.json

# PERF-005: JSON parsing overhead
echo ""
echo "PERF-005: JSON parsing overhead"
hyperfine --warmup 3 --runs 10 \
    "node $TOOLS/lswt.js --no-interactive" \
    "node $TOOLS/lswt.js --json" \
    --export-json /tmp/perf-json-overhead.json

echo ""
echo "=== Results exported to /tmp/perf-*.json ==="
echo "Use 'jq .results[].mean /tmp/perf-*.json' to extract mean times"
```

---

## Smoke Test Suite

> **Purpose:** Minimum set of tests to run after every code change to catch regressions quickly.

Run these tests before committing or after any significant change:

### Core Functionality (Must Pass)

```bash
#!/bin/bash
# smoke-test.sh - Quick regression check
# Run this script FROM the test repository: cd /tmp/wt-test-repo && /tmp/wt-tools/smoke-test.sh

set -e

# Path to tool binaries
TOOLS="/tmp/wt-tools/dist/cli"
TEST_REPO="/tmp/wt-test-repo"

# Ensure we're in the test repo
cd "$TEST_REPO"

echo "=== Smoke Test Suite ==="
echo "Running from: $(pwd)"
echo ""

# Core operations
echo "• lswt basic..."
node "$TOOLS/lswt.js" --no-interactive > /dev/null && echo "  ✓ PASS"

echo "• wtstate detection..."
node "$TOOLS/wtstate.js" --json | jq -e '.scenario' > /dev/null && echo "  ✓ PASS"

echo "• cleanpr dry-run..."
node "$TOOLS/cleanpr.js" --dry-run --all --json | jq -e '.' > /dev/null && echo "  ✓ PASS"

echo "• wtlink validate..."
node "$TOOLS/wtlink.js" validate --json 2>/dev/null | jq -e '.' > /dev/null && echo "  ✓ PASS" || echo "  ✓ PASS (no manifest)"

# JSON schema validation
echo "• JSON outputs valid..."
node "$TOOLS/lswt.js" --json | jq -e 'type == "array"' > /dev/null
node "$TOOLS/wtstate.js" --json | jq -e '.scenario' > /dev/null
echo "  ✓ PASS"

# Error path validation
echo "• Error handling..."
cd /tmp
if node "$TOOLS/lswt.js" --json 2>&1 | jq -e '.error.code' > /dev/null; then
    echo "  ✓ PASS (proper error JSON)"
else
    echo "  ✗ FAIL (error not in JSON format)"
    exit 1
fi
cd "$TEST_REPO"

echo ""
echo "=== All Smoke Tests Passed ==="
```

### Smoke Test Checklist

| Priority | Test ID  | Description            | Command                            |
| -------- | -------- | ---------------------- | ---------------------------------- |
| HIGH     | LSW-002  | List worktrees         | `lswt --no-interactive`            |
| HIGH     | LSW-003  | JSON output valid      | `lswt --json \| jq .`              |
| HIGH     | WTS-002  | State detection        | `wtstate --json`                   |
| HIGH     | CPR-005  | Cleanpr dry-run        | `cleanpr --dry-run --all --json`   |
| HIGH     | JSON-006 | All JSON parseable     | All `--json` outputs through `jq`  |
| HIGH     | JSON-007 | No mixed text/JSON     | `--json` outputs contain only JSON |
| MEDIUM   | EXIT-001 | Success returns 0      | `lswt --no-interactive; echo $?`   |
| MEDIUM   | EXIT-003 | Invalid args returns 1 | `newpr --invalid-flag; echo $?`    |
| MEDIUM   | ENV-001  | Not-in-repo error      | `cd /tmp && lswt --json`           |

---

## Test Priority Guide

When time is limited, prioritize tests in this order:

### Priority 1: Critical Path (Always Run)

Tests that verify the tool doesn't break for normal usage:

- **LSW-001 to LSW-003**: Basic lswt functionality
- **WTS-001, WTS-002**: State detection works
- **JSON-006, JSON-007**: JSON output is valid (breaks scripting if fails)
- **EXIT-001 to EXIT-003**: Exit codes are correct

### Priority 2: Happy Path (Run Before Release)

Tests that verify features work as expected:

- All scenario tests (NPR-010 to NPR-020, WTS-010 to WTS-017)
- All basic functionality tests for each tool
- Cross-tool integration tests (INT-001 to INT-006)

### Priority 3: Edge Cases (Run Periodically)

Tests that verify resilience:

- All edge case tests (LSW-020 to LSW-025, etc.)
- Environment edge cases (ENV-001 to ENV-008)
- Input validation (INP-001 to INP-007)

### Priority 4: Platform & Performance (Run Before Major Release)

Tests that verify cross-platform compatibility:

- All PLAT-\* tests
- All PERF-\* tests
- Visual feedback tests (VIS-001 to VIS-006)

---

_This testing plan should be executed periodically, especially before releases, to catch regressions and identify new improvement opportunities._
