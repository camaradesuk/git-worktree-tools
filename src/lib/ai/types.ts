/**
 * AI Provider types and interfaces
 *
 * Defines the contracts for AI content generation providers.
 */

/**
 * Repository documentation for context
 */
export interface RepoDocumentationContext {
  /** README content (truncated) */
  readme?: string;
  /** Project description from package file */
  projectDescription?: string;
  /** Tech stack keywords */
  techStack?: string[];
}

/**
 * Context for generating branch names
 */
export interface BranchContext {
  /** User-provided description/intent for the branch */
  description: string;
  /** Repository name */
  repoName: string;
  /** Branch prefix from config (e.g., 'feat', 'fix') */
  branchPrefix: string;
  /** List of existing branch names to avoid collisions */
  existingBranches?: string[];
  /** Maximum length for branch name */
  maxLength?: number;
  /** Repository documentation for additional context */
  repoDocumentation?: RepoDocumentationContext;
}

/**
 * Context for generating PR titles and descriptions
 */
export interface PRContext {
  /** User-provided description/intent for the PR */
  description: string;
  /** Git diff content */
  diff?: string;
  /** List of commits in the PR */
  commits?: CommitInfo[];
  /** Branch name */
  branchName: string;
  /** Base branch (e.g., 'main') */
  baseBranch: string;
  /** List of changed files */
  changedFiles?: string[];
  /** Repository documentation for additional context */
  repoDocumentation?: RepoDocumentationContext;
}

/**
 * Commit information for context
 */
export interface CommitInfo {
  /** Commit hash (short) */
  hash: string;
  /** Commit message */
  message: string;
  /** Commit author */
  author?: string;
}

/**
 * Context for generating commit messages
 */
export interface CommitContext {
  /** List of staged files */
  stagedFiles: string[];
  /** Git diff of staged changes */
  diff?: string;
  /** Recent commit messages for style reference */
  recentCommits?: string[];
  /** Commit message style */
  style?: 'conventional' | 'gitmoji' | 'simple';
}

/**
 * Context for generating plan documents
 */
export interface PlanContext {
  /** User-provided description/intent */
  description: string;
  /** Key files and folders in the repo */
  repoStructure?: string[];
  /** Tech stack detected */
  techStack?: string[];
  /** Branch name */
  branchName: string;
  /** Repository documentation for additional context */
  repoDocumentation?: RepoDocumentationContext;
}

/**
 * Result from AI generation
 */
export interface AIGenerationResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated content */
  content?: string;
  /** Error message if failed */
  error?: string;
  /** Provider used */
  provider: string;
}

/**
 * AI Provider interface
 *
 * Each provider (Claude, Gemini, OpenAI, Ollama, etc.) implements this interface.
 */
export interface AIProvider {
  /** Provider name for identification */
  readonly name: string;

  /** Check if provider is available/configured */
  isAvailable(): Promise<boolean>;

  /** Generate a branch name from description */
  generateBranchName(context: BranchContext): Promise<AIGenerationResult>;

  /** Generate a PR title from context */
  generatePRTitle(context: PRContext): Promise<AIGenerationResult>;

  /** Generate a PR description/body from context */
  generatePRDescription(context: PRContext): Promise<AIGenerationResult>;

  /** Generate a commit message from context */
  generateCommitMessage(context: CommitContext): Promise<AIGenerationResult>;

  /** Generate a plan document from context */
  generatePlanDocument(context: PlanContext): Promise<AIGenerationResult>;
}

/**
 * AI Provider configuration from .worktreerc
 */
export interface AIConfig {
  /** Provider to use: 'auto' | 'claude' | 'gemini' | 'openai' | 'ollama' | 'script' | 'none' */
  provider?: AIProviderName;
  /** Fallback provider if primary fails */
  fallback?: AIProviderName;

  /** Enable AI for branch names */
  branchName?: boolean;
  /** Enable AI for PR titles */
  prTitle?: boolean;
  /** Enable AI for PR descriptions */
  prDescription?: boolean;
  /** Enable AI for commit messages */
  commitMessage?: boolean;
  /** Enable AI for plan documents */
  planDocument?: boolean;

  /** Branch naming style */
  branchStyle?: 'conventional' | 'kebab' | 'snake';
  /** Commit message style */
  commitStyle?: 'conventional' | 'gitmoji' | 'simple';

  /** Path to PR description template */
  prTemplate?: string;
  /** Path to plan document template */
  planTemplate?: string;

  /** Claude-specific settings */
  claude?: {
    model?: string;
  };
  /** Gemini-specific settings */
  gemini?: {
    model?: string;
  };
  /** OpenAI Codex CLI-specific settings */
  openai?: {
    model?: string;
  };
  /** Ollama-specific settings */
  ollama?: {
    model?: string;
    host?: string;
  };
  /** Custom script provider settings */
  script?: {
    path: string;
  };
}

/**
 * Available AI provider names
 */
export type AIProviderName =
  | 'auto'
  | 'claude'
  | 'gemini'
  | 'openai'
  | 'ollama'
  | 'script'
  | 'fallback'
  | 'none';

/**
 * Default AI configuration
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'none',
  branchName: false,
  prTitle: false,
  prDescription: false,
  commitMessage: false,
  planDocument: false,
  branchStyle: 'kebab',
  commitStyle: 'conventional',
};
