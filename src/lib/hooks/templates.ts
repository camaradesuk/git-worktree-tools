/**
 * Built-in Hook Templates
 *
 * Pre-defined hook configurations for common use cases.
 */

import type { HookTemplate, HooksConfig } from './types.js';

/**
 * Auto-deps template - Install dependencies after worktree creation
 */
export const autoDepsTemplate: HookTemplate = {
  name: 'auto-deps',
  description: 'Automatically install dependencies after worktree creation',
  hooks: {
    'post-worktree': {
      command: 'npm install',
      if: 'exists:package.json',
      failOnError: false,
      timeout: 120000, // 2 minutes for large installs
    },
  },
  conditions: {
    filesExist: ['package.json'],
  },
};

/**
 * Auto-deps template for pnpm
 */
export const autoDepsTemplatePnpm: HookTemplate = {
  name: 'auto-deps-pnpm',
  description: 'Automatically install dependencies with pnpm after worktree creation',
  hooks: {
    'post-worktree': {
      command: 'pnpm install',
      if: 'exists:pnpm-lock.yaml',
      failOnError: false,
      timeout: 120000,
    },
  },
  conditions: {
    filesExist: ['pnpm-lock.yaml'],
    packageManager: 'pnpm',
  },
};

/**
 * Auto-deps template for yarn
 */
export const autoDepsTemplateYarn: HookTemplate = {
  name: 'auto-deps-yarn',
  description: 'Automatically install dependencies with yarn after worktree creation',
  hooks: {
    'post-worktree': {
      command: 'yarn install',
      if: 'exists:yarn.lock',
      failOnError: false,
      timeout: 120000,
    },
  },
  conditions: {
    filesExist: ['yarn.lock'],
    packageManager: 'yarn',
  },
};

/**
 * VSCode open template - Open worktree in VS Code
 */
export const vscodeOpenTemplate: HookTemplate = {
  name: 'vscode-open',
  description: 'Open the new worktree in VS Code after creation',
  hooks: {
    'post-worktree': 'code "{{WORKTREE_PATH}}"',
  },
};

/**
 * Cursor open template - Open worktree in Cursor
 */
export const cursorOpenTemplate: HookTemplate = {
  name: 'cursor-open',
  description: 'Open the new worktree in Cursor after creation',
  hooks: {
    'post-worktree': 'cursor "{{WORKTREE_PATH}}"',
  },
};

/**
 * Echo template - Simple debug hook that echoes context
 */
export const echoTemplate: HookTemplate = {
  name: 'echo',
  description: 'Echo hook context for debugging',
  hooks: {
    'post-analyze': 'echo "Scenario: $WT_SCENARIO"',
    'post-branch': 'echo "Branch: $WT_BRANCH_NAME"',
    'post-pr': 'echo "PR #$WT_PR_NUMBER: $WT_PR_URL"',
    'post-worktree': 'echo "Worktree created at: $WT_WORKTREE_PATH"',
  },
};

/**
 * Notify template - Display system notification on PR creation
 */
export const notifyTemplate: HookTemplate = {
  name: 'notify',
  description: 'Display system notification when PR is created',
  hooks: {
    'post-pr': {
      // Cross-platform notification command
      command:
        process.platform === 'darwin'
          ? 'osascript -e \'display notification "PR #{{PR_NUMBER}} created" with title "git-worktree-tools"\''
          : process.platform === 'win32'
            ? 'powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\'); [System.Windows.Forms.MessageBox]::Show(\'PR #{{PR_NUMBER}} created\')"'
            : 'notify-send "git-worktree-tools" "PR #{{PR_NUMBER}} created"',
      failOnError: false,
    },
  },
};

/**
 * Git-lfs template - Ensure LFS files are pulled
 */
export const gitLfsTemplate: HookTemplate = {
  name: 'git-lfs',
  description: 'Pull Git LFS files after worktree creation',
  hooks: {
    'post-worktree': {
      command: 'git lfs pull',
      if: 'exists:.gitattributes',
      failOnError: false,
    },
  },
  conditions: {
    filesExist: ['.gitattributes'],
  },
};

/**
 * Pre-commit install template - Set up pre-commit hooks
 */
export const preCommitTemplate: HookTemplate = {
  name: 'pre-commit',
  description: 'Install pre-commit hooks in new worktree',
  hooks: {
    'post-worktree': {
      command: 'pre-commit install',
      if: 'exists:.pre-commit-config.yaml',
      failOnError: false,
    },
  },
  conditions: {
    filesExist: ['.pre-commit-config.yaml'],
  },
};

/**
 * Husky install template - Set up husky hooks
 */
export const huskyTemplate: HookTemplate = {
  name: 'husky',
  description: 'Install husky hooks in new worktree',
  hooks: {
    'post-worktree': {
      command: 'npx husky install',
      if: 'exists:.husky',
      failOnError: false,
    },
  },
  conditions: {
    filesExist: ['.husky'],
  },
};

/**
 * All available hook templates
 */
export const HOOK_TEMPLATES: HookTemplate[] = [
  autoDepsTemplate,
  autoDepsTemplatePnpm,
  autoDepsTemplateYarn,
  vscodeOpenTemplate,
  cursorOpenTemplate,
  echoTemplate,
  notifyTemplate,
  gitLfsTemplate,
  preCommitTemplate,
  huskyTemplate,
];

/**
 * Get a hook template by name
 */
export function getHookTemplate(name: string): HookTemplate | undefined {
  return HOOK_TEMPLATES.find((t) => t.name === name);
}

/**
 * List all available hook templates
 */
export function listHookTemplates(): Array<{ name: string; description: string }> {
  return HOOK_TEMPLATES.map((t) => ({
    name: t.name,
    description: t.description,
  }));
}

/**
 * Get hooks configuration from a template
 */
export function getTemplateHooks(name: string): HooksConfig | undefined {
  const template = getHookTemplate(name);
  return template?.hooks;
}

/**
 * Merge multiple hook templates into a single configuration
 */
export function mergeHookTemplates(...templateNames: string[]): HooksConfig {
  const result: HooksConfig = {};

  for (const name of templateNames) {
    const template = getHookTemplate(name);
    if (template) {
      // For each hook in the template
      for (const [hookName, hookDef] of Object.entries(template.hooks)) {
        const existingHook = result[hookName as keyof HooksConfig];

        if (!existingHook) {
          // No existing hook, just add it
          result[hookName as keyof HooksConfig] = hookDef;
        } else if (Array.isArray(existingHook)) {
          // Existing is an array, add to it
          if (typeof hookDef === 'string') {
            result[hookName as keyof HooksConfig] = [...existingHook, hookDef];
          } else if (Array.isArray(hookDef)) {
            result[hookName as keyof HooksConfig] = [...existingHook, ...hookDef];
          }
        } else if (typeof existingHook === 'string') {
          // Existing is a string, convert to array
          if (typeof hookDef === 'string') {
            result[hookName as keyof HooksConfig] = [existingHook, hookDef];
          } else if (Array.isArray(hookDef)) {
            result[hookName as keyof HooksConfig] = [existingHook, ...hookDef];
          }
        }
        // Complex hooks can't easily be merged, so last one wins
      }
    }
  }

  return result;
}

/**
 * Suggest hook templates based on project structure
 */
export function suggestHookTemplates(projectFiles: string[]): string[] {
  const suggestions: string[] = [];
  const fileSet = new Set(projectFiles.map((f) => f.toLowerCase()));

  // Check for package managers
  if (fileSet.has('pnpm-lock.yaml')) {
    suggestions.push('auto-deps-pnpm');
  } else if (fileSet.has('yarn.lock')) {
    suggestions.push('auto-deps-yarn');
  } else if (fileSet.has('package.json')) {
    suggestions.push('auto-deps');
  }

  // Check for Git LFS
  if (fileSet.has('.gitattributes')) {
    suggestions.push('git-lfs');
  }

  // Check for pre-commit
  if (fileSet.has('.pre-commit-config.yaml')) {
    suggestions.push('pre-commit');
  }

  // Check for husky
  if (projectFiles.some((f) => f.toLowerCase().includes('.husky'))) {
    suggestions.push('husky');
  }

  return suggestions;
}
