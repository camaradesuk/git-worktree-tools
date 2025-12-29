import { execSync, ExecSyncOptions } from 'child_process';

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
  const cmd = `gh ${args.join(' ')}`;
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
  const result = execSafe(['auth', 'status']);
  return result !== null;
}

/**
 * Get repository information
 */
export function getRepoInfo(cwd?: string): RepoInfo | null {
  const result = execSafe(
    [
      'repo',
      'view',
      '--json',
      'owner,name,defaultBranchRef,url',
    ],
    { cwd }
  );

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

  // Request JSON output
  args.push('--json', 'number,title,state,url,headRefName,baseRefName,isDraft');

  const result = exec(args, { cwd });

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
    // If JSON parsing fails, try to extract PR number from URL in output
    const urlMatch = result.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
    if (urlMatch) {
      return {
        number: parseInt(urlMatch[1], 10),
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
}

/**
 * Get PR status by number
 */
export function getPr(prNumber: number, cwd?: string): PrInfo | null {
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
  const result = execSafe(
    [
      'pr',
      'view',
      branch,
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
