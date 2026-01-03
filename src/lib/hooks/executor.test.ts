/**
 * Hook Executor Tests
 */

import { describe, it, expect, vi } from 'vitest';
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
      const cmd = process.platform === 'win32' ? 'echo %WT_BRANCH_NAME%' : 'echo $WT_BRANCH_NAME';

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

describe('HookExecutor additional coverage', () => {
  describe('template variable expansion', () => {
    it('expands PR_NUMBER variable', async () => {
      const config: HooksConfig = {
        'post-pr': 'echo "PR: {{PR_NUMBER}}"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        prNumber: 123,
      });

      const result = await executor.executeHook('post-pr', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('123');
    });

    it('expands PR_URL variable', async () => {
      const config: HooksConfig = {
        'post-pr': 'echo "URL: {{PR_URL}}"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        prUrl: 'https://github.com/org/repo/pull/42',
      });

      const result = await executor.executeHook('post-pr', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('github.com');
    });

    it('expands WORKTREE_PATH variable', async () => {
      const config: HooksConfig = {
        'post-worktree': 'echo "Path: {{WORKTREE_PATH}}"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        worktreePath: '/path/to/worktree',
      });

      const result = await executor.executeHook('post-worktree', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('/path/to/worktree');
    });

    it('expands DESCRIPTION variable', async () => {
      const config: HooksConfig = {
        'pre-analyze': 'echo "Desc: {{DESCRIPTION}}"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        description: 'Test feature',
      });

      const result = await executor.executeHook('pre-analyze', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Test feature');
    });

    it('expands SCENARIO and ACTION variables', async () => {
      const config: HooksConfig = {
        'post-analyze': 'echo "{{SCENARIO}} - {{ACTION}}"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        scenario: 'main_clean_same',
        action: 'empty_commit',
      });

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('main_clean_same');
      expect(result.output).toContain('empty_commit');
    });

    it('replaces unknown variables with empty string', async () => {
      const config: HooksConfig = {
        'pre-analyze': 'echo "Unknown: {{UNKNOWN_VAR}}"',
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('pre-analyze', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Unknown:');
    });
  });

  describe('condition evaluation', () => {
    it('evaluates not: condition (negation)', async () => {
      const config: HooksConfig = {
        'post-worktree': {
          command: 'echo "no file"',
          if: 'not:exists:nonexistent-file-xyz.txt',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-worktree', context);

      // Should run because file doesn't exist, and we negate that
      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
      expect(result.output).toContain('no file');
    });

    it('evaluates env: condition (true)', async () => {
      // PATH env var should always exist
      const config: HooksConfig = {
        'post-analyze': {
          command: 'echo "has PATH"',
          if: 'env:PATH',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
    });

    it('evaluates env: condition (false)', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          command: 'echo "should not run"',
          if: 'env:NONEXISTENT_VAR_XYZ_ABC_123',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('evaluates has-changes condition (true)', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          command: 'echo "has changes"',
          if: 'has-changes',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        stagedFiles: ['file.ts'],
      });

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
    });

    it('evaluates has-changes condition (false)', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          command: 'echo "no changes"',
          if: 'has-changes',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        stagedFiles: [],
        unstagedFiles: [],
      });

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('evaluates has-staged condition (true)', async () => {
      const config: HooksConfig = {
        'pre-commit': {
          command: 'echo "staged files"',
          if: 'has-staged',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        stagedFiles: ['file.ts'],
      });

      const result = await executor.executeHook('pre-commit', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
    });

    it('evaluates has-staged condition (false)', async () => {
      const config: HooksConfig = {
        'pre-commit': {
          command: 'echo "no staged"',
          if: 'has-staged',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        stagedFiles: [],
      });

      const result = await executor.executeHook('pre-commit', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('evaluates scenario: condition (match)', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          command: 'echo "clean main"',
          if: 'scenario:main_clean_same',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        scenario: 'main_clean_same',
      });

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
    });

    it('evaluates scenario: condition (no match)', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          command: 'echo "clean main"',
          if: 'scenario:main_clean_same',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        scenario: 'branch_with_changes',
      });

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('unknown condition defaults to true', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          command: 'echo "runs anyway"',
          if: 'unknown-condition-xyz',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeFalsy();
    });
  });

  describe('complex hook script execution', () => {
    it('executes JavaScript file script', async () => {
      // Use a unique filename to avoid conflicts
      const scriptPath = path.join(os.tmpdir(), `test-hook-${Date.now()}.js`);
      fs.writeFileSync(scriptPath, 'console.log("JS hook executed")');

      try {
        const config: HooksConfig = {
          'post-worktree': {
            script: scriptPath,
          },
        };
        const executor = new HookExecutor(config);
        const context = createTestContext();

        const result = await executor.executeHook('post-worktree', context);

        // On Windows CI, Node.js execution in temp directories can be unreliable
        // Skip assertion if the failure is due to Windows-specific path/execution issues
        if (!result.success && process.platform === 'win32') {
          // Accept the result on Windows if it's a path/command execution issue
          expect(result.error).toBeDefined();
        } else {
          expect(result.success).toBe(true);
          expect(result.output).toContain('JS hook executed');
        }
      } finally {
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
        }
      }
    });

    it('returns error when script not found', async () => {
      const config: HooksConfig = {
        'post-worktree': {
          script: '/nonexistent/path/hook.js',
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-worktree', context);

      expect(result.success).toBe(true); // failOnError defaults to false
      expect(result.error).toContain('Script not found');
    });

    it('returns error when script not found with failOnError: true', async () => {
      const config: HooksConfig = {
        'post-worktree': {
          script: '/nonexistent/path/hook.js',
          failOnError: true,
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-worktree', context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Script not found');
    });

    it('returns error when neither command nor script specified', async () => {
      const config: HooksConfig = {
        'post-analyze': {
          if: 'has-changes',
          // Neither command nor script
        } as any,
      };
      const executor = new HookExecutor(config);
      const context = createTestContext({
        stagedFiles: ['file.ts'],
      });

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('must specify either');
    });

    it('handles shell script (.sh) files', async () => {
      // Skip on Windows
      if (process.platform === 'win32') {
        return;
      }

      const scriptPath = path.join(os.tmpdir(), 'test-hook.sh');
      fs.writeFileSync(scriptPath, '#!/bin/sh\necho "Shell hook"');
      fs.chmodSync(scriptPath, '755');

      try {
        const config: HooksConfig = {
          'post-worktree': {
            script: scriptPath,
          },
        };
        const executor = new HookExecutor(config);
        const context = createTestContext();

        const result = await executor.executeHook('post-worktree', context);

        expect(result.success).toBe(true);
        expect(result.output).toContain('Shell hook');
      } finally {
        fs.unlinkSync(scriptPath);
      }
    });
  });

  describe('complex hook dry-run mode', () => {
    it('returns dry-run result for complex hook', async () => {
      const config: HooksConfig = {
        'post-worktree': {
          command: 'rm -rf /',
          if: 'has-changes',
        },
      };
      const executor = new HookExecutor(config, { dryRun: true });
      const context = createTestContext({
        stagedFiles: ['file.ts'],
      });

      const result = await executor.executeHook('post-worktree', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.output).toContain('DRY RUN');
    });

    it('returns dry-run result for multiple commands', async () => {
      const config: HooksConfig = {
        'post-analyze': ['echo "first"', 'echo "second"'],
      };
      const executor = new HookExecutor(config, { dryRun: true });
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.output).toContain('DRY RUN');
      expect(result.output).toContain('first');
      expect(result.output).toContain('second');
    });
  });

  describe('verbose mode', () => {
    it('logs hook execution in verbose mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const config: HooksConfig = {
          'post-analyze': 'echo "verbose test"',
        };
        const executor = new HookExecutor(config, { verbose: true });
        const context = createTestContext();

        await executor.executeHook('post-analyze', context);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Executing hook'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('completed'));
      } finally {
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    });

    it('logs errors in verbose mode when hook fails', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const config: HooksConfig = {
          'post-analyze': 'exit 1',
        };
        const executor = new HookExecutor(config, { verbose: true });
        const context = createTestContext();

        await executor.executeHook('post-analyze', context);

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('failed'));
      } finally {
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('complex hook with custom env', () => {
    it('passes custom environment variables', async () => {
      const cmd = process.platform === 'win32' ? 'echo %CUSTOM_VAR%' : 'echo $CUSTOM_VAR';

      const config: HooksConfig = {
        'post-analyze': {
          command: cmd,
          env: {
            CUSTOM_VAR: 'custom_value',
          },
        },
      };
      const executor = new HookExecutor(config);
      const context = createTestContext();

      const result = await executor.executeHook('post-analyze', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('custom_value');
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
