/**
 * Open a new worktree in the user's editor (`openEditor` / `wt new --code`).
 *
 * The editor is optional: on hosts without it (headless boxes, CI, SSH
 * sessions) opening is skipped and reported, never treated as a failure.
 */

import { spawn } from 'child_process';
import { commandExists } from './ai/cli-provider.js';

export type PreferredEditor = 'vscode' | 'cursor' | 'auto';

export interface EditorDeps {
  isAvailable: (cmd: string) => boolean;
  launch: (cmd: string, targetPath: string) => void;
}

export type OpenEditorResult =
  | { opened: true; command: string }
  | { opened: false; reason: string };

/**
 * Editor commands in lookup order. The preferred editor comes first; the
 * other is a fallback, matching the "Open in editor" actions in wt prs/lswt.
 */
export function editorCandidates(preferred: PreferredEditor | undefined): string[] {
  return preferred === 'cursor' ? ['cursor', 'code'] : ['code', 'cursor'];
}

/**
 * Return the first available editor command, or null if none is on PATH.
 */
export function resolveEditorCommand(
  preferred: PreferredEditor | undefined,
  isAvailable: (cmd: string) => boolean = commandExists
): string | null {
  return editorCandidates(preferred).find((cmd) => isAvailable(cmd)) ?? null;
}

function launchDetached(cmd: string, targetPath: string): void {
  // Windows editor shims are .cmd files, which Node only runs through a shell.
  const isWindows = process.platform === 'win32';
  const child = spawn(cmd, [isWindows ? `"${targetPath}"` : targetPath], {
    detached: true,
    stdio: 'ignore',
    shell: isWindows,
  });
  // A launch error must not crash wt after the worktree is already set up.
  child.on('error', () => {});
  child.unref();
}

const defaultDeps: EditorDeps = {
  isAvailable: commandExists,
  launch: launchDetached,
};

/**
 * Open targetPath in the preferred editor. Never throws.
 */
export function openInEditor(
  targetPath: string,
  preferred: PreferredEditor | undefined,
  deps: EditorDeps = defaultDeps
): OpenEditorResult {
  const command = resolveEditorCommand(preferred, deps.isAvailable);
  if (!command) {
    const tried = editorCandidates(preferred)
      .map((cmd) => `'${cmd}'`)
      .join(' or ');
    return { opened: false, reason: `${tried} not found on PATH` };
  }

  try {
    deps.launch(command, targetPath);
    return { opened: true, command };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { opened: false, reason: `failed to launch '${command}': ${message}` };
  }
}
