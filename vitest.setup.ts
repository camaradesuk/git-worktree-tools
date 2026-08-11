/**
 * Isolates every test run from the developer's real global config, so
 * loadGlobalConfig() never reads ~/.config/git-worktree-tools/config.json.
 * e2e tests spawn the CLI with `...process.env` spread in, so overriding
 * here covers unit AND e2e subprocess env — no changes needed in src/e2e.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const isolatedConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwt-test-config-'));
process.env.XDG_CONFIG_HOME = isolatedConfigDir;
process.env.APPDATA = isolatedConfigDir; // Windows config path
process.env.LOCALAPPDATA = isolatedConfigDir; // Windows log/data path
process.env.GWT_ALLOW_LOCAL = process.env.GWT_ALLOW_LOCAL ?? '1';
