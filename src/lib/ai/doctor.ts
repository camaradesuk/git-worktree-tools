/**
 * `wt ai doctor` diagnostics.
 *
 * Split deliberately: the pure `pickAutoProvider()` mirrors what
 * AIProviderManager does at runtime (cheap availability check, not a live
 * probe) so the two cannot drift. The live-probe layer is separate.
 */

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
