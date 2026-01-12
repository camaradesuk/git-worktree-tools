import fs from 'fs';
import path from 'path';
import * as colors from '../colors.js';
import * as git from '../git.js';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';
import { loadManifestData } from './config-manifest.js';

export interface ValidateArgv {
  manifestFile: string;
  source?: string;
}

export interface ValidationResult {
  problems: string[];
  checkedCount: number;
  duplicates: string[];
  missingFiles: string[];
  notIgnored: string[];
}

/**
 * Find duplicate entries in manifest content
 */
export function findDuplicates(manifestContent: string): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const rawLine of manifestContent.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (seen.has(line)) {
      duplicates.push(line);
    } else {
      seen.add(line);
    }
  }

  return duplicates;
}

/**
 * Count active (non-comment) entries in manifest content
 */
export function countActiveEntries(manifestContent: string): number {
  let count = 0;

  for (const rawLine of manifestContent.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    count++;
  }

  return count;
}

/**
 * Get active entries from manifest content (non-comment, non-empty lines)
 */
export function getActiveEntries(manifestContent: string): string[] {
  const entries: string[] = [];

  for (const rawLine of manifestContent.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    entries.push(line);
  }

  return entries;
}

/**
 * Find files that are missing from the source directory
 */
export function findMissingFiles(
  entries: string[],
  sourceDir: string,
  fileExists: (path: string) => boolean = fs.existsSync
): string[] {
  const missing: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(sourceDir, entry);
    if (!fileExists(absolutePath)) {
      missing.push(entry);
    }
  }

  return missing;
}

/**
 * Validate manifest content and return validation results
 */
export function validateManifestContent(
  manifestContent: string,
  sourceDir: string,
  fileExists: (path: string) => boolean = fs.existsSync,
  isGitIgnored: (path: string, cwd?: string) => boolean = git.isGitIgnored
): ValidationResult {
  const problems: string[] = [];
  const duplicates = findDuplicates(manifestContent);
  const entries = getActiveEntries(manifestContent);
  const seen = new Set<string>();
  const missingFiles: string[] = [];
  const notIgnored: string[] = [];
  let checkedCount = 0;

  // Add duplicate problems
  for (const dup of duplicates) {
    problems.push(`Duplicate entry found in manifest: ${dup}`);
  }

  // Check each entry
  for (const entry of entries) {
    if (seen.has(entry)) {
      continue; // Skip duplicates, already reported
    }
    seen.add(entry);
    checkedCount++;

    const absolutePath = path.join(sourceDir, entry);
    if (!fileExists(absolutePath)) {
      problems.push(`Missing source file: ${absolutePath}`);
      missingFiles.push(entry);
      continue;
    }

    if (!isGitIgnored(absolutePath, sourceDir)) {
      problems.push(`File is not ignored by git: ${entry}`);
      notIgnored.push(entry);
    }
  }

  return { problems, checkedCount, duplicates, missingFiles, notIgnored };
}

export function run(argv: ValidateArgv): void {
  const gitRoot = git.getRepoRoot(); // Current worktree root
  const mainWorktreeRoot = git.getMainWorktreeRoot(); // Main worktree root (for manifest location)

  const sourceDir = argv.source ? path.resolve(argv.source) : gitRoot;

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source directory does not exist or is not a directory: ${sourceDir}`);
  }

  let manifestContent: string;
  let manifestLabel: string;

  // Determine if using default manifest file (config-based) or custom file (legacy)
  if (argv.manifestFile === DEFAULT_MANIFEST_FILE) {
    // Use config-manifest adapter
    const manifestData = loadManifestData(mainWorktreeRoot);

    if (manifestData.source === 'empty') {
      throw new Error(
        'No manifest found. Run `wtlink manage` to configure files to sync, or create a .worktreerc with a wtlink section.'
      );
    }

    // Convert to manifest content format for validation
    // Only validate enabled files (disabled are intentionally not linked)
    manifestContent = manifestData.enabled.join('\n');
    manifestLabel =
      manifestData.source === 'config' ? 'wtlink config in .worktreerc' : argv.manifestFile;
  } else {
    // Legacy behavior for custom manifest files
    const manifestPath = path.join(mainWorktreeRoot, argv.manifestFile);

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found at ${manifestPath}`);
    }

    manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    manifestLabel = argv.manifestFile;
  }

  const result = validateManifestContent(manifestContent, sourceDir);

  if (result.problems.length > 0) {
    console.error(colors.red(colors.bold('Manifest validation failed:')));
    for (const issue of result.problems) {
      console.error(colors.red(`  - ${issue}`));
    }
    throw new Error(`${result.problems.length} validation issue(s) detected.`);
  }

  console.log(
    colors.green(`Manifest ${manifestLabel} is valid. Checked ${result.checkedCount} entries.`)
  );
}
