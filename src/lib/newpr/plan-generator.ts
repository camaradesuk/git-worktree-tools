/**
 * Plan Generator Module
 *
 * Generates AI-powered implementation plan documents during PR creation.
 * Supports configurable paths with template variables and YAML frontmatter.
 */

import fs from 'fs';
import path from 'path';
import type { AIConfig, PlanContext } from '../ai/types.js';
import { getDefaultAIProviderManager } from '../ai/provider-manager.js';

/**
 * YAML frontmatter for plan documents
 */
export interface PlanFrontmatter {
  title: string;
  status: 'draft' | 'in-progress' | 'complete' | 'abandoned';
  pr: number;
  branch: string;
  base: string;
  created: string;
  updated: string;
  author: string;
  generator: string;
  generator_version: string;
}

/**
 * Template variables for path expansion
 */
export interface PathTemplateVars {
  prNumber: number;
  slug: string;
  branch: string;
  date: string;
  timestamp: number;
}

/**
 * Result from plan generation
 */
export interface PlanGeneratorResult {
  generated: boolean;
  path?: string;
  error?: string;
  frontmatter?: PlanFrontmatter;
}

/**
 * Result from shouldGeneratePlan decision
 */
export interface ShouldGenerateResult {
  generate: boolean;
  prompt: boolean;
  reason: string;
}

/**
 * Determine if plan should be generated based on flags and config
 *
 * Priority order:
 * 1. --no-plan flag (highest - always disable)
 * 2. --plan flag (force enable)
 * 3. config.ai.planDocument (enable by config)
 * 4. AI available + interactive (prompt user)
 */
export function shouldGeneratePlan(options: {
  cliFlag?: boolean;
  noFlag?: boolean;
  configEnabled?: boolean;
  aiAvailable: boolean;
  nonInteractive: boolean;
}): ShouldGenerateResult {
  if (options.noFlag) {
    return { generate: false, prompt: false, reason: 'Disabled by --no-plan' };
  }
  if (options.cliFlag) {
    return { generate: true, prompt: false, reason: 'Enabled by --plan' };
  }
  if (options.configEnabled) {
    return { generate: true, prompt: false, reason: 'Enabled by config' };
  }
  if (options.aiAvailable && !options.nonInteractive) {
    return { generate: false, prompt: true, reason: 'AI available, prompting user' };
  }
  return { generate: false, prompt: false, reason: 'Not configured' };
}

/**
 * Generate a URL-safe slug from description
 *
 * - Converts to lowercase
 * - Replaces special characters with dashes
 * - Limits to first 5 words
 * - Limits total length
 */
export function generateSlug(description: string, maxLength = 30): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-')
    .slice(0, maxLength)
    .replace(/-+$/, ''); // Remove trailing dashes
}

/**
 * Expand template variables in a path string
 *
 * Supported variables:
 * - {prNumber} - PR number
 * - {slug} - Description slug
 * - {branch} - Branch name (slashes replaced with dashes)
 * - {date} - ISO date (YYYY-MM-DD)
 * - {timestamp} - Unix timestamp
 */
export function expandPathTemplate(template: string, vars: PathTemplateVars): string {
  return template
    .replace(/\{prNumber\}/g, String(vars.prNumber))
    .replace(/\{slug\}/g, vars.slug)
    .replace(/\{branch\}/g, vars.branch.replace(/\//g, '-'))
    .replace(/\{date\}/g, vars.date)
    .replace(/\{timestamp\}/g, String(vars.timestamp));
}

/**
 * Generate YAML frontmatter object
 */
export function generateFrontmatter(options: {
  title: string;
  prNumber: number;
  branchName: string;
  baseBranch: string;
}): PlanFrontmatter {
  const now = new Date().toISOString();
  const packageVersion = process.env.npm_package_version || 'unknown';

  return {
    title: options.title,
    status: 'draft',
    pr: options.prNumber,
    branch: options.branchName,
    base: options.baseBranch,
    created: now,
    updated: now,
    author: 'ai-generated',
    generator: 'git-worktree-tools',
    generator_version: packageVersion,
  };
}

/**
 * Convert frontmatter object to YAML string
 */
export function frontmatterToYaml(fm: PlanFrontmatter): string {
  // Escape quotes in title if needed
  const escapedTitle = fm.title.includes('"') ? fm.title.replace(/"/g, '\\"') : fm.title;

  const lines = [
    '---',
    `title: "${escapedTitle}"`,
    `status: ${fm.status}`,
    `pr: ${fm.pr}`,
    `branch: ${fm.branch}`,
    `base: ${fm.base}`,
    `created: ${fm.created}`,
    `updated: ${fm.updated}`,
    `author: ${fm.author}`,
    `generator: ${fm.generator}`,
    `generator_version: "${fm.generator_version}"`,
    '---',
  ];
  return lines.join('\n');
}

/**
 * Resolve the plan file path based on config and template variables
 */
export function resolvePlanPath(
  worktreePath: string,
  aiConfig: AIConfig,
  vars: PathTemplateVars
): string {
  const template = aiConfig.planPath || 'PLAN-{prNumber}-{slug}.md';
  const filename = expandPathTemplate(template, vars);

  // Ensure path is within worktree (security check)
  const resolvedPath = path.resolve(worktreePath, filename);
  if (!resolvedPath.startsWith(path.resolve(worktreePath))) {
    // Path escapes worktree, use default
    return path.join(worktreePath, `PLAN-${vars.prNumber}-${vars.slug}.md`);
  }

  return resolvedPath;
}

/**
 * Generate and write a plan document
 *
 * Uses the configured AI provider to generate plan content,
 * adds YAML frontmatter, and writes to the specified path.
 */
export async function generatePlanDocument(
  context: PlanContext,
  planPath: string,
  aiConfig: AIConfig,
  options: {
    prNumber: number;
    baseBranch: string;
  }
): Promise<PlanGeneratorResult> {
  try {
    // Initialize AI provider and generate content
    const manager = getDefaultAIProviderManager(aiConfig);
    await manager.initialize();
    const result = await manager.generatePlanDocument(context);

    if (!result.success || !result.content) {
      return {
        generated: false,
        error: result.error || 'AI generation returned no content',
      };
    }

    // Generate frontmatter
    const frontmatter = generateFrontmatter({
      title: context.description,
      prNumber: options.prNumber,
      branchName: context.branchName,
      baseBranch: options.baseBranch,
    });

    // Combine frontmatter and content
    const fullContent = frontmatterToYaml(frontmatter) + '\n\n' + result.content;

    // Ensure parent directory exists
    const parentDir = path.dirname(planPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(planPath, fullContent, 'utf-8');

    return {
      generated: true,
      path: planPath,
      frontmatter,
    };
  } catch (error) {
    return {
      generated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build path template variables from context
 */
export function buildPathTemplateVars(options: {
  prNumber: number;
  description: string;
  branchName: string;
}): PathTemplateVars {
  return {
    prNumber: options.prNumber,
    slug: generateSlug(options.description),
    branch: options.branchName,
    date: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
  };
}
