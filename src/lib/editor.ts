/**
 * Open a new worktree in the user's editor (`openEditor` / `wt new --code`).
 *
 * The editor is optional: on hosts without it (headless boxes, CI, SSH
 * sessions) opening is skipped and reported, never treated as a failure.
 */

import { spawn } from 'child_process';
import { isOnPath } from './commands.js';

export type PreferredEditor = 'vscode' | 'cursor' | 'auto';

export interface EditorDeps {
  isAvailable: (cmd: string) => boolean;
  /** Resolves once the editor process has started; rejects if it can't */
  launch: (cmd: string, targetPath: string) => Promise<void>;
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
  isAvailable: (cmd: string) => boolean = isOnPath
): string | null {
  return editorCandidates(preferred).find((cmd) => isAvailable(cmd)) ?? null;
}

function launchDetached(cmd: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Windows editor shims are .cmd files, which Node only runs through a
    // shell. `"` cannot occur in a Windows path, so plain quoting is enough.
    const isWindows = process.platform === 'win32';
    const child = spawn(cmd, [isWindows ? `"${targetPath}"` : targetPath], {
      detached: true,
      stdio: 'ignore',
      shell: isWindows,
    });
    // Spawn failures (ENOENT, EACCES) arrive asynchronously as 'error'
    child.on('error', reject);
    child.on('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

const defaultDeps: EditorDeps = {
  isAvailable: isOnPath,
  launch: launchDetached,
};

/**
 * Open targetPath in the preferred editor. Never rejects.
 */
export async function openInEditor(
  targetPath: string,
  preferred: PreferredEditor | undefined,
  overrides: Partial<EditorDeps> = {}
): Promise<OpenEditorResult> {
  const deps = { ...defaultDeps, ...overrides };
  const command = resolveEditorCommand(preferred, deps.isAvailable);
  if (!command) {
    const tried = editorCandidates(preferred)
      .map((cmd) => `'${cmd}'`)
      .join(' or ');
    return { opened: false, reason: `${tried} not found on PATH` };
  }

  try {
    await deps.launch(command, targetPath);
    return { opened: true, command };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { opened: false, reason: `failed to launch '${command}': ${message}` };
  }
}
