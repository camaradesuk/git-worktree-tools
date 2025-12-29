import fs from 'fs';
import path from 'path';
import { spawnSync, SpawnSyncOptions } from 'child_process';
import inquirer from 'inquirer';
import * as colors from '../colors.js';

// Type definition for the arguments passed to this command
export interface LinkArgv {
  source?: string;
  destination?: string;
  dryRun: boolean;
  manifestFile: string;
  type: 'hard' | 'symbolic';
  yes: boolean;
}

interface WorktreeEntry {
  path: string;
  branch?: string;
  isBare: boolean;
}

type ConflictStatus = 'safe' | 'already_linked' | 'conflict';
type ConflictResolution = 'replace' | 'ignore' | 'remove';

interface FileStatus {
  file: string;
  status: ConflictStatus;
  sourcePath: string;
  destPath: string;
}

interface ConflictReport {
  safe: FileStatus[];
  alreadyLinked: FileStatus[];
  conflicts: FileStatus[];
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

function parseWorktreeList(raw: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  const lines = raw.split('\n');
  let current: WorktreeEntry | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (current && current.path) {
        entries.push(current);
      }
      current = null;
      continue;
    }

    if (!current) {
      current = { path: '', isBare: false };
    }

    if (line.startsWith('worktree ')) {
      current.path = line.substring('worktree '.length).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring('branch '.length).trim();
    } else if (line === 'bare') {
      current.isBare = true;
    }
  }

  if (current && current.path) {
    entries.push(current);
  }

  return entries;
}

function detectSourceWorktree(destinationDir: string): string {
  const result = runGit(['worktree', 'list', '--porcelain']);
  if (result.code !== 0) {
    throw new Error(
      'Failed to inspect git worktrees automatically. Please specify the source path explicitly.'
    );
  }

  const worktrees = parseWorktreeList(result.stdout);
  const destinationResolved = path.resolve(destinationDir);
  const candidates = worktrees.filter(
    (wt) => path.resolve(wt.path) !== destinationResolved
  );

  if (candidates.length === 0) {
    throw new Error(
      'Unable to detect an alternate worktree to use as the source. Provide the source path explicitly.'
    );
  }

  const preferredBranches = ['main', 'master', 'develop'];
  const preferred = candidates.find((wt) => {
    if (!wt.branch) return false;
    const branchName = wt.branch.replace('refs/heads/', '');
    return preferredBranches.includes(branchName);
  });

  return path.resolve((preferred ?? candidates[0]).path);
}

function resolveWorktreePaths(
  argv: LinkArgv,
  currentRoot: string
): {
  sourceDir: string;
  destDir: string;
} {
  const destDir = argv.destination ? path.resolve(argv.destination) : currentRoot;

  const sourceDir = argv.source
    ? path.resolve(argv.source)
    : detectSourceWorktree(destDir);

  return { sourceDir, destDir };
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

  const output = typeof result.stdout === 'string' ? result.stdout : '';
  return output.trim().length > 0;
}

function isAlreadyLinked(sourcePath: string, destPath: string): boolean {
  try {
    if (!fs.existsSync(destPath)) {
      return false;
    }

    const sourceStats = fs.statSync(sourcePath);
    const destStats = fs.statSync(destPath);

    // Check if they're the same file (hard link) - same inode
    if (sourceStats.ino === destStats.ino && sourceStats.dev === destStats.dev) {
      return true;
    }

    // Check if destination is a symlink pointing to source
    const destLstats = fs.lstatSync(destPath);
    if (destLstats.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(destPath);
      const resolvedTarget = path.resolve(path.dirname(destPath), linkTarget);
      return resolvedTarget === sourcePath;
    }

    return false;
  } catch {
    return false;
  }
}

function detectConflicts(
  filesToLink: string[],
  sourceDir: string,
  destDir: string
): ConflictReport {
  const safe: FileStatus[] = [];
  const alreadyLinked: FileStatus[] = [];
  const conflicts: FileStatus[] = [];

  for (const file of filesToLink) {
    const sourcePath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);

    if (!fs.existsSync(sourcePath)) {
      // Source doesn't exist - skip (will be warned about later)
      continue;
    }

    if (!fs.existsSync(destPath)) {
      // No conflict - safe to link
      safe.push({ file, status: 'safe', sourcePath, destPath });
    } else if (isAlreadyLinked(sourcePath, destPath)) {
      // Already correctly linked - skip
      alreadyLinked.push({ file, status: 'already_linked', sourcePath, destPath });
    } else {
      // File exists and is different - conflict!
      conflicts.push({ file, status: 'conflict', sourcePath, destPath });
    }
  }

  return { safe, alreadyLinked, conflicts };
}

/**
 * Update manifest file by removing specified files
 */
function updateManifest(manifestPath: string, filesToRemove: string[]): void {
  const removeSet = new Set(filesToRemove);
  const lines = fs.readFileSync(manifestPath, 'utf-8').split('\n');
  const updatedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Keep empty lines and top-level comments
    if (!trimmed || (trimmed.startsWith('#') && !trimmed.match(/^#\s*[^#]/))) {
      updatedLines.push(line);
      continue;
    }

    // Check if this line is a file we want to remove
    let filePath = trimmed;
    if (trimmed.startsWith('#')) {
      // Extract file path from comment
      const match = trimmed.match(/^#\s*(?:TRACKED:|DELETED:|STALE:)?\s*(.+)/);
      if (match) {
        filePath = match[1].trim();
      }
    }

    if (!removeSet.has(filePath)) {
      updatedLines.push(line);
    }
  }

  fs.writeFileSync(manifestPath, updatedLines.join('\n'));
}

/**
 * Interactive conflict resolver - lets user decide how to handle each conflict
 * Returns a map of file paths to resolution actions
 */
async function interactiveConflictResolver(
  conflicts: FileStatus[],
  _sourceDir: string,
  _destDir: string
): Promise<Map<string, ConflictResolution>> {
  const resolutions = new Map<string, ConflictResolution>();
  const conflictFiles = conflicts.map((c) => c.file);

  // Build folder structure for conflicts
  const folders = new Set<string>();
  for (const file of conflictFiles) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
  }

  console.clear();
  console.log(
    colors.cyan(
      colors.bold(
        '\n╔═══════════════════════════════════════════════════════════════════════════════════════╗'
      )
    )
  );
  console.log(
    colors.cyan(colors.bold('║')) +
      colors.bold(
        '                           Conflict Resolution Required                                '
      ) +
      colors.cyan(colors.bold('║'))
  );
  console.log(
    colors.cyan(
      colors.bold(
        '╚═══════════════════════════════════════════════════════════════════════════════════════╝\n'
      )
    )
  );

  console.log(
    colors.yellow(
      'The following files exist at the destination with different content:\n'
    )
  );

  // Show conflicts grouped by folder
  const byFolder = new Map<string, string[]>();
  for (const file of conflictFiles) {
    const folder = path.dirname(file);
    if (!byFolder.has(folder)) {
      byFolder.set(folder, []);
    }
    byFolder.get(folder)!.push(file);
  }

  const sortedFolders = Array.from(byFolder.keys()).sort();
  for (const folder of sortedFolders) {
    const files = byFolder.get(folder)!;
    if (folder === '.') {
      console.log(colors.dim('  (root)'));
    } else {
      console.log(colors.dim(`  ${folder}/`));
    }
    for (const file of files) {
      console.log(colors.yellow(`    - ${path.basename(file)}`));
    }
    console.log('');
  }

  console.log(colors.bold('Resolution Options:'));
  console.log(
    colors.green('  R') +
      ' - Replace destination file (delete existing, create link)'
  );
  console.log(
    colors.blue('  I') + " - Ignore (keep destination file as-is, don't link)"
  );
  console.log(
    colors.red('  M') +
      " - Remove from manifest (won't link now or in future)"
  );
  console.log('');
  console.log(
    colors.dim(
      "Note: Setting a folder's resolution applies ONLY to conflicted files in that folder.\n"
    )
  );

  const answers = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'How do you want to resolve these conflicts?',
      choices: [
        {
          name: 'Resolve all conflicts the same way',
          value: 'bulk',
        },
        {
          name: 'Resolve each conflict individually',
          value: 'individual',
        },
      ],
    },
  ]);

  if (answers.action === 'bulk') {
    const bulkAnswers = await inquirer.prompt<{ resolution: ConflictResolution }>([
      {
        type: 'list',
        name: 'resolution',
        message: `Apply this resolution to all ${conflictFiles.length} conflicting files:`,
        choices: [
          { name: 'Replace all (overwrite destination files)', value: 'replace' },
          { name: 'Ignore all (keep destination files)', value: 'ignore' },
          { name: 'Remove all from manifest', value: 'remove' },
        ],
      },
    ]);

    for (const file of conflictFiles) {
      resolutions.set(file, bulkAnswers.resolution);
    }
  } else {
    // Individual resolution
    for (const conflict of conflicts) {
      const fileAnswers = await inquirer.prompt<{ resolution: ConflictResolution }>([
        {
          type: 'list',
          name: 'resolution',
          message: `${conflict.file}:`,
          choices: [
            { name: 'Replace (overwrite destination)', value: 'replace' },
            { name: 'Ignore (keep destination)', value: 'ignore' },
            { name: 'Remove from manifest', value: 'remove' },
          ],
        },
      ]);

      resolutions.set(conflict.file, fileAnswers.resolution);
    }
  }

  return resolutions;
}

export async function run(argv: LinkArgv): Promise<void> {
  checkGitInstalled();
  const gitRoot = getGitRoot(); // Current worktree root
  const mainWorktreeRoot = getMainWorktreeRoot(); // Main worktree root (for manifest location)
  const manifestFile = argv.manifestFile;
  const manifestPath = path.join(mainWorktreeRoot, manifestFile);

  const { sourceDir, destDir } = resolveWorktreePaths(argv, gitRoot);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found at ${manifestPath}`);
  }

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(
      `Source directory does not exist or is not a directory: ${sourceDir}`
    );
  }

  if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
    throw new Error(
      `Destination directory does not exist or is not a directory: ${destDir}`
    );
  }

  const filesToLink = fs
    .readFileSync(manifestPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (filesToLink.length === 0) {
    console.log(colors.yellow('Manifest is empty. Nothing to link.'));
    return;
  }

  console.log(`\nDetecting conflicts...`);

  // Detect conflicts BEFORE any linking
  const conflictReport = detectConflicts(filesToLink, sourceDir, destDir);

  console.log(colors.green(`✓ Scanned ${filesToLink.length} files`));

  // Handle conflicts interactively (if any)
  const resolutions = new Map<string, ConflictResolution>();
  const filesToRemoveFromManifest: string[] = [];

  if (conflictReport.conflicts.length > 0 && !argv.yes && !argv.dryRun) {
    console.log(
      colors.yellow(
        `\n⚠️  Found ${conflictReport.conflicts.length} conflicting files\n`
      )
    );
    console.log(colors.dim('Launching interactive conflict resolver...\n'));

    const resolverResult = await interactiveConflictResolver(
      conflictReport.conflicts,
      sourceDir,
      destDir
    );

    for (const [file, resolution] of resolverResult.entries()) {
      resolutions.set(file, resolution);
      if (resolution === 'remove') {
        filesToRemoveFromManifest.push(file);
      }
    }
  }

  // Build final lists of files to process
  const safeFiles = conflictReport.safe.map((s) => s.file);
  const replaceFiles: string[] = [];
  const ignoreFiles: string[] = [];

  for (const conflictFile of conflictReport.conflicts.map((c) => c.file)) {
    const resolution = resolutions.get(conflictFile);
    if (resolution === 'replace' || (argv.yes && !argv.dryRun)) {
      replaceFiles.push(conflictFile);
    } else if (resolution === 'ignore') {
      ignoreFiles.push(conflictFile);
    }
    // resolution === 'remove' already added to filesToRemoveFromManifest
  }

  const totalToLink = safeFiles.length + replaceFiles.length;

  // Show final confirmation prompt with summary
  if (!argv.yes && !argv.dryRun) {
    console.log(
      colors.cyan(colors.bold('\n═══════════════════════════════════════'))
    );
    console.log(colors.cyan(colors.bold('  Conflict Resolution Complete!')));
    console.log(
      colors.cyan(colors.bold('═══════════════════════════════════════\n'))
    );

    console.log(colors.bold('Summary:'));
    if (conflictReport.alreadyLinked.length > 0) {
      console.log(
        colors.dim(
          `  ✓ Already linked: ${conflictReport.alreadyLinked.length} files (will skip)`
        )
      );
    }
    if (replaceFiles.length > 0) {
      console.log(
        colors.yellow(
          `  ⚠  Replace: ${replaceFiles.length} files (will overwrite and link)`
        )
      );
    }
    if (ignoreFiles.length > 0) {
      console.log(
        colors.blue(
          `  ℹ  Ignore: ${ignoreFiles.length} files (will skip, keep destination)`
        )
      );
    }
    if (filesToRemoveFromManifest.length > 0) {
      console.log(
        colors.red(
          `  ✗ Remove: ${filesToRemoveFromManifest.length} files (removed from manifest)`
        )
      );
    }
    if (safeFiles.length > 0) {
      console.log(
        colors.green(`  ✓ Safe: ${safeFiles.length} files (no conflict)`)
      );
    }

    console.log('');
    console.log(colors.dim('  From: ') + colors.bold(sourceDir));
    console.log(colors.dim('  To:   ') + colors.bold(destDir));
    console.log(
      colors.dim('  Type: ') +
        colors.bold(argv.type === 'symbolic' ? 'symbolic links' : 'hard links')
    );
    console.log('');

    let message = `Proceed with linking ${totalToLink} files?`;
    if (replaceFiles.length > 0) {
      message += colors.yellow(
        ` (${replaceFiles.length} will overwrite existing files)`
      );
    }

    const confirmAnswers = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: 'confirm',
        name: 'proceed',
        message,
        default: false,
      },
    ]);

    if (!confirmAnswers.proceed) {
      console.log(colors.yellow('Operation cancelled.'));
      return;
    }
    console.log('');
  }

  // Update manifest if files were removed
  if (filesToRemoveFromManifest.length > 0) {
    updateManifest(manifestPath, filesToRemoveFromManifest);
    console.log(
      colors.red(
        `Updated manifest: removed ${filesToRemoveFromManifest.length} files\n`
      )
    );
  }

  let linkedCount = 0;
  let errorCount = 0;

  for (const file of filesToLink) {
    const sourcePath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);

    if (!fs.existsSync(sourcePath)) {
      console.warn(
        colors.yellow(`  - WARNING: Source file not found, skipping: ${sourcePath}`)
      );
      continue;
    }

    // CRITICAL SAFETY CHECK: Do not link files that are not git-ignored.
    if (!isIgnored(sourcePath)) {
      console.error(
        colors.red(
          colors.bold(
            `  - DANGER: File is not ignored by git, skipping for safety: ${file}`
          )
        )
      );
      errorCount++;
      continue;
    }

    if (argv.dryRun) {
      console.log(
        colors.cyan(`  - [DRY RUN] Would link: ${sourcePath} -> ${destPath}`)
      );
      linkedCount++;
      continue;
    }

    try {
      // Ensure the destination directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // If a file already exists at the destination, remove it before linking.
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }

      if (argv.type === 'symbolic') {
        fs.symlinkSync(sourcePath, destPath);
        console.log(colors.green(`  - Symlinked: ${file}`));
      } else {
        fs.linkSync(sourcePath, destPath);
        console.log(colors.green(`  - Hard-linked: ${file}`));
      }
      linkedCount++;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(colors.red(`  - ERROR linking ${file}: ${errorMessage}`));
      errorCount++;
    }
  }

  console.log('\n-------------------');
  console.log(
    colors.green(colors.bold(`Link process complete. Linked ${linkedCount} files.`))
  );
  if (errorCount > 0) {
    console.log(colors.red(colors.bold(`Encountered ${errorCount} errors.`)));
  }
}
