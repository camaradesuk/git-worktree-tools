/**
 * Tests for constants.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import {
  PACKAGE_NAME,
  DEFAULT_REMOTE,
  DEFAULT_BASE_BRANCH,
  COMMON_BASE_BRANCHES,
  DEFAULT_MANIFEST_FILE,
  CONFIG_FILE_NAMES,
  LOCAL_CONFIG_FILE_NAMES,
  GLOBAL_CONFIG_FILE_NAME,
  getGlobalConfigDir,
  getGlobalLogDir,
  getGlobalDataDir,
  DEFAULT_WORKTREE_PATTERN,
  DEFAULT_WORKTREE_PARENT,
  DEFAULT_BRANCH_PREFIX,
  LogLevel,
  DEFAULT_LOG_LEVEL,
  MAX_LOG_FILE_SIZE,
  MAX_LOG_FILES,
} from './constants.js';

describe('constants', () => {
  describe('exported constants', () => {
    it('has correct PACKAGE_NAME', () => {
      expect(PACKAGE_NAME).toBe('git-worktree-tools');
    });

    it('has correct DEFAULT_REMOTE', () => {
      expect(DEFAULT_REMOTE).toBe('origin');
    });

    it('has correct DEFAULT_BASE_BRANCH', () => {
      expect(DEFAULT_BASE_BRANCH).toBe('main');
    });

    it('has correct COMMON_BASE_BRANCHES', () => {
      expect(COMMON_BASE_BRANCHES).toEqual(['main', 'master', 'develop']);
    });

    it('has correct DEFAULT_MANIFEST_FILE', () => {
      expect(DEFAULT_MANIFEST_FILE).toBe('.wtlinkrc');
    });

    it('has correct CONFIG_FILE_NAMES', () => {
      expect(CONFIG_FILE_NAMES).toEqual(['.worktreerc', '.worktreerc.json']);
    });

    it('has correct LOCAL_CONFIG_FILE_NAMES', () => {
      expect(LOCAL_CONFIG_FILE_NAMES).toEqual(['.worktreerc.local', '.worktreerc.local.json']);
    });

    it('has correct GLOBAL_CONFIG_FILE_NAME', () => {
      expect(GLOBAL_CONFIG_FILE_NAME).toBe('config.json');
    });

    it('has correct DEFAULT_WORKTREE_PATTERN', () => {
      expect(DEFAULT_WORKTREE_PATTERN).toBe('{repo}.pr{number}');
    });

    it('has correct DEFAULT_WORKTREE_PARENT', () => {
      expect(DEFAULT_WORKTREE_PARENT).toBe('..');
    });

    it('has correct DEFAULT_BRANCH_PREFIX', () => {
      expect(DEFAULT_BRANCH_PREFIX).toBe('feat');
    });
  });

  describe('LogLevel enum', () => {
    it('has correct consola-compatible values', () => {
      expect(LogLevel.SILENT).toBe(-999);
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(3);
      expect(LogLevel.DEBUG).toBe(4);
      expect(LogLevel.TRACE).toBe(5);
    });

    it('has DEFAULT_LOG_LEVEL as INFO', () => {
      expect(DEFAULT_LOG_LEVEL).toBe(LogLevel.INFO);
    });
  });

  describe('log file constants', () => {
    it('has MAX_LOG_FILE_SIZE at 10MB', () => {
      expect(MAX_LOG_FILE_SIZE).toBe(10 * 1024 * 1024);
    });

    it('has MAX_LOG_FILES at 3', () => {
      expect(MAX_LOG_FILES).toBe(3);
    });
  });

  describe('getGlobalConfigDir', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns APPDATA path on win32 when APPDATA is set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
      const result = getGlobalConfigDir();
      expect(result).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'git-worktree-tools'));
    });

    it('returns default AppData\\Roaming path on win32 when APPDATA is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      delete process.env.APPDATA;
      const result = getGlobalConfigDir();
      expect(result).toBe(path.join(os.homedir(), 'AppData', 'Roaming', 'git-worktree-tools'));
    });

    it('returns XDG config path on Linux when XDG_CONFIG_HOME is set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_CONFIG_HOME = '/custom/config';
      const result = getGlobalConfigDir();
      expect(result).toBe(path.join('/custom/config', 'git-worktree-tools'));
    });

    it('returns default .config path on Linux when XDG_CONFIG_HOME is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.XDG_CONFIG_HOME;
      const result = getGlobalConfigDir();
      expect(result).toBe(path.join(os.homedir(), '.config', 'git-worktree-tools'));
    });

    it('returns path containing package name', () => {
      const result = getGlobalConfigDir();
      expect(result).toContain(PACKAGE_NAME);
    });
  });

  describe('getGlobalLogDir', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns LOCALAPPDATA path on win32 when LOCALAPPDATA is set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
      const result = getGlobalLogDir();
      expect(result).toBe(
        path.join('C:\\Users\\test\\AppData\\Local', 'git-worktree-tools', 'logs')
      );
    });

    it('returns default AppData\\Local path on win32 when LOCALAPPDATA is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      delete process.env.LOCALAPPDATA;
      const result = getGlobalLogDir();
      expect(result).toBe(
        path.join(os.homedir(), 'AppData', 'Local', 'git-worktree-tools', 'logs')
      );
    });

    it('returns XDG state path on Linux when XDG_STATE_HOME is set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_STATE_HOME = '/custom/state';
      const result = getGlobalLogDir();
      expect(result).toBe(path.join('/custom/state', 'git-worktree-tools', 'logs'));
    });

    it('returns default .local/state path on Linux when XDG_STATE_HOME is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.XDG_STATE_HOME;
      const result = getGlobalLogDir();
      expect(result).toBe(path.join(os.homedir(), '.local', 'state', 'git-worktree-tools', 'logs'));
    });

    it('returns path containing package name and logs', () => {
      const result = getGlobalLogDir();
      expect(result).toContain(PACKAGE_NAME);
      expect(result).toContain('logs');
    });
  });

  describe('getGlobalDataDir', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns APPDATA path on win32 when APPDATA is set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
      const result = getGlobalDataDir();
      expect(result).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'git-worktree-tools'));
    });

    it('returns default AppData\\Roaming path on win32 when APPDATA is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      delete process.env.APPDATA;
      const result = getGlobalDataDir();
      expect(result).toBe(path.join(os.homedir(), 'AppData', 'Roaming', 'git-worktree-tools'));
    });

    it('returns Library/Application Support path on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const result = getGlobalDataDir();
      expect(result).toBe(
        path.join(os.homedir(), 'Library', 'Application Support', 'git-worktree-tools')
      );
    });

    it('returns XDG data path on Linux when XDG_DATA_HOME is set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_DATA_HOME = '/custom/data';
      const result = getGlobalDataDir();
      expect(result).toBe(path.join('/custom/data', 'git-worktree-tools'));
    });

    it('returns default .local/share path on Linux when XDG_DATA_HOME is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.XDG_DATA_HOME;
      const result = getGlobalDataDir();
      expect(result).toBe(path.join(os.homedir(), '.local', 'share', 'git-worktree-tools'));
    });

    it('returns path containing package name', () => {
      const result = getGlobalDataDir();
      expect(result).toContain(PACKAGE_NAME);
    });
  });
});
