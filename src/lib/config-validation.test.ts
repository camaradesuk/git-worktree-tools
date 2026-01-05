/**
 * Tests for config validation module
 */

import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  formatValidationErrors,
  type ValidationError,
} from './config-validation.js';

describe('validateConfig', () => {
  describe('top-level properties', () => {
    it('should accept valid empty config', () => {
      const result = validateConfig({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid minimal config', () => {
      const result = validateConfig({
        baseBranch: 'main',
        draftPr: false,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-object config', () => {
      const result = validateConfig('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be an object');
    });

    it('should reject null config', () => {
      const result = validateConfig(null);
      expect(result.valid).toBe(false);
    });

    it('should warn on unknown top-level keys', () => {
      const result = validateConfig({
        baseBranch: 'main',
        unknownKey: 'value',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'unknownKey')).toBe(true);
    });

    it('should validate baseBranch type', () => {
      const result = validateConfig({ baseBranch: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'baseBranch')).toBe(true);
    });

    it('should validate draftPr type', () => {
      const result = validateConfig({ draftPr: 'yes' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'draftPr')).toBe(true);
    });

    it('should validate preferredEditor enum', () => {
      const result = validateConfig({ preferredEditor: 'vim' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'preferredEditor')).toBe(true);
    });

    it('should accept valid preferredEditor values', () => {
      expect(validateConfig({ preferredEditor: 'vscode' }).valid).toBe(true);
      expect(validateConfig({ preferredEditor: 'cursor' }).valid).toBe(true);
      expect(validateConfig({ preferredEditor: 'auto' }).valid).toBe(true);
    });
  });

  describe('array properties', () => {
    it('should accept valid sharedRepos array', () => {
      const result = validateConfig({
        sharedRepos: ['repo1', 'repo2'],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject non-array sharedRepos', () => {
      const result = validateConfig({ sharedRepos: 'repo1' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'sharedRepos')).toBe(true);
    });

    it('should reject non-string items in sharedRepos', () => {
      const result = validateConfig({ sharedRepos: ['repo1', 123] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'sharedRepos[1]')).toBe(true);
    });

    it('should accept valid syncPatterns array', () => {
      const result = validateConfig({
        syncPatterns: ['.env.local', '.vscode/settings.json'],
      });
      expect(result.valid).toBe(true);
    });

    it('should accept valid plugins array', () => {
      const result = validateConfig({
        plugins: ['@worktree-tools/plugin-linear', './plugins/custom.js'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('ai config', () => {
    it('should accept valid ai config', () => {
      const result = validateConfig({
        ai: {
          provider: 'claude',
          branchName: true,
          prTitle: true,
          prDescription: false,
          commitMessage: false,
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid ai provider', () => {
      const result = validateConfig({
        ai: { provider: 'invalid-provider' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'ai.provider')).toBe(true);
    });

    it('should accept all valid ai providers', () => {
      const providers = [
        'auto',
        'claude',
        'gemini',
        'openai',
        'ollama',
        'script',
        'fallback',
        'none',
      ];
      for (const provider of providers) {
        const result = validateConfig({ ai: { provider } });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject non-boolean ai feature flags', () => {
      const result = validateConfig({
        ai: { branchName: 'yes' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'ai.branchName')).toBe(true);
    });

    it('should validate ai branchStyle enum', () => {
      expect(validateConfig({ ai: { branchStyle: 'conventional' } }).valid).toBe(true);
      expect(validateConfig({ ai: { branchStyle: 'kebab' } }).valid).toBe(true);
      expect(validateConfig({ ai: { branchStyle: 'snake' } }).valid).toBe(true);
      expect(validateConfig({ ai: { branchStyle: 'invalid' } }).valid).toBe(false);
    });

    it('should validate ai commitStyle enum', () => {
      expect(validateConfig({ ai: { commitStyle: 'conventional' } }).valid).toBe(true);
      expect(validateConfig({ ai: { commitStyle: 'gitmoji' } }).valid).toBe(true);
      expect(validateConfig({ ai: { commitStyle: 'simple' } }).valid).toBe(true);
      expect(validateConfig({ ai: { commitStyle: 'invalid' } }).valid).toBe(false);
    });

    it('should validate ai provider-specific configs', () => {
      const result = validateConfig({
        ai: {
          claude: { model: 'claude-3-sonnet' },
          gemini: { model: 'gemini-pro' },
          ollama: { model: 'llama2', host: 'http://localhost:11434' },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should require path in script config', () => {
      const result = validateConfig({
        ai: { script: {} },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'ai.script.path')).toBe(true);
    });

    it('should warn on unknown ai keys', () => {
      const result = validateConfig({
        ai: { unknownKey: 'value' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'ai.unknownKey')).toBe(true);
    });
  });

  describe('hooks config', () => {
    it('should accept simple string hook', () => {
      const result = validateConfig({
        hooks: { 'post-worktree': 'npm install' },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept array of commands hook', () => {
      const result = validateConfig({
        hooks: { 'post-worktree': ['npm install', 'npm run build'] },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept complex hook object', () => {
      const result = validateConfig({
        hooks: {
          'post-worktree': {
            command: 'npm install',
            timeout: 60000,
            failOnError: true,
            if: 'test -f package.json',
            env: { NODE_ENV: 'development' },
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid hook name', () => {
      const result = validateConfig({
        hooks: { 'invalid-hook': 'echo test' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'hooks.invalid-hook')).toBe(true);
    });

    it('should accept all valid hook names', () => {
      const hookNames = [
        'pre-analyze',
        'post-analyze',
        'pre-branch',
        'post-branch',
        'pre-commit',
        'post-commit',
        'pre-push',
        'post-push',
        'pre-pr',
        'post-pr',
        'pre-worktree',
        'post-worktree',
        'cleanup',
      ];

      const hooks: Record<string, string> = {};
      for (const name of hookNames) {
        hooks[name] = 'echo test';
      }

      const result = validateConfig({ hooks });
      expect(result.valid).toBe(true);
    });

    it('should validate hook timeout is non-negative', () => {
      const result = validateConfig({
        hooks: { 'post-worktree': { command: 'npm install', timeout: -1 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'hooks.post-worktree.timeout')).toBe(true);
    });

    it('should validate hook env values are strings', () => {
      const result = validateConfig({
        hooks: { 'post-worktree': { command: 'npm install', env: { KEY: 123 } } },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('hookDefaults config', () => {
    it('should accept valid hookDefaults', () => {
      const result = validateConfig({
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject negative timeout', () => {
      const result = validateConfig({
        hookDefaults: { timeout: -1 },
      });
      expect(result.valid).toBe(false);
    });

    it('should warn on unknown hookDefaults keys', () => {
      const result = validateConfig({
        hookDefaults: { unknownKey: 'value' },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('generators config', () => {
    it('should accept valid generators config', () => {
      const result = validateConfig({
        generators: {
          branchName: './scripts/branch-name.js',
          prTitle: './scripts/pr-title.js',
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject non-string generator paths', () => {
      const result = validateConfig({
        generators: { branchName: 123 },
      });
      expect(result.valid).toBe(false);
    });

    it('should warn on unknown generator keys', () => {
      const result = validateConfig({
        generators: { unknownGenerator: './script.js' },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('integrations config', () => {
    it('should accept valid linear integration', () => {
      const result = validateConfig({
        integrations: {
          linear: { teamId: 'TEAM123', apiKeyEnv: 'LINEAR_API_KEY' },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept valid jira integration', () => {
      const result = validateConfig({
        integrations: {
          jira: {
            projectKey: 'PROJ',
            baseUrl: 'https://company.atlassian.net',
            apiTokenEnv: 'JIRA_TOKEN',
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept valid slack integration', () => {
      const result = validateConfig({
        integrations: {
          slack: {
            webhookUrl: 'SLACK_WEBHOOK_URL',
            channel: '#dev-notifications',
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should warn on unknown integration', () => {
      const result = validateConfig({
        integrations: { unknownService: {} },
      });
      expect(result.valid).toBe(false);
    });

    it('should reject non-string integration values', () => {
      const result = validateConfig({
        integrations: { linear: { teamId: 123 } },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('full config validation', () => {
    it('should accept comprehensive valid config', () => {
      const result = validateConfig({
        baseBranch: 'main',
        draftPr: true,
        branchPrefix: 'feat',
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        preferredEditor: 'vscode',
        sharedRepos: ['backend-api'],
        syncPatterns: ['.env.local'],
        ai: {
          provider: 'claude',
          branchName: true,
          prTitle: true,
          prDescription: true,
          commitStyle: 'conventional',
        },
        hooks: {
          'post-worktree': 'npm install',
        },
        hookDefaults: {
          timeout: 30000,
        },
        plugins: ['@worktree-tools/plugin-slack'],
        generators: {},
        integrations: {
          slack: { channel: '#dev' },
        },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors', () => {
      const result = validateConfig({
        baseBranch: 123,
        draftPr: 'yes',
        preferredEditor: 'vim',
        unknownKey: 'value',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('formatValidationErrors', () => {
  it('should return empty string for no errors', () => {
    expect(formatValidationErrors([])).toBe('');
  });

  it('should format single error', () => {
    const errors: ValidationError[] = [{ path: 'baseBranch', message: 'must be a string' }];
    const result = formatValidationErrors(errors);
    expect(result).toContain('baseBranch');
    expect(result).toContain('must be a string');
  });

  it('should format multiple errors', () => {
    const errors: ValidationError[] = [
      { path: 'baseBranch', message: 'must be a string' },
      { path: 'draftPr', message: 'must be a boolean' },
    ];
    const result = formatValidationErrors(errors);
    expect(result).toContain('baseBranch');
    expect(result).toContain('draftPr');
  });

  it('should handle empty path', () => {
    const errors: ValidationError[] = [{ path: '', message: 'Config must be an object' }];
    const result = formatValidationErrors(errors);
    expect(result).toContain('Config must be an object');
  });
});
