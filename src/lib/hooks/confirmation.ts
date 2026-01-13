/**
 * Hook Confirmation Module
 *
 * Provides interactive confirmation prompts for hook execution,
 * allowing users to review, skip, or edit hooks before they run.
 */

import * as colors from '../colors.js';
import { promptChoice, promptInput } from '../prompts.js';
import type { HookName, HookDefinition, ComplexHookDef } from './types.js';
import { isSimpleHook, isMultipleHook, isComplexHook } from './types.js';

/**
 * Environment variables that indicate a CI/CD environment.
 * When any of these are set, interactive prompts are skipped.
 */
const CI_ENVIRONMENT_VARIABLES = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'JENKINS_URL',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'TEAMCITY_VERSION',
  'TF_BUILD', // Azure DevOps
  'CODEBUILD_BUILD_ID', // AWS CodeBuild
  'BITBUCKET_BUILD_NUMBER', // Bitbucket Pipelines
] as const;

/**
 * Action to take for a hook
 */
export type HookConfirmAction = 'run' | 'skip' | 'edit';

/**
 * Result from hook confirmation prompt
 */
export interface HookConfirmResult {
  /** Action user selected */
  action: HookConfirmAction;
  /** Modified command if user chose to edit */
  editedCommand?: string;
}

/**
 * Extract commands from a hook definition for display
 */
export function getHookCommands(definition: HookDefinition): string[] {
  if (isSimpleHook(definition)) {
    return [definition];
  }
  if (isMultipleHook(definition)) {
    return definition;
  }
  if (isComplexHook(definition)) {
    if (definition.command) return [definition.command];
    if (definition.script) return [`[script: ${definition.script}]`];
  }
  return [];
}

/**
 * Check if hook can be edited (simple command or complex with command property)
 * Script-based hooks and multiple command hooks cannot be edited inline
 */
export function isHookEditable(definition: HookDefinition): boolean {
  if (isSimpleHook(definition)) {
    return true;
  }
  if (isComplexHook(definition)) {
    return !!definition.command && !definition.script;
  }
  // Multiple commands cannot be edited inline
  return false;
}

/**
 * Check if running in an interactive environment
 * Returns false in CI, non-TTY, or when common CI environment variables are set
 */
export function isInteractiveEnvironment(): boolean {
  // Check if stdin is a TTY
  if (!process.stdin.isTTY) {
    return false;
  }

  // Check for CI environment variables
  for (const envVar of CI_ENVIRONMENT_VARIABLES) {
    if (process.env[envVar]) {
      return false;
    }
  }

  return true;
}

/**
 * Display hook details and prompt for confirmation
 *
 * Shows the user what the hook will do and lets them choose to:
 * - Run the hook as-is
 * - Skip the hook
 * - Edit the command (if editable)
 */
export async function promptHookConfirmation(
  hookName: HookName,
  definition: HookDefinition,
  cwd: string
): Promise<HookConfirmResult> {
  const commands = getHookCommands(definition);
  const canEdit = isHookEditable(definition);

  // Display hook information
  console.log();
  console.log(colors.bold(`Hook: ${hookName}`));
  console.log(colors.dim(`Working directory: ${cwd}`));
  console.log(colors.dim('Command(s):'));
  for (const cmd of commands) {
    console.log(`  ${colors.cyan(cmd)}`);
  }

  // Show additional info for complex hooks
  if (isComplexHook(definition)) {
    const complex = definition as ComplexHookDef;
    if (complex.timeout) {
      console.log(colors.dim(`Timeout: ${complex.timeout}ms`));
    }
    if (complex.failOnError === false) {
      console.log(colors.dim('Non-fatal: continues on error'));
    }
    if (complex.if) {
      console.log(colors.dim(`Condition: ${complex.if}`));
    }
  }

  console.log();

  // Build choices
  type ChoiceValue = 'run' | 'skip' | 'edit';
  const choices: Array<{ label: string; value: ChoiceValue }> = [
    { label: 'Run hook', value: 'run' },
    { label: 'Skip hook', value: 'skip' },
  ];

  if (canEdit) {
    choices.push({ label: 'Edit command', value: 'edit' });
  }

  const action = await promptChoice<ChoiceValue>('How would you like to proceed?', choices);

  // Handle edit action
  if (action === 'edit') {
    const originalCommand = commands[0] || '';
    const editedCommand = await promptInput('Enter modified command:', originalCommand);

    // Empty edit treated as skip
    if (!editedCommand.trim()) {
      return { action: 'skip' };
    }

    return { action: 'run', editedCommand: editedCommand.trim() };
  }

  return { action };
}

/**
 * Create a temporary hook definition with an edited command
 * Used when user edits a command inline
 */
export function createEditedHookDefinition(
  original: HookDefinition,
  editedCommand: string
): HookDefinition {
  if (isSimpleHook(original)) {
    return editedCommand;
  }
  if (isComplexHook(original)) {
    return {
      ...original,
      command: editedCommand,
      script: undefined, // Clear script if present
    };
  }
  // For multiple hooks, replace with single edited command
  return editedCommand;
}
