/**
 * Isolates every test run from the developer's real global config, so
 * loadGlobalConfig() never reads ~/.config/git-worktree-tools/config.json.
 * e2e tests spawn the CLI with `...process.env` spread in, so overriding
 * here covers unit AND e2e subprocess env — no changes needed in src/e2e.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';

const isolatedConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwt-test-config-'));
process.env.XDG_CONFIG_HOME = isolatedConfigDir;
process.env.APPDATA = isolatedConfigDir; // Windows config path
process.env.LOCALAPPDATA = isolatedConfigDir; // Windows log/data path
process.env.GWT_ALLOW_LOCAL = process.env.GWT_ALLOW_LOCAL ?? '1';

function cleanupIsolatedConfigDir(): void {
  try {
    fs.rmSync(isolatedConfigDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup — ignore errors during teardown.
  }
}

// Clean up the isolated dir once this file's tests finish, otherwise
// /tmp/gwt-test-config-* accumulates on dev machines across every test run
// (one per vitest worker/file, since setupFiles run per file). Uses
// vitest's own afterAll hook rather than process.on('exit'): the default
// "forks" pool terminates workers via a hard kill at the end of a run,
// which does not reliably run Node's 'exit' handlers (verified — dirs
// persisted with process.on('exit') alone), whereas afterAll is driven by
// vitest's own test lifecycle and always runs.
afterAll(cleanupIsolatedConfigDir);

// Belt-and-braces: if this worker process *does* exit gracefully (e.g. a
// single-threaded/no-pool run), catch that path too. Harmless no-op if
// afterAll already cleaned up (rmSync with force: true tolerates a
// missing path).
process.on('exit', cleanupIsolatedConfigDir);
