/**
 * Assembles a `wt ai doctor` report from the per-provider probes, annotated
 * with a warning via `describeSelectionWarning()`.
 *
 * The `selected` provider is NOT re-derived from the probe data — it comes
 * straight from `AIProviderManager.getAutoSelectionPreview()`, which shares
 * the exact `orderedFactoriesForAuto()`/availability logic the manager uses
 * at generation time. This is deliberate: the manager has no `authenticated`
 * concept at all for CLI providers (only `commandExists`), so a doctor-only
 * selection function that also considered `authenticated` could report a
 * provider `auto` would never actually try. See provider-manager.ts.
 *
 * Deliberately a separate module from `doctor.ts`: `vi.mock('./doctor.js')`
 * does not intercept same-module internal calls, so `runDiagnostics` must
 * live outside `doctor.ts` for its test to mock the probes cleanly.
 */
import type { AIConfig, AIProviderName } from './types.js';
import { DEFAULT_AI_PROVIDER_PRIORITY } from './types.js';
import { resolveProviderModel, resolveProviderTimeout } from './config-resolvers.js';
import { AIProviderManager } from './provider-manager.js';
import {
  probeCodex,
  probeClaude,
  probeGeminiApi,
  probeOllama,
  describeSelectionWarning,
  type ProviderDiagnostic,
  type ProbeOptions,
} from './doctor.js';

export interface AiDoctorReport {
  configuredMode: AIProviderName;
  providers: ProviderDiagnostic[];
  selected: string | null;
  selectionReason: string;
  selectionWarning?: string;
}

const PROBES: Record<
  string,
  {
    displayName: string;
    probe: (options: ProbeOptions) => Promise<Partial<ProviderDiagnostic>>;
    fallbackTimeout?: number;
  }
> = {
  openai: { displayName: 'codex', probe: probeCodex },
  claude: { displayName: 'claude', probe: probeClaude },
  'gemini-api': { displayName: 'gemini-api', probe: probeGeminiApi },
  ollama: { displayName: 'ollama', probe: probeOllama, fallbackTimeout: 120_000 },
};

export async function runDiagnostics(
  config: AIConfig,
  options: ProbeOptions
): Promise<AiDoctorReport> {
  const priority = config.providerPriority ?? DEFAULT_AI_PROVIDER_PRIORITY;

  const providers: ProviderDiagnostic[] = [];
  for (const name of priority) {
    const spec = PROBES[name];
    if (!spec) continue; // e.g. the 'gemini' CLI or 'script' — no probe defined yet

    const partial = await spec.probe(options);
    providers.push({
      name,
      displayName: spec.displayName,
      installed: partial.installed ?? false,
      authenticated: partial.authenticated ?? 'unknown',
      reachable: partial.reachable ?? 'unknown',
      model: resolveProviderModel(config, name),
      timeoutMs: resolveProviderTimeout(config, name, spec.fallbackTimeout),
      error: partial.error,
    });
  }

  // The real answer: what the manager will actually pick, using the exact
  // same availability logic it uses at generation time.
  const manager = new AIProviderManager({ config });
  const { selected } = await manager.getAutoSelectionPreview();
  const selectedDiag = selected ? providers.find((p) => p.name === selected) : undefined;

  const selectionReason = selectedDiag
    ? `${selectedDiag.displayName} is next in priority order and passes auto's availability check`
    : "no provider in the priority list passes auto's availability check";

  return {
    configuredMode: config.provider ?? 'auto',
    providers,
    selected,
    selectionReason,
    selectionWarning: describeSelectionWarning(selectedDiag),
  };
}
