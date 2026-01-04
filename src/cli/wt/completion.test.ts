/**
 * Tests for wt completion command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

describe('completionCommand', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
  });

  it('exports completionCommand with correct structure', async () => {
    const { completionCommand } = await import('./completion.js');

    expect(completionCommand).toBeDefined();
    expect(completionCommand.command).toBe('completion [shell]');
    expect(completionCommand.describe).toBe('Generate shell completion scripts');
    expect(typeof completionCommand.handler).toBe('function');
  });

  it('handler shows usage when no shell specified', async () => {
    const { completionCommand } = await import('./completion.js');

    completionCommand.handler({ shell: undefined } as never);

    expect(mockConsoleLog).toHaveBeenCalled();
    const output = mockConsoleLog.mock.calls[0][0] as string;
    expect(output).toContain('wt completion');
    expect(output).toContain('bash');
    expect(output).toContain('zsh');
    expect(output).toContain('fish');
  });

  it('handler outputs bash completion script', async () => {
    const { completionCommand } = await import('./completion.js');

    completionCommand.handler({ shell: 'bash' } as never);

    expect(mockConsoleLog).toHaveBeenCalled();
    const output = mockConsoleLog.mock.calls[0][0] as string;
    expect(output).toContain('###-begin-wt-completions-###');
    expect(output).toContain('_wt_yargs_completions');
    expect(output).toContain('complete -o bashdefault');
  });

  it('handler outputs zsh completion script', async () => {
    const { completionCommand } = await import('./completion.js');

    completionCommand.handler({ shell: 'zsh' } as never);

    expect(mockConsoleLog).toHaveBeenCalled();
    const output = mockConsoleLog.mock.calls[0][0] as string;
    expect(output).toContain('#compdef wt');
    expect(output).toContain('_wt()');
    expect(output).toContain("'new:Create a new PR");
  });

  it('handler outputs fish completion script', async () => {
    const { completionCommand } = await import('./completion.js');

    completionCommand.handler({ shell: 'fish' } as never);

    expect(mockConsoleLog).toHaveBeenCalled();
    const output = mockConsoleLog.mock.calls[0][0] as string;
    expect(output).toContain('complete -c wt');
    expect(output).toContain('__fish_use_subcommand');
    expect(output).toContain("'new'");
  });
});
