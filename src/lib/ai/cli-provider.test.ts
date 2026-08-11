/**
 * CLI Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import {
  ClaudeProvider,
  GeminiProvider,
  OllamaProvider,
  OpenAIProvider,
  ScriptProvider,
} from './cli-provider.js';

vi.mock('child_process');
// Real fs calls run against real temp files (see mockCodexExec below), but a
// few tests need to spy on fs.writeFileSync. Node's native `fs` module
// exports non-configurable bindings that `vi.spyOn` cannot redefine
// in-place, so re-export it as a plain, spy-able object.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual };
});

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

  describe('OpenAIProvider (Codex CLI)', () => {
    function findFlagValue(args: string[], flag: string): string | undefined {
      const i = args.indexOf(flag);
      return i === -1 ? undefined : args[i + 1];
    }

    function mockCodexExec(opts: {
      installed?: boolean;
      status?: number | null;
      signal?: NodeJS.Signals | null;
      stderr?: string;
      lastMessage?: string | null; // null = codex never wrote the file
      error?: Error;
    }) {
      const {
        installed = true,
        status = 0,
        signal = null,
        stderr = '',
        lastMessage = 'ok',
        error,
      } = opts;

      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        if ((cmd === 'which' || cmd === 'where') && (args as string[])?.[0] === 'codex') {
          return {
            status: installed ? 0 : 1,
            stdout: installed ? '/usr/bin/codex' : '',
            stderr: '',
            pid: 0,
            output: [],
            signal: null,
          };
        }

        if (cmd === 'codex') {
          const argv = args as string[];
          const outputFile = findFlagValue(argv, '--output-last-message');
          if (lastMessage !== null && outputFile) {
            fs.writeFileSync(outputFile, lastMessage, 'utf-8');
          }
          return { status, signal, stdout: '', stderr, pid: 0, output: [], error };
        }

        throw new Error(`unexpected spawnSync call: ${cmd}`);
      });
    }

    const ctx = { description: 'Add auth', repoName: 'repo', branchPrefix: 'feat' };

    it('returns true when codex is installed', async () => {
      mockCodexExec({ installed: true });
      expect(await new OpenAIProvider().isAvailable()).toBe(true);
    });

    it('returns false when codex is not installed', async () => {
      mockCodexExec({ installed: false });
      expect(await new OpenAIProvider().isAvailable()).toBe(false);
    });

    it('invokes codex exec with the safe, non-interactive flag set', async () => {
      mockCodexExec({ lastMessage: 'feat/add-auth' });

      await new OpenAIProvider().generateBranchName(ctx);

      const codexCall = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'codex')!;
      const args = codexCall[1] as string[];

      expect(args[0]).toBe('exec');
      expect(args).toContain('--skip-git-repo-check');
      expect(args).toEqual(expect.arrayContaining(['-s', 'read-only']));
      expect(args).toEqual(expect.arrayContaining(['--color', 'never']));
      expect(args).toContain('--output-last-message');
      expect(args).not.toContain('-m');
    });

    it('includes -m <model> only when a model is configured', async () => {
      mockCodexExec({ lastMessage: 'feat/add-auth' });

      await new OpenAIProvider('gpt-5.6-codex').generateBranchName(ctx);

      const [, args] = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'codex')!;
      expect(args as string[]).toEqual(expect.arrayContaining(['-m', 'gpt-5.6-codex']));
    });

    it('reads the answer from the --output-last-message file, not stdout', async () => {
      mockCodexExec({ lastMessage: 'feat/add-auth' });

      const result = await new OpenAIProvider().generateBranchName(ctx);

      expect(result.success).toBe(true);
      expect(result.content).toBe('feat/add-auth');
      expect(result.provider).toBe('codex');
    });

    it('deletes the temp file after a successful run', async () => {
      mockCodexExec({ lastMessage: 'feat/add-auth' });
      const writeSpy = vi.spyOn(fs, 'writeFileSync');

      await new OpenAIProvider().generateBranchName(ctx);

      const outputFile = writeSpy.mock.calls[0][0] as string;
      expect(fs.existsSync(outputFile)).toBe(false);
    });

    it('deletes the temp file even when codex exits non-zero', async () => {
      mockCodexExec({ status: 1, stderr: 'boom', lastMessage: 'partial' });
      const writeSpy = vi.spyOn(fs, 'writeFileSync');

      const result = await new OpenAIProvider().generateBranchName(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
      const outputFile = writeSpy.mock.calls[0][0] as string;
      expect(fs.existsSync(outputFile)).toBe(false);
    });

    it('returns an error when the output file was never written', async () => {
      mockCodexExec({ status: 0, lastMessage: null });

      const result = await new OpenAIProvider().generateBranchName(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no output');
    });

    it('returns an error on empty output', async () => {
      mockCodexExec({ status: 0, lastMessage: '   ' });

      const result = await new OpenAIProvider().generateBranchName(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('treats a timeout (killed by signal) as a failure and cleans up', async () => {
      mockCodexExec({ status: null, signal: 'SIGTERM', lastMessage: 'unfinished' });
      const writeSpy = vi.spyOn(fs, 'writeFileSync');

      const result = await new OpenAIProvider(undefined, 100).generateBranchName(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/timeout|signal/i);
      const outputFile = writeSpy.mock.calls[0][0] as string;
      expect(fs.existsSync(outputFile)).toBe(false);
    });

    it('cleans up even when spawnSync itself errors', async () => {
      mockCodexExec({ lastMessage: null, error: new Error('ENOENT') });

      const result = await new OpenAIProvider().generateBranchName(ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });

    it('passes the configured timeout to spawnSync', async () => {
      mockCodexExec({ lastMessage: 'ok' });

      await new OpenAIProvider(undefined, 12_345).generateBranchName(ctx);

      const [, , opts] = vi.mocked(spawnSync).mock.calls.find(([cmd]) => cmd === 'codex')!;
      expect((opts as { timeout: number }).timeout).toBe(12_345);
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
