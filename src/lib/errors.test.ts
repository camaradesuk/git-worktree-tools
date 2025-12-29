import { describe, it, expect } from 'vitest';
import {
  WorktreeToolsError,
  GitCommandError,
  GitHubCliError,
  ConfigurationError,
  WorktreeError,
  ManifestError,
  UserCancelledError,
  isWorktreeToolsError,
  isGitCommandError,
  isGitHubCliError,
} from './errors.js';

describe('errors', () => {
  describe('WorktreeToolsError', () => {
    it('should create error with message', () => {
      const error = new WorktreeToolsError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('WorktreeToolsError');
    });

    it('should be instanceof Error', () => {
      const error = new WorktreeToolsError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('GitCommandError', () => {
    it('should create error with command info', () => {
      const error = new GitCommandError('Git failed', {
        command: 'git status',
        exitCode: 128,
        stderr: 'fatal: not a git repository',
      });

      expect(error.message).toBe('Git failed');
      expect(error.name).toBe('GitCommandError');
      expect(error.command).toBe('git status');
      expect(error.exitCode).toBe(128);
      expect(error.stderr).toBe('fatal: not a git repository');
    });

    it('should be instanceof WorktreeToolsError', () => {
      const error = new GitCommandError('Test', { command: 'git' });
      expect(error).toBeInstanceOf(WorktreeToolsError);
    });
  });

  describe('GitHubCliError', () => {
    it('should create error with command info', () => {
      const error = new GitHubCliError('GitHub CLI failed', {
        command: 'gh pr create',
        stderr: 'not authenticated',
      });

      expect(error.message).toBe('GitHub CLI failed');
      expect(error.name).toBe('GitHubCliError');
      expect(error.command).toBe('gh pr create');
      expect(error.stderr).toBe('not authenticated');
    });
  });

  describe('ConfigurationError', () => {
    it('should create error with config details', () => {
      const error = new ConfigurationError('Invalid config', {
        configFile: '.worktreerc',
        field: 'baseBranch',
      });

      expect(error.message).toBe('Invalid config');
      expect(error.name).toBe('ConfigurationError');
      expect(error.configFile).toBe('.worktreerc');
      expect(error.field).toBe('baseBranch');
    });

    it('should work without options', () => {
      const error = new ConfigurationError('Invalid config');
      expect(error.configFile).toBeUndefined();
      expect(error.field).toBeUndefined();
    });
  });

  describe('WorktreeError', () => {
    it('should create error with worktree details', () => {
      const error = new WorktreeError('Worktree failed', {
        worktreePath: '/home/user/project.pr42',
        branch: 'feature/test',
      });

      expect(error.message).toBe('Worktree failed');
      expect(error.name).toBe('WorktreeError');
      expect(error.worktreePath).toBe('/home/user/project.pr42');
      expect(error.branch).toBe('feature/test');
    });
  });

  describe('ManifestError', () => {
    it('should create error with manifest details', () => {
      const error = new ManifestError('Manifest invalid', {
        manifestPath: '.wtlinkrc',
        issues: ['Missing file: .env', 'Duplicate entry: .vscode/settings.json'],
      });

      expect(error.message).toBe('Manifest invalid');
      expect(error.name).toBe('ManifestError');
      expect(error.manifestPath).toBe('.wtlinkrc');
      expect(error.issues).toHaveLength(2);
    });
  });

  describe('UserCancelledError', () => {
    it('should create error with default message', () => {
      const error = new UserCancelledError();
      expect(error.message).toBe('Operation cancelled by user');
      expect(error.name).toBe('UserCancelledError');
    });

    it('should create error with custom message', () => {
      const error = new UserCancelledError('User aborted PR creation');
      expect(error.message).toBe('User aborted PR creation');
    });
  });

  describe('type guards', () => {
    it('isWorktreeToolsError should identify errors correctly', () => {
      expect(isWorktreeToolsError(new WorktreeToolsError('test'))).toBe(true);
      expect(isWorktreeToolsError(new GitCommandError('test', { command: 'git' }))).toBe(true);
      expect(isWorktreeToolsError(new Error('test'))).toBe(false);
      expect(isWorktreeToolsError('string')).toBe(false);
      expect(isWorktreeToolsError(null)).toBe(false);
    });

    it('isGitCommandError should identify errors correctly', () => {
      expect(isGitCommandError(new GitCommandError('test', { command: 'git' }))).toBe(true);
      expect(isGitCommandError(new WorktreeToolsError('test'))).toBe(false);
      expect(isGitCommandError(new Error('test'))).toBe(false);
    });

    it('isGitHubCliError should identify errors correctly', () => {
      expect(isGitHubCliError(new GitHubCliError('test', { command: 'gh' }))).toBe(true);
      expect(isGitHubCliError(new WorktreeToolsError('test'))).toBe(false);
      expect(isGitHubCliError(new Error('test'))).toBe(false);
    });
  });
});
