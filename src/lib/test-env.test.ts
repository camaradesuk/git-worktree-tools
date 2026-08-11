import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { getGlobalConfigDir } from './constants.js';

describe('test environment hermeticity', () => {
  it('resolves the global config dir under an isolated tmp dir, never the real home', () => {
    const dir = getGlobalConfigDir();
    expect(dir).not.toBe(path.join(os.homedir(), '.config', 'git-worktree-tools'));
    expect(dir.startsWith(os.tmpdir())).toBe(true);
  });
});
