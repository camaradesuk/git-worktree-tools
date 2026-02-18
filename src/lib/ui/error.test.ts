import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { printError, errorToDisplay } from './error.js';
import { setJsonMode } from './output.js';
import { setColorEnabled } from '../colors.js';
import { GitCommandError } from '../errors.js';
import { icons } from './theme.js';

describe('ui/error', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setColorEnabled(true);
  });

  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  describe('printError', () => {
    it('writes title to stderr with error icon', () => {
      printError({ title: 'Something failed' });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const output = errorSpy.mock.calls[0][0] as string;
      expect(output).toContain(icons.error);
      expect(output).toContain('Something failed');
    });

    it('writes detail line when provided', () => {
      printError({ title: 'Fail', detail: 'more info here' });
      expect(errorSpy).toHaveBeenCalledTimes(2);
      const detailLine = errorSpy.mock.calls[1][0] as string;
      expect(detailLine).toContain('more info here');
    });

    it('writes hint line when provided', () => {
      printError({ title: 'Fail', hint: 'try running X' });
      expect(errorSpy).toHaveBeenCalledTimes(2);
      const hintLine = errorSpy.mock.calls[1][0] as string;
      expect(hintLine).toContain('Hint:');
      expect(hintLine).toContain('try running X');
    });

    it('writes all three lines when title, detail, and hint provided', () => {
      printError({
        title: 'Not found',
        detail: 'stderr output here',
        hint: 'check the path',
      });
      expect(errorSpy).toHaveBeenCalledTimes(3);

      const titleLine = errorSpy.mock.calls[0][0] as string;
      expect(titleLine).toContain('Not found');

      const detailLine = errorSpy.mock.calls[1][0] as string;
      expect(detailLine).toContain('stderr output here');

      const hintLine = errorSpy.mock.calls[2][0] as string;
      expect(hintLine).toContain('check the path');
    });

    it('no-ops when JSON mode is active', () => {
      setJsonMode(true);
      printError({ title: 'Error', detail: 'detail', hint: 'hint' });
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('errorToDisplay', () => {
    it('extracts message from Error instance', () => {
      const result = errorToDisplay(new Error('test message'));
      expect(result.title).toBe('test message');
    });

    it('converts non-Error to string', () => {
      const result = errorToDisplay('raw string error');
      expect(result.title).toBe('raw string error');
    });

    it('extracts stderr from GitCommandError', () => {
      const err = new GitCommandError('git failed', {
        command: 'git checkout',
        stderr: 'fatal: not a git repo',
      });
      const result = errorToDisplay(err);
      expect(result.title).toBe('git failed');
      expect(result.detail).toBe('fatal: not a git repo');
    });

    it('provides hint from error code mapping', () => {
      // Create an error that maps to a known code with a suggestion
      const err = new Error('not a git repository');
      const result = errorToDisplay(err);
      expect(result.hint).toBeDefined();
      expect(result.hint).toContain('git repository');
    });

    it('returns undefined hint for unknown errors', () => {
      const result = errorToDisplay(new Error('some obscure error'));
      // UNKNOWN_ERROR has no default suggestion
      expect(result.hint).toBeUndefined();
    });

    it('handles null/undefined gracefully', () => {
      const result = errorToDisplay(null);
      expect(result.title).toBe('null');
    });
  });
});
