import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as git from '../lib/git.js';
import { getDefaultConfig, generateWorktreePath } from '../lib/config.js';

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
    execSync('git add README.md', { cwd: seed });
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

describe('bare container: relative worktreeParent must not escape the container', () => {
  let tempDir: string;
  let container: string;
  let mainWorktree: string;
  let prWorktree: string;

  beforeAll(() => {
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'gwt-bare-escape-')));

    const seed = path.join(tempDir, 'seed');
    fs.mkdirSync(seed);
    execSync('git init -q -b main', { cwd: seed });
    execSync('git config user.email test@test.com', { cwd: seed });
    execSync('git config user.name Test', { cwd: seed });
    fs.writeFileSync(path.join(seed, 'README.md'), 'seed\n');
    execSync('git add README.md', { cwd: seed });
    execSync('git commit -q -m initial', { cwd: seed });

    // Container layout: <container>/.bare + <container>/main + <container>/pr/*
    container = path.join(tempDir, 'container');
    fs.mkdirSync(container);
    execSync(`git clone --bare -q "${seed}" "${path.join(container, '.bare')}"`);
    // The container itself carries a .git FILE pointing into .bare, exactly like
    // the real-world layout this regression came from.
    fs.writeFileSync(path.join(container, '.git'), `gitdir: ${path.join(container, '.bare')}\n`);

    mainWorktree = path.join(container, 'main');
    execSync(`git worktree add -q "${mainWorktree}" main`, { cwd: path.join(container, '.bare') });

    fs.mkdirSync(path.join(container, 'pr'));
    prWorktree = path.join(container, 'pr', 'pr1.existing-feature');
    execSync(`git worktree add -q -b feat/existing-feature "${prWorktree}" main`, {
      cwd: path.join(container, '.bare'),
    });
  });

  afterAll(() => {
    try {
      execSync('git worktree prune', { cwd: path.join(container, '.bare'), stdio: 'ignore' });
    } catch {
      // ignore
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function pathFor(worktreeParent: string, invokedFrom: string): string {
    const config = {
      ...getDefaultConfig(),
      worktreeParent,
      worktreePattern: 'pr{number}.{slug}',
    };
    return generateWorktreePath(
      config,
      invokedFrom,
      'container',
      2897,
      'feat/shared-local-sqlserver-for-quartz',
      git.getMainWorktreeRoot(invokedFrom)
    );
  }

  const expected = () =>
    normalizePath(path.join(container, 'pr', 'pr2897.shared-local-sqlserver-for-quartz'));

  it('keeps a legacy "../pr" parent inside the container when invoked from main/', () => {
    expect(normalizePath(pathFor('../pr', mainWorktree))).toBe(expected());
  });

  it('keeps a legacy "../pr" parent inside the container when invoked from a pr worktree', () => {
    expect(normalizePath(pathFor('../pr', prWorktree))).toBe(expected());
  });

  it('clamps multiple escaping segments back into the container', () => {
    expect(normalizePath(pathFor('../../pr', mainWorktree))).toBe(expected());
  });

  it('leaves a contained relative parent untouched', () => {
    expect(normalizePath(pathFor('pr', mainWorktree))).toBe(expected());
    expect(normalizePath(pathFor('./pr', prWorktree))).toBe(expected());
  });

  it('never places the worktree outside the container', () => {
    for (const parent of ['../pr', '../../pr', '../../../pr', 'pr']) {
      const result = pathFor(parent, mainWorktree);
      expect(path.relative(container, result).startsWith('..')).toBe(false);
    }
  });
});
