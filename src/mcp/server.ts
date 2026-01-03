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
import { type StateActionKey, isValidStateActionKey } from '../lib/json-output.js';

// Tool definitions
const tools: Tool[] = [
  {
    name: 'worktree_get_state',
    description:
      'Analyze current git state and return available actions. Call this BEFORE creating a PR to understand what options are available based on the current git state (staged files, branch, commits, etc.).',
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
  },
  {
    name: 'worktree_create_pr',
    description:
      'Create a new PR with a dedicated worktree. Handles git state intelligently based on the specified action. Use worktree_get_state first to understand available actions.',
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
  },
  {
    name: 'worktree_setup_pr',
    description:
      'Set up a worktree for an existing PR. Use this when you want to work on an existing PR that does not have a local worktree.',
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
  },
  {
    name: 'worktree_list',
    description: 'List all git worktrees with their PR status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        showStatus: {
          type: 'boolean',
          description: 'Include PR status from GitHub (requires gh CLI)',
        },
      },
    },
  },
  {
    name: 'worktree_clean',
    description: 'Clean up worktrees for merged or closed PRs.',
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
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'INVALID_ARGUMENT',
                    message: 'description is required',
                  },
                }),
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
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: false,
                    error: {
                      code: 'INVALID_ACTION',
                      message: `Invalid action: ${action}. Use worktree_get_state to see available actions.`,
                    },
                  }),
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
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'INVALID_ARGUMENT',
                    message: 'prNumber is required and must be a number',
                  },
                }),
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

      default:
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: {
                  code: 'UNKNOWN_TOOL',
                  message: `Unknown tool: ${name}`,
                },
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message,
            },
          }),
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
