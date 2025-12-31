# AI Agentic CLI Tooling Compatibility Plan

## Executive Summary

This document outlines a strategy to make `@camaradesuk/git-worktree-tools` fully compatible with AI CLI tools like Claude Code, Gemini CLI, Codex CLI, and other agentic development workflows. The goal is to enable AI agents to autonomously manage git worktrees and PR workflows without human intervention.

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Non-Interactive Foundation | ⏳ Not Started |
| Phase 2 | State Query Command (`wtstate`) | ⏳ Not Started |
| Phase 3 | Programmatic API Layer | ⏳ Not Started |
| Phase 4 | MCP Server | ⏳ Not Started |
| Phase 5 | Advanced AI Features | ⏳ Not Started |

**Last Updated:** 2025-12-31
**Package Version:** 1.2.0

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

### Phase 1: Non-Interactive Foundation (Priority: Critical) ⏳

**Status:** Not Started
**Goal:** Enable AI tools to use existing CLI commands without interaction.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Add `--non-interactive` flag to `newpr` | ⏳ | Required for AI autonomy |
| Add `--json` flag to `newpr` | ⏳ | Machine-readable output |
| Add `--action` flag to `newpr` | ⏳ | Pre-specify scenario action |
| Add `--json` flag to `cleanpr` | ⏳ | Machine-readable output |
| Add `--dry-run` to `cleanpr` | ⏳ | Preview mode |
| Add `--json` flag to `wtlink` | ⏳ | Machine-readable output |
| Standardize error codes | ⏳ | Structured error handling |
| Define JSON output schema | ⏳ | Consistent response format |

**Current State:**
- ✅ `lswt --json` already implemented
- ✅ `cleanpr --all` provides non-interactive mode
- ✅ `cleanpr <PR_NUMBER>` provides non-interactive mode
- ✅ `wtlink link --yes` provides non-interactive mode

### Phase 2: State Query Command (Priority: High) ⏳

**Status:** Not Started
**Goal:** Enable AI tools to query state before acting.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Create `src/cli/wtstate.ts` | ⏳ | New command |
| Add to `package.json` bin | ⏳ | Binary entry point |
| Return scenario and available actions | ⏳ | Core functionality |
| JSON output by default | ⏳ | AI-first design |

### Phase 3: Programmatic API Layer (Priority: High) ⏳

**Status:** Not Started
**Goal:** Clean separation of concerns for better testing and MCP integration.

#### Tasks

| Task | Status | Notes |
|------|--------|-------|
| Create `src/api/` directory | ⏳ | New structure |
| Extract `newpr` business logic | ⏳ | `src/api/newpr.ts` |
| Extract `cleanpr` business logic | ⏳ | `src/api/cleanpr.ts` |
| Extract `lswt` business logic | ⏳ | `src/api/lswt.ts` |
| Create state query API | ⏳ | `src/api/state.ts` |
| Full TypeScript types for I/O | ⏳ | Type safety |

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

## References

- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
- [Anthropic MCP Announcement](https://www.anthropic.com/news/model-context-protocol) - Introduction to MCP
- [Claude Code MCP Integration](https://code.claude.com/docs/en/mcp) - Claude Code MCP setup
- [MCP Server SDK](https://github.com/modelcontextprotocol/servers) - Official MCP server implementations
- [AI CLI Tools Comparison](https://research.aimultiple.com/agentic-cli/) - Agentic CLI comparison
- [The New Stack: Agentic CLI Era](https://thenewstack.io/ai-coding-tools-in-2025-welcome-to-the-agentic-cli-era/) - Industry overview
- [Claude Flow Non-Interactive Mode](https://github.com/ruvnet/claude-flow/wiki/Non-Interactive-Mode) - Example of non-interactive patterns

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

### Future Phases

1. **Create `wtstate` command (Phase 2)**
   - Query current git state and available actions
   - Enables AI "look before you leap" pattern

2. **Extract programmatic APIs (Phase 3)**
   - Clean separation of CLI and business logic
   - Foundation for MCP server

3. **Implement MCP Server (Phase 4)**
   - Native Claude Code integration
   - Discoverable tools and resources

### Testing Milestones

- [ ] AI agent can create PR via `newpr --json --non-interactive`
- [ ] AI agent can query state via `wtstate --json`
- [ ] AI agent can clean worktrees via `cleanpr --all --json`
- [ ] Claude Code can use MCP server for all operations
