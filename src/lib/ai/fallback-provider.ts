/**
 * Fallback AI Provider
 *
 * Used when no AI provider is configured or available.
 * Generates content using simple rules-based approach.
 */

import type {
  AIProvider,
  AIGenerationResult,
  BranchContext,
  PRContext,
  CommitContext,
  PlanContext,
} from './types.js';
import { createSuccessResult, sanitizeBranchName } from './base-provider.js';

/**
 * Generate a random suffix for uniqueness
 */
function randomSuffix(length = 6): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Fallback provider that uses simple rules-based generation
 */
export class FallbackProvider implements AIProvider {
  readonly name = 'fallback';

  async isAvailable(): Promise<boolean> {
    return true; // Always available as fallback
  }

  async generateBranchName(context: BranchContext): Promise<AIGenerationResult> {
    const maxLength = context.maxLength ?? 50;
    const base = sanitizeBranchName(
      context.description,
      maxLength - context.branchPrefix.length - 8
    );
    const suffix = randomSuffix();
    const branchName = `${context.branchPrefix}/${base}-${suffix}`;

    return createSuccessResult(branchName, this.name);
  }

  async generatePRTitle(context: PRContext): Promise<AIGenerationResult> {
    // Use description as title, capitalize first letter
    let title = context.description;
    if (title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    // Truncate if too long
    if (title.length > 72) {
      title = title.slice(0, 69) + '...';
    }

    return createSuccessResult(title, this.name);
  }

  async generatePRDescription(context: PRContext): Promise<AIGenerationResult> {
    const changedFilesSection =
      context.changedFiles && context.changedFiles.length > 0
        ? context.changedFiles.map((f) => `- \`${f}\``).join('\n')
        : '- ';

    const commitsSection =
      context.commits && context.commits.length > 0
        ? context.commits.map((c) => `- ${c.message}`).join('\n')
        : '';

    const description = `## Summary

${context.description}

## Changes

${changedFilesSection}

${commitsSection ? `## Commits\n\n${commitsSection}\n\n` : ''}## Test Plan

- [ ]

---
🤖 PR created with \`newpr\``;

    return createSuccessResult(description, this.name);
  }

  async generateCommitMessage(context: CommitContext): Promise<AIGenerationResult> {
    // Generate based on staged files
    const fileCount = context.stagedFiles.length;
    const fileList =
      fileCount > 3
        ? `${context.stagedFiles.slice(0, 3).join(', ')} and ${fileCount - 3} more`
        : context.stagedFiles.join(', ');

    let prefix = 'chore';
    const hasTestFiles = context.stagedFiles.some(
      (f) => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
    );
    const hasSrcFiles = context.stagedFiles.some(
      (f) => f.startsWith('src/') || f.endsWith('.ts') || f.endsWith('.js')
    );

    if (hasTestFiles && !hasSrcFiles) {
      prefix = 'test';
    } else if (hasSrcFiles) {
      prefix = 'feat';
    }

    const message =
      context.style === 'gitmoji'
        ? `✨ Update ${fileList}`
        : context.style === 'simple'
          ? `Update ${fileList}`
          : `${prefix}: update ${fileList}`;

    return createSuccessResult(message, this.name);
  }

  async generatePlanDocument(context: PlanContext): Promise<AIGenerationResult> {
    const today = new Date().toISOString().split('T')[0];

    const techSection =
      context.techStack && context.techStack.length > 0
        ? `\n\n## Tech Stack\n\n${context.techStack.map((t) => `- ${t}`).join('\n')}`
        : '';

    const plan = `# Plan: ${context.description}

**Branch:** \`${context.branchName}\`
**Created:** ${today}
**Status:** In Progress

## Objective

${context.description}

## Tasks

- [ ] Implement core functionality
- [ ] Add tests
- [ ] Update documentation
- [ ] Review and refine${techSection}

## Acceptance Criteria

- [ ] Feature works as expected
- [ ] Tests pass
- [ ] Documentation is updated

## Notes

<!-- Add implementation notes as you work -->

---
🤖 Generated with [git-worktree-tools](https://github.com/camaradesuk/git-worktree-tools)`;

    return createSuccessResult(plan, this.name);
  }
}
