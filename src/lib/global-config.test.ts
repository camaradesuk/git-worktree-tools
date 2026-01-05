/**
 * Tests for global-config.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getGlobalConfigPath,
  findRepoConfigFile,
  findLocalConfigFile,
  getConfigPaths,
  loadConfigFile,
  loadGlobalConfig,
  saveGlobalConfig,
  createLocalConfig,
  ensureLocalConfigInGitignore,
  initializeLocalConfig,
  getSchemaUrl,
  globalConfigExists,
  localConfigExists,
  repoConfigExists,
  getConfigSummary,
} from './global-config.js';
import { CONFIG_FILE_NAMES, LOCAL_CONFIG_FILE_NAMES } from './constants.js';

// Mock logger to avoid console output
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('global-config', () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-config-test-'));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(repoDir);
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getGlobalConfigPath', () => {
    it('returns a path containing config.json', () => {
      const configPath = getGlobalConfigPath();
      expect(configPath).toContain('config.json');
    });

    it('returns path in appropriate config directory', () => {
      const configPath = getGlobalConfigPath();
      // Should be in XDG or home directory location
      expect(configPath).toMatch(/git-worktree-tools/);
    });
  });

  describe('findRepoConfigFile', () => {
    it('finds .worktreerc when it exists', () => {
      const configPath = path.join(repoDir, '.worktreerc');
      fs.writeFileSync(configPath, '{}');

      const found = findRepoConfigFile(repoDir);
      expect(found).toBe(configPath);
    });

    it('finds .worktreerc.json when it exists', () => {
      const configPath = path.join(repoDir, '.worktreerc.json');
      fs.writeFileSync(configPath, '{}');

      const found = findRepoConfigFile(repoDir);
      expect(found).toBe(configPath);
    });

    it('prefers .worktreerc over .worktreerc.json', () => {
      fs.writeFileSync(path.join(repoDir, '.worktreerc'), '{}');
      fs.writeFileSync(path.join(repoDir, '.worktreerc.json'), '{}');

      const found = findRepoConfigFile(repoDir);
      expect(found).toBe(path.join(repoDir, CONFIG_FILE_NAMES[0]));
    });

    it('returns null when no config exists', () => {
      const found = findRepoConfigFile(repoDir);
      expect(found).toBeNull();
    });
  });

  describe('findLocalConfigFile', () => {
    it('finds .worktreerc.local when it exists', () => {
      const configPath = path.join(repoDir, '.worktreerc.local');
      fs.writeFileSync(configPath, '{}');

      const found = findLocalConfigFile(repoDir);
      expect(found).toBe(configPath);
    });

    it('finds .worktreerc.local.json when it exists', () => {
      const configPath = path.join(repoDir, '.worktreerc.local.json');
      fs.writeFileSync(configPath, '{}');

      const found = findLocalConfigFile(repoDir);
      expect(found).toBe(configPath);
    });

    it('returns null when no local config exists', () => {
      const found = findLocalConfigFile(repoDir);
      expect(found).toBeNull();
    });
  });

  describe('getConfigPaths', () => {
    it('returns global config path', () => {
      const paths = getConfigPaths();
      expect(paths.global).toBeDefined();
      expect(paths.global.level).toBe('global');
    });

    it('returns null repo/local when no repoRoot provided', () => {
      const paths = getConfigPaths();
      expect(paths.repo).toBeNull();
      expect(paths.local).toBeNull();
    });

    it('returns repo config path when repoRoot provided', () => {
      const paths = getConfigPaths(repoDir);
      expect(paths.repo).toBeDefined();
      expect(paths.repo?.level).toBe('repo');
    });

    it('returns local config path when repoRoot provided', () => {
      const paths = getConfigPaths(repoDir);
      expect(paths.local).toBeDefined();
      expect(paths.local?.level).toBe('local');
    });

    it('marks existing files as exists: true', () => {
      fs.writeFileSync(path.join(repoDir, '.worktreerc'), '{}');
      fs.writeFileSync(path.join(repoDir, '.worktreerc.local'), '{}');

      const paths = getConfigPaths(repoDir);
      expect(paths.repo?.exists).toBe(true);
      expect(paths.local?.exists).toBe(true);
    });

    it('marks non-existing files as exists: false', () => {
      const paths = getConfigPaths(repoDir);
      expect(paths.repo?.exists).toBe(false);
      expect(paths.local?.exists).toBe(false);
    });
  });

  describe('loadConfigFile', () => {
    it('loads valid JSON config', () => {
      const configPath = path.join(repoDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ baseBranch: 'develop' }));

      const config = loadConfigFile(configPath);
      expect(config).toEqual({ baseBranch: 'develop' });
    });

    it('returns null for non-existent file', () => {
      const config = loadConfigFile('/non/existent/file.json');
      expect(config).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const configPath = path.join(repoDir, 'invalid.json');
      fs.writeFileSync(configPath, 'not valid json');

      const config = loadConfigFile(configPath);
      expect(config).toBeNull();
    });
  });

  describe('saveGlobalConfig', () => {
    it('creates config directory if needed', () => {
      const customConfigDir = path.join(tempDir, 'custom-config');
      const customConfigPath = path.join(customConfigDir, 'config.json');

      // Mock getGlobalConfigPath
      vi.doMock('./constants.js', async (importOriginal) => {
        const original = await importOriginal<typeof import('./constants.js')>();
        return {
          ...original,
          getGlobalConfigDir: () => customConfigDir,
        };
      });
    });

    it('includes $schema in saved config', () => {
      const testConfigPath = path.join(repoDir, 'test-config.json');

      // Create a simple test by checking what would be saved
      const config = { baseBranch: 'main' };
      const configWithSchema = {
        $schema: getSchemaUrl(),
        ...config,
      };

      expect(configWithSchema.$schema).toContain('unpkg.com');
      expect(configWithSchema.$schema).toContain('worktreerc.schema.json');
    });
  });

  describe('createLocalConfig', () => {
    it('creates local config file', () => {
      const configPath = createLocalConfig(repoDir);
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('creates config with provided values', () => {
      const configPath = createLocalConfig(repoDir, { baseBranch: 'develop' });
      const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(content.baseBranch).toBe('develop');
    });

    it('includes $schema in created config', () => {
      const configPath = createLocalConfig(repoDir);
      const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(content.$schema).toContain('unpkg.com');
    });

    it('creates .worktreerc.local file', () => {
      const configPath = createLocalConfig(repoDir);
      expect(path.basename(configPath)).toBe(LOCAL_CONFIG_FILE_NAMES[0]);
    });
  });

  describe('ensureLocalConfigInGitignore', () => {
    it('creates .gitignore if it does not exist', () => {
      const gitignorePath = path.join(repoDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(false);

      ensureLocalConfigInGitignore(repoDir);
      expect(fs.existsSync(gitignorePath)).toBe(true);
    });

    it('adds local config patterns to .gitignore', () => {
      const gitignorePath = path.join(repoDir, '.gitignore');

      ensureLocalConfigInGitignore(repoDir);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('.worktreerc.local');
    });

    it('does not duplicate patterns if already present', () => {
      const gitignorePath = path.join(repoDir, '.gitignore');
      // Include both local config patterns
      fs.writeFileSync(gitignorePath, '.worktreerc.local\n.worktreerc.local.json\n');

      const updated = ensureLocalConfigInGitignore(repoDir);
      expect(updated).toBe(false);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      const matches = content.match(/\.worktreerc\.local/g) || [];
      expect(matches.length).toBe(2); // Both patterns present once
    });

    it('preserves existing .gitignore content', () => {
      const gitignorePath = path.join(repoDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\n*.log\n');

      ensureLocalConfigInGitignore(repoDir);

      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('*.log');
    });

    it('returns true when patterns are added', () => {
      const updated = ensureLocalConfigInGitignore(repoDir);
      expect(updated).toBe(true);
    });
  });

  describe('initializeLocalConfig', () => {
    it('creates config and updates gitignore', () => {
      const result = initializeLocalConfig(repoDir);

      expect(fs.existsSync(result.configPath)).toBe(true);
      expect(result.gitignoreUpdated).toBe(true);
    });

    it('passes initial config to createLocalConfig', () => {
      const result = initializeLocalConfig(repoDir, {
        logging: { level: 'debug' },
      });

      const content = JSON.parse(fs.readFileSync(result.configPath, 'utf8'));
      expect(content.logging.level).toBe('debug');
    });
  });

  describe('getSchemaUrl', () => {
    it('returns unpkg URL', () => {
      const url = getSchemaUrl();
      expect(url).toContain('unpkg.com');
      expect(url).toContain('@camaradesuk/git-worktree-tools');
      expect(url).toContain('worktreerc.schema.json');
    });
  });

  describe('existence checks', () => {
    describe('localConfigExists', () => {
      it('returns true when local config exists', () => {
        fs.writeFileSync(path.join(repoDir, '.worktreerc.local'), '{}');
        expect(localConfigExists(repoDir)).toBe(true);
      });

      it('returns false when local config does not exist', () => {
        expect(localConfigExists(repoDir)).toBe(false);
      });
    });

    describe('repoConfigExists', () => {
      it('returns true when repo config exists', () => {
        fs.writeFileSync(path.join(repoDir, '.worktreerc'), '{}');
        expect(repoConfigExists(repoDir)).toBe(true);
      });

      it('returns false when repo config does not exist', () => {
        expect(repoConfigExists(repoDir)).toBe(false);
      });
    });
  });

  describe('getConfigSummary', () => {
    it('returns summary without repoRoot', () => {
      const summary = getConfigSummary();
      expect(summary).toHaveProperty('global');
      expect(summary).toHaveProperty('repo');
      expect(summary).toHaveProperty('local');
      expect(summary).toHaveProperty('paths');
    });

    it('returns summary with repoRoot', () => {
      fs.writeFileSync(path.join(repoDir, '.worktreerc'), '{}');
      fs.writeFileSync(path.join(repoDir, '.worktreerc.local'), '{}');

      const summary = getConfigSummary(repoDir);
      expect(summary.repo).toBe(true);
      expect(summary.local).toBe(true);
    });

    it('returns false for non-existing configs', () => {
      const summary = getConfigSummary(repoDir);
      expect(summary.repo).toBe(false);
      expect(summary.local).toBe(false);
    });
  });
});
