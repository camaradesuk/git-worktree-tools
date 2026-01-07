import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * PR state in the mock
 */
export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

/**
 * Information about a mocked PR
 */
export interface MockPrInfo {
  number: number;
  state: PrState;
  title: string;
  headRefName: string;
  baseRefName: string;
  url: string;
  isDraft: boolean;
  author: string;
}

/**
 * Repository information for the mock
 */
export interface MockRepoInfo {
  owner: string;
  name: string;
  defaultBranch: string;
}

/**
 * Mutable state for the gh mock
 */
export interface GhMockState {
  authenticated: boolean;
  prCounter: number;
  prs: Map<number, MockPrInfo>;
  repo: MockRepoInfo;
}

/**
 * Options for setting up the gh mock
 */
export interface GhMockOptions {
  authenticated?: boolean;
  repo?: Partial<MockRepoInfo>;
  initialPrs?: MockPrInfo[];
}

/**
 * Result of setting up a gh mock
 */
export interface GhMockSetup {
  /** Path to the mock gh script */
  mockPath: string;
  /** Path to the state file */
  statePath: string;
  /** Modified PATH that includes mock directory first */
  mockEnv: NodeJS.ProcessEnv;
  /** Original PATH */
  originalPath: string;
  /** Get current mock state */
  getState: () => GhMockState;
  /** Update mock state */
  setState: (updates: Partial<GhMockState>) => void;
  /** Add a PR to the mock */
  addPr: (pr: Partial<MockPrInfo> & { number: number }) => MockPrInfo;
  /** Get a PR from the mock */
  getPr: (number: number) => MockPrInfo | undefined;
  /** Set PR state */
  setPrState: (number: number, state: PrState) => void;
  /** Clean up the mock */
  cleanup: () => void;
}

/**
 * Default repository info
 */
const DEFAULT_REPO: MockRepoInfo = {
  owner: 'testorg',
  name: 'testrepo',
  defaultBranch: 'main',
};

/**
 * Create the gh mock script content
 *
 * This script handles common gh commands and returns appropriate mock responses
 */
function createMockScript(statePath: string): string {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Windows batch script
    return `@echo off
node "${statePath.replace(/\\/g, '\\\\')}.handler.js" %*
`;
  }

  // Unix shell script
  return `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const statePath = ${JSON.stringify(statePath)};

// Read current state
function getState() {
  try {
    const data = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(data);
    // Convert prs array back to Map-like object access
    state.prsMap = new Map(state.prs || []);
    return state;
  } catch {
    return {
      authenticated: true,
      prCounter: 0,
      prs: [],
      prsMap: new Map(),
      repo: { owner: 'testorg', name: 'testrepo', defaultBranch: 'main' }
    };
  }
}

// Write state
function setState(state) {
  // Convert Map to array for JSON serialization
  const serializable = {
    ...state,
    prs: state.prsMap ? Array.from(state.prsMap.entries()) : state.prs
  };
  delete serializable.prsMap;
  fs.writeFileSync(statePath, JSON.stringify(serializable, null, 2));
}

const args = process.argv.slice(2);
const state = getState();

// Parse command
const command = args[0];
const subcommand = args[1];

// Helper to find --json fields
function getJsonFields() {
  const idx = args.indexOf('--json');
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1].split(',');
  }
  return null;
}

// Handle commands
if (command === '--version') {
  console.log('gh version 2.40.0 (mock)');
  process.exit(0);
}

if (command === 'auth' && subcommand === 'status') {
  if (state.authenticated) {
    console.log('Logged in to github.com');
    process.exit(0);
  } else {
    console.error('You are not logged into any GitHub hosts.');
    process.exit(1);
  }
}

if (command === 'repo' && subcommand === 'view') {
  const fields = getJsonFields();
  if (fields) {
    const result = {};
    if (fields.includes('owner')) result.owner = { login: state.repo.owner };
    if (fields.includes('name')) result.name = state.repo.name;
    if (fields.includes('defaultBranchRef')) {
      result.defaultBranchRef = { name: state.repo.defaultBranch };
    }
    console.log(JSON.stringify(result));
    process.exit(0);
  }
  console.log(\`\${state.repo.owner}/\${state.repo.name}\`);
  process.exit(0);
}

if (command === 'pr' && subcommand === 'create') {
  if (!state.authenticated) {
    console.error('You are not logged into any GitHub hosts.');
    process.exit(1);
  }

  // Parse args
  let title = '';
  let body = '';
  let base = state.repo.defaultBranch;
  let head = '';
  let isDraft = false;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--title' || args[i] === '-t') {
      title = args[++i];
    } else if (args[i] === '--body' || args[i] === '-b') {
      body = args[++i];
    } else if (args[i] === '--base' || args[i] === '-B') {
      base = args[++i];
    } else if (args[i] === '--head' || args[i] === '-H') {
      head = args[++i];
    } else if (args[i] === '--draft' || args[i] === '-d') {
      isDraft = true;
    }
  }

  // Create new PR
  const prNumber = state.prCounter + 1;
  const pr = {
    number: prNumber,
    state: 'OPEN',
    title: title || 'New PR',
    headRefName: head || 'feature-branch',
    baseRefName: base,
    url: \`https://github.com/\${state.repo.owner}/\${state.repo.name}/pull/\${prNumber}\`,
    isDraft,
    author: 'testuser'
  };

  state.prsMap.set(prNumber, pr);
  state.prCounter = prNumber;
  setState(state);

  console.log(pr.url);
  process.exit(0);
}

if (command === 'pr' && subcommand === 'view') {
  const fields = getJsonFields();
  let prIdentifier = args[2];

  // Skip --json flag if it comes before identifier
  if (prIdentifier === '--json') {
    prIdentifier = args[4];
  }

  let pr;
  if (prIdentifier && !prIdentifier.startsWith('-')) {
    // Look up by number or branch
    const num = parseInt(prIdentifier, 10);
    if (!isNaN(num)) {
      pr = state.prsMap.get(num);
    } else {
      // Search by branch name
      for (const [, p] of state.prsMap) {
        if (p.headRefName === prIdentifier) {
          pr = p;
          break;
        }
      }
    }
  }

  if (!pr) {
    console.error('no pull requests found');
    process.exit(1);
  }

  if (fields) {
    const result = {};
    for (const field of fields) {
      if (field in pr) {
        result[field] = pr[field];
      }
    }
    console.log(JSON.stringify(result));
    process.exit(0);
  }

  console.log(\`#\${pr.number} \${pr.title}\`);
  process.exit(0);
}

if (command === 'pr' && subcommand === 'list') {
  const fields = getJsonFields();
  let prs = Array.from(state.prsMap.values());

  // Handle --state filter
  const stateIdx = args.indexOf('--state');
  if (stateIdx !== -1 && args[stateIdx + 1]) {
    const stateFilter = args[stateIdx + 1].toUpperCase();
    if (stateFilter !== 'ALL') {
      prs = prs.filter(pr => pr.state === stateFilter);
    }
  }

  // Handle --limit filter
  const limitIdx = args.indexOf('--limit') !== -1 ? args.indexOf('--limit') : args.indexOf('-L');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    const limit = parseInt(args[limitIdx + 1], 10);
    if (!isNaN(limit)) {
      prs = prs.slice(0, limit);
    }
  }

  if (fields) {
    const results = prs.map(pr => {
      const result = {};
      for (const field of fields) {
        if (field in pr) {
          result[field] = pr[field];
        } else {
          // Provide mock values for extended fields
          switch (field) {
            case 'author':
              result[field] = { login: pr.author || 'testuser' };
              break;
            case 'createdAt':
              result[field] = new Date(Date.now() - 86400000).toISOString();
              break;
            case 'updatedAt':
              result[field] = new Date().toISOString();
              break;
            case 'labels':
              result[field] = [];
              break;
            case 'reviewDecision':
              result[field] = null;
              break;
            case 'additions':
              result[field] = 10;
              break;
            case 'deletions':
              result[field] = 5;
              break;
            case 'changedFiles':
              result[field] = 2;
              break;
            case 'reviews':
              result[field] = [];
              break;
            case 'statusCheckRollup':
              result[field] = null;
              break;
          }
        }
      }
      return result;
    });
    console.log(JSON.stringify(results));
    process.exit(0);
  }

  for (const pr of prs) {
    console.log(\`#\${pr.number} \${pr.title}\`);
  }
  process.exit(0);
}

if (command === 'pr' && subcommand === 'checkout') {
  // Just pretend to checkout - actual git operations should be done separately
  console.log(\`Switched to branch '\${args[2]}'\`);
  process.exit(0);
}

// Unknown command
console.error(\`Unknown command: \${args.join(' ')}\`);
process.exit(1);
`;
}

/**
 * Create a Windows handler script
 */
function createWindowsHandler(statePath: string): string {
  // Get the script content without the shebang
  const script = createMockScript(statePath);
  const lines = script.split('\n');
  // Remove shebang line
  if (lines[0].startsWith('#!')) {
    lines.shift();
  }
  return lines.join('\n');
}

/**
 * Set up a mock gh CLI for testing
 *
 * Creates a temporary directory with a mock gh script that intercepts
 * gh commands and returns predictable responses based on the mock state.
 *
 * @param options - Configuration options
 * @returns Mock setup with cleanup function
 */
export function setupGhMock(options: GhMockOptions = {}): GhMockSetup {
  const isWindows = process.platform === 'win32';

  // Create temp directory for mock
  const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-mock-'));
  const statePath = path.join(mockDir, 'state.json');
  const mockScriptName = isWindows ? 'gh.cmd' : 'gh';
  const mockPath = path.join(mockDir, mockScriptName);

  // Initialize state
  const initialState: GhMockState = {
    authenticated: options.authenticated ?? true,
    prCounter: 0,
    prs: new Map(),
    repo: { ...DEFAULT_REPO, ...options.repo },
  };

  // Add initial PRs
  if (options.initialPrs) {
    for (const pr of options.initialPrs) {
      initialState.prs.set(pr.number, pr);
      if (pr.number > initialState.prCounter) {
        initialState.prCounter = pr.number;
      }
    }
  }

  // Write initial state
  const serializableState = {
    ...initialState,
    prs: Array.from(initialState.prs.entries()),
  };
  fs.writeFileSync(statePath, JSON.stringify(serializableState, null, 2));

  // Create mock script
  if (isWindows) {
    // Write the batch file
    fs.writeFileSync(mockPath, createMockScript(statePath));
    // Write the handler JS file
    fs.writeFileSync(`${statePath}.handler.js`, createWindowsHandler(statePath));
  } else {
    fs.writeFileSync(mockPath, createMockScript(statePath));
    fs.chmodSync(mockPath, 0o755);
  }

  // Prepare modified PATH
  const originalPath = process.env.PATH || '';
  const mockEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${mockDir}${path.delimiter}${originalPath}`,
  };

  // Helper functions
  function readState(): GhMockState {
    const data = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      prs: new Map(parsed.prs || []),
    };
  }

  function writeState(state: GhMockState): void {
    const serializable = {
      ...state,
      prs: Array.from(state.prs.entries()),
    };
    fs.writeFileSync(statePath, JSON.stringify(serializable, null, 2));
  }

  return {
    mockPath,
    statePath,
    mockEnv,
    originalPath,

    getState: readState,

    setState: (updates: Partial<GhMockState>) => {
      const current = readState();
      writeState({ ...current, ...updates });
    },

    addPr: (pr: Partial<MockPrInfo> & { number: number }) => {
      const state = readState();
      const fullPr: MockPrInfo = {
        number: pr.number,
        state: pr.state || 'OPEN',
        title: pr.title || `PR #${pr.number}`,
        headRefName: pr.headRefName || `feature-${pr.number}`,
        baseRefName: pr.baseRefName || state.repo.defaultBranch,
        url:
          pr.url || `https://github.com/${state.repo.owner}/${state.repo.name}/pull/${pr.number}`,
        isDraft: pr.isDraft || false,
        author: pr.author || 'testuser',
      };
      state.prs.set(pr.number, fullPr);
      if (pr.number > state.prCounter) {
        state.prCounter = pr.number;
      }
      writeState(state);
      return fullPr;
    },

    getPr: (number: number) => {
      const state = readState();
      return state.prs.get(number);
    },

    setPrState: (number: number, newState: PrState) => {
      const state = readState();
      const pr = state.prs.get(number);
      if (pr) {
        pr.state = newState;
        state.prs.set(number, pr);
        writeState(state);
      }
    },

    cleanup: () => {
      try {
        fs.rmSync(mockDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Create a quick gh mock for simple test cases
 *
 * @param authenticated - Whether gh should appear authenticated
 * @returns Mock setup
 */
export function createSimpleMock(authenticated = true): GhMockSetup {
  return setupGhMock({ authenticated });
}
