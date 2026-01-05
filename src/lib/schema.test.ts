/**
 * Tests for JSON Schema validation
 *
 * Tests that:
 * 1. The schema file is valid JSON Schema
 * 2. Config files with all defaults are valid
 * 3. Various valid and invalid configs are handled correctly
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import fs from 'fs';
import path from 'path';
import { getDefaultConfig, type WorktreeConfig } from './config.js';

// Load the schema
const schemaPath = path.resolve(__dirname, '../../schemas/worktreerc.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

describe('JSON Schema', () => {
  describe('schema file validity', () => {
    it('schema file exists', () => {
      expect(fs.existsSync(schemaPath)).toBe(true);
    });

    it('schema is valid JSON', () => {
      expect(() => JSON.parse(fs.readFileSync(schemaPath, 'utf8'))).not.toThrow();
    });

    it('schema has required properties', () => {
      expect(schema.$schema).toBeDefined();
      expect(schema.$id).toBeDefined();
      expect(schema.title).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });

    it('schema is valid JSON Schema draft-07', () => {
      const ajv = new Ajv({ allErrors: true });
      // Ajv validates the schema when you compile it
      const validate = ajv.compile(schema);
      expect(validate).toBeDefined();
      expect(typeof validate).toBe('function');
    });
  });

  describe('config with all defaults', () => {
    it('empty config is valid', () => {
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const config = {};

      const valid = validate(config);
      expect(valid).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it('config with only $schema is valid', () => {
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const config = {
        $schema:
          'https://unpkg.com/@camaradesuk/git-worktree-tools@latest/schemas/worktreerc.schema.json',
      };

      const valid = validate(config);
      expect(valid).toBe(true);
    });

    it('config with all default values explicitly stated is valid', () => {
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);

      // Config with all documented defaults from the schema
      // Using generic object type since $schema is not part of WorktreeConfig interface
      const configWithAllDefaults: WorktreeConfig & { $schema?: string } = {
        $schema:
          'https://unpkg.com/@camaradesuk/git-worktree-tools@latest/schemas/worktreerc.schema.json',
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        branchPrefix: 'feat',
        preferredEditor: 'vscode',
        sharedRepos: [],
        syncPatterns: [],
        ai: {
          provider: 'none',
          branchName: false,
          prTitle: false,
          prDescription: false,
          commitMessage: false,
          planDocument: false,
          branchStyle: 'kebab',
          commitStyle: 'conventional',
        },
        hooks: {},
        hookDefaults: {
          timeout: 30000,
          maxTimeout: 60000,
        },
        logging: {
          level: 'info',
          timestamps: true,
        },
        global: {
          warnNotGlobal: true,
        },
      };

      const valid = validate(configWithAllDefaults);
      if (!valid) {
        console.log('Validation errors:', validate.errors);
      }
      expect(valid).toBe(true);
    });

    it('getDefaultConfig() returns valid config', () => {
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const defaultConfig = getDefaultConfig();

      const valid = validate(defaultConfig);
      if (!valid) {
        console.log('Validation errors:', validate.errors);
      }
      expect(valid).toBe(true);
    });
  });

  describe('valid configs', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    it('config with baseBranch override', () => {
      const config = { baseBranch: 'develop' };
      expect(validate(config)).toBe(true);
    });

    it('config with draftPr enabled', () => {
      const config = { draftPr: true };
      expect(validate(config)).toBe(true);
    });

    it('config with sharedRepos', () => {
      const config = { sharedRepos: ['cluster-gitops', 'infrastructure'] };
      expect(validate(config)).toBe(true);
    });

    it('config with syncPatterns', () => {
      const config = { syncPatterns: ['.env.local', '.vscode/settings.json'] };
      expect(validate(config)).toBe(true);
    });

    it('config with worktree customization', () => {
      const config = {
        worktreePattern: '{repo}.{branch}',
        worktreeParent: '../worktrees',
      };
      expect(validate(config)).toBe(true);
    });

    it('config with AI settings', () => {
      const config = {
        ai: {
          provider: 'claude',
          branchName: true,
          prTitle: true,
          prDescription: true,
          branchStyle: 'conventional',
          commitStyle: 'gitmoji',
        },
      };
      expect(validate(config)).toBe(true);
    });

    it('config with hooks', () => {
      const config = {
        hooks: {
          'pre-commit': 'npm test',
          'post-pr': ['npm run lint', 'npm run build'],
          'post-worktree': {
            command: 'npm install',
            timeout: 60000,
            failOnError: false,
          },
        },
      };
      expect(validate(config)).toBe(true);
    });

    it('config with logging settings', () => {
      const config = {
        logging: {
          level: 'debug',
          logFile: '~/logs/gwt.log',
          timestamps: false,
        },
      };
      expect(validate(config)).toBe(true);
    });

    it('config with integrations', () => {
      const config = {
        integrations: {
          linear: {
            teamId: 'TEAM-123',
            apiKeyEnv: 'LINEAR_API_KEY',
          },
          jira: {
            projectKey: 'PROJ',
            baseUrl: 'https://company.atlassian.net',
          },
          slack: {
            webhookUrl: 'https://hooks.slack.com/services/xxx',
            channel: '#dev-notifications',
          },
        },
      };
      expect(validate(config)).toBe(true);
    });

    it('config with global settings', () => {
      const config = {
        global: {
          warnNotGlobal: false,
          logging: {
            level: 'warn',
          },
        },
      };
      expect(validate(config)).toBe(true);
    });

    it('config with generators', () => {
      const config = {
        generators: {
          branchName: './scripts/branch-generator.js',
          prTitle: './scripts/pr-title.sh',
        },
      };
      expect(validate(config)).toBe(true);
    });

    it('config with all preferredEditor values', () => {
      for (const editor of ['vscode', 'cursor', 'auto']) {
        const config = { preferredEditor: editor };
        expect(validate(config)).toBe(true);
      }
    });

    it('config with all AI provider values', () => {
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
        const config = { ai: { provider } };
        expect(validate(config)).toBe(true);
      }
    });

    it('config with all log level values', () => {
      const levels = ['silent', 'error', 'warn', 'info', 'debug', 'trace'];
      for (const level of levels) {
        const config = { logging: { level } };
        expect(validate(config)).toBe(true);
      }
    });
  });

  describe('invalid configs', () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    it('rejects unknown properties', () => {
      const config = { unknownProperty: 'value' };
      expect(validate(config)).toBe(false);
      expect(validate.errors).not.toBeNull();
    });

    it('rejects invalid baseBranch type', () => {
      const config = { baseBranch: 123 };
      expect(validate(config)).toBe(false);
    });

    it('rejects invalid draftPr type', () => {
      const config = { draftPr: 'yes' };
      expect(validate(config)).toBe(false);
    });

    it('rejects invalid sharedRepos type', () => {
      const config = { sharedRepos: 'not-an-array' };
      expect(validate(config)).toBe(false);
    });

    it('rejects invalid preferredEditor value', () => {
      const config = { preferredEditor: 'sublime' };
      expect(validate(config)).toBe(false);
    });

    it('rejects invalid AI provider value', () => {
      const config = { ai: { provider: 'invalid-provider' } };
      expect(validate(config)).toBe(false);
    });

    it('rejects invalid log level', () => {
      const config = { logging: { level: 'verbose' } };
      expect(validate(config)).toBe(false);
    });

    it('rejects invalid hook timeout', () => {
      const config = { hookDefaults: { timeout: -1000 } };
      expect(validate(config)).toBe(false);
    });

    it('rejects unknown AI properties', () => {
      const config = { ai: { unknownSetting: true } };
      expect(validate(config)).toBe(false);
    });

    it('rejects unknown hook names', () => {
      const config = { hooks: { 'invalid-hook-name': 'npm test' } };
      expect(validate(config)).toBe(false);
    });
  });

  describe('schema definition references', () => {
    it('has definitions for all referenced types', () => {
      expect(schema.definitions).toBeDefined();
      expect(schema.definitions.AIConfig).toBeDefined();
      expect(schema.definitions.HooksConfig).toBeDefined();
      expect(schema.definitions.HookDefinition).toBeDefined();
      expect(schema.definitions.HookDefaultsConfig).toBeDefined();
      expect(schema.definitions.GeneratorsConfig).toBeDefined();
      expect(schema.definitions.IntegrationsConfig).toBeDefined();
      expect(schema.definitions.LoggingConfig).toBeDefined();
      expect(schema.definitions.GlobalSettings).toBeDefined();
    });

    it('has definitions for integration types', () => {
      expect(schema.definitions.LinearIntegration).toBeDefined();
      expect(schema.definitions.JiraIntegration).toBeDefined();
      expect(schema.definitions.SlackIntegration).toBeDefined();
    });
  });
});
