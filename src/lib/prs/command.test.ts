/**
 * Tests for the shared prs command module (lib/prs/command.ts)
 *
 * Verifies the canonical runPrsCommand implementation that both
 * the standalone `prs` CLI and `wt prs` subcommand share.
 *
 * The critical regression test: interactive mode creates deps with
 * a refreshPrs callback (this was missing in the wt prs duplicate).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPrsCommand, outputJsonError } from './command.js';
import { ErrorCode } from '../json-output.js';

// Mock dependencies used by command.ts
vi.mock('../git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../github.js', () => ({
  isGhInstalled: vi.fn(),
  isAuthenticated: vi.fn(),
  getRepoInfo: vi.fn(),
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('./data.js', () => ({
  fetchPrsWithWorktrees: vi.fn(),
  applyFilters: vi.fn(),
  clearPrCache: vi.fn(),
  createDefaultDataDeps: vi.fn(),
}));

vi.mock('./formatters.js', () => ({
  formatPrListHeader: vi.fn(),
  formatPrSummary: vi.fn(),
  formatPrTable: vi.fn(),
}));

vi.mock('./interactive.js', () => ({
  runPrInteractiveMode: vi.fn(),
  createDefaultPrInteractiveDeps: vi.fn(() => ({
    selectPr: vi.fn(),
    pressEnterToContinue: vi.fn(),
    showDetails: vi.fn(),
    executeAction: vi.fn(),
  })),
}));

// Import mocked modules for assertions
import * as git from '../git.js';
import * as github from '../github.js';
import * as config from '../config.js';
import * as prsData from './data.js';
import * as formatters from './formatters.js';
import { runPrInteractiveMode, createDefaultPrInteractiveDeps } from './interactive.js';

const mockGetRepoRoot = vi.mocked(git.getRepoRoot);
const mockIsGhInstalled = vi.mocked(github.isGhInstalled);
const mockIsAuthenticated = vi.mocked(github.isAuthenticated);
const mockGetRepoInfo = vi.mocked(github.getRepoInfo);
const mockLoadConfig = vi.mocked(config.loadConfig);
const mockFetchPrsWithWorktrees = vi.mocked(prsData.fetchPrsWithWorktrees);
const mockApplyFilters = vi.mocked(prsData.applyFilters);
const mockClearPrCache = vi.mocked(prsData.clearPrCache);
const mockCreateDefaultDataDeps = vi.mocked(prsData.createDefaultDataDeps);
const mockFormatPrListHeader = vi.mocked(formatters.formatPrListHeader);
const mockFormatPrSummary = vi.mocked(formatters.formatPrSummary);
const mockFormatPrTable = vi.mocked(formatters.formatPrTable);
const mockRunPrInteractiveMode = vi.mocked(runPrInteractiveMode);
const mockCreateDefaultPrInteractiveDeps = vi.mocked(createDefaultPrInteractiveDeps);

// Custom error to capture process.exit calls
class ExitError extends Error {
  exitCode: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.exitCode = code;
  }
}

// Helper: create mock config
function createMockConfig() {
  return {
    configVersion: 1,
    baseBranch: 'main',
    draftPr: false,
    worktreePattern: '{repo}.pr{number}',
    worktreeParent: '..',
    branchPrefix: 'feat',
    sharedRepos: [] as string[],
    syncPatterns: [] as string[],
    previewLabel: 'preview',
    preferredEditor: 'vscode' as const,
    ai: {
      provider: 'none' as const,
      branchName: false,
      prTitle: false,
      prDescription: false,
      commitMessage: false,
      planDocument: false,
      branchStyle: 'kebab' as const,
      commitStyle: 'conventional' as const,
    },
    hooks: {},
    hookDefaults: { timeout: 30000, maxTimeout: 60000 },
    plugins: [] as string[],
    generators: {},
    integrations: {},
    logging: { level: 'info' as const, timestamps: true },
    global: { warnNotGlobal: true },
    wtlink: { enabled: [] as string[], disabled: [] as string[] },
    linkConfigFiles: undefined,
  };
}

// Helper: create mock PR
function createMockPr(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Test PR ${number}`,
    state: 'OPEN' as const,
    url: `https://github.com/test/repo/pull/${number}`,
    headBranch: `feat/test-${number}`,
    baseBranch: 'main',
    isDraft: false,
    author: 'testuser',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    labels: [] as string[],
    reviewDecision: null,
    approvalCount: 0,
    reviewCount: 0,
    checksStatus: null,
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    hasWorktree: false,
    worktreePath: null,
    ...overrides,
  };
}

// Helper: create default options
function createOptions(overrides: Partial<Parameters<typeof runPrsCommand>[0]> = {}) {
  return {
    state: 'open' as const,
    limit: 50,
    ...overrides,
  };
}

// Helper: set up all prerequisites to pass so tests can reach the feature under test
function setupPassingPrereqs() {
  mockGetRepoRoot.mockReturnValue('/test/repo');
  mockIsGhInstalled.mockReturnValue(true);
  mockIsAuthenticated.mockReturnValue(true);
  mockGetRepoInfo.mockReturnValue({
    owner: 'test',
    name: 'test-repo',
    defaultBranch: 'main',
    url: 'https://github.com/test/test-repo',
  });
  mockLoadConfig.mockReturnValue(createMockConfig());
  mockCreateDefaultDataDeps.mockReturnValue({} as ReturnType<typeof prsData.createDefaultDataDeps>);
  mockFetchPrsWithWorktrees.mockReturnValue([createMockPr(1), createMockPr(2)]);
  mockApplyFilters.mockImplementation((prs) => prs);
  mockFormatPrListHeader.mockReturnValue('PR List Header');
  mockFormatPrSummary.mockReturnValue('2 PRs found');
  mockFormatPrTable.mockReturnValue('PR Table');
}

describe('prs command module', () => {
  const originalExit = process.exit;
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit to throw so we can catch it
    process.exit = vi.fn((code?: number) => {
      throw new ExitError(code ?? 0);
    }) as unknown as typeof process.exit;

    // Default to non-TTY to avoid interactive mode unless specifically testing it
    Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: false, writable: true });
  });

  afterEach(() => {
    process.exit = originalExit;
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdoutIsTTY, writable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinIsTTY, writable: true });
    vi.restoreAllMocks();
  });

  describe('outputJsonError', () => {
    it('should output structured JSON error to console.log', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not in a git repository');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.success).toBe(false);
      expect(parsed.command).toBe('prs');
      expect(parsed.error.code).toBe('NOT_GIT_REPO');
      expect(parsed.error.message).toBe('Not in a git repository');
      expect(parsed.error.suggestion).toBeDefined();
    });
  });

  describe('non-interactive mode outputs table', () => {
    it('should call formatters and NOT runPrInteractiveMode when non-TTY', async () => {
      setupPassingPrereqs();

      await runPrsCommand(createOptions({ noInteractive: true }));

      expect(mockFormatPrListHeader).toHaveBeenCalledWith('test-repo');
      expect(mockFormatPrSummary).toHaveBeenCalled();
      expect(mockFormatPrTable).toHaveBeenCalled();
      expect(mockRunPrInteractiveMode).not.toHaveBeenCalled();
    });

    it('should call formatters when noInteractive is set even if TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
      setupPassingPrereqs();

      await runPrsCommand(createOptions({ noInteractive: true }));

      expect(mockFormatPrListHeader).toHaveBeenCalledWith('test-repo');
      expect(mockRunPrInteractiveMode).not.toHaveBeenCalled();
    });
  });

  describe('interactive mode creates deps with refreshPrs', () => {
    it('should create interactiveDeps with refreshPrs callback and call runPrInteractiveMode', async () => {
      // Enable TTY for interactive mode
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
      setupPassingPrereqs();

      // Make createDefaultPrInteractiveDeps return a mutable object
      const mockDeps = {
        selectPr: vi.fn(),
        pressEnterToContinue: vi.fn(),
        showDetails: vi.fn(),
        executeAction: vi.fn(),
      };
      mockCreateDefaultPrInteractiveDeps.mockReturnValue(mockDeps);

      await runPrsCommand(createOptions({ state: 'open', limit: 50 }));

      // Verify runPrInteractiveMode was called
      expect(mockRunPrInteractiveMode).toHaveBeenCalledTimes(1);

      // Verify it was called with 5 arguments (prs, repoName, previewLabel, filterState, interactiveDeps)
      const callArgs = mockRunPrInteractiveMode.mock.calls[0];
      expect(callArgs).toHaveLength(5);

      // The critical regression test: refreshPrs must be a function
      const interactiveDeps = callArgs[4];
      expect(interactiveDeps).toBeDefined();
      expect(interactiveDeps!.refreshPrs).toBeInstanceOf(Function);
    });

    it('should fetch state=all in interactive mode for filter toggles', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
      setupPassingPrereqs();

      const mockDeps = {
        selectPr: vi.fn(),
        pressEnterToContinue: vi.fn(),
        showDetails: vi.fn(),
        executeAction: vi.fn(),
      };
      mockCreateDefaultPrInteractiveDeps.mockReturnValue(mockDeps);

      await runPrsCommand(createOptions({ state: 'open' }));

      // In interactive mode, fetchState should be 'all' regardless of options.state
      const fetchCallArgs = mockFetchPrsWithWorktrees.mock.calls[0];
      expect(fetchCallArgs[0].state).toBe('all');
    });
  });

  describe('JSON mode outputs JSON', () => {
    it('should output valid JSON and NOT call runPrInteractiveMode', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([createMockPr(1)]);
      const consoleSpy = vi.spyOn(console, 'log');

      await runPrsCommand(createOptions({ json: true }));

      expect(mockRunPrInteractiveMode).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.success).toBe(true);
      expect(output.command).toBe('prs');
      expect(output.data.prs).toHaveLength(1);
    });

    it('should not enter interactive mode even on TTY when json is true', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true }));

      expect(mockRunPrInteractiveMode).not.toHaveBeenCalled();
    });
  });

  describe('force refresh clears cache', () => {
    it('should call clearPrCache before fetchPrsWithWorktrees when refresh=true', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      const callOrder: string[] = [];
      mockClearPrCache.mockImplementation(() => {
        callOrder.push('clearPrCache');
      });
      mockFetchPrsWithWorktrees.mockImplementation(() => {
        callOrder.push('fetchPrsWithWorktrees');
        return [];
      });

      await runPrsCommand(createOptions({ json: true, refresh: true }));

      expect(mockClearPrCache).toHaveBeenCalled();
      expect(callOrder[0]).toBe('clearPrCache');
      expect(callOrder[1]).toBe('fetchPrsWithWorktrees');
    });

    it('should NOT call clearPrCache when refresh is false', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, refresh: false }));

      expect(mockClearPrCache).not.toHaveBeenCalled();
    });
  });

  describe('error handling - not a git repo', () => {
    it('should exit with code 1 in non-json mode', async () => {
      mockGetRepoRoot.mockImplementation(() => {
        throw new Error('Not in a git repository');
      });

      await expect(runPrsCommand(createOptions())).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error and exit in json mode', async () => {
      mockGetRepoRoot.mockImplementation(() => {
        throw new Error('Not in a git repository');
      });
      const consoleSpy = vi.spyOn(console, 'log');

      await expect(runPrsCommand(createOptions({ json: true }))).rejects.toThrow(ExitError);

      expect(process.exit).toHaveBeenCalledWith(1);
      const output = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(output.error.code).toBe('NOT_GIT_REPO');
    });

    it('should exit when gh is not installed', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(false);

      await expect(runPrsCommand(createOptions())).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit when not authenticated', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(false);

      await expect(runPrsCommand(createOptions())).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit when fetchPrsWithWorktrees throws', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue({
        owner: 'test',
        name: 'test-repo',
        defaultBranch: 'main',
        url: 'https://github.com/test/test-repo',
      });
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockImplementation(() => {
        throw new Error('API rate limit exceeded');
      });

      await expect(runPrsCommand(createOptions())).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('filter state from options', () => {
    it('should set all states when state=all', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, state: 'all' }));

      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.states.has('OPEN')).toBe(true);
      expect(filterState.states.has('MERGED')).toBe(true);
      expect(filterState.states.has('CLOSED')).toBe(true);
    });

    it('should set MERGED only when state=merged', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, state: 'merged' }));

      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.states.has('MERGED')).toBe(true);
      expect(filterState.states.size).toBe(1);
    });

    it('should set CLOSED only when state=closed', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, state: 'closed' }));

      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.states.has('CLOSED')).toBe(true);
      expect(filterState.states.size).toBe(1);
    });

    it('should default to OPEN state', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, state: 'open' }));

      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.states.has('OPEN')).toBe(true);
      expect(filterState.states.size).toBe(1);
    });

    it('should set showDrafts to only when draft=true', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, draft: true }));

      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.showDrafts).toBe('only');
    });

    it('should set showDrafts to false when noDraft=true', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, noDraft: true }));

      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.showDrafts).toBe(false);
    });

    it('should set hasWorktree filter when withWorktree=true', async () => {
      setupPassingPrereqs();
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, withWorktree: true }));

      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.hasWorktree).toBe(true);
    });
  });
});
