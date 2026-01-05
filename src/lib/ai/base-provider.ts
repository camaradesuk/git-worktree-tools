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
 * Format repository documentation context for prompt inclusion
 */
function formatRepoContext(
  docs: BranchContext['repoDocumentation'] | PRContext['repoDocumentation']
): string {
  if (!docs) return '';

  const parts: string[] = [];

  if (docs.projectDescription) {
    parts.push(`Project: ${docs.projectDescription}`);
  }

  if (docs.techStack && docs.techStack.length > 0) {
    parts.push(`Tech: ${docs.techStack.join(', ')}`);
  }

  // For branch names and titles, only include a brief README excerpt
  if (docs.readme) {
    // Extract just the first meaningful paragraph (skip title)
    const lines = docs.readme.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    const firstParagraph = lines.slice(0, 3).join(' ').slice(0, 200);
    if (firstParagraph) {
      parts.push(`About: ${firstParagraph}${firstParagraph.length >= 200 ? '...' : ''}`);
    }
  }

  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

/**
 * Format full repository documentation for detailed prompts (PR description, plan)
 */
function formatFullRepoContext(
  docs: PRContext['repoDocumentation'] | PlanContext['repoDocumentation']
): string {
  if (!docs) return '';

  const parts: string[] = [];

  if (docs.projectDescription) {
    parts.push(`Project: ${docs.projectDescription}`);
  }

  if (docs.techStack && docs.techStack.length > 0) {
    parts.push(`Tech: ${docs.techStack.join(', ')}`);
  }

  // Include more README content for detailed prompts
  if (docs.readme) {
    // Truncate to first ~500 chars for full context
    const truncated =
      docs.readme.length > 500 ? docs.readme.slice(0, 500) + '...[truncated]' : docs.readme;
    parts.push(`README:\n${truncated}`);
  }

  return parts.length > 0 ? '\nRepository Context:\n' + parts.join('\n') : '';
}

/**
 * Generate a prompt for branch name generation
 *
 * Context: Called at the START of newpr/wt workflow.
 * User has only provided a description - no code changes yet.
 * Output must be a valid git branch name.
 */
export function createBranchNamePrompt(context: BranchContext): string {
  const maxLen = context.maxLength ?? 50;
  const avoid =
    context.existingBranches && context.existingBranches.length > 0
      ? `\nAvoid: ${context.existingBranches.slice(0, 5).join(', ')}`
      : '';
  const repoContext = formatRepoContext(context.repoDocumentation);

  // Structure: Context → Format → Constraint → Output instruction
  // Keeping it terse works better across all models (Claude, Gemini, Ollama, GPT)
  return `Task: ${context.description}${repoContext}

Generate a git branch name.
Format: ${context.branchPrefix}/<short-kebab-description>
Max: ${maxLen} chars${avoid}

Branch name only:`;
}

/**
 * Generate a prompt for PR title generation
 *
 * Context: Often called at the START of work when creating a PR.
 * May have NO commits yet - the user's description is the PRIMARY signal.
 * If commits exist, they describe what was DONE and should be prioritized.
 */
export function createPRTitlePrompt(context: PRContext): string {
  const hasCommits = context.commits && context.commits.length > 0;
  const hasFiles = context.changedFiles && context.changedFiles.length > 0;
  const repoContext = formatRepoContext(context.repoDocumentation);

  // Build context based on what's available
  const parts: string[] = [`Intent: ${context.description}`];

  if (hasCommits) {
    const commits = context
      .commits!.slice(0, 5)
      .map((c) => c.message)
      .join('; ');
    parts.push(`Commits: ${commits}`);
  }

  if (hasFiles) {
    parts.push(`Files: ${context.changedFiles!.slice(0, 10).join(', ')}`);
  }

  parts.push(`${context.branchName} → ${context.baseBranch}`);

  // Adjust guidance based on available context
  const contextNote =
    !hasCommits && !hasFiles
      ? '\nNote: No commits yet - base title on intent and branch name.'
      : '';

  return `Generate a PR title (max 72 chars, imperative mood).

${parts.join('\n')}${repoContext}${contextNote}

Title only:`;
}

/**
 * Generate a prompt for PR description generation
 *
 * Context: Often called at the START of work when creating a draft PR.
 * May have NO commits yet - focus on intent and planned work.
 * If commits/diff exist, they provide concrete context about what was done.
 *
 * Key insight: Early PRs describe INTENT, later PRs describe IMPLEMENTATION.
 */
export function createPRDescriptionPrompt(context: PRContext): string {
  const hasCommits = context.commits && context.commits.length > 0;
  const hasFiles = context.changedFiles && context.changedFiles.length > 0;
  const hasDiff = context.diff && context.diff.length > 0;
  const isEarlyStage = !hasCommits && !hasFiles;
  const repoContext = formatFullRepoContext(context.repoDocumentation);

  // Build context section - structured for easy parsing by LLM
  const sections: string[] = [];

  sections.push(`Intent: ${context.description}`);
  sections.push(`Branch: ${context.branchName} → ${context.baseBranch}`);

  if (hasCommits) {
    const commitList = context
      .commits!.slice(0, 10)
      .map((c) => `- ${c.message}`)
      .join('\n');
    sections.push(`Commits:\n${commitList}`);
  }

  if (hasFiles) {
    const fileCount = context.changedFiles!.length;
    const fileList = context.changedFiles!.slice(0, 15).join(', ');
    const suffix = fileCount > 15 ? ` (+${fileCount - 15} more)` : '';
    sections.push(`Files (${fileCount}): ${fileList}${suffix}`);
  }

  if (hasDiff) {
    sections.push(`Diff preview:\n\`\`\`\n${context.diff!.slice(0, 1500)}\n\`\`\``);
  }

  // Adapt the output guidance based on stage
  const summaryGuidance = isEarlyStage
    ? '[Describe what this PR will accomplish - this is a draft for early work]'
    : '[2-3 sentences: what this does and why]';

  const changesGuidance = isEarlyStage
    ? '- [ ] [Planned change 1]\n- [ ] [Planned change 2]\n- [ ] [etc. - as checklist]'
    : '- [Key change 1]\n- [Key change 2]\n- [etc.]';

  const contextNote = isEarlyStage
    ? '\n\nNote: This is an early-stage PR with no commits yet. Focus on planned work and objectives.'
    : '';

  return `Generate a PR description for code review.

${sections.join('\n\n')}${repoContext}${contextNote}

Output format (markdown):

## Summary
${summaryGuidance}

## Changes
${changesGuidance}

## Test Plan
- [ ] [How to verify this works]

Be concise.${isEarlyStage ? ' This will be updated as work progresses.' : ' Reviewers will see the diff separately.'}`;
}

/**
 * Generate a prompt for commit message generation
 *
 * Context: User is committing staged changes.
 * We have: staged files, potentially a diff, maybe recent commits for style.
 * Output: A commit message following the configured style.
 */
export function createCommitMessagePrompt(context: CommitContext): string {
  const style = context.style ?? 'conventional';

  const styleFormats: Record<string, string> = {
    conventional: 'type(scope): description  (e.g., feat(auth): add login flow)',
    gitmoji: '🔧 description  (use appropriate emoji: ✨ feat, 🐛 fix, 📝 docs, ♻️ refactor)',
    simple: 'Clear description of what changed',
  };

  // Recent commits help match the repo's style
  const styleRef =
    context.recentCommits && context.recentCommits.length > 0
      ? `\nRecent commits (for style): ${context.recentCommits.slice(0, 3).join(' | ')}`
      : '';

  // Diff is the PRIMARY context - it shows exactly what changed
  const diff = context.diff ? `\nChanges:\n\`\`\`\n${context.diff.slice(0, 1500)}\n\`\`\`` : '';

  return `Generate a commit message (first line max 72 chars).

Staged: ${context.stagedFiles.join(', ')}
Style: ${styleFormats[style]}${styleRef}${diff}

Commit message only:`;
}

/**
 * Generate a prompt for plan document generation
 *
 * Context: User wants a planning document for a new feature/task.
 * We may have repo structure and tech stack info to provide context.
 * Output: A structured markdown document with tasks and approach.
 */
export function createPlanDocumentPrompt(context: PlanContext): string {
  const sections: string[] = [];

  sections.push(`Task: ${context.description}`);
  sections.push(`Branch: ${context.branchName}`);

  // Prefer tech stack from repoDocumentation if available
  const techStack = context.repoDocumentation?.techStack || context.techStack;
  if (techStack && techStack.length > 0) {
    sections.push(`Tech: ${techStack.join(', ')}`);
  }

  if (context.repoStructure && context.repoStructure.length > 0) {
    sections.push(`Structure:\n${context.repoStructure.slice(0, 20).join('\n')}`);
  }

  // Add full repo context for planning
  const repoContext = formatFullRepoContext(context.repoDocumentation);

  return `Create a development plan document.

${sections.join('\n')}${repoContext}

Output format (markdown):

# Plan: [Concise Task Title]

**Branch:** \`${context.branchName}\`
**Status:** In Progress

## Objective
[1-2 sentences: what we're building and why]

## Tasks
- [ ] [Specific, actionable task 1]
- [ ] [Specific, actionable task 2]
- [ ] [etc.]

## Technical Approach
[Brief description of implementation strategy]

## Acceptance Criteria
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

Keep tasks concrete and actionable. Focus on the implementation path.`;
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
