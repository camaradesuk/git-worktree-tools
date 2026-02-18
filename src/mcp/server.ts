#!/usr/bin/env node
/**
 * MCP Server for git-worktree-tools
 *
 * Provides MCP tools for AI agents to manage git worktrees and PR workflows.
 *
 * Tools:
 * - worktree_get_state: Analyze current git state and return available actions
 * - worktree_create_pr: Create a new PR with a dedicated worktree
 * - worktree_list: List all git worktrees with PR status
 * - worktree_clean: Clean up worktrees for merged or closed PRs
 */

import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Import package.json for version (Node 18+ compatible)
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

import { queryState } from '../api/state.js';
import { listWorktrees } from '../api/list.js';
import { cleanWorktrees } from '../api/clean.js';
import { createPr, setupPrWorktree } from '../api/create.js';
import {
  type StateActionKey,
  isValidStateActionKey,
  createErrorResult,
  ErrorCode,
} from '../lib/json-output.js';

// Common outputSchema fields shared across all tools (CommandResult<T> envelope)
const commandResultBase = {
  success: { type: 'boolean' },
  command: { type: 'string' },
  timestamp: { type: 'string' },
  error: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      suggestion: { type: 'string' },
    },
  },
  warnings: {
    type: 'array',
    items: { type: 'string' },
  },
};

// Tool definitions (exported for testing)
export const tools: Tool[] = [
  {
    name: 'worktree_get_state',
    description:
      'Analyze current git state and return available actions. Call this BEFORE creating a PR to understand what options are available based on the current git state (staged files, branch, commits, etc.).\n\n' +
      'Returns a CommandResult JSON with:\n' +
      '- data.scenario: Git state scenario identifier (e.g., "main_clean_same", "branch_divergent")\n' +
      '- data.availableActions: Array of {key, label, description} for possible next steps\n' +
      '- data.recommendedAction: The suggested default action key\n\n' +
      'Example success response:\n' +
      '{"success":true,"command":"wtstate","timestamp":"...","data":{"scenario":"main_clean_same","scenarioDescription":"On main, clean, same as origin","currentBranch":"main","baseBranch":"main","worktreeType":"main_worktree","hasChanges":false,"availableActions":[{"key":"empty_commit","label":"Create empty commit"}],"recommendedAction":"empty_commit"}}',
    annotations: {
      title: 'Get Worktree State',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        baseBranch: {
          type: 'string',
          description: 'Base branch to compare against (default: main)',
        },
        verbose: {
          type: 'boolean',
          description: 'Include detailed file lists and commit info',
        },
      },
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        ...commandResultBase,
        data: {
          type: 'object',
          properties: {
            scenario: { type: 'string' },
            scenarioDescription: { type: 'string' },
            currentBranch: { type: 'string' },
            baseBranch: { type: 'string' },
            worktreeType: { type: 'string' },
            hasChanges: { type: 'boolean' },
            hasStagedChanges: { type: 'boolean' },
            hasUnstagedChanges: { type: 'boolean' },
            localCommits: { type: 'array', items: { type: 'string' } },
            stagedFiles: { type: 'array', items: { type: 'string' } },
            unstagedFiles: { type: 'array', items: { type: 'string' } },
            availableActions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
            recommendedAction: { type: 'string' },
          },
        },
      },
      required: ['success', 'command', 'timestamp'],
    },
  },
  {
    name: 'worktree_create_pr',
    description:
      'Create a new PR with a dedicated worktree. Handles git state intelligently based on the specified action. Use worktree_get_state first to understand available actions.\n\n' +
      'Returns a CommandResult JSON with:\n' +
      '- data.prNumber: The created PR number\n' +
      '- data.prUrl: URL to the PR on GitHub\n' +
      '- data.branch: Branch name used for the PR\n' +
      '- data.worktreePath: Absolute path to the new worktree directory\n\n' +
      'Example success response:\n' +
      '{"success":true,"command":"newpr","timestamp":"...","data":{"prNumber":42,"prUrl":"https://github.com/owner/repo/pull/42","branch":"feat/add-feature","worktreePath":"/home/user/repo.pr42","draft":false,"scenario":"main_clean_same","actionTaken":"empty_commit","created":true}}',
    annotations: {
      title: 'Create PR with Worktree',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string',
          description: 'PR title/description',
        },
        action: {
          type: 'string',
          description:
            'How to handle current changes. Get available actions from worktree_get_state first. Common actions: empty_commit, commit_staged, commit_all, stash_staged, stash_all, include_staged, include_all, pr_for_branch_commit_all',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR (default: false)',
        },
        baseBranch: {
          type: 'string',
          description: 'Base branch for PR (default: main)',
        },
        branchName: {
          type: 'string',
          description: 'Custom branch name (auto-generated if not provided)',
        },
      },
      required: ['description'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        ...commandResultBase,
        data: {
          type: 'object',
          properties: {
            prNumber: { type: 'number' },
            prUrl: { type: 'string' },
            branch: { type: 'string' },
            worktreePath: { type: 'string' },
            draft: { type: 'boolean' },
            scenario: { type: 'string' },
            actionTaken: { type: 'string' },
            created: { type: 'boolean' },
          },
        },
      },
      required: ['success', 'command', 'timestamp'],
    },
  },
  {
    name: 'worktree_setup_pr',
    description:
      'Set up a worktree for an existing PR. Use this when you want to work on an existing PR that does not have a local worktree.\n\n' +
      'Returns a CommandResult JSON with:\n' +
      '- data.prNumber: The PR number\n' +
      '- data.worktreePath: Absolute path to the new worktree directory\n' +
      '- data.branch: Branch name checked out in the worktree\n\n' +
      'Example success response:\n' +
      '{"success":true,"command":"newpr","timestamp":"...","data":{"prNumber":42,"prUrl":"https://github.com/owner/repo/pull/42","branch":"feat/existing-feature","worktreePath":"/home/user/repo.pr42","draft":false,"created":false}}',
    annotations: {
      title: 'Setup PR Worktree',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        prNumber: {
          type: 'number',
          description: 'PR number to set up worktree for',
        },
      },
      required: ['prNumber'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        ...commandResultBase,
        data: {
          type: 'object',
          properties: {
            prNumber: { type: 'number' },
            prUrl: { type: 'string' },
            branch: { type: 'string' },
            worktreePath: { type: 'string' },
            draft: { type: 'boolean' },
            created: { type: 'boolean' },
          },
        },
      },
      required: ['success', 'command', 'timestamp'],
    },
  },
  {
    name: 'worktree_list',
    description:
      'List all git worktrees with their PR status.\n\n' +
      'Returns a CommandResult JSON with:\n' +
      '- data.worktrees: Array of worktree objects with path, branch, type, prNumber, prState\n' +
      '- data.total: Total number of worktrees\n' +
      '- data.openCount: Number of open PRs\n\n' +
      'Example success response:\n' +
      '{"success":true,"command":"lswt","timestamp":"...","data":{"worktrees":[{"path":"/home/user/repo","name":"repo","branch":"main","commit":"abc1234","type":"main","prNumber":null,"prState":null,"isDraft":null,"hasChanges":false}],"total":1,"prCount":0,"remotePrCount":0,"openCount":0,"changesCount":0}}',
    annotations: {
      title: 'List Worktrees',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        showStatus: {
          type: 'boolean',
          description: 'Include PR status from GitHub (requires gh CLI)',
        },
      },
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        ...commandResultBase,
        data: {
          type: 'object',
          properties: {
            worktrees: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  name: { type: 'string' },
                  branch: { type: 'string' },
                  commit: { type: 'string' },
                  type: { type: 'string' },
                  prNumber: { type: 'number' },
                  prState: { type: 'string' },
                  isDraft: { type: 'boolean' },
                  hasChanges: { type: 'boolean' },
                  prTitle: { type: 'string' },
                  prUrl: { type: 'string' },
                },
              },
            },
            total: { type: 'number' },
            prCount: { type: 'number' },
            remotePrCount: { type: 'number' },
            openCount: { type: 'number' },
            changesCount: { type: 'number' },
          },
        },
      },
      required: ['success', 'command', 'timestamp'],
    },
  },
  {
    name: 'worktree_clean',
    description:
      'Clean up worktrees for merged or closed PRs. Removes worktree directories and optionally deletes local and remote branches.\n\n' +
      'Returns a CommandResult JSON with:\n' +
      '- data.cleaned: Array of cleaned worktree objects with prNumber, branch, path, prState\n' +
      '- data.totalCleaned: Number of worktrees cleaned\n' +
      '- data.skipped: Array of skipped worktrees with reason\n\n' +
      'Example success response:\n' +
      '{"success":true,"command":"cleanpr","timestamp":"...","data":{"cleaned":[{"prNumber":42,"branch":"feat/old-feature","path":"/home/user/repo.pr42","prState":"MERGED","localBranchDeleted":true,"remoteBranchDeleted":false}],"skipped":[],"totalCleaned":1,"totalSkipped":0}}',
    annotations: {
      title: 'Clean Worktrees',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        prNumber: {
          type: 'number',
          description: 'Specific PR to clean (optional, cleans all merged/closed if not specified)',
        },
        deleteRemote: {
          type: 'boolean',
          description: 'Also delete remote branches (default: false)',
        },
        force: {
          type: 'boolean',
          description: 'Force remove even if not merged (default: false)',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview what would be cleaned without making changes',
        },
      },
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        ...commandResultBase,
        data: {
          type: 'object',
          properties: {
            cleaned: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  prNumber: { type: 'number' },
                  branch: { type: 'string' },
                  path: { type: 'string' },
                  prState: { type: 'string' },
                  localBranchDeleted: { type: 'boolean' },
                  remoteBranchDeleted: { type: 'boolean' },
                },
              },
            },
            skipped: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  prNumber: { type: 'number' },
                  reason: { type: 'string' },
                },
              },
            },
            totalCleaned: { type: 'number' },
            totalSkipped: { type: 'number' },
            wouldClean: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  prNumber: { type: 'number' },
                  branch: { type: 'string' },
                  path: { type: 'string' },
                  prState: { type: 'string' },
                },
              },
            },
            totalWouldClean: { type: 'number' },
          },
        },
      },
      required: ['success', 'command', 'timestamp'],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'git-worktree-tools',
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'worktree_get_state': {
        const baseBranch = (args?.baseBranch as string) ?? 'main';
        const verbose = (args?.verbose as boolean) ?? false;

        const result = await queryState({ baseBranch, verbose });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'worktree_create_pr': {
        const description = args?.description as string;
        if (!description) {
          const errorResult = createErrorResult(
            'newpr',
            ErrorCode.INVALID_ARGUMENT,
            'description is required'
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(errorResult, null, 2),
              },
            ],
            isError: true,
          };
        }

        const action = args?.action as string | undefined;
        const draft = (args?.draft as boolean) ?? false;
        const baseBranch = (args?.baseBranch as string) ?? 'main';
        const branchName = args?.branchName as string | undefined;

        // Validate action if provided
        let validatedAction: StateActionKey | undefined;
        if (action) {
          if (!isValidStateActionKey(action)) {
            const errorResult = createErrorResult(
              'newpr',
              ErrorCode.INVALID_ACTION,
              `Invalid action: ${action}. Use worktree_get_state to see available actions.`
            );
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(errorResult, null, 2),
                },
              ],
              isError: true,
            };
          }
          validatedAction = action as StateActionKey;
        }

        const result = await createPr({
          description,
          action: validatedAction,
          draft,
          baseBranch,
          branchName,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      }

      case 'worktree_setup_pr': {
        const prNumber = args?.prNumber as number;
        if (!prNumber || typeof prNumber !== 'number') {
          const errorResult = createErrorResult(
            'newpr',
            ErrorCode.INVALID_ARGUMENT,
            'prNumber is required and must be a number'
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(errorResult, null, 2),
              },
            ],
            isError: true,
          };
        }

        const result = await setupPrWorktree({ prNumber });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      }

      case 'worktree_list': {
        const showStatus = (args?.showStatus as boolean) ?? true;

        const result = await listWorktrees({ showStatus });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      }

      case 'worktree_clean': {
        const prNumber = args?.prNumber as number | undefined;
        const deleteRemote = (args?.deleteRemote as boolean) ?? false;
        const force = (args?.force as boolean) ?? false;
        const dryRun = (args?.dryRun as boolean) ?? false;

        const result = await cleanWorktrees({
          prNumber: prNumber ?? null,
          deleteRemote,
          force,
          dryRun,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      }

      default: {
        const errorResult = createErrorResult(
          name ?? 'unknown',
          ErrorCode.INVALID_ARGUMENT,
          `Unknown tool: ${name}`
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(errorResult, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorResult = createErrorResult(name ?? 'unknown', ErrorCode.UNKNOWN_ERROR, message);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(errorResult, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});
