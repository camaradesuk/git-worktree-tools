import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import * as colors from '../colors.js';
import * as readline from 'readline';
import { signal, computed } from '@preact/signals-core';

// ============================================================================
// TYPES - Clear type definitions for the domain
// ============================================================================

// User decisions for files (stored in decisions map)
type FileDecision = 'add' | 'comment' | 'skip';

// Computed states (includes explicit 'undecided' for items not in decisions map)
type ItemState = FileDecision | 'undecided';

type ViewMode = 'flat' | 'hierarchical';

interface FileNode {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly children: ReadonlyArray<FileNode>;
}

interface AppState {
  readonly fileTree: FileNode;
  readonly decisions: ReadonlyMap<string, FileDecision>; // only decided files (undecided files NOT in map)
  readonly viewMode: ViewMode;
  readonly activeFilters: ReadonlySet<ItemState>; // which states to show (includes 'undecided')
  readonly showHelp: boolean;
  readonly navigationStack: ReadonlyArray<string>; // paths of parent directories
  readonly cursorIndex: number;
  readonly scrollOffset: number;
}

interface DisplayItem {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly node?: FileNode;
  readonly states: ReadonlySet<ItemState>; // EXPLICIT: folder can have multiple states including 'undecided'
}

export interface ManageArgv {
  nonInteractive: boolean;
  clean: boolean;
  dryRun: boolean;
  manifestFile: string;
  backup: boolean;
}

// ============================================================================
// PURE FUNCTIONS - State computation and derivation
// ============================================================================

/**
 * Get all file paths from a node (recursively)
 */
function getAllFiles(node: FileNode): string[] {
  if (!node.isDirectory) {
    return [node.path];
  }
  return node.children.flatMap((child) => getAllFiles(child));
}

/**
 * Get all directory nodes from a tree (recursively)
 */
function getAllDirectories(node: FileNode): FileNode[] {
  if (!node.isDirectory) {
    return [];
  }

  const directories: FileNode[] = [];
  for (const child of node.children) {
    if (child.isDirectory) {
      directories.push(child);
      directories.push(...getAllDirectories(child));
    }
  }
  return directories;
}

/**
 * Get the computed state for a single file
 * Returns 'undecided' (explicit state) if file not in decisions map
 */
function getFileDecision(
  decisions: ReadonlyMap<string, FileDecision>,
  filePath: string
): ItemState {
  return decisions.get(filePath) ?? 'undecided';
}

/**
 * Get all computed states present in a folder's descendants
 * A folder can have multiple states if children have different states
 * This is DERIVED from children - folders don't have their own decision
 * 'undecided' is an explicit state for items with no decision
 */
function getFolderStates(
  node: FileNode,
  decisions: ReadonlyMap<string, FileDecision>
): ReadonlySet<ItemState> {
  if (!node.isDirectory) {
    return new Set([getFileDecision(decisions, node.path)]);
  }

  const states = new Set<ItemState>();
  const allFiles = getAllFiles(node);

  for (const filePath of allFiles) {
    states.add(getFileDecision(decisions, filePath));
  }

  return states;
}

/**
 * Get state breakdown counts for a folder
 */
function getFolderStateBreakdown(
  node: FileNode,
  decisions: ReadonlyMap<string, FileDecision>
): { add: number; comment: number; skip: number; undecided: number } {
  const breakdown = { add: 0, comment: 0, skip: 0, undecided: 0 };
  const allFiles = getAllFiles(node);

  for (const filePath of allFiles) {
    const decision = getFileDecision(decisions, filePath);
    breakdown[decision]++;
  }

  return breakdown;
}

/**
 * Check if an item should be visible based on current filters
 * An item is visible if it has at least one state matching the active filters
 * Default: only 'undecided' filter is active (shows undecided items)
 */
function isItemVisible(
  item: DisplayItem,
  activeFilters: ReadonlySet<ItemState>
): boolean {
  // If no filters active, nothing is visible (edge case)
  if (activeFilters.size === 0) {
    return false;
  }

  // Item visible if it has any matching state
  for (const filter of activeFilters) {
    if (item.states.has(filter)) {
      return true;
    }
  }

  return false;
}

/**
 * Build file tree from flat list of file paths
 */
function buildFileTree(filePaths: string[]): FileNode {
  interface MutableFileNode {
    path: string;
    isDirectory: boolean;
    children: MutableFileNode[];
  }

  const root: MutableFileNode = {
    path: '',
    isDirectory: true,
    children: [],
  };

  const nodeMap = new Map<string, MutableFileNode>();
  nodeMap.set('', root);

  for (const filePath of filePaths) {
    const parts = filePath.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;

      if (!nodeMap.has(currentPath)) {
        const node: MutableFileNode = {
          path: currentPath,
          isDirectory: !isLastPart,
          children: isLastPart ? [] : [],
        };

        nodeMap.set(currentPath, node);

        // Add to parent's children
        const parent = nodeMap.get(parentPath)!;
        parent.children.push(node);
      }
    }
  }

  // Make immutable
  function makeImmutable(node: MutableFileNode): FileNode {
    return {
      path: node.path,
      isDirectory: node.isDirectory,
      children: node.children.map(makeImmutable),
    };
  }

  return makeImmutable(root);
}

/**
 * Find a node by path in the tree
 */
function findNodeByPath(tree: FileNode, targetPath: string): FileNode | null {
  if (tree.path === targetPath) {
    return tree;
  }

  for (const child of tree.children) {
    const found = findNodeByPath(child, targetPath);
    if (found) return found;
  }

  return null;
}

/**
 * Get items to display in hierarchical view
 * Folders appear first, then files (both alphabetically sorted within their groups)
 */
function getHierarchicalViewItems(
  tree: FileNode,
  navigationStack: ReadonlyArray<string>,
  decisions: ReadonlyMap<string, FileDecision>
): DisplayItem[] {
  // Navigate to current directory
  let currentNode = tree;
  for (const dirPath of navigationStack) {
    const found = findNodeByPath(currentNode, dirPath);
    if (found) {
      currentNode = found;
    }
  }

  // Get children of current directory
  const items: DisplayItem[] = currentNode.children.map((child) => ({
    path: child.path,
    isDirectory: child.isDirectory,
    node: child,
    states: getFolderStates(child, decisions),
  }));

  // Separate folders and files
  const folders = items.filter((item) => item.isDirectory);
  const files = items.filter((item) => !item.isDirectory);

  // Sort each group alphabetically by path
  folders.sort((a, b) => a.path.localeCompare(b.path));
  files.sort((a, b) => a.path.localeCompare(b.path));

  // Return folders first, then files
  return [...folders, ...files];
}

/**
 * Get items to display in flat view
 */
function getFlatViewItems(
  tree: FileNode,
  decisions: ReadonlyMap<string, FileDecision>
): DisplayItem[] {
  const items: DisplayItem[] = [];

  // Add all directories
  const allDirs = getAllDirectories(tree);
  for (const dir of allDirs) {
    items.push({
      path: dir.path,
      isDirectory: true,
      node: dir,
      states: getFolderStates(dir, decisions),
    });
  }

  // Add all files
  const allFiles = getAllFiles(tree);
  for (const filePath of allFiles) {
    const decision = getFileDecision(decisions, filePath);
    items.push({
      path: filePath,
      isDirectory: false,
      states: new Set([decision]),
    });
  }

  // Sort alphabetically
  return items.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Get all visible items for current state (SINGLE SOURCE OF TRUTH)
 */
function getVisibleItems(state: AppState): DisplayItem[] {
  // Get items based on view mode
  const allItems =
    state.viewMode === 'flat'
      ? getFlatViewItems(state.fileTree, state.decisions)
      : getHierarchicalViewItems(
          state.fileTree,
          state.navigationStack,
          state.decisions
        );

  // Filter based on active filters (no duplication possible)
  return allItems.filter((item) => isItemVisible(item, state.activeFilters));
}

/**
 * Get display items with back navigation if needed
 */
function getDisplayItems(state: AppState): DisplayItem[] {
  const items = getVisibleItems(state);

  // Add back navigation in hierarchical view when in default undecided-only mode
  const showingUndecidedOnly =
    state.activeFilters.size === 1 && state.activeFilters.has('undecided');
  if (
    state.viewMode === 'hierarchical' &&
    state.navigationStack.length > 0 &&
    showingUndecidedOnly
  ) {
    return [
      {
        path: '..',
        isDirectory: true,
        states: new Set<ItemState>(),
      },
      ...items,
    ];
  }

  return items;
}

// ============================================================================
// STATE UPDATES - Immutable state transitions
// ============================================================================

// These functions provide a functional API for state updates but are not currently used
// They're kept for potential future use or for testing purposes
/* eslint-disable @typescript-eslint/no-unused-vars */

function _updateDecision(
  state: AppState,
  item: DisplayItem,
  decision: FileDecision
): AppState {
  const newDecisions = new Map(state.decisions);

  if (item.isDirectory && item.node) {
    // Apply decision to all files in directory
    const allFiles = getAllFiles(item.node);
    for (const filePath of allFiles) {
      newDecisions.set(filePath, decision);
    }
  } else {
    // Apply decision to single file
    newDecisions.set(item.path, decision);
  }

  return { ...state, decisions: newDecisions };
}

function _toggleFilter(state: AppState, filter: ItemState): AppState {
  const newFilters = new Set(state.activeFilters);
  if (newFilters.has(filter)) {
    newFilters.delete(filter);
  } else {
    newFilters.add(filter);
  }

  return {
    ...state,
    activeFilters: newFilters,
    cursorIndex: 0,
    scrollOffset: 0,
  };
}

function _toggleViewMode(state: AppState): AppState {
  return {
    ...state,
    viewMode: state.viewMode === 'flat' ? 'hierarchical' : 'flat',
    navigationStack: [],
    cursorIndex: 0,
    scrollOffset: 0,
  };
}

function _toggleHelp(state: AppState): AppState {
  return { ...state, showHelp: !state.showHelp };
}

function _moveCursor(state: AppState, delta: number): AppState {
  const displayItems = getDisplayItems(state);
  const newIndex = Math.max(
    0,
    Math.min(displayItems.length - 1, state.cursorIndex + delta)
  );
  return { ...state, cursorIndex: newIndex };
}

function _navigateInto(state: AppState): AppState {
  if (state.viewMode === 'flat') return state; // No navigation in flat view

  const displayItems = getDisplayItems(state);
  const selectedItem = displayItems[state.cursorIndex];

  if (!selectedItem) return state;

  if (selectedItem.path === '..') {
    // Go back
    const newStack = state.navigationStack.slice(0, -1);
    return {
      ...state,
      navigationStack: newStack,
      cursorIndex: 0,
      scrollOffset: 0,
    };
  }

  if (selectedItem.isDirectory) {
    // Navigate into any directory regardless of state
    // Filtering will show what's visible based on active filters
    return {
      ...state,
      navigationStack: [...state.navigationStack, selectedItem.path],
      cursorIndex: 0,
      scrollOffset: 0,
    };
  }

  return state;
}

function _navigateBack(state: AppState): AppState {
  if (state.viewMode === 'flat' || state.navigationStack.length === 0) {
    return state;
  }

  return {
    ...state,
    navigationStack: state.navigationStack.slice(0, -1),
    cursorIndex: 0,
    scrollOffset: 0,
  };
}

function _updateScroll(state: AppState): AppState {
  const displayItems = getDisplayItems(state);
  const terminalHeight = process.stdout.rows || 24;
  const headerLines = 8;
  const footerLines = 3;
  const maxVisibleItems = Math.max(
    5,
    terminalHeight - headerLines - footerLines
  );

  let { scrollOffset, cursorIndex } = state;

  // Auto-scroll to keep cursor in view
  if (cursorIndex < scrollOffset) {
    scrollOffset = cursorIndex;
  } else if (cursorIndex >= scrollOffset + maxVisibleItems) {
    scrollOffset = cursorIndex - maxVisibleItems + 1;
  }

  // Ensure scroll offset is valid
  scrollOffset = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, displayItems.length - maxVisibleItems))
  );

  return { ...state, scrollOffset };
}

/* eslint-enable @typescript-eslint/no-unused-vars */

// ============================================================================
// COMMON DIRECTORIES
// ============================================================================

const COMMON_IGNORE_DIRS = [
  'node_modules',
  'bin',
  'obj',
  '.git',
  '.vs',
  '.vscode',
  '.idea',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  'target',
  '__pycache__',
  '.pytest_cache',
  '.gradle',
  'vendor',
];

function isCommonIgnoreDir(dirPath: string): boolean {
  const parts = dirPath.split('/');
  return COMMON_IGNORE_DIRS.some((ignoreDir) => parts.includes(ignoreDir));
}

// ============================================================================
// RENDERING - Pure render functions
// ============================================================================

function renderStatusHeader(
  state: AppState,
  allFiles: string[],
  gitRoot: string
): void {
  const totalFiles = allFiles.length;
  const decidedCount = state.decisions.size;
  const remainingCount = totalFiles - decidedCount;

  const addedCount = Array.from(state.decisions.values()).filter(
    (d) => d === 'add'
  ).length;
  const commentedCount = Array.from(state.decisions.values()).filter(
    (d) => d === 'comment'
  ).length;
  const skippedCount = Array.from(state.decisions.values()).filter(
    (d) => d === 'skip'
  ).length;

  const boxWidth = 110;
  const horizontalLine = '═'.repeat(boxWidth - 2);
  console.log(colors.bold(colors.cyan(`\n╔${horizontalLine}╗`)));

  const title = 'Worktree Config Link Manager';
  const titlePadding = Math.floor((boxWidth - 2 - title.length) / 2);
  const titleLine =
    ' '.repeat(titlePadding) +
    title +
    ' '.repeat(boxWidth - 2 - titlePadding - title.length);
  console.log(
    colors.bold(colors.cyan('║')) +
      colors.bold(titleLine) +
      colors.bold(colors.cyan('║'))
  );

  console.log(colors.bold(colors.cyan(`╚${horizontalLine}╝`)));

  // Stats spread out horizontally with more spacing
  console.log('');
  const stats = [
    colors.bold(colors.green('✓ Will Link: ')) +
      colors.green(addedCount.toString().padStart(4)),
    colors.bold(colors.blue('◎ Tracked: ')) +
      colors.blue(commentedCount.toString().padStart(4)),
    colors.bold(colors.yellow('✗ Skipped: ')) +
      colors.bold(colors.yellow(skippedCount.toString().padStart(4))),
    colors.bold('⋯ Undecided: ') + remainingCount.toString().padStart(4),
  ];
  console.log('  ' + stats.join(colors.dim('  │  ')));

  // View status with better spacing and visual separator
  const viewModes: string[] = [];
  if (state.activeFilters.has('undecided'))
    viewModes.push(colors.bold('Undecided'));
  if (state.activeFilters.has('add'))
    viewModes.push(colors.bold(colors.green('Added')));
  if (state.activeFilters.has('comment'))
    viewModes.push(colors.bold(colors.blue('Tracked')));
  if (state.activeFilters.has('skip'))
    viewModes.push(colors.bold(colors.yellow('Skipped')));
  const viewModeStr =
    viewModes.length > 0
      ? viewModes.join(colors.dim(', '))
      : colors.dim('None (no items visible)');
  const layoutMode =
    state.viewMode === 'flat'
      ? colors.cyan('Flat')
      : colors.cyan('Hierarchical');

  console.log('');
  console.log(colors.dim('  ┌─ ') + colors.bold('Viewing: ') + viewModeStr);
  console.log(colors.dim('  ├─ ') + colors.bold('Layout:  ') + layoutMode);

  // Show full path: base (gitRoot) + navigated portion in bold
  // Replace home directory with ~ for cleaner display
  const homeDir = os.homedir();
  let displayBasePath = gitRoot;
  if (gitRoot.startsWith(homeDir)) {
    displayBasePath = '~' + gitRoot.slice(homeDir.length);
  }

  // Normalize path separators to forward slashes for consistency
  displayBasePath = displayBasePath.replace(/\\/g, '/');

  const basePath = colors.dim(displayBasePath);
  const navigatedPath =
    state.navigationStack.length > 0
      ? colors.bold(colors.cyan('/' + state.navigationStack.join('/')))
      : colors.dim('/');
  console.log(
    colors.dim('  └─ ') + colors.bold('Path:    ') + basePath + navigatedPath
  );
  console.log('');
}

/**
 * Render action hint for selected item (shown at top of file list)
 * Always renders a fixed-height panel (2 lines) to prevent layout shifting
 */
function renderActionHint(
  selectedItem: DisplayItem | undefined,
  state: AppState
): void {
  // Check if we should show info
  let showInfo = false;
  let infoText = '';

  if (
    selectedItem &&
    selectedItem.path !== '..' &&
    selectedItem.isDirectory &&
    selectedItem.node
  ) {
    if (selectedItem.states.has('undecided')) {
      const breakdown = getFolderStateBreakdown(
        selectedItem.node,
        state.decisions
      );
      if (breakdown.undecided > 0) {
        const displayName =
          state.viewMode === 'hierarchical'
            ? selectedItem.path.split('/').pop() || selectedItem.path
            : selectedItem.path;

        // Truncate long directory names to prevent wrapping (max 50 chars with more horizontal space)
        const truncatedName =
          displayName.length > 50
            ? displayName.substring(0, 47) + '...'
            : displayName;

        const fileWord = breakdown.undecided === 1 ? 'file' : 'files';

        // More visually appealing info panel with box drawing
        infoText =
          colors.dim('  ┌─ ') +
          colors.bgYellow(colors.black(' ℹ  ')) +
          ' ' +
          colors.bold(colors.yellow(`${truncatedName}`)) +
          colors.dim(' │ ') +
          colors.yellow(
            `${breakdown.undecided.toLocaleString()} undecided ${fileWord} inside`
          );
        showInfo = true;
      }
    }
  }

  // Always render the info panel (2 lines total) to prevent shifting
  if (showInfo) {
    console.log(infoText);
    console.log(colors.dim('  └' + '─'.repeat(108)));
  } else {
    console.log(''); // Empty line to maintain spacing
    console.log(''); // Empty line to maintain spacing
  }
}

function renderHelp(): void {
  console.log(
    colors.bold(
      colors.cyan(
        '╔═══ HELP ════════════════════════════════════════════════════════════════════╗'
      )
    )
  );
  console.log(
    colors.cyan('║') +
      ' ' +
      colors.bold('What do the actions do?') +
      '                                                 ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '                                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      ' ' +
      colors.bold(colors.green('A - Will Link')) +
      '                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → File will be ACTIVELY LINKED between worktrees                         ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → Added to manifest as: ' +
      'path/to/file.json' +
      '                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → Use for: config files you want to share (.vscode, .editorconfig)       ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '                                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      ' ' +
      colors.bold(colors.blue('C - Will Track (Commented)')) +
      '                                                ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      "   → File tracked in manifest but DISABLED (won't link)                     " +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → Added to manifest as: ' +
      '# path/to/file.json' +
      '                           ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → Use for: files you might link later, or want to document               ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '                                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      ' ' +
      colors.bold(colors.yellow("S - Won't Link")) +
      '                                                            ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → File completely IGNORED (not added to manifest)                        ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → Not in manifest at all                                                 ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   → Use for: build artifacts (bin/, node_modules/), temp files             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '                                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      ' ' +
      colors.bold('View Toggles:') +
      '                                                           ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   0 = Toggle showing "Undecided" items (on by default)                     ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   1 = Toggle showing "Will Link" items                                     ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   2 = Toggle showing "Will Track (Commented)" items                        ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   3 = Toggle showing "Won\'t Link" items                                    ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   V = Toggle flat vs hierarchical view                                     ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '                                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      ' ' +
      colors.bold('Exit:') +
      '                                                                    ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   Q = Save changes and quit                                                ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   X = Cancel without saving (Ctrl+C also works)                            ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '                                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      ' ' +
      colors.bold('Folders:') +
      '                                                                 ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   Actions on folders apply to ALL files inside                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '   Folders show state breakdown of all descendants                          ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      '                                                                             ' +
      colors.cyan('║')
  );
  console.log(
    colors.cyan('║') +
      ' Press ' +
      colors.bold('?') +
      ' again to close help                                                  ' +
      colors.cyan('║')
  );
  console.log(
    colors.bold(
      colors.cyan(
        '╚═════════════════════════════════════════════════════════════════════════════╝'
      )
    )
  );
}

function renderItem(
  item: DisplayItem,
  isSelected: boolean,
  state: AppState
): string {
  const cursor = isSelected ? colors.bgBlue(' ▶ ') : '   ';

  if (item.path === '..') {
    return cursor + '  ' + colors.dim('⬆️  .. (go back)');
  }

  const icon = item.isDirectory ? '📁' : '📄';
  let applyColor = (s: string) => (item.isDirectory ? colors.cyan(s) : s);

  // In hierarchical mode, show only the base name (not full path)
  let displayName = item.path;
  if (state.viewMode === 'hierarchical') {
    const parts = item.path.split('/');
    displayName = parts[parts.length - 1];
  }

  // Determine item color based on states
  // If item has single decided state, use that color
  const statesArray = Array.from(item.states);
  if (statesArray.length === 1 && statesArray[0] !== 'undecided') {
    const singleState = statesArray[0];
    if (singleState === 'add') applyColor = colors.green;
    else if (singleState === 'comment') applyColor = colors.blue;
    else if (singleState === 'skip') applyColor = colors.yellow;
  }

  // Status prefix - always same width for alignment
  let statusPrefix = '  '; // Default: 2 spaces (icon + space)
  if (statesArray.length === 1 && statesArray[0] !== 'undecided') {
    const stateValue = statesArray[0];
    if (stateValue === 'add') statusPrefix = colors.green('✓ ');
    else if (stateValue === 'comment') statusPrefix = colors.blue('◎ ');
    else if (stateValue === 'skip') statusPrefix = colors.yellow('✗ ');
  }

  let label = `${cursor}${statusPrefix}${icon} ${applyColor(displayName)}`;

  // Add folder breakdown
  if (item.isDirectory && item.node) {
    const breakdown = getFolderStateBreakdown(item.node, state.decisions);

    // Build breakdown display
    const breakdownParts: string[] = [];
    if (breakdown.undecided > 0) {
      breakdownParts.push(`${breakdown.undecided} undecided`);
    }
    if (breakdown.add > 0) {
      breakdownParts.push(colors.green(`${breakdown.add} added`));
    }
    if (breakdown.comment > 0) {
      breakdownParts.push(colors.blue(`${breakdown.comment} commented`));
    }
    if (breakdown.skip > 0) {
      breakdownParts.push(colors.yellow(`${breakdown.skip} skipped`));
    }

    const totalFiles = getAllFiles(item.node).length;

    // Show breakdown in a cleaner format
    if (breakdownParts.length > 1) {
      label += colors.dim(` (${breakdownParts.join(', ')})`);
    } else if (breakdownParts.length === 1) {
      label += colors.dim(
        ` (${totalFiles} file${totalFiles === 1 ? '' : 's'}: ${breakdownParts[0]})`
      );
    }

    // Show auto-ignore tag
    if (isCommonIgnoreDir(item.path)) {
      label += colors.dim(colors.yellow(' [auto-ignore]'));
    }
  }

  return label;
}

function renderItems(
  state: AppState,
  cachedDisplayItems: DisplayItem[]
): void {
  const displayItems = cachedDisplayItems; // Use pre-computed cached items!
  const terminalHeight = process.stdout.rows || 24;
  const headerLines = 13; // Header (11 lines) + Action hint panel (2 lines)
  const footerLines = 3;
  const maxVisibleItems = Math.max(
    5,
    terminalHeight - headerLines - footerLines
  );

  const visibleStart = state.scrollOffset;
  const visibleEnd = Math.min(
    displayItems.length,
    state.scrollOffset + maxVisibleItems
  );
  const hasMoreAbove = visibleStart > 0;
  const hasMoreBelow = visibleEnd < displayItems.length;

  if (hasMoreAbove) {
    console.log(colors.dim(colors.cyan(`   ↑ ${visibleStart} more items above...`)));
  }

  for (let i = visibleStart; i < visibleEnd; i++) {
    const item = displayItems[i];
    const isSelected = i === state.cursorIndex;
    console.log(renderItem(item, isSelected, state));
  }

  if (hasMoreBelow) {
    console.log(
      colors.dim(colors.cyan(`   ↓ ${displayItems.length - visibleEnd} more items below...`))
    );
  }
}

function renderFooter(state: AppState): void {
  console.log('\n' + colors.dim('─'.repeat(110)));

  // Navigation - spread out with better formatting
  const navParts: string[] = [];
  navParts.push(colors.dim('↑↓') + ' Select');
  if (state.viewMode === 'hierarchical') {
    navParts.push(colors.dim('←') + ' Back');
    navParts.push(colors.dim('→') + ' Drill In');
  }
  const navigation =
    colors.bold('Navigation: ') + navParts.join(colors.dim(' │ '));

  // Actions - colorful and spaced out
  const actions =
    colors.bold('Actions: ') +
    colors.bold(colors.green('A')) +
    ' Link' +
    colors.dim(' │ ') +
    colors.bold(colors.blue('C')) +
    ' Comment' +
    colors.dim(' │ ') +
    colors.bold(colors.yellow('S')) +
    ' Skip';

  console.log('  ' + navigation + colors.dim('    ') + actions);

  // Filters - show active state with better spacing
  const filterParts: string[] = [];
  filterParts.push(
    (state.activeFilters.has('undecided') ? colors.bold('0') : colors.dim('0')) +
      ' Undecided'
  );
  filterParts.push(
    (state.activeFilters.has('add')
      ? colors.bold(colors.green('1'))
      : colors.dim('1')) + ' Added'
  );
  filterParts.push(
    (state.activeFilters.has('comment')
      ? colors.bold(colors.blue('2'))
      : colors.dim('2')) + ' Tracked'
  );
  filterParts.push(
    (state.activeFilters.has('skip')
      ? colors.bold(colors.yellow('3'))
      : colors.dim('3')) + ' Skipped'
  );
  filterParts.push(
    (state.viewMode === 'flat'
      ? colors.bold(colors.cyan('V'))
      : colors.dim('V')) + ' Flat'
  );

  const filters = colors.bold('View: ') + filterParts.join(colors.dim(' │ '));

  // Controls - help and exit
  const controls =
    colors.bold('Controls: ') +
    colors.bold('?') +
    ' Help' +
    colors.dim(' │ ') +
    colors.bold(colors.red('Q')) +
    ' Save & Quit' +
    colors.dim(' │ ') +
    colors.bold(colors.red('X')) +
    ' Cancel';

  console.log('  ' + filters + colors.dim('    ') + controls);
}

function render(
  state: AppState,
  allFiles: string[],
  gitRoot: string,
  cachedDisplayItems: DisplayItem[]
): void {
  console.clear();

  if (state.showHelp) {
    renderHelp();
    return;
  }

  renderStatusHeader(state, allFiles, gitRoot);

  const displayItems = cachedDisplayItems; // Use pre-computed cached items!
  if (displayItems.length === 0) {
    console.log(colors.green('\n  ✓ All items processed!\n'));
    return;
  }

  // Show action hint for selected item
  const selectedItem = displayItems[state.cursorIndex];
  renderActionHint(selectedItem, state);

  renderItems(state, displayItems);
  renderFooter(state);
}

// ============================================================================
// MAIN INTERACTIVE LOOP - Using Signals for Performance
// ============================================================================

async function interactiveManage(
  allFiles: string[],
  gitRoot: string,
  initialDecisions?: Map<string, FileDecision>
): Promise<ReadonlyMap<string, FileDecision>> {
  const fileTree = buildFileTree(allFiles);

  // Reactive signals for mutable state
  const decisions$ = signal(
    initialDecisions ? new Map(initialDecisions) : new Map<string, FileDecision>()
  );
  const viewMode$ = signal<ViewMode>('hierarchical');
  const activeFilters$ = signal(new Set<ItemState>(['undecided'])); // Default: show undecided items
  const showHelp$ = signal(false);
  const navigationStack$ = signal<string[]>([]);
  const cursorIndex$ = signal(0);
  const scrollOffset$ = signal(0);

  // Computed signal for visible items (cached, only recomputes when dependencies change)
  // IMPORTANT: Only read signals that getVisibleItems() actually uses!
  const visibleItems$ = computed(() => {
    const viewMode = viewMode$.value;
    const decisions = decisions$.value;
    const activeFilters = activeFilters$.value;
    const navigationStack = navigationStack$.value;

    // Build minimal state object with only what getVisibleItems needs
    // Don't read cursor/scroll/help signals here - they would cause unnecessary recalculation!
    const state: AppState = {
      fileTree,
      decisions,
      viewMode,
      activeFilters,
      showHelp: false, // Not used by getVisibleItems
      navigationStack,
      cursorIndex: 0, // Not used by getVisibleItems
      scrollOffset: 0, // Not used by getVisibleItems
    };

    return getVisibleItems(state);
  });

  // Computed signal for display items with back navigation
  const displayItems$ = computed(() => {
    const items = visibleItems$.value;
    const viewMode = viewMode$.value;
    const navigationStack = navigationStack$.value;
    const activeFilters = activeFilters$.value;

    // Add back navigation in hierarchical view when in default undecided-only mode
    const showingUndecidedOnly =
      activeFilters.size === 1 && activeFilters.has('undecided');
    if (
      viewMode === 'hierarchical' &&
      navigationStack.length > 0 &&
      showingUndecidedOnly
    ) {
      return [
        {
          path: '..',
          isDirectory: true,
          states: new Set<ItemState>(),
        },
        ...items,
      ];
    }

    return items;
  });

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const buildState = (): AppState => ({
      fileTree,
      decisions: decisions$.value,
      viewMode: viewMode$.value,
      activeFilters: activeFilters$.value,
      showHelp: showHelp$.value,
      navigationStack: navigationStack$.value,
      cursorIndex: cursorIndex$.value,
      scrollOffset: scrollOffset$.value,
    });

    const renderCurrent = () => {
      // Use cached displayItems$ - NO recalculation on cursor movement!
      const displayItems = displayItems$.value;
      const terminalHeight = process.stdout.rows || 24;
      const headerLines = 13; // Header (11 lines) + Action hint panel (2 lines)
      const footerLines = 3;
      const maxVisibleItems = Math.max(
        5,
        terminalHeight - headerLines - footerLines
      );

      let scrollOffset = scrollOffset$.value;
      let cursorIndex = cursorIndex$.value;

      // Auto-scroll to keep cursor in view
      if (cursorIndex < scrollOffset) {
        scrollOffset = cursorIndex;
      } else if (cursorIndex >= scrollOffset + maxVisibleItems) {
        scrollOffset = cursorIndex - maxVisibleItems + 1;
      }

      // Ensure scroll offset is valid
      scrollOffset = Math.max(
        0,
        Math.min(scrollOffset, Math.max(0, displayItems.length - maxVisibleItems))
      );

      // Update scroll signals if changed
      if (scrollOffset !== scrollOffset$.value) {
        scrollOffset$.value = scrollOffset;
      }

      // Render with cached displayItems - NO recalculation!
      render(buildState(), allFiles, gitRoot, displayItems);
    };

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeListener('keypress', onKeypress);
    };

    const onKeypress = (
      str: string,
      key: { name?: string; ctrl?: boolean }
    ) => {
      const displayItems = displayItems$.value; // Cached!

      if (key.name === 'up') {
        const newIndex = Math.max(0, cursorIndex$.value - 1);
        cursorIndex$.value = newIndex;
        renderCurrent();
      } else if (key.name === 'down') {
        const newIndex = Math.min(
          displayItems.length - 1,
          cursorIndex$.value + 1
        );
        cursorIndex$.value = newIndex;
        renderCurrent();
      } else if (key.name === 'right') {
        if (viewMode$.value === 'flat') return;

        const selectedItem = displayItems[cursorIndex$.value];
        if (!selectedItem) return;

        if (selectedItem.path === '..') {
          const stack = navigationStack$.value;
          navigationStack$.value = stack.slice(0, -1);
          cursorIndex$.value = 0;
          scrollOffset$.value = 0;
        } else if (selectedItem.isDirectory) {
          // Navigate into any directory regardless of state
          navigationStack$.value = [
            ...navigationStack$.value,
            selectedItem.path,
          ];
          cursorIndex$.value = 0;
          scrollOffset$.value = 0;
        }
        renderCurrent();
      } else if (key.name === 'left') {
        if (
          viewMode$.value === 'flat' ||
          navigationStack$.value.length === 0
        )
          return;

        const stack = navigationStack$.value;
        navigationStack$.value = stack.slice(0, -1);
        cursorIndex$.value = 0;
        scrollOffset$.value = 0;
        renderCurrent();
      } else if (str === 'a' || str === 'A') {
        const selectedItem = displayItems[cursorIndex$.value];
        if (selectedItem && selectedItem.path !== '..') {
          const newDecisions = new Map(decisions$.value);

          if (selectedItem.isDirectory && selectedItem.node) {
            const allFilesInDir = getAllFiles(selectedItem.node);
            for (const filePath of allFilesInDir) {
              newDecisions.set(filePath, 'add');
            }
          } else {
            newDecisions.set(selectedItem.path, 'add');
          }

          decisions$.value = newDecisions;
          renderCurrent();
        }
      } else if (str === 'c' || str === 'C') {
        const selectedItem = displayItems[cursorIndex$.value];
        if (selectedItem && selectedItem.path !== '..') {
          const newDecisions = new Map(decisions$.value);

          if (selectedItem.isDirectory && selectedItem.node) {
            const allFilesInDir = getAllFiles(selectedItem.node);
            for (const filePath of allFilesInDir) {
              newDecisions.set(filePath, 'comment');
            }
          } else {
            newDecisions.set(selectedItem.path, 'comment');
          }

          decisions$.value = newDecisions;
          renderCurrent();
        }
      } else if (str === 's' || str === 'S') {
        const selectedItem = displayItems[cursorIndex$.value];
        if (selectedItem && selectedItem.path !== '..') {
          const newDecisions = new Map(decisions$.value);

          if (selectedItem.isDirectory && selectedItem.node) {
            const allFilesInDir = getAllFiles(selectedItem.node);
            for (const filePath of allFilesInDir) {
              newDecisions.set(filePath, 'skip');
            }
          } else {
            newDecisions.set(selectedItem.path, 'skip');
          }

          decisions$.value = newDecisions;
          renderCurrent();
        }
      } else if (str === 'q' || str === 'Q') {
        console.clear();
        console.log(colors.green('✓ Saving decisions...'));
        cleanup();
        resolve(decisions$.value);
      } else if (
        str === 'x' ||
        str === 'X' ||
        (key.ctrl && key.name === 'c')
      ) {
        console.clear();
        console.log(colors.yellow('✗ Cancelled - no changes saved'));
        cleanup();
        resolve(new Map());
      } else if (str === '?') {
        showHelp$.value = !showHelp$.value;
        renderCurrent();
      } else if (str === '0') {
        const newFilters = new Set(activeFilters$.value);
        if (newFilters.has('undecided')) {
          newFilters.delete('undecided');
        } else {
          newFilters.add('undecided');
        }
        activeFilters$.value = newFilters;
        cursorIndex$.value = 0;
        scrollOffset$.value = 0;
        renderCurrent();
      } else if (str === '1') {
        const newFilters = new Set(activeFilters$.value);
        if (newFilters.has('add')) {
          newFilters.delete('add');
        } else {
          newFilters.add('add');
        }
        activeFilters$.value = newFilters;
        cursorIndex$.value = 0;
        scrollOffset$.value = 0;
        renderCurrent();
      } else if (str === '2') {
        const newFilters = new Set(activeFilters$.value);
        if (newFilters.has('comment')) {
          newFilters.delete('comment');
        } else {
          newFilters.add('comment');
        }
        activeFilters$.value = newFilters;
        cursorIndex$.value = 0;
        scrollOffset$.value = 0;
        renderCurrent();
      } else if (str === '3') {
        const newFilters = new Set(activeFilters$.value);
        if (newFilters.has('skip')) {
          newFilters.delete('skip');
        } else {
          newFilters.add('skip');
        }
        activeFilters$.value = newFilters;
        cursorIndex$.value = 0;
        scrollOffset$.value = 0;
        renderCurrent();
      } else if (str === 'v' || str === 'V') {
        viewMode$.value =
          viewMode$.value === 'flat' ? 'hierarchical' : 'flat';
        navigationStack$.value = [];
        cursorIndex$.value = 0;
        scrollOffset$.value = 0;
        renderCurrent();
      }
    };

    process.stdin.on('keypress', onKeypress);
    renderCurrent();
  });
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

function checkGitInstalled(): void {
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Git is not installed or not found in your PATH. This tool requires Git.'
    );
  }
}

function getGitRoot(): string {
  const gitRoot = execSync('git rev-parse --show-toplevel').toString().trim();
  return path.normalize(gitRoot);
}

/**
 * Get the main worktree root (not the current worktree).
 * This ensures the manifest is always stored in the main worktree and shared across all worktrees.
 */
function getMainWorktreeRoot(): string {
  try {
    // Get the common git directory (shared across all worktrees)
    const gitCommonDir = execSync('git rev-parse --git-common-dir')
      .toString()
      .trim();

    const commonDirPath = path.resolve(gitCommonDir);

    // If git-common-dir returns ".git", we're in the main worktree
    if (path.basename(commonDirPath) === '.git') {
      return path.dirname(commonDirPath);
    }

    // Otherwise, we're in a linked worktree
    // The common dir is like: /main-worktree/.git/worktrees/feature-branch
    // We need to go up to .git, then to parent directory
    const gitDir =
      commonDirPath.includes('/worktrees/') ||
      commonDirPath.includes('\\worktrees\\')
        ? path.dirname(path.dirname(commonDirPath)) // .git/worktrees/name → .git
        : commonDirPath;

    return path.dirname(gitDir);
  } catch {
    // Fallback to current git root if command fails
    return getGitRoot();
  }
}

function isIgnored(filePath: string, gitRoot: string): boolean {
  try {
    const result = execSync(`git check-ignore "${filePath}"`, {
      cwd: gitRoot,
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
    })
      .toString()
      .trim();
    return result.length > 0;
  } catch {
    // git check-ignore returns non-zero exit code if file is not ignored
    return false;
  }
}

function getIgnoredFiles(gitRoot: string, manifestFile: string): string[] {
  try {
    const ignored = execSync(
      'git ls-files --ignored --exclude-standard --others',
      { cwd: gitRoot, maxBuffer: 50 * 1024 * 1024 }
    )
      .toString()
      .trim();
    if (!ignored) return [];
    return ignored.split('\n').filter((f) => f && !f.includes(manifestFile));
  } catch {
    console.error(
      colors.yellow(
        'Warning: Could not run `git ls-files`. This may be a new repository.'
      )
    );
    return [];
  }
}

function getManifestEntries(gitRoot: string, manifestFile: string): string[] {
  const manifestPath = path.join(gitRoot, manifestFile);
  if (!fs.existsSync(manifestPath)) return [];
  return fs
    .readFileSync(manifestPath, 'utf-8')
    .split('\n')
    .filter((x) => x.trim() && !x.startsWith('#'));
}

function getManifestDecisions(
  gitRoot: string,
  manifestFile: string
): Map<string, FileDecision> {
  const manifestPath = path.join(gitRoot, manifestFile);
  const decisions = new Map<string, FileDecision>();

  if (!fs.existsSync(manifestPath)) return decisions;

  const lines = fs.readFileSync(manifestPath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      // Commented entry - extract file path
      // Format: "# path/to/file" or "# TRACKED: path/to/file" or "# DELETED: path/to/file"
      const commentContent = trimmed.substring(1).trim();
      let filePath = commentContent;

      // Strip prefixes like "TRACKED:", "DELETED:", "STALE:"
      const prefixMatch = commentContent.match(
        /^(TRACKED|DELETED|STALE):\s*(.+)/
      );
      if (prefixMatch) {
        filePath = prefixMatch[2];
      }

      decisions.set(filePath, 'comment');
    } else {
      // Active entry
      decisions.set(trimmed, 'add');
    }
  }

  return decisions;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function run(argv: ManageArgv): Promise<void> {
  checkGitInstalled();

  const gitRoot = getGitRoot(); // Current worktree root (for finding files)
  const mainWorktreeRoot = getMainWorktreeRoot(); // Main worktree root (for manifest location)
  const manifestFile = argv.manifestFile;
  const manifestPath = path.join(mainWorktreeRoot, manifestFile);
  const manifestBackupFile = manifestPath + '.bak';

  const existingEntries = getManifestEntries(mainWorktreeRoot, manifestFile);
  const ignoredFiles = getIgnoredFiles(gitRoot, manifestFile);

  const newFiles = ignoredFiles.filter((f) => !existingEntries.includes(f));

  // Categorize stale entries
  const trackedEntries: string[] = [];
  const deletedEntries: string[] = [];

  for (const entry of existingEntries) {
    const fullPath = path.join(gitRoot, entry);
    if (!fs.existsSync(fullPath)) {
      deletedEntries.push(entry);
    } else if (!isIgnored(entry, gitRoot)) {
      trackedEntries.push(entry);
    }
  }

  if (
    newFiles.length === 0 &&
    trackedEntries.length === 0 &&
    deletedEntries.length === 0
  ) {
    console.log(
      colors.green(
        'Manifest is up to date. No new files or stale entries found.'
      )
    );
    return;
  }

  let finalEntries = [...existingEntries];

  // Handle tracked entries (now tracked by git)
  if (trackedEntries.length > 0) {
    console.log(
      colors.bold(
        colors.red('\n⚠️  Warning: Files in manifest are now TRACKED by git\n')
      )
    );
    console.log(
      colors.yellow(
        'These files are no longer git-ignored and linking them could cause git conflicts:'
      )
    );
    trackedEntries.forEach((f) =>
      console.log(colors.yellow(`  - ${f} (now tracked)`))
    );

    let trackedChoice: 'remove' | 'comment' | 'leave' = 'remove';
    if (argv.clean) {
      trackedChoice = 'remove';
    } else if (!argv.nonInteractive) {
      const answers = await inquirer.prompt<{
        trackedAction: 'remove' | 'comment' | 'leave';
      }>([
        {
          type: 'list',
          name: 'trackedAction',
          message: 'How should tracked entries be handled?',
          choices: [
            {
              name: 'Remove from manifest (recommended - prevents git issues)',
              value: 'remove',
            },
            {
              name: "Comment out as # TRACKED (keep record but don't link)",
              value: 'comment',
            },
            {
              name: 'Leave unchanged (not recommended - may cause git conflicts)',
              value: 'leave',
            },
          ],
        },
      ]);
      trackedChoice = answers.trackedAction;
    }

    if (trackedChoice === 'remove') {
      finalEntries = finalEntries.filter((f) => !trackedEntries.includes(f));
      console.log(colors.red('Removed tracked entries from manifest.'));
    } else if (trackedChoice === 'comment') {
      finalEntries = finalEntries.map((f) =>
        trackedEntries.includes(f) ? `# TRACKED: ${f}` : f
      );
      console.log(colors.blue('Commented out tracked entries.'));
    } else {
      console.log(colors.yellow('Left tracked entries unchanged.'));
    }
  }

  // Handle deleted entries (no longer exist)
  if (deletedEntries.length > 0) {
    console.log(
      colors.bold(
        colors.cyan('\nℹ️  Info: Files in manifest no longer exist\n')
      )
    );
    console.log(
      colors.dim('These files have been deleted from the filesystem:')
    );
    deletedEntries.forEach((f) => console.log(colors.dim(`  - ${f}`)));

    let deletedChoice: 'remove' | 'comment' | 'leave' = 'remove';
    if (argv.clean) {
      deletedChoice = 'remove';
    } else if (!argv.nonInteractive) {
      const answers = await inquirer.prompt<{
        deletedAction: 'remove' | 'comment' | 'leave';
      }>([
        {
          type: 'list',
          name: 'deletedAction',
          message: 'How should deleted entries be handled?',
          choices: [
            { name: 'Remove from manifest (clean up)', value: 'remove' },
            { name: 'Comment out as # DELETED (keep record)', value: 'comment' },
            { name: 'Leave unchanged (keep in manifest)', value: 'leave' },
          ],
        },
      ]);
      deletedChoice = answers.deletedAction;
    }

    if (deletedChoice === 'remove') {
      finalEntries = finalEntries.filter((f) => !deletedEntries.includes(f));
      console.log(colors.red('Removed deleted entries from manifest.'));
    } else if (deletedChoice === 'comment') {
      finalEntries = finalEntries.map((f) =>
        deletedEntries.includes(f) ? `# DELETED: ${f}` : f
      );
      console.log(colors.blue('Commented out deleted entries.'));
    } else {
      console.log(colors.dim('Left deleted entries unchanged.'));
    }
  }

  // Launch interactive manage with ALL ignored files and pre-populated decisions
  if (argv.nonInteractive || argv.dryRun) {
    const mode = argv.dryRun ? 'Dry run' : 'Non-interactive';
    console.log(
      colors.blue(`\n${mode} mode: Adding new files as commented out.`)
    );
    finalEntries.push(...newFiles.map((f) => `# ${f}`));
  } else {
    console.log(colors.green('\nInteractive file management:'));
    console.log(
      colors.dim(
        'Review all linkable files. Use arrow keys to navigate, letter keys for instant actions.\n'
      )
    );

    // Pre-populate decisions from existing manifest
    const initialDecisions = getManifestDecisions(gitRoot, manifestFile);

    const decisions = await interactiveManage(
      ignoredFiles,
      gitRoot,
      initialDecisions
    );

    if (decisions.size === 0 && ignoredFiles.length > 0) {
      console.log(colors.yellow('Operation cancelled.'));
      return;
    }

    // Rebuild manifest from ALL decisions
    finalEntries = [];
    let addedCount = 0;
    let commentedCount = 0;
    let skippedCount = 0;

    for (const file of ignoredFiles) {
      const action = decisions.get(file);

      if (action === 'add') {
        finalEntries.push(file);
        addedCount++;
      } else if (action === 'comment') {
        finalEntries.push(`# ${file}`);
        commentedCount++;
      } else {
        // skip - don't add to manifest
        skippedCount++;
      }
    }

    console.log(colors.green(`\nSummary:`));
    console.log(colors.green(`  ✓ Will Link: ${addedCount}`));
    console.log(colors.blue(`  ◎ Tracked (commented): ${commentedCount}`));
    console.log(colors.yellow(`  ✗ Skipped: ${skippedCount}`));
  }

  // Write manifest
  if (argv.dryRun) {
    console.log(
      colors.cyan(
        '\n[DRY RUN] The following changes would be made to the manifest:'
      )
    );
    if (fs.existsSync(manifestPath)) {
      console.log(
        colors.cyan(`- Backup existing manifest to ${manifestBackupFile}`)
      );
    }
    console.log(
      colors.cyan(`- Write the following content to ${manifestFile}:`)
    );
    console.log(colors.dim(finalEntries.join('\n') + '\n'));
  } else {
    if (argv.backup && fs.existsSync(manifestPath)) {
      fs.copyFileSync(manifestPath, manifestBackupFile);
      console.log(`Backed up existing manifest to ${manifestBackupFile}`);
    }
    fs.writeFileSync(manifestPath, finalEntries.join('\n') + '\n');
    console.log(colors.green(`Successfully updated ${manifestFile}.`));
  }
}
