import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureWorktreeParentDir } from './worktree-setup.js';

describe('ensureWorktreeParentDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-setup-test-'));
    // Create a fake .git directory so it looks like a repo
    fs.mkdirSync(path.join(tmpDir, '.git'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create directory and update gitignore for in-repo parent', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(true);
    expect(result.gitignoreUpdated).toBe(true);
    expect(fs.existsSync(worktreeDir)).toBe(true);

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.worktrees');
  });

  it('should skip setup for out-of-repo parent', async () => {
    const externalDir = path.join(os.tmpdir(), 'external-worktrees-' + Date.now());

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: externalDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(false);
    expect(result.gitignoreUpdated).toBe(false);
    expect(result.declined).toBe(false);
  });

  it('should skip creation when directory already exists', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.mkdirSync(worktreeDir);

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(false);
    // Should still update gitignore since dir exists but isn't ignored
    expect(result.gitignoreUpdated).toBe(true);
  });

  it('should not duplicate gitignore entries', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.worktrees\n', 'utf8');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.gitignoreUpdated).toBe(false);
    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    const matches = gitignore.match(/\.worktrees/g);
    expect(matches).toHaveLength(1);
  });

  it('should append to existing gitignore', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules\n.env\n', 'utf8');

    await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('.worktrees');
  });

  it('should handle nested worktree parent dirs', async () => {
    const worktreeDir = path.join(tmpDir, 'build', 'worktrees');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(true);
    expect(fs.existsSync(worktreeDir)).toBe(true);

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('build/worktrees');
  });

  it('should prompt and decline in interactive mode', async () => {
    // Mock promptConfirm to return false (decline)
    const { promptConfirm } = await import('./prompts.js');
    vi.mock('./prompts.js', () => ({
      promptConfirm: vi.fn(),
    }));
    const mockedPromptConfirm = vi.mocked(promptConfirm);
    mockedPromptConfirm.mockResolvedValue(false);

    // Re-import to get the mocked version
    const { ensureWorktreeParentDir: ensureFn } = await import('./worktree-setup.js');

    const worktreeDir = path.join(tmpDir, '.worktrees');

    const result = await ensureFn({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: true,
    });

    expect(result.declined).toBe(true);
    expect(result.created).toBe(false);
    expect(result.gitignoreUpdated).toBe(false);

    vi.restoreAllMocks();
  });

  it('should prompt and accept in interactive mode', async () => {
    const { promptConfirm } = await import('./prompts.js');
    vi.mock('./prompts.js', () => ({
      promptConfirm: vi.fn(),
    }));
    const mockedPromptConfirm = vi.mocked(promptConfirm);
    mockedPromptConfirm.mockResolvedValue(true);

    const { ensureWorktreeParentDir: ensureFn } = await import('./worktree-setup.js');

    const worktreeDir = path.join(tmpDir, '.worktrees');

    const result = await ensureFn({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: true,
    });

    expect(result.declined).toBe(false);
    expect(result.created).toBe(true);
    expect(result.gitignoreUpdated).toBe(true);

    vi.restoreAllMocks();
  });

  it('should return all false when dir exists and is already gitignored', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.mkdirSync(worktreeDir);
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.worktrees\n', 'utf8');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(result.created).toBe(false);
    expect(result.gitignoreUpdated).toBe(false);
    expect(result.declined).toBe(false);
  });

  it('should handle gitignore entry with leading slash', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '/.worktrees\n', 'utf8');

    const result = await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    // Entry already exists (with leading slash), so gitignore should not be updated
    expect(result.gitignoreUpdated).toBe(false);
  });

  it('should add comment header when updating gitignore', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');

    await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# git-worktree-tools worktree directory');
  });

  it('should create gitignore from scratch when none exists', async () => {
    const worktreeDir = path.join(tmpDir, '.worktrees');

    await ensureWorktreeParentDir({
      resolvedParentDir: worktreeDir,
      repoRoot: tmpDir,
      interactive: false,
    });

    expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.worktrees');
  });
});
