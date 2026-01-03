import { spawnSync, type SpawnSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to compiled CLI scripts
 */
export const CLI_DIR = path.resolve(__dirname, '../../../dist/cli');

/**
 * Available CLI tools
 */
export type CliTool = 'newpr' | 'cleanpr' | 'lswt' | 'wtlink' | 'wtstate' | 'wtconfig';

/**
 * Result of a CLI execution
 */
export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

/**
 * Options for CLI execution
 */
export interface CliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeout?: number;
}

/**
 * Run a CLI command synchronously (non-interactive mode)
 *
 * @param tool - The CLI tool to run
 * @param args - Command line arguments
 * @param options - Execution options
 * @returns CLI execution result
 */
export function runCli(tool: CliTool, args: string[] = [], options: CliOptions = {}): CliResult {
  const scriptPath = path.join(CLI_DIR, `${tool}.js`);
  const startTime = Date.now();

  const spawnOptions: SpawnSyncOptions = {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    input: options.input,
    timeout: options.timeout || 30000,
    env: {
      ...process.env,
      ...options.env,
      FORCE_COLOR: '0', // Disable colors for consistent output
      NO_COLOR: '1', // Alternative color disable
    },
  };

  const result = spawnSync('node', [scriptPath, ...args], spawnOptions);

  return {
    stdout: result.stdout?.toString() || '',
    stderr: result.stderr?.toString() || '',
    exitCode: result.status ?? 1,
    duration: Date.now() - startTime,
  };
}

/**
 * Result of JSON CLI execution
 */
export interface JsonCliResult<T> {
  data: T | null;
  error: { code: string; message: string } | null;
  raw: CliResult;
}

/**
 * Extract JSON from CLI output that may contain both text and JSON
 *
 * The CLI tools output human-readable text followed by JSON.
 * This function finds and extracts the JSON portion.
 */
function extractJson(output: string): string | null {
  // Look for lines that start with { (JSON object)
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('{')) {
      // Found potential start of JSON, collect remaining lines
      const jsonCandidate = lines.slice(i).join('\n').trim();
      try {
        JSON.parse(jsonCandidate);
        return jsonCandidate;
      } catch {
        // Continue searching
      }
    }
  }

  // Fallback: try parsing the entire output
  try {
    JSON.parse(output.trim());
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Run a CLI command and parse JSON output
 *
 * @param tool - The CLI tool to run
 * @param args - Command line arguments (--json is added automatically)
 * @param options - Execution options
 * @returns Parsed JSON result
 */
export function runCliJson<T>(
  tool: CliTool,
  args: string[] = [],
  options: CliOptions = {}
): JsonCliResult<T> {
  // Add --json flag if not present
  const jsonArgs = args.includes('--json') ? args : [...args, '--json'];

  const raw = runCli(tool, jsonArgs, options);

  // Try to extract and parse JSON from stdout
  const jsonStr = extractJson(raw.stdout);

  if (!jsonStr) {
    return {
      data: null,
      error: {
        code: 'JSON_PARSE_ERROR',
        message: raw.stderr || 'No JSON found in output',
      },
      raw,
    };
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (parsed.success === false || parsed.error) {
      return {
        data: null,
        error: parsed.error || { code: 'UNKNOWN', message: parsed.message || 'Unknown error' },
        raw,
      };
    }

    return {
      data: parsed.data || parsed,
      error: null,
      raw,
    };
  } catch {
    return {
      data: null,
      error: {
        code: 'JSON_PARSE_ERROR',
        message: raw.stderr || raw.stdout || 'Failed to parse JSON output',
      },
      raw,
    };
  }
}

/**
 * Verify the CLI is built before running tests
 *
 * @throws Error if CLI is not built
 */
export function ensureCliBuild(): void {
  const testPath = path.join(CLI_DIR, 'newpr.js');

  if (!fs.existsSync(testPath)) {
    throw new Error(
      `CLI not built. Run "npm run build" before running e2e tests.\n` + `Expected: ${testPath}`
    );
  }
}

/**
 * Synchronous version of ensureCliBuild (same as ensureCliBuild, kept for compatibility)
 */
export function ensureCliBuildSync(): void {
  ensureCliBuild();
}

/**
 * Normalize paths for cross-platform comparison
 *
 * Handles:
 * - macOS symlinks (/var -> /private/var)
 * - Windows 8.3 short paths (RUNNER~1 -> runneradmin)
 * - Path separators
 */
export function normalizePath(p: string): string {
  try {
    return path.normalize(fs.realpathSync.native(p)).toLowerCase();
  } catch {
    return path.normalize(p).toLowerCase();
  }
}

/**
 * Compare two paths for equality across platforms
 */
export function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

/**
 * Normalize line endings to LF
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Check if GitHub CLI (gh) is available
 *
 * @returns true if gh CLI is installed and accessible
 */
export function isGhAvailable(): boolean {
  try {
    const result = spawnSync('gh', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Flag indicating if gh CLI is available (cached at module load)
 */
export const GH_AVAILABLE = isGhAvailable();
