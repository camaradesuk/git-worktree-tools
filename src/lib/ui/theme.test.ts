import { describe, it, expect, beforeEach } from 'vitest';
import { icons, box, changeIndicator } from './theme.js';
import { setColorEnabled } from '../colors.js';

describe('ui/theme', () => {
  beforeEach(() => {
    // Enable colors for predictable output
    setColorEnabled(true);
  });

  describe('icons', () => {
    it('exports all expected icon constants', () => {
      expect(icons.success).toBe('\u2713');
      expect(icons.error).toBe('\u2717');
      expect(icons.warning).toBe('\u26A0');
      expect(icons.info).toBe('\u2139');
      expect(icons.bullet).toBe('\u2022');
      expect(icons.arrow).toBe('\u25B6');
      expect(icons.change).toBe('*');
    });

    it('icons object is readonly', () => {
      // TypeScript enforces this at compile time via `as const`,
      // but verify the object has the right shape at runtime
      expect(Object.keys(icons)).toEqual([
        'success',
        'error',
        'warning',
        'info',
        'bullet',
        'arrow',
        'change',
      ]);
    });
  });

  describe('box', () => {
    it('exports all expected box-drawing constants', () => {
      expect(box.horizontal).toBe('\u2550');
      expect(box.vertical).toBe('\u2551');
      expect(box.topLeft).toBe('\u2554');
      expect(box.topRight).toBe('\u2557');
      expect(box.bottomLeft).toBe('\u255A');
      expect(box.bottomRight).toBe('\u255D');
      expect(box.line).toBe('\u2500');
    });

    it('box object is readonly', () => {
      expect(Object.keys(box)).toEqual([
        'horizontal',
        'vertical',
        'topLeft',
        'topRight',
        'bottomLeft',
        'bottomRight',
        'line',
      ]);
    });
  });

  describe('changeIndicator', () => {
    it('returns a string containing * when hasChanges is true', () => {
      const result = changeIndicator(true);
      expect(result).toContain('*');
    });

    it('returns empty string when hasChanges is false', () => {
      const result = changeIndicator(false);
      expect(result).toBe('');
    });

    it('includes red ANSI code when changes exist and colors enabled', () => {
      const result = changeIndicator(true);
      // Should contain the red ANSI escape code
      expect(result).toContain('\x1b[31m');
    });

    it('returns plain * without color when colors disabled', () => {
      setColorEnabled(false);
      const result = changeIndicator(true);
      expect(result).toBe(' *');
    });
  });
});
