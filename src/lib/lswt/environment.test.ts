import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseGitVersion,
  isGitVersionAtLeast,
  getShell,
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
});
