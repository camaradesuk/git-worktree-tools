import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as git from '../lib/git.js';
import {
  getDefaultConfig,
  getConfigPath,
  generateWorktreePath,
  loadConfigWithValidation,
} from '../lib/config.js';
import {
  gatherWorktreeInfo,
  createDefaultDeps as createLswtDeps,
} from '../lib/lswt/worktree-info.js';

/**
 * Integration tests for worktree layout anchoring against a REAL bare-repository
 * container (.bare/ + main/ + pr/*), matching spec §5.
 */

function normalizePath(p: string): string {
  try {
    return path.normalize(fs.realpathSync.native(p)).toLowerCase();
  } catch {
    return path.normalize(p).toLowerCase();
  }
}

describe('worktree layout anchoring integration', () => {
  let tempDir: string;
  let container: string;
  let mainWorktree: string;
  let prWorktree: string;

  beforeAll(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'gwt-bare-layout-')));

    // Seed a normal repo with one commit, then clone it bare — the standard
    // way to set up a .bare/ + worktrees layout.
    const seed = path.join(tempDir, 'seed');
    fs.mkdirSync(seed);
    execSync('git init -q -b main', { cwd: seed });
    execSync('git config user.email test@test.com', { cwd: seed });
    execSync('git config user.name Test', { cwd: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), 'seed\n');
    fs.writeFileSync(
      path.join(seed, '.worktreerc'),
      JSON.stringify({ worktreeParent: '.worktrees', worktreePattern: 'pr{number}.{slug}' })
    );
    execSync('git add README.md .worktreerc', { cwd: seed });
    execSync('git commit -q -m initial', { cwd: seed });

    container = path.join(tempDir, 'container');
    fs.mkdirSync(container);
    execSync(`git clone --bare -q "${seed}" "${path.join(container, '.bare')}"`);

    mainWorktree = path.join(container, 'main');
    execSync(`git worktree add -q "${mainWorktree}" main`, {
      cwd: path.join(container, '.bare'),
    });

    fs.mkdirSync(path.join(container, 'pr'));
    prWorktree = path.join(container, 'pr', 'pr1.existing-feature');
    execSync(`git worktree add -q -b feat/existing-feature "${prWorktree}" main`, {
      cwd: path.join(container, '.bare'),
    });
    fs.writeFileSync(
      path.join(mainWorktree, '.worktreerc.local'),
      JSON.stringify({ worktreeParent: '../pr' })
    );
  });

  afterAll(() => {
    try {
      execSync('git worktree prune', { cwd: path.join(container, '.bare'), stdio: 'ignore' });
    } catch {
      // ignore
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('getMainWorktreeRoot resolves the container root from the main worktree', () => {
    expect(normalizePath(git.getMainWorktreeRoot(mainWorktree))).toBe(normalizePath(container));
  });

  it('getMainWorktreeRoot resolves the same container root from a linked pr worktree', () => {
    expect(normalizePath(git.getMainWorktreeRoot(prWorktree))).toBe(normalizePath(container));
  });

  it('finds the canonical main checkout from a linked pr worktree', () => {
    expect(normalizePath(git.getMainWorktree(prWorktree)?.path ?? '')).toBe(
      normalizePath(mainWorktree)
    );
  });

  it('loads the main checkout local override when invoked from a linked worktree', () => {
    const result = loadConfigWithValidation(prWorktree);

    expect(result.config.worktreeParent).toBe('../pr');
    expect(normalizePath(result.configPath ?? '')).toBe(
      normalizePath(path.join(mainWorktree, '.worktreerc.local'))
    );
  });

  it('selects the canonical local override for config operations from a linked worktree', () => {
    expect(normalizePath(getConfigPath(prWorktree) ?? '')).toBe(
      normalizePath(path.join(mainWorktree, '.worktreerc.local'))
    );
  });

  it('resolves a canonical local override under the nested workspace container', () => {
    const config = loadConfigWithValidation(prWorktree).config;
    const result = generateWorktreePath(
      config,
      prWorktree,
      'container',
      2600,
      'feat/new-feature',
      git.getMainWorktreeRoot(prWorktree)
    );

    expect(normalizePath(result)).toBe(
      normalizePath(path.join(container, 'pr', 'pr2600.new-feature'))
    );
  });

  it('lists canonical main correctly when invoked from a linked worktree', async () => {
    const result = await gatherWorktreeInfo(
      prWorktree,
      {
        showStatus: false,
        json: true,
        verbose: true,
        worktreePattern: 'pr{number}.{slug}',
      },
      createLswtDeps()
    );

    expect(
      result.find((worktree) => normalizePath(worktree.path) === normalizePath(mainWorktree))?.type
    ).toBe('main');
    expect(
      result.find((worktree) => normalizePath(worktree.path) === normalizePath(prWorktree))?.type
    ).toBe('pr');
  });

  it('places a new pr worktree under the container, invoked from main', () => {
    const config = {
      ...getDefaultConfig(),
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    };
    const result = generateWorktreePath(
      config,
      mainWorktree,
      'container',
      2600,
      'feat/new-feature',
      git.getMainWorktreeRoot(mainWorktree)
    );
    expect(normalizePath(result)).toBe(
      normalizePath(path.join(container, 'pr', 'pr2600.new-feature'))
    );
  });

  it('places the same path when invoked from a different linked worktree', () => {
    const config = {
      ...getDefaultConfig(),
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    };
    const result = generateWorktreePath(
      config,
      prWorktree, // a DIFFERENT worktree than the previous test
      'container',
      2600,
      'feat/new-feature',
      git.getMainWorktreeRoot(prWorktree)
    );
    expect(normalizePath(result)).toBe(
      normalizePath(path.join(container, 'pr', 'pr2600.new-feature'))
    );
  });

  it('documents the pre-fix bug: without mainWorktreeRoot the path moves with the invoking worktree', () => {
    const config = {
      ...getDefaultConfig(),
      worktreeParent: 'pr',
      worktreePattern: 'pr{number}.{slug}',
    };
    const result = generateWorktreePath(config, prWorktree, 'container', 2600, 'feat/new-feature');
    expect(normalizePath(result)).toBe(
      normalizePath(path.join(prWorktree, 'pr', 'pr2600.new-feature'))
    );
    expect(result).not.toBe(path.join(container, 'pr', 'pr2600.new-feature'));
  });
});
