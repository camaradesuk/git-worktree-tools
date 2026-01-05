/**
 * Types for wtconfig command
 */

/**
 * Detected environment information
 */
export interface EnvironmentInfo {
  os: 'windows' | 'macos' | 'linux';

  git: {
    version: string | null;
    configured: boolean;
    user: string | null;
    email: string | null;
  };

  github: {
    installed: boolean;
    authenticated: boolean;
    user: string | null;
  };

  ai: {
    claudeCode: boolean;
    geminiCLI: boolean;
    ollama: boolean;
    codexCLI: boolean;
  };

  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;

  ide: {
    vscode: boolean;
    cursor: boolean;
  };
}

/**
 * Wizard configuration state
 */
export interface WizardState {
  baseBranch: string;
  draftPr: boolean;
  worktreeLocation: 'sibling' | 'inside' | 'custom';
  worktreePattern: string;
  worktreeParent: string;
  branchPrefix: string;
  preferredEditor: 'vscode' | 'cursor' | 'auto';
  aiEnabled: boolean;
  aiProvider: 'auto' | 'claude' | 'gemini' | 'openai' | 'ollama' | 'none';
  aiBranchName: boolean;
  aiPrTitle: boolean;
  aiPrDescription: boolean;
  aiCommitMessage: boolean;
  hooks: {
    autoDeps: boolean;
    openEditor: boolean;
  };
  // Phase 8: Advanced configuration
  plugins: string[];
  generators: {
    branchName?: string;
    prTitle?: string;
    prDescription?: string;
    commitMessage?: string;
  };
  integrations: {
    linear?: {
      teamId?: string;
      apiKeyEnv?: string;
    };
    jira?: {
      projectKey?: string;
      baseUrl?: string;
      apiTokenEnv?: string;
    };
    slack?: {
      webhookUrl?: string;
      channel?: string;
    };
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

/**
 * Configuration source information
 */
export interface ConfigSource {
  type: 'global' | 'repository' | 'none';
  path: string | null;
}
