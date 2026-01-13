# AI Plan Documents - Implementation Specification

**Status**: Draft - Pending Review
**Author**: Claude (Senior Systems Architect)
**Date**: 2026-01-13
**Target Environment**: WSL Ubuntu / macOS / Windows
**PR**: #18

---

## Executive Summary

This specification defines the implementation of AI-powered plan document generation during PR creation. The feature allows users to automatically generate an initial planning document that outlines implementation strategy, key decisions, and task breakdown.

The system supports three trigger methods: (1) explicit `--plan` CLI flag for on-demand generation, (2) `ai.planDocument: true` config option for automatic generation, and (3) interactive wizard prompt when AI is available but not configured. Path configuration is flexible, supporting fixed paths, user prompts, or LLM-determined locations based on project structure.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Detailed Design](#2-detailed-design)
3. [Execution Flow](#3-execution-flow)
4. [Edge Cases & Mitigations](#4-edge-cases--mitigations)
5. [Testing Strategy](#5-testing-strategy)
6. [Implementation Checklist](#6-implementation-checklist)
7. [Open Questions](#7-open-questions)
8. [References](#8-references)

---

## 1. High-Level Architecture

### 1.1 Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI Plan Document Generation                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐           │
│  │  Trigger Logic │──▶│  Plan Generator│──▶│  File Writer   │           │
│  │                │   │                │   │                │           │
│  │ • CLI flag     │   │ • Context build│   │ • Path resolve │           │
│  │ • Config check │   │ • AI service   │   │ • Atomic write │           │
│  │ • User prompt  │   │ • Content gen  │   │ • Backup exist │           │
│  └────────────────┘   └────────────────┘   └────────────────┘           │
│          │                    │                    │                     │
│          └────────────────────┼────────────────────┘                     │
│                               ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      newpr Integration                            │   │
│  │                                                                    │   │
│  │  • Called after worktree setup, before post-worktree hook         │   │
│  │  • Works in all three modes (new, existing PR, existing branch)   │   │
│  │  • JSON output includes plan generation status                    │   │
│  │  • Non-destructive: warn and continue on failure                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| Component       | File Location                      | Responsibility                             | Est. Effort |
| --------------- | ---------------------------------- | ------------------------------------------ | ----------- |
| **Types**       | `src/lib/ai/types.ts`              | Add `planPath`, `planPathMode` to AIConfig | 0.5h        |
| **Options**     | `src/lib/newpr/types.ts`           | Add `generatePlan`, `noPlan` flags         | 0.5h        |
| **Args**        | `src/lib/newpr/args.ts`            | Parse `--plan`, `--no-plan` flags          | 1h          |
| **Generator**   | `src/lib/newpr/plan-generator.ts`  | Core generation logic and path resolution  | 3h          |
| **Service**     | `src/lib/ai/generation-service.ts` | Add `generatePlanDocument()` method        | 0.5h        |
| **Integration** | `src/cli/newpr.ts`                 | Hook into all three modes                  | 2h          |
| **Tests**       | Various                            | Unit and integration tests                 | 3h          |

**Total Estimated Effort**: 10-12 hours

### 1.3 Dependencies

**Internal Dependencies**:

- `src/lib/ai/generation-service.ts` - AI content generation
- `src/lib/ai/provider-manager.ts` - Provider availability checks
- `src/lib/config.ts` - Config loading
- `src/lib/newpr/hook-runner.ts` - Must run before post-worktree hook

**External Dependencies**:

- AI provider (Claude, Gemini, OpenAI, Ollama) for content generation
- File system access for writing plan documents

---

## 2. Detailed Design

### 2.1 Trigger Methods

| Method                  | Description                                     | Priority |
| ----------------------- | ----------------------------------------------- | -------- |
| `--plan` flag           | CLI flag forces generation regardless of config | Highest  |
| `ai.planDocument: true` | Config enables auto-generation                  | Medium   |
| Interactive prompt      | Wizard asks when AI available but not enabled   | Lowest   |

**Interaction Rules:**

- `--plan` flag overrides everything (always generates)
- `--no-plan` flag suppresses generation (even if config enabled)
- In non-interactive mode (`-y`), use config setting only (no prompt)
- Interactive prompt only appears when AI is available but `planDocument` not enabled

### 2.2 Path Configuration

**Configuration Options:**

```json
{
  "ai": {
    "planDocument": true,
    "planPath": "PLAN-{prNumber}-{slug}.md",
    "planPathMode": "fixed"
  }
}
```

**Template Variables:**

| Variable      | Description                                     | Example         |
| ------------- | ----------------------------------------------- | --------------- |
| `{prNumber}`  | PR number                                       | `42`            |
| `{slug}`      | Brief description (first 3-5 words, kebab-case) | `add-user-auth` |
| `{branch}`    | Branch name (sanitized)                         | `feat-add-auth` |
| `{date}`      | ISO date                                        | `2026-01-13`    |
| `{timestamp}` | Unix timestamp                                  | `1736784000`    |

**Generated Filename Examples:**

| Description                  | PR  | Filename                          |
| ---------------------------- | --- | --------------------------------- |
| "Add user authentication"    | 42  | `PLAN-42-add-user-auth.md`        |
| "Fix login validation bug"   | 99  | `PLAN-99-fix-login-validation.md` |
| "Implement dark mode toggle" | 123 | `PLAN-123-implement-dark-mode.md` |

**Path Modes:**

| Mode              | Behavior                                                      |
| ----------------- | ------------------------------------------------------------- |
| `fixed` (default) | Use `planPath` template directly                              |
| `ask`             | Prompt user for path in interactive mode                      |
| `llm`             | Let LLM determine appropriate path based on project structure |

**Default Behavior:**

- If `planPath` not set, default to `PLAN-{prNumber}-{slug}.md` in worktree root
- If `planPathMode` not set, default to `fixed`
- Template variables are expanded at generation time
- `{slug}` is limited to 30 characters max and sanitized for filesystem safety

### 2.3 Plan Document Frontmatter

Generated plan documents include YAML frontmatter with metadata:

```markdown
---
title: 'Add user authentication'
status: draft
pr: 42
branch: feat/add-auth
base: main
created: 2026-01-13T10:30:00Z
updated: 2026-01-13T10:30:00Z
author: ai-generated
generator: git-worktree-tools
generator_version: '1.8.0'
---

# Implementation Plan: Add user authentication

...
```

**Frontmatter Fields:**

| Field               | Type     | Description                                                  |
| ------------------- | -------- | ------------------------------------------------------------ |
| `title`             | string   | Feature description from user input                          |
| `status`            | enum     | Plan status: `draft`, `in-progress`, `complete`, `abandoned` |
| `pr`                | number   | Associated PR number                                         |
| `branch`            | string   | Feature branch name                                          |
| `base`              | string   | Base branch (e.g., `main`)                                   |
| `created`           | ISO 8601 | Creation timestamp                                           |
| `updated`           | ISO 8601 | Last update timestamp                                        |
| `author`            | string   | `ai-generated` or username if manually edited                |
| `generator`         | string   | Tool name (`git-worktree-tools`)                             |
| `generator_version` | string   | Tool version                                                 |

**Status Workflow:**

```text
draft → in-progress → complete
                   ↘ abandoned
```

Users can manually update the `status` field as work progresses.

### 2.4 Generation Context

The `PlanContext` interface already exists:

```typescript
interface PlanContext {
  description: string; // User's feature description
  repoStructure?: string[]; // Key files/folders
  techStack?: string[]; // Detected technologies
  branchName: string; // Created branch name
  repoDocumentation?: RepoDocumentationContext;
}
```

**Additional Context to Provide:**

- Repository name
- Base branch
- Existing PLAN.md content (if updating)
- PR template content (if exists)

### 2.5 Type Updates

#### File: `src/lib/ai/types.ts`

**Add to `AIConfig`:**

```typescript
/** Path template for generated plan document (relative to worktree) */
planPath?: string;

/** How to determine plan path: 'fixed' | 'ask' | 'llm' */
planPathMode?: 'fixed' | 'ask' | 'llm';
```

**Add `PlanFrontmatter` interface:**

```typescript
/**
 * Frontmatter metadata for generated plan documents
 */
export interface PlanFrontmatter {
  /** Feature/PR title */
  title: string;
  /** Plan status */
  status: 'draft' | 'in-progress' | 'complete' | 'abandoned';
  /** Associated PR number */
  pr: number;
  /** Feature branch name */
  branch: string;
  /** Base branch */
  base: string;
  /** Creation timestamp (ISO 8601) */
  created: string;
  /** Last update timestamp (ISO 8601) */
  updated: string;
  /** Author identifier */
  author: string;
  /** Generator tool name */
  generator: string;
  /** Generator version */
  generator_version: string;
}
```

**Add to `DEFAULT_AI_CONFIG`:**

```typescript
planPath: 'PLAN-{prNumber}-{slug}.md',
planPathMode: 'fixed',
```

#### File: `src/lib/newpr/types.ts`

**Add to `Options`:**

```typescript
/** Generate plan document flag */
generatePlan?: boolean;
/** Explicitly disable plan generation */
noPlan?: boolean;
```

### 2.6 CLI Argument Parsing

#### File: `src/lib/newpr/args.ts`

**Add flag handling in `parseArgs()`:**

```typescript
case '--plan':
  options.generatePlan = true;
  break;

case '--no-plan':
  options.noPlan = true;
  break;
```

**Update help text:**

```text
AI/Automation Options:
  --plan                Generate AI plan document
  --no-plan             Skip plan document generation
  --json                Output result as JSON
```

### 2.7 Generation Service Updates

#### File: `src/lib/ai/generation-service.ts`

**Add method:**

```typescript
/**
 * Generate a plan document
 */
async generatePlanDocument(context: PlanContext): Promise<AIGenerationResult> {
  if (!this.config.planDocument) {
    return {
      success: false,
      error: 'AI plan document generation is disabled',
      provider: 'none',
    };
  }

  await this.ensureInitialized();
  const manager = getDefaultAIProviderManager();
  return manager.generatePlanDocument(context);
}
```

**Update `isEnabled()` method:**

```typescript
isEnabled(): boolean {
  return (
    this.config.provider !== 'none' &&
    Boolean(
      this.config.branchName ||
      this.config.prTitle ||
      this.config.prDescription ||
      this.config.commitMessage ||
      this.config.planDocument
    )
  );
}
```

### 2.8 Plan Generator Module

#### New File: `src/lib/newpr/plan-generator.ts`

```typescript
/**
 * Plan Document Generator
 *
 * Handles plan document generation logic and path resolution.
 */

import path from 'path';
import fs from 'fs/promises';
import { AIGenerationService } from '../ai/generation-service.js';
import type { AIConfig, PlanContext } from '../ai/types.js';
import type { WorktreeConfig } from '../config.js';

export interface PlanGeneratorOptions {
  /** User's feature description */
  description: string;
  /** Branch name */
  branchName: string;
  /** Base branch */
  baseBranch: string;
  /** PR number (for path template and frontmatter) */
  prNumber: number;
  /** Worktree path */
  worktreePath: string;
  /** Repository root */
  repoRoot: string;
  /** AI configuration */
  aiConfig: AIConfig;
  /** Full config for context */
  config: WorktreeConfig;
  /** Whether running in non-interactive mode */
  nonInteractive?: boolean;
  /** Override path from CLI or wizard */
  overridePath?: string;
}

export interface PlanGeneratorResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Path to generated file (relative to worktree) */
  planPath?: string;
  /** Absolute path to generated file */
  absolutePath?: string;
  /** Frontmatter metadata */
  frontmatter?: PlanFrontmatter;
  /** Error message if failed */
  error?: string;
  /** Whether generation was skipped */
  skipped?: boolean;
  /** Reason for skipping */
  skipReason?: string;
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
 * Generate a slug from description (first 3-5 words, kebab-case, max 30 chars)
 */
export function generateSlug(description: string, maxLength = 30): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .trim()
    .split(/\s+/) // Split on whitespace
    .slice(0, 5) // Take first 5 words
    .join('-') // Join with hyphens
    .slice(0, maxLength) // Limit length
    .replace(/-+$/, ''); // Remove trailing hyphens
}

/**
 * Expand path template variables
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
 * Generate frontmatter for plan document
 */
export function generateFrontmatter(options: {
  title: string;
  prNumber: number;
  branchName: string;
  baseBranch: string;
}): PlanFrontmatter {
  const now = new Date().toISOString();
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
    generator_version: process.env.npm_package_version || 'unknown',
  };
}

/**
 * Convert frontmatter to YAML string
 */
export function frontmatterToYaml(fm: PlanFrontmatter): string {
  return `---
title: "${fm.title}"
status: ${fm.status}
pr: ${fm.pr}
branch: ${fm.branch}
base: ${fm.base}
created: ${fm.created}
updated: ${fm.updated}
author: ${fm.author}
generator: ${fm.generator}
generator_version: "${fm.generator_version}"
---`;
}

/**
 * Determine if plan should be generated based on triggers
 */
export function shouldGeneratePlan(options: {
  cliFlag?: boolean;
  noFlag?: boolean;
  configEnabled?: boolean;
  aiAvailable: boolean;
  nonInteractive: boolean;
}): { generate: boolean; prompt: boolean; reason: string } {
  // --no-plan flag suppresses everything
  if (options.noFlag) {
    return { generate: false, prompt: false, reason: 'Disabled by --no-plan flag' };
  }

  // --plan flag overrides everything
  if (options.cliFlag) {
    return { generate: true, prompt: false, reason: 'Enabled by --plan flag' };
  }

  // Config-enabled
  if (options.configEnabled) {
    return { generate: true, prompt: false, reason: 'Enabled by config' };
  }

  // AI available but not enabled - prompt in interactive mode
  if (options.aiAvailable && !options.nonInteractive) {
    return { generate: false, prompt: true, reason: 'AI available, prompting user' };
  }

  return { generate: false, prompt: false, reason: 'Not configured' };
}

/**
 * Resolve the plan document path with template expansion
 */
export async function resolvePlanPath(options: {
  worktreePath: string;
  configPath?: string;
  pathMode?: 'fixed' | 'ask' | 'llm';
  overridePath?: string;
  templateVars: PathTemplateVars;
  aiService?: AIGenerationService;
  repoStructure?: string[];
}): Promise<string> {
  const {
    worktreePath,
    configPath,
    pathMode,
    overridePath,
    templateVars,
    aiService,
    repoStructure,
  } = options;

  // Override path takes precedence (also expand templates)
  if (overridePath) {
    const expanded = expandPathTemplate(overridePath, templateVars);
    return path.isAbsolute(expanded) ? expanded : path.join(worktreePath, expanded);
  }

  // LLM-determined path
  if (pathMode === 'llm' && aiService) {
    const suggestedPath = await suggestPlanPath(aiService, repoStructure || []);
    if (suggestedPath) {
      return path.join(worktreePath, suggestedPath);
    }
  }

  // Fixed path from config or default - expand template variables
  const template = configPath || 'PLAN-{prNumber}-{slug}.md';
  const relativePath = expandPathTemplate(template, templateVars);
  return path.join(worktreePath, relativePath);
}

/**
 * Use AI to suggest an appropriate plan path
 */
async function suggestPlanPath(
  aiService: AIGenerationService,
  repoStructure: string[]
): Promise<string | null> {
  // This would require extending the AI provider interface
  // For now, return null to fall back to default
  // Future: aiService.suggestPlanPath(repoStructure)
  return null;
}

/**
 * Generate plan document with frontmatter
 */
export async function generatePlanDocument(
  options: PlanGeneratorOptions
): Promise<PlanGeneratorResult> {
  const aiService = new AIGenerationService(options.aiConfig);

  // Build template variables for path expansion
  const now = new Date();
  const templateVars: PathTemplateVars = {
    prNumber: options.prNumber,
    slug: generateSlug(options.description),
    branch: options.branchName,
    date: now.toISOString().split('T')[0],
    timestamp: Math.floor(now.getTime() / 1000),
  };

  // Build context
  const context: PlanContext = {
    description: options.description,
    branchName: options.branchName,
    repoStructure: await getRepoStructure(options.repoRoot),
    techStack: await detectTechStack(options.repoRoot),
    repoDocumentation: await loadRepoDocumentation(options.repoRoot),
  };

  // Generate content from AI
  const result = await aiService.generatePlanDocument(context);

  if (!result.success || !result.content) {
    return {
      success: false,
      error: result.error || 'Failed to generate plan content',
    };
  }

  // Generate frontmatter metadata
  const frontmatter = generateFrontmatter({
    title: options.description,
    prNumber: options.prNumber,
    branchName: options.branchName,
    baseBranch: options.baseBranch,
  });

  // Combine frontmatter with AI-generated content
  const fullContent = `${frontmatterToYaml(frontmatter)}\n\n${result.content}`;

  // Resolve output path with template expansion
  const absolutePath = await resolvePlanPath({
    worktreePath: options.worktreePath,
    configPath: options.aiConfig.planPath,
    pathMode: options.aiConfig.planPathMode,
    overridePath: options.overridePath,
    templateVars: templateVars,
    aiService: aiService,
  });

  // Ensure directory exists
  const dir = path.dirname(absolutePath);
  await fs.mkdir(dir, { recursive: true });

  // Write file with frontmatter + content
  await fs.writeFile(absolutePath, fullContent, 'utf-8');

  // Calculate relative path for display
  const relativePath = path.relative(options.worktreePath, absolutePath);

  return {
    success: true,
    planPath: relativePath,
    absolutePath: absolutePath,
    frontmatter: frontmatter,
  };
}

/**
 * Get repository structure for context
 */
async function getRepoStructure(repoRoot: string): Promise<string[]> {
  const structure: string[] = [];

  try {
    const entries = await fs.readdir(repoRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (entry.name === 'node_modules') continue;

      if (entry.isDirectory()) {
        structure.push(`${entry.name}/`);
      } else if (isSignificantFile(entry.name)) {
        structure.push(entry.name);
      }
    }
  } catch {
    // Ignore errors, return empty
  }

  return structure.sort();
}

/**
 * Check if file is significant for context
 */
function isSignificantFile(name: string): boolean {
  const significant = [
    'package.json',
    'tsconfig.json',
    'Cargo.toml',
    'go.mod',
    'requirements.txt',
    'pyproject.toml',
    'Gemfile',
    'README.md',
    'CLAUDE.md',
    'PLAN.md',
  ];
  return significant.includes(name);
}

/**
 * Detect technology stack
 */
async function detectTechStack(repoRoot: string): Promise<string[]> {
  const stack: string[] = [];

  const checks: [string, string][] = [
    ['package.json', 'Node.js'],
    ['tsconfig.json', 'TypeScript'],
    ['Cargo.toml', 'Rust'],
    ['go.mod', 'Go'],
    ['requirements.txt', 'Python'],
    ['pyproject.toml', 'Python'],
    ['Gemfile', 'Ruby'],
    ['.github/workflows', 'GitHub Actions'],
  ];

  for (const [file, tech] of checks) {
    try {
      await fs.access(path.join(repoRoot, file));
      stack.push(tech);
    } catch {
      // File doesn't exist
    }
  }

  return stack;
}

/**
 * Load repository documentation for context
 */
async function loadRepoDocumentation(repoRoot: string): Promise<
  | {
      readme?: string;
      projectDescription?: string;
      techStack?: string[];
    }
  | undefined
> {
  try {
    const readmePath = path.join(repoRoot, 'README.md');
    const readme = await fs.readFile(readmePath, 'utf-8');

    // Truncate for context window
    const truncatedReadme =
      readme.length > 4000 ? readme.slice(0, 4000) + '\n...[truncated]' : readme;

    return {
      readme: truncatedReadme,
      techStack: await detectTechStack(repoRoot),
    };
  } catch {
    return undefined;
  }
}
```

### 2.9 newpr Integration

#### File: `src/cli/newpr.ts`

**Add helper function:**

```typescript
import { shouldGeneratePlan, generatePlanDocument } from '../lib/newpr/plan-generator.js';
import type { PlanGeneratorResult } from '../lib/newpr/plan-generator.js';

/**
 * Handle plan document generation
 */
async function handlePlanGeneration(
  options: Options,
  context: {
    description: string;
    branchName: string;
    baseBranch: string;
    worktreePath: string;
    repoRoot: string;
    config: WorktreeConfig;
  }
): Promise<PlanGeneratorResult | null> {
  const aiConfig = context.config.ai || {};

  // Check if we have AI service available
  const aiService = new AIGenerationService(aiConfig);
  const aiAvailable = aiService.isEnabled();

  // Determine if we should generate
  const decision = shouldGeneratePlan({
    cliFlag: options.generatePlan,
    noFlag: options.noPlan,
    configEnabled: aiConfig.planDocument,
    aiAvailable,
    nonInteractive: options.nonInteractive || false,
  });

  // Handle interactive prompt case
  if (decision.prompt && !options.json) {
    const { shouldGenerate, customPath } = await promptForPlanGeneration(aiConfig.planPathMode);

    if (!shouldGenerate) {
      return { success: true, skipped: true, skipReason: 'User declined' };
    }

    return generatePlanDocument({
      ...context,
      aiConfig,
      overridePath: customPath,
    });
  }

  // Generate if enabled
  if (decision.generate) {
    return generatePlanDocument({
      ...context,
      aiConfig,
      nonInteractive: options.nonInteractive,
    });
  }

  return null; // No generation requested
}

/**
 * Prompt user for plan generation
 */
async function promptForPlanGeneration(
  pathMode?: 'fixed' | 'ask' | 'llm'
): Promise<{ shouldGenerate: boolean; customPath?: string }> {
  const { generatePlan } = await prompts({
    type: 'confirm',
    name: 'generatePlan',
    message: 'Generate AI plan document?',
    initial: false,
  });

  if (!generatePlan) {
    return { shouldGenerate: false };
  }

  // Ask for path if mode is 'ask'
  if (pathMode === 'ask') {
    const { planPath } = await prompts({
      type: 'text',
      name: 'planPath',
      message: 'Plan document path:',
      initial: 'PLAN.md',
    });

    return { shouldGenerate: true, customPath: planPath };
  }

  return { shouldGenerate: true };
}
```

**Integration Points:**

Call `handlePlanGeneration()` in all three modes after worktree setup:

1. **modeNewFeature()**: After `setupWorktree()`, before `post-worktree` hook
2. **modeExistingPr()**: After worktree creation, before `post-worktree` hook
3. **modeExistingBranch()**: After worktree creation, before `post-worktree` hook

**Flow:**

```text
worktree created/setup → handlePlanGeneration() → post-worktree hook → summary
```

**JSON Output Enhancement:**

```typescript
interface NewprJsonOutput {
  // ... existing fields ...
  plan?: {
    generated: boolean;
    path?: string;
    error?: string;
  };
}
```

---

## 3. Execution Flow

### 3.1 Plan Generation Sequence

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    newpr Execution with Plan Generation                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Parse CLI arguments (--plan, --no-plan flags)                        │
│                          │                                               │
│                          ▼                                               │
│  2. Load config (.worktreerc)                                            │
│                          │                                               │
│                          ▼                                               │
│  3. Determine trigger (CLI flag > config > prompt)                       │
│                          │                                               │
│                          ▼                                               │
│  4. Execute mode (new feature / existing PR / existing branch)           │
│                          │                                               │
│                          ▼                                               │
│  5. Create/setup worktree                                                │
│                          │                                               │
│                          ▼                                               │
│  6. handlePlanGeneration() ◄─── NEW STEP                                 │
│     ├── Check triggers                                                   │
│     ├── Prompt if interactive                                            │
│     ├── Build context (repo structure, tech stack)                       │
│     ├── Call AI provider                                                 │
│     └── Write plan file                                                  │
│                          │                                               │
│                          ▼                                               │
│  7. Run post-worktree hooks                                              │
│                          │                                               │
│                          ▼                                               │
│  8. Display summary / JSON output                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Decision Flow

```text
shouldGeneratePlan()
        │
        ▼
┌───────────────────┐
│ --no-plan flag?   │───Yes──▶ Return: generate=false
└───────────────────┘
        │ No
        ▼
┌───────────────────┐
│ --plan flag?      │───Yes──▶ Return: generate=true
└───────────────────┘
        │ No
        ▼
┌───────────────────┐
│ Config enabled?   │───Yes──▶ Return: generate=true
└───────────────────┘
        │ No
        ▼
┌───────────────────┐
│ AI available AND  │───Yes──▶ Return: prompt=true
│ interactive mode? │
└───────────────────┘
        │ No
        ▼
Return: generate=false, prompt=false
```

---

## 4. Edge Cases & Mitigations

### 4.1 AI Provider Unavailable

**Scenario:** User has `--plan` flag but no AI provider configured/available.

**Detection:**

```typescript
if (options.generatePlan && !aiService.isEnabled()) {
  // Provider not available
}
```

**Mitigation:**

- Show clear error: "AI plan generation requested but no AI provider available"
- In interactive mode, suggest configuring AI provider
- In non-interactive mode, fail with clear exit code

**Estimated Impact:** Low - configuration issue

### 4.2 Generation Failure Mid-Process

**Scenario:** AI call succeeds but file write fails (permissions, disk full, etc.)

**Detection:**

```typescript
try {
  await fs.writeFile(absolutePath, result.content, 'utf-8');
} catch (error) {
  if (error.code === 'EACCES') {
    /* permission denied */
  }
  if (error.code === 'ENOSPC') {
    /* disk full */
  }
}
```

**Mitigation:**

- Catch specific error codes
- Offer to write to alternative location (temp file)
- Include partial success in JSON output
- Don't fail entire newpr flow - warn and continue

**Estimated Impact:** Medium - could interrupt workflow

### 4.3 Existing Plan File

**Scenario:** PLAN.md already exists in the worktree.

**Detection:**

```typescript
try {
  await fs.access(absolutePath);
  // File exists
} catch {
  // File doesn't exist
}
```

**Mitigation Options:**

1. **Overwrite** (default in non-interactive)
2. **Prompt** (in interactive mode):
   ```
   PLAN.md already exists. Overwrite?
     ▶ Overwrite
       Skip
       Write to PLAN-new.md
   ```
3. **Merge** (future enhancement) - append to existing

**Estimated Impact:** Medium - user data concern

### 4.4 Invalid Path Characters

**Scenario:** User provides path with invalid characters via `--plan-path` or wizard.

**Detection:**

```typescript
const invalidChars = /[<>:"|?*]/;
if (invalidChars.test(planPath)) {
  // Invalid on Windows
}
```

**Mitigation:**

- Validate path before using
- Reject invalid characters with clear error
- Suggest corrected path

**Estimated Impact:** Low - Windows-specific

### 4.5 Path Outside Worktree

**Scenario:** User specifies absolute path or `../` that escapes worktree.

**Detection:**

```typescript
const resolvedPath = path.resolve(worktreePath, userPath);
if (!resolvedPath.startsWith(worktreePath)) {
  // Path escapes worktree
}
```

**Mitigation:**

- Restrict paths to within worktree by default
- If path escapes, require confirmation in interactive mode
- Reject in non-interactive mode with error

**Estimated Impact:** Medium - security concern

### 4.6 LLM Suggests Invalid Path

**Scenario:** When `planPathMode: 'llm'`, the AI suggests an invalid or inappropriate path.

**Detection:**

```typescript
const suggestedPath = await aiService.suggestPlanPath(repoStructure);
if (!isValidPath(suggestedPath)) {
  // Invalid suggestion
}
```

**Mitigation:**

- Validate LLM-suggested paths
- Fall back to default `PLAN.md` if invalid
- Log warning about invalid suggestion
- Never blindly trust LLM output

**Estimated Impact:** Medium - depends on LLM reliability

### 4.7 Very Large Repository Context

**Scenario:** Repository has thousands of files, context would exceed token limits.

**Detection:**

```typescript
const contextSize = calculateContextSize(repoStructure);
if (contextSize > MAX_CONTEXT_SIZE) {
  // Too large
}
```

**Mitigation:**

- Limit repo structure to top 50 significant files
- Truncate README to 4000 characters
- Prioritize most relevant files (src/, lib/, etc.)
- Use sampling strategy for large repos

**Estimated Impact:** Low - handled by truncation

### 4.8 Concurrent Plan Generation

**Scenario:** Multiple newpr processes try to write same plan file.

**Detection:** File lock or mtime check.

**Mitigation:**

- Use atomic write pattern (write to temp, rename)
- Check if file changed since generation started
- Low risk as worktrees are typically unique

**Estimated Impact:** Very low - rare scenario

### 4.9 Non-UTF8 Repository Content

**Scenario:** README or other context files contain non-UTF8 content.

**Detection:**

```typescript
try {
  const content = await fs.readFile(readmePath, 'utf-8');
} catch (error) {
  if (error.message.includes('EILSEQ')) {
    // Encoding issue
  }
}
```

**Mitigation:**

- Catch encoding errors gracefully
- Skip problematic files from context
- Continue with reduced context

**Estimated Impact:** Low - rare but possible

### 4.10 Network Timeout During Generation

**Scenario:** AI provider times out mid-generation.

**Detection:**

```typescript
const result = await Promise.race([aiService.generatePlanDocument(context), timeout(30000)]);
```

**Mitigation:**

- Implement configurable timeout (default 30s)
- Retry once on timeout
- Clear error message about timeout
- Suggest checking network/provider status

**Estimated Impact:** Medium - depends on network reliability

---

## 5. Testing Strategy

### 5.1 Unit Tests

#### File: `src/lib/newpr/plan-generator.test.ts`

```typescript
describe('shouldGeneratePlan', () => {
  it('returns generate=true when --plan flag set', () => {
    const result = shouldGeneratePlan({
      cliFlag: true,
      configEnabled: false,
      aiAvailable: true,
      nonInteractive: false,
    });
    expect(result.generate).toBe(true);
    expect(result.prompt).toBe(false);
  });

  it('returns generate=false when --no-plan flag set', () => {
    const result = shouldGeneratePlan({
      noFlag: true,
      cliFlag: true, // Even with --plan
      configEnabled: true,
      aiAvailable: true,
      nonInteractive: false,
    });
    expect(result.generate).toBe(false);
  });

  it('returns prompt=true when AI available but not configured', () => {
    const result = shouldGeneratePlan({
      configEnabled: false,
      aiAvailable: true,
      nonInteractive: false,
    });
    expect(result.generate).toBe(false);
    expect(result.prompt).toBe(true);
  });

  it('returns prompt=false in non-interactive mode', () => {
    const result = shouldGeneratePlan({
      configEnabled: false,
      aiAvailable: true,
      nonInteractive: true,
    });
    expect(result.prompt).toBe(false);
  });
});

describe('resolvePlanPath', () => {
  it('uses override path when provided', async () => {
    const result = await resolvePlanPath({
      worktreePath: '/worktree',
      configPath: 'PLAN.md',
      overridePath: 'docs/PLAN.md',
    });
    expect(result).toBe('/worktree/docs/PLAN.md');
  });

  it('uses config path as default', async () => {
    const result = await resolvePlanPath({
      worktreePath: '/worktree',
      configPath: 'docs/PLAN.md',
    });
    expect(result).toBe('/worktree/docs/PLAN.md');
  });

  it('falls back to PLAN.md when no config', async () => {
    const result = await resolvePlanPath({
      worktreePath: '/worktree',
    });
    expect(result).toBe('/worktree/PLAN.md');
  });
});

describe('getRepoStructure', () => {
  it('excludes node_modules and hidden files', async () => {
    // Use mock filesystem
    const structure = await getRepoStructure('/mock/repo');
    expect(structure).not.toContain('node_modules/');
    expect(structure).not.toContain('.git/');
  });

  it('includes .github directory', async () => {
    const structure = await getRepoStructure('/mock/repo');
    expect(structure).toContain('.github/');
  });
});

describe('detectTechStack', () => {
  it('detects TypeScript from tsconfig.json', async () => {
    const stack = await detectTechStack('/mock/ts-repo');
    expect(stack).toContain('TypeScript');
  });

  it('returns empty array for unknown stack', async () => {
    const stack = await detectTechStack('/mock/empty-repo');
    expect(stack).toEqual([]);
  });
});

describe('generateSlug', () => {
  it('converts description to kebab-case', () => {
    expect(generateSlug('Add user authentication')).toBe('add-user-authentication');
  });

  it('limits to first 5 words', () => {
    expect(generateSlug('Add a very long feature description here')).toBe(
      'add-a-very-long-feature'
    );
  });

  it('limits total length to 30 characters', () => {
    const slug = generateSlug('Implement comprehensive data validation system');
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it('removes special characters', () => {
    expect(generateSlug("Fix bug: can't login!")).toBe('fix-bug-cant-login');
  });

  it('handles empty description', () => {
    expect(generateSlug('')).toBe('');
  });

  it('removes trailing hyphens from truncation', () => {
    // If truncation happens mid-word, ensure no trailing hyphen
    const slug = generateSlug('Add authentication for users', 15);
    expect(slug).not.toMatch(/-$/);
  });
});

describe('expandPathTemplate', () => {
  const vars: PathTemplateVars = {
    prNumber: 42,
    slug: 'add-auth',
    branch: 'feat/add-auth',
    date: '2026-01-13',
    timestamp: 1736784000,
  };

  it('expands {prNumber}', () => {
    expect(expandPathTemplate('PLAN-{prNumber}.md', vars)).toBe('PLAN-42.md');
  });

  it('expands {slug}', () => {
    expect(expandPathTemplate('PLAN-{slug}.md', vars)).toBe('PLAN-add-auth.md');
  });

  it('expands multiple variables', () => {
    expect(expandPathTemplate('PLAN-{prNumber}-{slug}.md', vars)).toBe('PLAN-42-add-auth.md');
  });

  it('sanitizes branch name (replaces /)', () => {
    expect(expandPathTemplate('{branch}.md', vars)).toBe('feat-add-auth.md');
  });

  it('expands {date}', () => {
    expect(expandPathTemplate('plans/{date}/PLAN.md', vars)).toBe('plans/2026-01-13/PLAN.md');
  });
});

describe('generateFrontmatter', () => {
  it('generates correct frontmatter structure', () => {
    const fm = generateFrontmatter({
      title: 'Add authentication',
      prNumber: 42,
      branchName: 'feat/add-auth',
      baseBranch: 'main',
    });

    expect(fm.title).toBe('Add authentication');
    expect(fm.status).toBe('draft');
    expect(fm.pr).toBe(42);
    expect(fm.branch).toBe('feat/add-auth');
    expect(fm.base).toBe('main');
    expect(fm.author).toBe('ai-generated');
    expect(fm.generator).toBe('git-worktree-tools');
    expect(fm.created).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
  });
});
```

### 5.2 Integration Tests

#### File: `src/integration/plan-generation.test.ts`

```typescript
describe('Plan Generation Integration', () => {
  let tempDir: string;
  let worktreePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-test-'));
    worktreePath = path.join(tempDir, 'worktree');
    await fs.mkdir(worktreePath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it('generates plan document with PR number and slug', async () => {
    const result = await generatePlanDocument({
      description: 'Add user authentication',
      branchName: 'feat/add-auth',
      baseBranch: 'main',
      prNumber: 42,
      worktreePath,
      repoRoot: tempDir,
      aiConfig: { provider: 'mock', planDocument: true },
      config: {},
    });

    expect(result.success).toBe(true);
    expect(result.planPath).toBe('PLAN-42-add-user-authentication.md');

    const content = await fs.readFile(
      path.join(worktreePath, 'PLAN-42-add-user-authentication.md'),
      'utf-8'
    );
    expect(content).toBeTruthy();
    expect(content).toContain('---'); // Has frontmatter
    expect(content).toContain('status: draft');
    expect(content).toContain('pr: 42');
    expect(content).toContain('title: "Add user authentication"');
  });

  it('writes to custom path with template expansion', async () => {
    const result = await generatePlanDocument({
      description: 'Fix login bug',
      branchName: 'fix/login',
      baseBranch: 'main',
      prNumber: 99,
      worktreePath,
      repoRoot: tempDir,
      aiConfig: {
        provider: 'mock',
        planDocument: true,
        planPath: 'docs/PLAN-{prNumber}-{slug}.md',
      },
      config: {},
    });

    expect(result.success).toBe(true);
    expect(result.planPath).toBe('docs/PLAN-99-fix-login-bug.md');

    const exists = await fs
      .access(path.join(worktreePath, 'docs', 'PLAN-99-fix-login-bug.md'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});
```

### 5.3 CLI Tests

#### File: `src/lib/newpr/args.test.ts`

Add tests for new flags:

```typescript
describe('--plan flag', () => {
  it('sets generatePlan to true', () => {
    const result = parseArgs(['test description', '--plan']);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.options.generatePlan).toBe(true);
    }
  });
});

describe('--no-plan flag', () => {
  it('sets noPlan to true', () => {
    const result = parseArgs(['test description', '--no-plan']);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.options.noPlan).toBe(true);
    }
  });
});
```

### 5.4 Configuration Examples

**Minimal Configuration (uses default `PLAN-{prNumber}.md`):**

```json
{
  "ai": {
    "provider": "claude",
    "planDocument": true
  }
}
```

**Full Configuration with Template:**

```json
{
  "ai": {
    "provider": "claude",
    "planDocument": true,
    "planPath": "docs/PLAN-{prNumber}.md",
    "planPathMode": "fixed",
    "planTemplate": ".github/PLAN_TEMPLATE.md"
  }
}
```

**Branch-Based Naming:**

```json
{
  "ai": {
    "provider": "claude",
    "planDocument": true,
    "planPath": "plans/{branch}.md"
  }
}
```

**LLM-Determined Path:**

```json
{
  "ai": {
    "provider": "claude",
    "planDocument": true,
    "planPathMode": "llm"
  }
}
```

### 5.5 CLI Usage Examples

**Basic Usage:**

```bash
# Generate plan with new PR
newpr "Add user authentication" --plan

# Skip plan even if configured
newpr "Quick fix" --no-plan

# Non-interactive with plan
newpr "Add feature" --plan --non-interactive --json
```

**JSON Output:**

```bash
$ newpr "Add user authentication" --plan --json
{
  "success": true,
  "mode": "new",
  "branch": "feat/add-user-auth",
  "worktree": "/path/to/repo.pr42",
  "pr": {
    "number": 42,
    "url": "https://github.com/owner/repo/pull/42"
  },
  "plan": {
    "generated": true,
    "path": "PLAN-42-add-user-authentication.md",
    "frontmatter": {
      "title": "Add user authentication",
      "status": "draft",
      "pr": 42,
      "branch": "feat/add-user-auth",
      "base": "main",
      "created": "2026-01-13T10:30:00Z"
    }
  }
}
```

---

## 6. Implementation Checklist

### 6.1 Implementation Order

| Step | Component                 | File(s)                                         | Est. Effort |
| ---- | ------------------------- | ----------------------------------------------- | ----------- |
| 1    | Type updates              | `src/lib/ai/types.ts`, `src/lib/newpr/types.ts` | 1h          |
| 2    | Argument parsing          | `src/lib/newpr/args.ts`                         | 1h          |
| 3    | Plan generator module     | `src/lib/newpr/plan-generator.ts`               | 3-4h        |
| 4    | Generation service method | `src/lib/ai/generation-service.ts`              | 0.5h        |
| 5    | newpr integration         | `src/cli/newpr.ts`                              | 2h          |
| 6    | Unit tests                | `*.test.ts`                                     | 2h          |
| 7    | Integration tests         | `src/integration/`                              | 1h          |
| 8    | Documentation             | README, help text                               | 0.5h        |

**Total Estimated: 10-12 hours**

### 6.2 Verification Checklist

- [ ] `--plan` flag generates document in new worktree
- [ ] `--no-plan` suppresses generation even with config enabled
- [ ] Config `ai.planDocument: true` enables auto-generation
- [ ] Interactive prompt appears when AI available but not configured
- [ ] Custom path via `planPath` config works
- [ ] Path mode `ask` prompts for location
- [ ] Existing file handling works (prompt/overwrite)
- [ ] JSON output includes plan information
- [ ] Error handling works for all failure modes
- [ ] Plan generation happens before post-worktree hook

### 6.3 Rollout Considerations

**Feature Flags:**

- Default `planDocument: false` for backward compatibility
- Users must opt-in via config or `--plan` flag

**Documentation:**

- Update README with plan generation section
- Add examples to help text
- Document configuration options

**Migration:**

- No migration needed - new optional feature
- Existing configs continue working unchanged

---

## 7. Open Questions

1. **Template Support:** Should we support custom Markdown templates for plan structure?
   - _Current Decision:_ Defer to future enhancement

2. **Plan Updates:** When regenerating, should we merge with existing plan or overwrite?
   - _Current Decision:_ Overwrite with confirmation prompt

3. **LLM Path Suggestions:** How reliable are LLM path suggestions? Need fallback?
   - _Current Decision:_ Always fall back to `PLAN.md` on invalid suggestion

---

## 8. References

### Internal Dependencies

- `src/lib/ai/generation-service.ts` - AI content generation
- `src/lib/ai/provider-manager.ts` - Provider availability checks
- `src/lib/config.ts` - Config loading
- `src/lib/newpr/hook-runner.ts` - Hook execution (plan must run before post-worktree)

### External Dependencies

- AI provider (Claude, Gemini, OpenAI, Ollama) for content generation
- File system access for writing plan documents

### Future Enhancements

1. **Plan Templates**: Custom Markdown templates for plan structure
2. **Plan Updates**: Update existing plan instead of overwriting
3. **Multi-file Plans**: Generate multiple planning documents
4. **Plan Validation**: Validate plan structure against schema
5. **Plan Diff**: Show changes when regenerating plan
6. **IDE Integration**: Open plan in editor after generation
