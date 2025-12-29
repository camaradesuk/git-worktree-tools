import { describe, it, expect } from 'vitest';
import * as colors from './colors.js';

describe('colors', () => {
  describe('codes', () => {
    it('should export ANSI color codes', () => {
      expect(colors.codes.red).toBe('\x1b[31m');
      expect(colors.codes.green).toBe('\x1b[32m');
      expect(colors.codes.yellow).toBe('\x1b[33m');
      expect(colors.codes.blue).toBe('\x1b[34m');
      expect(colors.codes.cyan).toBe('\x1b[36m');
      expect(colors.codes.reset).toBe('\x1b[0m');
      expect(colors.codes.bold).toBe('\x1b[1m');
      expect(colors.codes.dim).toBe('\x1b[2m');
    });
  });

  describe('color functions', () => {
    // In CI/test environments, colors are typically disabled (no TTY)
    // So we test that the functions return strings containing the input

    it('red should return text', () => {
      const result = colors.red('test');
      expect(result).toContain('test');
    });

    it('green should return text', () => {
      const result = colors.green('test');
      expect(result).toContain('test');
    });

    it('yellow should return text', () => {
      const result = colors.yellow('test');
      expect(result).toContain('test');
    });

    it('blue should return text', () => {
      const result = colors.blue('test');
      expect(result).toContain('test');
    });

    it('cyan should return text', () => {
      const result = colors.cyan('test');
      expect(result).toContain('test');
    });

    it('bold should return text', () => {
      const result = colors.bold('test');
      expect(result).toContain('test');
    });

    it('dim should return text', () => {
      const result = colors.dim('test');
      expect(result).toContain('test');
    });
  });

  describe('semantic functions', () => {
    it('success should include the text and a marker', () => {
      const result = colors.success('done');
      expect(result).toContain('done');
      // Should have some marker (either checkmark or [OK])
      expect(result.length).toBeGreaterThan('done'.length);
    });

    it('warning should include the text', () => {
      const result = colors.warning('caution');
      expect(result).toContain('caution');
    });

    it('error should include the text', () => {
      const result = colors.error('failed');
      expect(result).toContain('failed');
    });

    it('info should include the text', () => {
      const result = colors.info('note');
      expect(result).toContain('note');
    });
  });
});
