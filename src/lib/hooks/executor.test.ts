/**
 * Hook Executor Tests
 */

import { describe, it, expect } from 'vitest';
import { HookExecutor, createHookExecutor } from './executor.js';
import type { HookContext, HooksConfig } from './types.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Basic context for tests
const createTestContext = (overrides: Partial<HookContext> = {}): HookContext => ({
  repoRoot: os.tmpdir(),
  baseBranch: 'main',
  ...overrides,
});

describe('HookExecutor', () => {
  describe('constructor', () => {
    it('creates executor with empty config', () => {
      const executor = new HookExecutor();
      expect(executor.hasHook('post-worktree')).toBe(false);
    });

    it('creates executor with config', () => {
      const config: HooksConfig = {
        'post-worktree': 'echo "hello"',
      };
      const executor = new HookExecutor(config);
      expect(executor.hasHook('post-worktree')).toBe(true);
    });
  });

  describe('hasHook', () => {
    it('returns true for configured hooks', () => {
      const config: HooksConfig = {
        'post-worktree': 'echo "test"',
        'pre-branch': 'echo "branch"',
      };
      const executor = new HookExecutor(config);

      expect(executor.hasHook('post-worktree')).toBe(true);
      expect(executor.hasHook('pre-branch')).toBe(true);
      expect(executor.hasHook('post-pr')).toBe(false);
    });
  });

  describe('getConfiguredHooks', () => {
    it('returns list of configured hooks', () => {
      const config: HooksConfig = {
        'post-worktree': 'echo "test"',
        'pre-branch': 'echo "branch"',
        cleanup: 'echo "cleanup"',
      };
      const executor = new HookExecutor(config);

      const hooks = executor.getConfiguredHooks();

      expect(hooks).toHaveLength(3);
      expect(hooks).toContain('post-worktree');
      expect(hooks).toContain('pre-branch');
      expect(hooks).toContain('cleanup');
    });
  });

  describe('executeHook', () => {
    it('returns skipped result when hook not configured', async () => {
      const executor = new HookExecutor({});
      const context = createTestContext();

      const result = await executor.executeHook('post-worktree', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('No hook configured');
    });

    it('executes simple command hook', async () => {
      const config: HooksConfig = {
        'post-analyze': 'echo "test output"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('test output');
    });

    it('executes multiple command hooks in sequence', async () => {
      const config: HooksConfig = {
        'post-analyze': ['echo "first"', 'echo "second"'],
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('first');
      expect(result.output).toContain('second');
    });

    it('stops on first failing command in multiple hooks', async () => {
      const config: HooksConfig = {
        'post-analyze': ['echo "first"', 'exit 1', 'echo "third"'],
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(false);
      expect(result.output).toContain('first');
      expect(result.output).not.toContain('third');
    });

    it('expands template variables in command', async () => {
      const config: HooksConfig = {
        'post-branch': 'echo "Branch: {{BRANCH_NAME}}"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        branchName: 'feat/test-branch',
      });

      const result = await executor.executeHook('post-branch', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('feat/test-branch');
    });

    it('sets environment variables from context', async () => {
      // Use a platform-appropriate command to echo env var
      const cmd =
        process.platform === 'win32' ? 'echo %WT_BRANCH_NAME%' : 'echo $WT_BRANCH_NAME';

      const config: HooksConfig = {
        'post-branch': cmd,
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        branchName: 'feat/env-test',
      });

      const result = await executor.executeHook('post-branch', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('feat/env-test');
    });

    it('handles complex hook with condition (true)', async () => {
      // Create a temp file to test exists condition
      const tempFile = path.join(os.tmpdir(), 'test-exists.txt');
      fs.writeFileSync(tempFile, 'test');

      try {
        const config: HooksConfig = {
          'post-worktree': {
            command: 'echo "file exists"',
            if: 'exists:test-exists.txt',
          },
        };
        const executor = new HookExecutor(config);
        const context = createTestContext();

        const result = await executor.executeHook('post-worktree', context);

        expect(result.success).toBe(true);
        expect(result.skipped).toBeFalsy();
        expect(result.output).toContain('file exists');
      } finally {
        fs.unlinkSync(tempFile);
      }
    });

    it('handles complex hook with condition (false)', async () => {
      const config: HooksConfig = {
        'post-worktree': {
          command: 'echo "should not run"',
          if: 'exists:nonexistent-file-12345.txt',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-worktree', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('Condition not met');
    });

    it('handles failOnError: false', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          command: 'exit 1',
          failOnError: false,
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      // Should succeed because failOnError is false
      expect(result.success).toBe(true);
      expect(result.error).toContain('Non-fatal');
    });

    it('respects dry-run mode', async () => {
      const config: HooksConfig = {
        'post-worktree': 'rm -rf /',
      };
      const executor = new HookExecutor(config, { dryRun: true });
      const context = createTestContext();

      const result = await executor.executeHook('post-worktree', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('dry-run mode');
      expect(result.output).toContain('DRY RUN');
    });
  });

  describe('executeHooks', () => {
    it('executes multiple hooks in sequence', async () => {
      const config: HooksConfig = {
        'pre-branch': 'echo "pre"',
        'post-branch': 'echo "post"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const results = await executor.executeHooks(['pre-branch', 'post-branch'], context);

      expect(results).toHaveLength(2);
      expect(results[0].hook).toBe('pre-branch');
      expect(results[0].success).toBe(true);
      expect(results[1].hook).toBe('post-branch');
      expect(results[1].success).toBe(true);
    });

    it('stops on first failure', async () => {
      const config: HooksConfig = {
        'pre-branch': 'exit 1',
        'post-branch': 'echo "should not run"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const results = await executor.executeHooks(['pre-branch', 'post-branch'], context);

      // Executor stops after first failure, so only 1 result
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].hook).toBe('pre-branch');
    });

    it('skips non-configured hooks', async () => {
      const config: HooksConfig = {
        'post-branch': 'echo "configured"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const results = await executor.executeHooks(
        ['pre-branch', 'post-branch', 'post-pr'],
        context
      );

      expect(results).toHaveLength(3);
      expect(results[0].skipped).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].skipped).toBe(true);
    });
  });
});

describe('createHookExecutor', () => {
  it('creates executor with config', () => {
    const config: HooksConfig = {
      'post-worktree': 'echo "test"',
    };

    const executor = createHookExecutor(config);

    expect(executor).toBeInstanceOf(HookExecutor);
    expect(executor.hasHook('post-worktree')).toBe(true);
  });

  it('creates executor with options', () => {
    const executor = createHookExecutor({}, { dryRun: true, verbose: true });

    expect(executor).toBeInstanceOf(HookExecutor);
  });
});
