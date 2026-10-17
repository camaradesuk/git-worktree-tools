import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { editorCandidates, openInEditor, resolveEditorCommand } from './editor.js';

const only =
  (...available: string[]) =>
  (cmd: string) =>
    available.includes(cmd);

describe('editor', () => {
  describe('editorCandidates', () => {
    it('tries code first for vscode, auto and unset', () => {
      expect(editorCandidates('vscode')).toEqual(['code', 'cursor']);
      expect(editorCandidates('auto')).toEqual(['code', 'cursor']);
      expect(editorCandidates(undefined)).toEqual(['code', 'cursor']);
    });

    it('tries cursor first when cursor is preferred', () => {
      expect(editorCandidates('cursor')).toEqual(['cursor', 'code']);
    });
  });

  describe('resolveEditorCommand', () => {
    it('returns the preferred editor when available', () => {
      expect(resolveEditorCommand('cursor', only('code', 'cursor'))).toBe('cursor');
      expect(resolveEditorCommand('vscode', only('code', 'cursor'))).toBe('code');
    });

    it('falls back to the other editor', () => {
      expect(resolveEditorCommand('vscode', only('cursor'))).toBe('cursor');
      expect(resolveEditorCommand('cursor', only('code'))).toBe('code');
    });

    it('returns null when no editor is on PATH', () => {
      expect(resolveEditorCommand('auto', only())).toBeNull();
    });
  });

  describe('openInEditor', () => {
    it('launches the resolved editor with the worktree path', () => {
      const launch = vi.fn();

      const result = openInEditor('/wt/pr1', 'vscode', { isAvailable: only('code'), launch });

      expect(result).toEqual({ opened: true, command: 'code' });
      expect(launch).toHaveBeenCalledWith('code', '/wt/pr1');
    });

    it('skips with a reason when no editor is on PATH', () => {
      const launch = vi.fn();

      const result = openInEditor('/wt/pr1', 'vscode', { isAvailable: only(), launch });

      expect(result).toEqual({ opened: false, reason: "'code' or 'cursor' not found on PATH" });
      expect(launch).not.toHaveBeenCalled();
    });

    it('reports a launch failure instead of throwing', () => {
      const launch = vi.fn(() => {
        throw new Error('EACCES');
      });

      const result = openInEditor('/wt/pr1', 'auto', { isAvailable: only('code'), launch });

      expect(result).toEqual({ opened: false, reason: "failed to launch 'code': EACCES" });
    });
  });

  // Real PATH lookup and spawn, with a fake `code` that records its arguments.
  describe.skipIf(process.platform === 'win32')('with a fake editor on PATH', () => {
    const originalPath = process.env.PATH;
    let binDir: string;

    afterEach(() => {
      process.env.PATH = originalPath;
      fs.rmSync(binDir, { recursive: true, force: true });
    });

    const waitForFile = async (file: string): Promise<string> => {
      for (let i = 0; i < 100; i++) {
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf-8').length > 0) {
          return fs.readFileSync(file, 'utf-8');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`fake editor never wrote ${file}`);
    };

    it('opens the worktree in the fake code', async () => {
      binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-editor-'));
      const marker = path.join(binDir, 'opened.txt');
      const fakeCode = path.join(binDir, 'code');
      fs.writeFileSync(fakeCode, `#!/bin/sh\nprintf '%s' "$1" > "${marker}"\n`, { mode: 0o755 });
      // Keep /usr/bin and /bin so `which` and `sh` still resolve
      process.env.PATH = `${binDir}:/usr/bin:/bin`;

      const result = openInEditor('/some/worktree path', 'vscode');

      expect(result).toEqual({ opened: true, command: 'code' });
      expect(await waitForFile(marker)).toBe('/some/worktree path');
    });

    it('skips when neither code nor cursor is on PATH', () => {
      binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-editor-'));
      process.env.PATH = binDir;

      const result = openInEditor('/some/worktree', 'vscode');

      expect(result).toEqual({ opened: false, reason: "'code' or 'cursor' not found on PATH" });
    });
  });
});
