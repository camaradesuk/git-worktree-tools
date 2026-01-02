/**
 * Configuration Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getGlobalConfigPath,
  findRepoConfigPath,
  getDefaultRepoConfigPath,
  getConfigSource,
  loadConfigFromPath,
  loadGlobalConfig,
  loadRepoConfig,
  loadMergedConfig,
  saveConfig,
  saveGlobalConfig,
  saveRepoConfig,
  setConfigValue,
  getConfigValue,
  validateConfig,
  formatConfigDisplay,
} from './config-manager.js';
import type { WorktreeConfig } from '../config.js';

vi.mock('fs');
vi.mock('os');

describe('config-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getGlobalConfigPath', () => {
    it('returns path in home directory', () => {
      const result = getGlobalConfigPath();
      expect(result).toBe(path.join('/home/testuser', '.worktreerc'));
    });
  });

  describe('findRepoConfigPath', () => {
    it('returns .worktreerc if it exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/repo', '.worktreerc');
      });

      const result = findRepoConfigPath('/repo');
      expect(result).toBe(path.join('/repo', '.worktreerc'));
    });

    it('returns .worktreerc.json if .worktreerc does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/repo', '.worktreerc.json');
      });

      const result = findRepoConfigPath('/repo');
      expect(result).toBe(path.join('/repo', '.worktreerc.json'));
    });

    it('returns null if no config file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = findRepoConfigPath('/repo');
      expect(result).toBeNull();
    });
  });

  describe('getDefaultRepoConfigPath', () => {
    it('returns path to .worktreerc in repo root', () => {
      const result = getDefaultRepoConfigPath('/repo');
      expect(result).toBe(path.join('/repo', '.worktreerc'));
    });
  });

  describe('getConfigSource', () => {
    it('returns repository source when repo config exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/repo', '.worktreerc');
      });

      const result = getConfigSource('/repo');
      expect(result.type).toBe('repository');
      expect(result.path).toBe(path.join('/repo', '.worktreerc'));
    });

    it('returns global source when only global config exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/home/testuser', '.worktreerc');
      });

      const result = getConfigSource('/repo');
      expect(result.type).toBe('global');
      expect(result.path).toBe(path.join('/home/testuser', '.worktreerc'));
    });

    it('returns none when no config exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getConfigSource('/repo');
      expect(result.type).toBe('none');
      expect(result.path).toBeNull();
    });

    it('returns global source when repoRoot is not provided', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/home/testuser', '.worktreerc');
      });

      const result = getConfigSource();
      expect(result.type).toBe('global');
    });
  });

  describe('loadConfigFromPath', () => {
    it('returns parsed config when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"baseBranch": "develop"}');

      const result = loadConfigFromPath('/path/to/config');
      expect(result).toEqual({ baseBranch: 'develop' });
    });

    it('returns null when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadConfigFromPath('/path/to/config');
      expect(result).toBeNull();
    });

    it('returns null when file is invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const result = loadConfigFromPath('/path/to/config');
      expect(result).toBeNull();
    });
  });

  describe('loadGlobalConfig', () => {
    it('loads config from global path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"baseBranch": "develop"}');

      const result = loadGlobalConfig();
      expect(result).toEqual({ baseBranch: 'develop' });
    });

    it('returns null when global config does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadGlobalConfig();
      expect(result).toBeNull();
    });
  });

  describe('loadRepoConfig', () => {
    it('loads config from repo when it exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/repo', '.worktreerc');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{"draftPr": true}');

      const result = loadRepoConfig('/repo');
      expect(result).toEqual({ draftPr: true });
    });

    it('returns null when repo config does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadRepoConfig('/repo');
      expect(result).toBeNull();
    });
  });

  describe('loadMergedConfig', () => {
    it('returns empty object when no config exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadMergedConfig('/repo');
      expect(result).toEqual({});
    });

    it('returns global config when only global exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/home/testuser', '.worktreerc');
      });
      vi.mocked(fs.readFileSync).mockReturnValue('{"baseBranch": "develop"}');

      const result = loadMergedConfig();
      expect(result.baseBranch).toBe('develop');
    });

    it('repo config overrides global config', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return (
          p === path.join('/home/testuser', '.worktreerc') ||
          p === path.join('/repo', '.worktreerc')
        );
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes('/repo/')) {
          return '{"baseBranch": "main-repo"}';
        }
        return '{"baseBranch": "main-global"}';
      });

      const result = loadMergedConfig('/repo');
      expect(result.baseBranch).toBe('main-repo');
    });
  });

  describe('saveConfig', () => {
    it('writes config to file with trailing newline', () => {
      const config: WorktreeConfig = { baseBranch: 'develop' };

      saveConfig('/path/to/config', config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/config',
        JSON.stringify(config, null, 2) + '\n',
        'utf8'
      );
    });
  });

  describe('saveGlobalConfig', () => {
    it('saves config to global path', () => {
      const config: WorktreeConfig = { draftPr: true };

      saveGlobalConfig(config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/home/testuser', '.worktreerc'),
        JSON.stringify(config, null, 2) + '\n',
        'utf8'
      );
    });
  });

  describe('saveRepoConfig', () => {
    it('saves config to existing repo config file', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === path.join('/repo', '.worktreerc.json');
      });
      const config: WorktreeConfig = { branchPrefix: 'fix' };

      saveRepoConfig('/repo', config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/repo', '.worktreerc.json'),
        JSON.stringify(config, null, 2) + '\n',
        'utf8'
      );
    });

    it('saves to default path when no repo config exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const config: WorktreeConfig = { branchPrefix: 'chore' };

      saveRepoConfig('/repo', config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/repo', '.worktreerc'),
        JSON.stringify(config, null, 2) + '\n',
        'utf8'
      );
    });
  });

  describe('setConfigValue', () => {
    it('sets a top-level value', () => {
      const config: WorktreeConfig = {};
      const result = setConfigValue(config, 'baseBranch', 'develop');
      expect(result.baseBranch).toBe('develop');
    });

    it('sets a nested value', () => {
      const config: WorktreeConfig = {};
      const result = setConfigValue(config, 'ai.provider', 'claude');
      expect(result.ai?.provider).toBe('claude');
    });

    it('sets a deeply nested value', () => {
      const config: WorktreeConfig = { ai: { provider: 'auto' } };
      const result = setConfigValue(config, 'ai.branchName', 'true');
      expect(result.ai?.branchName).toBe(true);
    });

    it('parses boolean true', () => {
      const config: WorktreeConfig = {};
      const result = setConfigValue(config, 'draftPr', 'true');
      expect(result.draftPr).toBe(true);
    });

    it('parses boolean false', () => {
      const config: WorktreeConfig = {};
      const result = setConfigValue(config, 'draftPr', 'false');
      expect(result.draftPr).toBe(false);
    });

    it('parses numbers', () => {
      const config: WorktreeConfig = {};
      const result = setConfigValue(config, 'someNumber', '42');
      expect((result as Record<string, unknown>).someNumber).toBe(42);
    });

    it('parses JSON arrays', () => {
      const config: WorktreeConfig = {};
      const result = setConfigValue(config, 'sharedRepos', '["repo1", "repo2"]');
      expect(result.sharedRepos).toEqual(['repo1', 'repo2']);
    });

    it('keeps strings as strings', () => {
      const config: WorktreeConfig = {};
      const result = setConfigValue(config, 'baseBranch', 'main');
      expect(result.baseBranch).toBe('main');
    });

    it('throws when trying to set nested value on non-object', () => {
      const config: WorktreeConfig = { baseBranch: 'main' };
      expect(() => setConfigValue(config, 'baseBranch.nested', 'value')).toThrow();
    });
  });

  describe('getConfigValue', () => {
    it('gets a top-level value', () => {
      const config: WorktreeConfig = { baseBranch: 'develop' };
      const result = getConfigValue(config, 'baseBranch');
      expect(result).toBe('develop');
    });

    it('gets a nested value', () => {
      const config: WorktreeConfig = { ai: { provider: 'claude' } };
      const result = getConfigValue(config, 'ai.provider');
      expect(result).toBe('claude');
    });

    it('returns undefined for non-existent key', () => {
      const config: WorktreeConfig = {};
      const result = getConfigValue(config, 'nonExistent');
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-existent nested key', () => {
      const config: WorktreeConfig = { ai: {} };
      const result = getConfigValue(config, 'ai.nonExistent');
      expect(result).toBeUndefined();
    });
  });

  describe('validateConfig', () => {
    it('returns valid for empty config', () => {
      const result = validateConfig({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for correct config', () => {
      const config: WorktreeConfig = {
        baseBranch: 'main',
        draftPr: true,
        branchPrefix: 'feat',
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('returns error for invalid baseBranch type', () => {
      const config = { baseBranch: 123 as unknown as string };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'baseBranch',
        message: 'Must be a string',
      });
    });

    it('returns error for invalid draftPr type', () => {
      const config = { draftPr: 'yes' as unknown as boolean };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'draftPr',
        message: 'Must be a boolean',
      });
    });

    it('returns error for invalid preferredEditor value', () => {
      const config = { preferredEditor: 'emacs' as WorktreeConfig['preferredEditor'] };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'preferredEditor',
        message: 'Must be "vscode", "cursor", or "auto"',
      });
    });

    it('returns error for invalid sharedRepos type', () => {
      const config = { sharedRepos: 'not-an-array' as unknown as string[] };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'sharedRepos',
        message: 'Must be an array',
      });
    });

    it('returns warning for worktreePattern without placeholders', () => {
      const config: WorktreeConfig = { worktreePattern: 'static-name' };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        path: 'worktreePattern',
        message: expect.stringContaining('placeholder'),
      });
    });

    it('returns warning for non-conventional branchPrefix', () => {
      const config: WorktreeConfig = { branchPrefix: 'FEATURE' };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        path: 'branchPrefix',
        message: expect.stringContaining('lowercase'),
      });
    });

    // Phase 8: Enhanced configuration validation tests

    it('returns error for invalid plugins type', () => {
      const config = { plugins: 'not-an-array' as unknown as string[] };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'plugins',
        message: 'Must be an array',
      });
    });

    it('returns error for non-string plugin items', () => {
      const config = { plugins: ['valid', 123 as unknown as string] };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'plugins',
        message: 'All items must be strings (npm package names or paths)',
      });
    });

    it('returns valid for correct plugins array', () => {
      const config = { plugins: ['@worktree-tools/plugin-linear', './custom-plugin.js'] };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('returns error for invalid generators type', () => {
      const config = { generators: 'not-an-object' as unknown as Record<string, string> };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'generators',
        message: 'Must be an object',
      });
    });

    it('returns error for non-string generator path', () => {
      const config = { generators: { branchName: 123 as unknown as string } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'generators.branchName',
        message: 'Must be a string (path to generator script)',
      });
    });

    it('returns warning for unknown generator key', () => {
      const config = { generators: { unknownKey: './script.js' } as unknown as { branchName?: string } };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        path: 'generators.unknownKey',
        message: expect.stringContaining('Unknown generator key'),
      });
    });

    it('returns valid for correct generators config', () => {
      const config = { generators: { branchName: './gen-branch.js', prTitle: './gen-title.js' } };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('returns error for invalid integrations type', () => {
      const config = { integrations: 'not-an-object' as unknown as Record<string, unknown> };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations',
        message: 'Must be an object',
      });
    });

    it('returns error for invalid linear integration type', () => {
      const config = { integrations: { linear: 'not-an-object' as unknown as { teamId?: string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.linear',
        message: 'Must be an object',
      });
    });

    it('returns error for non-string linear teamId', () => {
      const config = { integrations: { linear: { teamId: 123 as unknown as string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.linear.teamId',
        message: 'Must be a string',
      });
    });

    it('returns error for invalid jira integration properties', () => {
      const config = { integrations: { jira: { projectKey: 123 as unknown as string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.jira.projectKey',
        message: 'Must be a string',
      });
    });

    it('returns error for invalid slack integration properties', () => {
      const config = { integrations: { slack: { webhookUrl: 123 as unknown as string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.slack.webhookUrl',
        message: 'Must be a string',
      });
    });

    it('returns error for non-string jira baseUrl', () => {
      const config = { integrations: { jira: { baseUrl: 123 as unknown as string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.jira.baseUrl',
        message: 'Must be a string',
      });
    });

    it('returns error for non-string jira apiTokenEnv', () => {
      const config = { integrations: { jira: { apiTokenEnv: 123 as unknown as string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.jira.apiTokenEnv',
        message: 'Must be a string',
      });
    });

    it('returns error for invalid slack integration type', () => {
      const config = { integrations: { slack: 'not-an-object' as unknown as { webhookUrl?: string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.slack',
        message: 'Must be an object',
      });
    });

    it('returns error for non-string slack channel', () => {
      const config = { integrations: { slack: { channel: 123 as unknown as string } } };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: 'integrations.slack.channel',
        message: 'Must be a string',
      });
    });

    it('returns valid for correct integrations config', () => {
      const config = {
        integrations: {
          linear: { teamId: 'ENG', apiKeyEnv: 'LINEAR_API_KEY' },
          jira: { projectKey: 'PROJ', baseUrl: 'https://jira.example.com' },
          slack: { webhookUrl: 'SLACK_WEBHOOK_URL', channel: '#engineering' },
        },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('formatConfigDisplay', () => {
    it('returns valid JSON for empty config', () => {
      const result = formatConfigDisplay({});
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('returns valid JSON for complex config', () => {
      const config: WorktreeConfig = {
        baseBranch: 'main',
        ai: { provider: 'claude' },
        hooks: { 'post-worktree': 'npm install' },
      };
      const result = formatConfigDisplay(config);
      const parsed = JSON.parse(result);
      expect(parsed.baseBranch).toBe('main');
      expect(parsed.ai.provider).toBe('claude');
    });
  });
});
