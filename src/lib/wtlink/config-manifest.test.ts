import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  loadManifestData,
  saveManifestData,
  hasLegacyManifest,
  getLegacyManifestPath,
  hasConfigManifest,
  migrateLegacyManifest,
  getEnabledFiles,
  isManifestEmpty,
  type ManifestData,
} from './config-manifest.js';

// Mock dependencies
vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { loadConfig, saveConfig } from '../config.js';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedSaveConfig = vi.mocked(saveConfig);

describe('config-manifest', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-manifest-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadManifestData', () => {
    it('should load from .worktreerc config when wtlink section has entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: {
          enabled: ['.env.local', '.vscode/settings.json'],
          disabled: ['.env.production'],
        },
        // Other required fields from Required<WorktreeConfig>
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      const result = loadManifestData(tempDir);

      expect(result).toEqual({
        enabled: ['.env.local', '.vscode/settings.json'],
        disabled: ['.env.production'],
        source: 'config',
      });
    });

    it('should fall back to legacy .wtlinkrc file when config has no wtlink entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: [], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      // Create legacy manifest file
      const legacyPath = path.join(tempDir, DEFAULT_MANIFEST_FILE);
      fs.writeFileSync(
        legacyPath,
        `.env.local
.vscode/settings.json
# .env.production
`
      );

      const result = loadManifestData(tempDir);

      expect(result).toEqual({
        enabled: ['.env.local', '.vscode/settings.json'],
        disabled: ['.env.production'],
        source: 'legacy-file',
      });
    });

    it('should return empty manifest when neither config nor legacy file exists', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: [], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      const result = loadManifestData(tempDir);

      expect(result).toEqual({
        enabled: [],
        disabled: [],
        source: 'empty',
      });
    });

    it('should prefer config over legacy file when both exist', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: {
          enabled: ['from-config.json'],
          disabled: [],
        },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      // Create legacy manifest file (should be ignored)
      const legacyPath = path.join(tempDir, DEFAULT_MANIFEST_FILE);
      fs.writeFileSync(legacyPath, 'from-legacy.json\n');

      const result = loadManifestData(tempDir);

      expect(result.source).toBe('config');
      expect(result.enabled).toEqual(['from-config.json']);
    });
  });

  describe('saveManifestData', () => {
    it('should save manifest data to config via saveConfig', () => {
      saveManifestData(tempDir, ['.env.local'], ['.env.production']);

      expect(mockedSaveConfig).toHaveBeenCalledWith(
        tempDir,
        {
          wtlink: {
            enabled: ['.env.local'],
            disabled: ['.env.production'],
          },
        },
        { validate: false }
      );
    });

    it('should save empty arrays when no files provided', () => {
      saveManifestData(tempDir, [], []);

      expect(mockedSaveConfig).toHaveBeenCalledWith(
        tempDir,
        {
          wtlink: {
            enabled: [],
            disabled: [],
          },
        },
        { validate: false }
      );
    });
  });

  describe('hasLegacyManifest', () => {
    it('should return true when legacy file exists', () => {
      const legacyPath = path.join(tempDir, DEFAULT_MANIFEST_FILE);
      fs.writeFileSync(legacyPath, '.env.local\n');

      expect(hasLegacyManifest(tempDir)).toBe(true);
    });

    it('should return false when legacy file does not exist', () => {
      expect(hasLegacyManifest(tempDir)).toBe(false);
    });
  });

  describe('getLegacyManifestPath', () => {
    it('should return correct path to legacy manifest', () => {
      const result = getLegacyManifestPath(tempDir);
      expect(result).toBe(path.join(tempDir, DEFAULT_MANIFEST_FILE));
    });
  });

  describe('hasConfigManifest', () => {
    it('should return true when config has enabled entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: ['.env'], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      expect(hasConfigManifest(tempDir)).toBe(true);
    });

    it('should return true when config has disabled entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: [], disabled: ['.env'] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      expect(hasConfigManifest(tempDir)).toBe(true);
    });

    it('should return false when config has no entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: [], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      expect(hasConfigManifest(tempDir)).toBe(false);
    });
  });

  describe('migrateLegacyManifest', () => {
    beforeEach(() => {
      // Reset hasConfigManifest check
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: [], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);
    });

    it('should return not migrated when no legacy file exists', () => {
      const result = migrateLegacyManifest(tempDir);

      expect(result.migrated).toBe(false);
      expect(result.message).toContain('No legacy');
    });

    it('should return not migrated when config already has manifest data', () => {
      // Create legacy file
      const legacyPath = path.join(tempDir, DEFAULT_MANIFEST_FILE);
      fs.writeFileSync(legacyPath, '.env.local\n');

      // Mock that config already has entries
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: ['existing.json'], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      const result = migrateLegacyManifest(tempDir);

      expect(result.migrated).toBe(false);
      expect(result.message).toContain('already has wtlink section');
    });

    it('should perform dry run without making changes', () => {
      const legacyPath = path.join(tempDir, DEFAULT_MANIFEST_FILE);
      fs.writeFileSync(
        legacyPath,
        `.env.local
# .env.disabled
`
      );

      const result = migrateLegacyManifest(tempDir, { dryRun: true });

      expect(result.migrated).toBe(false);
      expect(result.message).toContain('[DRY RUN]');
      expect(result.enabledCount).toBe(1);
      expect(result.disabledCount).toBe(1);
      expect(mockedSaveConfig).not.toHaveBeenCalled();
    });

    it('should migrate legacy file and preserve it by default', () => {
      const legacyPath = path.join(tempDir, DEFAULT_MANIFEST_FILE);
      fs.writeFileSync(
        legacyPath,
        `.env.local
.vscode/settings.json
# .env.disabled
`
      );

      const result = migrateLegacyManifest(tempDir);

      expect(result.migrated).toBe(true);
      expect(result.enabledCount).toBe(2);
      expect(result.disabledCount).toBe(1);
      expect(result.message).toContain('preserved');
      expect(mockedSaveConfig).toHaveBeenCalled();
      expect(fs.existsSync(legacyPath)).toBe(true); // Legacy file preserved
    });

    it('should migrate and delete legacy file when deleteLegacy is true', () => {
      const legacyPath = path.join(tempDir, DEFAULT_MANIFEST_FILE);
      fs.writeFileSync(legacyPath, '.env.local\n');

      const result = migrateLegacyManifest(tempDir, { deleteLegacy: true });

      expect(result.migrated).toBe(true);
      expect(result.message).toContain('deleted');
      expect(fs.existsSync(legacyPath)).toBe(false);
    });
  });

  describe('getEnabledFiles', () => {
    it('should return only enabled files from manifest', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: {
          enabled: ['file1.json', 'file2.json'],
          disabled: ['disabled.json'],
        },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      const result = getEnabledFiles(tempDir);

      expect(result).toEqual(['file1.json', 'file2.json']);
    });
  });

  describe('isManifestEmpty', () => {
    it('should return true when manifest has no entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: [], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      expect(isManifestEmpty(tempDir)).toBe(true);
    });

    it('should return false when manifest has enabled entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: ['.env'], disabled: [] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      expect(isManifestEmpty(tempDir)).toBe(false);
    });

    it('should return false when manifest has disabled entries', () => {
      mockedLoadConfig.mockReturnValue({
        configVersion: 1,
        wtlink: { enabled: [], disabled: ['.env'] },
        sharedRepos: [],
        baseBranch: 'main',
        draftPr: false,
        worktreePattern: '{repo}.pr{number}',
        worktreeParent: '..',
        syncPatterns: [],
        branchPrefix: 'feat',
        previewLabel: 'preview',
        preferredEditor: 'vscode',
        ai: { provider: 'none' },
        hooks: {},
        hookDefaults: { timeout: 30000, maxTimeout: 60000 },
        plugins: [],
        generators: {},
        integrations: {},
        logging: { level: 'info', timestamps: true },
        global: { warnNotGlobal: true },
      } as ReturnType<typeof loadConfig>);

      expect(isManifestEmpty(tempDir)).toBe(false);
    });
  });
});
