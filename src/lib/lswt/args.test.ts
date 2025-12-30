import { describe, it, expect } from 'vitest';
import { parseArgs, getHelpText } from './args.js';

describe('lswt/args', () => {
  describe('parseArgs', () => {
    it('returns success with default options for empty args', () => {
      const result = parseArgs([]);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: false },
      });
    });

    it('parses --status flag', () => {
      const result = parseArgs(['--status']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: false, verbose: false },
      });
    });

    it('parses -s shorthand', () => {
      const result = parseArgs(['-s']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: false, verbose: false },
      });
    });

    it('parses --json flag', () => {
      const result = parseArgs(['--json']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: true, verbose: false },
      });
    });

    it('parses -j shorthand', () => {
      const result = parseArgs(['-j']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: true, verbose: false },
      });
    });

    it('parses --verbose flag', () => {
      const result = parseArgs(['--verbose']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: true },
      });
    });

    it('parses -v shorthand', () => {
      const result = parseArgs(['-v']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: true },
      });
    });

    it('parses multiple flags', () => {
      const result = parseArgs(['-s', '-j', '-v']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: true, verbose: true },
      });
    });

    it('parses combined long flags', () => {
      const result = parseArgs(['--status', '--json', '--verbose']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: true, verbose: true },
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

    it('ignores non-flag arguments', () => {
      const result = parseArgs(['something']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: false },
      });
    });

    it('stops processing after help flag', () => {
      const result = parseArgs(['--help', '--status']);
      expect(result).toEqual({ kind: 'help' });
    });

    it('stops processing after error', () => {
      const result = parseArgs(['--unknown', '--status']);
      expect(result.kind).toBe('error');
    });
  });

  describe('getHelpText', () => {
    it('returns help text containing command name', () => {
      const help = getHelpText();
      expect(help).toContain('lswt');
    });

    it('returns help text containing all options', () => {
      const help = getHelpText();
      expect(help).toContain('--status');
      expect(help).toContain('--json');
      expect(help).toContain('--verbose');
      expect(help).toContain('--help');
    });

    it('returns help text containing short options', () => {
      const help = getHelpText();
      expect(help).toContain('-s');
      expect(help).toContain('-j');
      expect(help).toContain('-v');
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
  });
});
