/**
 * wtconfig library - public API exports
 */

// Types
export type {
  EnvironmentInfo,
  WizardState,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ConfigSource,
} from './types.js';

// Environment detection
export {
  detectEnvironment,
  detectDefaultBranch,
  getInstallCommand,
  getEditorCommand,
} from './environment.js';

// Configuration management
export {
  getGlobalConfigPath,
  findRepoConfigPath,
  getDefaultRepoConfigPath,
  getConfigSource,
  loadConfigFromPath,
  loadGlobalConfig,
  loadRepoConfig,
  loadMergedConfig,
  saveConfig,
  saveGlobalConfig,
  saveRepoConfig,
  setConfigValue,
  getConfigValue,
  validateConfig,
  formatConfigDisplay,
} from './config-manager.js';
