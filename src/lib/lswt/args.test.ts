import { describe, it, expect } from 'vitest';
import { parseArgs, getHelpText } from './args.js';

describe('lswt/args', () => {
  describe('parseArgs', () => {
    it('returns success with default options for empty args', () => {
      const result = parseArgs([]);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: false, interactive: undefined },
      });
    });

    it('parses --status flag', () => {
      const result = parseArgs(['--status']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: false, verbose: false, interactive: undefined },
      });
    });

    it('parses -s shorthand', () => {
      const result = parseArgs(['-s']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: false, verbose: false, interactive: undefined },
      });
    });

    it('parses --json flag', () => {
      const result = parseArgs(['--json']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: true, verbose: false, interactive: undefined },
      });
    });

    it('parses -j shorthand', () => {
      const result = parseArgs(['-j']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: true, verbose: false, interactive: undefined },
      });
    });

    it('parses --verbose flag', () => {
      const result = parseArgs(['--verbose']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: true, interactive: undefined },
      });
    });

    it('parses -v shorthand', () => {
      const result = parseArgs(['-v']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: true, interactive: undefined },
      });
    });

    it('parses multiple flags', () => {
      const result = parseArgs(['-s', '-j', '-v']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: true, verbose: true, interactive: undefined },
      });
    });

    it('parses combined long flags', () => {
      const result = parseArgs(['--status', '--json', '--verbose']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: true, verbose: true, interactive: undefined },
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
        options: { showStatus: false, json: false, verbose: false, interactive: undefined },
      });
    });

    it('parses --interactive flag', () => {
      const result = parseArgs(['--interactive']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: false, interactive: true },
      });
    });

    it('parses -i shorthand', () => {
      const result = parseArgs(['-i']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: false, interactive: true },
      });
    });

    it('parses --no-interactive flag', () => {
      const result = parseArgs(['--no-interactive']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: false, verbose: false, interactive: false },
      });
    });

    it('returns error when --json and --interactive are used together', () => {
      const result = parseArgs(['--json', '--interactive']);
      expect(result).toEqual({
        kind: 'error',
        message: '--json and --interactive cannot be used together',
      });
    });

    it('returns error when -j and -i are used together', () => {
      const result = parseArgs(['-j', '-i']);
      expect(result).toEqual({
        kind: 'error',
        message: '--json and --interactive cannot be used together',
      });
    });

    it('allows --json with --no-interactive', () => {
      const result = parseArgs(['--json', '--no-interactive']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: false, json: true, verbose: false, interactive: false },
      });
    });

    it('parses --interactive with other flags', () => {
      const result = parseArgs(['--status', '--interactive', '--verbose']);
      expect(result).toEqual({
        kind: 'success',
        options: { showStatus: true, json: false, verbose: true, interactive: true },
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
      expect(help).toContain('--interactive');
      expect(help).toContain('--no-interactive');
    });

    it('returns help text containing short options', () => {
      const help = getHelpText();
      expect(help).toContain('-s');
      expect(help).toContain('-j');
      expect(help).toContain('-v');
      expect(help).toContain('-h');
      expect(help).toContain('-i');
    });

    it('returns help text containing interactive mode section', () => {
      const help = getHelpText();
      expect(help).toContain('INTERACTIVE MODE');
    });

    it('returns help text containing shortcuts section', () => {
      const help = getHelpText();
      expect(help).toContain('SHORTCUTS');
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
