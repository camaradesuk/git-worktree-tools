/**
 * CLI Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  ClaudeProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  ScriptProvider,
} from './cli-provider.js';

vi.mock('child_process');

describe('cli-provider', () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  describe('ClaudeProvider', () => {
    describe('isAvailable', () => {
      it('returns true when claude command exists', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: '/usr/bin/claude',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new ClaudeProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(true);
        const whichCommand = process.platform === 'win32' ? 'where' : 'which';
        expect(spawnSync).toHaveBeenCalledWith(whichCommand, ['claude'], expect.any(Object));
      });

      it('returns false when claude command not found', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 1,
          stdout: '',
          stderr: 'not found',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new ClaudeProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(false);
      });

      it('uses where on Windows', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: 'C:\\Program Files\\claude.exe',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new ClaudeProvider();
        await provider.isAvailable();

        expect(spawnSync).toHaveBeenCalledWith('where', ['claude'], expect.any(Object));
      });
    });

    describe('generateBranchName', () => {
      it('generates branch name using claude CLI', async () => {
        // First call for availability check
        vi.mocked(spawnSync).mockImplementation((cmd) => {
          if (cmd === 'which') {
            return {
              status: 0,
              stdout: '/usr/bin/claude',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
          // CLI call - return the branch name as the AI would
          return {
            status: 0,
            stdout: 'feat/add-user-authentication',
            stderr: '',
            pid: 0,
            output: [],
            signal: null,
          };
        });

        const provider = new ClaudeProvider();
        const result = await provider.generateBranchName({
          description: 'Add user authentication',
          repoName: 'test-repo',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('feat/add-user-authentication');
        expect(result.provider).toBe('claude');
      });

      it('returns error on CLI failure', async () => {
        vi.mocked(spawnSync).mockImplementation((cmd) => {
          if (cmd === 'which') {
            return {
              status: 0,
              stdout: '/usr/bin/claude',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
          return {
            status: 1,
            stdout: '',
            stderr: 'API rate limit exceeded',
            pid: 0,
            output: [],
            signal: null,
          };
        });

        const provider = new ClaudeProvider();
        const result = await provider.generateBranchName({
          description: 'Add feature',
          repoName: 'test-repo',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Claude CLI error');
      });
    });
  });

  describe('GeminiProvider', () => {
    describe('isAvailable', () => {
      it('returns true when gemini command exists', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: '/usr/bin/gemini',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new GeminiProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(true);
      });

      it('returns false when gemini command not found', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 1,
          stdout: '',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new GeminiProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(false);
      });
    });

    describe('generateBranchName', () => {
      it('generates branch name using gemini CLI', async () => {
        vi.mocked(spawnSync).mockImplementation((cmd) => {
          if (cmd === 'which') {
            return {
              status: 0,
              stdout: '/usr/bin/gemini',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
          return {
            status: 0,
            stdout: 'fix/resolve-memory-leak',
            stderr: '',
            pid: 0,
            output: [],
            signal: null,
          };
        });

        const provider = new GeminiProvider();
        const result = await provider.generateBranchName({
          description: 'Fix memory leak',
          repoName: 'test-repo',
          branchPrefix: 'fix',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('fix/resolve-memory-leak');
        expect(result.provider).toBe('gemini');
      });
    });
  });

  describe('OllamaProvider', () => {
    describe('isAvailable', () => {
      it('returns true when Ollama server is running', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: '{"models":[]}',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new OllamaProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(true);
        expect(spawnSync).toHaveBeenCalledWith(
          'curl',
          ['-s', 'http://localhost:11434/api/tags'],
          expect.any(Object)
        );
      });

      it('returns false when Ollama server is not running', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 7, // Connection refused
          stdout: '',
          stderr: 'Connection refused',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new OllamaProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(false);
      });

      it('uses custom host when provided', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: '{}',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new OllamaProvider('llama2', 'http://custom-host:11434');
        await provider.isAvailable();

        expect(spawnSync).toHaveBeenCalledWith(
          'curl',
          ['-s', 'http://custom-host:11434/api/tags'],
          expect.any(Object)
        );
      });
    });

    describe('generateBranchName', () => {
      it('generates branch name using Ollama API', async () => {
        vi.mocked(spawnSync).mockImplementation((cmd, args) => {
          // Availability check
          if (args && args.length === 2 && args[0] === '-s') {
            return {
              status: 0,
              stdout: '{"models":[]}',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
          // API call
          return {
            status: 0,
            stdout: JSON.stringify({ response: 'docs/update-readme' }),
            stderr: '',
            pid: 0,
            output: [],
            signal: null,
          };
        });

        const provider = new OllamaProvider();
        const result = await provider.generateBranchName({
          description: 'Update README',
          repoName: 'test-repo',
          branchPrefix: 'docs',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('docs/update-readme');
        expect(result.provider).toBe('ollama');
      });

      it('returns error on invalid Ollama response', async () => {
        vi.mocked(spawnSync).mockImplementation((cmd, args) => {
          if (args && args.length === 2) {
            return {
              status: 0,
              stdout: '{"models":[]}',
              stderr: '',
              pid: 0,
              output: [],
              signal: null,
            };
          }
          return {
            status: 0,
            stdout: '{}', // Missing response field
            stderr: '',
            pid: 0,
            output: [],
            signal: null,
          };
        });

        const provider = new OllamaProvider();
        const result = await provider.generateBranchName({
          description: 'Update README',
          repoName: 'test-repo',
          branchPrefix: 'docs',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid Ollama response');
      });
    });
  });

  describe('OpenAIProvider', () => {
    describe('isAvailable', () => {
      it('returns true when API key is set', async () => {
        process.env.OPENAI_API_KEY = 'sk-test-key';

        const provider = new OpenAIProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(true);
      });

      it('returns false when API key is not set', async () => {
        delete process.env.OPENAI_API_KEY;

        const provider = new OpenAIProvider();
        const available = await provider.isAvailable();

        expect(available).toBe(false);
      });

      it('uses custom env var when provided', async () => {
        process.env.MY_OPENAI_KEY = 'sk-custom-key';
        delete process.env.OPENAI_API_KEY;

        const provider = new OpenAIProvider('gpt-4o', 'MY_OPENAI_KEY');
        const available = await provider.isAvailable();

        expect(available).toBe(true);
      });
    });

    describe('generateBranchName', () => {
      it('generates branch name using OpenAI API', async () => {
        process.env.OPENAI_API_KEY = 'sk-test-key';

        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: JSON.stringify({
            choices: [{ message: { content: 'chore/update-dependencies' } }],
          }),
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new OpenAIProvider();
        const result = await provider.generateBranchName({
          description: 'Update dependencies',
          repoName: 'test-repo',
          branchPrefix: 'chore',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('chore/update-dependencies');
        expect(result.provider).toBe('openai');
      });

      it('returns error when API key is missing', async () => {
        delete process.env.OPENAI_API_KEY;

        const provider = new OpenAIProvider();
        const result = await provider.generateBranchName({
          description: 'Test',
          repoName: 'test-repo',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('API key not found');
      });

      it('returns error on OpenAI API error', async () => {
        process.env.OPENAI_API_KEY = 'sk-test-key';

        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: JSON.stringify({
            error: { message: 'Rate limit exceeded' },
          }),
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new OpenAIProvider();
        const result = await provider.generateBranchName({
          description: 'Test',
          repoName: 'test-repo',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Rate limit exceeded');
      });
    });
  });

  describe('ScriptProvider', () => {
    describe('isAvailable', () => {
      it('returns true when script is executable', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          stdout: '',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new ScriptProvider('/path/to/script.js');
        const available = await provider.isAvailable();

        expect(available).toBe(true);
        expect(spawnSync).toHaveBeenCalledWith('test', ['-x', '/path/to/script.js']);
      });

      it('returns false when script is not executable', async () => {
        vi.mocked(spawnSync).mockReturnValue({
          status: 1,
          stdout: '',
          stderr: '',
          pid: 0,
          output: [],
          signal: null,
        });

        const provider = new ScriptProvider('/path/to/script.js');
        const available = await provider.isAvailable();

        expect(available).toBe(false);
      });
    });

    describe('generateBranchName', () => {
      it('generates branch name using custom script', async () => {
        vi.mocked(spawnSync).mockImplementation((cmd) => {
          if (cmd === 'test') {
            return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          return {
            status: 0,
            stdout: 'custom/branch-from-script',
            stderr: '',
            pid: 0,
            output: [],
            signal: null,
          };
        });

        const provider = new ScriptProvider('/path/to/script.js');
        const result = await provider.generateBranchName({
          description: 'Custom issue',
          repoName: 'test-repo',
          branchPrefix: 'custom',
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('custom/branch-from-script');
        expect(result.provider).toBe('script');
      });

      it('returns error on script failure', async () => {
        vi.mocked(spawnSync).mockImplementation((cmd) => {
          if (cmd === 'test') {
            return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          return {
            status: 1,
            stdout: '',
            stderr: 'Script error',
            pid: 0,
            output: [],
            signal: null,
          };
        });

        const provider = new ScriptProvider('/path/to/script.js');
        const result = await provider.generateBranchName({
          description: 'Test',
          repoName: 'test-repo',
          branchPrefix: 'feat',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Script error');
      });
    });
  });
});
