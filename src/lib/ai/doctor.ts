/**
 * `wt ai doctor` diagnostics.
 *
 * The doctor's *selection* answer (what `auto` will really pick) comes
 * directly from `AIProviderManager.getAutoSelectionPreview()` — see
 * `doctor-report.ts` — so it can never drift from the real selection logic.
 * This module supplies the richer, live-probed diagnostic data used to
 * *annotate* that answer (`describeSelectionWarning()`) plus the real
 * per-provider probes themselves.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { commandExists } from './cli-provider.js';
import { extractGeminiErrorReason, type GeminiErrorBody } from './gemini-error.js';

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

/**
 * Build a warning to attach to the manager's real `auto` selection when the
 * selected provider's own live diagnostic shows a deeper problem than the
 * manager's own (cheap, availability-only) check can see — e.g. codex is
 * `commandExists`-installed but not logged in, or a live reachability probe
 * failed. Returns `undefined` when there's nothing to warn about.
 *
 * Deliberately does NOT re-derive *which* provider is selected — that used
 * to live here (as `pickAutoProvider`), duplicating the manager's own
 * availability semantics (and subtly diverging from them: the manager has
 * no `authenticated` concept at all for CLI providers, so a doctor-only
 * auth filter could report a provider `auto` would never actually try).
 * Selection now comes from `AIProviderManager.getAutoSelectionPreview()`.
 */
export function describeSelectionWarning(
  selectedDiagnostic: ProviderDiagnostic | undefined
): string | undefined {
  if (!selectedDiagnostic) return undefined;

  if (selectedDiagnostic.reachable === false) {
    return `auto selects ${selectedDiagnostic.displayName}, but a live reachability probe failed: ${selectedDiagnostic.error ?? 'unknown reason'}`;
  }
  if (selectedDiagnostic.authenticated === false) {
    return `auto selects ${selectedDiagnostic.displayName}, but it does not appear to be authenticated`;
  }
  return undefined;
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

export async function probeCodex(options: ProbeOptions): Promise<Partial<ProviderDiagnostic>> {
  const installed = commandExists('codex');
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
  const installed = commandExists('claude');
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
