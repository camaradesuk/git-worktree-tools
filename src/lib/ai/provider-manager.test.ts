/**
 * AI Provider Manager Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AIProviderManager,
  createAIProviderManager,
  getDefaultAIProviderManager,
} from './provider-manager.js';
import type { AIConfig, AIProvider, AIGenerationResult } from './types.js';

// Mock the provider modules with static checkAvailability methods
vi.mock('./cli-provider.js', () => {
  const createMockProviderClass = () => {
    const MockClass = vi.fn() as ReturnType<typeof vi.fn> & {
      checkAvailability: ReturnType<typeof vi.fn>;
    };
    MockClass.checkAvailability = vi.fn().mockResolvedValue(true);
    return MockClass;
  };
  return {
    ClaudeProvider: createMockProviderClass(),
    GeminiProvider: createMockProviderClass(),
    OllamaProvider: createMockProviderClass(),
    OpenAIProvider: createMockProviderClass(),
    ScriptProvider: vi.fn(),
  };
});

vi.mock('./gemini-api-provider.js', () => {
  const MockClass = vi.fn() as ReturnType<typeof vi.fn> & {
    checkAvailability: ReturnType<typeof vi.fn>;
  };
  MockClass.checkAvailability = vi.fn().mockResolvedValue(true);
  return { GeminiAPIProvider: MockClass };
});

vi.mock('./fallback-provider.js', () => ({
  FallbackProvider: vi.fn(),
}));

import { ClaudeProvider, GeminiProvider, OllamaProvider, OpenAIProvider } from './cli-provider.js';
import { GeminiAPIProvider } from './gemini-api-provider.js';
import { FallbackProvider } from './fallback-provider.js';

describe('provider-manager', () => {
  const mockProvider = (
    name: string,
    available: boolean,
    result?: AIGenerationResult
  ): AIProvider => ({
    name,
    isAvailable: vi.fn().mockResolvedValue(available),
    generateBranchName: vi
      .fn()
      .mockResolvedValue(result ?? { success: true, content: 'test-branch', provider: name }),
    generatePRTitle: vi
      .fn()
      .mockResolvedValue(result ?? { success: true, content: 'Test PR', provider: name }),
    generatePRDescription: vi
      .fn()
      .mockResolvedValue(result ?? { success: true, content: 'Test description', provider: name }),
    generateCommitMessage: vi
      .fn()
      .mockResolvedValue(result ?? { success: true, content: 'test commit', provider: name }),
    generatePlanDocument: vi
      .fn()
      .mockResolvedValue(result ?? { success: true, content: '# Plan', provider: name }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state
    vi.resetModules();
    // Reset static checkAvailability mocks to default (return true)
    (
      GeminiAPIProvider as unknown as { checkAvailability: ReturnType<typeof vi.fn> }
    ).checkAvailability = vi.fn().mockResolvedValue(true);
    (
      ClaudeProvider as unknown as { checkAvailability: ReturnType<typeof vi.fn> }
    ).checkAvailability = vi.fn().mockResolvedValue(true);
    (
      GeminiProvider as unknown as { checkAvailability: ReturnType<typeof vi.fn> }
    ).checkAvailability = vi.fn().mockResolvedValue(true);
    (
      OllamaProvider as unknown as { checkAvailability: ReturnType<typeof vi.fn> }
    ).checkAvailability = vi.fn().mockResolvedValue(true);
    (
      OpenAIProvider as unknown as { checkAvailability: ReturnType<typeof vi.fn> }
    ).checkAvailability = vi.fn().mockResolvedValue(true);
  });

  describe('AIProviderManager', () => {
    describe('constructor', () => {
      it('creates manager with default config', () => {
        const manager = new AIProviderManager();
        const config = manager.getConfig();

        // Default config has AI disabled
        expect(config.provider).toBe('none');
        expect(config.branchName).toBe(false);
        expect(config.prTitle).toBe(false);
        expect(config.prDescription).toBe(false);
      });

      it('creates manager with custom config', () => {
        const manager = new AIProviderManager({
          config: {
            provider: 'claude',
            branchName: false,
            prTitle: true,
            prDescription: false,
            commitMessage: true,
            planDocument: false,
          },
        });
        const config = manager.getConfig();

        expect(config.provider).toBe('claude');
        expect(config.branchName).toBe(false);
        expect(config.prTitle).toBe(true);
        expect(config.prDescription).toBe(false);
      });
    });

    describe('initialize', () => {
      it('auto mode picks codex (config key "openai") first by default', async () => {
        const codexProvider = mockProvider('codex', true);
        vi.mocked(OpenAIProvider).mockImplementation(
          () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'auto' } });
        await manager.initialize();

        expect(await manager.getActiveProviderName()).toBe('codex');
      });

      it('auto mode falls through to ollama when codex, claude and gemini-api are unavailable', async () => {
        const ollamaProvider = mockProvider('ollama', true);
        vi.mocked(OllamaProvider).mockImplementation(
          () => ollamaProvider as unknown as InstanceType<typeof OllamaProvider>
        );
        (
          OpenAIProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);
        (
          ClaudeProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);
        (
          GeminiAPIProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);

        const manager = new AIProviderManager({ config: { provider: 'auto' } });
        await manager.initialize();

        expect(await manager.getActiveProviderName()).toBe('ollama');
      });

      it('respects a custom ai.providerPriority order', async () => {
        const ollamaProvider = mockProvider('ollama', true);
        vi.mocked(OllamaProvider).mockImplementation(
          () => ollamaProvider as unknown as InstanceType<typeof OllamaProvider>
        );

        const manager = new AIProviderManager({
          config: { provider: 'auto', providerPriority: ['ollama', 'claude'] },
        });
        await manager.initialize();

        expect(await manager.getActiveProviderName()).toBe('ollama');
      });

      it('initializes specific provider when configured', async () => {
        const openaiProvider = mockProvider('openai', true);
        vi.mocked(OpenAIProvider).mockImplementation(
          () => openaiProvider as unknown as InstanceType<typeof OpenAIProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'openai' } });
        await manager.initialize();

        const providerName = await manager.getActiveProviderName();
        expect(providerName).toBe('openai');
      });

      it('initializes fallback provider when configured', async () => {
        const claudeProvider = mockProvider('claude', true);
        const ollamaProvider = mockProvider('ollama', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        vi.mocked(OllamaProvider).mockImplementation(
          () => ollamaProvider as unknown as InstanceType<typeof OllamaProvider>
        );

        const manager = new AIProviderManager({
          config: { provider: 'claude', fallback: 'ollama' },
        });
        await manager.initialize();

        expect(ClaudeProvider).toHaveBeenCalled();
        expect(OllamaProvider).toHaveBeenCalled();
      });

      it('only initializes once', async () => {
        const claudeProvider = mockProvider('claude', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        await manager.initialize();
        await manager.initialize();

        expect(ClaudeProvider).toHaveBeenCalledTimes(1);
      });
    });

    describe('auto-mode fallthrough on failure', () => {
      it('advances past a provider that is available but returns success:false', async () => {
        const codexProvider = mockProvider('codex', true, {
          success: false,
          error: 'Codex CLI error: exit 1',
          provider: 'codex',
        });
        const claudeProvider = mockProvider('claude', true, {
          success: true,
          content: 'feat/from-claude',
          provider: 'claude',
        });
        vi.mocked(OpenAIProvider).mockImplementation(
          () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
        );
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'auto' } });
        const result = await manager.generateBranchName({
          description: 'x',
          repoName: 'r',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('feat/from-claude');
        expect(codexProvider.generateBranchName).toHaveBeenCalled();
        expect(claudeProvider.generateBranchName).toHaveBeenCalled();
      });

      it('walks the FULL chain, not just primary+1', async () => {
        const codexProvider = mockProvider('codex', true, {
          success: false,
          error: 'e1',
          provider: 'codex',
        });
        const claudeProvider = mockProvider('claude', true, {
          success: false,
          error: 'e2',
          provider: 'claude',
        });
        const geminiApiProvider = mockProvider('gemini-api', true, {
          success: true,
          content: 'feat/from-gemini-api',
          provider: 'gemini-api',
        });
        vi.mocked(OpenAIProvider).mockImplementation(
          () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
        );
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        vi.mocked(GeminiAPIProvider).mockImplementation(
          () => geminiApiProvider as unknown as InstanceType<typeof GeminiAPIProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'auto' } });
        const result = await manager.generateBranchName({
          description: 'x',
          repoName: 'r',
          branchPrefix: 'feat',
        });

        expect(result.content).toBe('feat/from-gemini-api');
      });

      it('reports the LAST failure when every candidate fails', async () => {
        const codexProvider = mockProvider('codex', true, {
          success: false,
          error: 'codex broke',
          provider: 'codex',
        });
        const claudeProvider = mockProvider('claude', true, {
          success: false,
          error: 'claude broke',
          provider: 'claude',
        });
        vi.mocked(OpenAIProvider).mockImplementation(
          () => codexProvider as unknown as InstanceType<typeof OpenAIProvider>
        );
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        (
          GeminiAPIProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);
        (
          OllamaProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);

        const manager = new AIProviderManager({ config: { provider: 'auto' } });
        const result = await manager.generateBranchName({
          description: 'x',
          repoName: 'r',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('claude broke');
        expect(result.provider).toBe('claude');
      });

      it('preserves explicit-fallback behaviour for non-auto provider + fallback config', async () => {
        const claudeProvider = mockProvider('claude', true, {
          success: false,
          error: 'API error',
          provider: 'claude',
        });
        const geminiProvider = mockProvider('gemini', true, {
          success: true,
          content: 'fallback-branch',
          provider: 'gemini',
        });
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        vi.mocked(GeminiProvider).mockImplementation(
          () => geminiProvider as unknown as InstanceType<typeof GeminiProvider>
        );

        const manager = new AIProviderManager({
          config: { provider: 'claude', fallback: 'gemini' },
        });
        const result = await manager.generateBranchName({
          description: 'x',
          repoName: 'r',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('fallback-branch');
      });
    });

    describe('table-driven auto selection', () => {
      const CASES: Array<{
        name: string;
        available: Record<'openai' | 'claude' | 'gemini-api' | 'ollama', boolean>;
        expectedWinner: string | null;
      }> = [
        {
          name: 'all available -> codex wins',
          available: { openai: true, claude: true, 'gemini-api': true, ollama: true },
          expectedWinner: 'codex',
        },
        {
          name: 'codex down -> claude wins',
          available: { openai: false, claude: true, 'gemini-api': true, ollama: true },
          expectedWinner: 'claude',
        },
        {
          name: 'codex+claude down -> gemini-api wins',
          available: { openai: false, claude: false, 'gemini-api': true, ollama: true },
          expectedWinner: 'gemini-api',
        },
        {
          name: 'only ollama available -> ollama wins',
          available: { openai: false, claude: false, 'gemini-api': false, ollama: true },
          expectedWinner: 'ollama',
        },
        {
          name: 'nothing available -> no winner',
          available: { openai: false, claude: false, 'gemini-api': false, ollama: false },
          expectedWinner: null,
        },
      ];

      it.each(CASES)('$name', async ({ available, expectedWinner }) => {
        (
          OpenAIProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(available.openai);
        (
          ClaudeProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(available.claude);
        (
          GeminiAPIProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(available['gemini-api']);
        (
          OllamaProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(available.ollama);

        if (available.openai) {
          vi.mocked(OpenAIProvider).mockImplementation(
            () => mockProvider('codex', true) as unknown as InstanceType<typeof OpenAIProvider>
          );
        }
        if (available.claude) {
          vi.mocked(ClaudeProvider).mockImplementation(
            () => mockProvider('claude', true) as unknown as InstanceType<typeof ClaudeProvider>
          );
        }
        if (available['gemini-api']) {
          vi.mocked(GeminiAPIProvider).mockImplementation(
            () =>
              mockProvider('gemini-api', true) as unknown as InstanceType<typeof GeminiAPIProvider>
          );
        }
        if (available.ollama) {
          vi.mocked(OllamaProvider).mockImplementation(
            () => mockProvider('ollama', true) as unknown as InstanceType<typeof OllamaProvider>
          );
        }

        const manager = new AIProviderManager({ config: { provider: 'auto' } });
        await manager.initialize();
        // Always call the real manager — including for the "nothing
        // available" row — so this row exercises actual behaviour instead of
        // comparing a literal to itself. With no auto-chain candidate and no
        // ai.fallback configured, getActiveProviderName() falls through to
        // the string 'fallback' (see provider-manager.ts).
        const winner = await manager.getActiveProviderName();
        expect(winner).toBe(expectedWinner ?? 'fallback');
      });
    });

    describe('getProvider', () => {
      it('returns primary provider when available', async () => {
        const claudeProvider = mockProvider('claude', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        const provider = await manager.getProvider();

        expect(provider.name).toBe('claude');
      });

      it('returns fallback provider when primary unavailable', async () => {
        const claudeProvider = mockProvider('claude', false);
        const geminiProvider = mockProvider('gemini', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        vi.mocked(GeminiProvider).mockImplementation(
          () => geminiProvider as unknown as InstanceType<typeof GeminiProvider>
        );
        // Mock static checkAvailability for lazy initialization
        (
          ClaudeProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);
        (
          GeminiProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(true);

        const manager = new AIProviderManager({
          config: { provider: 'claude', fallback: 'gemini' },
        });
        const provider = await manager.getProvider();

        expect(provider.name).toBe('gemini');
      });

      it('returns FallbackProvider when no providers available', async () => {
        const claudeProvider = mockProvider('claude', false);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        // Mock static checkAvailability for lazy initialization
        (
          ClaudeProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);

        const fallbackProvider = mockProvider('fallback', true);
        vi.mocked(FallbackProvider).mockImplementation(
          () => fallbackProvider as unknown as InstanceType<typeof FallbackProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        const provider = await manager.getProvider();

        expect(provider.name).toBe('fallback');
      });
    });

    describe('isEnabled', () => {
      it('returns true for enabled features', () => {
        const manager = new AIProviderManager({
          config: { branchName: true, prTitle: false },
        });

        expect(manager.isEnabled('branchName')).toBe(true);
        expect(manager.isEnabled('prTitle')).toBe(false);
      });
    });

    describe('generation methods', () => {
      it('generateBranchName uses provider', async () => {
        const claudeProvider = mockProvider('claude', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        const result = await manager.generateBranchName({
          description: 'Add feature',
          repoName: 'test-repo',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(true);
        expect(claudeProvider.generateBranchName).toHaveBeenCalled();
      });

      it('generatePRTitle uses provider', async () => {
        const claudeProvider = mockProvider('claude', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        const result = await manager.generatePRTitle({
          description: 'Add feature',
          branchName: 'feat/add-feature',
          baseBranch: 'main',
        });

        expect(result.success).toBe(true);
        expect(claudeProvider.generatePRTitle).toHaveBeenCalled();
      });

      it('generatePRDescription uses provider', async () => {
        const claudeProvider = mockProvider('claude', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        const result = await manager.generatePRDescription({
          description: 'Add feature',
          branchName: 'feat/add-feature',
          baseBranch: 'main',
        });

        expect(result.success).toBe(true);
        expect(claudeProvider.generatePRDescription).toHaveBeenCalled();
      });

      it('generateCommitMessage uses provider', async () => {
        const claudeProvider = mockProvider('claude', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        const result = await manager.generateCommitMessage({
          stagedFiles: ['src/index.ts'],
          style: 'conventional',
        });

        expect(result.success).toBe(true);
        expect(claudeProvider.generateCommitMessage).toHaveBeenCalled();
      });

      it('generatePlanDocument uses provider', async () => {
        const claudeProvider = mockProvider('claude', true);
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );

        const manager = new AIProviderManager({ config: { provider: 'claude' } });
        const result = await manager.generatePlanDocument({
          description: 'Add feature',
          branchName: 'feat/add-feature',
        });

        expect(result.success).toBe(true);
        expect(claudeProvider.generatePlanDocument).toHaveBeenCalled();
      });

      it('falls back when primary fails', async () => {
        const claudeProvider = mockProvider('claude', true, {
          success: false,
          error: 'API error',
          provider: 'claude',
        });
        const geminiProvider = mockProvider('gemini', true, {
          success: true,
          content: 'fallback-branch',
          provider: 'gemini',
        });
        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        vi.mocked(GeminiProvider).mockImplementation(
          () => geminiProvider as unknown as InstanceType<typeof GeminiProvider>
        );

        const manager = new AIProviderManager({
          config: { provider: 'claude', fallback: 'gemini' },
        });
        const result = await manager.generateBranchName({
          description: 'Add feature',
          repoName: 'test-repo',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('fallback-branch');
      });
    });

    describe('getAvailableProviders', () => {
      it('returns list of available providers', async () => {
        const claudeProvider = mockProvider('claude', true);
        const geminiProvider = mockProvider('gemini', false);
        const ollamaProvider = mockProvider('ollama', true);
        const openaiProvider = mockProvider('openai', false);

        vi.mocked(ClaudeProvider).mockImplementation(
          () => claudeProvider as unknown as InstanceType<typeof ClaudeProvider>
        );
        vi.mocked(GeminiProvider).mockImplementation(
          () => geminiProvider as unknown as InstanceType<typeof GeminiProvider>
        );
        vi.mocked(OllamaProvider).mockImplementation(
          () => ollamaProvider as unknown as InstanceType<typeof OllamaProvider>
        );
        vi.mocked(OpenAIProvider).mockImplementation(
          () => openaiProvider as unknown as InstanceType<typeof OpenAIProvider>
        );
        // Mock static checkAvailability for lazy initialization
        (
          ClaudeProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(true);
        (
          GeminiProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);
        (
          OllamaProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(true);
        (
          OpenAIProvider as unknown as { checkAvailability: () => Promise<boolean> }
        ).checkAvailability = vi.fn().mockResolvedValue(false);

        const manager = new AIProviderManager();
        const available = await manager.getAvailableProviders();

        expect(available).toContain('claude');
        expect(available).toContain('ollama');
        expect(available).not.toContain('gemini');
        expect(available).not.toContain('openai');
      });
    });
  });

  describe('createAIProviderManager', () => {
    it('creates a new manager instance', () => {
      const manager = createAIProviderManager();
      expect(manager).toBeInstanceOf(AIProviderManager);
    });

    it('creates manager with provided config', () => {
      const config: AIConfig = { provider: 'gemini', branchName: false };
      const manager = createAIProviderManager(config);
      expect(manager.getConfig().provider).toBe('gemini');
      expect(manager.getConfig().branchName).toBe(false);
    });
  });

  describe('getDefaultAIProviderManager', () => {
    it('returns a manager instance', () => {
      const manager = getDefaultAIProviderManager();
      expect(manager).toBeInstanceOf(AIProviderManager);
    });

    it('creates new manager when config provided', () => {
      getDefaultAIProviderManager({ provider: 'claude' });
      const manager2 = getDefaultAIProviderManager({ provider: 'gemini' });
      // Second call with config creates new manager
      expect(manager2.getConfig().provider).toBe('gemini');
    });
  });
});
