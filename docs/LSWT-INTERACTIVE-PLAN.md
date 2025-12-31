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
  interactive: boolean;  // Enable interactive mode
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
  disabled?: boolean | string;  // Can be disabled with reason
}
```

#### 1.3 Environment detection utilities (`src/lib/lswt/environment.ts`)

```typescript
export interface EnvironmentInfo {
  hasVscode: boolean;
  hasCursor: boolean;  // Cursor IDE (VSCode fork)
  defaultEditor: 'vscode' | 'cursor' | null;
  platform: 'win32' | 'darwin' | 'linux';
  isInteractive: boolean;  // TTY check
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
export async function selectWorktree(
  worktrees: WorktreeDisplay[]
): Promise<WorktreeDisplay | null>;
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
export function buildActionMenu(
  worktree: WorktreeDisplay,
  env: EnvironmentInfo
): ActionMenuItem[];
```

**Context-aware actions based on worktree type:**

| Action | main | PR (OPEN) | PR (MERGED/CLOSED) | branch | detached |
|--------|------|-----------|-------------------|--------|----------|
| Open in editor | Yes | Yes | Yes | Yes | Yes |
| Open terminal here | Yes | Yes | Yes | Yes | Yes |
| Copy path | Yes | Yes | Yes | Yes | Yes |
| Show details | Yes | Yes | Yes | Yes | Yes |
| Open PR in browser | - | Yes | Yes | - | - |
| Create PR from branch | - | - | - | Yes | - |
| Remove worktree | - | Yes | Yes | Yes | Yes |
| Link config files | Yes | Yes | Yes | Yes | Yes |

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
  shouldRefresh?: boolean;  // Re-list worktrees after action
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
```markdown
## Interactive Mode

When running `lswt` in a terminal, it enters interactive mode by default:

```bash
lswt              # Interactive mode
lswt --no-interactive  # List mode (original behavior)
lswt | cat        # Automatically uses list mode when piped
```

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
  -s, --status         Show PR status for worktrees (requires gh cli)
  -v, --verbose        Show additional details (commit SHA, full paths)
  -j, --json           Output as JSON
  -i, --interactive    Enable interactive mode (default in TTY)
  --no-interactive     Disable interactive mode
  -h, --help           Show this help message

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
  ├── index.ts           (update exports)
  ├── types.ts           (add new types)
  ├── args.ts            (update for new options)
  ├── environment.ts     (new - environment detection)
  ├── actions.ts         (new - action definitions and execution)
  ├── interactive.ts     (new - interactive UI loop)
  ├── environment.test.ts
  ├── actions.test.ts
  └── interactive.test.ts
```

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

## Open Questions

1. **Editor preference**: Should we add a config option for preferred editor? Current plan is auto-detect VSCode > Cursor.

2. **Worktree rename**: Git 2.17+ supports `git worktree move`. Should we require this version or implement a fallback?

3. **Terminal integration**: For "cd to worktree", we can't change the parent shell's directory. Options:
   - Open new terminal window at path (current plan)
   - Copy `cd <path>` to clipboard with instruction
   - Print path and suggest user copies it

4. **Action confirmation**: Which actions should require confirmation?
   - Remove worktree: Yes (especially with changes)
   - Create PR: Optional (draft vs ready)
   - Link configs: No (reversible)

5. **Quick actions**: Should we support keyboard shortcuts for common actions without selecting from menu first?
   - e.g., Press 'e' on a worktree to open in editor immediately

---

## Success Criteria

1. User can run `lswt` and interactively select a worktree
2. Action menu shows context-appropriate options based on worktree type
3. All actions execute correctly on macOS, Linux, and Windows
4. Non-interactive mode (`--no-interactive`, piped output) works as before
5. Tests cover all new functionality
6. Documentation is updated
