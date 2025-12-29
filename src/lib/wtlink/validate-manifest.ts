import fs from 'fs';
import path from 'path';
import { spawnSync, SpawnSyncOptions } from 'child_process';
import * as colors from '../colors.js';

export interface ValidateArgv {
  manifestFile: string;
  source?: string;
}

function runGit(
  args: string[],
  options?: SpawnSyncOptions
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    encoding: 'utf-8',
    cwd: options?.cwd ?? process.cwd(),
    env: options?.env ?? process.env,
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const code = result.status ?? 0;

  return { code, stdout, stderr };
}

function checkGitInstalled(): void {
  const result = runGit(['--version']);
  if (result.code !== 0) {
    throw new Error(
      'Git is not installed or not found in your PATH. This tool requires Git.'
    );
  }
}

function getGitRoot(): string {
  const result = runGit(['rev-parse', '--show-toplevel']);
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || 'Unable to determine git repository root.'
    );
  }
  return result.stdout.trim();
}

/**
 * Get the main worktree root (not the current worktree).
 * This ensures the manifest is always stored in the main worktree and shared across all worktrees.
 */
function getMainWorktreeRoot(): string {
  try {
    // Get the common git directory (shared across all worktrees)
    const result = runGit(['rev-parse', '--git-common-dir']);
    if (result.code !== 0) {
      return getGitRoot(); // Fallback
    }

    const commonDirPath = path.resolve(result.stdout.trim());

    // If git-common-dir returns ".git", we're in the main worktree
    if (path.basename(commonDirPath) === '.git') {
      return path.dirname(commonDirPath);
    }

    // Otherwise, we're in a linked worktree
    // The common dir is like: /main-worktree/.git/worktrees/feature-branch
    // We need to go up to .git, then to parent directory
    const gitDir =
      commonDirPath.includes('/worktrees/') ||
      commonDirPath.includes('\\worktrees\\')
        ? path.dirname(path.dirname(commonDirPath)) // .git/worktrees/name → .git
        : commonDirPath;

    return path.dirname(gitDir);
  } catch {
    // Fallback to current git root if command fails
    return getGitRoot();
  }
}

function isIgnored(filePath: string): boolean {
  const result = spawnSync('git', ['check-ignore', filePath], {
    encoding: 'utf-8',
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.error) {
    return false;
  }

  if ((result.status ?? 1) !== 0) {
    return false;
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  return stdout.trim().length > 0;
}

export function run(argv: ValidateArgv): void {
  checkGitInstalled();
  const gitRoot = getGitRoot(); // Current worktree root
  const mainWorktreeRoot = getMainWorktreeRoot(); // Main worktree root (for manifest location)
  const manifestPath = path.join(mainWorktreeRoot, argv.manifestFile);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found at ${manifestPath}`);
  }

  const sourceDir = argv.source ? path.resolve(argv.source) : gitRoot;

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(
      `Source directory does not exist or is not a directory: ${sourceDir}`
    );
  }

  const manifestLines = fs
    .readFileSync(manifestPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim());

  const seen = new Set<string>();
  const problems: string[] = [];
  let checkedCount = 0;

  for (const line of manifestLines) {
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (seen.has(line)) {
      problems.push(`Duplicate entry found in manifest: ${line}`);
      continue;
    }

    seen.add(line);
    checkedCount++;

    const absolutePath = path.join(sourceDir, line);
    if (!fs.existsSync(absolutePath)) {
      problems.push(`Missing source file: ${absolutePath}`);
      continue;
    }

    if (!isIgnored(absolutePath)) {
      problems.push(`File is not ignored by git: ${line}`);
    }
  }

  if (problems.length > 0) {
    console.error(colors.red(colors.bold('Manifest validation failed:')));
    for (const issue of problems) {
      console.error(colors.red(`  - ${issue}`));
    }
    throw new Error(`${problems.length} validation issue(s) detected.`);
  }

  console.log(
    colors.green(
      `Manifest ${argv.manifestFile} is valid. Checked ${checkedCount} entries.`
    )
  );
}
