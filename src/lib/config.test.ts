import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDefaultConfig,
  generateBranchName,
  generateWorktreePath,
  loadConfig,
  generateBranchNameAsync,
  generatePRContentAsync,
} from './config.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Helper to normalize paths for cross-platform testing
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^[A-Z]:/, '');
}

describe('config', () => {
  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const config = getDefaultConfig();

      expect(config.baseBranch).toBe('main');
      expect(config.draftPr).toBe(false);
      expect(config.worktreePattern).toBe('{repo}.pr{number}');
      expect(config.worktreeParent).toBe('..');
      expect(config.sharedRepos).toEqual([]);
      expect(config.syncPatterns).toEqual([]);
      expect(config.branchPrefix).toBe('feat');
    });

    it('should include Phase 8 default properties', () => {
      const config = getDefaultConfig();

      expect(config.plugins).toEqual([]);
      expect(config.generators).toEqual({});
      expect(config.integrations).toEqual({});
    });

    it('should include AI config defaults', () => {
      const config = getDefaultConfig();

      expect(config.ai).toBeDefined();
      expect(config.ai.provider).toBe('none');
    });

    it('should include hooks config defaults', () => {
      const config = getDefaultConfig();

      expect(config.hooks).toEqual({});
    });
  });

  describe('generateBranchName', () => {
    const config = getDefaultConfig();

    it('should generate branch name from description', () => {
      const branch = generateBranchName(config, 'Add user authentication feature');
      expect(branch).toMatch(/^feat\/add-user-authentication-feature-[a-z0-9]+$/);
    });

    it('should handle uppercase in description', () => {
      const branch = generateBranchName(config, 'Fix BUG in API');
      expect(branch).toMatch(/^feat\/fix-bug-in-api-[a-z0-9]+$/);
    });

    it('should handle special characters', () => {
      const branch = generateBranchName(config, "Add user's profile (v2)!");
      expect(branch).toMatch(/^feat\/add-user-s-profile-v2-[a-z0-9]+$/);
    });

    it('should truncate long descriptions', () => {
      const longDesc =
        'This is a very long description that should be truncated to a reasonable length for a git branch name';
      const branch = generateBranchName(config, longDesc);
      // Branch name should not exceed ~100 chars total
      expect(branch.length).toBeLessThan(100);
    });

    it('should handle empty description', () => {
      const branch = generateBranchName(config, '');
      // Empty description results in empty slug, so branch is prefix/-suffix
      expect(branch).toMatch(/^feat\/-[a-z0-9]+$/);
    });

    it('should use custom branch prefix', () => {
      const customConfig = { ...config, branchPrefix: 'feature' };
      const branch = generateBranchName(customConfig, 'new feature');
      expect(branch).toMatch(/^feature\/new-feature-[a-z0-9]+$/);
    });
  });

  describe('generateWorktreePath', () => {
    const config = getDefaultConfig();

    it('should generate worktree path with default pattern', () => {
      const result = generateWorktreePath(config, '/home/user/repos/myproject', 'myproject', 123);
      // Normalize paths for cross-platform comparison
      expect(normalizePath(result)).toBe('/home/user/repos/myproject.pr123');
    });

    it('should use custom worktree pattern', () => {
      const customConfig = {
        ...config,
        worktreePattern: '{repo}-pr-{number}',
      };
      const result = generateWorktreePath(
        customConfig,
        '/home/user/repos/myproject',
        'myproject',
        456
      );
      expect(normalizePath(result)).toBe('/home/user/repos/myproject-pr-456');
    });

    it('should use custom parent directory', () => {
      const customConfig = {
        ...config,
        worktreeParent: '/tmp/worktrees',
      };
      const result = generateWorktreePath(
        customConfig,
        '/home/user/repos/myproject',
        'myproject',
        789
      );
      expect(normalizePath(result)).toBe('/tmp/worktrees/myproject.pr789');
    });

    it('should include branch name when pattern uses it', () => {
      const customConfig = {
        ...config,
        worktreePattern: '{repo}.{branch}',
      };
      const result = generateWorktreePath(
        customConfig,
        '/home/user/repos/myproject',
        'myproject',
        123,
        'feature-x'
      );
      expect(normalizePath(result)).toBe('/home/user/repos/myproject.feature-x');
    });
  });

  describe('loadConfig', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return defaults when no config file exists', () => {
      const config = loadConfig(tempDir);
      expect(config).toEqual(getDefaultConfig());
    });

    it('should load config from .worktreerc', () => {
      const configContent = JSON.stringify({
        baseBranch: 'develop',
        draftPr: true,
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.baseBranch).toBe('develop');
      expect(config.draftPr).toBe(true);
      // Other values should be defaults
      expect(config.worktreePattern).toBe('{repo}.pr{number}');
    });

    it('should load config from .worktreerc.json', () => {
      const configContent = JSON.stringify({
        branchPrefix: 'feature',
        sharedRepos: ['other-repo'],
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc.json'), configContent);

      const config = loadConfig(tempDir);
      expect(config.branchPrefix).toBe('feature');
      expect(config.sharedRepos).toEqual(['other-repo']);
    });

    it('should prefer .worktreerc over .worktreerc.json', () => {
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc'),
        JSON.stringify({ baseBranch: 'main-from-worktreerc' })
      );
      fs.writeFileSync(
        path.join(tempDir, '.worktreerc.json'),
        JSON.stringify({ baseBranch: 'main-from-json' })
      );

      const config = loadConfig(tempDir);
      expect(config.baseBranch).toBe('main-from-worktreerc');
    });

    it('should return defaults with warning for invalid JSON', () => {
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), 'invalid json {{{');

      // Mock console.warn to capture the warning
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg: string) => warnings.push(msg);

      try {
        const config = loadConfig(tempDir);
        expect(config).toEqual(getDefaultConfig());
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]).toContain('Warning');
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should merge user config with defaults', () => {
      const configContent = JSON.stringify({
        baseBranch: 'develop',
        // Only setting one property
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      // User setting
      expect(config.baseBranch).toBe('develop');
      // All other values should be defaults
      expect(config.draftPr).toBe(false);
      expect(config.worktreePattern).toBe('{repo}.pr{number}');
      expect(config.worktreeParent).toBe('..');
      expect(config.sharedRepos).toEqual([]);
      expect(config.syncPatterns).toEqual([]);
      expect(config.branchPrefix).toBe('feat');
    });

    // Phase 8: Enhanced configuration tests

    it('should load plugins array from config', () => {
      const configContent = JSON.stringify({
        plugins: ['@worktree-tools/plugin-linear', './custom-plugin.js'],
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.plugins).toEqual(['@worktree-tools/plugin-linear', './custom-plugin.js']);
    });

    it('should use default empty plugins array when not specified', () => {
      const configContent = JSON.stringify({ baseBranch: 'main' });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.plugins).toEqual([]);
    });

    it('should load generators config', () => {
      const configContent = JSON.stringify({
        generators: {
          branchName: './scripts/gen-branch.js',
          prTitle: './scripts/gen-title.js',
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.generators).toEqual({
        branchName: './scripts/gen-branch.js',
        prTitle: './scripts/gen-title.js',
      });
    });

    it('should deep merge generators with defaults', () => {
      const configContent = JSON.stringify({
        generators: {
          branchName: './my-gen.js',
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.generators?.branchName).toBe('./my-gen.js');
      // Other generator keys should still be undefined (from default empty object)
      expect(config.generators?.prTitle).toBeUndefined();
    });

    it('should load integrations config', () => {
      const configContent = JSON.stringify({
        integrations: {
          linear: { teamId: 'ENG', apiKeyEnv: 'LINEAR_API_KEY' },
          jira: { projectKey: 'PROJ', baseUrl: 'https://jira.example.com' },
          slack: { webhookUrl: 'SLACK_WEBHOOK', channel: '#dev' },
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.integrations?.linear?.teamId).toBe('ENG');
      expect(config.integrations?.linear?.apiKeyEnv).toBe('LINEAR_API_KEY');
      expect(config.integrations?.jira?.projectKey).toBe('PROJ');
      expect(config.integrations?.jira?.baseUrl).toBe('https://jira.example.com');
      expect(config.integrations?.slack?.webhookUrl).toBe('SLACK_WEBHOOK');
      expect(config.integrations?.slack?.channel).toBe('#dev');
    });

    it('should deep merge linear integration config', () => {
      const configContent = JSON.stringify({
        integrations: {
          linear: { teamId: 'TEAM' },
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.integrations?.linear?.teamId).toBe('TEAM');
      // apiKeyEnv should be undefined (not merged from default since default is also undefined)
      expect(config.integrations?.linear?.apiKeyEnv).toBeUndefined();
    });

    it('should deep merge jira integration config', () => {
      const configContent = JSON.stringify({
        integrations: {
          jira: { projectKey: 'MYPROJ' },
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.integrations?.jira?.projectKey).toBe('MYPROJ');
      expect(config.integrations?.jira?.baseUrl).toBeUndefined();
    });

    it('should deep merge slack integration config', () => {
      const configContent = JSON.stringify({
        integrations: {
          slack: { channel: '#engineering' },
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.integrations?.slack?.channel).toBe('#engineering');
      expect(config.integrations?.slack?.webhookUrl).toBeUndefined();
    });

    it('should use default empty integrations when not specified', () => {
      const configContent = JSON.stringify({ baseBranch: 'main' });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.integrations).toEqual({});
    });

    it('should handle partial integrations config', () => {
      const configContent = JSON.stringify({
        integrations: {
          linear: { teamId: 'ENG' },
          // jira and slack not specified
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.integrations?.linear?.teamId).toBe('ENG');
      expect(config.integrations?.jira).toBeUndefined();
      expect(config.integrations?.slack).toBeUndefined();
    });

    it('should merge all Phase 8 config together', () => {
      const configContent = JSON.stringify({
        baseBranch: 'develop',
        plugins: ['my-plugin'],
        generators: { branchName: './gen.js' },
        integrations: {
          linear: { teamId: 'ENG' },
        },
      });
      fs.writeFileSync(path.join(tempDir, '.worktreerc'), configContent);

      const config = loadConfig(tempDir);
      expect(config.baseBranch).toBe('develop');
      expect(config.plugins).toEqual(['my-plugin']);
      expect(config.generators?.branchName).toBe('./gen.js');
      expect(config.integrations?.linear?.teamId).toBe('ENG');
      // Defaults should still be present
      expect(config.draftPr).toBe(false);
      expect(config.branchPrefix).toBe('feat');
    });
  });

  describe('generateBranchNameAsync', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should fall back to rule-based when AI is disabled', async () => {
      const config = getDefaultConfig();
      // Default config has ai.provider = 'none'

      const result = await generateBranchNameAsync(config, 'Add user auth');
      expect(result).toMatch(/^feat\/add-user-auth-[a-z0-9]+$/);
    });

    it('should fall back to rule-based when ai.branchName is false', async () => {
      const config = {
        ...getDefaultConfig(),
        ai: { ...getDefaultConfig().ai, provider: 'claude' as const, branchName: false },
      };

      const result = await generateBranchNameAsync(config, 'Fix bug');
      expect(result).toMatch(/^feat\/fix-bug-[a-z0-9]+$/);
    });

    it('should use AI when enabled and successful', async () => {
      const mockService = {
        generateBranchName: vi.fn().mockResolvedValue({
          success: true,
          content: 'feat/ai-generated-branch',
        }),
      };

      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => mockService,
      }));

      // Re-import to get mocked version
      const { generateBranchNameAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: { ...getDefaultConfig().ai, provider: 'claude' as const, branchName: true },
      };

      const result = await asyncFn(config, 'Test feature');
      expect(result).toBe('feat/ai-generated-branch');
    });

    it('should fall back to rule-based when AI returns failure', async () => {
      const mockService = {
        generateBranchName: vi.fn().mockResolvedValue({
          success: false,
          content: null,
          error: 'API error',
        }),
      };

      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => mockService,
      }));

      const { generateBranchNameAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: { ...getDefaultConfig().ai, provider: 'claude' as const, branchName: true },
      };

      const result = await asyncFn(config, 'Test feature');
      // Should fall back to rule-based
      expect(result).toMatch(/^feat\/test-feature-[a-z0-9]+$/);
    });

    it('should fall back to rule-based when AI throws error', async () => {
      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => {
          throw new Error('Module load error');
        },
      }));

      const { generateBranchNameAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: { ...getDefaultConfig().ai, provider: 'claude' as const, branchName: true },
      };

      const result = await asyncFn(config, 'Handle error');
      expect(result).toMatch(/^feat\/handle-error-[a-z0-9]+$/);
    });
  });

  describe('generatePRContentAsync', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return defaults when AI is disabled', async () => {
      const config = getDefaultConfig();

      const result = await generatePRContentAsync(config, {
        description: 'Add new feature',
        branchName: 'feat/add-new-feature-abc123',
      });

      expect(result.title).toBe('Add new feature');
      expect(result.description).toBe('');
      expect(result.aiGenerated).toBe(false);
    });

    it('should return defaults when AI options are disabled', async () => {
      const config = {
        ...getDefaultConfig(),
        ai: {
          ...getDefaultConfig().ai,
          provider: 'claude' as const,
          prTitle: false,
          prDescription: false,
        },
      };

      const result = await generatePRContentAsync(config, {
        description: 'Fix issue',
        branchName: 'feat/fix-issue',
      });

      expect(result.title).toBe('Fix issue');
      expect(result.description).toBe('');
      expect(result.aiGenerated).toBe(false);
    });

    it('should use AI for title when prTitle is enabled', async () => {
      const mockService = {
        generatePRTitle: vi.fn().mockResolvedValue({
          success: true,
          content: 'AI Generated Title',
        }),
        generatePRDescription: vi.fn().mockResolvedValue({
          success: false,
          content: null,
        }),
      };

      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => mockService,
      }));

      const { generatePRContentAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: {
          ...getDefaultConfig().ai,
          provider: 'claude' as const,
          prTitle: true,
          prDescription: false,
        },
      };

      const result = await asyncFn(config, {
        description: 'Original title',
        branchName: 'feat/test',
      });

      expect(result.title).toBe('AI Generated Title');
      expect(result.aiGenerated).toBe(true);
    });

    it('should use AI for description when prDescription is enabled', async () => {
      const mockService = {
        generatePRTitle: vi.fn().mockResolvedValue({
          success: false,
          content: null,
        }),
        generatePRDescription: vi.fn().mockResolvedValue({
          success: true,
          content: '## Summary\nAI generated description',
        }),
      };

      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => mockService,
      }));

      const { generatePRContentAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: {
          ...getDefaultConfig().ai,
          provider: 'claude' as const,
          prTitle: false,
          prDescription: true,
        },
      };

      const result = await asyncFn(config, {
        description: 'Original',
        branchName: 'feat/test',
      });

      expect(result.description).toBe('## Summary\nAI generated description');
      expect(result.aiGenerated).toBe(true);
    });

    it('should use AI for both title and description', async () => {
      const mockService = {
        generatePRTitle: vi.fn().mockResolvedValue({
          success: true,
          content: 'AI Title',
        }),
        generatePRDescription: vi.fn().mockResolvedValue({
          success: true,
          content: 'AI Description',
        }),
      };

      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => mockService,
      }));

      const { generatePRContentAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: {
          ...getDefaultConfig().ai,
          provider: 'claude' as const,
          prTitle: true,
          prDescription: true,
        },
      };

      const result = await asyncFn(config, {
        description: 'Original',
        branchName: 'feat/test',
        baseBranch: 'develop',
        diff: 'diff content',
        changedFiles: ['file1.ts', 'file2.ts'],
        commitMessages: ['Initial commit', 'Fix typo'],
      });

      expect(result.title).toBe('AI Title');
      expect(result.description).toBe('AI Description');
      expect(result.aiGenerated).toBe(true);
    });

    it('should return defaults when AI throws error', async () => {
      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => {
          throw new Error('AI initialization error');
        },
      }));

      const { generatePRContentAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: {
          ...getDefaultConfig().ai,
          provider: 'claude' as const,
          prTitle: true,
          prDescription: true,
        },
      };

      const result = await asyncFn(config, {
        description: 'Fallback title',
        branchName: 'feat/test',
      });

      expect(result.title).toBe('Fallback title');
      expect(result.description).toBe('');
      expect(result.aiGenerated).toBe(false);
    });

    it('should return defaults when all AI calls fail', async () => {
      const mockService = {
        generatePRTitle: vi.fn().mockResolvedValue({
          success: false,
          error: 'Title generation failed',
        }),
        generatePRDescription: vi.fn().mockResolvedValue({
          success: false,
          error: 'Description generation failed',
        }),
      };

      vi.doMock('./ai/index.js', () => ({
        createAIGenerationService: () => mockService,
      }));

      const { generatePRContentAsync: asyncFn } = await import('./config.js');

      const config = {
        ...getDefaultConfig(),
        ai: {
          ...getDefaultConfig().ai,
          provider: 'claude' as const,
          prTitle: true,
          prDescription: true,
        },
      };

      const result = await asyncFn(config, {
        description: 'Default when AI fails',
        branchName: 'feat/test',
      });

      expect(result.title).toBe('Default when AI fails');
      expect(result.description).toBe('');
      expect(result.aiGenerated).toBe(false);
    });
  });
});
