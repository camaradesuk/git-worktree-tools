/**
 * wtstate args tests
 */

import { describe, it, expect } from 'vitest';
import { parseArgs, getDefaultOptions, getHelpText } from './args.js';

describe('wtstate/args', () => {
  describe('getDefaultOptions', () => {
    it('returns default options', () => {
      const defaults = getDefaultOptions();
      expect(defaults).toEqual({
        json: false,
        verbose: false,
        baseBranch: 'main',
      });
    });
  });

  describe('parseArgs', () => {
    it('returns success with defaults for empty args', () => {
      const result = parseArgs([]);
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.options.json).toBe(false);
        expect(result.options.verbose).toBe(false);
        expect(result.options.baseBranch).toBe('main');
      }
    });

    it('parses --help and -h', () => {
      expect(parseArgs(['--help']).kind).toBe('help');
      expect(parseArgs(['-h']).kind).toBe('help');
    });

    it('parses --json flag', () => {
      const result = parseArgs(['--json']);
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.options.json).toBe(true);
      }
    });

    it('parses --verbose and -v flags', () => {
      const result1 = parseArgs(['--verbose']);
      expect(result1.kind).toBe('success');
      if (result1.kind === 'success') {
        expect(result1.options.verbose).toBe(true);
      }

      const result2 = parseArgs(['-v']);
      expect(result2.kind).toBe('success');
      if (result2.kind === 'success') {
        expect(result2.options.verbose).toBe(true);
      }
    });

    it('parses --base and -b with branch name', () => {
      const result1 = parseArgs(['--base', 'develop']);
      expect(result1.kind).toBe('success');
      if (result1.kind === 'success') {
        expect(result1.options.baseBranch).toBe('develop');
      }

      const result2 = parseArgs(['-b', 'master']);
      expect(result2.kind).toBe('success');
      if (result2.kind === 'success') {
        expect(result2.options.baseBranch).toBe('master');
      }
    });

    it('returns error when --base is missing branch name', () => {
      const result = parseArgs(['--base']);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toContain('--base requires');
      }
    });

    it('returns error when --base is followed by another flag', () => {
      const result = parseArgs(['--base', '--json']);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toContain('--base requires');
      }
    });

    it('returns error for unknown options', () => {
      const result = parseArgs(['--unknown']);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toContain('Unknown option');
      }
    });

    it('returns error for unexpected positional arguments', () => {
      const result = parseArgs(['something']);
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toContain('Unexpected argument');
      }
    });

    it('parses multiple flags together', () => {
      const result = parseArgs(['--json', '--verbose', '--base', 'develop']);
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.options.json).toBe(true);
        expect(result.options.verbose).toBe(true);
        expect(result.options.baseBranch).toBe('develop');
      }
    });
  });

  describe('getHelpText', () => {
    it('returns help text string', () => {
      const help = getHelpText();
      expect(typeof help).toBe('string');
      expect(help.length).toBeGreaterThan(0);
    });

    it('includes command name', () => {
      const help = getHelpText();
      expect(help).toContain('wtstate');
    });

    it('includes --json option', () => {
      const help = getHelpText();
      expect(help).toContain('--json');
    });

    it('includes usage examples', () => {
      const help = getHelpText();
      expect(help).toContain('Examples');
    });
  });
});
