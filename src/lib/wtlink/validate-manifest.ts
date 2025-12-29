import fs from 'fs';
import path from 'path';
import * as colors from '../colors.js';
import * as git from '../git.js';

export interface ValidateArgv {
  manifestFile: string;
  source?: string;
}

export function run(argv: ValidateArgv): void {
  const gitRoot = git.getRepoRoot(); // Current worktree root
  const mainWorktreeRoot = git.getMainWorktreeRoot(); // Main worktree root (for manifest location)
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

    if (!git.isGitIgnored(absolutePath)) {
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
