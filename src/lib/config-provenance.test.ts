import { describe, it, expect } from 'vitest';
import { resolveKeyProvenance, resolveConfigProvenance } from './config-provenance.js';
import type { LoadedConfigSource } from './config.js';

function source(
  level: 'global' | 'repo' | 'local',
  path: string,
  config: Record<string, unknown>
): LoadedConfigSource {
  return { path, level, config, validation: null } as LoadedConfigSource;
}

describe('resolveKeyProvenance', () => {
  it('returns the default tier when no source defines the key', () => {
    expect(resolveKeyProvenance('worktreeParent', '..', [])).toEqual({
      value: '..',
      tier: 'default',
      source: null,
    });
  });

  it('finds the key in a single global source', () => {
    const sources = [
      source('global', '/home/user/.config/git-worktree-tools/config.json', {
        worktreeParent: '.worktrees',
      }),
    ];
    expect(resolveKeyProvenance('worktreeParent', '.worktrees', sources)).toEqual({
      value: '.worktrees',
      tier: 'global',
      source: '/home/user/.config/git-worktree-tools/config.json',
    });
  });

  it('reproduces the hybrid-path case: global sets the parent, repo sets the pattern', () => {
    const sources = [
      source('global', '/home/user/.config/git-worktree-tools/config.json', {
        worktreeParent: '.worktrees',
        worktreePattern: 'pr{number}.{slug}',
      }),
      source('repo', '/repo/.worktreerc', { worktreePattern: '{repo}.pr{number}' }),
    ];
    expect(resolveKeyProvenance('worktreeParent', '.worktrees', sources).tier).toBe('global');
    expect(resolveKeyProvenance('worktreePattern', '{repo}.pr{number}', sources).tier).toBe('repo');
  });

  it('local beats repo beats global for the same key', () => {
    const sources = [
      source('global', '/g', { baseBranch: 'from-global' }),
      source('repo', '/r/.worktreerc', { baseBranch: 'from-repo' }),
      source('local', '/r/.worktreerc.local', { baseBranch: 'from-local' }),
    ];
    expect(resolveKeyProvenance('baseBranch', 'from-local', sources).tier).toBe('local');
  });

  it('resolves nested dotted paths', () => {
    const sources = [source('repo', '/r/.worktreerc', { ai: { provider: 'claude' } })];
    expect(resolveKeyProvenance('ai.provider', 'claude', sources).tier).toBe('repo');
  });

  it('env override beats every file tier', () => {
    const sources = [source('local', '/r/.worktreerc.local', { ai: { provider: 'claude' } })];
    expect(
      resolveKeyProvenance(
        'ai.provider',
        'ollama',
        sources,
        {},
        { 'ai.provider': 'GWT_AI_PROVIDER' }
      )
    ).toEqual({ value: 'ollama', tier: 'env', source: 'GWT_AI_PROVIDER' });
  });

  it('flag override beats env and every file tier', () => {
    const sources = [source('local', '/r/.worktreerc.local', { ai: { provider: 'claude' } })];
    expect(
      resolveKeyProvenance(
        'ai.provider',
        'gemini',
        sources,
        { 'ai.provider': '--ai-provider' },
        { 'ai.provider': 'GWT_AI_PROVIDER' }
      )
    ).toEqual({ value: 'gemini', tier: 'flag', source: '--ai-provider' });
  });
});

describe('resolveConfigProvenance', () => {
  it('resolves a batch of key paths', () => {
    const sources = [source('repo', '/r/.worktreerc', { baseBranch: 'develop' })];
    const result = resolveConfigProvenance(
      ['baseBranch', 'draftPr'],
      { baseBranch: 'develop', draftPr: false },
      sources
    );
    expect(result.baseBranch.tier).toBe('repo');
    expect(result.draftPr.tier).toBe('default');
  });
});
