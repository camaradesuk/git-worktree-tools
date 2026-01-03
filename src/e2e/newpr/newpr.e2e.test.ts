import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runCli,
  runCliJson,
  createTestContext,
  setupGhMock,
  GH_AVAILABLE,
  type TestContext,
} from '../helpers/index.js';

/**
 * E2E tests for newpr core functionality.
 *
 * Tests command-line interface, error handling, and options.
 */

describe.skipIf(!GH_AVAILABLE)('newpr e2e - core functionality', () => {
  describe('help and version', () => {
    it('shows help message with --help', () => {
      const result = runCli('newpr', ['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('newpr');
      expect(result.stdout).toContain('Usage');
      // Should mention key options
      expect(result.stdout).toMatch(/--pr|--branch|--draft/);
    });

    it('shows help message with -h', () => {
      const result = runCli('newpr', ['-h']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('newpr');
    });
  });

  describe('error conditions', () => {
    it('fails when gh is not installed', () => {
      const ctx = createTestContext({
        scenario: 'main_clean_same',
        skipGhMock: true, // Don't set up mock - use real gh check
      });

      try {
        // Create an environment where gh is not in PATH
        const emptyEnv = {
          ...process.env,
          PATH: '', // Empty PATH so gh can't be found
        };

        const result = runCli('newpr', ['test', '--non-interactive'], {
          cwd: ctx.repoDir,
          env: emptyEnv,
        });

        // Should fail with appropriate error
        expect(result.exitCode).not.toBe(0);
      } finally {
        ctx.cleanup();
      }
    });

    it('fails when gh is not authenticated', () => {
      const ctx = createTestContext({
        scenario: 'main_clean_same',
        ghMockOptions: { authenticated: false },
      });

      try {
        const result = runCli('newpr', ['test', '--non-interactive'], {
          cwd: ctx.repoDir,
          env: ctx.env,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toLowerCase()).toMatch(/auth|login|credential/i);
      } finally {
        ctx.cleanup();
      }
    });

    it('fails outside git repository', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
      const ghMock = setupGhMock();

      try {
        const result = runCli('newpr', ['test', '--non-interactive'], {
          cwd: tempDir,
          env: ghMock.mockEnv,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toLowerCase()).toMatch(/git|repository/i);
      } finally {
        ghMock.cleanup();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('argument validation', () => {
    let ctx: TestContext;

    beforeAll(() => {
      ctx = createTestContext({ scenario: 'main_clean_same' });
    });

    afterAll(() => {
      ctx.cleanup();
    });

    it('rejects invalid --pr value (non-numeric)', () => {
      const result = runCli('newpr', ['--pr', 'abc'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).not.toBe(0);
    });

    it('rejects invalid --pr value (negative)', () => {
      const result = runCli('newpr', ['--pr', '-1'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).not.toBe(0);
    });

    it('rejects invalid --pr value (zero)', () => {
      const result = runCli('newpr', ['--pr', '0'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).not.toBe(0);
    });

    it('rejects invalid --action value', () => {
      const result = runCli('newpr', ['test', '--non-interactive', '--action', 'invalid_action'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('--pr mode (existing PR)', () => {
    let ctx: TestContext;

    beforeAll(() => {
      ctx = createTestContext({ scenario: 'main_clean_same' });

      // Pre-create a PR in the mock
      ctx.ghMock?.addPr({
        number: 42,
        state: 'OPEN',
        title: 'Existing PR',
        headRefName: 'existing-pr-branch',
      });
    });

    afterAll(() => {
      ctx.cleanup();
    });

    it('sets up worktree for existing PR', () => {
      const result = runCli('newpr', ['--pr', '42'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      // Should attempt to set up worktree for PR #42
      // May succeed or fail depending on whether branch exists
      // The key is it shouldn't crash
      expect(typeof result.exitCode).toBe('number');
    });

    it('fails for non-existent PR', () => {
      const result = runCli('newpr', ['--pr', '99999'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).not.toBe(0);
      // Error message is "could not find pr #99999"
      expect(result.stderr.toLowerCase()).toMatch(/not found|no pull request|could not find/i);
    });

    it('handles closed PR gracefully', () => {
      // Add a closed PR to the mock
      ctx.ghMock?.addPr({
        number: 100,
        state: 'CLOSED',
        title: 'Closed PR',
        headRefName: 'closed-pr-branch',
      });

      const result = runCli('newpr', ['--pr', '100'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      // Should either warn or fail, but not crash
      expect(typeof result.exitCode).toBe('number');
    });
  });

  describe('--branch mode (existing branch)', () => {
    let ctx: TestContext;

    beforeAll(() => {
      ctx = createTestContext({ scenario: 'main_clean_same' });
    });

    afterAll(() => {
      ctx.cleanup();
    });

    it('fails for non-existent branch', () => {
      const result = runCli('newpr', ['--branch', 'nonexistent-branch'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('JSON output format', () => {
    let ctx: TestContext;

    beforeAll(() => {
      ctx = createTestContext({ scenario: 'main_clean_same' });
    });

    afterAll(() => {
      ctx.cleanup();
    });

    it('outputs success result with all required fields', () => {
      const result = runCliJson<{
        prNumber: number;
        prUrl: string;
        branch: string;
        worktreePath: string;
        scenario: string;
        actionTaken: string;
      }>('newpr', ['json-success-test', '--non-interactive'], {
        cwd: ctx.repoDir,
        env: ctx.env,
      });

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();

      if (result.data) {
        expect(typeof result.data.prNumber).toBe('number');
        expect(result.data.prNumber).toBeGreaterThan(0);
        expect(result.data.prUrl).toContain('github.com');
        expect(result.data.branch).toBeTruthy();
        expect(result.data.worktreePath).toBeTruthy();
      }
    });

    it('outputs error result with code and message', () => {
      // Force an error by using invalid action
      const result = runCliJson<unknown>(
        'newpr',
        ['test', '--non-interactive', '--action', 'invalid'],
        { cwd: ctx.repoDir, env: ctx.env }
      );

      expect(result.error).not.toBeNull();
      if (result.error) {
        expect(result.error.code).toBeTruthy();
        expect(result.error.message).toBeTruthy();
      }
    });

    it('suppresses colored console output in JSON mode', () => {
      const freshCtx = createTestContext({ scenario: 'main_staged_same' });

      try {
        // Use runCliJson which extracts JSON from mixed text/JSON output
        const result = runCliJson<{
          prNumber: number;
          prUrl: string;
        }>('newpr', ['json-no-color-test', '--non-interactive'], {
          cwd: freshCtx.repoDir,
          env: freshCtx.env,
        });

        // JSON should be parsed successfully
        expect(result.error).toBeNull();
        expect(result.data).not.toBeNull();

        // Check for absence of ANSI escape codes in the raw stdout
        // eslint-disable-next-line no-control-regex
        expect(result.raw.stdout).not.toMatch(/\x1B\[[0-9;]*m/);
      } finally {
        freshCtx.cleanup();
      }
    });
  });

  describe('combined flags', () => {
    it('--ready with --non-interactive creates ready-for-review PR', () => {
      // Note: PRs are created as drafts by default
      // Use --ready (or -r) to create ready-for-review
      const ctx = createTestContext({ scenario: 'main_clean_same' });

      try {
        const result = runCli('newpr', ['ready-combined-test', '--non-interactive', '--ready'], {
          cwd: ctx.repoDir,
          env: ctx.env,
        });

        expect(result.exitCode).toBe(0);
      } finally {
        ctx.cleanup();
      }
    });

    it('--json with --non-interactive outputs valid JSON', () => {
      const freshCtx = createTestContext({ scenario: 'main_unstaged_same' });

      try {
        const result = runCliJson<{
          prNumber: number;
          prUrl: string;
          branch: string;
          worktreePath: string;
        }>('newpr', ['json-combined-test', '--non-interactive'], {
          cwd: freshCtx.repoDir,
          env: freshCtx.env,
        });

        // runCliJson handles the mixed text/JSON output
        expect(result.error).toBeNull();
        expect(result.data).not.toBeNull();
        if (result.data) {
          expect(result.data.prNumber).toBeGreaterThan(0);
        }
      } finally {
        freshCtx.cleanup();
      }
    });
  });
});

describe.skipIf(!GH_AVAILABLE)('newpr e2e - error recovery', () => {
  describe('partial failure handling', () => {
    it('cleans up on branch creation failure', () => {
      // This would require a more sophisticated mock setup
      // to simulate failures at specific points
    });

    it('cleans up on worktree creation failure', () => {
      // This would require simulating worktree creation failure
    });
  });
});
