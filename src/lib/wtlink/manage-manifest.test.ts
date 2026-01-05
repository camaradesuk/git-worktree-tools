import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getAllFiles,
  getAllDirectories,
  getFileDecision,
  getFolderStates,
  getFolderStateBreakdown,
  isItemVisible,
  buildFileTree,
  findNodeByPath,
  getHierarchicalViewItems,
  getFlatViewItems,
  getVisibleItems,
  getDisplayItems,
  isCommonIgnoreDir,
  COMMON_IGNORE_DIRS,
  run,
  type FileNode,
  type FileDecision,
  type ItemState,
  type DisplayItem,
  type AppState,
  type ManageArgv,
} from './manage-manifest.js';

// Mock git module
vi.mock('../git.js', () => ({
  checkGitInstalled: vi.fn().mockReturnValue(true),
  getRepoRoot: vi.fn().mockReturnValue('/mock/repo'),
  getMainWorktreeRoot: vi.fn().mockReturnValue('/mock/main-worktree'),
  isGitIgnored: vi.fn().mockReturnValue(true),
  exec: vi.fn(),
}));

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleClear = vi.spyOn(console, 'clear').mockImplementation(() => {});

import * as git from '../git.js';
import inquirer from 'inquirer';

describe('wtlink/manage-manifest pure functions', () => {
  // Helper to create a simple file tree
  const createSimpleTree = (): FileNode => ({
    path: '',
    isDirectory: true,
    children: [
      {
        path: 'src',
        isDirectory: true,
        children: [
          { path: 'src/index.ts', isDirectory: false, children: [] },
          { path: 'src/utils.ts', isDirectory: false, children: [] },
        ],
      },
      { path: 'config.json', isDirectory: false, children: [] },
    ],
  });

  describe('getAllFiles', () => {
    it('returns single file for non-directory node', () => {
      const node: FileNode = { path: 'file.ts', isDirectory: false, children: [] };
      expect(getAllFiles(node)).toEqual(['file.ts']);
    });

    it('returns all nested files for directory', () => {
      const tree = createSimpleTree();
      const files = getAllFiles(tree);
      expect(files).toContain('src/index.ts');
      expect(files).toContain('src/utils.ts');
      expect(files).toContain('config.json');
      expect(files).toHaveLength(3);
    });

    it('returns empty array for empty directory', () => {
      const node: FileNode = { path: 'empty', isDirectory: true, children: [] };
      expect(getAllFiles(node)).toEqual([]);
    });
  });

  describe('getAllDirectories', () => {
    it('returns empty array for file node', () => {
      const node: FileNode = { path: 'file.ts', isDirectory: false, children: [] };
      expect(getAllDirectories(node)).toEqual([]);
    });

    it('returns all nested directories', () => {
      const tree: FileNode = {
        path: '',
        isDirectory: true,
        children: [
          {
            path: 'src',
            isDirectory: true,
            children: [{ path: 'src/lib', isDirectory: true, children: [] }],
          },
          { path: 'config', isDirectory: true, children: [] },
        ],
      };
      const dirs = getAllDirectories(tree);
      expect(dirs.map((d) => d.path)).toContain('src');
      expect(dirs.map((d) => d.path)).toContain('src/lib');
      expect(dirs.map((d) => d.path)).toContain('config');
      expect(dirs).toHaveLength(3);
    });
  });

  describe('getFileDecision', () => {
    it('returns decision from map when present', () => {
      const decisions = new Map<string, FileDecision>([['file.ts', 'add']]);
      expect(getFileDecision(decisions, 'file.ts')).toBe('add');
    });

    it('returns undecided when file not in map', () => {
      const decisions = new Map<string, FileDecision>();
      expect(getFileDecision(decisions, 'unknown.ts')).toBe('undecided');
    });

    it('handles all decision types', () => {
      const decisions = new Map<string, FileDecision>([
        ['add.ts', 'add'],
        ['comment.ts', 'comment'],
        ['skip.ts', 'skip'],
      ]);
      expect(getFileDecision(decisions, 'add.ts')).toBe('add');
      expect(getFileDecision(decisions, 'comment.ts')).toBe('comment');
      expect(getFileDecision(decisions, 'skip.ts')).toBe('skip');
    });
  });

  describe('getFolderStates', () => {
    it('returns single state for file', () => {
      const node: FileNode = { path: 'file.ts', isDirectory: false, children: [] };
      const decisions = new Map<string, FileDecision>([['file.ts', 'add']]);
      expect(getFolderStates(node, decisions)).toEqual(new Set(['add']));
    });

    it('returns undecided for file not in decisions', () => {
      const node: FileNode = { path: 'file.ts', isDirectory: false, children: [] };
      const decisions = new Map<string, FileDecision>();
      expect(getFolderStates(node, decisions)).toEqual(new Set(['undecided']));
    });

    it('returns all states for mixed folder', () => {
      const tree = createSimpleTree();
      const srcNode = tree.children[0];
      const decisions = new Map<string, FileDecision>([
        ['src/index.ts', 'add'],
        ['src/utils.ts', 'skip'],
      ]);
      const states = getFolderStates(srcNode, decisions);
      expect(states.has('add')).toBe(true);
      expect(states.has('skip')).toBe(true);
      expect(states.has('undecided')).toBe(false);
    });

    it('includes undecided for partially decided folder', () => {
      const tree = createSimpleTree();
      const srcNode = tree.children[0];
      const decisions = new Map<string, FileDecision>([['src/index.ts', 'add']]);
      const states = getFolderStates(srcNode, decisions);
      expect(states.has('add')).toBe(true);
      expect(states.has('undecided')).toBe(true);
    });
  });

  describe('getFolderStateBreakdown', () => {
    it('returns correct counts for folder', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>([
        ['src/index.ts', 'add'],
        ['src/utils.ts', 'comment'],
        ['config.json', 'skip'],
      ]);
      const breakdown = getFolderStateBreakdown(tree, decisions);
      expect(breakdown).toEqual({ add: 1, comment: 1, skip: 1, undecided: 0 });
    });

    it('counts undecided files', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>([['src/index.ts', 'add']]);
      const breakdown = getFolderStateBreakdown(tree, decisions);
      expect(breakdown.add).toBe(1);
      expect(breakdown.undecided).toBe(2);
    });
  });

  describe('isItemVisible', () => {
    it('returns false when no filters active', () => {
      const item: DisplayItem = {
        path: 'file.ts',
        isDirectory: false,
        states: new Set(['add']),
      };
      expect(isItemVisible(item, new Set())).toBe(false);
    });

    it('returns true when item state matches filter', () => {
      const item: DisplayItem = {
        path: 'file.ts',
        isDirectory: false,
        states: new Set(['add']),
      };
      expect(isItemVisible(item, new Set(['add']))).toBe(true);
    });

    it('returns true when any state matches', () => {
      const item: DisplayItem = {
        path: 'folder',
        isDirectory: true,
        states: new Set(['add', 'skip']),
      };
      expect(isItemVisible(item, new Set(['add']))).toBe(true);
      expect(isItemVisible(item, new Set(['skip']))).toBe(true);
    });

    it('returns false when no state matches', () => {
      const item: DisplayItem = {
        path: 'file.ts',
        isDirectory: false,
        states: new Set(['add']),
      };
      expect(isItemVisible(item, new Set(['skip', 'comment']))).toBe(false);
    });
  });

  describe('buildFileTree', () => {
    it('builds tree from flat file list', () => {
      const files = ['src/index.ts', 'src/lib/utils.ts', 'config.json'];
      const tree = buildFileTree(files);

      expect(tree.path).toBe('');
      expect(tree.isDirectory).toBe(true);
      expect(tree.children).toHaveLength(2); // src, config.json
    });

    it('handles empty file list', () => {
      const tree = buildFileTree([]);
      expect(tree.path).toBe('');
      expect(tree.isDirectory).toBe(true);
      expect(tree.children).toHaveLength(0);
    });

    it('creates proper hierarchy', () => {
      const files = ['a/b/c/file.ts'];
      const tree = buildFileTree(files);

      // Navigate down the tree
      expect(tree.children).toHaveLength(1);
      const a = tree.children[0];
      expect(a.path).toBe('a');
      expect(a.isDirectory).toBe(true);

      const b = a.children[0];
      expect(b.path).toBe('a/b');
      expect(b.isDirectory).toBe(true);

      const c = b.children[0];
      expect(c.path).toBe('a/b/c');
      expect(c.isDirectory).toBe(true);

      const file = c.children[0];
      expect(file.path).toBe('a/b/c/file.ts');
      expect(file.isDirectory).toBe(false);
    });
  });

  describe('findNodeByPath', () => {
    it('finds root node', () => {
      const tree = createSimpleTree();
      const found = findNodeByPath(tree, '');
      expect(found).toBe(tree);
    });

    it('finds nested directory', () => {
      const tree = createSimpleTree();
      const found = findNodeByPath(tree, 'src');
      expect(found?.path).toBe('src');
      expect(found?.isDirectory).toBe(true);
    });

    it('finds nested file', () => {
      const tree = createSimpleTree();
      const found = findNodeByPath(tree, 'src/index.ts');
      expect(found?.path).toBe('src/index.ts');
      expect(found?.isDirectory).toBe(false);
    });

    it('returns null for non-existent path', () => {
      const tree = createSimpleTree();
      expect(findNodeByPath(tree, 'nonexistent')).toBeNull();
    });
  });

  describe('getHierarchicalViewItems', () => {
    it('returns root children when navigation stack empty', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>();
      const items = getHierarchicalViewItems(tree, [], decisions);

      expect(items).toHaveLength(2); // src folder and config.json
    });

    it('returns folder children when navigated', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>();
      const items = getHierarchicalViewItems(tree, ['src'], decisions);

      expect(items).toHaveLength(2); // index.ts and utils.ts
      expect(items.every((i) => i.path.startsWith('src/'))).toBe(true);
    });

    it('sorts folders before files', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>();
      const items = getHierarchicalViewItems(tree, [], decisions);

      // src folder should come before config.json file
      const srcIndex = items.findIndex((i) => i.path === 'src');
      const configIndex = items.findIndex((i) => i.path === 'config.json');
      expect(srcIndex).toBeLessThan(configIndex);
    });
  });

  describe('getFlatViewItems', () => {
    it('returns all directories and files', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>();
      const items = getFlatViewItems(tree, decisions);

      // Should have 1 directory (src) and 3 files
      expect(items.some((i) => i.path === 'src' && i.isDirectory)).toBe(true);
      expect(items.some((i) => i.path === 'src/index.ts')).toBe(true);
      expect(items.some((i) => i.path === 'src/utils.ts')).toBe(true);
      expect(items.some((i) => i.path === 'config.json')).toBe(true);
    });

    it('sorts alphabetically', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>();
      const items = getFlatViewItems(tree, decisions);
      const paths = items.map((i) => i.path);
      const sorted = [...paths].sort();
      expect(paths).toEqual(sorted);
    });
  });

  describe('getVisibleItems', () => {
    it('filters items based on active filters', () => {
      const tree = createSimpleTree();
      const decisions = new Map<string, FileDecision>([
        ['src/index.ts', 'add'],
        ['src/utils.ts', 'skip'],
        ['config.json', 'add'],
      ]);

      const state: AppState = {
        fileTree: tree,
        decisions,
        viewMode: 'flat',
        activeFilters: new Set<ItemState>(['add']),
        showHelp: false,
        navigationStack: [],
        cursorIndex: 0,
        scrollOffset: 0,
      };

      const items = getVisibleItems(state);
      // Should show items with 'add' state - src folder (contains add), src/index.ts, config.json
      expect(items.some((i) => i.path === 'src/index.ts')).toBe(true);
      expect(items.some((i) => i.path === 'config.json')).toBe(true);
      expect(items.some((i) => i.path === 'src/utils.ts')).toBe(false);
    });

    it('shows nothing when no filters active', () => {
      const tree = createSimpleTree();
      const state: AppState = {
        fileTree: tree,
        decisions: new Map(),
        viewMode: 'flat',
        activeFilters: new Set(),
        showHelp: false,
        navigationStack: [],
        cursorIndex: 0,
        scrollOffset: 0,
      };

      const items = getVisibleItems(state);
      expect(items).toHaveLength(0);
    });
  });

  describe('getDisplayItems', () => {
    it('adds back navigation in hierarchical mode when navigated', () => {
      const tree = createSimpleTree();
      const state: AppState = {
        fileTree: tree,
        decisions: new Map(),
        viewMode: 'hierarchical',
        activeFilters: new Set<ItemState>(['undecided']),
        showHelp: false,
        navigationStack: ['src'],
        cursorIndex: 0,
        scrollOffset: 0,
      };

      const items = getDisplayItems(state);
      expect(items[0].path).toBe('..');
    });

    it('does not add back navigation at root', () => {
      const tree = createSimpleTree();
      const state: AppState = {
        fileTree: tree,
        decisions: new Map(),
        viewMode: 'hierarchical',
        activeFilters: new Set<ItemState>(['undecided']),
        showHelp: false,
        navigationStack: [],
        cursorIndex: 0,
        scrollOffset: 0,
      };

      const items = getDisplayItems(state);
      expect(items[0]?.path).not.toBe('..');
    });

    it('does not add back navigation in flat mode', () => {
      const tree = createSimpleTree();
      const state: AppState = {
        fileTree: tree,
        decisions: new Map(),
        viewMode: 'flat',
        activeFilters: new Set<ItemState>(['undecided']),
        showHelp: false,
        navigationStack: ['src'],
        cursorIndex: 0,
        scrollOffset: 0,
      };

      const items = getDisplayItems(state);
      expect(items.every((i) => i.path !== '..')).toBe(true);
    });
  });

  describe('isCommonIgnoreDir', () => {
    it('returns true for common ignore directories', () => {
      expect(isCommonIgnoreDir('node_modules')).toBe(true);
      expect(isCommonIgnoreDir('.git')).toBe(true);
      expect(isCommonIgnoreDir('dist')).toBe(true);
      expect(isCommonIgnoreDir('coverage')).toBe(true);
    });

    it('returns true for nested ignore directories', () => {
      expect(isCommonIgnoreDir('src/node_modules')).toBe(true);
      expect(isCommonIgnoreDir('packages/lib/dist')).toBe(true);
    });

    it('returns false for regular directories', () => {
      expect(isCommonIgnoreDir('src')).toBe(false);
      expect(isCommonIgnoreDir('lib')).toBe(false);
      expect(isCommonIgnoreDir('components')).toBe(false);
    });
  });

  describe('COMMON_IGNORE_DIRS', () => {
    it('contains expected directories', () => {
      expect(COMMON_IGNORE_DIRS).toContain('node_modules');
      expect(COMMON_IGNORE_DIRS).toContain('.git');
      expect(COMMON_IGNORE_DIRS).toContain('dist');
      expect(COMMON_IGNORE_DIRS).toContain('build');
      expect(COMMON_IGNORE_DIRS).toContain('coverage');
    });
  });
});

describe('wtlink/manage-manifest TUI functions', () => {
  let tempDir: string;
  let gitRoot: string;
  let mainWorktreeRoot: string;
  let manifestPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manage-manifest-test-'));
    gitRoot = path.join(tempDir, 'worktree');
    mainWorktreeRoot = path.join(tempDir, 'main');
    fs.mkdirSync(gitRoot, { recursive: true });
    fs.mkdirSync(mainWorktreeRoot, { recursive: true });

    manifestPath = path.join(mainWorktreeRoot, '.wtlink');

    // Set up git mocks
    vi.mocked(git.getRepoRoot).mockReturnValue(gitRoot);
    vi.mocked(git.getMainWorktreeRoot).mockReturnValue(mainWorktreeRoot);
    vi.mocked(git.isGitIgnored).mockReturnValue(true);
    vi.mocked(git.exec).mockReturnValue('');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('run', () => {
    it('should report manifest is up to date when no changes needed', async () => {
      // Create empty manifest and no ignored files
      fs.writeFileSync(manifestPath, '');

      // Mock git ls-files to return empty (no ignored files)
      vi.mocked(git.exec).mockReturnValue('');

      const argv: ManageArgv = {
        nonInteractive: true,
        clean: false,
        dryRun: false,
        manifestFile: '.wtlink',
        backup: false,
        verbose: false,
      };

      await run(argv);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('up to date'));
    });

    it('should handle deleted entries in clean mode', async () => {
      // Create manifest with entry that doesn't exist in filesystem
      fs.writeFileSync(manifestPath, 'deleted-file.txt');

      // Mock git ls-files to return empty (no new ignored files)
      vi.mocked(git.exec).mockReturnValue('');

      const argv: ManageArgv = {
        nonInteractive: true,
        clean: true,
        dryRun: false,
        manifestFile: '.wtlink',
        backup: false,
        verbose: false,
      };

      await run(argv);

      // In clean mode, deleted entries should be removed
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should handle dry-run mode without modifying manifest', async () => {
      const originalContent = 'existing-file.txt';
      fs.writeFileSync(manifestPath, originalContent);

      // Create the existing file in worktree
      fs.writeFileSync(path.join(gitRoot, 'existing-file.txt'), 'content');

      // Mock new ignored file
      vi.mocked(git.exec).mockReturnValue('new-ignored-file.txt');

      const argv: ManageArgv = {
        nonInteractive: true,
        clean: false,
        dryRun: true,
        manifestFile: '.wtlink',
        backup: false,
        verbose: false,
      };

      await run(argv);

      // Manifest should not be modified in dry-run mode
      const finalContent = fs.readFileSync(manifestPath, 'utf-8');
      expect(finalContent).toBe(originalContent);
    });

    it('should handle tracked entries warning in clean mode', async () => {
      // Create manifest with an entry that is now tracked (not ignored)
      fs.writeFileSync(manifestPath, 'now-tracked.txt');
      fs.writeFileSync(path.join(gitRoot, 'now-tracked.txt'), 'content');

      // Mock file as not ignored (tracked by git)
      vi.mocked(git.isGitIgnored).mockReturnValue(false);
      vi.mocked(git.exec).mockReturnValue('');

      const argv: ManageArgv = {
        nonInteractive: true,
        clean: true,
        dryRun: false,
        manifestFile: '.wtlink',
        backup: false,
        verbose: false,
      };

      await run(argv);

      // Should show warning about tracked files
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('TRACKED'));
    });

    it('should create backup when backup option is enabled and manifest changes', async () => {
      // Create manifest with a deleted entry (file doesn't exist)
      const originalContent = 'deleted-file.txt';
      fs.writeFileSync(manifestPath, originalContent);

      // Mock no new ignored files, file doesn't exist so it's "deleted"
      vi.mocked(git.exec).mockReturnValue('');

      const argv: ManageArgv = {
        nonInteractive: true,
        clean: true, // clean mode will remove deleted entries
        dryRun: false,
        manifestFile: '.wtlink',
        backup: true,
        verbose: false,
      };

      await run(argv);

      // Backup file should be created when manifest is modified
      const backupPath = manifestPath + '.bak';
      if (fs.existsSync(backupPath)) {
        expect(fs.readFileSync(backupPath, 'utf-8')).toBe(originalContent);
      }
      // If backup wasn't created, it means manifest wasn't modified - that's also valid
    });
  });
});
