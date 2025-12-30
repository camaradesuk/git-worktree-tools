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

    it('should export all style codes', () => {
      expect(colors.codes.italic).toBe('\x1b[3m');
      expect(colors.codes.underline).toBe('\x1b[4m');
    });

    it('should export bright color codes', () => {
      expect(colors.codes.brightBlack).toBe('\x1b[90m');
      expect(colors.codes.brightRed).toBe('\x1b[91m');
      expect(colors.codes.brightGreen).toBe('\x1b[92m');
    });

    it('should export background color codes', () => {
      expect(colors.codes.bgRed).toBe('\x1b[41m');
      expect(colors.codes.bgGreen).toBe('\x1b[42m');
      expect(colors.codes.bgBlue).toBe('\x1b[44m');
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

    it('magenta should return text', () => {
      const result = colors.magenta('test');
      expect(result).toContain('test');
    });

    it('white should return text', () => {
      const result = colors.white('test');
      expect(result).toContain('test');
    });

    it('gray should return text', () => {
      const result = colors.gray('test');
      expect(result).toContain('test');
    });

    it('black should return text', () => {
      const result = colors.black('test');
      expect(result).toContain('test');
    });
  });

  describe('background color functions', () => {
    it('bgBlue should return text', () => {
      const result = colors.bgBlue('test');
      expect(result).toContain('test');
    });

    it('bgYellow should return text', () => {
      const result = colors.bgYellow('test');
      expect(result).toContain('test');
    });

    it('bgRed should return text', () => {
      const result = colors.bgRed('test');
      expect(result).toContain('test');
    });

    it('bgGreen should return text', () => {
      const result = colors.bgGreen('test');
      expect(result).toContain('test');
    });
  });

  describe('style functions', () => {
    it('bold should return text', () => {
      const result = colors.bold('test');
      expect(result).toContain('test');
    });

    it('dim should return text', () => {
      const result = colors.dim('test');
      expect(result).toContain('test');
    });

    it('italic should return text', () => {
      const result = colors.italic('test');
      expect(result).toContain('test');
    });

    it('underline should return text', () => {
      const result = colors.underline('test');
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

    it('debug should include the text and DEBUG marker', () => {
      const result = colors.debug('debugging');
      expect(result).toContain('debugging');
      expect(result).toContain('DEBUG');
    });
  });

  describe('utility functions', () => {
    it('header should return styled text', () => {
      const result = colors.header('Title');
      expect(result).toContain('Title');
    });

    it('highlight should return styled text', () => {
      const result = colors.highlight('important');
      expect(result).toContain('important');
    });
  });
});
