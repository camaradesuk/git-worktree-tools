/**
 * CLI-based AI Providers
 *
 * Providers that use command-line AI tools (Claude Code, Gemini CLI, etc.)
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AIGenerationResult } from './types.js';
import { DEFAULT_AI_TIMEOUT_MS } from './types.js';
import { BaseAIProvider, createSuccessResult, createErrorResult } from './base-provider.js';

/**
 * Check if a command exists in PATH
 */
function commandExists(cmd: string): boolean {
  try {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Execute a CLI command and capture output
 */
function execCommand(
  cmd: string,
  args: string[],
  input?: string,
  timeoutMs: number = DEFAULT_AI_TIMEOUT_MS
): string {
  const result = spawnSync(cmd, args, {
    input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10, // 10MB
    timeout: timeoutMs,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(
      `${cmd} was killed by signal ${result.signal} (likely timed out after ${timeoutMs}ms)`
    );
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed with exit code ${result.status}`);
  }

  return result.stdout;
}

/**
 * Claude Code CLI provider
 *
 * Uses the `claude` command-line tool for generation.
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'claude';
  private model?: string;
  private timeoutMs: number;

  constructor(model?: string, timeoutMs: number = DEFAULT_AI_TIMEOUT_MS) {
    super();
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Static availability check for lazy initialization
   * Avoids creating a provider instance just to check availability.
   */
  static checkAvailability(): Promise<boolean> {
    return Promise.resolve(commandExists('claude'));
  }

  async isAvailable(): Promise<boolean> {
    return ClaudeProvider.checkAvailability();
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    try {
      // Use claude CLI with the prompt
      // The claude CLI accepts prompts via stdin or as an argument
      const args = ['-p', prompt];
      if (this.model) {
        args.push('--model', this.model);
      }
      const output = execCommand('claude', args, undefined, this.timeoutMs);
      return createSuccessResult(output.trim(), this.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Claude CLI error: ${message}`, this.name);
    }
  }
}

/**
 * Gemini CLI provider
 *
 * Uses the `gemini` command-line tool for generation.
 * CLI syntax: gemini -p "prompt" (non-interactive mode)
 */
export class GeminiProvider extends BaseAIProvider {
  readonly name = 'gemini';
  private model: string;
  private timeoutMs: number;

  constructor(model = 'gemini-2.0-flash', timeoutMs: number = DEFAULT_AI_TIMEOUT_MS) {
    super();
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Static availability check for lazy initialization
   */
  static checkAvailability(): Promise<boolean> {
    return Promise.resolve(commandExists('gemini'));
  }

  async isAvailable(): Promise<boolean> {
    return GeminiProvider.checkAvailability();
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    try {
      // Use gemini CLI in non-interactive mode with -p flag
      const output = execCommand(
        'gemini',
        ['-p', prompt, '--model', this.model],
        undefined,
        this.timeoutMs
      );
      return createSuccessResult(output.trim(), this.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Gemini CLI error: ${message}`, this.name);
    }
  }
}

/**
 * Ollama local AI provider
 *
 * Uses the local Ollama server for generation.
 */
export class OllamaProvider extends BaseAIProvider {
  readonly name = 'ollama';
  private model: string;
  private host: string;
  private timeoutMs: number;

  constructor(
    model = 'codellama:13b',
    host = 'http://localhost:11434',
    timeoutMs: number = 120_000
  ) {
    super();
    this.model = model;
    this.host = host;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Static availability check for lazy initialization
   */
  static checkAvailability(host = 'http://localhost:11434'): Promise<boolean> {
    try {
      // Check if Ollama server is running
      const result = spawnSync('curl', ['-s', `${host}/api/tags`], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return Promise.resolve(result.status === 0);
    } catch {
      return Promise.resolve(false);
    }
  }

  async isAvailable(): Promise<boolean> {
    return OllamaProvider.checkAvailability(this.host);
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    try {
      // Use curl to call Ollama API
      const payload = JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      });

      const result = spawnSync(
        'curl',
        [
          '-s',
          '-X',
          'POST',
          `${this.host}/api/generate`,
          '-d',
          payload,
          '-H',
          'Content-Type: application/json',
        ],
        {
          encoding: 'utf-8',
          timeout: this.timeoutMs,
        }
      );

      if (result.status !== 0) {
        throw new Error(result.stderr || 'Ollama API request failed');
      }

      const response = JSON.parse(result.stdout);
      if (response.response) {
        return createSuccessResult(response.response.trim(), this.name);
      }

      throw new Error('Invalid Ollama response');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Ollama error: ${message}`, this.name);
    }
  }
}

/**
 * OpenAI Codex CLI provider.
 *
 * Uses `codex exec` non-interactively and reads the answer from a temp file
 * via --output-last-message: codex's stdout carries the agent's reasoning
 * preamble and token accounting, which is not the answer.
 *
 * Note: This provider ONLY uses the Codex CLI tool. No API key fallback.
 * Users must have Codex CLI installed and authenticated.
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'codex';
  private model?: string;
  private timeoutMs: number;

  constructor(model?: string, timeoutMs: number = DEFAULT_AI_TIMEOUT_MS) {
    super();
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  static checkAvailability(): Promise<boolean> {
    return Promise.resolve(commandExists('codex'));
  }

  async isAvailable(): Promise<boolean> {
    return OpenAIProvider.checkAvailability();
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    const outputFile = path.join(
      os.tmpdir(),
      `gwt-codex-${process.pid}-${crypto.randomBytes(6).toString('hex')}.txt`
    );

    try {
      const args = [
        'exec',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '--color',
        'never',
        '--output-last-message',
        outputFile,
      ];
      if (this.model) {
        args.push('-m', this.model);
      }
      args.push(prompt);

      const result = spawnSync('codex', args, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024 * 10,
        timeout: this.timeoutMs,
      });

      if (result.error) {
        throw result.error;
      }
      if (result.signal) {
        throw new Error(
          `codex exec was killed by signal ${result.signal} (likely timed out after ${this.timeoutMs}ms)`
        );
      }
      if (result.status !== 0) {
        throw new Error(result.stderr || `codex exec failed with exit code ${result.status}`);
      }
      if (!fs.existsSync(outputFile)) {
        throw new Error('codex exec produced no output file');
      }

      const output = fs.readFileSync(outputFile, 'utf-8').trim();
      if (!output) {
        throw new Error('codex exec produced an empty response');
      }

      return createSuccessResult(output, this.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Codex CLI error: ${message}`, this.name);
    } finally {
      try {
        if (fs.existsSync(outputFile)) {
          fs.rmSync(outputFile, { force: true });
        }
      } catch {
        // Best effort: a leftover temp file must never mask the real error.
      }
    }
  }
}

/**
 * Custom script provider
 *
 * Runs a user-defined script for generation.
 */
export class ScriptProvider extends BaseAIProvider {
  readonly name = 'script';
  private scriptPath: string;

  constructor(scriptPath: string) {
    super();
    this.scriptPath = scriptPath;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if script exists and is executable
      const result = spawnSync('test', ['-x', this.scriptPath]);
      return result.status === 0;
    } catch {
      return false;
    }
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    try {
      // Run the script with prompt as stdin
      const output = execCommand('node', [this.scriptPath], prompt);
      return createSuccessResult(output.trim(), this.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Script error: ${message}`, this.name);
    }
  }
}
