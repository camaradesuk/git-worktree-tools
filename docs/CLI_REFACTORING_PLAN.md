# CLI Refactoring Plan for Testability

## Overview

This plan details how to refactor the 4 CLI tools (`newpr`, `cleanpr`, `lswt`, `wtlink`) to enable unit testing and achieve high coverage without subprocess instrumentation.

**Goal:** Extract business logic into testable pure functions, leaving CLI files as thin orchestration layers.

**Current State:**
- `src/lib/`: 77% coverage (unit tests work well)
- `src/cli/`: 0% coverage (subprocess issue)
- `src/lib/wtlink/`: 0% coverage (called from CLI, not directly tested)

**Target State:**
- `src/lib/`: 90%+ coverage
- `src/cli/`: Excluded from coverage (thin wrappers only)
- New `src/lib/*/core.ts` modules: 90%+ coverage

---

## Priority Order

| Priority | CLI Tool | Lines | Complexity | Risk | Effort |
|----------|----------|-------|------------|------|--------|
| 1 | lswt | 361 | Low | Low | 0.5 day |
| 2 | cleanpr | 546 | Medium | Medium | 1 day |
| 3 | newpr | 1066 | High | High | 2 days |
| 4 | wtlink | 163 | Low | Low | 0.5 day |

**Rationale:** Start with `lswt` (simplest) to establish patterns, then apply to more complex tools. `wtlink` is last because it's already well-structured with yargs.

---

## Phase 1: lswt Refactoring

### Current Structure
```
src/cli/lswt.ts (361 lines)
├── parseArgs(): ListOptions          # Pure except process.exit
├── printHelp(): void                 # Side effect (console.log)
├── extractPrNumber(): number | null  # Pure
├── isMainWorktree(): boolean         # Pure
├── hasUncommittedChanges(): boolean  # I/O (shell exec)
├── getPrState(): Promise<string>     # I/O (github API)
├── formatTypeLabel(): string         # Pure
├── gatherWorktreeInfo(): Promise<WorktreeDisplay[]>  # Mixed
├── printTable(): void                # Side effect
├── printJson(): void                 # Side effect
└── main(): Promise<void>             # Orchestration
```

### Refactored Structure
```
src/lib/lswt/
├── types.ts           # Shared types (ListOptions, WorktreeDisplay)
├── args.ts            # Argument parsing (pure functions)
├── worktree-info.ts   # Data gathering logic
├── formatters.ts      # Output formatting (pure functions)
├── index.ts           # Public API exports
├── args.test.ts       # Unit tests
├── worktree-info.test.ts
└── formatters.test.ts

src/cli/lswt.ts        # Thin wrapper (~30 lines)
```

### Extractable Functions

#### 1. `src/lib/lswt/types.ts`
```typescript
export interface ListOptions {
  showStatus: boolean;
  json: boolean;
  verbose: boolean;
}

export interface WorktreeDisplay {
  path: string;
  name: string;
  branch: string | null;
  commit: string;
  type: 'main' | 'pr' | 'branch' | 'detached';
  prNumber: number | null;
  prState: string | null;
  hasChanges: boolean;
}

export type ParseResult =
  | { success: true; options: ListOptions }
  | { success: false; error: string }
  | { success: false; help: true };
```

#### 2. `src/lib/lswt/args.ts`
```typescript
import type { ListOptions, ParseResult } from './types.js';

export function parseArgs(args: string[]): ParseResult {
  const options: ListOptions = {
    showStatus: false,
    json: false,
    verbose: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '-h':
      case '--help':
        return { success: false, help: true };
      case '-s':
      case '--status':
        options.showStatus = true;
        break;
      case '-j':
      case '--json':
        options.json = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      default:
        if (arg.startsWith('-')) {
          return { success: false, error: `Unknown option: ${arg}` };
        }
    }
  }

  return { success: true, options };
}

export function getHelpText(): string {
  return `
lswt - List git worktrees with PR status

USAGE
  lswt [options]

OPTIONS
  -s, --status    Include PR status from GitHub
  -j, --json      Output as JSON
  -v, --verbose   Show more details
  -h, --help      Show this help message
`;
}
```

#### 3. `src/lib/lswt/args.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs, getHelpText } from './args.js';

describe('lswt/args', () => {
  describe('parseArgs', () => {
    it('returns default options for empty args', () => {
      const result = parseArgs([]);
      expect(result).toEqual({
        success: true,
        options: { showStatus: false, json: false, verbose: false }
      });
    });

    it('parses --status flag', () => {
      const result = parseArgs(['--status']);
      expect(result).toEqual({
        success: true,
        options: { showStatus: true, json: false, verbose: false }
      });
    });

    it('parses -s short flag', () => {
      const result = parseArgs(['-s']);
      expect(result).toEqual({
        success: true,
        options: { showStatus: true, json: false, verbose: false }
      });
    });

    it('parses --json flag', () => {
      const result = parseArgs(['--json']);
      expect(result).toEqual({
        success: true,
        options: { showStatus: false, json: true, verbose: false }
      });
    });

    it('parses multiple flags', () => {
      const result = parseArgs(['-s', '-j', '-v']);
      expect(result).toEqual({
        success: true,
        options: { showStatus: true, json: true, verbose: true }
      });
    });

    it('returns help signal for --help', () => {
      expect(parseArgs(['--help'])).toEqual({ success: false, help: true });
      expect(parseArgs(['-h'])).toEqual({ success: false, help: true });
    });

    it('returns error for unknown option', () => {
      const result = parseArgs(['--unknown']);
      expect(result).toEqual({
        success: false,
        error: 'Unknown option: --unknown'
      });
    });

    it('returns error for invalid short option', () => {
      const result = parseArgs(['-x']);
      expect(result).toEqual({
        success: false,
        error: 'Unknown option: -x'
      });
    });
  });

  describe('getHelpText', () => {
    it('includes command name', () => {
      expect(getHelpText()).toContain('lswt');
    });

    it('documents all options', () => {
      const help = getHelpText();
      expect(help).toContain('--status');
      expect(help).toContain('--json');
      expect(help).toContain('--verbose');
      expect(help).toContain('--help');
    });
  });
});
```

#### 4. `src/lib/lswt/formatters.ts`
```typescript
import type { WorktreeDisplay } from './types.js';

export function formatTypeLabel(display: WorktreeDisplay): string {
  switch (display.type) {
    case 'main':
      return '[main]';
    case 'pr':
      const prLabel = `PR #${display.prNumber}`;
      if (display.prState === 'OPEN') return `[${prLabel} OPEN]`;
      if (display.prState === 'MERGED') return `[${prLabel} MERGED]`;
      if (display.prState === 'CLOSED') return `[${prLabel} CLOSED]`;
      return `[${prLabel}]`;
    case 'branch':
      return '[branch]';
    case 'detached':
      return '[detached]';
    default:
      return '[unknown]';
  }
}

export function formatTableOutput(
  worktrees: WorktreeDisplay[],
  options: { verbose: boolean; cwd: string }
): string[] {
  // Returns array of lines to print (without colors for testability)
  // Colors applied in CLI wrapper
}

export function formatJsonOutput(worktrees: WorktreeDisplay[]): string {
  return JSON.stringify(worktrees.map(wt => ({
    path: wt.path,
    name: wt.name,
    branch: wt.branch,
    commit: wt.commit,
    type: wt.type,
    prNumber: wt.prNumber,
    prState: wt.prState,
    hasChanges: wt.hasChanges,
  })), null, 2);
}
```

#### 5. Refactored `src/cli/lswt.ts` (~40 lines)
```typescript
#!/usr/bin/env node
import * as colors from '../lib/colors.js';
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import { loadConfig } from '../lib/config.js';
import { parseArgs, getHelpText } from '../lib/lswt/args.js';
import { gatherWorktreeInfo } from '../lib/lswt/worktree-info.js';
import { formatTableOutput, formatJsonOutput } from '../lib/lswt/formatters.js';

async function main(): Promise<void> {
  const result = parseArgs(process.argv.slice(2));

  if (!result.success) {
    if ('help' in result) {
      console.log(getHelpText());
      process.exit(0);
    }
    console.error(colors.error(result.error));
    process.exit(1);
  }

  const options = result.options;

  if (options.showStatus && !github.isGhInstalled()) {
    console.error(colors.warning('GitHub CLI not installed. PR status unavailable.'));
    options.showStatus = false;
  }

  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    process.exit(1);
  }

  const config = loadConfig(repoRoot);
  const worktrees = await gatherWorktreeInfo(repoRoot, config, options);

  if (options.json) {
    console.log(formatJsonOutput(worktrees));
  } else {
    const lines = formatTableOutput(worktrees, {
      verbose: options.verbose,
      cwd: process.cwd()
    });
    for (const line of lines) {
      console.log(line);
    }
  }
}

main().catch(err => {
  console.error(colors.error(`Error: ${err.message}`));
  process.exit(1);
});
```

---

## Phase 2: cleanpr Refactoring

### Current Structure
```
src/cli/cleanpr.ts (546 lines)
├── parseArgs()                    # Pure except process.exit
├── printHelp()                    # Side effect
├── extractPrNumber()              # Pure (duplicate of lswt)
├── hasUncommittedChanges()        # I/O
├── getPrState()                   # I/O
├── getWorktreeInfoList()          # Mixed
├── cleanWorktree()                # I/O + side effects
├── interactiveClean()             # I/O + prompts
├── cleanAll()                     # Orchestration
├── cleanSpecific()                # Orchestration
└── main()                         # Entry point
```

### Refactored Structure
```
src/lib/cleanpr/
├── types.ts           # CleanOptions, WorktreeInfo
├── args.ts            # Argument parsing
├── worktree-ops.ts    # Worktree operations (with dependency injection)
├── index.ts           # Public exports
├── args.test.ts
└── worktree-ops.test.ts

src/lib/shared/
├── pr-utils.ts        # extractPrNumber (shared with lswt)
├── worktree-status.ts # hasUncommittedChanges, getPrState
└── *.test.ts
```

### Key Extractions

#### 1. `src/lib/cleanpr/args.ts`
```typescript
export interface CleanOptions {
  deleteRemote: boolean;
  force: boolean;
  all: boolean;
  interactive: boolean;
}

export type ParseResult =
  | { success: true; prNumber: number | null; options: CleanOptions }
  | { success: false; error: string }
  | { success: false; help: true };

export function parseArgs(args: string[]): ParseResult {
  let prNumber: number | null = null;
  const options: CleanOptions = {
    deleteRemote: false,
    force: false,
    all: false,
    interactive: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        return { success: false, help: true };
      case '-r':
      case '--remote':
        options.deleteRemote = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-a':
      case '--all':
        options.all = true;
        options.interactive = false;
        break;
      default:
        if (arg.startsWith('-')) {
          return { success: false, error: `Unknown option: ${arg}` };
        }
        const num = parseInt(arg, 10);
        if (isNaN(num)) {
          return { success: false, error: `Invalid PR number: ${arg}` };
        }
        prNumber = num;
        options.interactive = false;
    }
  }

  return { success: true, prNumber, options };
}
```

#### 2. `src/lib/cleanpr/args.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from './args.js';

describe('cleanpr/args', () => {
  describe('parseArgs', () => {
    it('returns default interactive mode for empty args', () => {
      const result = parseArgs([]);
      expect(result).toEqual({
        success: true,
        prNumber: null,
        options: {
          deleteRemote: false,
          force: false,
          all: false,
          interactive: true,
        }
      });
    });

    it('parses PR number', () => {
      const result = parseArgs(['123']);
      expect(result).toMatchObject({
        success: true,
        prNumber: 123,
        options: { interactive: false }
      });
    });

    it('parses --remote flag', () => {
      const result = parseArgs(['123', '--remote']);
      expect(result).toMatchObject({
        success: true,
        prNumber: 123,
        options: { deleteRemote: true }
      });
    });

    it('parses combined flags', () => {
      const result = parseArgs(['123', '-r', '-f']);
      expect(result).toMatchObject({
        success: true,
        prNumber: 123,
        options: { deleteRemote: true, force: true }
      });
    });

    it('parses --all flag', () => {
      const result = parseArgs(['--all']);
      expect(result).toMatchObject({
        success: true,
        prNumber: null,
        options: { all: true, interactive: false }
      });
    });

    it('returns error for invalid PR number', () => {
      expect(parseArgs(['abc'])).toEqual({
        success: false,
        error: 'Invalid PR number: abc'
      });
    });

    it('returns error for unknown option', () => {
      expect(parseArgs(['--unknown'])).toEqual({
        success: false,
        error: 'Unknown option: --unknown'
      });
    });

    it('returns help signal', () => {
      expect(parseArgs(['--help'])).toEqual({ success: false, help: true });
    });
  });
});
```

#### 3. `src/lib/shared/pr-utils.ts` (shared between lswt and cleanpr)
```typescript
export function extractPrNumber(worktreeName: string): number | null {
  const patterns = [
    /\.pr(\d+)$/,
    /\.pr-(\d+)$/,
    /-pr(\d+)$/,
    /_pr(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = worktreeName.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

export function extractPrNumberWithPattern(
  worktreeName: string,
  configPattern: string
): number | null {
  if (configPattern.includes('{number}')) {
    const regexStr = configPattern
      .replace('{repo}', '.*')
      .replace('{number}', '(\\d+)')
      .replace(/\./g, '\\.');
    const match = worktreeName.match(new RegExp(regexStr));
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return extractPrNumber(worktreeName);
}
```

---

## Phase 3: newpr Refactoring

### Current Structure (Most Complex)
```
src/cli/newpr.ts (1066 lines)
├── parseArgs()                           # 100 lines
├── printHelp()                           # 22 lines
├── checkPrerequisites()                  # Side effects
├── showLocalCommits()                    # Display helper
├── showUncommittedChanges()              # Display helper
├── showStagedChanges()                   # Display helper
├── showUnstagedChanges()                 # Display helper
├── handleScenario()                      # 300+ lines, complex logic
├── executeStateAction()                  # 60 lines
├── setupWorktree()                       # 40 lines
├── printSummary()                        # Display helper
├── modeExistingPr()                      # 50 lines
├── modeExistingBranch()                  # 80 lines
├── modeNewFeature()                      # 150 lines
└── main()                                # Orchestration
```

### Refactored Structure
```
src/lib/newpr/
├── types.ts              # Options, StateAction, Mode enums
├── args.ts               # Argument parsing
├── scenario-handler.ts   # handleScenario logic (most critical)
├── state-actions.ts      # executeStateAction logic
├── modes/
│   ├── existing-pr.ts    # modeExistingPr
│   ├── existing-branch.ts # modeExistingBranch
│   └── new-feature.ts    # modeNewFeature
├── display.ts            # Show* helper functions
├── index.ts
├── args.test.ts
├── scenario-handler.test.ts  # Most important tests
└── state-actions.test.ts
```

### Critical Extractions

#### 1. `src/lib/newpr/types.ts`
```typescript
export type Mode = 'new' | 'pr' | 'branch';

export interface Options {
  mode: Mode;
  description?: string;
  prNumber?: number;
  branchName?: string;
  baseBranch: string;
  draft: boolean;
  installDeps: boolean;
  openEditor: boolean;
  runWtlink: boolean;
}

export interface StateAction {
  action: ActionType;
  branchFrom: 'origin_main' | 'head';
  stashUnstaged: boolean;
}

export type ActionType =
  | 'empty_commit'
  | 'commit_staged'
  | 'commit_all'
  | 'stash_and_empty'
  | 'use_commits'
  | 'push_then_branch'
  | 'use_commits_and_commit_all'
  | 'use_commits_and_stash'
  | 'create_pr_for_branch'
  | 'pr_for_branch_commit_all'
  | 'pr_for_branch_stash'
  | 'branch_from_detached';

export type ParseResult =
  | { success: true; options: Options }
  | { success: false; error: string }
  | { success: false; help: true };
```

#### 2. `src/lib/newpr/scenario-handler.ts`
```typescript
import type { Scenario, GitState } from '../state-detection.js';
import type { StateAction, ActionType } from './types.js';

export interface ScenarioChoice {
  label: string;
  action: StateAction | null;  // null = cancel
}

/**
 * Get available choices for a scenario.
 * Returns pure data - no prompts or side effects.
 */
export function getScenarioChoices(
  scenario: Scenario,
  state: GitState,
  baseBranch: string
): { message: string; context: string[]; choices: ScenarioChoice[] } {
  switch (scenario) {
    case 'main_clean_same':
      return {
        message: 'No changes detected from main branch.',
        context: [
          "You are on 'main' with no local commits or uncommitted changes.",
          'A PR requires at least one commit difference from the base branch.',
        ],
        choices: [
          {
            label: 'Continue with empty initial commit',
            action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false },
          },
          {
            label: "Cancel - I'll make some changes first",
            action: null,
          },
        ],
      };

    case 'main_staged_same':
      return {
        message: 'You have staged changes ready to commit.',
        context: [],  // Staged files shown separately
        choices: [
          {
            label: 'Commit staged changes to the new PR branch',
            action: { action: 'commit_staged', branchFrom: 'origin_main', stashUnstaged: false },
          },
          {
            label: 'Leave changes here and continue with empty initial commit',
            action: { action: 'empty_commit', branchFrom: 'origin_main', stashUnstaged: false },
          },
          { label: 'Cancel', action: null },
        ],
      };

    // ... all 10 scenarios
  }
}

/**
 * Determine if scenario requires showing local commits
 */
export function shouldShowLocalCommits(scenario: Scenario): boolean {
  return [
    'main_clean_ahead',
    'main_changes_ahead',
    'branch_divergent',
    'branch_with_changes',
  ].includes(scenario);
}

/**
 * Determine if scenario requires showing staged changes
 */
export function shouldShowStagedChanges(scenario: Scenario): boolean {
  return ['main_staged_same', 'main_both_same'].includes(scenario);
}

/**
 * Determine if scenario requires showing unstaged changes
 */
export function shouldShowUnstagedChanges(scenario: Scenario): boolean {
  return [
    'main_unstaged_same',
    'main_both_same',
    'main_changes_ahead',
    'branch_with_changes',
  ].includes(scenario);
}
```

#### 3. `src/lib/newpr/scenario-handler.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import {
  getScenarioChoices,
  shouldShowLocalCommits,
  shouldShowStagedChanges,
  shouldShowUnstagedChanges,
} from './scenario-handler.js';
import type { GitState } from '../state-detection.js';

describe('newpr/scenario-handler', () => {
  const baseState: GitState = {
    worktreeType: 'main_worktree',
    branchType: 'main',
    currentBranch: 'main',
    commitRelationship: 'same',
    workingTreeStatus: 'clean',
    localCommits: [],
    stagedFiles: [],
    unstagedFiles: [],
    repoRoot: '/repo',
    repoName: 'repo',
  };

  describe('getScenarioChoices', () => {
    it('returns correct choices for main_clean_same', () => {
      const result = getScenarioChoices('main_clean_same', baseState, 'main');

      expect(result.message).toContain('No changes detected');
      expect(result.choices).toHaveLength(2);
      expect(result.choices[0].action).toEqual({
        action: 'empty_commit',
        branchFrom: 'origin_main',
        stashUnstaged: false,
      });
      expect(result.choices[1].action).toBeNull(); // Cancel
    });

    it('returns correct choices for main_staged_same', () => {
      const result = getScenarioChoices('main_staged_same', baseState, 'main');

      expect(result.choices).toHaveLength(3);
      expect(result.choices[0].label).toContain('Commit staged');
      expect(result.choices[0].action?.action).toBe('commit_staged');
    });

    it('returns correct choices for main_clean_ahead', () => {
      const state = { ...baseState, commitRelationship: 'ahead' as const };
      const result = getScenarioChoices('main_clean_ahead', state, 'main');

      expect(result.choices).toHaveLength(4);
      expect(result.choices[0].action?.branchFrom).toBe('head');
      expect(result.choices[1].action?.action).toBe('push_then_branch');
    });

    it('returns correct choices for branch_divergent', () => {
      const state = {
        ...baseState,
        branchType: 'other' as const,
        currentBranch: 'feature-x',
        commitRelationship: 'divergent' as const,
        localCommits: ['abc123 Some commit'],
      };
      const result = getScenarioChoices('branch_divergent', state, 'main');

      expect(result.choices[0].label).toContain('Create PR for THIS branch');
      expect(result.choices[0].action?.action).toBe('create_pr_for_branch');
    });

    // Test all 10 scenarios...
  });

  describe('shouldShowLocalCommits', () => {
    it('returns true for scenarios with local commits', () => {
      expect(shouldShowLocalCommits('main_clean_ahead')).toBe(true);
      expect(shouldShowLocalCommits('main_changes_ahead')).toBe(true);
      expect(shouldShowLocalCommits('branch_divergent')).toBe(true);
    });

    it('returns false for scenarios without local commits', () => {
      expect(shouldShowLocalCommits('main_clean_same')).toBe(false);
      expect(shouldShowLocalCommits('main_staged_same')).toBe(false);
    });
  });

  describe('shouldShowStagedChanges', () => {
    it('returns true for staged scenarios', () => {
      expect(shouldShowStagedChanges('main_staged_same')).toBe(true);
      expect(shouldShowStagedChanges('main_both_same')).toBe(true);
    });

    it('returns false for non-staged scenarios', () => {
      expect(shouldShowStagedChanges('main_clean_same')).toBe(false);
      expect(shouldShowStagedChanges('main_unstaged_same')).toBe(false);
    });
  });
});
```

#### 4. `src/lib/newpr/args.ts`
```typescript
import type { Options, ParseResult } from './types.js';

export function parseArgs(args: string[]): ParseResult {
  const options: Options = {
    mode: 'new',
    baseBranch: 'main',
    draft: true,
    installDeps: false,
    openEditor: false,
    runWtlink: true,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        return { success: false, help: true };

      case '--pr':
      case '-p':
        options.mode = 'pr';
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { success: false, error: '--pr requires a PR number' };
        }
        const prNum = parseInt(args[i], 10);
        if (isNaN(prNum)) {
          return { success: false, error: 'PR number must be numeric' };
        }
        options.prNumber = prNum;
        break;

      case '--branch':
      case '-B':
        options.mode = 'branch';
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { success: false, error: '--branch requires a branch name' };
        }
        options.branchName = args[i];
        break;

      case '-b':
      case '--base':
        i++;
        if (!args[i] || args[i].startsWith('-')) {
          return { success: false, error: '--base requires a branch name' };
        }
        options.baseBranch = args[i];
        break;

      case '-i':
      case '--install':
        options.installDeps = true;
        break;

      case '-c':
      case '--code':
        options.openEditor = true;
        break;

      case '-r':
      case '--ready':
        options.draft = false;
        break;

      case '--no-wtlink':
        options.runWtlink = false;
        break;

      default:
        if (arg.startsWith('-')) {
          return { success: false, error: `Unknown option: ${arg}` };
        }
        if (!options.description && options.mode === 'new') {
          options.description = arg;
        } else {
          return { success: false, error: `Unexpected argument: ${arg}` };
        }
    }
    i++;
  }

  // Validation
  if (options.mode === 'new' && !options.description) {
    return {
      success: false,
      error: 'Description required. Usage: newpr "feature description"'
    };
  }

  return { success: true, options };
}
```

---

## Phase 4: wtlink Refactoring

### Current State
`wtlink.ts` is already well-structured - it uses yargs and delegates to lib modules. The issue is that the lib modules themselves (`manage-manifest.ts`, `link-configs.ts`, `validate-manifest.ts`) lack unit tests.

### Refactoring Focus
Add unit tests for existing lib modules, no major restructuring needed.

```
src/lib/wtlink/
├── link-configs.ts          # Already has some tests
├── link-configs.test.ts     # Expand tests
├── manage-manifest.ts       # Needs tests
├── manage-manifest.test.ts  # NEW
├── validate-manifest.ts     # Has some tests
├── validate-manifest.test.ts # Expand tests
├── main-menu.ts             # Interactive, hard to test
└── main-menu.test.ts        # Limited testing (input/output)
```

### Test Strategy for wtlink

1. **link-configs.ts** - Test `createLink()`, `linkAllFiles()` with mock filesystem
2. **manage-manifest.ts** - Test manifest parsing, file discovery, manifest generation
3. **validate-manifest.ts** - Test validation logic with various manifest states
4. **main-menu.ts** - Skip or minimal testing (interactive menu)

---

## Implementation Checklist

### Phase 1: lswt (Day 1, Morning)
- [ ] Create `src/lib/lswt/` directory
- [ ] Extract `types.ts`
- [ ] Extract and test `args.ts`
- [ ] Extract and test `formatters.ts`
- [ ] Extract `worktree-info.ts` (with mocked dependencies)
- [ ] Refactor `src/cli/lswt.ts` to thin wrapper
- [ ] Verify all existing e2e tests still pass

### Phase 2: cleanpr (Day 1, Afternoon - Day 2, Morning)
- [ ] Create `src/lib/cleanpr/` directory
- [ ] Create `src/lib/shared/` for common utilities
- [ ] Extract and test `args.ts`
- [ ] Extract `pr-utils.ts` to shared
- [ ] Extract `worktree-ops.ts` (with dependency injection for git/github)
- [ ] Refactor `src/cli/cleanpr.ts`
- [ ] Verify e2e tests

### Phase 3: newpr (Day 2, Afternoon - Day 3)
- [ ] Create `src/lib/newpr/` directory
- [ ] Extract and test `types.ts`
- [ ] Extract and test `args.ts` (most complex argument parsing)
- [ ] Extract and test `scenario-handler.ts` (CRITICAL - most value here)
- [ ] Extract `state-actions.ts`
- [ ] Extract mode handlers
- [ ] Refactor `src/cli/newpr.ts`
- [ ] Verify e2e tests

### Phase 4: wtlink (Day 4, Morning)
- [ ] Add comprehensive tests for `manage-manifest.ts`
- [ ] Expand tests for `link-configs.ts`
- [ ] Expand tests for `validate-manifest.ts`
- [ ] No CLI changes needed

### Phase 5: Coverage Configuration (Day 4, Afternoon)
- [ ] Update `vitest.config.ts` to exclude `src/cli/**`
- [ ] Run full coverage report
- [ ] Document final coverage numbers
- [ ] Update CI to fail if lib coverage drops below 85%

---

## Testing Patterns

### Pattern 1: Pure Function Extraction
```typescript
// Before (in CLI file)
function parseArgs(args: string[]) {
  // ... parse ...
  if (invalid) {
    console.error('Error');
    process.exit(1);  // Side effect!
  }
  return options;
}

// After (in lib file)
function parseArgs(args: string[]): ParseResult {
  // ... parse ...
  if (invalid) {
    return { success: false, error: 'Error' };  // Pure!
  }
  return { success: true, options };
}
```

### Pattern 2: Dependency Injection for I/O
```typescript
// Before
async function cleanWorktree(info: WorktreeInfo) {
  await git.removeWorktree(info.path);  // Direct I/O
  console.log('Removed');               // Side effect
}

// After
interface CleanDeps {
  removeWorktree: (path: string, opts?: { force: boolean }) => Promise<void>;
  deleteLocalBranch: (branch: string) => Promise<boolean>;
  log: (msg: string) => void;
}

async function cleanWorktree(
  info: WorktreeInfo,
  deps: CleanDeps
): Promise<CleanResult> {
  await deps.removeWorktree(info.path);
  deps.log('Removed');
  return { success: true };
}

// In tests
it('removes worktree', async () => {
  const mockDeps = {
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    deleteLocalBranch: vi.fn().mockResolvedValue(true),
    log: vi.fn(),
  };

  await cleanWorktree(testInfo, mockDeps);

  expect(mockDeps.removeWorktree).toHaveBeenCalledWith('/path/to/wt');
});
```

### Pattern 3: Output as Data (for formatters)
```typescript
// Before
function printTable(worktrees: WorktreeDisplay[]) {
  console.log(colors.bold('Header'));
  for (const wt of worktrees) {
    console.log(formatLine(wt));  // Interleaved logic and output
  }
}

// After
function formatTable(worktrees: WorktreeDisplay[]): TableOutput {
  return {
    header: 'Header',
    rows: worktrees.map(wt => ({
      type: wt.type,
      branch: wt.branch,
      path: wt.path,
    })),
    summary: `${worktrees.length} worktrees`,
  };
}

// CLI applies colors and prints
const output = formatTable(worktrees);
console.log(colors.bold(output.header));
for (const row of output.rows) {
  console.log(formatRow(row));
}
```

---

## Expected Coverage After Refactoring

| Module | Before | After |
|--------|--------|-------|
| src/lib/colors.ts | 74% | 74% |
| src/lib/config.ts | 61% | 70%+ |
| src/lib/git.ts | 76% | 80%+ |
| src/lib/github.ts | 93% | 93% |
| src/lib/prompts.ts | 72% | 75%+ |
| src/lib/state-detection.ts | 58% | 70%+ |
| src/lib/lswt/*.ts | 0% | 90%+ |
| src/lib/cleanpr/*.ts | 0% | 85%+ |
| src/lib/newpr/*.ts | 0% | 90%+ |
| src/lib/wtlink/*.ts | 0% | 80%+ |
| src/lib/shared/*.ts | 0% | 95%+ |
| **src/lib/ total** | **77%** | **85%+** |
| src/cli/*.ts | 0% | Excluded |

---

## Risks and Mitigations

### Risk 1: Regression in CLI Behavior
**Mitigation:** Keep e2e tests running throughout. They validate end-to-end behavior even though they don't contribute to coverage.

### Risk 2: Over-engineering
**Mitigation:** Only extract what's testable. Keep orchestration in CLI files. Don't create abstractions for one-time use.

### Risk 3: Mocking Complexity
**Mitigation:** Use dependency injection sparingly. Prefer pure functions that don't need mocks.

### Risk 4: Breaking Changes
**Mitigation:** This is internal refactoring only. No public API changes. CLI behavior unchanged.

---

## Success Criteria

1. All existing e2e tests pass
2. New unit tests achieve 85%+ coverage on extracted modules
3. CLI files reduced to <50 lines each
4. No new dependencies added
5. Build time unchanged
6. Test run time < 5 seconds (unit tests only)
