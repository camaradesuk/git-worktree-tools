#!/usr/bin/env node
/**
 * wtlink - Sync gitignored files between worktrees using symlinks
 *
 * Usage:
 *   wtlink                    Sync based on .worktreerc patterns
 *   wtlink <path>             Sync specific path
 *   wtlink --restore          Convert symlinks back to real files
 *   wtlink --list             List current symlinks
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import * as git from '../lib/git.js';
import * as colors from '../lib/colors.js';
import { loadConfig, WorktreeConfig } from '../lib/config.js';

interface WtlinkOptions {
  restore: boolean;
  list: boolean;
  dryRun: boolean;
  verbose: boolean;
  paths: string[];
}

function parseArgs(): WtlinkOptions {
  const args = process.argv.slice(2);
  const options: WtlinkOptions = {
    restore: false,
    list: false,
    dryRun: false,
    verbose: false,
    paths: [],
  };

  for (const arg of args) {
    switch (arg) {
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '-r':
      case '--restore':
        options.restore = true;
        break;
      case '-l':
      case '--list':
        options.list = true;
        break;
      case '-n':
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(colors.error(`Unknown option: ${arg}`));
          process.exit(1);
        }
        options.paths.push(arg);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
${colors.bold('wtlink')} - Sync gitignored files between worktrees using symlinks

${colors.bold('USAGE')}
  wtlink [options] [paths...]

${colors.bold('OPTIONS')}
  -r, --restore   Convert symlinks back to real files/directories
  -l, --list      List current symlinks in this worktree
  -n, --dry-run   Show what would be done without making changes
  -v, --verbose   Show detailed output
  -h, --help      Show this help message

${colors.bold('EXAMPLES')}
  wtlink                    # Sync all patterns from .worktreerc
  wtlink node_modules       # Sync only node_modules
  wtlink --restore          # Convert all symlinks back to real files
  wtlink --list             # Show current symlinks

${colors.bold('CONFIGURATION')}
  Add syncPatterns to .worktreerc in your repository root:

  {
    "syncPatterns": [
      "node_modules",
      ".env.local",
      "coverage",
      ".angular/cache"
    ]
  }

${colors.bold('HOW IT WORKS')}
  Creates symlinks (Unix) or junctions (Windows) from the main worktree
  to your current PR worktree. This saves disk space and ensures all
  worktrees share the same node_modules, caches, etc.

${colors.bold('NOTES')}
  - Only works in worktree directories (not the main repo)
  - Source must exist in main worktree
  - Existing files/dirs are backed up before linking
`);
}

/**
 * Check if we're on Windows
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Find the main (bare) worktree for this repo
 */
async function findMainWorktree(): Promise<string | null> {
  const worktrees = await git.listWorktrees();

  // The main worktree is typically the one that's not a linked worktree
  // We can identify it by checking if it contains .git as a directory (not file)
  for (const wt of worktrees) {
    const gitPath = path.join(wt.path, '.git');
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        return wt.path;
      }
    } catch {
      // .git doesn't exist or not accessible
    }
  }

  // Fallback: first worktree is usually main
  return worktrees.length > 0 ? worktrees[0].path : null;
}

/**
 * Check if a path is a symlink
 */
function isSymlink(targetPath: string): boolean {
  try {
    const stats = fs.lstatSync(targetPath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Check if path exists (not following symlinks)
 */
function exists(targetPath: string): boolean {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a symlink (Unix) or junction (Windows)
 */
function createLink(source: string, target: string, isDir: boolean): void {
  if (isWindows()) {
    // Use junction for directories on Windows (no admin rights needed)
    if (isDir) {
      execSync(`mklink /J "${target}" "${source}"`, {
        stdio: 'pipe',
        shell: 'cmd.exe',
      });
    } else {
      // For files, create a hard link or copy
      fs.copyFileSync(source, target);
    }
  } else {
    // Unix: use symlink
    fs.symlinkSync(source, target);
  }
}

/**
 * Remove a symlink
 */
function removeLink(targetPath: string): void {
  if (isWindows()) {
    const stats = fs.lstatSync(targetPath);
    if (stats.isDirectory()) {
      // Junction - use rmdir
      fs.rmdirSync(targetPath);
    } else {
      fs.unlinkSync(targetPath);
    }
  } else {
    fs.unlinkSync(targetPath);
  }
}

/**
 * Copy a directory recursively
 */
function copyDir(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * List all symlinks in the current directory (matching patterns)
 */
function listSymlinks(cwd: string, patterns: string[]): void {
  console.log('');
  console.log(colors.bold('Symlinks in current worktree:'));
  console.log('');

  let found = 0;

  for (const pattern of patterns) {
    const targetPath = path.join(cwd, pattern);

    if (isSymlink(targetPath)) {
      found++;
      const linkTarget = fs.readlinkSync(targetPath);
      console.log(`  ${colors.cyan(pattern)}`);
      console.log(`    → ${colors.dim(linkTarget)}`);
      console.log('');
    }
  }

  // Also check for any symlinks not in patterns
  const checkForOtherSymlinks = (dir: string, prefix: string = ''): void => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        // Skip node_modules subdirs to avoid huge output
        if (entry.name === 'node_modules' && prefix) continue;

        if (isSymlink(fullPath) && !patterns.includes(relativePath)) {
          found++;
          const linkTarget = fs.readlinkSync(fullPath);
          console.log(`  ${colors.yellow(relativePath)} ${colors.dim('(not in config)')}`);
          console.log(`    → ${colors.dim(linkTarget)}`);
          console.log('');
        }
      }
    } catch {
      // Skip directories we can't read
    }
  };

  // Only check top-level for other symlinks
  checkForOtherSymlinks(cwd);

  if (found === 0) {
    console.log(colors.dim('  No symlinks found.'));
    console.log('');
  } else {
    console.log(colors.dim(`Total: ${found} symlinks`));
    console.log('');
  }
}

/**
 * Sync a single path from main worktree to current
 */
function syncPath(
  pattern: string,
  mainWorktree: string,
  currentWorktree: string,
  options: WtlinkOptions
): boolean {
  const sourcePath = path.join(mainWorktree, pattern);
  const targetPath = path.join(currentWorktree, pattern);

  // Check if source exists
  if (!exists(sourcePath)) {
    if (options.verbose) {
      console.log(colors.dim(`  Skipping ${pattern} (not found in main worktree)`));
    }
    return false;
  }

  // Check if target is already a symlink pointing to source
  if (isSymlink(targetPath)) {
    try {
      const linkTarget = fs.readlinkSync(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
      if (resolvedTarget === sourcePath) {
        if (options.verbose) {
          console.log(colors.dim(`  ${pattern} already linked`));
        }
        return true;
      }
      // Different target - remove and recreate
      if (options.dryRun) {
        console.log(colors.info(`Would update link: ${pattern}`));
        return true;
      }
      removeLink(targetPath);
    } catch {
      // Error reading link - remove and recreate
      if (!options.dryRun) {
        removeLink(targetPath);
      }
    }
  }

  // Check if target exists as regular file/dir
  if (exists(targetPath) && !isSymlink(targetPath)) {
    // Backup existing
    const backupPath = `${targetPath}.wtlink-backup`;

    if (options.dryRun) {
      console.log(colors.info(`Would backup and link: ${pattern}`));
      return true;
    }

    if (exists(backupPath)) {
      // Remove old backup
      fs.rmSync(backupPath, { recursive: true, force: true });
    }

    console.log(colors.warning(`  Backing up existing ${pattern}...`));
    fs.renameSync(targetPath, backupPath);
  }

  // Create parent directory if needed
  const parentDir = path.dirname(targetPath);
  if (!exists(parentDir)) {
    if (!options.dryRun) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  // Determine if source is directory
  const sourceStats = fs.statSync(sourcePath);
  const isDir = sourceStats.isDirectory();

  if (options.dryRun) {
    console.log(colors.info(`Would link: ${pattern}`));
    return true;
  }

  // Create the link
  try {
    createLink(sourcePath, targetPath, isDir);
    console.log(colors.success(`  Linked ${pattern}`));
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(colors.error(`  Failed to link ${pattern}: ${message}`));
    return false;
  }
}

/**
 * Restore a symlink back to a real file/directory
 */
function restorePath(
  pattern: string,
  currentWorktree: string,
  options: WtlinkOptions
): boolean {
  const targetPath = path.join(currentWorktree, pattern);

  if (!isSymlink(targetPath)) {
    if (options.verbose) {
      console.log(colors.dim(`  ${pattern} is not a symlink`));
    }
    return false;
  }

  const linkTarget = fs.readlinkSync(targetPath);
  const resolvedSource = path.resolve(path.dirname(targetPath), linkTarget);

  if (!exists(resolvedSource)) {
    console.log(colors.warning(`  ${pattern}: Link target doesn't exist`));
    return false;
  }

  if (options.dryRun) {
    console.log(colors.info(`Would restore: ${pattern}`));
    return true;
  }

  // Remove symlink
  removeLink(targetPath);

  // Copy source to target
  const sourceStats = fs.statSync(resolvedSource);
  if (sourceStats.isDirectory()) {
    copyDir(resolvedSource, targetPath);
  } else {
    fs.copyFileSync(resolvedSource, targetPath);
  }

  console.log(colors.success(`  Restored ${pattern}`));
  return true;
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Find repo root
  const repoRoot = git.getRepoRoot();
  if (!repoRoot) {
    console.error(colors.error('Not in a git repository.'));
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig(repoRoot);

  // Determine patterns to sync
  let patterns: string[] = options.paths;
  if (patterns.length === 0) {
    patterns = config.syncPatterns || [];
  }

  if (patterns.length === 0 && !options.list) {
    console.log(colors.warning('No sync patterns specified.'));
    console.log(colors.dim('Add syncPatterns to .worktreerc or specify paths as arguments.'));
    console.log('');
    console.log('Example .worktreerc:');
    console.log(colors.dim('  {'));
    console.log(colors.dim('    "syncPatterns": ["node_modules", ".env.local"]'));
    console.log(colors.dim('  }'));
    console.log('');
    process.exit(0);
  }

  // List mode
  if (options.list) {
    listSymlinks(repoRoot, patterns);
    return;
  }

  // Find main worktree
  const mainWorktree = await findMainWorktree();
  if (!mainWorktree) {
    console.error(colors.error('Could not find main worktree.'));
    process.exit(1);
  }

  const currentWorktree = repoRoot;

  // Check if we're in the main worktree
  if (path.resolve(currentWorktree) === path.resolve(mainWorktree)) {
    console.error(colors.error('Cannot run wtlink in the main worktree.'));
    console.error(colors.dim('Switch to a PR worktree first.'));
    process.exit(1);
  }

  console.log('');

  if (options.dryRun) {
    console.log(colors.yellow('DRY RUN - No changes will be made'));
    console.log('');
  }

  if (options.restore) {
    console.log(colors.bold('Restoring symlinks to real files...'));
    console.log(colors.dim(`Main worktree: ${mainWorktree}`));
    console.log(colors.dim(`Current worktree: ${currentWorktree}`));
    console.log('');

    let restored = 0;
    for (const pattern of patterns) {
      if (restorePath(pattern, currentWorktree, options)) {
        restored++;
      }
    }

    console.log('');
    console.log(colors.success(`Restored ${restored} of ${patterns.length} patterns.`));
  } else {
    console.log(colors.bold('Syncing files from main worktree...'));
    console.log(colors.dim(`Main worktree: ${mainWorktree}`));
    console.log(colors.dim(`Current worktree: ${currentWorktree}`));
    console.log('');

    let synced = 0;
    for (const pattern of patterns) {
      if (syncPath(pattern, mainWorktree, currentWorktree, options)) {
        synced++;
      }
    }

    console.log('');
    console.log(colors.success(`Synced ${synced} of ${patterns.length} patterns.`));
  }

  console.log('');
}

main().catch((err) => {
  console.error(colors.error(`Error: ${err.message}`));
  process.exit(1);
});
