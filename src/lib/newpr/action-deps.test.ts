/**
 * Tests for action-deps.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActionDeps } from './action-deps.js';
import * as git from '../git.js';

// Mock the git module
vi.mock('../git.js', () => ({
  add: vi.fn(),
  stash: vi.fn(),
  push: vi.fn(),
  commit: vi.fn(),
}));

describe('action-deps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createActionDeps', () => {
    it('creates ActionDeps object with all required functions', () => {
      const deps = createActionDeps();

      expect(deps).toHaveProperty('gitAdd');
      expect(deps).toHaveProperty('gitStash');
      expect(deps).toHaveProperty('gitPush');
      expect(deps).toHaveProperty('gitCommit');

      expect(typeof deps.gitAdd).toBe('function');
      expect(typeof deps.gitStash).toBe('function');
      expect(typeof deps.gitPush).toBe('function');
      expect(typeof deps.gitCommit).toBe('function');
    });

    describe('gitAdd', () => {
      it('calls git.add with path and default cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitAdd('file.txt');

        expect(git.add).toHaveBeenCalledWith('file.txt', '/default/cwd');
      });

      it('calls git.add with path and explicit cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitAdd('file.txt', '/explicit/cwd');

        expect(git.add).toHaveBeenCalledWith('file.txt', '/explicit/cwd');
      });

      it('calls git.add with path when no default cwd provided', async () => {
        const deps = createActionDeps();

        await deps.gitAdd('file.txt');

        expect(git.add).toHaveBeenCalledWith('file.txt', undefined);
      });
    });

    describe('gitStash', () => {
      it('calls git.stash with options and default cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitStash({ message: 'WIP', keepIndex: true });

        expect(git.stash).toHaveBeenCalledWith({ message: 'WIP', keepIndex: true }, '/default/cwd');
      });

      it('calls git.stash with options and explicit cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitStash({ message: 'WIP' }, '/explicit/cwd');

        expect(git.stash).toHaveBeenCalledWith(
          { message: 'WIP', keepIndex: undefined },
          '/explicit/cwd'
        );
      });

      it('calls git.stash without keepIndex', async () => {
        const deps = createActionDeps();

        await deps.gitStash({ message: 'stash message' });

        expect(git.stash).toHaveBeenCalledWith(
          { message: 'stash message', keepIndex: undefined },
          undefined
        );
      });
    });

    describe('gitPush', () => {
      it('calls git.push with options and default cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitPush({ remote: 'origin', branch: 'main', setUpstream: true });

        expect(git.push).toHaveBeenCalledWith(
          { remote: 'origin', branch: 'main', setUpstream: true },
          '/default/cwd'
        );
      });

      it('calls git.push with options and explicit cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitPush({ remote: 'origin', branch: 'feat' }, '/explicit/cwd');

        expect(git.push).toHaveBeenCalledWith(
          { remote: 'origin', branch: 'feat', setUpstream: undefined },
          '/explicit/cwd'
        );
      });

      it('calls git.push without setUpstream', async () => {
        const deps = createActionDeps();

        await deps.gitPush({ remote: 'upstream', branch: 'develop' });

        expect(git.push).toHaveBeenCalledWith(
          { remote: 'upstream', branch: 'develop', setUpstream: undefined },
          undefined
        );
      });
    });

    describe('gitCommit', () => {
      it('calls git.commit with options and default cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitCommit({ message: 'feat: add feature', allowEmpty: true });

        expect(git.commit).toHaveBeenCalledWith(
          { message: 'feat: add feature', allowEmpty: true },
          '/default/cwd'
        );
      });

      it('calls git.commit with options and explicit cwd', async () => {
        const deps = createActionDeps('/default/cwd');

        await deps.gitCommit({ message: 'fix: bug' }, '/explicit/cwd');

        expect(git.commit).toHaveBeenCalledWith(
          { message: 'fix: bug', allowEmpty: undefined },
          '/explicit/cwd'
        );
      });

      it('calls git.commit without allowEmpty', async () => {
        const deps = createActionDeps();

        await deps.gitCommit({ message: 'docs: update readme' });

        expect(git.commit).toHaveBeenCalledWith(
          { message: 'docs: update readme', allowEmpty: undefined },
          undefined
        );
      });
    });

    it('uses explicit cwd over default cwd for all operations', async () => {
      const deps = createActionDeps('/default');

      await deps.gitAdd('.', '/explicit');
      await deps.gitStash({ message: 'test' }, '/explicit');
      await deps.gitPush({ remote: 'origin', branch: 'main' }, '/explicit');
      await deps.gitCommit({ message: 'test' }, '/explicit');

      expect(git.add).toHaveBeenCalledWith('.', '/explicit');
      expect(git.stash).toHaveBeenCalledWith(expect.anything(), '/explicit');
      expect(git.push).toHaveBeenCalledWith(expect.anything(), '/explicit');
      expect(git.commit).toHaveBeenCalledWith(expect.anything(), '/explicit');
    });
  });
});
