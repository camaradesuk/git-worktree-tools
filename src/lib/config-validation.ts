/**
 * Config Validation Module
 *
 * Validates .worktreerc configuration files against the JSON schema.
 */

import type { WorktreeConfig } from './config.js';

/**
 * Validation error with path and message
 */
export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Result of config validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Valid AI provider names
 */
const VALID_AI_PROVIDERS = [
  'auto',
  'claude',
  'gemini',
  'openai',
  'ollama',
  'script',
  'fallback',
  'none',
];

/**
 * Valid editor options
 */
const VALID_EDITORS = ['vscode', 'cursor', 'auto'];

/**
 * Valid branch styles
 */
const VALID_BRANCH_STYLES = ['conventional', 'kebab', 'snake'];

/**
 * Valid commit styles
 */
const VALID_COMMIT_STYLES = ['conventional', 'gitmoji', 'simple'];

/**
 * Valid hook names
 */
const VALID_HOOK_NAMES = [
  'pre-analyze',
  'post-analyze',
  'pre-branch',
  'post-branch',
  'pre-commit',
  'post-commit',
  'pre-push',
  'post-push',
  'pre-pr',
  'post-pr',
  'pre-worktree',
  'post-worktree',
  'cleanup',
];

/**
 * Known top-level config keys
 */
const KNOWN_TOP_LEVEL_KEYS = [
  '$schema',
  'sharedRepos',
  'baseBranch',
  'draftPr',
  'worktreePattern',
  'worktreeParent',
  'syncPatterns',
  'branchPrefix',
  'preferredEditor',
  'ai',
  'hooks',
  'hookDefaults',
  'plugins',
  'generators',
  'integrations',
];

/**
 * Validate a worktree config object
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof config !== 'object' || config === null) {
    return { valid: false, errors: [{ path: '', message: 'Config must be an object' }] };
  }

  const obj = config as Record<string, unknown>;

  // Check for unknown top-level keys
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.includes(key)) {
      errors.push({ path: key, message: `Unknown config property: ${key}` });
    }
  }

  // Validate sharedRepos
  if (obj.sharedRepos !== undefined) {
    if (!Array.isArray(obj.sharedRepos)) {
      errors.push({ path: 'sharedRepos', message: 'sharedRepos must be an array' });
    } else {
      obj.sharedRepos.forEach((item, i) => {
        if (typeof item !== 'string') {
          errors.push({ path: `sharedRepos[${i}]`, message: 'sharedRepos items must be strings' });
        }
      });
    }
  }

  // Validate baseBranch
  if (obj.baseBranch !== undefined && typeof obj.baseBranch !== 'string') {
    errors.push({ path: 'baseBranch', message: 'baseBranch must be a string' });
  }

  // Validate draftPr
  if (obj.draftPr !== undefined && typeof obj.draftPr !== 'boolean') {
    errors.push({ path: 'draftPr', message: 'draftPr must be a boolean' });
  }

  // Validate worktreePattern
  if (obj.worktreePattern !== undefined && typeof obj.worktreePattern !== 'string') {
    errors.push({ path: 'worktreePattern', message: 'worktreePattern must be a string' });
  }

  // Validate worktreeParent
  if (obj.worktreeParent !== undefined && typeof obj.worktreeParent !== 'string') {
    errors.push({ path: 'worktreeParent', message: 'worktreeParent must be a string' });
  }

  // Validate syncPatterns
  if (obj.syncPatterns !== undefined) {
    if (!Array.isArray(obj.syncPatterns)) {
      errors.push({ path: 'syncPatterns', message: 'syncPatterns must be an array' });
    } else {
      obj.syncPatterns.forEach((item, i) => {
        if (typeof item !== 'string') {
          errors.push({
            path: `syncPatterns[${i}]`,
            message: 'syncPatterns items must be strings',
          });
        }
      });
    }
  }

  // Validate branchPrefix
  if (obj.branchPrefix !== undefined && typeof obj.branchPrefix !== 'string') {
    errors.push({ path: 'branchPrefix', message: 'branchPrefix must be a string' });
  }

  // Validate preferredEditor
  if (obj.preferredEditor !== undefined) {
    if (typeof obj.preferredEditor !== 'string' || !VALID_EDITORS.includes(obj.preferredEditor)) {
      errors.push({
        path: 'preferredEditor',
        message: `preferredEditor must be one of: ${VALID_EDITORS.join(', ')}`,
      });
    }
  }

  // Validate plugins
  if (obj.plugins !== undefined) {
    if (!Array.isArray(obj.plugins)) {
      errors.push({ path: 'plugins', message: 'plugins must be an array' });
    } else {
      obj.plugins.forEach((item, i) => {
        if (typeof item !== 'string') {
          errors.push({ path: `plugins[${i}]`, message: 'plugins items must be strings' });
        }
      });
    }
  }

  // Validate ai config
  if (obj.ai !== undefined) {
    validateAIConfig(obj.ai, errors);
  }

  // Validate hooks config
  if (obj.hooks !== undefined) {
    validateHooksConfig(obj.hooks, errors);
  }

  // Validate hookDefaults config
  if (obj.hookDefaults !== undefined) {
    validateHookDefaultsConfig(obj.hookDefaults, errors);
  }

  // Validate generators config
  if (obj.generators !== undefined) {
    validateGeneratorsConfig(obj.generators, errors);
  }

  // Validate integrations config
  if (obj.integrations !== undefined) {
    validateIntegrationsConfig(obj.integrations, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate AI config section
 */
function validateAIConfig(ai: unknown, errors: ValidationError[]): void {
  if (typeof ai !== 'object' || ai === null) {
    errors.push({ path: 'ai', message: 'ai must be an object' });
    return;
  }

  const obj = ai as Record<string, unknown>;
  const knownKeys = [
    'provider',
    'fallback',
    'branchName',
    'prTitle',
    'prDescription',
    'commitMessage',
    'planDocument',
    'branchStyle',
    'commitStyle',
    'prTemplate',
    'planTemplate',
    'claude',
    'gemini',
    'openai',
    'ollama',
    'script',
  ];

  // Check for unknown keys
  for (const key of Object.keys(obj)) {
    if (!knownKeys.includes(key)) {
      errors.push({ path: `ai.${key}`, message: `Unknown ai property: ${key}` });
    }
  }

  // Validate provider
  if (obj.provider !== undefined) {
    if (typeof obj.provider !== 'string' || !VALID_AI_PROVIDERS.includes(obj.provider)) {
      errors.push({
        path: 'ai.provider',
        message: `ai.provider must be one of: ${VALID_AI_PROVIDERS.join(', ')}`,
      });
    }
  }

  // Validate fallback
  if (obj.fallback !== undefined) {
    if (typeof obj.fallback !== 'string' || !VALID_AI_PROVIDERS.includes(obj.fallback)) {
      errors.push({
        path: 'ai.fallback',
        message: `ai.fallback must be one of: ${VALID_AI_PROVIDERS.join(', ')}`,
      });
    }
  }

  // Validate boolean flags
  const boolFlags = ['branchName', 'prTitle', 'prDescription', 'commitMessage', 'planDocument'];
  for (const flag of boolFlags) {
    if (obj[flag] !== undefined && typeof obj[flag] !== 'boolean') {
      errors.push({ path: `ai.${flag}`, message: `ai.${flag} must be a boolean` });
    }
  }

  // Validate branchStyle
  if (obj.branchStyle !== undefined) {
    if (typeof obj.branchStyle !== 'string' || !VALID_BRANCH_STYLES.includes(obj.branchStyle)) {
      errors.push({
        path: 'ai.branchStyle',
        message: `ai.branchStyle must be one of: ${VALID_BRANCH_STYLES.join(', ')}`,
      });
    }
  }

  // Validate commitStyle
  if (obj.commitStyle !== undefined) {
    if (typeof obj.commitStyle !== 'string' || !VALID_COMMIT_STYLES.includes(obj.commitStyle)) {
      errors.push({
        path: 'ai.commitStyle',
        message: `ai.commitStyle must be one of: ${VALID_COMMIT_STYLES.join(', ')}`,
      });
    }
  }

  // Validate template paths
  if (obj.prTemplate !== undefined && typeof obj.prTemplate !== 'string') {
    errors.push({ path: 'ai.prTemplate', message: 'ai.prTemplate must be a string' });
  }
  if (obj.planTemplate !== undefined && typeof obj.planTemplate !== 'string') {
    errors.push({ path: 'ai.planTemplate', message: 'ai.planTemplate must be a string' });
  }

  // Validate provider-specific configs
  validateProviderConfig(obj.claude, 'ai.claude', ['model'], errors);
  validateProviderConfig(obj.gemini, 'ai.gemini', ['model'], errors);
  validateProviderConfig(obj.openai, 'ai.openai', ['model'], errors);
  validateProviderConfig(obj.ollama, 'ai.ollama', ['model', 'host'], errors);

  // Validate script config
  if (obj.script !== undefined) {
    if (typeof obj.script !== 'object' || obj.script === null) {
      errors.push({ path: 'ai.script', message: 'ai.script must be an object' });
    } else {
      const script = obj.script as Record<string, unknown>;
      if (typeof script.path !== 'string') {
        errors.push({
          path: 'ai.script.path',
          message: 'ai.script.path is required and must be a string',
        });
      }
    }
  }
}

/**
 * Validate provider-specific config
 */
function validateProviderConfig(
  config: unknown,
  path: string,
  allowedKeys: string[],
  errors: ValidationError[]
): void {
  if (config === undefined) return;

  if (typeof config !== 'object' || config === null) {
    errors.push({ path, message: `${path} must be an object` });
    return;
  }

  const obj = config as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({ path: `${path}.${key}`, message: `Unknown property: ${key}` });
    } else if (typeof obj[key] !== 'string') {
      errors.push({ path: `${path}.${key}`, message: `${path}.${key} must be a string` });
    }
  }
}

/**
 * Validate hooks config section
 */
function validateHooksConfig(hooks: unknown, errors: ValidationError[]): void {
  if (typeof hooks !== 'object' || hooks === null) {
    errors.push({ path: 'hooks', message: 'hooks must be an object' });
    return;
  }

  const obj = hooks as Record<string, unknown>;

  for (const [hookName, hookDef] of Object.entries(obj)) {
    if (!VALID_HOOK_NAMES.includes(hookName)) {
      errors.push({ path: `hooks.${hookName}`, message: `Unknown hook: ${hookName}` });
      continue;
    }

    validateHookDefinition(hookDef, `hooks.${hookName}`, errors);
  }
}

/**
 * Validate a single hook definition
 */
function validateHookDefinition(def: unknown, path: string, errors: ValidationError[]): void {
  // Simple string command
  if (typeof def === 'string') {
    return;
  }

  // Array of commands
  if (Array.isArray(def)) {
    def.forEach((item, i) => {
      if (typeof item !== 'string') {
        errors.push({ path: `${path}[${i}]`, message: 'Hook command array items must be strings' });
      }
    });
    return;
  }

  // Complex hook object
  if (typeof def === 'object' && def !== null) {
    const obj = def as Record<string, unknown>;
    const allowedKeys = ['command', 'script', 'timeout', 'failOnError', 'if', 'env'];

    for (const key of Object.keys(obj)) {
      if (!allowedKeys.includes(key)) {
        errors.push({ path: `${path}.${key}`, message: `Unknown hook property: ${key}` });
      }
    }

    if (obj.command !== undefined && typeof obj.command !== 'string') {
      errors.push({ path: `${path}.command`, message: 'command must be a string' });
    }
    if (obj.script !== undefined && typeof obj.script !== 'string') {
      errors.push({ path: `${path}.script`, message: 'script must be a string' });
    }
    if (obj.timeout !== undefined && (typeof obj.timeout !== 'number' || obj.timeout < 0)) {
      errors.push({ path: `${path}.timeout`, message: 'timeout must be a non-negative number' });
    }
    if (obj.failOnError !== undefined && typeof obj.failOnError !== 'boolean') {
      errors.push({ path: `${path}.failOnError`, message: 'failOnError must be a boolean' });
    }
    if (obj.if !== undefined && typeof obj.if !== 'string') {
      errors.push({ path: `${path}.if`, message: 'if must be a string' });
    }
    if (obj.env !== undefined) {
      if (typeof obj.env !== 'object' || obj.env === null || Array.isArray(obj.env)) {
        errors.push({ path: `${path}.env`, message: 'env must be an object' });
      } else {
        for (const [k, v] of Object.entries(obj.env as Record<string, unknown>)) {
          if (typeof v !== 'string') {
            errors.push({ path: `${path}.env.${k}`, message: 'env values must be strings' });
          }
        }
      }
    }
    return;
  }

  errors.push({ path, message: 'Hook must be a string, array, or object' });
}

/**
 * Validate hookDefaults config section
 */
function validateHookDefaultsConfig(hookDefaults: unknown, errors: ValidationError[]): void {
  if (typeof hookDefaults !== 'object' || hookDefaults === null) {
    errors.push({ path: 'hookDefaults', message: 'hookDefaults must be an object' });
    return;
  }

  const obj = hookDefaults as Record<string, unknown>;
  const allowedKeys = ['timeout', 'maxTimeout'];

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({
        path: `hookDefaults.${key}`,
        message: `Unknown hookDefaults property: ${key}`,
      });
    }
  }

  if (obj.timeout !== undefined && (typeof obj.timeout !== 'number' || obj.timeout < 0)) {
    errors.push({ path: 'hookDefaults.timeout', message: 'timeout must be a non-negative number' });
  }
  if (obj.maxTimeout !== undefined && (typeof obj.maxTimeout !== 'number' || obj.maxTimeout < 0)) {
    errors.push({
      path: 'hookDefaults.maxTimeout',
      message: 'maxTimeout must be a non-negative number',
    });
  }
}

/**
 * Validate generators config section
 */
function validateGeneratorsConfig(generators: unknown, errors: ValidationError[]): void {
  if (typeof generators !== 'object' || generators === null) {
    errors.push({ path: 'generators', message: 'generators must be an object' });
    return;
  }

  const obj = generators as Record<string, unknown>;
  const allowedKeys = ['branchName', 'prTitle', 'prDescription', 'commitMessage'];

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({ path: `generators.${key}`, message: `Unknown generators property: ${key}` });
    } else if (typeof obj[key] !== 'string') {
      errors.push({ path: `generators.${key}`, message: `generators.${key} must be a string` });
    }
  }
}

/**
 * Validate integrations config section
 */
function validateIntegrationsConfig(integrations: unknown, errors: ValidationError[]): void {
  if (typeof integrations !== 'object' || integrations === null) {
    errors.push({ path: 'integrations', message: 'integrations must be an object' });
    return;
  }

  const obj = integrations as Record<string, unknown>;
  const allowedKeys = ['linear', 'jira', 'slack'];

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({
        path: `integrations.${key}`,
        message: `Unknown integrations property: ${key}`,
      });
    }
  }

  // Validate linear
  if (obj.linear !== undefined) {
    validateLinearConfig(obj.linear, errors);
  }

  // Validate jira
  if (obj.jira !== undefined) {
    validateJiraConfig(obj.jira, errors);
  }

  // Validate slack
  if (obj.slack !== undefined) {
    validateSlackConfig(obj.slack, errors);
  }
}

/**
 * Validate Linear integration config
 */
function validateLinearConfig(linear: unknown, errors: ValidationError[]): void {
  if (typeof linear !== 'object' || linear === null) {
    errors.push({ path: 'integrations.linear', message: 'integrations.linear must be an object' });
    return;
  }

  const obj = linear as Record<string, unknown>;
  const allowedKeys = ['teamId', 'apiKeyEnv'];

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({
        path: `integrations.linear.${key}`,
        message: `Unknown linear property: ${key}`,
      });
    } else if (typeof obj[key] !== 'string') {
      errors.push({
        path: `integrations.linear.${key}`,
        message: `integrations.linear.${key} must be a string`,
      });
    }
  }
}

/**
 * Validate Jira integration config
 */
function validateJiraConfig(jira: unknown, errors: ValidationError[]): void {
  if (typeof jira !== 'object' || jira === null) {
    errors.push({ path: 'integrations.jira', message: 'integrations.jira must be an object' });
    return;
  }

  const obj = jira as Record<string, unknown>;
  const allowedKeys = ['projectKey', 'baseUrl', 'apiTokenEnv'];

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({ path: `integrations.jira.${key}`, message: `Unknown jira property: ${key}` });
    } else if (typeof obj[key] !== 'string') {
      errors.push({
        path: `integrations.jira.${key}`,
        message: `integrations.jira.${key} must be a string`,
      });
    }
  }
}

/**
 * Validate Slack integration config
 */
function validateSlackConfig(slack: unknown, errors: ValidationError[]): void {
  if (typeof slack !== 'object' || slack === null) {
    errors.push({ path: 'integrations.slack', message: 'integrations.slack must be an object' });
    return;
  }

  const obj = slack as Record<string, unknown>;
  const allowedKeys = ['webhookUrl', 'channel'];

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push({ path: `integrations.slack.${key}`, message: `Unknown slack property: ${key}` });
    } else if (typeof obj[key] !== 'string') {
      errors.push({
        path: `integrations.slack.${key}`,
        message: `integrations.slack.${key} must be a string`,
      });
    }
  }
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  const lines = errors.map((e) => {
    const path = e.path ? `  ${e.path}: ` : '  ';
    return `${path}${e.message}`;
  });

  return `Configuration validation errors:\n${lines.join('\n')}`;
}
