import { execSync, ExecSyncOptions } from 'child_process';

/**
 * Mock mode for testing - enabled via NEWPR_MOCK_GITHUB environment variable
 * When enabled, returns mock data instead of calling GitHub CLI
 */
export interface MockState {
  enabled: boolean;
  prCounter: number;
  createdPrs: PrInfo[];
  existingPrs: Map<string, PrInfo>; // branch -> PR
}

/**
 * Mock controller class - manages mock state with proper encapsulation.
 * Uses singleton pattern to ensure consistent state across the application.
 * This design prevents test isolation issues by providing explicit reset methods.
 */
class MockController {
  private state: MockState;

  constructor() {
    this.state = this.createFreshState(false);
  }

  private createFreshState(enabled: boolean): MockState {
    return {
      enabled,
      prCounter: 1,
      createdPrs: [],
      existingPrs: new Map(),
    };
  }

  /**
   * Enable mock mode with fresh state
   */
  enable(): void {
    this.state = this.createFreshState(true);
  }

  /**
   * Disable mock mode and reset state
   */
  disable(): void {
    this.state = this.createFreshState(false);
  }

  /**
   * Check if mock mode is enabled (either explicitly or via environment)
   */
  isEnabled(): boolean {
    return this.state.enabled || process.env.NEWPR_MOCK_GITHUB === '1';
  }

  /**
   * Get current mock state (for test assertions)
   */
  getState(): MockState {
    return this.state;
  }

  /**
   * Reset mock state without changing enabled status
   */
  reset(): void {
    const wasEnabled = this.state.enabled;
    this.state = this.createFreshState(wasEnabled);
  }

  /**
   * Get and increment PR counter
   */
  getNextPrNumber(): number {
    return this.state.prCounter++;
  }

  /**
   * Record a created PR
   */
  recordCreatedPr(pr: PrInfo): void {
    this.state.createdPrs.push(pr);
    this.state.existingPrs.set(pr.headBranch, pr);
  }

  /**
   * Get existing PR for a branch
   */
  getExistingPr(branch: string): PrInfo | undefined {
    return this.state.existingPrs.get(branch);
  }
}

// Singleton instance
const mockController = new MockController();

/**
 * Enable mock mode for testing
 */
export function enableMockMode(): void {
  mockController.enable();
}

/**
 * Disable mock mode
 */
export function disableMockMode(): void {
  mockController.disable();
}

/**
 * Check if mock mode is enabled
 */
export function isMockModeEnabled(): boolean {
  return mockController.isEnabled();
}

/**
 * Get mock state (for test assertions)
 */
export function getMockState(): MockState {
  return mockController.getState();
}

/**
 * Reset mock state
 */
export function resetMockState(): void {
  mockController.reset();
}

/**
 * Get next PR number (for mock mode)
 * @internal
 */
export function getNextMockPrNumber(): number {
  return mockController.getNextPrNumber();
}

/**
 * Record a created PR (for mock mode)
 * @internal
 */
export function recordMockPr(pr: PrInfo): void {
  mockController.recordCreatedPr(pr);
}

/**
 * Get existing PR for a branch (for mock mode)
 * @internal
 */
export function getMockExistingPr(branch: string): PrInfo | undefined {
  return mockController.getExistingPr(branch);
}

/**
 * Shell-escape a string for use in a command
 */
function shellEscape(str: string): string {
  // Quote any string containing shell metacharacters or special chars
  // This includes: spaces, quotes, backslashes, slashes, commas, and other special chars
  if (/[\s"'\\/:,;|&$!`(){}[\]*?<>~#]/.test(str)) {
    return `"${str.replace(/["\\$`]/g, '\\$&')}"`;
  }
  return str;
}

/**
 * PR creation options
 */
export interface CreatePrOptions {
  title: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
  repo?: string;
}

/**
 * PR information
 */
export interface PrInfo {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  url: string;
  headBranch: string;
  baseBranch: string;
  isDraft: boolean;
}

/**
 * Repository information
 */
export interface RepoInfo {
  owner: string;
  name: string;
  defaultBranch: string;
  url: string;
}

/**
 * Execute a gh command and return output
 */
function exec(args: string[], options: { cwd?: string; silent?: boolean } = {}): string {
  const escapedArgs = args.map(shellEscape);
  const cmd = `gh ${escapedArgs.join(' ')}`;
  const execOptions: ExecSyncOptions = {
    encoding: 'utf8',
    cwd: options.cwd,
    stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
  };

  try {
    const result = execSync(cmd, execOptions) as string;
    return result.trim();
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      const stderr = (error as { stderr?: Buffer | string }).stderr;
      if (stderr) {
        throw new Error(`GitHub CLI command failed: ${cmd}\n${stderr.toString()}`);
      }
    }
    throw error;
  }
}

/**
 * Execute a gh command, returning null on failure
 */
function execSafe(args: string[], options: { cwd?: string } = {}): string | null {
  try {
    return exec(args, { ...options, silent: true });
  } catch {
    return null;
  }
}

/**
 * Check if GitHub CLI is installed
 */
export function isGhInstalled(): boolean {
  if (isMockModeEnabled()) {
    return true;
  }
  try {
    execSync('gh --version', { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if user is authenticated with GitHub CLI
 */
export function isAuthenticated(): boolean {
  if (isMockModeEnabled()) {
    return true;
  }
  const result = execSafe(['auth', 'status']);
  return result !== null;
}

/**
 * Get repository information
 */
export function getRepoInfo(cwd?: string): RepoInfo | null {
  if (isMockModeEnabled()) {
    return {
      owner: 'mock-owner',
      name: 'mock-repo',
      defaultBranch: 'main',
      url: 'https://github.com/mock-owner/mock-repo',
    };
  }

  const result = execSafe(['repo', 'view', '--json', 'owner,name,defaultBranchRef,url'], { cwd });

  if (!result) {
    return null;
  }

  try {
    const data = JSON.parse(result);
    return {
      owner: data.owner.login,
      name: data.name,
      defaultBranch: data.defaultBranchRef?.name || 'main',
      url: data.url,
    };
  } catch {
    return null;
  }
}

/**
 * Create a pull request
 */
export function createPr(options: CreatePrOptions, cwd?: string): PrInfo {
  if (isMockModeEnabled()) {
    const prNumber = getNextMockPrNumber();
    const pr: PrInfo = {
      number: prNumber,
      title: options.title,
      state: 'OPEN',
      url: `https://github.com/mock-owner/mock-repo/pull/${prNumber}`,
      headBranch: options.head || 'unknown',
      baseBranch: options.base || 'main',
      isDraft: options.draft || false,
    };
    recordMockPr(pr);
    return pr;
  }

  const args = ['pr', 'create'];

  args.push('--title', options.title);

  if (options.body) {
    args.push('--body', options.body);
  }

  if (options.base) {
    args.push('--base', options.base);
  }

  if (options.head) {
    args.push('--head', options.head);
  }

  if (options.draft) {
    args.push('--draft');
  }

  if (options.repo) {
    args.push('--repo', options.repo);
  }

  // gh pr create doesn't support --json, it returns the PR URL on success
  const result = exec(args, { cwd });

  // Extract PR number from URL in output
  const urlMatch = result.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (urlMatch) {
    const prNumber = parseInt(urlMatch[1], 10);

    // Try to get full PR details using gh pr view
    const prInfo = getPr(prNumber, cwd);
    if (prInfo) {
      return prInfo;
    }

    // Fallback if pr view fails
    return {
      number: prNumber,
      title: options.title,
      state: 'OPEN',
      url: urlMatch[0],
      headBranch: options.head || '',
      baseBranch: options.base || 'main',
      isDraft: options.draft || false,
    };
  }

  throw new Error(`Failed to parse PR creation response: ${result}`);
}

/**
 * Get PR status by number
 */
export function getPr(prNumber: number, cwd?: string): PrInfo | null {
  if (isMockModeEnabled()) {
    const pr = getMockState().createdPrs.find((p) => p.number === prNumber);
    return pr || null;
  }

  const result = execSafe(
    [
      'pr',
      'view',
      String(prNumber),
      '--json',
      'number,title,state,url,headRefName,baseRefName,isDraft',
    ],
    { cwd }
  );

  if (!result) {
    return null;
  }

  try {
    const data = JSON.parse(result);
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      url: data.url,
      headBranch: data.headRefName,
      baseBranch: data.baseRefName,
      isDraft: data.isDraft,
    };
  } catch {
    return null;
  }
}

/**
 * Get PR by branch name
 */
export function getPrByBranch(branch: string, cwd?: string): PrInfo | null {
  if (isMockModeEnabled()) {
    return getMockExistingPr(branch) || null;
  }

  const result = execSafe(
    ['pr', 'view', branch, '--json', 'number,title,state,url,headRefName,baseRefName,isDraft'],
    { cwd }
  );

  if (!result) {
    return null;
  }

  try {
    const data = JSON.parse(result);
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      url: data.url,
      headBranch: data.headRefName,
      baseBranch: data.baseRefName,
      isDraft: data.isDraft,
    };
  } catch {
    return null;
  }
}

/**
 * List options for PRs
 */
export interface ListPrsOptions {
  state?: 'open' | 'closed' | 'merged' | 'all';
  author?: string;
  limit?: number;
}

/**
 * List pull requests
 */
export function listPrs(options: ListPrsOptions = {}, cwd?: string): PrInfo[] {
  if (isMockModeEnabled()) {
    let prs = [...getMockState().createdPrs];
    if (options.state && options.state !== 'all') {
      const stateMap: Record<string, string> = {
        open: 'OPEN',
        closed: 'CLOSED',
        merged: 'MERGED',
      };
      prs = prs.filter((pr) => pr.state === stateMap[options.state!]);
    }
    if (options.limit) {
      prs = prs.slice(0, options.limit);
    }
    return prs;
  }

  const args = ['pr', 'list'];

  if (options.state) {
    args.push('--state', options.state);
  }

  if (options.author) {
    args.push('--author', options.author);
  }

  if (options.limit) {
    args.push('--limit', String(options.limit));
  }

  args.push('--json', 'number,title,state,url,headRefName,baseRefName,isDraft');

  const result = execSafe(args, { cwd });

  if (!result) {
    return [];
  }

  try {
    const data = JSON.parse(result);
    return data.map((pr: Record<string, unknown>) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.url,
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
      isDraft: pr.isDraft,
    }));
  } catch {
    return [];
  }
}

/**
 * Extended PR information with additional metadata
 */
export interface PrListItem extends PrInfo {
  /** GitHub username of PR author */
  author: string;
  /** ISO 8601 timestamp of PR creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** Labels attached to the PR */
  labels: string[];
  /** Overall review decision */
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  /** Number of approving reviews */
  approvalCount: number;
  /** Total number of reviews */
  reviewCount: number;
  /** Combined status of all CI checks */
  checksStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
  /** Number of files changed */
  changedFiles: number;
}

/**
 * Extended list options for PRs
 */
export interface ListPrsExtendedOptions {
  state?: 'open' | 'closed' | 'merged' | 'all';
  author?: string;
  labels?: string[];
  limit?: number;
}

/**
 * List pull requests with extended metadata
 * Fetches additional info like reviews, CI status, labels
 */
export function listPrsExtended(options: ListPrsExtendedOptions = {}, cwd?: string): PrListItem[] {
  if (isMockModeEnabled()) {
    // In mock mode, return mock data with extended fields
    let prs = [...getMockState().createdPrs];
    if (options.state && options.state !== 'all') {
      const stateMap: Record<string, string> = {
        open: 'OPEN',
        closed: 'CLOSED',
        merged: 'MERGED',
      };
      prs = prs.filter((pr) => pr.state === stateMap[options.state!]);
    }
    if (options.limit) {
      prs = prs.slice(0, options.limit);
    }
    // Return PRs with mock extended fields
    return prs.map((pr) => ({
      ...pr,
      author: 'mock-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      labels: [],
      reviewDecision: null,
      approvalCount: 0,
      reviewCount: 0,
      checksStatus: null,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    }));
  }

  const args = ['pr', 'list'];

  if (options.state) {
    args.push('--state', options.state);
  }

  if (options.author) {
    args.push('--author', options.author);
  }

  if (options.labels && options.labels.length > 0) {
    for (const label of options.labels) {
      args.push('--label', label);
    }
  }

  if (options.limit) {
    args.push('--limit', String(options.limit));
  }

  // Request extended fields from GitHub CLI
  args.push(
    '--json',
    'number,title,state,url,headRefName,baseRefName,isDraft,author,createdAt,updatedAt,labels,reviewDecision,additions,deletions,changedFiles,reviews,statusCheckRollup'
  );

  const result = execSafe(args, { cwd });

  if (!result) {
    return [];
  }

  try {
    const data = JSON.parse(result);
    return data.map((pr: Record<string, unknown>) => {
      // Extract review counts
      const reviews = (pr.reviews as Array<{ state: string }>) || [];
      const approvalCount = reviews.filter((r) => r.state === 'APPROVED').length;

      // Extract CI status from statusCheckRollup
      let checksStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null = null;
      const statusChecks = pr.statusCheckRollup as Array<{
        status: string;
        conclusion: string;
      }> | null;
      if (statusChecks && statusChecks.length > 0) {
        const hasFailure = statusChecks.some(
          (c) => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR'
        );
        const hasPending = statusChecks.some(
          (c) => c.status === 'IN_PROGRESS' || c.status === 'QUEUED' || !c.conclusion
        );
        if (hasFailure) {
          checksStatus = 'FAILURE';
        } else if (hasPending) {
          checksStatus = 'PENDING';
        } else {
          checksStatus = 'SUCCESS';
        }
      }

      // Extract labels
      const labels = ((pr.labels as Array<{ name: string }>) || []).map((l) => l.name);

      // Extract author login
      const authorObj = pr.author as { login: string } | null;
      const author = authorObj?.login || 'unknown';

      return {
        number: pr.number as number,
        title: pr.title as string,
        state: pr.state as 'OPEN' | 'CLOSED' | 'MERGED',
        url: pr.url as string,
        headBranch: pr.headRefName as string,
        baseBranch: pr.baseRefName as string,
        isDraft: pr.isDraft as boolean,
        author,
        createdAt: pr.createdAt as string,
        updatedAt: pr.updatedAt as string,
        labels,
        reviewDecision:
          (pr.reviewDecision as 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED') || null,
        approvalCount,
        reviewCount: reviews.length,
        checksStatus,
        additions: (pr.additions as number) || 0,
        deletions: (pr.deletions as number) || 0,
        changedFiles: (pr.changedFiles as number) || 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Check out a PR by number
 */
export function checkoutPr(prNumber: number, cwd?: string): void {
  exec(['pr', 'checkout', String(prNumber)], { cwd });
}

/**
 * Get the current user's GitHub username
 */
export function getCurrentUser(): string | null {
  const result = execSafe(['api', 'user', '--jq', '.login']);
  return result;
}

/**
 * Extract PR number from branch name if it matches worktree pattern
 * e.g., "repo.pr123" -> 123
 */
export function extractPrNumberFromPath(worktreePath: string): number | null {
  const match = worktreePath.match(/\.pr(\d+)(?:\/|$)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
