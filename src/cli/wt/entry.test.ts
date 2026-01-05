/**
 * Tests for wt.ts entry point (CLI configuration and error handling)
 *
 * These tests verify the yargs configuration, help output, and error handling
 * of the main wt CLI entry point.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve to dist/cli/wt.js (3 levels up from src/cli/wt/, then into dist/cli/)
const wtCliPath = path.resolve(__dirname, '../../../dist/cli/wt.js');

describe('wt CLI entry point', () => {
  describe('help and usage', () => {
    it('shows help when --help is passed', () => {
      const result = spawnSync(process.execPath, [wtCliPath, '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('wt new');
    });

    it('lists all available commands in help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, '--help'], {
        encoding: 'utf-8',
      });

      expect(result.stdout).toContain('new');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('clean');
      expect(result.stdout).toContain('link');
      expect(result.stdout).toContain('state');
      expect(result.stdout).toContain('config');
      expect(result.stdout).toContain('completion');
    });

    it('shows usage examples in help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, '--help'], {
        encoding: 'utf-8',
      });

      expect(result.stdout).toContain('Examples:');
      expect(result.stdout).toContain('wt new');
      expect(result.stdout).toContain('wt list');
    });

    it('shows version when --version is passed', () => {
      const result = spawnSync(process.execPath, [wtCliPath, '--version'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      // Version should be a valid semver string or "unknown" when running from dist
      expect(result.stdout.trim()).toMatch(/^(\d+\.\d+\.\d+|unknown)$/);
    });

    it('supports short -h alias for help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, '-h'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Commands:');
    });

    it('supports short -v alias for version', () => {
      const result = spawnSync(process.execPath, [wtCliPath, '-v'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      // Version should be a valid semver string or "unknown" when running from dist
      expect(result.stdout.trim()).toMatch(/^(\d+\.\d+\.\d+|unknown)$/);
    });
  });

  describe('error handling', () => {
    it('runs interactive menu when no command provided', () => {
      const result = spawnSync(process.execPath, [wtCliPath], {
        encoding: 'utf-8',
        // Non-TTY environment - interactive menu should exit cleanly
      });

      // In non-TTY mode, the interactive menu exits gracefully
      expect(result.status).toBe(0);
    });

    it('shows error for unknown command', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'unknowncommand'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unknown argument: unknowncommand');
    });

    it('shows error for unknown option', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'list', '--unknownoption'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unknown argument: unknownoption');
    });
  });

  describe('subcommand aliases', () => {
    it('recognizes "n" as alias for "new"', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'n', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Create a new PR');
    });

    it('recognizes "ls" as alias for "list"', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'ls', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('List worktrees');
    });

    it('recognizes "c" as alias for "clean"', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'c', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Clean');
    });

    it('recognizes "l" as alias for "link"', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'l', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('config file linking');
    });

    it('recognizes "s" as alias for "state"', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 's', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('state');
    });

    it('recognizes "cfg" as alias for "config"', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'cfg', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Configuration');
    });
  });

  describe('subcommand help', () => {
    it('shows new command help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'new', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--pr');
      expect(result.stdout).toContain('--ready');
      expect(result.stdout).toContain('--json');
    });

    it('shows list command help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'list', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--verbose');
      expect(result.stdout).toContain('--json');
      expect(result.stdout).toContain('--no-interactive');
    });

    it('shows clean command help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'clean', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--all');
      expect(result.stdout).toContain('--dry-run');
      expect(result.stdout).toContain('--force');
    });

    it('shows link command help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'link', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--manifest-file');
      expect(result.stdout).toContain('--dry-run');
      expect(result.stdout).toContain('--verbose');
    });

    it('shows state command help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'state', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--json');
      expect(result.stdout).toContain('--verbose');
    });

    it('shows config command help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'config', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('subcommand');
    });

    it('shows completion command help', () => {
      const result = spawnSync(process.execPath, [wtCliPath, 'completion', '--help'], {
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('bash');
      expect(result.stdout).toContain('zsh');
      expect(result.stdout).toContain('fish');
    });
  });
});
