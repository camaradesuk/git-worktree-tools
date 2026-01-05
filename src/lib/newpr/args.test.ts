import { describe, it, expect } from 'vitest';
import { parseArgs, getHelpText, getDefaultOptions } from './args.js';

describe('newpr/args', () => {
  describe('getDefaultOptions', () => {
    it('returns default options', () => {
      const defaults = getDefaultOptions();

      expect(defaults.mode).toBe('new');
      expect(defaults.baseBranch).toBe('main');
      expect(defaults.draft).toBe(false);
      expect(defaults.installDeps).toBe(false);
      expect(defaults.openEditor).toBe(false);
      expect(defaults.runWtlink).toBe(true);
    });
  });

  describe('parseArgs', () => {
    describe('help flag', () => {
      it('returns help for -h', () => {
        const result = parseArgs(['-h']);
        expect(result.kind).toBe('help');
      });

      it('returns help for --help', () => {
        const result = parseArgs(['--help']);
        expect(result.kind).toBe('help');
      });
    });

    describe('new mode (default)', () => {
      it('parses description as positional argument', () => {
        const result = parseArgs(['Add new feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.mode).toBe('new');
          expect(result.options.description).toBe('Add new feature');
        }
      });

      it('returns error when no description provided', () => {
        const result = parseArgs([]);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('Description required');
        }
      });

      it('returns error for unexpected positional argument', () => {
        const result = parseArgs(['first desc', 'second desc']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('Unexpected argument');
        }
      });
    });

    describe('pr mode', () => {
      it('parses --pr with number', () => {
        const result = parseArgs(['--pr', '123']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.mode).toBe('pr');
          expect(result.options.prNumber).toBe(123);
        }
      });

      it('parses -p with number', () => {
        const result = parseArgs(['-p', '456']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.mode).toBe('pr');
          expect(result.options.prNumber).toBe(456);
        }
      });

      it('returns error when --pr has no value', () => {
        const result = parseArgs(['--pr']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--pr requires a PR number');
        }
      });

      it('returns error when --pr value starts with dash', () => {
        const result = parseArgs(['--pr', '-h']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--pr requires a PR number');
        }
      });

      it('returns error when PR number is not numeric', () => {
        const result = parseArgs(['--pr', 'abc']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('PR number must be a positive integer');
        }
      });

      it('returns error when PR number is a float (UX-014)', () => {
        // Regression test for UX-014: parseInt("1.5") returns 1, but we should reject floats
        const result = parseArgs(['--pr', '1.5']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('PR number must be a positive integer');
        }
      });

      it('returns error for negative PR numbers', () => {
        const result = parseArgs(['--pr', '-5']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--pr requires a PR number');
        }
      });

      it('returns error for zero PR number', () => {
        const result = parseArgs(['--pr', '0']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('PR number must be a positive');
        }
      });
    });

    describe('branch mode', () => {
      it('parses --branch with name', () => {
        const result = parseArgs(['--branch', 'feat/my-feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.mode).toBe('branch');
          expect(result.options.branchName).toBe('feat/my-feature');
        }
      });

      it('parses -B with name', () => {
        const result = parseArgs(['-B', 'fix/bug']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.mode).toBe('branch');
          expect(result.options.branchName).toBe('fix/bug');
        }
      });

      it('returns error when --branch has no value', () => {
        const result = parseArgs(['--branch']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--branch requires a branch name');
        }
      });

      it('returns error when --branch value starts with dash', () => {
        const result = parseArgs(['--branch', '-h']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--branch requires a branch name');
        }
      });
    });

    describe('base branch option', () => {
      it('parses --base with branch name', () => {
        const result = parseArgs(['--base', 'develop', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.baseBranch).toBe('develop');
        }
      });

      it('parses -b with branch name', () => {
        const result = parseArgs(['-b', 'release', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.baseBranch).toBe('release');
        }
      });

      it('returns error when --base has no value', () => {
        const result = parseArgs(['--base']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--base requires a branch name');
        }
      });

      it('returns error when --base value starts with dash', () => {
        const result = parseArgs(['--base', '-h']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--base requires a branch name');
        }
      });
    });

    describe('boolean flags', () => {
      it('parses --install', () => {
        const result = parseArgs(['--install', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.installDeps).toBe(true);
        }
      });

      it('parses -i', () => {
        const result = parseArgs(['-i', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.installDeps).toBe(true);
        }
      });

      it('parses --code', () => {
        const result = parseArgs(['--code', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.openEditor).toBe(true);
        }
      });

      it('parses -c', () => {
        const result = parseArgs(['-c', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.openEditor).toBe(true);
        }
      });

      it('parses --ready', () => {
        const result = parseArgs(['--ready', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.draft).toBe(false);
        }
      });

      it('parses -r', () => {
        const result = parseArgs(['-r', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.draft).toBe(false);
        }
      });

      it('parses --no-wtlink', () => {
        const result = parseArgs(['--no-wtlink', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.runWtlink).toBe(false);
        }
      });
    });

    describe('--action flag', () => {
      it('parses --action with valid action key', () => {
        const result = parseArgs(['--action', 'commit_all', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('commit_all');
        }
      });

      it('parses --action with commit_staged', () => {
        const result = parseArgs(['--action', 'commit_staged', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('commit_staged');
        }
      });

      it('parses --action with stash_and_empty', () => {
        const result = parseArgs(['--action', 'stash_and_empty', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('stash_and_empty');
        }
      });

      it('parses --action with empty_commit', () => {
        const result = parseArgs(['--action', 'empty_commit', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('empty_commit');
        }
      });

      it('parses --action with use_commits', () => {
        const result = parseArgs(['--action', 'use_commits', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('use_commits');
        }
      });

      it('parses --action with push_then_branch', () => {
        const result = parseArgs(['--action', 'push_then_branch', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('push_then_branch');
        }
      });

      it('parses --action with use_commits_and_commit_all', () => {
        const result = parseArgs(['--action', 'use_commits_and_commit_all', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('use_commits_and_commit_all');
        }
      });

      it('parses --action with use_commits_and_stash', () => {
        const result = parseArgs(['--action', 'use_commits_and_stash', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('use_commits_and_stash');
        }
      });

      it('parses --action with create_pr_for_branch', () => {
        const result = parseArgs(['--action', 'create_pr_for_branch', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('create_pr_for_branch');
        }
      });

      it('parses --action with pr_for_branch_commit_all', () => {
        const result = parseArgs(['--action', 'pr_for_branch_commit_all', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('pr_for_branch_commit_all');
        }
      });

      it('parses --action with pr_for_branch_stash', () => {
        const result = parseArgs(['--action', 'pr_for_branch_stash', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('pr_for_branch_stash');
        }
      });

      it('parses --action with branch_from_detached', () => {
        const result = parseArgs(['--action', 'branch_from_detached', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('branch_from_detached');
        }
      });

      it('returns error when --action has no value', () => {
        const result = parseArgs(['--action']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--action requires an action key');
        }
      });

      it('returns error when --action value starts with dash', () => {
        const result = parseArgs(['--action', '-h']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('--action requires an action key');
        }
      });

      it('returns error for invalid action key', () => {
        const result = parseArgs(['--action', 'invalid_action', 'My feature']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('Invalid action: invalid_action');
          expect(result.message).toContain('Valid actions:');
        }
      });

      it('combines --action with --non-interactive', () => {
        const result = parseArgs(['--action', 'commit_all', '--non-interactive', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('commit_all');
          expect(result.options.nonInteractive).toBe(true);
        }
      });

      it('combines --action with --json', () => {
        const result = parseArgs(['--action', 'commit_staged', '--json', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.action).toBe('commit_staged');
          expect(result.options.json).toBe(true);
        }
      });
    });

    describe('--no-hooks flag', () => {
      it('parses --no-hooks flag', () => {
        const result = parseArgs(['--no-hooks', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.noHooks).toBe(true);
        }
      });

      it('defaults noHooks to false', () => {
        const result = parseArgs(['My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.noHooks).toBe(false);
        }
      });
    });

    describe('--json flag', () => {
      it('parses --json flag', () => {
        const result = parseArgs(['--json', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.json).toBe(true);
        }
      });

      it('defaults json to false', () => {
        const result = parseArgs(['My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.json).toBe(false);
        }
      });
    });

    describe('non-interactive flags', () => {
      it('parses -y flag', () => {
        const result = parseArgs(['-y', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.nonInteractive).toBe(true);
        }
      });

      it('parses --yes flag', () => {
        const result = parseArgs(['--yes', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.nonInteractive).toBe(true);
        }
      });

      it('parses --non-interactive flag', () => {
        const result = parseArgs(['--non-interactive', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.nonInteractive).toBe(true);
        }
      });

      it('defaults nonInteractive to false', () => {
        const result = parseArgs(['My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.nonInteractive).toBe(false);
        }
      });
    });

    describe('unknown options', () => {
      it('returns error for unknown option', () => {
        const result = parseArgs(['--unknown', 'My feature']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('Unknown option: --unknown');
        }
      });

      it('returns error for unknown short option', () => {
        const result = parseArgs(['-x', 'My feature']);
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toContain('Unknown option: -x');
        }
      });
    });

    describe('complex argument combinations', () => {
      it('parses multiple flags with description', () => {
        const result = parseArgs(['--install', '--code', '--ready', 'Add auth feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.mode).toBe('new');
          expect(result.options.description).toBe('Add auth feature');
          expect(result.options.installDeps).toBe(true);
          expect(result.options.openEditor).toBe(true);
          expect(result.options.draft).toBe(false);
        }
      });

      it('parses base branch with flags', () => {
        const result = parseArgs(['-b', 'develop', '-i', 'My feature']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.baseBranch).toBe('develop');
          expect(result.options.installDeps).toBe(true);
          expect(result.options.description).toBe('My feature');
        }
      });

      it('parses pr mode with base branch', () => {
        const result = parseArgs(['--pr', '123', '--base', 'develop']);
        expect(result.kind).toBe('success');
        if (result.kind === 'success') {
          expect(result.options.mode).toBe('pr');
          expect(result.options.prNumber).toBe(123);
          expect(result.options.baseBranch).toBe('develop');
        }
      });
    });
  });

  describe('getHelpText', () => {
    it('returns help text string', () => {
      const help = getHelpText();

      expect(help).toContain('newpr');
      expect(help).toContain('Usage:');
      expect(help).toContain('Options:');
      expect(help).toContain('Examples:');
    });

    it('includes all option descriptions', () => {
      const help = getHelpText();

      expect(help).toContain('--pr');
      expect(help).toContain('--branch');
      expect(help).toContain('--base');
      expect(help).toContain('--install');
      expect(help).toContain('--code');
      expect(help).toContain('--ready');
      expect(help).toContain('--no-wtlink');
      expect(help).toContain('--help');
    });
  });
});
