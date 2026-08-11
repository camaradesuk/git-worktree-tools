/**
 * `wt ai doctor` diagnostics.
 *
 * Split deliberately: the pure `pickAutoProvider()` mirrors what
 * AIProviderManager does at runtime (cheap availability check, not a live
 * probe) so the two cannot drift. The live-probe layer is separate.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ProviderDiagnostic {
  /** Config-facing identifier (e.g. 'openai'). */
  name: string;
  /** Human-facing label (e.g. 'codex'). */
  displayName: string;
  installed: boolean;
  authenticated: boolean | 'unknown';
  reachable: boolean | 'unknown';
  model: string | undefined;
  timeoutMs: number;
  /** Reachability failure detail, e.g. "HTTP 400: API_KEY_INVALID". */
  error?: string;
}

export interface AutoSelection {
  selected: string | null;
  reason: string;
  /** Set when the selected provider fails a deeper check than selection uses. */
  warning?: string;
}

/**
 * What `auto` would select given cheap availability data (installed +
 * authenticated !== false) — matching AIProviderManager.buildAutoChain()'s
 * criterion exactly, on purpose.
 */
export function pickAutoProvider(
  diagnostics: ProviderDiagnostic[],
  priority: string[]
): AutoSelection {
  const byName = new Map(diagnostics.map((d) => [d.name, d]));

  for (const name of priority) {
    const d = byName.get(name);
    if (!d) continue;
    if (!d.installed) continue;
    if (d.authenticated === false) continue;

    const warning =
      d.reachable === false
        ? `${d.displayName} is selected by auto, but a live reachability probe failed: ${d.error ?? 'unknown reason'}`
        : undefined;

    return {
      selected: d.name,
      reason: `${d.displayName} is installed${d.authenticated === true ? ' and authenticated' : ''}, first in priority order`,
      warning,
    };
  }

  return {
    selected: null,
    reason: 'no provider in the priority list is installed and authenticated',
  };
}

// --- Real per-provider probes -------------------------------------------
//
// `--offline` skips every live network/subprocess reachability call, which
// is what makes this testable without spending quota or touching a real
// provider. Ollama's /api/tags is free and local, so it always runs.

export interface ProbeOptions {
  /** Skip every live network/subprocess reachability call. */
  offline: boolean;
}

function commandInstalled(cmd: string): boolean {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
  return result.status === 0;
}

export async function probeCodex(options: ProbeOptions): Promise<Partial<ProviderDiagnostic>> {
  const installed = commandInstalled('codex');
  if (!installed) {
    return { installed: false, authenticated: 'unknown', reachable: 'unknown' };
  }

  // `codex login status` is a free, local, quota-free REAL check — distinct
  // from `reachable`, which proves auth + network + model actually answer.
  const statusResult = spawnSync('codex', ['login', 'status'], {
    encoding: 'utf-8',
    timeout: 10_000,
  });
  const authenticated =
    statusResult.status === 0 && !/not logged in/i.test(statusResult.stdout ?? '');

  if (options.offline || !authenticated) {
    return { installed: true, authenticated, reachable: 'unknown' };
  }

  const outputFile = path.join(
    os.tmpdir(),
    `gwt-doctor-codex-${process.pid}-${crypto.randomBytes(6).toString('hex')}.txt`
  );
  try {
    const result = spawnSync(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '--color',
        'never',
        '--output-last-message',
        outputFile,
        'Reply with exactly: OK',
      ],
      { encoding: 'utf-8', timeout: 20_000 }
    );
    const output = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf-8').trim() : '';
    const reachable = result.status === 0 && output.length > 0;
    return {
      installed: true,
      authenticated,
      reachable,
      error: reachable ? undefined : result.stderr || 'no output',
    };
  } catch (error) {
    return {
      installed: true,
      authenticated,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      if (fs.existsSync(outputFile)) fs.rmSync(outputFile, { force: true });
    } catch {
      // best effort
    }
  }
}

export async function probeClaude(options: ProbeOptions): Promise<Partial<ProviderDiagnostic>> {
  const installed = commandInstalled('claude');
  if (!installed) {
    return { installed: false, authenticated: 'unknown', reachable: 'unknown' };
  }

  // No free `claude auth status` equivalent exists, so stay honest.
  if (options.offline) {
    return { installed: true, authenticated: 'unknown', reachable: 'unknown' };
  }

  const result = spawnSync('claude', ['-p', 'Reply with exactly: OK'], {
    encoding: 'utf-8',
    timeout: 20_000,
  });
  const reachable = result.status === 0 && Boolean(result.stdout?.trim());
  return {
    installed: true,
    authenticated: reachable ? true : 'unknown',
    reachable,
    error: reachable ? undefined : result.stderr || 'no output',
  };
}

interface GeminiErrorBody {
  error?: {
    reason?: string;
    message?: string;
    /**
     * The REAL shape of a Gemini API error body (verified via a live curl
     * against this machine's actual invalid GEMINI_API_KEY): `reason` is
     * nested inside a `google.rpc.ErrorInfo` entry in `details[]`, not a
     * flat `error.reason` field.
     */
    details?: Array<{ reason?: string }>;
  };
}

/** Extract the machine-readable failure reason (e.g. "API_KEY_INVALID") from
 * a Gemini API error body, checking the real nested `details[]` shape first
 * and falling back to a flat `error.reason` in case Google ever simplifies
 * the response. */
function extractGeminiErrorReason(body: GeminiErrorBody | undefined): string | undefined {
  const fromDetails = body?.error?.details?.find((d) => typeof d?.reason === 'string')?.reason;
  return fromDetails ?? body?.error?.reason;
}

export async function probeGeminiApi(options: ProbeOptions): Promise<Partial<ProviderDiagnostic>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { installed: true, authenticated: false, reachable: 'unknown' };
  }
  if (options.offline) {
    return { installed: true, authenticated: true, reachable: 'unknown' };
  }

  // The probe this task exists for: catches an invalid key as HTTP 400
  // API_KEY_INVALID instead of Boolean(env) reporting "available".
  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }] }),
      }
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as GeminiErrorBody;
      const reason = extractGeminiErrorReason(body) ?? `HTTP ${response.status}`;
      return {
        installed: true,
        authenticated: true,
        reachable: false,
        error: `${reason}: ${body?.error?.message ?? 'request failed'}`,
      };
    }

    return { installed: true, authenticated: true, reachable: true };
  } catch (error) {
    return {
      installed: true,
      authenticated: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function probeOllama(
  _options: ProbeOptions,
  host = 'http://localhost:11434'
): Promise<Partial<ProviderDiagnostic>> {
  // Free and local — always runs, even offline.
  const result = spawnSync('curl', ['-s', `${host}/api/tags`], {
    encoding: 'utf-8',
    timeout: 5_000,
  });
  const reachable = result.status === 0;
  return { installed: reachable, authenticated: true, reachable };
}
