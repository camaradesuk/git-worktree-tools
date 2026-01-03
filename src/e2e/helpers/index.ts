/**
 * E2E Test Helpers
 *
 * This module exports all helpers needed for end-to-end testing of the CLI tools.
 */

// CLI Runner
export {
  runCli,
  runCliJson,
  ensureCliBuild,
  ensureCliBuildSync,
  normalizePath,
  pathsEqual,
  normalizeLineEndings,
  isGhAvailable,
  GH_AVAILABLE,
  CLI_DIR,
  type CliTool,
  type CliResult,
  type CliOptions,
  type JsonCliResult,
} from './cli-runner.js';

// GitHub Mock
export {
  setupGhMock,
  createSimpleMock,
  type PrState,
  type MockPrInfo,
  type MockRepoInfo,
  type GhMockState,
  type GhMockOptions,
  type GhMockSetup,
} from './gh-mock.js';

// Scenario Harness
export {
  createScenario,
  createAllScenarios,
  cleanupAllScenarios,
  ALL_SCENARIOS,
  type ScenarioSetup,
  type ScenarioOptions,
} from './scenario-harness.js';

// PTY Wrapper
export {
  isPtyAvailable,
  spawnPty,
  runInteractive,
  menuInteractions,
  stripAnsi,
  delay,
  type PtyOptions,
  type PtyInteraction,
  type PtyResult,
  type PtySession,
} from './pty-wrapper.js';

// Test Context
export {
  createTestContext,
  useTestContext,
  createMultiScenarioContexts,
  cleanupAllContexts,
  addFile,
  createBranch,
  createWorktree,
  getGitStatus,
  type TestContextOptions,
  type TestContext,
} from './test-context.js';

// Re-export Scenario type for convenience
export type { Scenario } from '../../lib/state-detection.js';
