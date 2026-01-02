# AI Agentic CLI Tooling Compatibility Plan

## Executive Summary

This document outlines a comprehensive strategy to make `@camaradesuk/git-worktree-tools` fully compatible with AI CLI tools like Claude Code, Gemini CLI, Codex CLI, and other agentic development workflows. The plan covers three major areas:

1. **AI Tool Compatibility** — Enable AI agents to autonomously manage git worktrees and PR workflows
2. **AI Content Generation** — Leverage AI to generate branch names, PR titles/descriptions, and plan documents
3. **Extensibility Framework** — Hooks, plugins, and user-defined scripts for workflow customization

### Design Philosophy

> **Easy to start, powerful to master**

The tools should work out-of-the-box with sensible defaults while offering deep customization for power users. A setup wizard guides new users, and progressive disclosure ensures complexity is hidden until needed.

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Non-Interactive Foundation | ✅ Complete |
| Phase 2 | State Query Command (`wtstate`) | ✅ Complete |
| Phase 3 | Programmatic API Layer | ✅ Complete |
| Phase 4 | MCP Server | ✅ Complete |
| Phase 5 | AI Content Generation | ✅ Complete |
| Phase 6 | Extensibility & Hooks | ✅ Complete |
| Phase 7 | Setup Wizard (`wtconfig`) | ✅ Complete |
| Phase 8 | Enhanced Configuration | ✅ Complete |

**Last Updated:** 2026-01-02
**Package Version:** 1.3.0

---

## Current State Analysis

### Existing Strengths

The library already has several AI-friendly characteristics:

1. **Modular Architecture**: Clean separation between CLI wrappers (`src/cli/`) and library code (`src/lib/`)
2. **TypeScript Types**: Well-defined interfaces (`GitState`, `Scenario`, `WorktreeConfig`, etc.)
3. **JSON Output Support**: `lswt --json` already provides machine-readable output
4. **Library Exports**: `src/index.ts` exposes core functions programmatically
5. **Clear Exit Codes**: Commands exit with appropriate codes on failure
6. **Non-Interactive Mode for cleanpr**: `cleanpr --all` and `cleanpr <PR_NUMBER>` bypass prompts
7. **wtlink --yes**: Already supports non-interactive mode for linking

### Current Limitations

1. **Interactive Prompts**: `newpr` relies heavily on `inquirer` prompts for state decisions
2. **No Unified JSON Output**: Only `lswt` supports `--json` (not `newpr`, `cleanpr`, or `wtlink`)
3. **Human-Centric Error Messages**: Errors formatted for terminal display, not structured
4. **No MCP Server**: Cannot be discovered/used by AI tools natively
5. **No State Query Commands**: AI tools can't ask "what's the current git state?"
6. **No `--action` Flag**: `newpr` can't pre-specify which action to take for a scenario

---

## Integration Strategies

### Strategy 1: Non-Interactive Mode (Essential)

Add `--yes` or `--non-interactive` flags to bypass all prompts with sensible defaults.

#### `newpr` Changes

```typescript
interface NewprOptions {
  // Existing
  pr?: number;
  branch?: string;
  draft?: boolean;
  baseBranch?: string;

  // NEW: AI-friendly options
  nonInteractive?: boolean;     // Skip all prompts
  action?: StateActionKey;      // Pre-specify action for scenario
  autoCommitMessage?: string;   // Auto-commit with this message
  json?: boolean;               // Output result as JSON
}
```

**Example usage by AI:**
```bash
# AI detects state, decides action, runs non-interactively
newpr "Add dark mode" --non-interactive --action=commit_staged --json
```

**JSON output:**
```json
{
  "success": true,
  "prNumber": 42,
  "prUrl": "https://github.com/org/repo/pull/42",
  "branch": "claude/add-dark-mode-xyz123",
  "worktreePath": "/home/user/repo.pr42"
}
```

#### `cleanpr` Changes

```typescript
interface CleanprOptions {
  // Existing
  all?: boolean;
  force?: boolean;
  deleteRemote?: boolean;

  // NEW
  nonInteractive?: boolean;
  json?: boolean;
  dryRun?: boolean;  // Already exists for wtlink, add to cleanpr
}
```

#### `wtlink` Changes

Already has `--yes` flag for `wtlink link`. Extend:

```typescript
interface WtlinkOptions {
  // Existing
  yes?: boolean;
  dryRun?: boolean;

  // NEW
  json?: boolean;  // Machine-readable output
}
```

### Strategy 2: Universal JSON Output Mode

Add `--json` flag to all commands for structured output.

**Standard JSON Response Schema:**

```typescript
interface CommandResult {
  success: boolean;
  command: string;
  timestamp: string;

  // Command-specific data
  data?: Record<string, unknown>;

  // Error information
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };

  // Warnings that didn't prevent success
  warnings?: string[];
}
```

**Error codes for programmatic handling:**

```typescript
enum ErrorCode {
  // Git errors
  NOT_GIT_REPO = 'NOT_GIT_REPO',
  DETACHED_HEAD = 'DETACHED_HEAD',
  UNCOMMITTED_CHANGES = 'UNCOMMITTED_CHANGES',
  BRANCH_EXISTS = 'BRANCH_EXISTS',
  WORKTREE_EXISTS = 'WORKTREE_EXISTS',

  // GitHub errors
  GH_NOT_INSTALLED = 'GH_NOT_INSTALLED',
  GH_NOT_AUTHENTICATED = 'GH_NOT_AUTHENTICATED',
  PR_NOT_FOUND = 'PR_NOT_FOUND',
  PR_ALREADY_EXISTS = 'PR_ALREADY_EXISTS',

  // Config errors
  INVALID_CONFIG = 'INVALID_CONFIG',

  // User errors
  USER_CANCELLED = 'USER_CANCELLED',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
}
```

### Strategy 3: State Query Commands (New Feature)

Add a new `wtstate` command for AI agents to query git state before taking action.

```bash
# Query current git state
wtstate --json

# Output:
{
  "scenario": "main_staged_same",
  "scenarioDescription": "On main branch, same as origin/main, staged changes only",
  "currentBranch": "main",
  "baseBranch": "main",
  "worktreeType": "main_worktree",
  "hasChanges": true,
  "hasStagedChanges": true,
  "hasUnstagedChanges": false,
  "localCommits": [],
  "stagedFiles": ["src/foo.ts"],
  "unstagedFiles": [],
  "availableActions": [
    { "key": "commit_staged", "label": "Commit staged changes to new PR" },
    { "key": "stash_staged", "label": "Stash changes and start fresh" },
    { "key": "include_staged", "label": "Move staged changes to worktree (uncommitted)" }
  ],
  "recommendedAction": "commit_staged"
}
```

This enables an AI workflow like:

```bash
# 1. AI queries state
STATE=$(wtstate --json)

# 2. AI analyzes and decides
ACTION=$(echo $STATE | jq -r '.recommendedAction')

# 3. AI executes with chosen action
newpr "Fix bug" --non-interactive --action=$ACTION --json
```

### Strategy 4: MCP Server Implementation (Advanced)

Create an MCP (Model Context Protocol) server that exposes git-worktree-tools to AI agents natively.

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent (Claude Code)               │
│                                                         │
│  "Create a PR for the current changes"                  │
└─────────────────────┬───────────────────────────────────┘
                      │ MCP Protocol
                      ▼
┌─────────────────────────────────────────────────────────┐
│              git-worktree-tools MCP Server              │
│                                                         │
│  Tools:                                                 │
│  - worktree_get_state     → analyzeGitState()          │
│  - worktree_create_pr     → newpr programmatic API     │
│  - worktree_list          → lswt programmatic API      │
│  - worktree_clean         → cleanpr programmatic API   │
│  - worktree_link_configs  → wtlink programmatic API    │
│                                                         │
│  Resources:                                             │
│  - worktree://state       → Current git state          │
│  - worktree://list        → List of worktrees          │
│  - worktree://config      → .worktreerc configuration  │
└─────────────────────────────────────────────────────────┘
```

#### MCP Server Implementation

Create `src/mcp/server.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'git-worktree-tools',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
    resources: {},
  },
});

// Tool: Get current git state
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'worktree_get_state') {
    const state = analyzeGitState();
    const scenario = detectScenario(state);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          scenario,
          ...state,
          availableActions: getAvailableActions(scenario),
        }),
      }],
    };
  }

  if (request.params.name === 'worktree_create_pr') {
    const { description, action, draft } = request.params.arguments;
    // Call programmatic API
    const result = await createPr({ description, action, draft });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result),
      }],
    };
  }
  // ... other tools
});
```

#### MCP Tool Definitions

```typescript
const tools = [
  {
    name: 'worktree_get_state',
    description: 'Analyze current git state and return available actions. Call this BEFORE creating a PR to understand what options are available.',
    inputSchema: {
      type: 'object',
      properties: {
        baseBranch: {
          type: 'string',
          description: 'Base branch to compare against (default: main)',
        },
      },
    },
  },
  {
    name: 'worktree_create_pr',
    description: 'Create a new PR with a dedicated worktree. Handles git state intelligently.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'PR title/description',
        },
        action: {
          type: 'string',
          enum: ['commit_staged', 'stash_all', 'include_changes', 'create_fresh'],
          description: 'How to handle current changes. Get available actions from worktree_get_state first.',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'worktree_list',
    description: 'List all git worktrees with their PR status',
    inputSchema: {
      type: 'object',
      properties: {
        includeStatus: {
          type: 'boolean',
          description: 'Include PR status (open/merged/closed)',
        },
      },
    },
  },
  {
    name: 'worktree_clean',
    description: 'Clean up worktrees for merged or closed PRs',
    inputSchema: {
      type: 'object',
      properties: {
        prNumber: {
          type: 'number',
          description: 'Specific PR to clean (optional, cleans all merged/closed if not specified)',
        },
        deleteRemote: {
          type: 'boolean',
          description: 'Also delete remote branches',
        },
        force: {
          type: 'boolean',
          description: 'Force remove even if not merged',
        },
      },
    },
  },
  {
    name: 'worktree_link_configs',
    description: 'Link config files from main worktree to a PR worktree',
    inputSchema: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          description: 'Destination worktree path',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview without making changes',
        },
      },
    },
  },
];
```

### Strategy 5: Programmatic API Improvements

Refactor to expose clean programmatic APIs alongside CLI wrappers.

#### Current Structure

```
src/
├── cli/
│   ├── newpr.ts      ← CLI wrapper + business logic mixed
│   ├── cleanpr.ts
│   ├── lswt.ts
│   └── wtlink.ts
└── lib/
    ├── git.ts        ← Pure functions (good!)
    ├── github.ts
    └── ...
```

#### Proposed Structure

```
src/
├── cli/
│   ├── newpr.ts      ← Thin CLI wrapper only
│   ├── cleanpr.ts
│   ├── lswt.ts
│   └── wtlink.ts
├── api/
│   ├── newpr.ts      ← Programmatic API (returns Promise<Result>)
│   ├── cleanpr.ts
│   ├── lswt.ts
│   ├── wtlink.ts
│   └── state.ts      ← Git state analysis API
├── mcp/
│   ├── server.ts     ← MCP server
│   └── tools.ts      ← Tool definitions
└── lib/
    └── ...           ← (unchanged)
```

#### Programmatic API Example

```typescript
// src/api/newpr.ts
export interface CreatePrOptions {
  description: string;
  action?: StateActionKey;
  draft?: boolean;
  baseBranch?: string;
}

export interface CreatePrResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  branch?: string;
  worktreePath?: string;
  error?: {
    code: ErrorCode;
    message: string;
  };
}

export async function createPr(options: CreatePrOptions): Promise<CreatePrResult> {
  // Pure business logic, no console.log, no process.exit
  // Returns structured result
}
```

---

## Implementation Phases

### Phase 1: Non-Interactive Foundation (Priority: Critical) ✅

**Status:** Complete
**Goal:** Enable AI tools to use existing CLI commands without interaction.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add `--non-interactive` flag to `newpr` | ✅ | `-y`, `--yes`, `--non-interactive` flags |
| Add `--json` flag to `newpr` | ✅ | Machine-readable output |
| Add `--action` flag to `newpr` | ✅ | Pre-specify scenario action |
| Add `--json` flag to `cleanpr` | ✅ | Machine-readable output |
| Add `--dry-run` to `cleanpr` | ✅ | Preview mode with `-n` |
| Add `--json` flag to `wtlink` | ✅ | Machine-readable output |
| Standardize error codes | ✅ | `ErrorCode` enum in `json-output.ts` |
| Define JSON output schema | ✅ | `CommandResult<T>` interface |

**Current State:**
- ✅ `lswt --json` already implemented
- ✅ `cleanpr --all` provides non-interactive mode
- ✅ `cleanpr <PR_NUMBER>` provides non-interactive mode
- ✅ `wtlink link --yes` provides non-interactive mode
- ✅ `newpr --json --non-interactive --action=<key>` fully supported

### Phase 2: State Query Command (Priority: High) ✅

**Status:** Complete
**Goal:** Enable AI tools to query state before acting.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Create `src/cli/wtstate.ts` | ✅ | New command |
| Add to `package.json` bin | ✅ | Binary entry point |
| Return scenario and available actions | ✅ | Core functionality |
| JSON output by default | ✅ | `--json` flag for AI-first design |
| Create `src/lib/wtstate/` module | ✅ | Types, args, analyze logic |
| Add unit tests | ✅ | 29 tests for args and analyze |

**Implementation Details:**

- `wtstate --json` returns structured state with scenario, available actions, and recommended action
- `wtstate --verbose` includes file lists and commit details
- `wtstate --base <branch>` specifies the base branch for comparison
- Exports available via `src/index.ts` for programmatic usage

### Phase 3: Programmatic API Layer (Priority: High) ✅

**Status:** Complete
**Goal:** Clean separation of concerns for better testing and MCP integration.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Create `src/api/` directory | ✅ | New structure with index.ts exports |
| Extract `newpr` business logic | ✅ | `src/api/create.ts` - `createPr()` and `setupPrWorktree()` |
| Extract `cleanpr` business logic | ✅ | `src/api/clean.ts` - `cleanWorktrees()` |
| Extract `lswt` business logic | ✅ | `src/api/list.ts` - `listWorktrees()` |
| Create state query API | ✅ | `src/api/state.ts` - `queryState()` |
| Full TypeScript types for I/O | ✅ | All APIs return `CommandResult<T>` |
| Export API from `src/index.ts` | ✅ | `import { api } from '@camaradesuk/git-worktree-tools'` |

**Implementation Details:**

The programmatic API layer provides side-effect-free functions that return structured `CommandResult<T>` types:

```typescript
// Import the API
import { api } from '@camaradesuk/git-worktree-tools';
// Or import functions directly
import { queryState, listWorktrees, cleanWorktrees, createPr, setupPrWorktree } from '@camaradesuk/git-worktree-tools';

// Query git state
const state = queryState({ baseBranch: 'main' });
if (state.success) {
  console.log(`Scenario: ${state.data.scenario}`);
  console.log(`Recommended action: ${state.data.recommendedAction}`);
}

// List worktrees
const list = await listWorktrees({ showStatus: true });
if (list.success) {
  console.log(`Found ${list.data.total} worktrees`);
}

// Create PR with worktree
const pr = await createPr({
  description: 'Add dark mode',
  action: 'commit_staged',
  draft: true,
});
if (pr.success) {
  console.log(`Created PR #${pr.data.prNumber}`);
}

// Clean merged/closed worktrees
const cleaned = await cleanWorktrees({ deleteRemote: true });
if (cleaned.success) {
  console.log(`Cleaned ${cleaned.data.totalCleaned} worktrees`);
}
```

### Phase 4: MCP Server (Priority: Medium) ⏳

**Status:** Not Started
**Goal:** Native integration with Claude Code and other MCP-compatible tools.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add `@modelcontextprotocol/sdk` | ⏳ | Dependency |
| Create `src/mcp/server.ts` | ⏳ | MCP server |
| Implement `worktree_get_state` tool | ⏳ | State query |
| Implement `worktree_create_pr` tool | ⏳ | PR creation |
| Implement `worktree_list` tool | ⏳ | List worktrees |
| Implement `worktree_clean` tool | ⏳ | Cleanup |
| Add `git-worktree-mcp` binary | ⏳ | Entry point |
| Document MCP setup | ⏳ | README/docs |

### Phase 5: Advanced AI Features (Priority: Low) ⏳

**Status:** Not Started
**Goal:** Enhanced AI agent support.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add `--watch` mode | ⏳ | Long-running ops |
| Add webhook/callback support | ⏳ | Async operations |
| Add operation IDs | ⏳ | Tracking |
| Add rollback capabilities | ⏳ | Safety |

---

## Usage Scenarios

### Scenario 1: Claude Code Direct CLI Usage

After Phase 1, Claude Code can use the tools directly:

```
User: "Create a PR for my current changes"

Claude Code:
1. Runs: lswt --json (understand current worktrees)
2. Runs: git status (understand changes)
3. Runs: newpr "User's feature" --non-interactive --action=commit_staged --json
4. Parses JSON result
5. Reports: "Created PR #42: https://github.com/..."
```

### Scenario 2: Claude Code with MCP Server

After Phase 4, Claude Code uses MCP tools directly:

```
User: "Create a PR for my current changes"

Claude Code:
1. Calls MCP tool: worktree_get_state()
   → Returns: { scenario: "main_staged_same", recommendedAction: "commit_staged", ... }
2. Calls MCP tool: worktree_create_pr({ description: "Add feature X", action: "commit_staged" })
   → Returns: { success: true, prNumber: 42, prUrl: "...", worktreePath: "..." }
3. Reports: "Created PR #42. Worktree ready at /path/to/repo.pr42"
```

### Scenario 3: Gemini CLI Integration

With JSON output, Gemini CLI can integrate:

```bash
# In GEMINI.md or agent config
tools:
  - name: create_pr
    command: newpr "$DESCRIPTION" --non-interactive --json
    parse: json
```

### Scenario 4: CI/CD Pipeline Integration

```yaml
# .github/workflows/auto-pr.yml
- name: Create PR from bot changes
  run: |
    RESULT=$(newpr "Automated update" --non-interactive --action=commit_staged --json)
    PR_URL=$(echo $RESULT | jq -r '.prUrl')
    echo "Created PR: $PR_URL"
```

### Scenario 5: Multi-Agent Orchestration

With MCP, multiple agents can coordinate:

```
Agent A (Code Writer): Makes changes to main worktree
Agent B (PR Manager):
  1. Detects changes via worktree_get_state
  2. Creates PR via worktree_create_pr
  3. Switches to new worktree
  4. Notifies Agent A of new workspace
```

---

## Configuration for AI Tools

### Claude Code Configuration

Add to project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "git-worktree-tools": {
      "command": "npx",
      "args": ["@camaradesuk/git-worktree-tools-mcp"],
      "env": {}
    }
  }
}
```

Or global `~/.claude.json`:

```json
{
  "mcpServers": {
    "git-worktree-tools": {
      "command": "git-worktree-mcp",
      "env": {}
    }
  }
}
```

### Gemini CLI Configuration

Add to `GEMINI.md`:

```markdown
## Git Worktree Tools

This project uses git-worktree-tools for PR management.

### Available Commands
- `wtstate --json` - Get current git state and available actions
- `newpr "description" --non-interactive --json` - Create PR
- `lswt --json` - List worktrees
- `cleanpr --all --json` - Clean merged PRs

### Workflow
1. Always run `wtstate --json` before creating a PR
2. Use the `recommendedAction` from state response
3. Parse JSON output to understand results
```

### Codex CLI Configuration

Add to `codex.md`:

```markdown
## Git Worktree Management

Use git-worktree-tools for PR workflows:

```bash
# Query state before action
wtstate --json

# Create PR (use action from state query)
newpr "Feature description" --non-interactive --action=<action> --json

# List worktrees
lswt --json --status

# Cleanup after merge
cleanpr --all --json
```

Always parse JSON output for programmatic handling.
```

---

## Testing Strategy

### Unit Tests

Extend existing tests to cover:

1. JSON output formatting
2. Non-interactive mode behavior
3. Error code assignment
4. Programmatic API return values

### Integration Tests

Add AI-workflow simulation tests:

```typescript
describe('AI Workflow Integration', () => {
  it('should complete full PR workflow via JSON API', async () => {
    // 1. Query state
    const state = await runCommand('wtstate --json');
    expect(state.scenario).toBeDefined();

    // 2. Create PR
    const result = await runCommand(
      `newpr "Test PR" --non-interactive --action=${state.recommendedAction} --json`
    );
    expect(result.success).toBe(true);
    expect(result.prNumber).toBeGreaterThan(0);

    // 3. List worktrees
    const list = await runCommand('lswt --json');
    expect(list.some(w => w.prNumber === result.prNumber)).toBe(true);
  });
});
```

### MCP Server Tests

```typescript
describe('MCP Server', () => {
  it('should respond to tool calls', async () => {
    const result = await mcpClient.callTool('worktree_get_state', {});
    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.scenario).toBeDefined();
  });
});
```

---

## Documentation Updates

### README.md Additions

```markdown
## AI Tool Integration

git-worktree-tools is designed to work seamlessly with AI CLI tools.

### Non-Interactive Mode

All commands support `--non-interactive` and `--json` flags:

\`\`\`bash
# Create PR without prompts
newpr "Feature X" --non-interactive --json

# Query git state
wtstate --json

# Clean PRs automatically
cleanpr --all --non-interactive --json
\`\`\`

### MCP Server

For Claude Code and other MCP-compatible tools:

\`\`\`bash
# Install MCP server globally
npm install -g @camaradesuk/git-worktree-tools

# Add to Claude Code settings
# See docs/MCP-SETUP.md
\`\`\`

### JSON Output Schema

All commands return consistent JSON:

\`\`\`typescript
interface CommandResult {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; };
  warnings?: string[];
}
\`\`\`
```

---

## Package.json Changes

```json
{
  "bin": {
    "newpr": "./dist/cli/newpr.js",
    "cleanpr": "./dist/cli/cleanpr.js",
    "lswt": "./dist/cli/lswt.js",
    "wtlink": "./dist/cli/wtlink.js",
    "wtstate": "./dist/cli/wtstate.js",           // NEW
    "git-worktree-mcp": "./dist/mcp/server.js"    // NEW
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",        // NEW
    // ... existing
  }
}
```

---

## Success Metrics

1. **AI Tool Compatibility**: Claude Code, Gemini CLI, and Codex CLI can all use the tools without modification
2. **Non-Interactive Success Rate**: 100% of common workflows complete without prompts
3. **JSON Parse Success**: All JSON output is valid and parseable
4. **MCP Discovery**: MCP server is discoverable by AI tools
5. **Error Recovery**: AI tools can understand and recover from errors via error codes

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing CLI UX | Non-interactive is opt-in, interactive remains default |
| MCP protocol changes | Use stable SDK version, monitor protocol updates |
| JSON schema breaking changes | Semantic versioning, deprecation warnings |
| AI tools misusing commands | Comprehensive error messages, dry-run modes |
| Security (AI executing dangerous ops) | Explicit `--force` for destructive operations |

---

## Phase 5: AI Content Generation

This phase introduces AI-powered content generation for branch names, PR titles/descriptions, commit messages, and initial planning documents.

### 5.1 AI Provider Architecture

Support multiple AI providers with a unified interface:

```typescript
// src/lib/ai/provider.ts
export interface AIProvider {
  name: string;
  generateBranchName(context: BranchContext): Promise<string>;
  generatePRTitle(context: PRContext): Promise<string>;
  generatePRDescription(context: PRContext): Promise<string>;
  generateCommitMessage(context: CommitContext): Promise<string>;
  generatePlanDocument(context: PlanContext): Promise<string>;
}

export interface BranchContext {
  description: string;
  repoName: string;
  branchPrefix: string;  // from config
  existingBranches?: string[];  // avoid collisions
}

export interface PRContext {
  description: string;
  diff: string;
  commits: CommitInfo[];
  branchName: string;
  baseBranch: string;
}

export interface CommitContext {
  stagedFiles: string[];
  diff: string;
  recentCommits?: string[];  // for style consistency
}

export interface PlanContext {
  description: string;
  repoStructure: string[];  // key files/folders
  techStack?: string[];
}
```

### 5.2 Supported AI Providers

| Provider | Integration Method | Pros | Cons |
|----------|-------------------|------|------|
| **Claude Code** | MCP/CLI tool | Native integration, context-aware | Requires Claude Code installed |
| **Gemini CLI** | CLI subprocess | 1M token context, free tier | Google account required |
| **OpenAI Codex** | API/CLI | Wide adoption, good code understanding | API costs |
| **Ollama (Local)** | Local API | Privacy, no API costs, offline | Requires local setup, GPU recommended |
| **Custom Script** | User-defined | Full control | User must implement |

#### Provider Configuration

```typescript
// .worktreerc
{
  "ai": {
    "provider": "auto",  // "auto" | "claude" | "gemini" | "openai" | "ollama" | "script"
    "fallback": "none",  // Provider to use if primary fails

    // Provider-specific settings
    "claude": {
      "model": "claude-sonnet-4-20250514"
    },
    "gemini": {
      "model": "gemini-2.0-flash"
    },
    "openai": {
      "model": "gpt-4o",
      "apiKeyEnv": "OPENAI_API_KEY"
    },
    "ollama": {
      "model": "codellama:13b",
      "host": "http://localhost:11434"
    },
    "script": {
      "path": "./scripts/ai-generate.js"
    }
  }
}
```

### 5.3 Auto-Detection Strategy (`provider: "auto"`)

When `provider` is set to `"auto"`, detect available AI tools in order:

```typescript
async function detectAIProvider(): Promise<AIProvider | null> {
  // 1. Check for Claude Code (look for claude command or MCP)
  if (await isClaudeCodeAvailable()) {
    return new ClaudeProvider();
  }

  // 2. Check for Gemini CLI
  if (await commandExists('gemini')) {
    return new GeminiProvider();
  }

  // 3. Check for local Ollama
  if (await isOllamaRunning()) {
    return new OllamaProvider();
  }

  // 4. Check for OpenAI API key
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }

  // 5. No provider available
  return null;
}
```

### 5.4 Branch Name Generation

**Current behavior:** Random suffix (`feat/add-dark-mode-xyz123`)

**AI-enhanced behavior:**

```typescript
interface BranchNameOptions {
  useAI?: boolean;         // Enable AI generation (default: false initially)
  branchStyle?: 'conventional' | 'kebab' | 'snake' | 'custom';
  maxLength?: number;      // Default: 50
  includeIssueNumber?: boolean;  // If issue # detected in description
}
```

**Examples:**

| Description | Current Output | AI Output |
|-------------|----------------|-----------|
| "Add dark mode toggle to settings" | `feat/add-dark-mode-toggle-abc123` | `feat/settings-dark-mode-toggle` |
| "Fix login bug on mobile devices" | `feat/fix-login-bug-on-xyz789` | `fix/mobile-login-auth-error` |
| "JIRA-1234: Update user profile" | `feat/jira-1234-update-def456` | `feat/JIRA-1234-user-profile-update` |

**CLI Usage:**

```bash
# Explicit AI generation
newpr "Add dark mode" --ai-branch

# Use config default
newpr "Add dark mode"  # Uses ai.branchName setting from .worktreerc
```

### 5.5 PR Title & Description Generation

Generate rich PR descriptions from commit history and diffs:

```typescript
interface PRGenerationOptions {
  useAI?: boolean;
  template?: string;       // Path to custom template
  includeChangelog?: boolean;
  includeTechDebt?: boolean;
  testPlanStyle?: 'checklist' | 'narrative' | 'none';
}
```

**Template Variables:**

```markdown
## Summary

{{AI_SUMMARY}}

## Changes

{{AI_CHANGES_LIST}}

## Technical Details

{{AI_TECHNICAL_NOTES}}

## Test Plan

{{AI_TEST_PLAN}}

## Screenshots

<!-- Add screenshots if UI changes -->

---
🤖 Generated with [git-worktree-tools](https://github.com/camaradesuk/git-worktree-tools)
```

**CLI Usage:**

```bash
# Generate with AI
newpr "Add dark mode" --ai-description

# Interactive: AI generates, user reviews before creation
newpr "Add dark mode" --ai-description --review
```

### 5.6 Initial Plan Document

Create a planning document with the initial commit for AI-assisted development:

```typescript
interface PlanDocumentOptions {
  enabled?: boolean;        // Create plan doc with initial commit
  path?: string;            // Default: "docs/PLAN-{branch}.md"
  includeTaskList?: boolean;
  includeTechStack?: boolean;
  includeAcceptanceCriteria?: boolean;
}
```

**Example Generated Plan:**

```markdown
# Plan: Add Dark Mode Toggle

**Branch:** `feat/settings-dark-mode-toggle`
**Created:** 2025-12-31
**Status:** In Progress

## Objective

Add a dark mode toggle to the application settings that persists user preference.

## Tasks

- [ ] Add theme context provider
- [ ] Create toggle component in Settings page
- [ ] Implement CSS custom properties for theming
- [ ] Persist preference to localStorage
- [ ] Add system preference detection
- [ ] Update existing components for theme support

## Technical Approach

1. Use React Context for theme state management
2. CSS custom properties for color tokens
3. `prefers-color-scheme` media query for system default

## Acceptance Criteria

- [ ] Toggle switches between light and dark themes
- [ ] Preference persists across sessions
- [ ] Respects system preference on first visit
- [ ] No flash of incorrect theme on load

## Notes

<!-- Add implementation notes as you work -->

---
🤖 Generated with [git-worktree-tools](https://github.com/camaradesuk/git-worktree-tools)
```

**CLI Usage:**

```bash
# Create PR with plan document
newpr "Add dark mode" --with-plan

# Specify plan location
newpr "Add dark mode" --with-plan --plan-path="./PLAN.md"
```

### 5.7 Commit Message Generation

For the initial commit and subsequent auto-commits:

```typescript
interface CommitMessageOptions {
  useAI?: boolean;
  style?: 'conventional' | 'gitmoji' | 'simple' | 'custom';
  scope?: string;           // e.g., "settings", "auth"
  includeBody?: boolean;    // Multi-line commit message
}
```

**Examples:**

| Style | Output |
|-------|--------|
| `conventional` | `feat(settings): add dark mode toggle` |
| `gitmoji` | `✨ Add dark mode toggle to settings` |
| `simple` | `Add dark mode toggle` |

---

## Phase 6: Extensibility & Hooks

Enable users to customize the workflow with lifecycle hooks, plugins, and user-defined scripts.

### 6.1 Hook System Overview

Inspired by [Husky](https://typicode.github.io/husky/) and git hooks, but specific to worktree-tools lifecycle events.

```
┌─────────────────────────────────────────────────────────┐
│                    newpr Lifecycle                       │
├─────────────────────────────────────────────────────────┤
│  pre-analyze    → Before git state analysis             │
│  post-analyze   → After state analysis, before prompt   │
│  pre-branch     → Before branch creation                │
│  post-branch    → After branch creation                 │
│  pre-commit     → Before initial commit                 │
│  post-commit    → After initial commit                  │
│  pre-push       → Before push to origin                 │
│  post-push      → After push to origin                  │
│  pre-pr         → Before PR creation                    │
│  post-pr        → After PR creation, before worktree    │
│  pre-worktree   → Before worktree creation              │
│  post-worktree  → After worktree creation               │
│  cleanup        → On error (for rollback)               │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Hook Configuration

```typescript
// .worktreerc
{
  "hooks": {
    // Simple command hooks
    "post-worktree": "npm install",

    // Multiple commands
    "post-pr": [
      "echo 'PR #{{PR_NUMBER}} created!'",
      "./scripts/notify-slack.sh {{PR_URL}}"
    ],

    // Script file hooks
    "pre-branch": {
      "script": "./hooks/validate-branch-name.js",
      "timeout": 5000,
      "failOnError": true
    },

    // Conditional hooks
    "post-worktree": {
      "command": "pnpm install",
      "if": "exists:pnpm-lock.yaml"
    }
  }
}
```

### 6.3 Hook Context Variables

Hooks receive context via environment variables:

| Variable | Description | Available In |
|----------|-------------|--------------|
| `WT_BRANCH_NAME` | New branch name | post-branch onwards |
| `WT_PR_NUMBER` | PR number | post-pr onwards |
| `WT_PR_URL` | PR URL | post-pr onwards |
| `WT_WORKTREE_PATH` | New worktree path | post-worktree |
| `WT_REPO_ROOT` | Main repo root | All hooks |
| `WT_BASE_BRANCH` | Base branch (main) | All hooks |
| `WT_DESCRIPTION` | PR description | All hooks |
| `WT_SCENARIO` | Detected git state scenario | post-analyze onwards |

**Script Hook Interface:**

```typescript
// hooks/my-hook.js
export default async function hook(context) {
  const {
    branchName,
    prNumber,
    prUrl,
    worktreePath,
    repoRoot,
    baseBranch,
    description,
    scenario,
  } = context;

  // Return { success: true } or { success: false, message: "..." }
  return { success: true };
}
```

### 6.4 Built-in Hook Templates

Provide common hooks out of the box:

```bash
# List available hook templates
wtconfig hooks --list

# Install a hook template
wtconfig hooks --install auto-deps
```

| Template | Description |
|----------|-------------|
| `auto-deps` | Run `npm/pnpm/yarn install` after worktree creation |
| `vscode-open` | Open worktree in VS Code after creation |
| `slack-notify` | Send Slack notification on PR creation |
| `linear-link` | Link PR to Linear issue if detected |
| `jira-link` | Update Jira issue with PR link |
| `copilot-review` | Request GitHub Copilot review on PR |

### 6.5 Plugin System (Advanced)

For complex integrations, support a plugin architecture:

```typescript
// .worktreerc
{
  "plugins": [
    "@worktree-tools/plugin-linear",
    "@worktree-tools/plugin-jira",
    "./plugins/custom-plugin.js"
  ]
}
```

**Plugin Interface:**

```typescript
// Plugin definition
export interface WorktreePlugin {
  name: string;
  version: string;

  // Lifecycle hooks
  hooks?: {
    [hookName: string]: HookHandler;
  };

  // Add new CLI commands
  commands?: CommandDefinition[];

  // Extend configuration schema
  configSchema?: JSONSchema;

  // Initialize plugin
  init?(config: PluginConfig): Promise<void>;
}
```

**Example Plugin:**

```typescript
// @worktree-tools/plugin-linear
export default {
  name: 'linear-integration',
  version: '1.0.0',

  hooks: {
    'pre-branch': async (ctx) => {
      // Extract Linear issue from description (e.g., "LIN-123: Fix bug")
      const match = ctx.description.match(/^([A-Z]+-\d+)/);
      if (match) {
        ctx.issueId = match[1];
      }
      return { success: true };
    },

    'post-pr': async (ctx) => {
      if (ctx.issueId) {
        await linearClient.attachPR(ctx.issueId, ctx.prUrl);
      }
      return { success: true };
    },
  },
};
```

### 6.6 Custom Generators

Allow users to customize content generation:

```typescript
// .worktreerc
{
  "generators": {
    "branchName": "./generators/branch-name.js",
    "prTitle": "./generators/pr-title.js",
    "prDescription": "./generators/pr-description.js",
    "commitMessage": "./generators/commit-message.js"
  }
}
```

**Generator Interface:**

```typescript
// generators/branch-name.js
export default async function generateBranchName(context) {
  const { description, branchPrefix, repoName } = context;

  // Custom logic
  return `${branchPrefix}/${slugify(description)}`;
}
```

---

## Phase 7: Setup Wizard

An interactive setup wizard for first-time users and configuration management.

### 7.1 Wizard Trigger

```bash
# First-time setup (auto-triggered on first run or explicit)
wtconfig init

# Reconfigure existing setup
wtconfig wizard

# Quick setup with defaults
wtconfig init --quick
```

### 7.2 Environment Detection

The wizard automatically detects installed tools:

```typescript
interface EnvironmentInfo {
  os: 'windows' | 'macos' | 'linux';

  git: {
    version: string;
    configured: boolean;
    user?: string;
    email?: string;
  };

  github: {
    installed: boolean;
    authenticated: boolean;
    user?: string;
  };

  ai: {
    claudeCode: boolean;
    geminiCLI: boolean;
    ollama: boolean;
    openaiKey: boolean;
  };

  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun';

  ide: {
    vscode: boolean;
    cursor: boolean;
    idea: boolean;
  };
}
```

**Detection Logic:**

```typescript
async function detectEnvironment(): Promise<EnvironmentInfo> {
  return {
    os: detectOS(),
    git: await detectGit(),
    github: await detectGitHub(),
    ai: {
      claudeCode: await commandExists('claude'),
      geminiCLI: await commandExists('gemini'),
      ollama: await isOllamaRunning(),
      openaiKey: !!process.env.OPENAI_API_KEY,
    },
    packageManager: await detectPackageManager(),
    ide: await detectIDEs(),
  };
}
```

### 7.3 Wizard Flow

```
┌──────────────────────────────────────────────────────────┐
│                 git-worktree-tools Setup                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🔍 Detecting your environment...                        │
│                                                          │
│  ✓ Git 2.43.0 configured (chris@example.com)            │
│  ✓ GitHub CLI authenticated (username)                   │
│  ✓ Claude Code detected                                  │
│  ✓ pnpm detected                                         │
│  ✓ VS Code detected                                      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Step 1/5: Base Configuration                            │
│                                                          │
│  ? What is your default base branch?                     │
│    ❯ main (detected)                                     │
│      master                                              │
│      develop                                             │
│      Other...                                            │
│                                                          │
│  ? Create PRs as drafts by default?                      │
│    ❯ No (recommended for solo work)                      │
│      Yes (recommended for team review)                   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Step 2/5: Worktree Location                             │
│                                                          │
│  ? Where should worktrees be created?                    │
│    ❯ Sibling to main repo (../repo.pr42)                │
│      Inside .worktrees folder (.worktrees/pr42)         │
│      Custom location...                                  │
│                                                          │
│  ? Worktree naming pattern?                              │
│    ❯ {repo}.pr{number} (e.g., myapp.pr42)               │
│      pr-{number} (e.g., pr-42)                          │
│      {branch} (e.g., feat-dark-mode)                    │
│      Custom...                                           │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Step 3/5: AI Integration                                │
│                                                          │
│  Claude Code detected! Would you like to enable AI?      │
│                                                          │
│  ? Use AI for content generation?                        │
│    ❯ Yes - Use detected providers (Claude Code)         │
│      Yes - Configure manually                            │
│      No - I prefer manual input                          │
│                                                          │
│  ? What should AI generate?                              │
│    ◉ Branch names (from description)                     │
│    ◉ PR descriptions (from changes)                      │
│    ◯ Commit messages                                     │
│    ◯ Plan documents                                      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Step 4/5: Automation Hooks                              │
│                                                          │
│  ? Install any automation hooks?                         │
│    ◉ auto-deps: Install dependencies after worktree     │
│    ◉ vscode-open: Open worktree in VS Code              │
│    ◯ slack-notify: Notify Slack on PR creation          │
│    ◯ None                                                │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Step 5/5: Review & Save                                 │
│                                                          │
│  Configuration will be saved to: .worktreerc             │
│                                                          │
│  {                                                       │
│    "baseBranch": "main",                                │
│    "draftPr": false,                                    │
│    "worktreePattern": "{repo}.pr{number}",              │
│    "ai": {                                              │
│      "provider": "claude",                              │
│      "branchName": true,                                │
│      "prDescription": true                               │
│    },                                                   │
│    "hooks": {                                           │
│      "post-worktree": ["pnpm install", "code ."]        │
│    }                                                    │
│  }                                                       │
│                                                          │
│  ? Save configuration?                                   │
│    ❯ Yes, save to .worktreerc                           │
│      Yes, save globally (~/.worktreerc)                 │
│      No, cancel                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ✓ Configuration saved!                                  │
│                                                          │
│  Quick start:                                            │
│    newpr "Add dark mode"     Create a new PR            │
│    lswt                      List worktrees             │
│    cleanpr                   Clean merged PRs           │
│                                                          │
│  Learn more: https://github.com/camaradesuk/git-worktree│
└──────────────────────────────────────────────────────────┘
```

### 7.4 Configuration Levels

Support hierarchical configuration:

```
~/.worktreerc           (Global defaults)
    ↓
./.worktreerc           (Repository-specific)
    ↓
CLI flags               (Per-invocation override)
```

**Merge Strategy:**

```typescript
function loadEffectiveConfig(repoRoot: string): Config {
  const globalConfig = loadGlobalConfig();      // ~/.worktreerc
  const repoConfig = loadRepoConfig(repoRoot);  // ./.worktreerc

  // Deep merge: repo overrides global
  return deepMerge(globalConfig, repoConfig);
}
```

### 7.5 Configuration Commands

```bash
# Initialize/re-run wizard
wtconfig init

# View current effective config
wtconfig show

# Set individual values
wtconfig set baseBranch develop
wtconfig set ai.provider gemini
wtconfig set hooks.post-worktree "npm install"

# Edit in default editor
wtconfig edit

# Validate configuration
wtconfig validate

# Export configuration
wtconfig export > my-config.json

# Import configuration
wtconfig import < my-config.json
```

---

## Phase 8: Enhanced Configuration

Expand `.worktreerc` to support all new features while maintaining backwards compatibility.

### 8.1 Complete Configuration Schema

```typescript
interface WorktreeConfig {
  // === Existing (backwards compatible) ===
  sharedRepos?: string[];
  baseBranch?: string;              // Default: "main"
  draftPr?: boolean;                // Default: false
  worktreePattern?: string;         // Default: "{repo}.pr{number}"
  worktreeParent?: string;          // Default: ".."
  syncPatterns?: string[];
  branchPrefix?: string;            // Default: "feat"

  // === NEW: AI Configuration ===
  ai?: {
    provider?: 'auto' | 'claude' | 'gemini' | 'openai' | 'ollama' | 'script' | 'none';
    fallback?: string;

    // Feature toggles
    branchName?: boolean;           // Use AI for branch names
    prTitle?: boolean;              // Use AI for PR titles
    prDescription?: boolean;        // Use AI for PR descriptions
    commitMessage?: boolean;        // Use AI for commit messages
    planDocument?: boolean;         // Create plan doc with AI

    // Style preferences
    branchStyle?: 'conventional' | 'kebab' | 'snake';
    commitStyle?: 'conventional' | 'gitmoji' | 'simple';

    // Templates
    prTemplate?: string;            // Path to PR description template
    planTemplate?: string;          // Path to plan document template

    // Provider-specific settings
    claude?: { model?: string };
    gemini?: { model?: string };
    openai?: { model?: string; apiKeyEnv?: string };
    ollama?: { model?: string; host?: string };
    script?: { path: string };
  };

  // === NEW: Hooks ===
  hooks?: {
    'pre-analyze'?: HookDefinition;
    'post-analyze'?: HookDefinition;
    'pre-branch'?: HookDefinition;
    'post-branch'?: HookDefinition;
    'pre-commit'?: HookDefinition;
    'post-commit'?: HookDefinition;
    'pre-push'?: HookDefinition;
    'post-push'?: HookDefinition;
    'pre-pr'?: HookDefinition;
    'post-pr'?: HookDefinition;
    'pre-worktree'?: HookDefinition;
    'post-worktree'?: HookDefinition;
    'cleanup'?: HookDefinition;
  };

  // === NEW: Plugins ===
  plugins?: string[];

  // === NEW: Generators ===
  generators?: {
    branchName?: string;
    prTitle?: string;
    prDescription?: string;
    commitMessage?: string;
  };

  // === NEW: Integration ===
  integrations?: {
    linear?: { teamId?: string };
    jira?: { projectKey?: string };
    slack?: { webhookUrl?: string; channel?: string };
  };
}

type HookDefinition =
  | string                          // Simple command
  | string[]                        // Multiple commands
  | {
      command?: string;
      script?: string;              // Path to script
      timeout?: number;             // ms, default 30000
      failOnError?: boolean;        // default true
      if?: string;                  // Condition
      env?: Record<string, string>; // Extra env vars
    };
```

### 8.2 Example Configurations

**Minimal (beginner):**

```json
{
  "baseBranch": "main"
}
```

**Standard with AI:**

```json
{
  "baseBranch": "main",
  "draftPr": true,
  "branchPrefix": "feat",
  "ai": {
    "provider": "auto",
    "branchName": true,
    "prDescription": true
  },
  "hooks": {
    "post-worktree": "npm install"
  }
}
```

**Advanced team setup:**

```json
{
  "baseBranch": "develop",
  "draftPr": true,
  "worktreePattern": "{repo}.pr{number}",
  "branchPrefix": "feature",

  "ai": {
    "provider": "claude",
    "branchName": true,
    "prTitle": true,
    "prDescription": true,
    "planDocument": true,
    "commitStyle": "conventional",
    "prTemplate": ".github/PULL_REQUEST_TEMPLATE.md"
  },

  "hooks": {
    "post-worktree": [
      "pnpm install",
      "code ."
    ],
    "post-pr": {
      "script": "./scripts/notify-team.js",
      "env": {
        "SLACK_CHANNEL": "#engineering"
      }
    }
  },

  "plugins": [
    "@worktree-tools/plugin-linear"
  ],

  "integrations": {
    "linear": {
      "teamId": "ENG"
    }
  }
}
```

---

## Decision Matrix: AI Providers

| Criterion | Claude Code | Gemini CLI | OpenAI | Ollama |
|-----------|-------------|------------|--------|--------|
| **Setup Complexity** | Low (if installed) | Low | Medium (API key) | High (local model) |
| **Cost** | Subscription | Free tier | Pay-per-use | Free (hardware) |
| **Context Window** | 200K tokens | 1M tokens | 128K tokens | Model-dependent |
| **Offline Support** | ❌ | ❌ | ❌ | ✅ |
| **Code Understanding** | Excellent | Good | Excellent | Good |
| **Response Speed** | Fast | Fast | Fast | Slow (CPU) / Fast (GPU) |
| **Privacy** | Cloud | Cloud | Cloud | Local |
| **Integration Depth** | Native MCP | CLI | API | API |

**Recommendation:** Default to `"provider": "auto"` which detects and uses the best available option.

---

## Decision Matrix: Hook System Design

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Simple commands** | Easy to configure, familiar | Limited logic | ✅ Primary |
| **Script files** | Full programming power | More complex | ✅ Secondary |
| **Plugin packages** | Reusable, shareable | Requires npm publish | Advanced users |
| **Inline functions** | Concise | Security concerns | ❌ Avoid |

---

## Decision Matrix: Configuration Scope

| Scope | Location | Use Case |
|-------|----------|----------|
| **Global** | `~/.worktreerc` | Personal defaults across all repos |
| **Repository** | `./.worktreerc` | Team-shared repo config |
| **Command-line** | `--flag` | One-off overrides |

**Merge priority:** CLI > Repository > Global > Defaults

---

## References

- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
- [Anthropic MCP Announcement](https://www.anthropic.com/news/model-context-protocol) - Introduction to MCP
- [Claude Code MCP Integration](https://code.claude.com/docs/en/mcp) - Claude Code MCP setup
- [MCP Server SDK](https://github.com/modelcontextprotocol/servers) - Official MCP server implementations
- [AI CLI Tools Comparison](https://research.aimultiple.com/agentic-cli/) - Agentic CLI comparison
- [The New Stack: Agentic CLI Era](https://thenewstack.io/ai-coding-tools-in-2025-welcome-to-the-agentic-cli-era/) - Industry overview
- [Claude Flow Non-Interactive Mode](https://github.com/ruvnet/claude-flow/wiki/Non-Interactive-Mode) - Example of non-interactive patterns
- [Husky Git Hooks](https://typicode.github.io/husky/) - Git hooks management inspiration
- [GGPR AI Git Tool](https://github.com/meabed/pr-commit-ai-agent) - AI-powered git workflow tool
- [aigit](https://github.com/hardiksondagar/aigit) - AI-powered Git CLI
- [aicommits](https://github.com/Nutlope/aicommits) - AI commit message generation
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) - Interactive CLI prompts
- [Yeoman](https://yeoman.io/) - Scaffolding and CLI wizard patterns

---

## Next Steps

### Immediate Actions (Phase 1)

1. **Add `--json` and `--non-interactive` flags to `newpr`**
   - Highest impact for AI tool compatibility
   - Enables autonomous PR creation workflows

2. **Add `--action` flag to `newpr`**
   - Allow pre-specifying which action to take for detected scenario
   - Keys: `commit_staged`, `stash_all`, `include_changes`, `create_fresh`, etc.

3. **Add `--json` flag to `cleanpr`**
   - Machine-readable cleanup results
   - Complements existing `--all` non-interactive mode

4. **Define standard JSON response schema**
   - Consistent `CommandResult` interface across all tools
   - Structured error codes for programmatic handling

### Phase 2-4: AI Tool Compatibility

1. **Create `wtstate` command (Phase 2)**
   - Query current git state and available actions
   - Enables AI "look before you leap" pattern

2. **Extract programmatic APIs (Phase 3)**
   - Clean separation of CLI and business logic
   - Foundation for MCP server

3. **Implement MCP Server (Phase 4)**
   - Native Claude Code integration
   - Discoverable tools and resources

### Phase 5: AI Content Generation

1. **Implement AI provider abstraction**
   - Support Claude Code, Gemini CLI, OpenAI, Ollama
   - Auto-detection of available providers

2. **Add AI-powered branch name generation**
   - `--ai-branch` flag or config option
   - Smart extraction of issue numbers, conventional prefixes

3. **Add AI-powered PR description generation**
   - `--ai-description` flag or config option
   - Template-based with AI-generated sections

4. **Add plan document generation**
   - `--with-plan` flag to create initial planning doc
   - Task breakdown, acceptance criteria

### Phase 6: Extensibility & Hooks

1. **Implement lifecycle hook system**
   - 13 hook points across newpr workflow
   - Support for shell commands, scripts, and plugins

2. **Create hook template library**
   - `auto-deps`, `vscode-open`, `slack-notify`, etc.
   - `wtconfig hooks --install <template>` command

3. **Design plugin architecture**
   - Allow npm packages to extend functionality
   - Support for Linear, Jira, Slack integrations

### Phase 7: Setup Wizard

1. **Create `wtconfig init` wizard**
   - Interactive setup for new users
   - Auto-detect environment (git, gh, AI tools, IDE)

2. **Implement hierarchical configuration**
   - Global (`~/.worktreerc`) + repo (`.worktreerc`) + CLI flags
   - Deep merge with proper precedence

3. **Add configuration management commands**
   - `wtconfig show`, `wtconfig set`, `wtconfig validate`

### Testing Milestones

- [ ] AI agent can create PR via `newpr --json --non-interactive`
- [ ] AI agent can query state via `wtstate --json`
- [ ] AI agent can clean worktrees via `cleanpr --all --json`
- [ ] Claude Code can use MCP server for all operations
- [ ] AI-generated branch names work with Claude/Gemini/Ollama
- [ ] Hook system executes pre/post hooks correctly
- [ ] Setup wizard completes successfully on fresh install

---

## Implementation Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Non-interactive mode (`--json`) | High | Low | **P0** |
| `wtstate` command | High | Low | **P0** |
| MCP Server | High | Medium | **P1** |
| AI branch names | Medium | Medium | **P1** |
| AI PR descriptions | Medium | Medium | **P1** |
| Hook system | Medium | Medium | **P2** |
| Setup wizard | Medium | High | **P2** |
| Plan document generation | Low | Medium | **P3** |
| Plugin architecture | Low | High | **P3** |

**Recommended order:** P0 → P1 → P2 → P3
