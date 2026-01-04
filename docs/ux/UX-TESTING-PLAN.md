# Git Worktree Tools: Exhaustive UX Testing Plan

> **Purpose:** Systematic testing methodology to identify issues, UX problems, and improvement opportunities across all CLI tools.

---

## Table of Contents

1. [Testing Methodology](#testing-methodology)
2. [Severity Classification](#severity-classification)
3. [Issue Logging Template](#issue-logging-template)
4. [Test Environment Setup](#test-environment-setup)
5. [Tool-Specific Test Cases](#tool-specific-test-cases)
6. [Cross-Tool Integration Tests](#cross-tool-integration-tests)
7. [Edge Case & Error Condition Tests](#edge-case--error-condition-tests)
8. [Output Mode Tests](#output-mode-tests)
9. [Interactive UX Tests](#interactive-ux-tests)
10. [Performance Tests](#performance-tests)
11. [Cross-Platform Tests](#cross-platform-tests)
12. [Issue Log](#issue-log)

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
````

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

### Prerequisites

```bash
# Clone fresh copy for testing
git clone https://github.com/camaradesuk/git-worktree-tools /tmp/wt-test
cd /tmp/wt-test

# Install and build
npm install
npm run build

# Create aliases for testing
alias lswt='node /tmp/wt-test/dist/cli/lswt.js'
alias newpr='node /tmp/wt-test/dist/cli/newpr.js'
alias cleanpr='node /tmp/wt-test/dist/cli/cleanpr.js'
alias wtlink='node /tmp/wt-test/dist/cli/wtlink.js'
alias wtstate='node /tmp/wt-test/dist/cli/wtstate.js'
alias wtconfig='node /tmp/wt-test/dist/cli/wtconfig.js'
````

### Test Repository States

Create these git states for testing:

```bash
# State 1: Clean main branch
git checkout main
git reset --hard origin/main

# State 2: Uncommitted changes
echo "test" >> README.md

# State 3: Staged changes
git add README.md

# State 4: Local commits ahead of origin
git commit -m "test commit"

# State 5: Feature branch
git checkout -b feat/test-branch

# State 6: Detached HEAD
git checkout HEAD~1

# State 7: Multiple worktrees
git worktree add ../test-repo.pr1 -b feat/pr1
git worktree add ../test-repo.pr2 -b feat/pr2
```

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
| WTL-034 | Many ignored files    | 500+ ignored files   | Summary mode, not list all       |           |

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

### Exit Codes

| ID       | Test Case        | Condition             | Expected Exit Code | Pass/Fail |
| -------- | ---------------- | --------------------- | ------------------ | --------- |
| EXIT-001 | Success          | Command succeeds      | 0                  |           |
| EXIT-002 | User cancel      | User cancels prompt   | 0 or 130           |           |
| EXIT-003 | Invalid args     | Bad arguments         | 1                  |           |
| EXIT-004 | Not found        | PR/worktree not found | 1                  |           |
| EXIT-005 | Permission error | Can't write           | 1                  |           |
| EXIT-006 | Network error    | Connection failed     | 1                  |           |

---

## Interactive UX Tests

### Prompt Consistency

| ID     | Test Case         | Tool     | Prompt Style     | Keyboard | Pass/Fail |
| ------ | ----------------- | -------- | ---------------- | -------- | --------- |
| UX-001 | lswt selection    | lswt     | Arrow keys       | ↑↓ Enter |           |
| UX-002 | newpr scenario    | newpr    | Numbered? Arrow? | Check    |           |
| UX-003 | cleanpr selection | cleanpr  | Multi-select?    | Check    |           |
| UX-004 | wtlink menu       | wtlink   | Arrow keys       | Check    |           |
| UX-005 | wtconfig wizard   | wtconfig | Input fields     | Check    |           |

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
| UX-003 | P1       | wtconfig | [INFO] and [WARN] prefixes appear in help text                  | **Confirmed** |
| UX-004 | P2       | wtlink   | manage --non-interactive lists 400+ files without summary       | **Confirmed** |
| UX-005 | P2       | wtlink   | Help text wraps mid-word due to terminal width                  | **Confirmed** |
| UX-006 | P3       | lswt     | Relative path '.' shown instead of full path                    | Open          |
| UX-007 | P3       | cleanpr  | Empty result arrays give no feedback message                    | Open          |
| UX-008 | P4       | all      | No post-action suggestions for next steps                       | Open          |
| UX-009 | P4       | newpr    | Numbered prompts instead of arrow-key navigation                | Open          |
| UX-010 | P1       | lswt     | Raw git error shown when not in git repo                        | **New**       |
| UX-011 | P2       | newpr    | PR #0 accepted instead of validated as invalid                  | **New**       |
| UX-012 | P2       | newpr    | --json with PR lookup shows text [INFO]/[ERROR] instead of JSON | **New**       |
| UX-013 | P2       | newpr    | Not in git repo returns UNKNOWN_ERROR instead of NOT_GIT_REPO   | **New**       |

### Testing Session: 2026-01-04

**Test Environment:**

- Platform: Linux 6.6.87.2-microsoft-standard-WSL2
- Node: v24.11.0
- Package: @camaradesuk/git-worktree-tools@1.5.0

**Tests Executed:**

- All lswt basic tests (LSW-001 through LSW-007): PASS
- All newpr error handling tests: Partial (found issues)
- All cleanpr tests: PASS
- All wtlink tests: Partial (confirmed known issues)
- All wtstate tests: PASS
- All wtconfig tests: Partial (confirmed help text issue)
- JSON validation: All PASS
- Exit codes: All PASS
- Performance: All within thresholds (lswt <250ms, wtstate <100ms)

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

```bash
#!/bin/bash
# test-json-outputs.sh - Validate all JSON outputs

set -e

echo "Testing lswt --json..."
node dist/cli/lswt.js --json | jq . > /dev/null

echo "Testing wtstate --json..."
node dist/cli/wtstate.js --json | jq . > /dev/null

echo "Testing cleanpr --dry-run --all --json..."
node dist/cli/cleanpr.js --dry-run --all --json | jq . > /dev/null

echo "All JSON outputs valid!"
```

```bash
#!/bin/bash
# test-exit-codes.sh - Verify exit codes

# Should succeed
node dist/cli/lswt.js --no-interactive > /dev/null
[ $? -eq 0 ] && echo "PASS: lswt success = 0" || echo "FAIL: lswt success != 0"

# Should fail (not in git repo)
cd /tmp
node /path/to/dist/cli/lswt.js 2>/dev/null
[ $? -eq 1 ] && echo "PASS: lswt not-git = 1" || echo "FAIL: lswt not-git != 1"
```

---

_This testing plan should be executed periodically, especially before releases, to catch regressions and identify new improvement opportunities._
