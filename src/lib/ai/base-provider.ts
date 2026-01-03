/**
 * Base AI Provider implementation
 *
 * Provides common functionality and default implementations for AI providers.
 */

import type {
  AIProvider,
  AIGenerationResult,
  BranchContext,
  PRContext,
  CommitContext,
  PlanContext,
} from './types.js';

/**
 * Create a successful result
 */
export function createSuccessResult(content: string, provider: string): AIGenerationResult {
  return {
    success: true,
    content,
    provider,
  };
}

/**
 * Create an error result
 */
export function createErrorResult(error: string, provider: string): AIGenerationResult {
  return {
    success: false,
    error,
    provider,
  };
}

/**
 * Sanitize a string for use in a branch name
 */
export function sanitizeBranchName(name: string, maxLength = 50): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
    .slice(0, maxLength);
}

/**
 * Generate a prompt for branch name generation
 */
export function createBranchNamePrompt(context: BranchContext): string {
  const existingWarning =
    context.existingBranches && context.existingBranches.length > 0
      ? `\n\nExisting branches to avoid: ${context.existingBranches.slice(0, 10).join(', ')}`
      : '';

  return `Generate a concise git branch name for the following task.

Task description: ${context.description}
Repository: ${context.repoName}
Branch prefix: ${context.branchPrefix}
Max length: ${context.maxLength ?? 50} characters${existingWarning}

Requirements:
- Use kebab-case (lowercase with hyphens)
- Start with the prefix "${context.branchPrefix}/"
- Be descriptive but concise
- Avoid special characters except hyphens
- The total length should not exceed ${context.maxLength ?? 50} characters

Respond with ONLY the branch name, nothing else.`;
}

/**
 * Generate a prompt for PR title generation
 */
export function createPRTitlePrompt(context: PRContext): string {
  const commitsInfo =
    context.commits && context.commits.length > 0
      ? `\n\nCommits:\n${context.commits.map((c) => `- ${c.message}`).join('\n')}`
      : '';

  const filesInfo =
    context.changedFiles && context.changedFiles.length > 0
      ? `\n\nChanged files:\n${context.changedFiles.slice(0, 20).join('\n')}`
      : '';

  return `Generate a concise PR title for the following changes.

Description: ${context.description}
Branch: ${context.branchName}
Base: ${context.baseBranch}${commitsInfo}${filesInfo}

Requirements:
- Be concise but descriptive (max 72 characters)
- Use imperative mood (e.g., "Add", "Fix", "Update")
- Summarize the main purpose of the PR

Respond with ONLY the PR title, nothing else.`;
}

/**
 * Generate a prompt for PR description generation
 */
export function createPRDescriptionPrompt(context: PRContext): string {
  const commitsInfo =
    context.commits && context.commits.length > 0
      ? `\n\nCommits:\n${context.commits.map((c) => `- ${c.hash}: ${c.message}`).join('\n')}`
      : '';

  const filesInfo =
    context.changedFiles && context.changedFiles.length > 0
      ? `\n\nChanged files:\n${context.changedFiles.slice(0, 30).join('\n')}`
      : '';

  const diffInfo = context.diff ? `\n\nDiff (truncated):\n${context.diff.slice(0, 3000)}` : '';

  return `Generate a PR description for the following changes.

Description: ${context.description}
Branch: ${context.branchName}
Base: ${context.baseBranch}${commitsInfo}${filesInfo}${diffInfo}

Format the description using this structure:

## Summary

[1-3 sentence summary of what this PR does]

## Changes

- [List key changes as bullet points]

## Test Plan

- [ ] [Checklist of testing steps]

Requirements:
- Be clear and helpful for reviewers
- Focus on the "what" and "why", not "how"
- Keep it concise but informative`;
}

/**
 * Generate a prompt for commit message generation
 */
export function createCommitMessagePrompt(context: CommitContext): string {
  const styleGuide = {
    conventional: 'Use conventional commits format: type(scope): description',
    gitmoji: 'Start with an appropriate emoji (e.g., ✨ for features, 🐛 for bugs)',
    simple: 'Use a simple, descriptive format',
  };

  const recentInfo =
    context.recentCommits && context.recentCommits.length > 0
      ? `\n\nRecent commits for style reference:\n${context.recentCommits.slice(0, 5).join('\n')}`
      : '';

  const diffInfo = context.diff ? `\n\nDiff (truncated):\n${context.diff.slice(0, 2000)}` : '';

  return `Generate a commit message for the following staged changes.

Staged files:
${context.stagedFiles.join('\n')}

Style: ${context.style ?? 'conventional'}
${styleGuide[context.style ?? 'conventional']}${recentInfo}${diffInfo}

Requirements:
- First line should be max 72 characters
- Be specific about what changed
- Use present tense, imperative mood

Respond with ONLY the commit message.`;
}

/**
 * Generate a prompt for plan document generation
 */
export function createPlanDocumentPrompt(context: PlanContext): string {
  const structureInfo =
    context.repoStructure && context.repoStructure.length > 0
      ? `\n\nRepository structure:\n${context.repoStructure.slice(0, 30).join('\n')}`
      : '';

  const techInfo =
    context.techStack && context.techStack.length > 0
      ? `\n\nTech stack: ${context.techStack.join(', ')}`
      : '';

  return `Create a planning document for implementing the following task.

Task: ${context.description}
Branch: ${context.branchName}${structureInfo}${techInfo}

Format as Markdown with this structure:

# Plan: [Task Title]

**Branch:** \`${context.branchName}\`
**Created:** [Today's date]
**Status:** In Progress

## Objective

[Clear description of what we're building]

## Tasks

- [ ] [Task 1]
- [ ] [Task 2]
- [ ] [Task 3]

## Technical Approach

[Brief technical overview]

## Acceptance Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Notes

[Any important notes or considerations]

---
🤖 Generated with [git-worktree-tools](https://github.com/camaradesuk/git-worktree-tools)`;
}

/**
 * Abstract base class for AI providers
 *
 * Provides default implementations that can be overridden.
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;

  abstract isAvailable(): Promise<boolean>;

  /**
   * Generate content by sending a prompt to the AI
   * Subclasses must implement this method
   */
  protected abstract generate(prompt: string): Promise<AIGenerationResult>;

  async generateBranchName(context: BranchContext): Promise<AIGenerationResult> {
    const prompt = createBranchNamePrompt(context);
    const result = await this.generate(prompt);

    if (result.success && result.content) {
      // Clean up the response
      let branchName = result.content.trim();
      // Remove quotes if present
      branchName = branchName.replace(/^["']|["']$/g, '');
      // Ensure it starts with prefix
      if (!branchName.startsWith(`${context.branchPrefix}/`)) {
        branchName = `${context.branchPrefix}/${sanitizeBranchName(branchName)}`;
      }
      return { ...result, content: branchName };
    }

    return result;
  }

  async generatePRTitle(context: PRContext): Promise<AIGenerationResult> {
    const prompt = createPRTitlePrompt(context);
    const result = await this.generate(prompt);

    if (result.success && result.content) {
      // Clean up - remove quotes and trim
      const title = result.content.trim().replace(/^["']|["']$/g, '');
      return { ...result, content: title };
    }

    return result;
  }

  async generatePRDescription(context: PRContext): Promise<AIGenerationResult> {
    const prompt = createPRDescriptionPrompt(context);
    return this.generate(prompt);
  }

  async generateCommitMessage(context: CommitContext): Promise<AIGenerationResult> {
    const prompt = createCommitMessagePrompt(context);
    const result = await this.generate(prompt);

    if (result.success && result.content) {
      // Clean up - remove surrounding quotes
      const message = result.content.trim().replace(/^["']|["']$/g, '');
      return { ...result, content: message };
    }

    return result;
  }

  async generatePlanDocument(context: PlanContext): Promise<AIGenerationResult> {
    const prompt = createPlanDocumentPrompt(context);
    return this.generate(prompt);
  }
}
