import { describe, it, expect } from 'vitest';
import { parseArgs, getHelpText } from './args.js';

describe('cleanpr/args', () => {
  describe('parseArgs', () => {
    it('returns success with default options for empty args', () => {
      const result = parseArgs([]);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: false, force: false, all: false, interactive: true },
      });
    });

    it('parses PR number', () => {
      const result = parseArgs(['123']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: 123,
        options: { deleteRemote: false, force: false, all: false, interactive: false },
      });
    });

    it('parses --remote flag', () => {
      const result = parseArgs(['--remote']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: true, force: false, all: false, interactive: true },
      });
    });

    it('parses -r shorthand', () => {
      const result = parseArgs(['-r']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: true, force: false, all: false, interactive: true },
      });
    });

    it('parses --force flag', () => {
      const result = parseArgs(['--force']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: false, force: true, all: false, interactive: true },
      });
    });

    it('parses -f shorthand', () => {
      const result = parseArgs(['-f']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: false, force: true, all: false, interactive: true },
      });
    });

    it('parses --all flag', () => {
      const result = parseArgs(['--all']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: false, force: false, all: true, interactive: false },
      });
    });

    it('parses -a shorthand', () => {
      const result = parseArgs(['-a']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: false, force: false, all: true, interactive: false },
      });
    });

    it('parses multiple flags', () => {
      const result = parseArgs(['-f', '-r']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: null,
        options: { deleteRemote: true, force: true, all: false, interactive: true },
      });
    });

    it('parses PR number with flags', () => {
      const result = parseArgs(['42', '-r', '-f']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: 42,
        options: { deleteRemote: true, force: true, all: false, interactive: false },
      });
    });

    it('parses flags before PR number', () => {
      const result = parseArgs(['-r', '99']);
      expect(result).toEqual({
        kind: 'success',
        prNumber: 99,
        options: { deleteRemote: true, force: false, all: false, interactive: false },
      });
    });

    it('returns help for --help', () => {
      const result = parseArgs(['--help']);
      expect(result).toEqual({ kind: 'help' });
    });

    it('returns help for -h', () => {
      const result = parseArgs(['-h']);
      expect(result).toEqual({ kind: 'help' });
    });

    it('returns error for unknown flag', () => {
      const result = parseArgs(['--unknown']);
      expect(result).toEqual({
        kind: 'error',
        message: 'Unknown option: --unknown',
      });
    });

    it('returns error for unknown short flag', () => {
      const result = parseArgs(['-x']);
      expect(result).toEqual({
        kind: 'error',
        message: 'Unknown option: -x',
      });
    });

    it('returns error for invalid PR number', () => {
      const result = parseArgs(['abc']);
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid PR number: abc',
      });
    });

    it('returns error for non-numeric string', () => {
      const result = parseArgs(['pr123']);
      expect(result).toEqual({
        kind: 'error',
        message: 'Invalid PR number: pr123',
      });
    });

    it('stops processing after help flag', () => {
      const result = parseArgs(['--help', '--force']);
      expect(result).toEqual({ kind: 'help' });
    });

    it('stops processing after error', () => {
      const result = parseArgs(['--unknown', '123']);
      expect(result.kind).toBe('error');
    });

    it('sets interactive false when PR number provided', () => {
      const result = parseArgs(['5']);
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.options.interactive).toBe(false);
      }
    });

    it('sets interactive false when --all provided', () => {
      const result = parseArgs(['--all']);
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.options.interactive).toBe(false);
      }
    });

    it('keeps interactive true with only flags', () => {
      const result = parseArgs(['--force', '--remote']);
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.options.interactive).toBe(true);
      }
    });
  });

  describe('getHelpText', () => {
    it('returns help text containing command name', () => {
      const help = getHelpText();
      expect(help).toContain('cleanpr');
    });

    it('returns help text containing all options', () => {
      const help = getHelpText();
      expect(help).toContain('--remote');
      expect(help).toContain('--force');
      expect(help).toContain('--all');
      expect(help).toContain('--help');
    });

    it('returns help text containing short options', () => {
      const help = getHelpText();
      expect(help).toContain('-r');
      expect(help).toContain('-f');
      expect(help).toContain('-a');
      expect(help).toContain('-h');
    });

    it('returns help text containing usage section', () => {
      const help = getHelpText();
      expect(help).toContain('USAGE');
    });

    it('returns help text containing examples', () => {
      const help = getHelpText();
      expect(help).toContain('EXAMPLES');
    });

    it('returns help text containing what it removes', () => {
      const help = getHelpText();
      expect(help).toContain('WHAT IT REMOVES');
    });
  });
});
