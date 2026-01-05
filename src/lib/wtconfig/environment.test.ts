/**
 * Environment Detection Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import {
  detectEnvironment,
  detectDefaultBranch,
  getInstallCommand,
  getEditorCommand,
} from './environment.js';
import type { EnvironmentInfo } from './types.js';

vi.mock('child_process');
vi.mock('fs');

describe('environment', () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Mock spawnSync to return not found by default
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      pid: 0,
      output: ['', '', ''],
      signal: null,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('detectEnvironment', () => {
    it('returns environment info object', () => {
      const result = detectEnvironment();

      expect(result).toHaveProperty('os');
      expect(result).toHaveProperty('git');
      expect(result).toHaveProperty('github');
      expect(result).toHaveProperty('ai');
      expect(result).toHaveProperty('packageManager');
      expect(result).toHaveProperty('ide');
    });

    it('detects linux OS', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const result = detectEnvironment();
      expect(result.os).toBe('linux');
    });

    it('detects macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const result = detectEnvironment();
      expect(result.os).toBe('macos');
    });

    it('detects Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const result = detectEnvironment();
      expect(result.os).toBe('windows');
    });

    it('detects git version when installed', () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'which' && args?.[0] === 'git') {
          return {
            status: 0,
            stdout: '/usr/bin/git',
            stderr: '',
            pid: 0,
            output: [],
            signal: null,
          };
        }
        if (cmd === 'git') {
          if (args?.[0] === '--version') {
            return {
              status: 0,
              stdout: 'git version 2.43.0',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
          if (args?.[0] === 'config' && args?.[2] === 'user.name') {
            return { status: 0, stdout: 'Test User', stderr: '', pid: 0, output: [], signal: null };
          }
          if (args?.[0] === 'config' && args?.[2] === 'user.email') {
            return {
              status: 0,
              stdout: 'test@example.com',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
        }
        return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
      });

      const result = detectEnvironment();
      expect(result.git.version).toBe('2.43.0');
      expect(result.git.configured).toBe(true);
      expect(result.git.user).toBe('Test User');
      expect(result.git.email).toBe('test@example.com');
    });

    it('detects GitHub CLI when installed and authenticated', () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        // Handle both 'which' (Unix) and 'where' (Windows)
        if (cmd === 'which' || cmd === 'where') {
          if (args?.[0] === 'gh') {
            return {
              status: 0,
              stdout: '/usr/bin/gh',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
        }
        if (cmd === 'gh') {
          if (args?.[0] === 'auth' && args?.[1] === 'status') {
            return { status: 0, stdout: 'Logged in', stderr: '', pid: 0, output: [], signal: null };
          }
          if (args?.[0] === 'api') {
            return { status: 0, stdout: 'testuser', stderr: '', pid: 0, output: [], signal: null };
          }
        }
        return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
      });

      const result = detectEnvironment();
      expect(result.github.installed).toBe(true);
      expect(result.github.authenticated).toBe(true);
      expect(result.github.user).toBe('testuser');
    });

    it('detects AI tools', () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        // Handle both 'which' (Unix) and 'where' (Windows)
        if (cmd === 'which' || cmd === 'where') {
          if (args?.[0] === 'claude' || args?.[0] === 'ollama') {
            return {
              status: 0,
              stdout: '/path/to/' + args[0],
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
        }
        return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
      });

      const result = detectEnvironment();
      expect(result.ai.claudeCode).toBe(true);
      expect(result.ai.ollama).toBe(true);
      expect(result.ai.geminiCLI).toBe(false);
    });

    it('detects package manager from lock files', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return (p as string).endsWith('pnpm-lock.yaml');
      });

      const result = detectEnvironment('/test/project');
      expect(result.packageManager).toBe('pnpm');
    });

    it('detects IDE availability', () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        // Handle both 'which' (Unix) and 'where' (Windows)
        if (cmd === 'which' || cmd === 'where') {
          if (args?.[0] === 'code' || args?.[0] === 'cursor') {
            return {
              status: 0,
              stdout: '/path/to/' + args[0],
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
        }
        return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
      });

      const result = detectEnvironment();
      expect(result.ide.vscode).toBe(true);
      expect(result.ide.cursor).toBe(true);
    });
  });

  describe('detectDefaultBranch', () => {
    it('returns main by default', () => {
      const result = detectDefaultBranch();
      expect(result).toBe('main');
    });

    it('returns git config default branch if set', () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if (cmd === 'git' && args?.[0] === 'config' && args?.[2] === 'init.defaultBranch') {
          return { status: 0, stdout: 'develop', stderr: '', pid: 0, output: [], signal: null };
        }
        return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
      });

      const result = detectDefaultBranch();
      expect(result).toBe('develop');
    });
  });

  describe('getInstallCommand', () => {
    it('returns pnpm install for pnpm', () => {
      expect(getInstallCommand('pnpm')).toBe('pnpm install');
    });

    it('returns yarn install for yarn', () => {
      expect(getInstallCommand('yarn')).toBe('yarn install');
    });

    it('returns bun install for bun', () => {
      expect(getInstallCommand('bun')).toBe('bun install');
    });

    it('returns npm install for npm', () => {
      expect(getInstallCommand('npm')).toBe('npm install');
    });

    it('returns npm install for null', () => {
      expect(getInstallCommand(null)).toBe('npm install');
    });
  });

  describe('getEditorCommand', () => {
    it('returns cursor command when cursor preferred and available', () => {
      const ide: EnvironmentInfo['ide'] = { vscode: true, cursor: true };
      expect(getEditorCommand(ide, 'cursor')).toBe('cursor .');
    });

    it('returns vscode command when vscode preferred and available', () => {
      const ide: EnvironmentInfo['ide'] = { vscode: true, cursor: true };
      expect(getEditorCommand(ide, 'vscode')).toBe('code .');
    });

    it('returns null when preferred editor not available', () => {
      const ide: EnvironmentInfo['ide'] = { vscode: true, cursor: false };
      expect(getEditorCommand(ide, 'cursor')).toBeNull();
    });

    it('prefers vscode when auto and both available', () => {
      const ide: EnvironmentInfo['ide'] = { vscode: true, cursor: true };
      expect(getEditorCommand(ide, 'auto')).toBe('code .');
    });

    it('returns vscode when auto and only vscode available', () => {
      const ide: EnvironmentInfo['ide'] = { vscode: true, cursor: false };
      expect(getEditorCommand(ide, 'auto')).toBe('code .');
    });

    it('returns null when no editor available', () => {
      const ide: EnvironmentInfo['ide'] = { vscode: false, cursor: false };
      expect(getEditorCommand(ide, 'auto')).toBeNull();
    });
  });
});
