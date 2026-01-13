/**
 * Plan Generator Module Tests
 *
 * Tests for AI plan document generation during PR creation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  shouldGeneratePlan,
  generateSlug,
  expandPathTemplate,
  generateFrontmatter,
  frontmatterToYaml,
  resolvePlanPath,
  buildPathTemplateVars,
  generatePlanDocument,
  type PathTemplateVars,
  type PlanFrontmatter,
} from './plan-generator.js';

// Mock the AI provider manager
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockGeneratePlanDocument = vi.fn();

vi.mock('../ai/provider-manager.js', () => ({
  getDefaultAIProviderManager: vi.fn(() => ({
    initialize: mockInitialize,
    generatePlanDocument: mockGeneratePlanDocument,
  })),
}));

describe('shouldGeneratePlan', () => {
  it('returns generate=false when --no-plan flag is set', () => {
    const result = shouldGeneratePlan({
      noFlag: true,
      cliFlag: true, // Even with --plan, --no-plan takes priority
      configEnabled: true,
      aiAvailable: true,
      nonInteractive: false,
    });

    expect(result.generate).toBe(false);
    expect(result.prompt).toBe(false);
    expect(result.reason).toBe('Disabled by --no-plan');
  });

  it('returns generate=true when --plan flag is set', () => {
    const result = shouldGeneratePlan({
      cliFlag: true,
      aiAvailable: true,
      nonInteractive: false,
    });

    expect(result.generate).toBe(true);
    expect(result.prompt).toBe(false);
    expect(result.reason).toBe('Enabled by --plan');
  });

  it('returns generate=true when config enables plan', () => {
    const result = shouldGeneratePlan({
      configEnabled: true,
      aiAvailable: true,
      nonInteractive: false,
    });

    expect(result.generate).toBe(true);
    expect(result.prompt).toBe(false);
    expect(result.reason).toBe('Enabled by config');
  });

  it('returns prompt=true when AI available in interactive mode', () => {
    const result = shouldGeneratePlan({
      aiAvailable: true,
      nonInteractive: false,
    });

    expect(result.generate).toBe(false);
    expect(result.prompt).toBe(true);
    expect(result.reason).toBe('AI available, prompting user');
  });

  it('returns generate=false when not configured', () => {
    const result = shouldGeneratePlan({
      aiAvailable: false,
      nonInteractive: false,
    });

    expect(result.generate).toBe(false);
    expect(result.prompt).toBe(false);
    expect(result.reason).toBe('Not configured');
  });

  it('returns generate=false without prompting in non-interactive mode', () => {
    const result = shouldGeneratePlan({
      aiAvailable: true,
      nonInteractive: true,
    });

    expect(result.generate).toBe(false);
    expect(result.prompt).toBe(false);
    expect(result.reason).toBe('Not configured');
  });
});

describe('generateSlug', () => {
  it('converts description to lowercase', () => {
    const slug = generateSlug('Add User Authentication');

    expect(slug).toBe('add-user-authentication');
  });

  it('replaces special characters with dashes', () => {
    const slug = generateSlug("Fix: user's login bug!");

    expect(slug).toBe('fix-users-login-bug');
  });

  it('limits to first 5 words', () => {
    const slug = generateSlug('This is a very long description with many words');

    expect(slug).toBe('this-is-a-very-long');
  });

  it('limits total length to 30 characters by default', () => {
    const slug = generateSlug('Implement a comprehensive authentication system');

    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it('respects custom maxLength parameter', () => {
    const slug = generateSlug('Add user authentication', 15);

    expect(slug.length).toBeLessThanOrEqual(15);
  });

  it('removes trailing dashes', () => {
    const slug = generateSlug('Test---', 10);

    expect(slug).not.toMatch(/-$/);
  });

  it('handles empty description', () => {
    const slug = generateSlug('');

    expect(slug).toBe('');
  });

  it('handles description with only special characters', () => {
    const slug = generateSlug('!@#$%^&*()');

    expect(slug).toBe('');
  });

  it('trims whitespace', () => {
    const slug = generateSlug('  Add feature  ');

    expect(slug).toBe('add-feature');
  });
});

describe('expandPathTemplate', () => {
  const vars: PathTemplateVars = {
    prNumber: 42,
    slug: 'add-feature',
    branch: 'feat/add-feature',
    date: '2024-01-15',
    timestamp: 1705312800000,
  };

  it('expands {prNumber} variable', () => {
    const result = expandPathTemplate('PLAN-{prNumber}.md', vars);

    expect(result).toBe('PLAN-42.md');
  });

  it('expands {slug} variable', () => {
    const result = expandPathTemplate('docs/{slug}.md', vars);

    expect(result).toBe('docs/add-feature.md');
  });

  it('expands {branch} variable and replaces slashes', () => {
    const result = expandPathTemplate('plans/{branch}.md', vars);

    expect(result).toBe('plans/feat-add-feature.md');
  });

  it('expands {date} variable', () => {
    const result = expandPathTemplate('plans/{date}-plan.md', vars);

    expect(result).toBe('plans/2024-01-15-plan.md');
  });

  it('expands {timestamp} variable', () => {
    const result = expandPathTemplate('plans/{timestamp}.md', vars);

    expect(result).toBe('plans/1705312800000.md');
  });

  it('expands multiple variables', () => {
    const result = expandPathTemplate('PLAN-{prNumber}-{slug}.md', vars);

    expect(result).toBe('PLAN-42-add-feature.md');
  });

  it('expands all variables in complex template', () => {
    const result = expandPathTemplate('docs/plans/{date}/PR-{prNumber}-{slug}.md', vars);

    expect(result).toBe('docs/plans/2024-01-15/PR-42-add-feature.md');
  });

  it('handles template with no variables', () => {
    const result = expandPathTemplate('PLAN.md', vars);

    expect(result).toBe('PLAN.md');
  });

  it('handles repeated variables', () => {
    const result = expandPathTemplate('{prNumber}-{prNumber}.md', vars);

    expect(result).toBe('42-42.md');
  });
});

describe('generateFrontmatter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates frontmatter with correct fields', () => {
    const fm = generateFrontmatter({
      title: 'Add User Authentication',
      prNumber: 42,
      branchName: 'feat/add-auth',
      baseBranch: 'main',
    });

    expect(fm.title).toBe('Add User Authentication');
    expect(fm.status).toBe('draft');
    expect(fm.pr).toBe(42);
    expect(fm.branch).toBe('feat/add-auth');
    expect(fm.base).toBe('main');
    expect(fm.created).toBe('2024-01-15T10:30:00.000Z');
    expect(fm.updated).toBe('2024-01-15T10:30:00.000Z');
    expect(fm.author).toBe('ai-generated');
    expect(fm.generator).toBe('git-worktree-tools');
  });

  it('sets created and updated to same timestamp', () => {
    const fm = generateFrontmatter({
      title: 'Test',
      prNumber: 1,
      branchName: 'test',
      baseBranch: 'main',
    });

    expect(fm.created).toBe(fm.updated);
  });
});

describe('frontmatterToYaml', () => {
  it('converts frontmatter to valid YAML format', () => {
    const fm: PlanFrontmatter = {
      title: 'Add Feature',
      status: 'draft',
      pr: 42,
      branch: 'feat/add-feature',
      base: 'main',
      created: '2024-01-15T10:30:00.000Z',
      updated: '2024-01-15T10:30:00.000Z',
      author: 'ai-generated',
      generator: 'git-worktree-tools',
      generator_version: '1.0.0',
    };

    const yaml = frontmatterToYaml(fm);

    expect(yaml).toContain('---');
    expect(yaml.split('---').length).toBe(3); // Start ---, content, end ---
    expect(yaml).toContain('title: "Add Feature"');
    expect(yaml).toContain('status: draft');
    expect(yaml).toContain('pr: 42');
    expect(yaml).toContain('branch: feat/add-feature');
    expect(yaml).toContain('base: main');
  });

  it('escapes quotes in title', () => {
    const fm: PlanFrontmatter = {
      title: 'Fix "login" bug',
      status: 'draft',
      pr: 42,
      branch: 'fix/login',
      base: 'main',
      created: '2024-01-15T10:30:00.000Z',
      updated: '2024-01-15T10:30:00.000Z',
      author: 'ai-generated',
      generator: 'git-worktree-tools',
      generator_version: '1.0.0',
    };

    const yaml = frontmatterToYaml(fm);

    expect(yaml).toContain('title: "Fix \\"login\\" bug"');
  });

  it('wraps generator_version in quotes', () => {
    const fm: PlanFrontmatter = {
      title: 'Test',
      status: 'draft',
      pr: 1,
      branch: 'test',
      base: 'main',
      created: '2024-01-15T10:30:00.000Z',
      updated: '2024-01-15T10:30:00.000Z',
      author: 'ai-generated',
      generator: 'git-worktree-tools',
      generator_version: '1.2.3',
    };

    const yaml = frontmatterToYaml(fm);

    expect(yaml).toContain('generator_version: "1.2.3"');
  });
});

describe('resolvePlanPath', () => {
  const vars: PathTemplateVars = {
    prNumber: 42,
    slug: 'add-feature',
    branch: 'feat/add-feature',
    date: '2024-01-15',
    timestamp: 1705312800000,
  };

  it('uses default template when planPath not configured', () => {
    const result = resolvePlanPath('/worktree', {}, vars);

    expect(result).toBe(path.resolve('/worktree', 'PLAN-42-add-feature.md'));
  });

  it('uses configured planPath template', () => {
    const result = resolvePlanPath('/worktree', { planPath: 'docs/PLAN-{prNumber}.md' }, vars);

    expect(result).toBe(path.resolve('/worktree', 'docs/PLAN-42.md'));
  });

  it('prevents path traversal attacks', () => {
    const result = resolvePlanPath('/worktree', { planPath: '../../../etc/passwd' }, vars);

    // Should fall back to safe default when path escapes worktree
    expect(result).toBe(path.join('/worktree', 'PLAN-42-add-feature.md'));
  });

  it('allows subdirectories within worktree', () => {
    const result = resolvePlanPath('/worktree', { planPath: 'docs/plans/{slug}.md' }, vars);

    expect(result).toBe(path.resolve('/worktree', 'docs/plans/add-feature.md'));
  });
});

describe('buildPathTemplateVars', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds variables from options', () => {
    const vars = buildPathTemplateVars({
      prNumber: 42,
      description: 'Add User Authentication',
      branchName: 'feat/add-auth',
    });

    expect(vars.prNumber).toBe(42);
    expect(vars.slug).toBe('add-user-authentication');
    expect(vars.branch).toBe('feat/add-auth');
    expect(vars.date).toBe('2024-01-15');
    expect(typeof vars.timestamp).toBe('number');
  });

  it('generates slug from description', () => {
    const vars = buildPathTemplateVars({
      prNumber: 1,
      description: "Fix: user's login bug!",
      branchName: 'fix/login',
    });

    expect(vars.slug).toBe('fix-users-login-bug');
  });
});

describe('generatePlanDocument', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates and writes plan document on success', async () => {
    mockGeneratePlanDocument.mockResolvedValue({
      success: true,
      content: '# Implementation Plan\n\nThis is the plan content.',
    });

    const planPath = path.join(tempDir, 'PLAN.md');
    const result = await generatePlanDocument(
      { description: 'Add feature', branchName: 'feat/add-feature' },
      planPath,
      { provider: 'none' },
      { prNumber: 42, baseBranch: 'main' }
    );

    expect(result.generated).toBe(true);
    expect(result.path).toBe(planPath);
    expect(result.error).toBeUndefined();

    // Verify file was written
    const content = fs.readFileSync(planPath, 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('title: "Add feature"');
    expect(content).toContain('# Implementation Plan');
  });

  it('returns error when AI generation fails', async () => {
    mockGeneratePlanDocument.mockResolvedValue({
      success: false,
      error: 'API rate limit exceeded',
    });

    const planPath = path.join(tempDir, 'PLAN.md');
    const result = await generatePlanDocument(
      { description: 'Add feature', branchName: 'feat/add-feature' },
      planPath,
      { provider: 'none' },
      { prNumber: 42, baseBranch: 'main' }
    );

    expect(result.generated).toBe(false);
    expect(result.error).toBe('API rate limit exceeded');
    expect(result.path).toBeUndefined();
  });

  it('returns error when AI returns no content', async () => {
    mockGeneratePlanDocument.mockResolvedValue({
      success: true,
      content: null,
    });

    const planPath = path.join(tempDir, 'PLAN.md');
    const result = await generatePlanDocument(
      { description: 'Add feature', branchName: 'feat/add-feature' },
      planPath,
      { provider: 'none' },
      { prNumber: 42, baseBranch: 'main' }
    );

    expect(result.generated).toBe(false);
    expect(result.error).toBe('AI generation returned no content');
  });

  it('creates parent directories if needed', async () => {
    mockGeneratePlanDocument.mockResolvedValue({
      success: true,
      content: '# Plan',
    });

    const planPath = path.join(tempDir, 'docs', 'plans', 'PLAN.md');
    const result = await generatePlanDocument(
      { description: 'Add feature', branchName: 'feat/add-feature' },
      planPath,
      { provider: 'none' },
      { prNumber: 42, baseBranch: 'main' }
    );

    expect(result.generated).toBe(true);
    expect(fs.existsSync(planPath)).toBe(true);
  });

  it('returns frontmatter in result on success', async () => {
    mockGeneratePlanDocument.mockResolvedValue({
      success: true,
      content: '# Plan',
    });

    const planPath = path.join(tempDir, 'PLAN.md');
    const result = await generatePlanDocument(
      { description: 'Add feature', branchName: 'feat/add-feature' },
      planPath,
      { provider: 'none' },
      { prNumber: 42, baseBranch: 'main' }
    );

    expect(result.frontmatter).toBeDefined();
    expect(result.frontmatter?.title).toBe('Add feature');
    expect(result.frontmatter?.pr).toBe(42);
    expect(result.frontmatter?.branch).toBe('feat/add-feature');
    expect(result.frontmatter?.base).toBe('main');
  });

  it('handles exceptions gracefully', async () => {
    mockInitialize.mockRejectedValue(new Error('Connection failed'));

    const planPath = path.join(tempDir, 'PLAN.md');
    const result = await generatePlanDocument(
      { description: 'Add feature', branchName: 'feat/add-feature' },
      planPath,
      { provider: 'none' },
      { prNumber: 42, baseBranch: 'main' }
    );

    expect(result.generated).toBe(false);
    expect(result.error).toBe('Connection failed');
  });
});
