/**
 * CLI-based AI Providers
 *
 * Providers that use command-line AI tools (Claude Code, Gemini CLI, etc.)
 */

import { spawnSync } from 'child_process';
import type { AIGenerationResult } from './types.js';
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
function execCommand(cmd: string, args: string[], input?: string): string {
  const result = spawnSync(cmd, args, {
    input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10, // 10MB
    timeout: 60000, // 60 seconds
  });

  if (result.error) {
    throw result.error;
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
  private model: string;

  constructor(model = 'claude-sonnet-4-20250514') {
    super();
    this.model = model;
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
      const output = execCommand('claude', ['-p', prompt, '--model', this.model]);
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
 */
export class GeminiProvider extends BaseAIProvider {
  readonly name = 'gemini';
  private model: string;

  constructor(model = 'gemini-2.0-flash') {
    super();
    this.model = model;
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
      // Use gemini CLI with the prompt
      const output = execCommand('gemini', ['prompt', prompt, '--model', this.model]);
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

  constructor(model = 'codellama:13b', host = 'http://localhost:11434') {
    super();
    this.model = model;
    this.host = host;
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
          timeout: 120000, // 2 minutes for local models
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
 * OpenAI API provider
 *
 * Uses the OpenAI API via curl (no SDK dependency).
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'openai';
  private model: string;
  private apiKeyEnv: string;

  constructor(model = 'gpt-4o', apiKeyEnv = 'OPENAI_API_KEY') {
    super();
    this.model = model;
    this.apiKeyEnv = apiKeyEnv;
  }

  /**
   * Static availability check for lazy initialization
   */
  static checkAvailability(apiKeyEnv = 'OPENAI_API_KEY'): Promise<boolean> {
    return Promise.resolve(!!process.env[apiKeyEnv]);
  }

  async isAvailable(): Promise<boolean> {
    return OpenAIProvider.checkAvailability(this.apiKeyEnv);
  }

  protected async generate(prompt: string): Promise<AIGenerationResult> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      return createErrorResult(`OpenAI API key not found in ${this.apiKeyEnv}`, this.name);
    }

    try {
      const payload = JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
      });

      const result = spawnSync(
        'curl',
        [
          '-s',
          '-X',
          'POST',
          'https://api.openai.com/v1/chat/completions',
          '-H',
          'Content-Type: application/json',
          '-H',
          `Authorization: Bearer ${apiKey}`,
          '-d',
          payload,
        ],
        {
          encoding: 'utf-8',
          timeout: 60000,
        }
      );

      if (result.status !== 0) {
        throw new Error(result.stderr || 'OpenAI API request failed');
      }

      const response = JSON.parse(result.stdout);
      if (response.choices && response.choices[0]?.message?.content) {
        return createSuccessResult(response.choices[0].message.content.trim(), this.name);
      }

      if (response.error) {
        throw new Error(response.error.message || 'OpenAI API error');
      }

      throw new Error('Invalid OpenAI response');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`OpenAI error: ${message}`, this.name);
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
