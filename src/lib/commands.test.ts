import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isOnPath } from './commands.js';

describe('isOnPath', () => {
  let dir: string;

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const makeDir = () => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-onpath-')));

  it('returns false for a command that is on no PATH entry', () => {
    makeDir();
    expect(isOnPath('nonexistent-tool-xyz', { PATH: dir })).toBe(false);
  });

  it('returns false when PATH is unset', () => {
    makeDir();
    expect(isOnPath('anything', {})).toBe(false);
  });

  describe.skipIf(process.platform === 'win32')('POSIX', () => {
    it('finds a command on a self-contained PATH that has no which', () => {
      makeDir();
      fs.writeFileSync(path.join(dir, 'tool'), '#!/bin/sh\n', { mode: 0o755 });

      expect(isOnPath('tool', { PATH: dir })).toBe(true);
    });

    it('ignores files without execute permission', () => {
      makeDir();
      fs.writeFileSync(path.join(dir, 'tool'), '#!/bin/sh\n', { mode: 0o644 });

      expect(isOnPath('tool', { PATH: dir })).toBe(false);
    });

    it('ignores directories with the command name', () => {
      makeDir();
      fs.mkdirSync(path.join(dir, 'tool'));

      expect(isOnPath('tool', { PATH: dir })).toBe(false);
    });

    it('checks a name with a directory part as given', () => {
      makeDir();
      const tool = path.join(dir, 'tool');
      fs.writeFileSync(tool, '#!/bin/sh\n', { mode: 0o755 });

      expect(isOnPath(tool, { PATH: '' })).toBe(true);
    });
  });

  describe.skipIf(process.platform !== 'win32')('Windows', () => {
    it('resolves PATHEXT extensions with a case-insensitive Path key', () => {
      makeDir();
      fs.writeFileSync(path.join(dir, 'tool.cmd'), '@echo off\r\n');

      expect(isOnPath('tool', { Path: dir, PATHEXT: '.EXE;.CMD' })).toBe(true);
    });
  });
});
