/**
 * Tests for global-check.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkGlobalInstall, warnIfNotGlobal, checkAndWarnGlobalInstall } from './global-check.js';

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('global-check', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleWarnSpy.mockRestore();
  });

  describe('checkGlobalInstall', () => {
    it('returns result with isGlobal property', () => {
      const result = checkGlobalInstall();
      expect(result).toHaveProperty('isGlobal');
      expect(typeof result.isGlobal).toBe('boolean');
    });

    it('returns result with installPath property', () => {
      const result = checkGlobalInstall();
      expect(result).toHaveProperty('installPath');
      expect(typeof result.installPath).toBe('string');
    });

    it('returns result with globalPath property', () => {
      const result = checkGlobalInstall();
      expect(result).toHaveProperty('globalPath');
      // globalPath can be null or string
      expect(result.globalPath === null || typeof result.globalPath === 'string').toBe(true);
    });

    it('returns warning message if not global', () => {
      const result = checkGlobalInstall();
      // In test environment, likely not global
      if (!result.isGlobal) {
        expect(result.warning).toBeDefined();
        expect(result.warning).toContain('npm install -g');
      }
    });

    it('respects GWT_ALLOW_LOCAL environment variable', () => {
      process.env.GWT_ALLOW_LOCAL = '1';
      const result = checkGlobalInstall();
      expect(result.isGlobal).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('respects GWT_ALLOW_LOCAL=true', () => {
      process.env.GWT_ALLOW_LOCAL = 'true';
      const result = checkGlobalInstall();
      expect(result.isGlobal).toBe(true);
    });
  });

  describe('warnIfNotGlobal', () => {
    it('does nothing when warnEnabled is false', () => {
      warnIfNotGlobal(false);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('warns when not global and warnEnabled is true', () => {
      // Ensure not bypassed
      delete process.env.GWT_ALLOW_LOCAL;

      warnIfNotGlobal(true);

      // Check should be called (may or may not warn depending on install location)
      // In test environment, it's likely local, so it should warn
      const result = checkGlobalInstall();
      if (!result.isGlobal) {
        expect(consoleWarnSpy).toHaveBeenCalled();
      }
    });

    it('includes install instructions in warning', () => {
      delete process.env.GWT_ALLOW_LOCAL;

      warnIfNotGlobal(true);

      const result = checkGlobalInstall();
      if (!result.isGlobal) {
        const warningCalls = consoleWarnSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(warningCalls).toContain('npm install -g');
      }
    });

    it('suggests GWT_ALLOW_LOCAL to suppress warning', () => {
      delete process.env.GWT_ALLOW_LOCAL;

      warnIfNotGlobal(true);

      const result = checkGlobalInstall();
      if (!result.isGlobal) {
        const warningCalls = consoleWarnSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(warningCalls).toContain('GWT_ALLOW_LOCAL');
      }
    });

    it('does not warn when GWT_ALLOW_LOCAL is set', () => {
      process.env.GWT_ALLOW_LOCAL = '1';

      warnIfNotGlobal(true);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('checkAndWarnGlobalInstall', () => {
    it('warns by default when config not provided', () => {
      delete process.env.GWT_ALLOW_LOCAL;

      checkAndWarnGlobalInstall();

      const result = checkGlobalInstall();
      // Will warn if not global (which is expected in test environment)
      if (!result.isGlobal) {
        expect(consoleWarnSpy).toHaveBeenCalled();
      }
    });

    it('respects config.global.warnNotGlobal = false', () => {
      checkAndWarnGlobalInstall({ global: { warnNotGlobal: false } });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('warns when config.global.warnNotGlobal = true', () => {
      delete process.env.GWT_ALLOW_LOCAL;

      checkAndWarnGlobalInstall({ global: { warnNotGlobal: true } });

      const result = checkGlobalInstall();
      if (!result.isGlobal) {
        expect(consoleWarnSpy).toHaveBeenCalled();
      }
    });

    it('handles undefined global config', () => {
      delete process.env.GWT_ALLOW_LOCAL;

      // Should not throw
      expect(() => checkAndWarnGlobalInstall({})).not.toThrow();
    });

    it('handles config with other properties', () => {
      delete process.env.GWT_ALLOW_LOCAL;

      // Should not throw and should respect warnNotGlobal
      expect(() =>
        checkAndWarnGlobalInstall({
          global: { warnNotGlobal: false },
        })
      ).not.toThrow();

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('installation path detection', () => {
    it('detects local installation path', () => {
      const result = checkGlobalInstall();

      // In test environment, should detect some path
      expect(result.installPath).toBeDefined();
      expect(result.installPath.length).toBeGreaterThan(0);
    });

    it('installPath contains git-worktree-tools', () => {
      const result = checkGlobalInstall();

      // The install path should contain our package name somewhere
      expect(result.installPath.toLowerCase()).toContain('git-worktree-tools');
    });
  });
});
