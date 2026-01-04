/**
 * Tests for wt unified command handlers
 *
 * These are thin wrappers around spawnSync that delegate to the underlying CLI tools.
 * We test that each handler correctly builds the argument array and spawns the right tool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

// Mock process.exit to prevent test from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('wt subcommand handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockClear();
  });

  describe('newCommand', () => {
    it('passes description to newpr', async () => {
      const { newCommand } = await import('./new.js');

      newCommand.handler({
        description: 'Add dark mode',
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['Add dark mode']),
        expect.any(Object)
      );
    });

    it('passes --pr flag to newpr', async () => {
      const { newCommand } = await import('./new.js');

      newCommand.handler({
        pr: 42,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--pr', '42']),
        expect.any(Object)
      );
    });

    it('passes --draft flag to newpr', async () => {
      const { newCommand } = await import('./new.js');

      newCommand.handler({
        draft: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--draft']),
        expect.any(Object)
      );
    });

    it('passes --json flag to newpr', async () => {
      const { newCommand } = await import('./new.js');

      newCommand.handler({
        json: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--json']),
        expect.any(Object)
      );
    });
  });

  describe('listCommand', () => {
    it('passes --verbose flag to lswt', async () => {
      const { listCommand } = await import('./list.js');

      listCommand.handler({
        verbose: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--verbose']),
        expect.any(Object)
      );
    });

    it('passes --json flag to lswt', async () => {
      const { listCommand } = await import('./list.js');

      listCommand.handler({
        json: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--json']),
        expect.any(Object)
      );
    });

    it('passes --no-interactive flag to lswt', async () => {
      const { listCommand } = await import('./list.js');

      listCommand.handler({
        'no-interactive': true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--no-interactive']),
        expect.any(Object)
      );
    });

    it('passes --filter flag to lswt', async () => {
      const { listCommand } = await import('./list.js');

      listCommand.handler({
        filter: 'pr',
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--filter', 'pr']),
        expect.any(Object)
      );
    });
  });

  describe('cleanCommand', () => {
    it('passes pr-number to cleanpr', async () => {
      const { cleanCommand } = await import('./clean.js');

      cleanCommand.handler({
        prNumber: 42,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['42']),
        expect.any(Object)
      );
    });

    it('passes --all flag to cleanpr', async () => {
      const { cleanCommand } = await import('./clean.js');

      cleanCommand.handler({
        all: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--all']),
        expect.any(Object)
      );
    });

    it('passes --dry-run flag to cleanpr', async () => {
      const { cleanCommand } = await import('./clean.js');

      cleanCommand.handler({
        'dry-run': true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--dry-run']),
        expect.any(Object)
      );
    });

    it('passes --force flag to cleanpr', async () => {
      const { cleanCommand } = await import('./clean.js');

      cleanCommand.handler({
        force: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--force']),
        expect.any(Object)
      );
    });
  });

  describe('stateCommand', () => {
    it('passes --json flag to wtstate', async () => {
      const { stateCommand } = await import('./state.js');

      stateCommand.handler({
        json: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--json']),
        expect.any(Object)
      );
    });

    it('passes --verbose flag to wtstate', async () => {
      const { stateCommand } = await import('./state.js');

      stateCommand.handler({
        verbose: true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--verbose']),
        expect.any(Object)
      );
    });
  });

  describe('configCommand', () => {
    it('passes subcommand to wtconfig', async () => {
      const { configCommand } = await import('./config.js');

      configCommand.handler({
        subcommand: 'show',
        args: [],
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['show']),
        expect.any(Object)
      );
    });
  });

  describe('linkCommand', () => {
    it('passes subcommand and args to wtlink', async () => {
      const { linkCommand } = await import('./link.js');

      linkCommand.handler({
        subcommand: 'link',
        args: ['source', 'dest'],
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['link', 'source', 'dest']),
        expect.any(Object)
      );
    });

    it('passes --dry-run flag to wtlink', async () => {
      const { linkCommand } = await import('./link.js');

      linkCommand.handler({
        'dry-run': true,
      } as never);

      expect(spawnSync).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['--dry-run']),
        expect.any(Object)
      );
    });
  });
});
