import { describe, it, expect, vi, afterEach } from 'vitest';
import { setJsonMode, isJsonMode, print, printErr } from './output.js';

describe('ui/output', () => {
  afterEach(() => {
    // Always reset JSON mode after each test
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  describe('setJsonMode / isJsonMode', () => {
    it('defaults to false', () => {
      expect(isJsonMode()).toBe(false);
    });

    it('can be set to true', () => {
      setJsonMode(true);
      expect(isJsonMode()).toBe(true);
    });

    it('can be toggled back to false', () => {
      setJsonMode(true);
      setJsonMode(false);
      expect(isJsonMode()).toBe(false);
    });
  });

  describe('print', () => {
    it('calls console.log when JSON mode is off', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      print('hello', 'world');
      expect(spy).toHaveBeenCalledWith('hello', 'world');
    });

    it('suppresses output when JSON mode is on', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setJsonMode(true);
      print('should not appear');
      expect(spy).not.toHaveBeenCalled();
    });

    it('resumes output after JSON mode is turned off', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setJsonMode(true);
      print('suppressed');
      setJsonMode(false);
      print('visible');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('visible');
    });
  });

  describe('printErr', () => {
    it('calls console.error when JSON mode is off', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      printErr('error msg');
      expect(spy).toHaveBeenCalledWith('error msg');
    });

    it('suppresses stderr when JSON mode is on', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setJsonMode(true);
      printErr('should not appear');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
