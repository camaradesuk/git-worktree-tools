/**
 * Tests for wt completion command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Argv } from 'yargs';

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
    expect(typeof completionCommand.builder).toBe('function');
  });

  describe('builder', () => {
    it('configures shell positional argument', async () => {
      const { completionCommand } = await import('./completion.js');

      const mockPositional = vi.fn().mockReturnThis();
      const mockExample = vi.fn().mockReturnThis();
      const mockYargs = {
        positional: mockPositional,
        example: mockExample,
      } as unknown as Argv<object>;

      (completionCommand.builder as (yargs: Argv<object>) => Argv<object>)(mockYargs);

      expect(mockPositional).toHaveBeenCalledWith('shell', {
        describe: 'Shell type',
        type: 'string',
        choices: ['bash', 'zsh', 'fish'],
      });
    });

    it('adds bash completion example', async () => {
      const { completionCommand } = await import('./completion.js');

      const mockPositional = vi.fn().mockReturnThis();
      const mockExample = vi.fn().mockReturnThis();
      const mockYargs = {
        positional: mockPositional,
        example: mockExample,
      } as unknown as Argv<object>;

      (completionCommand.builder as (yargs: Argv<object>) => Argv<object>)(mockYargs);

      expect(mockExample).toHaveBeenCalledWith(
        '$0 completion bash >> ~/.bashrc',
        'Add bash completion to your profile'
      );
    });

    it('adds zsh completion example', async () => {
      const { completionCommand } = await import('./completion.js');

      const mockPositional = vi.fn().mockReturnThis();
      const mockExample = vi.fn().mockReturnThis();
      const mockYargs = {
        positional: mockPositional,
        example: mockExample,
      } as unknown as Argv<object>;

      (completionCommand.builder as (yargs: Argv<object>) => Argv<object>)(mockYargs);

      expect(mockExample).toHaveBeenCalledWith(
        '$0 completion zsh > ~/.zsh/completions/_wt',
        'Create zsh completion file'
      );
    });

    it('adds fish completion example', async () => {
      const { completionCommand } = await import('./completion.js');

      const mockPositional = vi.fn().mockReturnThis();
      const mockExample = vi.fn().mockReturnThis();
      const mockYargs = {
        positional: mockPositional,
        example: mockExample,
      } as unknown as Argv<object>;

      (completionCommand.builder as (yargs: Argv<object>) => Argv<object>)(mockYargs);

      expect(mockExample).toHaveBeenCalledWith(
        '$0 completion fish > ~/.config/fish/completions/wt.fish',
        'Create fish completion file'
      );
    });
  });

  describe('handler', () => {
    it('shows usage when no shell specified', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: undefined } as never);

      expect(mockConsoleLog).toHaveBeenCalled();
      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain('wt completion');
      expect(output).toContain('bash');
      expect(output).toContain('zsh');
      expect(output).toContain('fish');
    });

    it('shows installation instructions when no shell specified', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: undefined } as never);

      expect(mockConsoleLog).toHaveBeenCalled();
      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain('Installation:');
      expect(output).toContain('~/.bashrc');
      expect(output).toContain('~/.zsh/completions/_wt');
      expect(output).toContain('~/.config/fish/completions/wt.fish');
    });

    it('outputs bash completion script', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'bash' } as never);

      expect(mockConsoleLog).toHaveBeenCalled();
      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain('###-begin-wt-completions-###');
      expect(output).toContain('_wt_yargs_completions');
      expect(output).toContain('complete -o bashdefault');
    });

    it('bash completion contains installation instructions', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'bash' } as never);

      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain('wt completion bash >> ~/.bashrc');
      expect(output).toContain('source ~/.bashrc');
    });

    it('outputs zsh completion script', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'zsh' } as never);

      expect(mockConsoleLog).toHaveBeenCalled();
      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain('#compdef wt');
      expect(output).toContain('_wt()');
      expect(output).toContain("'new:Create a new PR");
    });

    it('zsh completion contains all subcommands', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'zsh' } as never);

      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain('new:');
      expect(output).toContain('list:');
      expect(output).toContain('clean:');
      expect(output).toContain('link:');
      expect(output).toContain('state:');
      expect(output).toContain('config:');
      expect(output).toContain('completion:');
    });

    it('outputs fish completion script', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'fish' } as never);

      expect(mockConsoleLog).toHaveBeenCalled();
      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain('complete -c wt');
      expect(output).toContain('__fish_use_subcommand');
      expect(output).toContain("'new'");
    });

    it('fish completion contains all subcommands', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'fish' } as never);

      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain("'new'");
      expect(output).toContain("'list'");
      expect(output).toContain("'clean'");
      expect(output).toContain("'link'");
      expect(output).toContain("'state'");
      expect(output).toContain("'config'");
      expect(output).toContain("'completion'");
    });

    it('fish completion contains subcommand aliases', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'fish' } as never);

      const output = mockConsoleLog.mock.calls[0][0] as string;
      expect(output).toContain("'n'");
      expect(output).toContain("'ls'");
      expect(output).toContain("'c'");
      expect(output).toContain("'l'");
      expect(output).toContain("'s'");
      expect(output).toContain("'cfg'");
    });

    it('does nothing for unknown shell type', async () => {
      const { completionCommand } = await import('./completion.js');

      completionCommand.handler({ shell: 'powershell' } as never);

      // Should not output anything for unknown shell
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });
});
