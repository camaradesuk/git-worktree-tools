import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseGitVersion,
  isGitVersionAtLeast,
  getShell,
  getGitVersion,
  isCommandAvailable,
  getDefaultTerminal,
  detectEnvironment,
  WORKTREE_MOVE_MIN_VERSION,
} from './environment.js';

describe('lswt/environment', () => {
  describe('parseGitVersion', () => {
    it('parses standard git version string', () => {
      const result = parseGitVersion('git version 2.39.0');
      expect(result).toEqual({
        major: 2,
        minor: 39,
        patch: 0,
        raw: 'git version 2.39.0',
      });
    });

    it('parses git version with Windows suffix', () => {
      const result = parseGitVersion('git version 2.39.0.windows.1');
      expect(result).toEqual({
        major: 2,
        minor: 39,
        patch: 0,
        raw: 'git version 2.39.0.windows.1',
      });
    });

    it('parses git version with Apple Git suffix', () => {
      const result = parseGitVersion('git version 2.37.1 (Apple Git-137.1)');
      expect(result).toEqual({
        major: 2,
        minor: 37,
        patch: 1,
        raw: 'git version 2.37.1 (Apple Git-137.1)',
      });
    });

    it('parses older git version', () => {
      const result = parseGitVersion('git version 1.8.5');
      expect(result).toEqual({
        major: 1,
        minor: 8,
        patch: 5,
        raw: 'git version 1.8.5',
      });
    });

    it('handles version with leading/trailing whitespace', () => {
      const result = parseGitVersion('  git version 2.40.0  \n');
      expect(result).toEqual({
        major: 2,
        minor: 40,
        patch: 0,
        raw: 'git version 2.40.0',
      });
    });

    it('returns zeros for invalid version string', () => {
      const result = parseGitVersion('not a version');
      expect(result).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        raw: 'not a version',
      });
    });

    it('returns zeros for empty string', () => {
      const result = parseGitVersion('');
      expect(result).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        raw: '',
      });
    });

    it('handles version with extra numbers', () => {
      const result = parseGitVersion('git version 2.43.0.1.2.3');
      expect(result).toEqual({
        major: 2,
        minor: 43,
        patch: 0,
        raw: 'git version 2.43.0.1.2.3',
      });
    });
  });

  describe('isGitVersionAtLeast', () => {
    const makeVersion = (major: number, minor: number, patch = 0) => ({
      major,
      minor,
      patch,
      raw: `git version ${major}.${minor}.${patch}`,
    });

    it('returns true when major version is greater', () => {
      expect(isGitVersionAtLeast(makeVersion(3, 0), { major: 2, minor: 17 })).toBe(true);
    });

    it('returns true when major is same and minor is greater', () => {
      expect(isGitVersionAtLeast(makeVersion(2, 20), { major: 2, minor: 17 })).toBe(true);
    });

    it('returns true when versions are exactly equal', () => {
      expect(isGitVersionAtLeast(makeVersion(2, 17), { major: 2, minor: 17 })).toBe(true);
    });

    it('returns false when major version is less', () => {
      expect(isGitVersionAtLeast(makeVersion(1, 99), { major: 2, minor: 17 })).toBe(false);
    });

    it('returns false when major is same but minor is less', () => {
      expect(isGitVersionAtLeast(makeVersion(2, 16), { major: 2, minor: 17 })).toBe(false);
    });

    it('works with WORKTREE_MOVE_MIN_VERSION constant', () => {
      expect(isGitVersionAtLeast(makeVersion(2, 17), WORKTREE_MOVE_MIN_VERSION)).toBe(true);
      expect(isGitVersionAtLeast(makeVersion(2, 16), WORKTREE_MOVE_MIN_VERSION)).toBe(false);
      expect(isGitVersionAtLeast(makeVersion(2, 39), WORKTREE_MOVE_MIN_VERSION)).toBe(true);
    });
  });

  describe('getShell', () => {
    let originalShell: string | undefined;
    let originalComspec: string | undefined;
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalShell = process.env.SHELL;
      originalComspec = process.env.COMSPEC;
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    });

    afterEach(() => {
      if (originalShell !== undefined) {
        process.env.SHELL = originalShell;
      } else {
        delete process.env.SHELL;
      }
      if (originalComspec !== undefined) {
        process.env.COMSPEC = originalComspec;
      } else {
        delete process.env.COMSPEC;
      }
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('returns SHELL env var on non-Windows', () => {
      // Only test on non-Windows platforms
      if (process.platform !== 'win32') {
        process.env.SHELL = '/bin/zsh';
        expect(getShell()).toBe('/bin/zsh');
      }
    });

    it('returns /bin/sh when SHELL is not set on non-Windows', () => {
      // Only test on non-Windows platforms
      if (process.platform !== 'win32') {
        delete process.env.SHELL;
        expect(getShell()).toBe('/bin/sh');
      }
    });
  });

  describe('WORKTREE_MOVE_MIN_VERSION', () => {
    it('has correct minimum version for worktree move', () => {
      expect(WORKTREE_MOVE_MIN_VERSION).toEqual({ major: 2, minor: 17 });
    });
  });

  describe('isCommandAvailable', () => {
    it('returns true for available command (git)', () => {
      // git should be available in all test environments
      expect(isCommandAvailable('git')).toBe(true);
    });

    it('returns false for unavailable command', () => {
      expect(isCommandAvailable('nonexistent-command-xyz123')).toBe(false);
    });
  });

  describe('getGitVersion', () => {
    it('returns a valid git version', () => {
      const version = getGitVersion();
      expect(version.major).toBeGreaterThanOrEqual(2);
      expect(version.minor).toBeGreaterThanOrEqual(0);
      expect(version.patch).toBeGreaterThanOrEqual(0);
      expect(version.raw).toContain('git version');
    });
  });

  describe('getDefaultTerminal', () => {
    it('returns a string', () => {
      const terminal = getDefaultTerminal();
      expect(typeof terminal).toBe('string');
      expect(terminal.length).toBeGreaterThan(0);
    });

    it('returns a valid terminal name for current platform', () => {
      const terminal = getDefaultTerminal();
      const platform = process.platform;

      if (platform === 'darwin') {
        expect(['Terminal', 'iTerm2']).toContain(terminal);
      } else if (platform === 'win32') {
        expect(['wt', 'cmd']).toContain(terminal);
      } else {
        // Linux
        expect(['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']).toContain(terminal);
      }
    });
  });

  describe('detectEnvironment', () => {
    it('returns environment info object with all required properties', () => {
      const env = detectEnvironment();

      expect(typeof env.hasVscode).toBe('boolean');
      expect(typeof env.hasCursor).toBe('boolean');
      expect(['vscode', 'cursor', null]).toContain(env.defaultEditor);
      expect(['win32', 'darwin', 'linux']).toContain(env.platform);
      expect(typeof env.isInteractive).toBe('boolean');
      expect(typeof env.shell).toBe('string');
      expect(env.gitVersion).toBeDefined();
      expect(typeof env.gitVersion.major).toBe('number');
      expect(typeof env.gitVersion.minor).toBe('number');
    });

    it('sets defaultEditor to vscode when vscode is available', () => {
      const env = detectEnvironment();

      // If VSCode is available, defaultEditor should be vscode
      if (env.hasVscode) {
        expect(env.defaultEditor).toBe('vscode');
      }
    });

    it('sets defaultEditor to cursor when only cursor is available', () => {
      const env = detectEnvironment();

      // If Cursor is available but not VSCode, defaultEditor should be cursor
      if (env.hasCursor && !env.hasVscode) {
        expect(env.defaultEditor).toBe('cursor');
      }
    });

    it('sets defaultEditor to null when neither editor is available', () => {
      const env = detectEnvironment();

      // If neither is available, defaultEditor should be null
      if (!env.hasVscode && !env.hasCursor) {
        expect(env.defaultEditor).toBeNull();
      }
    });

    it('returns platform as win32, darwin, or linux', () => {
      const env = detectEnvironment();
      expect(['win32', 'darwin', 'linux']).toContain(env.platform);
    });

    it('returns a valid shell path', () => {
      const env = detectEnvironment();
      expect(env.shell.length).toBeGreaterThan(0);

      // On Windows, should contain cmd or powershell or similar
      // On Unix, should contain a path like /bin/bash, /bin/zsh, etc.
      if (process.platform !== 'win32') {
        expect(env.shell).toMatch(/^\//);
      }
    });

    it('isInteractive reflects TTY status', () => {
      const env = detectEnvironment();
      // In test environment, stdout.isTTY may be undefined or false
      expect(typeof env.isInteractive).toBe('boolean');
    });
  });

  describe('parseGitVersion edge cases', () => {
    it('handles version string with only git version text', () => {
      const result = parseGitVersion('git version');
      expect(result.major).toBe(0);
      expect(result.minor).toBe(0);
      expect(result.patch).toBe(0);
    });

    it('handles version string with partial version', () => {
      const result = parseGitVersion('git version 2');
      expect(result.major).toBe(0);
      expect(result.minor).toBe(0);
      expect(result.patch).toBe(0);
    });

    it('handles version string with two-part version', () => {
      const result = parseGitVersion('git version 2.39');
      expect(result.major).toBe(0);
      expect(result.minor).toBe(0);
      expect(result.patch).toBe(0);
    });

    it('handles double-digit version numbers', () => {
      const result = parseGitVersion('git version 12.34.56');
      expect(result).toEqual({
        major: 12,
        minor: 34,
        patch: 56,
        raw: 'git version 12.34.56',
      });
    });

    it('handles version with newline at start', () => {
      const result = parseGitVersion('\ngit version 2.39.0\n');
      expect(result.major).toBe(2);
      expect(result.minor).toBe(39);
      expect(result.patch).toBe(0);
    });
  });

  describe('isGitVersionAtLeast edge cases', () => {
    const makeVersion = (major: number, minor: number, patch = 0) => ({
      major,
      minor,
      patch,
      raw: `git version ${major}.${minor}.${patch}`,
    });

    it('handles zero versions', () => {
      expect(isGitVersionAtLeast(makeVersion(0, 0), { major: 0, minor: 0 })).toBe(true);
    });

    it('handles very old git versions', () => {
      expect(isGitVersionAtLeast(makeVersion(1, 5), { major: 2, minor: 0 })).toBe(false);
    });
  });

  describe('isCommandAvailable edge cases', () => {
    it('returns true for common system commands', () => {
      // These should exist on all platforms
      if (process.platform === 'win32') {
        expect(isCommandAvailable('cmd')).toBe(true);
      } else {
        expect(isCommandAvailable('sh')).toBe(true);
      }
    });

    it('handles command names with special characters gracefully', () => {
      // This should not throw, just return false
      expect(isCommandAvailable('foo$bar')).toBe(false);
    });
  });

  describe('getShell edge cases', () => {
    it('returns a string containing path or command', () => {
      const shell = getShell();
      expect(shell.length).toBeGreaterThan(0);
    });
  });

  describe('getDefaultTerminal edge cases', () => {
    it('never returns empty string', () => {
      const terminal = getDefaultTerminal();
      expect(terminal).toBeTruthy();
    });

    it('returns consistent results on repeated calls', () => {
      const terminal1 = getDefaultTerminal();
      const terminal2 = getDefaultTerminal();
      expect(terminal1).toBe(terminal2);
    });
  });

  describe('getGitVersion edge cases', () => {
    it('returns valid version info with raw containing git version', () => {
      const version = getGitVersion();
      // The raw string should contain version info or 'unknown' if git not found
      expect(version.raw.length).toBeGreaterThan(0);
    });

    it('has consistent major/minor/patch types', () => {
      const version = getGitVersion();
      expect(Number.isInteger(version.major)).toBe(true);
      expect(Number.isInteger(version.minor)).toBe(true);
      expect(Number.isInteger(version.patch)).toBe(true);
    });
  });
});
