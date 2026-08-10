import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBodyOverride, PRContentError } from './pr-content.js';

describe('readBodyOverride', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-content-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when neither body nor bodyFile is given', () => {
    expect(readBodyOverride({})).toBeUndefined();
  });

  it('returns the inline body when only body is given', () => {
    expect(readBodyOverride({ body: 'hello' })).toBe('hello');
  });

  it('reads file contents when only bodyFile is given', () => {
    const file = path.join(tmpDir, 'body.md');
    fs.writeFileSync(file, '## Summary\n\nreal content\n');
    expect(readBodyOverride({ bodyFile: file })).toBe('## Summary\n\nreal content\n');
  });

  it('throws PRContentError when both body and bodyFile are given', () => {
    expect(() => readBodyOverride({ body: 'a', bodyFile: '/tmp/x.md' })).toThrow(PRContentError);
    expect(() => readBodyOverride({ body: 'a', bodyFile: '/tmp/x.md' })).toThrow(
      /mutually exclusive/i
    );
  });

  it('throws PRContentError when bodyFile cannot be read', () => {
    const missing = path.join(tmpDir, 'nope.md');
    expect(() => readBodyOverride({ bodyFile: missing })).toThrow(PRContentError);
    expect(() => readBodyOverride({ bodyFile: missing })).toThrow(/nope\.md/);
  });

  it('accepts an empty inline body as an intentional empty override', () => {
    expect(readBodyOverride({ body: '' })).toBe('');
  });
});
