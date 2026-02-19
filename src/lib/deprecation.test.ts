import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printDeprecationNotice } from './deprecation.js';

describe('printDeprecationNotice', () => {
  let stderrWritten: string[];
  let originalWrite: typeof process.stderr.write;
  let originalArgv: string[];
  let originalEnv: string | undefined;

  beforeEach(() => {
    stderrWritten = [];
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderrWritten.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;
    originalArgv = process.argv;
    originalEnv = process.env.GWT_NO_DEPRECATION_WARNINGS;
    delete process.env.GWT_NO_DEPRECATION_WARNINGS;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    process.argv = originalArgv;
    if (originalEnv !== undefined) {
      process.env.GWT_NO_DEPRECATION_WARNINGS = originalEnv;
    } else {
      delete process.env.GWT_NO_DEPRECATION_WARNINGS;
    }
  });

  it('writes deprecation notice to stderr', () => {
    process.argv = ['node', 'lswt'];

    printDeprecationNotice('lswt', 'wt list');

    expect(stderrWritten).toHaveLength(1);
    const output = stderrWritten[0];
    expect(output).toContain('[DEPRECATED]');
    expect(output).toContain('lswt');
    expect(output).toContain('wt list');
  });

  it('includes both old and new command names in the message', () => {
    process.argv = ['node', 'cleanpr'];

    printDeprecationNotice('cleanpr', 'wt clean');

    const output = stderrWritten[0];
    expect(output).toContain('"cleanpr"');
    expect(output).toContain('"wt clean"');
    expect(output).toContain('removed in a future version');
    expect(output).toContain('GWT_NO_DEPRECATION_WARNINGS=1');
  });

  it('suppresses output when --json flag is present', () => {
    process.argv = ['node', 'lswt', '--json'];

    printDeprecationNotice('lswt', 'wt list');

    expect(stderrWritten).toHaveLength(0);
  });

  it('suppresses output when GWT_NO_DEPRECATION_WARNINGS=1 is set', () => {
    process.argv = ['node', 'lswt'];
    process.env.GWT_NO_DEPRECATION_WARNINGS = '1';

    printDeprecationNotice('lswt', 'wt list');

    expect(stderrWritten).toHaveLength(0);
  });

  it('does not suppress when GWT_NO_DEPRECATION_WARNINGS is set to other values', () => {
    process.argv = ['node', 'lswt'];
    process.env.GWT_NO_DEPRECATION_WARNINGS = '0';

    printDeprecationNotice('lswt', 'wt list');

    expect(stderrWritten).toHaveLength(1);
  });

  it('suppresses when both --json and env var are set', () => {
    process.argv = ['node', 'lswt', '--json'];
    process.env.GWT_NO_DEPRECATION_WARNINGS = '1';

    printDeprecationNotice('lswt', 'wt list');

    expect(stderrWritten).toHaveLength(0);
  });
});
