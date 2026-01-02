/**
 * Hook Templates Tests
 */

import { describe, it, expect } from 'vitest';
import {
  HOOK_TEMPLATES,
  getHookTemplate,
  listHookTemplates,
  getTemplateHooks,
  mergeHookTemplates,
  suggestHookTemplates,
  autoDepsTemplate,
  vscodeOpenTemplate,
} from './templates.js';

describe('HOOK_TEMPLATES', () => {
  it('contains expected templates', () => {
    const names = HOOK_TEMPLATES.map((t) => t.name);

    expect(names).toContain('auto-deps');
    expect(names).toContain('auto-deps-pnpm');
    expect(names).toContain('auto-deps-yarn');
    expect(names).toContain('vscode-open');
    expect(names).toContain('cursor-open');
    expect(names).toContain('echo');
    expect(names).toContain('notify');
    expect(names).toContain('git-lfs');
    expect(names).toContain('pre-commit');
    expect(names).toContain('husky');
  });

  it('all templates have required fields', () => {
    for (const template of HOOK_TEMPLATES) {
      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.hooks).toBeDefined();
      expect(Object.keys(template.hooks).length).toBeGreaterThan(0);
    }
  });
});

describe('getHookTemplate', () => {
  it('returns template by name', () => {
    const template = getHookTemplate('auto-deps');

    expect(template).toBeDefined();
    expect(template?.name).toBe('auto-deps');
    expect(template?.hooks['post-worktree']).toBeDefined();
  });

  it('returns undefined for unknown template', () => {
    const template = getHookTemplate('nonexistent-template');

    expect(template).toBeUndefined();
  });
});

describe('listHookTemplates', () => {
  it('returns list with name and description', () => {
    const list = listHookTemplates();

    expect(list.length).toBeGreaterThan(0);
    for (const item of list) {
      expect(item.name).toBeDefined();
      expect(item.description).toBeDefined();
    }
  });

  it('includes all templates', () => {
    const list = listHookTemplates();

    expect(list.length).toBe(HOOK_TEMPLATES.length);
  });
});

describe('getTemplateHooks', () => {
  it('returns hooks for template', () => {
    const hooks = getTemplateHooks('auto-deps');

    expect(hooks).toBeDefined();
    expect(hooks?.['post-worktree']).toBeDefined();
  });

  it('returns undefined for unknown template', () => {
    const hooks = getTemplateHooks('nonexistent');

    expect(hooks).toBeUndefined();
  });
});

describe('mergeHookTemplates', () => {
  it('merges single template', () => {
    const result = mergeHookTemplates('auto-deps');

    expect(result['post-worktree']).toBeDefined();
  });

  it('merges multiple templates', () => {
    const result = mergeHookTemplates('auto-deps', 'vscode-open');

    expect(result['post-worktree']).toBeDefined();
    // Both templates have post-worktree, should be merged
    if (Array.isArray(result['post-worktree'])) {
      expect(result['post-worktree'].length).toBeGreaterThan(1);
    }
  });

  it('combines string hooks into array', () => {
    const result = mergeHookTemplates('vscode-open', 'cursor-open');

    // Both have post-worktree as strings
    expect(result['post-worktree']).toBeDefined();
    if (Array.isArray(result['post-worktree'])) {
      expect(result['post-worktree']).toHaveLength(2);
    }
  });

  it('handles empty template names', () => {
    const result = mergeHookTemplates();

    expect(result).toEqual({});
  });

  it('handles unknown template names', () => {
    const result = mergeHookTemplates('nonexistent', 'auto-deps');

    // Should only have auto-deps hooks
    expect(result['post-worktree']).toBeDefined();
  });
});

describe('suggestHookTemplates', () => {
  it('suggests auto-deps for package.json', () => {
    const suggestions = suggestHookTemplates(['package.json', 'src/index.ts']);

    expect(suggestions).toContain('auto-deps');
  });

  it('suggests auto-deps-pnpm for pnpm-lock.yaml', () => {
    const suggestions = suggestHookTemplates(['package.json', 'pnpm-lock.yaml']);

    expect(suggestions).toContain('auto-deps-pnpm');
    expect(suggestions).not.toContain('auto-deps');
  });

  it('suggests auto-deps-yarn for yarn.lock', () => {
    const suggestions = suggestHookTemplates(['package.json', 'yarn.lock']);

    expect(suggestions).toContain('auto-deps-yarn');
    expect(suggestions).not.toContain('auto-deps');
  });

  it('suggests git-lfs for .gitattributes', () => {
    const suggestions = suggestHookTemplates(['.gitattributes', 'package.json']);

    expect(suggestions).toContain('git-lfs');
  });

  it('suggests pre-commit for .pre-commit-config.yaml', () => {
    const suggestions = suggestHookTemplates(['.pre-commit-config.yaml']);

    expect(suggestions).toContain('pre-commit');
  });

  it('suggests husky for .husky directory', () => {
    const suggestions = suggestHookTemplates(['.husky/_/husky.sh', 'package.json']);

    expect(suggestions).toContain('husky');
  });

  it('returns empty for no matches', () => {
    const suggestions = suggestHookTemplates(['README.md', 'main.go']);

    expect(suggestions).toEqual([]);
  });

  it('is case insensitive', () => {
    const suggestions = suggestHookTemplates(['PACKAGE.JSON', '.GITATTRIBUTES']);

    expect(suggestions).toContain('auto-deps');
    expect(suggestions).toContain('git-lfs');
  });
});

describe('Individual templates', () => {
  describe('autoDepsTemplate', () => {
    it('has correct structure', () => {
      expect(autoDepsTemplate.name).toBe('auto-deps');
      expect(autoDepsTemplate.hooks['post-worktree']).toBeDefined();
      expect(autoDepsTemplate.conditions?.filesExist).toContain('package.json');
    });

    it('has npm install command', () => {
      const hook = autoDepsTemplate.hooks['post-worktree'];
      expect(typeof hook === 'object' && !Array.isArray(hook)).toBe(true);
      if (typeof hook === 'object' && !Array.isArray(hook)) {
        expect(hook.command).toContain('npm install');
        expect(hook.if).toBe('exists:package.json');
      }
    });
  });

  describe('vscodeOpenTemplate', () => {
    it('has correct structure', () => {
      expect(vscodeOpenTemplate.name).toBe('vscode-open');
      expect(vscodeOpenTemplate.hooks['post-worktree']).toBeDefined();
    });

    it('opens worktree path in vscode', () => {
      const hook = vscodeOpenTemplate.hooks['post-worktree'];
      expect(typeof hook).toBe('string');
      expect(hook).toContain('code');
      expect(hook).toContain('{{WORKTREE_PATH}}');
    });
  });
});
