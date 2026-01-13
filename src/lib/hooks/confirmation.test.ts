/**
 * Hook Confirmation Module Tests
 *
 * Tests for the hook confirmation prompts and utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getHookCommands,
  isHookEditable,
  isInteractiveEnvironment,
  createEditedHookDefinition,
  promptHookConfirmation,
  type HookConfirmResult,
} from './confirmation.js';
import type { HookDefinition, ComplexHookDef } from './types.js';

// Mock colors to avoid ANSI codes in tests
vi.mock('../colors.js', () => ({
  dim: (s: string) => s,
  bold: (s: string) => s,
  cyan: (s: string) => s,
  error: (s: string) => s,
  warning: (s: string) => s,
  info: (s: string) => s,
  success: (s: string) => s,
}));

// Mock prompts module
const mockPromptChoice = vi.fn();
const mockPromptInput = vi.fn();

vi.mock('../prompts.js', () => ({
  promptChoice: (...args: unknown[]) => mockPromptChoice(...args),
  promptInput: (...args: unknown[]) => mockPromptInput(...args),
}));

describe('getHookCommands', () => {
  it('extracts command from simple string hook', () => {
    const definition: HookDefinition = 'npm install';
    const commands = getHookCommands(definition);

    expect(commands).toEqual(['npm install']);
  });

  it('extracts commands from array hook', () => {
    const definition: HookDefinition = ['npm install', 'npm run build'];
    const commands = getHookCommands(definition);

    expect(commands).toEqual(['npm install', 'npm run build']);
  });

  it('extracts command from complex hook with command property', () => {
    const definition: ComplexHookDef = {
      command: 'npm test',
      timeout: 60000,
    };
    const commands = getHookCommands(definition);

    expect(commands).toEqual(['npm test']);
  });

  it('extracts script from complex hook with script property', () => {
    const definition: ComplexHookDef = {
      script: './scripts/setup.sh',
    };
    const commands = getHookCommands(definition);

    expect(commands).toEqual(['[script: ./scripts/setup.sh]']);
  });

  it('returns empty array for complex hook without command or script', () => {
    const definition: ComplexHookDef = {
      timeout: 30000,
    };
    const commands = getHookCommands(definition);

    expect(commands).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    const definition = {} as HookDefinition;
    const commands = getHookCommands(definition);

    expect(commands).toEqual([]);
  });
});

describe('isHookEditable', () => {
  it('returns true for simple string hook', () => {
    const definition: HookDefinition = 'npm install';

    expect(isHookEditable(definition)).toBe(true);
  });

  it('returns false for array hook', () => {
    const definition: HookDefinition = ['npm install', 'npm run build'];

    expect(isHookEditable(definition)).toBe(false);
  });

  it('returns true for complex hook with command only', () => {
    const definition: ComplexHookDef = {
      command: 'npm test',
    };

    expect(isHookEditable(definition)).toBe(true);
  });

  it('returns false for complex hook with script', () => {
    const definition: ComplexHookDef = {
      script: './scripts/setup.sh',
    };

    expect(isHookEditable(definition)).toBe(false);
  });

  it('returns false for complex hook with both command and script', () => {
    const definition: ComplexHookDef = {
      command: 'npm test',
      script: './scripts/setup.sh',
    };

    expect(isHookEditable(definition)).toBe(false);
  });

  it('returns false for empty complex hook', () => {
    const definition: ComplexHookDef = {};

    expect(isHookEditable(definition)).toBe(false);
  });
});

describe('isInteractiveEnvironment', () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.JENKINS_URL;
    delete process.env.CIRCLECI;
    delete process.env.TRAVIS;
    delete process.env.BUILDKITE;
    delete process.env.TEAMCITY_VERSION;
    delete process.env.TF_BUILD;
  });

  afterEach(() => {
    // Restore original state
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });
    process.env = { ...originalEnv };
  });

  it('returns false when stdin is not a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when CI environment variable is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.CI = 'true';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when GITHUB_ACTIONS is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.GITHUB_ACTIONS = 'true';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when GITLAB_CI is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.GITLAB_CI = 'true';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when JENKINS_URL is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.JENKINS_URL = 'http://jenkins.example.com';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when CIRCLECI is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.CIRCLECI = 'true';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when TRAVIS is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.TRAVIS = 'true';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when BUILDKITE is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.BUILDKITE = 'true';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when TEAMCITY_VERSION is set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.TEAMCITY_VERSION = '2023.1';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns false when TF_BUILD is set (Azure DevOps)', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    process.env.TF_BUILD = 'True';

    expect(isInteractiveEnvironment()).toBe(false);
  });

  it('returns true when TTY is available and no CI variables set', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
    // All CI env vars should be cleared by beforeEach

    expect(isInteractiveEnvironment()).toBe(true);
  });
});

describe('createEditedHookDefinition', () => {
  it('replaces simple string hook with edited command', () => {
    const original: HookDefinition = 'npm install';
    const result = createEditedHookDefinition(original, 'npm ci');

    expect(result).toBe('npm ci');
  });

  it('replaces command in complex hook', () => {
    const original: ComplexHookDef = {
      command: 'npm install',
      timeout: 60000,
      failOnError: false,
    };
    const result = createEditedHookDefinition(original, 'npm ci');

    expect(result).toEqual({
      command: 'npm ci',
      timeout: 60000,
      failOnError: false,
      script: undefined,
    });
  });

  it('clears script property when editing complex hook', () => {
    const original: ComplexHookDef = {
      script: './setup.sh',
      timeout: 30000,
    };
    const result = createEditedHookDefinition(original, 'bash ./setup.sh --force');

    expect(result).toEqual({
      script: undefined,
      timeout: 30000,
      command: 'bash ./setup.sh --force',
    });
  });

  it('replaces array hook with single edited command', () => {
    const original: HookDefinition = ['npm install', 'npm run build'];
    const result = createEditedHookDefinition(original, 'npm ci && npm run build');

    expect(result).toBe('npm ci && npm run build');
  });
});

describe('promptHookConfirmation', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('returns run action when user selects Run hook', async () => {
    mockPromptChoice.mockResolvedValue('run');

    const result = await promptHookConfirmation(
      'post-worktree',
      'npm install',
      '/path/to/worktree'
    );

    expect(result).toEqual({ action: 'run' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Hook: post-worktree'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Working directory:'));
  });

  it('returns skip action when user selects Skip hook', async () => {
    mockPromptChoice.mockResolvedValue('skip');

    const result = await promptHookConfirmation(
      'post-worktree',
      'npm install',
      '/path/to/worktree'
    );

    expect(result).toEqual({ action: 'skip' });
  });

  it('returns run with edited command when user edits', async () => {
    mockPromptChoice.mockResolvedValue('edit');
    mockPromptInput.mockResolvedValue('npm ci --legacy-peer-deps');

    const result = await promptHookConfirmation(
      'post-worktree',
      'npm install',
      '/path/to/worktree'
    );

    expect(result).toEqual({
      action: 'run',
      editedCommand: 'npm ci --legacy-peer-deps',
    });
  });

  it('returns skip when edited command is empty', async () => {
    mockPromptChoice.mockResolvedValue('edit');
    mockPromptInput.mockResolvedValue('   ');

    const result = await promptHookConfirmation(
      'post-worktree',
      'npm install',
      '/path/to/worktree'
    );

    expect(result).toEqual({ action: 'skip' });
  });

  it('trims edited command whitespace', async () => {
    mockPromptChoice.mockResolvedValue('edit');
    mockPromptInput.mockResolvedValue('  npm ci  ');

    const result = await promptHookConfirmation(
      'post-worktree',
      'npm install',
      '/path/to/worktree'
    );

    expect(result).toEqual({
      action: 'run',
      editedCommand: 'npm ci',
    });
  });

  it('displays complex hook details', async () => {
    mockPromptChoice.mockResolvedValue('run');

    const complexHook: ComplexHookDef = {
      command: 'npm install',
      timeout: 120000,
      failOnError: false,
      if: 'exists:package.json',
    };

    await promptHookConfirmation('post-worktree', complexHook, '/path/to/worktree');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Timeout:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Non-fatal:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Condition:'));
  });

  it('does not offer edit option for non-editable hooks', async () => {
    mockPromptChoice.mockResolvedValue('run');

    const scriptHook: ComplexHookDef = {
      script: './setup.sh',
    };

    await promptHookConfirmation('post-worktree', scriptHook, '/path/to/worktree');

    // Check that promptChoice was called with only run and skip options
    expect(mockPromptChoice).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ value: 'run' }),
        expect.objectContaining({ value: 'skip' }),
      ])
    );

    // Verify no edit option was included
    const choices = mockPromptChoice.mock.calls[0][1] as Array<{ value: string }>;
    expect(choices.find((c) => c.value === 'edit')).toBeUndefined();
  });

  it('offers edit option for editable hooks', async () => {
    mockPromptChoice.mockResolvedValue('run');

    await promptHookConfirmation('post-worktree', 'npm install', '/path/to/worktree');

    // Verify edit option was included
    const choices = mockPromptChoice.mock.calls[0][1] as Array<{ value: string }>;
    expect(choices.find((c) => c.value === 'edit')).toBeDefined();
  });

  it('displays array of commands', async () => {
    mockPromptChoice.mockResolvedValue('skip');

    await promptHookConfirmation('post-worktree', ['npm install', 'npm run build'], '/path');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('npm install'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('npm run build'));
  });
});
