/**
 * Tests for loadConfigForRun() — the single chokepoint in newpr.ts where
 * `wt new`'s --ai-provider/--ai-timeout CLI flags are applied on top of the
 * already-resolved config (defaults < global < repo < local < env). CLI
 * flags are the highest tier: they beat GWT_AI_* env vars.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfigForRun } from './newpr.js';
import { getDefaultOptions } from '../lib/newpr/args.js';

describe('loadConfigForRun', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newpr-config-overrides-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses config.ai unchanged when no CLI overrides are given', () => {
    fs.writeFileSync(
      path.join(tempDir, '.worktreerc'),
      JSON.stringify({ ai: { provider: 'claude' } })
    );
    expect(loadConfigForRun(tempDir, getDefaultOptions()).ai.provider).toBe('claude');
  });

  it('applies options.aiProvider over the file-resolved provider', () => {
    fs.writeFileSync(
      path.join(tempDir, '.worktreerc'),
      JSON.stringify({ ai: { provider: 'claude' } })
    );
    const config = loadConfigForRun(tempDir, { ...getDefaultOptions(), aiProvider: 'ollama' });
    expect(config.ai.provider).toBe('ollama');
  });

  it('applies options.aiTimeout', () => {
    const config = loadConfigForRun(tempDir, { ...getDefaultOptions(), aiTimeout: 20000 });
    expect(config.ai.timeout).toBe(20000);
  });

  it('CLI flag beats an env override for the same run', () => {
    fs.writeFileSync(path.join(tempDir, '.worktreerc'), JSON.stringify({}));
    process.env.GWT_AI_PROVIDER = 'gemini';
    try {
      const config = loadConfigForRun(tempDir, { ...getDefaultOptions(), aiProvider: 'ollama' });
      expect(config.ai.provider).toBe('ollama');
    } finally {
      delete process.env.GWT_AI_PROVIDER;
    }
  });

  it('preserves the rest of the resolved config untouched', () => {
    fs.writeFileSync(
      path.join(tempDir, '.worktreerc'),
      JSON.stringify({ baseBranch: 'develop', ai: { provider: 'claude', branchName: true } })
    );
    const config = loadConfigForRun(tempDir, { ...getDefaultOptions(), aiTimeout: 5000 });
    expect(config.baseBranch).toBe('develop');
    expect(config.ai.provider).toBe('claude');
    expect(config.ai.branchName).toBe(true);
    expect(config.ai.timeout).toBe(5000);
  });
});
