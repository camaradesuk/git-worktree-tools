/**
 * Tests for standalone prs CLI command
 *
 * Tests the exported functions from prs.ts including hasJsonFlag, outputJsonError,
 * and runPrsCommand with proper mocking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasJsonFlag, outputJsonError, runPrsCommand } from './prs.js';
import { ErrorCode } from '../lib/json-output.js';

// Mock dependencies
vi.mock('../lib/git.js', () => ({
  getRepoRoot: vi.fn(),
}));

vi.mock('../lib/github.js', () => ({
  isGhInstalled: vi.fn(),
  isAuthenticated: vi.fn(),
  getRepoInfo: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../lib/prs/data.js', () => ({
  fetchPrsWithWorktrees: vi.fn(),
  applyFilters: vi.fn(),
  clearPrCache: vi.fn(),
  createDefaultDataDeps: vi.fn(),
}));

vi.mock('../lib/prs/formatters.js', () => ({
  formatPrListHeader: vi.fn(),
  formatPrSummary: vi.fn(),
  formatPrTable: vi.fn(),
}));

vi.mock('../lib/prs/interactive.js', () => ({
  runPrInteractiveMode: vi.fn(),
  createDefaultPrInteractiveDeps: vi.fn(),
}));

// Get mocked functions
import * as git from '../lib/git.js';
import * as github from '../lib/github.js';
import * as config from '../lib/config.js';
import * as prsData from '../lib/prs/data.js';
import * as formatters from '../lib/prs/formatters.js';

const mockGetRepoRoot = vi.mocked(git.getRepoRoot);
const mockIsGhInstalled = vi.mocked(github.isGhInstalled);
const mockIsAuthenticated = vi.mocked(github.isAuthenticated);
const mockGetRepoInfo = vi.mocked(github.getRepoInfo);
const mockLoadConfig = vi.mocked(config.loadConfig);
const mockFetchPrsWithWorktrees = vi.mocked(prsData.fetchPrsWithWorktrees);
const mockApplyFilters = vi.mocked(prsData.applyFilters);
const mockCreateDefaultDataDeps = vi.mocked(prsData.createDefaultDataDeps);
const mockFormatPrListHeader = vi.mocked(formatters.formatPrListHeader);
const mockFormatPrSummary = vi.mocked(formatters.formatPrSummary);
const mockFormatPrTable = vi.mocked(formatters.formatPrTable);

describe('prs CLI command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasJsonFlag', () => {
    it('should detect --json flag', () => {
      expect(hasJsonFlag(['--json'])).toBe(true);
      expect(hasJsonFlag(['--state', 'open', '--json'])).toBe(true);
      expect(hasJsonFlag(['--json', '--state', 'open'])).toBe(true);
    });

    it('should detect -j short flag', () => {
      expect(hasJsonFlag(['-j'])).toBe(true);
      expect(hasJsonFlag(['--state', 'open', '-j'])).toBe(true);
    });

    it('should return false when no json flag', () => {
      expect(hasJsonFlag([])).toBe(false);
      expect(hasJsonFlag(['--state', 'open'])).toBe(false);
      expect(hasJsonFlag(['--draft'])).toBe(false);
    });
  });

  describe('outputJsonError', () => {
    it('should output error in JSON format', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      outputJsonError(ErrorCode.NOT_GIT_REPO, 'Not in a git repository');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.command).toBe('prs');
      expect(parsed.error.code).toBe(ErrorCode.NOT_GIT_REPO);
      expect(parsed.error.message).toBe('Not in a git repository');
    });

    it('should include suggestion for known error codes', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      outputJsonError(ErrorCode.GH_NOT_INSTALLED, 'GitHub CLI not installed');

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.error.suggestion).toBeDefined();
    });
  });

  describe('runPrsCommand', () => {
    // Store original process.exit
    const originalExit = process.exit;
    const originalIsTTY = process.stdout.isTTY;

    // Custom error class to simulate process.exit
    class ExitError extends Error {
      exitCode: number;
      constructor(code: number) {
        super(`process.exit(${code})`);
        this.exitCode = code;
      }
    }

    // Helper to create complete options with defaults
    const createOptions = (
      overrides: Partial<Parameters<typeof runPrsCommand>[0]> = {}
    ): Parameters<typeof runPrsCommand>[0] => ({
      state: 'open',
      limit: 50,
      ...overrides,
    });

    // Helper to create mock repo info
    const createMockRepoInfo = () => ({
      owner: 'test',
      name: 'repo',
      defaultBranch: 'main',
      url: 'https://github.com/test/repo',
    });

    // Helper to create mock config (matches Required<WorktreeConfig>)
    const createMockConfig = () => ({
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
    });

    // Helper to create mock PR item (matches PrDisplayItem)
    const createMockPr = (number: number, overrides: Record<string, unknown> = {}) => ({
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
    });

    beforeEach(() => {
      // Mock process.exit to throw an error that interrupts execution
      process.exit = vi.fn((code?: number) => {
        throw new ExitError(code ?? 0);
      }) as unknown as typeof process.exit;
      // Force non-TTY mode to avoid interactive mode
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
    });

    afterEach(() => {
      process.exit = originalExit;
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
    });

    it('should exit with error when not in git repository', async () => {
      mockGetRepoRoot.mockImplementation(() => {
        throw new Error('Not in a git repository');
      });

      await expect(runPrsCommand(createOptions({ json: false }))).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when not in git repo with json mode', async () => {
      mockGetRepoRoot.mockImplementation(() => {
        throw new Error('Not in a git repository');
      });
      const consoleSpy = vi.spyOn(console, 'log');

      await expect(runPrsCommand(createOptions({ json: true }))).rejects.toThrow(ExitError);

      expect(process.exit).toHaveBeenCalledWith(1);
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe(ErrorCode.NOT_GIT_REPO);
    });

    it('should exit with error when gh is not installed', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(false);

      await expect(runPrsCommand(createOptions({ json: false }))).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when gh not installed with json mode', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log');

      await expect(runPrsCommand(createOptions({ json: true }))).rejects.toThrow(ExitError);

      expect(process.exit).toHaveBeenCalledWith(1);
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe(ErrorCode.GH_NOT_INSTALLED);
    });

    it('should exit with error when not authenticated', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(false);

      await expect(runPrsCommand(createOptions({ json: false }))).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when not authenticated with json mode', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'log');

      await expect(runPrsCommand(createOptions({ json: true }))).rejects.toThrow(ExitError);

      expect(process.exit).toHaveBeenCalledWith(1);
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.error.code).toBe(ErrorCode.GH_NOT_AUTHENTICATED);
    });

    it('should fetch and display PRs in table format', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockReturnValue([createMockPr(1)]);
      mockApplyFilters.mockImplementation((prs) => prs);
      mockFormatPrListHeader.mockReturnValue('PR List Header');
      mockFormatPrSummary.mockReturnValue('1 PR found');
      mockFormatPrTable.mockReturnValue('PR Table');

      await runPrsCommand(createOptions({ json: false, noInteractive: true }));

      expect(mockFetchPrsWithWorktrees).toHaveBeenCalled();
      expect(mockFormatPrListHeader).toHaveBeenCalledWith('repo');
      expect(mockFormatPrTable).toHaveBeenCalled();
    });

    it('should output JSON when json mode is enabled', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockReturnValue([]);
      mockApplyFilters.mockReturnValue([]);
      const consoleSpy = vi.spyOn(console, 'log');

      await runPrsCommand(createOptions({ json: true }));

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.command).toBe('prs');
      expect(parsed.data.prs).toEqual([]);
    });

    it('should handle fetch error gracefully', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockImplementation(() => {
        throw new Error('API rate limit exceeded');
      });

      await expect(runPrsCommand(createOptions({ json: false }))).rejects.toThrow(ExitError);
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should map state filter correctly', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockReturnValue([]);
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, state: 'all' }));

      // Verify applyFilters was called with filterState containing all states
      expect(mockApplyFilters).toHaveBeenCalled();
      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.states.has('OPEN')).toBe(true);
      expect(filterState.states.has('MERGED')).toBe(true);
      expect(filterState.states.has('CLOSED')).toBe(true);
    });

    it('should set draft filter correctly', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockReturnValue([]);
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, draft: true }));

      expect(mockApplyFilters).toHaveBeenCalled();
      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.showDrafts).toBe('only');
    });

    it('should clear cache when refresh is true', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockReturnValue([]);
      mockApplyFilters.mockReturnValue([]);

      const mockClearPrCache = vi.mocked(prsData.clearPrCache);

      await runPrsCommand(createOptions({ json: true, refresh: true }));

      expect(mockClearPrCache).toHaveBeenCalled();
    });

    it('should use withWorktree filter option', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockReturnValue([]);
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, withWorktree: true }));

      expect(mockApplyFilters).toHaveBeenCalled();
      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.hasWorktree).toBe(true);
    });

    it('should use noDraft filter option', async () => {
      mockGetRepoRoot.mockReturnValue('/test/repo');
      mockIsGhInstalled.mockReturnValue(true);
      mockIsAuthenticated.mockReturnValue(true);
      mockGetRepoInfo.mockReturnValue(createMockRepoInfo());
      mockLoadConfig.mockReturnValue(createMockConfig());
      mockCreateDefaultDataDeps.mockReturnValue(
        {} as ReturnType<typeof prsData.createDefaultDataDeps>
      );
      mockFetchPrsWithWorktrees.mockReturnValue([]);
      mockApplyFilters.mockReturnValue([]);

      await runPrsCommand(createOptions({ json: true, noDraft: true }));

      expect(mockApplyFilters).toHaveBeenCalled();
      const filterState = mockApplyFilters.mock.calls[0][1];
      expect(filterState.showDrafts).toBe(false);
    });
  });

  describe('filter state mapping', () => {
    // Helper function that matches the logic in runPrsCommand
    function mapStateToFilterSet(stateOption: string | undefined): Set<string> {
      if (stateOption === 'all') {
        return new Set(['OPEN', 'MERGED', 'CLOSED']);
      } else if (stateOption === 'merged') {
        return new Set(['MERGED']);
      } else if (stateOption === 'closed') {
        return new Set(['CLOSED']);
      } else {
        return new Set(['OPEN']);
      }
    }

    it('should map state=all to all three states', () => {
      const result = mapStateToFilterSet('all');
      expect(result.has('OPEN')).toBe(true);
      expect(result.has('MERGED')).toBe(true);
      expect(result.has('CLOSED')).toBe(true);
    });

    it('should map state=merged to MERGED only', () => {
      const result = mapStateToFilterSet('merged');
      expect(result.has('MERGED')).toBe(true);
      expect(result.size).toBe(1);
    });

    it('should map state=closed to CLOSED only', () => {
      const result = mapStateToFilterSet('closed');
      expect(result.has('CLOSED')).toBe(true);
      expect(result.size).toBe(1);
    });

    it('should default to OPEN state', () => {
      const result = mapStateToFilterSet('open');
      expect(result.has('OPEN')).toBe(true);
      expect(result.size).toBe(1);
    });

    it('should handle undefined state as open', () => {
      const result = mapStateToFilterSet(undefined);
      expect(result.has('OPEN')).toBe(true);
      expect(result.size).toBe(1);
    });
  });
});
