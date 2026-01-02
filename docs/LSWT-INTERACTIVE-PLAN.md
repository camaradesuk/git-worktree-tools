# Plan: Interactive lswt Enhancement

## Overview

Transform `lswt` from a read-only listing tool into an interactive worktree management hub. Users will be able to select a worktree from the list and perform context-aware actions on it.

## Current State

The current `lswt` command:

- Lists all worktrees with PR status (via `--status` flag)
- Displays worktree type (main, PR, branch, detached)
- Shows uncommitted changes indicator
- Supports JSON output (`--json`)
- Uses the `WorktreeDisplay` type with: path, name, branch, commit, type, prNumber, prState, hasChanges

## Goals

1. Add interactive mode (default when TTY available)
2. Allow worktree selection from list
3. Provide context-aware action menu based on worktree type
4. Maintain backwards compatibility (non-interactive mode with `--no-interactive` or piped output)

---

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 Add inquirer dependency

The project already uses `inquirer` in `wtlink/main-menu.ts`, so this is already available.

#### 1.2 Create new library module: `src/lib/lswt/interactive.ts`

**New types to add to `src/lib/lswt/types.ts`:**

```typescript
export interface InteractiveOptions extends ListOptions {
  interactive: boolean; // Enable interactive mode
}

export type WorktreeAction =
  | 'open_vscode'
  | 'cd_worktree'
  | 'remove_worktree'
  | 'open_pr_url'
  | 'create_pr'
  | 'link_configs'
  | 'show_details'
  | 'copy_path'
  | 'open_terminal'
  | 'back'
  | 'exit';

export interface ActionMenuItem {
  name: string;
  value: WorktreeAction;
  disabled?: boolean | string; // Can be disabled with reason
}
```

#### 1.3 Environment detection utilities (`src/lib/lswt/environment.ts`)

```typescript
export interface EnvironmentInfo {
  hasVscode: boolean;
  hasCursor: boolean; // Cursor IDE (VSCode fork)
  defaultEditor: 'vscode' | 'cursor' | null;
  platform: 'win32' | 'darwin' | 'linux';
  isInteractive: boolean; // TTY check
  shell: string;
}

export function detectEnvironment(): EnvironmentInfo;
export function isCommandAvailable(cmd: string): boolean;
export function getDefaultTerminal(): string;
```

**Detection logic:**

- VSCode: Check for `code` command in PATH
- Cursor: Check for `cursor` command in PATH
- Platform: `process.platform`
- TTY: `process.stdout.isTTY`

---

### Phase 2: Worktree Selection UI

#### 2.1 Update argument parsing (`src/lib/lswt/args.ts`)

Add new CLI options:

```
--interactive, -i     Enable interactive mode (default when TTY)
--no-interactive      Disable interactive mode
```

#### 2.2 Create worktree selector (`src/lib/lswt/interactive.ts`)

```typescript
export async function selectWorktree(worktrees: WorktreeDisplay[]): Promise<WorktreeDisplay | null>;
```

**Display format for selection:**

```
? Select a worktree:
  ❯ [main]     main              (clean)
    [PR #42]   feat/add-feature  (OPEN, 2 files changed)
    [PR #38]   fix/bug-fix       (MERGED)
    [branch]   experiment        (3 files changed)
    ────────────────────────────
    Exit
```

Use `inquirer` list prompt with custom formatting:

- Show type badge: `[main]`, `[PR #N]`, `[branch]`, `[detached]`
- Show branch name or "(detached)"
- Show PR state if applicable: `(OPEN)`, `(MERGED)`, `(CLOSED)`
- Show changes indicator if dirty

---

### Phase 3: Action Menu System

#### 3.1 Action menu builder (`src/lib/lswt/actions.ts`)

```typescript
export function buildActionMenu(worktree: WorktreeDisplay, env: EnvironmentInfo): ActionMenuItem[];
```

**Context-aware actions based on worktree type:**

| Action                | main | PR (OPEN) | PR (MERGED/CLOSED) | branch | detached |
| --------------------- | ---- | --------- | ------------------ | ------ | -------- |
| Open in editor        | Yes  | Yes       | Yes                | Yes    | Yes      |
| Open terminal here    | Yes  | Yes       | Yes                | Yes    | Yes      |
| Copy path             | Yes  | Yes       | Yes                | Yes    | Yes      |
| Show details          | Yes  | Yes       | Yes                | Yes    | Yes      |
| Open PR in browser    | -    | Yes       | Yes                | -      | -        |
| Create PR from branch | -    | -         | -                  | Yes    | -        |
| Remove worktree       | -    | Yes       | Yes                | Yes    | Yes      |
| Link config files     | Yes  | Yes       | Yes                | Yes    | Yes      |

#### 3.2 Action executor (`src/lib/lswt/actions.ts`)

```typescript
export async function executeAction(
  action: WorktreeAction,
  worktree: WorktreeDisplay,
  env: EnvironmentInfo,
  config: WorktreeConfig
): Promise<ActionResult>;

export interface ActionResult {
  success: boolean;
  message?: string;
  shouldExit?: boolean;
  shouldRefresh?: boolean; // Re-list worktrees after action
}
```

---

### Phase 4: Individual Action Implementations

#### 4.1 Open in Editor (`open_vscode`)

```typescript
async function openInEditor(worktree: WorktreeDisplay, env: EnvironmentInfo): Promise<ActionResult>;
```

**Implementation:**

- Detect available editor (VSCode > Cursor > fallback)
- Execute: `code <worktree.path>` or `cursor <worktree.path>`
- Support `--wait` flag option
- Handle Windows path normalization

**Edge cases:**

- Editor not installed: Show warning, suggest installation
- Remote worktree (SSH path): May not work, warn user

#### 4.2 Open Terminal Here (`open_terminal`)

```typescript
async function openTerminal(worktree: WorktreeDisplay, env: EnvironmentInfo): Promise<ActionResult>;
```

**Implementation per platform:**

- **macOS**: `open -a Terminal <path>` or iTerm2 if available
- **Linux**: Detect terminal (gnome-terminal, konsole, xterm) and open
- **Windows**: `start cmd /k "cd /d <path>"` or Windows Terminal if available

#### 4.3 Copy Path to Clipboard (`copy_path`)

```typescript
async function copyPath(worktree: WorktreeDisplay): Promise<ActionResult>;
```

**Implementation:**

- Use `clipboardy` package or native commands:
  - macOS: `pbcopy`
  - Linux: `xclip` or `xsel`
  - Windows: `clip`
- Copy absolute path

#### 4.4 Show Worktree Details (`show_details`)

```typescript
async function showDetails(worktree: WorktreeDisplay): Promise<ActionResult>;
```

**Display:**

```
╔══════════════════════════════════════════════════════════════════╗
║  Worktree Details                                                ║
╚══════════════════════════════════════════════════════════════════╝

  Path:     /home/user/workspace/repo.pr42
  Branch:   feat/add-feature
  Commit:   abc1234 (2 days ago)
  Type:     PR #42
  PR State: OPEN
  PR URL:   https://github.com/org/repo/pull/42
  Changes:  2 staged, 3 unstaged

  Recent commits on this branch:
    abc1234 feat: add new feature
    def5678 fix: resolve edge case
```

#### 4.5 Open PR in Browser (`open_pr_url`)

```typescript
async function openPrUrl(worktree: WorktreeDisplay): Promise<ActionResult>;
```

**Implementation:**

- Get PR URL from `github.getPr(worktree.prNumber)`
- Use `open` package or native commands:
  - macOS: `open <url>`
  - Linux: `xdg-open <url>`
  - Windows: `start <url>`

#### 4.6 Create PR from Branch (`create_pr`)

```typescript
async function createPrFromBranch(
  worktree: WorktreeDisplay,
  config: WorktreeConfig
): Promise<ActionResult>;
```

**Implementation flow:**

1. Check if branch is pushed to origin
2. Check if PR already exists for branch
3. Prompt for PR title (default: branch name formatted)
4. Prompt for draft status
5. Create PR using `github.createPr()`
6. **Optional**: Offer to rename worktree folder to match PR naming convention
7. Return PR URL and number

**Rename worktree option:**

```typescript
async function renameWorktreeForPr(
  oldPath: string,
  prNumber: number,
  config: WorktreeConfig
): Promise<ActionResult>;
```

This involves:

1. Calculate new path using `generateWorktreePath()`
2. `git worktree move <old> <new>` (Git 2.17+)
3. Fallback for older Git: remove + re-add worktree

#### 4.7 Remove Worktree (`remove_worktree`)

```typescript
async function removeWorktree(
  worktree: WorktreeDisplay,
  config: WorktreeConfig
): Promise<ActionResult>;
```

**Implementation:**

- Leverage existing `cleanpr` functionality
- Confirm action (especially if worktree has changes)
- For PR worktrees: offer to also delete local/remote branch
- Use `cleanWorktree()` from `src/lib/cleanpr/index.js`

**Safety checks:**

- Cannot remove main worktree
- Warn if uncommitted changes
- Confirm branch deletion

#### 4.8 Link Config Files (`link_configs`)

```typescript
async function linkConfigs(
  worktree: WorktreeDisplay,
  config: WorktreeConfig
): Promise<ActionResult>;
```

**Implementation:**

- Leverage existing `wtlink` functionality
- Auto-detect source (main worktree) and destination (selected worktree)
- Call `link.run()` from `src/lib/wtlink/link-configs.js`
- Show summary of linked files

---

### Phase 5: Main Interactive Loop

#### 5.1 Update CLI entry point (`src/cli/lswt.ts`)

```typescript
async function main(): Promise<void> {
  const result = parseArgs(process.argv.slice(2));

  // ... existing validation ...

  const worktrees = await gatherWorktreeInfo(repoRoot, options, deps);

  if (options.json) {
    console.log(formatJsonOutput(worktrees));
  } else if (options.interactive && process.stdout.isTTY) {
    await runInteractiveMode(worktrees, options);
  } else {
    printTable(worktrees, options, process.cwd());
  }
}
```

#### 5.2 Interactive mode loop (`src/lib/lswt/interactive.ts`)

```typescript
export async function runInteractiveMode(
  worktrees: WorktreeDisplay[],
  options: InteractiveOptions
): Promise<void> {
  const env = detectEnvironment();
  const config = loadConfig(git.getRepoRoot());

  let running = true;

  while (running) {
    // Show worktree list header
    printWorktreeHeader(worktrees);

    // Select worktree
    const selected = await selectWorktree(worktrees);

    if (!selected) {
      running = false;
      continue;
    }

    // Show action menu
    const action = await selectAction(selected, env);

    if (action === 'exit') {
      running = false;
      continue;
    }

    if (action === 'back') {
      continue;
    }

    // Execute action
    const result = await executeAction(action, selected, env, config);

    if (result.message) {
      console.log(result.success ? colors.success(result.message) : colors.error(result.message));
    }

    if (result.shouldRefresh) {
      // Re-gather worktree info after actions like remove
      worktrees = await gatherWorktreeInfo(repoRoot, options, deps);
    }

    if (result.shouldExit) {
      running = false;
    }

    await pressEnterToContinue();
  }
}
```

---

### Phase 6: Testing

#### 6.1 Unit tests for new modules

- `src/lib/lswt/environment.test.ts` - Environment detection
- `src/lib/lswt/actions.test.ts` - Action menu building, individual actions (mocked)
- `src/lib/lswt/interactive.test.ts` - Interactive flow (with mocked inquirer)

#### 6.2 Integration tests

- Test interactive mode with various worktree configurations
- Test action execution with real git operations (in temp repos)

---

### Phase 7: Documentation

#### 7.1 Update README.md

Add section for interactive mode:

````markdown
## Interactive Mode

When running `lswt` in a terminal, it enters interactive mode by default:

```bash
lswt              # Interactive mode
lswt --no-interactive  # List mode (original behavior)
lswt | cat        # Automatically uses list mode when piped
```
````

### Available Actions

After selecting a worktree, you can:

- **Open in VSCode/Cursor** - Launch editor in worktree
- **Open terminal** - Open new terminal at worktree path
- **Open PR** - Open pull request in browser (PR worktrees)
- **Create PR** - Create PR from branch (non-PR worktrees)
- **Link configs** - Sync gitignored files from main worktree
- **Remove worktree** - Clean up worktree and optionally delete branches
- **Show details** - View detailed worktree information
- **Copy path** - Copy worktree path to clipboard

```

#### 7.2 Update help text

```

Usage: lswt [options]

List git worktrees with PR status and optional interactive management.

Options:
-s, --status Show PR status for worktrees (requires gh cli)
-v, --verbose Show additional details (commit SHA, full paths)
-j, --json Output as JSON
-i, --interactive Enable interactive mode (default in TTY)
--no-interactive Disable interactive mode
-h, --help Show this help message

Interactive Mode:
When running in a terminal, lswt enters interactive mode where you can
select a worktree and perform actions like opening in an editor,
removing worktrees, or creating PRs.

```

---

## File Structure

New files to create:
```

src/lib/lswt/
├── index.ts (update exports)
├── types.ts (add new types)
├── args.ts (update for new options)
├── environment.ts (new - environment detection)
├── actions.ts (new - action definitions and execution)
├── interactive.ts (new - interactive UI loop)
├── environment.test.ts
├── actions.test.ts
└── interactive.test.ts

````

---

## Dependencies

**Existing (already in project):**
- `inquirer` - Interactive prompts

**New dependencies to add:**
- None required - can use native commands for clipboard/browser/terminal

**Optional enhancements:**
- `open` - Cross-platform open URLs/files (more reliable than native commands)
- `clipboardy` - Cross-platform clipboard access

---

## Migration & Compatibility

### Backwards Compatibility

- Default behavior when piped or `--json` remains unchanged
- `--no-interactive` flag preserves original list-only mode
- All existing CLI flags continue to work

### Breaking Changes

- None. Interactive mode is additive.

---

## Implementation Order

1. **Phase 1.2-1.3**: Create `environment.ts` with detection utilities
2. **Phase 2.1**: Update `args.ts` with new options
3. **Phase 2.2**: Create basic worktree selector in `interactive.ts`
4. **Phase 3**: Build action menu system in `actions.ts`
5. **Phase 4.1-4.4**: Implement simple actions (editor, terminal, copy, details)
6. **Phase 4.5**: Open PR in browser
7. **Phase 4.7-4.8**: Integrate with existing cleanpr and wtlink
8. **Phase 4.6**: Create PR from branch (most complex)
9. **Phase 5**: Wire up main interactive loop
10. **Phase 6**: Add tests
11. **Phase 7**: Update documentation

---

## Resolved Design Decisions

### 1. Editor Preference
**Decision**: Add config option with VSCode as default.

Add `preferredEditor` to `.worktreerc`:
```json
{
  "preferredEditor": "vscode"  // Options: "vscode" | "cursor" | "auto"
}
````

**Behavior**:

- `"vscode"` (default): Always use VSCode, warn if not available
- `"cursor"`: Always use Cursor, warn if not available
- `"auto"`: Detect available editor (VSCode > Cursor > warn)

**Implementation**:

- Update `WorktreeConfig` interface in `src/lib/config.ts`
- Add to `getDefaultConfig()` with value `"vscode"`
- Validate option in config loader

### 2. Worktree Rename (Git Version Requirement)

**Decision**: Require Git 2.17+ for worktree move, show disabled action with reason if below.

**Implementation**:

- Create `src/lib/lswt/git-version.ts`:

  ```typescript
  export interface GitVersion {
    major: number;
    minor: number;
    patch: number;
    raw: string;
  }

  export function getGitVersion(): GitVersion;
  export function isGitVersionAtLeast(required: { major: number; minor: number }): boolean;
  export const WORKTREE_MOVE_MIN_VERSION = { major: 2, minor: 17 };
  ```

- In action menu, show "Move worktree" as:
  ```
  Move worktree (disabled: requires Git 2.17+, you have 2.14.0)
  ```

### 3. Terminal/CD Integration

**Decision**: Open new terminal window at worktree path. Future enhancement: shell integration for in-place cd.

**Implementation per platform**:

- **macOS**:
  - Check for iTerm2: `open -a iTerm <path>`
  - Fallback: `open -a Terminal <path>`
- **Linux**:
  - Detect: gnome-terminal, konsole, xfce4-terminal, xterm
  - Execute: `<terminal> --working-directory=<path>`
- **Windows**:
  - Check for Windows Terminal: `wt -d <path>`
  - Fallback: `start cmd /k "cd /d <path>"`

**Future enhancement** (not in MVP):

- Shell integration that outputs `cd <path>` for parent shell to execute
- Requires shell-specific setup (bash function wrapper, etc.)

### 4. Action Confirmation Behavior

**Decision**: Confirm removes, prompt for PR draft status unless configured.

| Action          | Confirmation         | Details                              |
| --------------- | -------------------- | ------------------------------------ |
| Remove worktree | **Always**           | Extra warning if uncommitted changes |
| Create PR       | **Prompt for draft** | Unless `draftPr` set in config       |
| Link configs    | None                 | Reversible operation                 |

**Draft PR Visibility**:

- Add `isDraft` field to `WorktreeDisplay` type
- Show in worktree list: `[PR #42 DRAFT]` with distinct styling
- Show in action confirmation: "This will create a **DRAFT** PR" or "This will create a **READY FOR REVIEW** PR"

**Type update for WorktreeDisplay**:

```typescript
export interface WorktreeDisplay {
  // ... existing fields ...
  isDraft: boolean | null; // null for non-PR worktrees
}
```

### 5. Keyboard Shortcuts

**Decision**: Yes, with shortcuts always visible on screen.

**Display format**:

```
? Select a worktree:  (e: editor, t: terminal, p: PR, q: quit)
  ❯ [main]        main              (clean)
    [PR #42]      feat/add-feature  (OPEN, 2 files changed)
    [PR #38 DRAFT] fix/bug-fix      (OPEN)
```

**Shortcut mappings**:
| Key | Action | Context |
|-----|--------|---------|
| `e` | Open in editor | All |
| `t` | Open terminal | All |
| `p` | Open PR / Create PR | PR worktrees / branch worktrees |
| `d` | Show details | All |
| `c` | Copy path | All |
| `r` | Remove worktree | Non-main |
| `l` | Link configs | All |
| `q` | Quit | Always |
| `Esc` | Back/Quit | Always |

**Implementation**:

- Use inquirer's rawlist or custom key handler
- Show legend in prompt header
- Handle keypress events for immediate action

---

## Updated Type Definitions

### WorktreeDisplay (updated)

```typescript
export interface WorktreeDisplay {
  path: string;
  name: string;
  branch: string | null;
  commit: string;
  type: 'main' | 'pr' | 'branch' | 'detached';
  prNumber: number | null;
  prState: 'OPEN' | 'CLOSED' | 'MERGED' | null;
  isDraft: boolean | null; // NEW: null for non-PR worktrees
  hasChanges: boolean;
}
```

### WorktreeConfig additions

```typescript
export interface WorktreeConfig {
  // ... existing fields ...

  /**
   * Preferred editor for "Open in editor" action
   * Options: "vscode" | "cursor" | "auto"
   * Default: "vscode"
   */
  preferredEditor?: 'vscode' | 'cursor' | 'auto';
}
```

---

## Comprehensive Testing Strategy

### Testing Philosophy

1. **Test Pyramid**: Heavy unit tests, moderate integration, selective E2E
2. **Cross-Platform**: All tests must pass on Ubuntu, macOS, and Windows
3. **Isolation**: Unit tests use dependency injection, no real I/O
4. **Determinism**: Mock all external commands and system state
5. **Coverage Target**: 90%+ line coverage for new code

---

### Phase T1: Unit Tests

#### T1.1 Environment Detection (`src/lib/lswt/environment.test.ts`)

```typescript
describe('environment detection', () => {
  describe('detectEnvironment', () => {
    it('detects VSCode availability on PATH', async () => {
      // Mock execSync to simulate 'which code' success
    });

    it('detects Cursor availability on PATH', async () => {
      // Mock execSync to simulate 'which cursor' success
    });

    it('returns null editor when neither available', async () => {
      // Mock both commands failing
    });

    it('identifies platform correctly', () => {
      // Test with mocked process.platform values
    });

    it('detects TTY correctly', () => {
      // Mock process.stdout.isTTY
    });

    it('detects shell from environment', () => {
      // Mock process.env.SHELL and COMSPEC
    });
  });

  describe('isCommandAvailable', () => {
    it('returns true for available command', async () => {});
    it('returns false for missing command', async () => {});
    it('handles Windows where syntax correctly', async () => {});
    it('handles command with spaces in path', async () => {});
  });

  describe('getDefaultTerminal', () => {
    describe('on macOS', () => {
      it('returns iTerm2 when available', async () => {});
      it('falls back to Terminal.app', async () => {});
    });

    describe('on Linux', () => {
      it('detects gnome-terminal', async () => {});
      it('detects konsole', async () => {});
      it('detects xfce4-terminal', async () => {});
      it('falls back to xterm', async () => {});
    });

    describe('on Windows', () => {
      it('detects Windows Terminal', async () => {});
      it('falls back to cmd.exe', async () => {});
    });
  });
});
```

#### T1.2 Git Version Detection (`src/lib/lswt/git-version.test.ts`)

```typescript
describe('git version detection', () => {
  describe('getGitVersion', () => {
    it('parses standard version format (2.39.0)', () => {});
    it('parses version with extra info (2.39.0.windows.1)', () => {});
    it('parses Apple Git version (2.37.1 (Apple Git-137.1))', () => {});
    it('handles git not found error', () => {});
  });

  describe('isGitVersionAtLeast', () => {
    it('returns true when major version higher', () => {
      // Git 3.0.0 >= 2.17
    });

    it('returns true when major equal and minor higher', () => {
      // Git 2.20.0 >= 2.17
    });

    it('returns true when exactly equal', () => {
      // Git 2.17.0 >= 2.17
    });

    it('returns false when major version lower', () => {
      // Git 1.9.0 < 2.17
    });

    it('returns false when major equal but minor lower', () => {
      // Git 2.14.0 < 2.17
    });
  });
});
```

#### T1.3 Action Menu Building (`src/lib/lswt/actions.test.ts`)

```typescript
describe('action menu', () => {
  describe('buildActionMenu', () => {
    const mockEnvWithEditor: EnvironmentInfo = {
      hasVscode: true,
      hasCursor: false,
      defaultEditor: 'vscode',
      platform: 'darwin',
      isInteractive: true,
      shell: '/bin/zsh',
      gitVersion: { major: 2, minor: 39, patch: 0, raw: '2.39.0' },
    };

    describe('for main worktree', () => {
      const mainWorktree: WorktreeDisplay = {
        path: '/repo',
        name: 'repo',
        branch: 'main',
        commit: 'abc123',
        type: 'main',
        prNumber: null,
        prState: null,
        isDraft: null,
        hasChanges: false,
      };

      it('includes editor action', () => {});
      it('includes terminal action', () => {});
      it('includes copy path action', () => {});
      it('includes show details action', () => {});
      it('includes link configs action', () => {});
      it('excludes remove worktree action', () => {});
      it('excludes PR-related actions', () => {});
    });

    describe('for open PR worktree', () => {
      it('includes open PR in browser action', () => {});
      it('includes remove worktree action', () => {});
      it('excludes create PR action', () => {});
    });

    describe('for merged PR worktree', () => {
      it('includes open PR in browser action', () => {});
      it('includes remove worktree action with emphasis', () => {});
    });

    describe('for branch worktree (no PR)', () => {
      it('includes create PR action', () => {});
      it('excludes open PR action', () => {});
      it('includes remove worktree action', () => {});
    });

    describe('for detached HEAD worktree', () => {
      it('excludes create PR action', () => {});
      it('includes remove worktree action', () => {});
    });

    describe('with Git < 2.17', () => {
      it('disables move worktree with version reason', () => {});
    });

    describe('without editor available', () => {
      it('disables editor action with helpful message', () => {});
    });
  });

  describe('getActionShortcut', () => {
    it('returns correct shortcut for each action', () => {});
    it('returns null for actions without shortcuts', () => {});
  });

  describe('formatShortcutLegend', () => {
    it('formats legend for worktree with PR', () => {});
    it('formats legend for worktree without PR', () => {});
  });
});
```

#### T1.4 Action Execution (`src/lib/lswt/action-executors.test.ts`)

```typescript
describe('action executors', () => {
  describe('openInEditor', () => {
    it('opens VSCode with correct path', async () => {
      // Mock execa, verify 'code <path>' called
    });

    it('opens Cursor when configured', async () => {
      // Mock config with preferredEditor: 'cursor'
    });

    it('returns error when editor not available', async () => {});

    it('handles paths with spaces', async () => {});

    it('handles Windows paths correctly', async () => {});
  });

  describe('openTerminal', () => {
    describe('on macOS', () => {
      it('opens iTerm2 at path when available', async () => {});
      it('opens Terminal.app at path as fallback', async () => {});
    });

    describe('on Linux', () => {
      it('opens detected terminal at path', async () => {});
    });

    describe('on Windows', () => {
      it('opens Windows Terminal at path when available', async () => {});
      it('opens cmd at path as fallback', async () => {});
    });
  });

  describe('copyPath', () => {
    it('copies path to clipboard on macOS', async () => {
      // Mock execSync with pbcopy
    });

    it('copies path to clipboard on Linux', async () => {
      // Mock xclip
    });

    it('copies path to clipboard on Windows', async () => {
      // Mock clip command
    });

    it('returns success message with path', async () => {});
  });

  describe('showDetails', () => {
    it('formats and displays worktree details', async () => {});
    it('shows recent commits for branch', async () => {});
    it('shows PR URL for PR worktrees', async () => {});
  });

  describe('openPrUrl', () => {
    it('opens PR URL in browser', async () => {});
    it('returns error for non-PR worktree', async () => {});
  });

  describe('createPr', () => {
    it('prompts for title and creates PR', async () => {});
    it('uses config draftPr setting when set', async () => {});
    it('prompts for draft when not configured', async () => {});
    it('offers to rename worktree after creation', async () => {});
    it('returns PR URL on success', async () => {});
  });

  describe('removeWorktree', () => {
    it('confirms before removal', async () => {});
    it('shows extra warning for dirty worktree', async () => {});
    it('offers branch deletion for PR worktrees', async () => {});
    it('prevents removal of main worktree', async () => {});
    it('returns shouldRefresh on success', async () => {});
  });

  describe('linkConfigs', () => {
    it('runs wtlink with correct source and dest', async () => {});
    it('shows summary of linked files', async () => {});
  });
});
```

#### T1.5 Interactive Flow (`src/lib/lswt/interactive.test.ts`)

```typescript
describe('interactive mode', () => {
  describe('selectWorktree', () => {
    it('displays formatted worktree list', async () => {});
    it('shows type badge for each worktree', () => {});
    it('shows DRAFT indicator for draft PRs', () => {});
    it('shows changes indicator for dirty worktrees', () => {});
    it('returns selected worktree', async () => {});
    it('returns null when Exit selected', async () => {});
  });

  describe('selectAction', () => {
    it('displays context-appropriate actions', async () => {});
    it('shows shortcuts in prompt', () => {});
    it('handles shortcut keypress', async () => {});
    it('returns selected action', async () => {});
  });

  describe('runInteractiveMode', () => {
    it('loops until exit', async () => {});
    it('refreshes worktree list after remove', async () => {});
    it('shows action result message', async () => {});
    it('handles back navigation', async () => {});
  });

  describe('formatWorktreeChoice', () => {
    it('formats main worktree correctly', () => {
      expect(formatWorktreeChoice(mainWt)).toBe('[main]        main              (clean)');
    });

    it('formats open PR worktree correctly', () => {
      expect(formatWorktreeChoice(prWt)).toBe(
        '[PR #42]      feat/add-feature  (OPEN, 2 files changed)'
      );
    });

    it('formats draft PR worktree correctly', () => {
      expect(formatWorktreeChoice(draftPrWt)).toBe('[PR #38 DRAFT] fix/bug-fix      (OPEN)');
    });

    it('formats merged PR worktree correctly', () => {
      expect(formatWorktreeChoice(mergedWt)).toBe('[PR #35]      old-feature       (MERGED)');
    });
  });
});
```

#### T1.6 Argument Parsing Updates (`src/lib/lswt/args.test.ts`)

```typescript
describe('argument parsing (interactive options)', () => {
  describe('--interactive flag', () => {
    it('enables interactive mode explicitly', () => {
      const result = parseArgs(['--interactive']);
      expect(result).toEqual({
        kind: 'success',
        options: expect.objectContaining({ interactive: true }),
      });
    });

    it('parses -i shorthand', () => {
      const result = parseArgs(['-i']);
      expect(result).toEqual({
        kind: 'success',
        options: expect.objectContaining({ interactive: true }),
      });
    });
  });

  describe('--no-interactive flag', () => {
    it('disables interactive mode', () => {
      const result = parseArgs(['--no-interactive']);
      expect(result).toEqual({
        kind: 'success',
        options: expect.objectContaining({ interactive: false }),
      });
    });
  });

  describe('default behavior', () => {
    it('defaults interactive to undefined (runtime TTY check)', () => {
      const result = parseArgs([]);
      expect(result).toEqual({
        kind: 'success',
        options: expect.objectContaining({ interactive: undefined }),
      });
    });
  });

  describe('mutual exclusivity', () => {
    it('returns error when --json and --interactive combined', () => {
      const result = parseArgs(['--json', '--interactive']);
      expect(result).toEqual({
        kind: 'error',
        message: expect.stringContaining('cannot be used together'),
      });
    });
  });
});
```

---

### Phase T2: Integration Tests

#### T2.1 Worktree Detection + Actions (`src/integration/lswt-actions.test.ts`)

```typescript
describe('lswt action integration', () => {
  let tempDir: string;
  let mainRepo: string;
  let worktreePath: string;

  beforeEach(async () => {
    // Create temp directory
    // Initialize git repo with commits
    // Create a worktree
  });

  afterEach(async () => {
    // Clean up temp directory
  });

  describe('worktree removal', () => {
    it('removes worktree and cleans up', async () => {
      // Create worktree
      // Execute remove action
      // Verify worktree gone from `git worktree list`
      // Verify directory removed
    });

    it('removes worktree with uncommitted changes after confirmation', async () => {
      // Create worktree with dirty state
      // Execute remove with confirmation mock
      // Verify cleanup
    });
  });

  describe('worktree move (Git 2.17+)', () => {
    it('moves worktree to new location', async () => {
      // Skip if Git < 2.17
      // Create worktree
      // Execute move
      // Verify new path in `git worktree list`
    });
  });

  describe('config file linking', () => {
    it('links files from main to worktree', async () => {
      // Create file in main repo
      // Add to syncPatterns
      // Execute link action
      // Verify hard link exists in worktree
    });
  });
});
```

#### T2.2 GitHub Integration (`src/integration/lswt-github.test.ts`)

```typescript
describe('lswt GitHub integration', () => {
  // These tests require GH_TOKEN and run against real GitHub
  // Skip in CI unless explicitly enabled

  describe('PR status fetching', () => {
    it('fetches draft status for PR worktrees', async () => {
      // Mock or use test repo with known PRs
    });
  });

  describe('create PR action', () => {
    it('creates PR from branch worktree', async () => {
      // Would need test repo permissions
      // Consider mocking gh CLI responses
    });
  });
});
```

---

### Phase T3: End-to-End Tests

#### T3.1 CLI E2E (`src/e2e/lswt-e2e.test.ts`)

```typescript
describe('lswt e2e', () => {
  describe('non-interactive mode', () => {
    it('lists worktrees in table format', async () => {
      const result = await runCli(['lswt', '--no-interactive']);
      expect(result.stdout).toContain('[main]');
      expect(result.exitCode).toBe(0);
    });

    it('outputs JSON with --json flag', async () => {
      const result = await runCli(['lswt', '--json']);
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('uses non-interactive mode when piped', async () => {
      const result = await runCli(['lswt'], { pipe: true });
      // Verify no inquirer prompts in output
    });
  });

  describe('interactive mode simulation', () => {
    // Use pty.js or similar to simulate TTY
    it('shows worktree selection prompt', async () => {
      const pty = await createPty(['lswt']);
      await pty.waitFor('Select a worktree');
      pty.kill();
    });

    it('responds to shortcut keys', async () => {
      const pty = await createPty(['lswt']);
      await pty.waitFor('Select a worktree');
      pty.write('q'); // Quit shortcut
      await pty.waitForExit();
      expect(pty.exitCode).toBe(0);
    });
  });
});
```

#### T3.2 Cross-Platform E2E (CI Matrix)

```yaml
# In .github/workflows/ci.yml
jobs:
  e2e:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20, 22]

    steps:
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          FORCE_COLOR: 0 # Disable colors for consistent output
```

**Platform-specific E2E tests**:

```typescript
describe('platform-specific e2e', () => {
  describe('terminal opening', () => {
    it.runIf(process.platform === 'darwin')('opens Terminal.app on macOS', async () => {
      // Test using AppleScript to verify terminal opened
    });

    it.runIf(process.platform === 'linux')('opens gnome-terminal on Linux', async () => {
      // Test terminal process started
    });

    it.runIf(process.platform === 'win32')('opens cmd on Windows', async () => {
      // Test cmd process started
    });
  });

  describe('clipboard operations', () => {
    it.runIf(process.platform === 'darwin')('copies to macOS clipboard', async () => {
      // Execute action, then pbpaste to verify
    });

    it.runIf(process.platform === 'linux')('copies to Linux clipboard', async () => {
      // Execute action, then xclip -o to verify
    });

    it.runIf(process.platform === 'win32')('copies to Windows clipboard', async () => {
      // Execute action, then PowerShell Get-Clipboard to verify
    });
  });
});
```

---

### Testing Utilities

#### Mocking Framework (`src/test-utils/mocks.ts`)

```typescript
export function mockEnvironment(overrides: Partial<EnvironmentInfo>): EnvironmentInfo;

export function mockWorktree(overrides: Partial<WorktreeDisplay>): WorktreeDisplay;

export function mockGitCommands(responses: Record<string, string | Error>): void;

export function mockInquirer(responses: Array<unknown>): void;

export function createTempGitRepo(): Promise<{ path: string; cleanup: () => Promise<void> }>;

export function createWorktreeFixture(
  type: 'main' | 'pr' | 'branch' | 'detached',
  options?: { dirty?: boolean; prNumber?: number; isDraft?: boolean }
): WorktreeDisplay;
```

#### Test Configuration (`vitest.config.ts` updates)

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/lib/lswt/**/*.ts'],
      exclude: ['**/*.test.ts', '**/test-utils/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
    // Separate test pools for unit/integration/e2e
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
  },
});
```

---

### Test Execution Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run src/lib",
    "test:integration": "vitest run src/integration",
    "test:e2e": "vitest run src/e2e",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage --reporter=junit --outputFile=test-results.xml"
  }
}
```

---

## Success Criteria

1. User can run `lswt` and interactively select a worktree
2. Action menu shows context-appropriate options based on worktree type
3. All actions execute correctly on macOS, Linux, and Windows
4. Non-interactive mode (`--no-interactive`, piped output) works as before
5. Draft PRs are clearly indicated in worktree list with `[PR #N DRAFT]`
6. Keyboard shortcuts work and are visible in prompt
7. Git version < 2.17 shows disabled "Move worktree" with clear reason
8. Editor preference respects `.worktreerc` config
9. **Test coverage ≥ 90%** for all new code
10. All tests pass on Ubuntu, macOS, and Windows in CI
11. Documentation is updated
