/**
 * Interactive main menu for `wt` command
 *
 * Provides a complete TUI experience for all worktree operations.
 * Each menu option gathers required inputs before executing.
 */

import {
  promptChoice,
  promptInput,
  promptConfirm,
  UserNavigatedBack,
  type PromptOption,
} from '../../lib/prompts.js';
import { bold, dim, cyan, red } from '../../lib/colors.js';
import { runSubcommandForResult } from './run-command.js';
import { loadConfig } from '../../lib/config.js';
import * as git from '../../lib/git.js';
import { loadManifestData, saveManifestData } from '../../lib/wtlink/config-manifest.js';

/**
 * Result from an interactive flow
 */
export interface FlowResult {
  /** Whether the flow completed (vs cancelled) */
  completed: boolean;
  /** Whether to return to main menu */
  returnToMenu: boolean;
}

/**
 * Cancelled flow result
 */
const CANCELLED: FlowResult = { completed: false, returnToMenu: true };

/**
 * Completed flow result (return to menu)
 */
const COMPLETED_RETURN: FlowResult = { completed: true, returnToMenu: true };

/**
 * Get the display name for the preferred editor
 */
function getEditorDisplayName(preferredEditor?: 'vscode' | 'cursor' | 'auto'): string {
  switch (preferredEditor) {
    case 'cursor':
      return 'Cursor';
    case 'auto':
      return 'editor';
    case 'vscode':
    default:
      return 'VS Code';
  }
}

// ============================================================================
// Main Menu
// ============================================================================

type MainMenuAction =
  | 'list'
  | 'browse-prs'
  | 'new-pr'
  | 'clean'
  | 'link'
  | 'state'
  | 'config'
  | 'exit';

const mainMenuOptions: PromptOption<MainMenuAction>[] = [
  {
    label: 'List worktrees',
    description: 'View all worktrees with PR status',
    value: 'list',
  },
  {
    label: 'Browse PRs',
    description: 'Browse all repository PRs and create worktrees',
    value: 'browse-prs',
  },
  {
    label: 'Create new PR',
    description: 'Create a new PR with a dedicated worktree',
    value: 'new-pr',
  },
  {
    label: 'Clean up PRs',
    description: 'Remove merged/closed PR worktrees',
    value: 'clean',
  },
  {
    label: 'Link config files',
    description: 'Manage config file linking between worktrees',
    value: 'link',
  },
  {
    label: 'Show state',
    description: 'Query current git worktree state',
    value: 'state',
  },
  {
    label: 'Configure settings',
    description: 'View and edit .worktreerc configuration',
    value: 'config',
  },
  {
    label: 'Exit',
    description: 'Return to shell',
    value: 'exit',
  },
];

/**
 * Display the interactive main menu
 */
export async function showMainMenu(): Promise<void> {
  // Loop to allow returning to menu after actions
  while (true) {
    console.log();
    console.log(bold(cyan('Git Worktree Tools')));
    console.log(dim('Manage git worktrees and PRs'));
    console.log();

    try {
      const choice = await promptChoice('What would you like to do?', mainMenuOptions);

      let result: FlowResult;

      switch (choice) {
        case 'exit':
          return;

        case 'list':
          result = await handleListWorktrees();
          break;

        case 'browse-prs':
          result = await handleBrowsePRs();
          break;

        case 'new-pr':
          result = await handleNewPR();
          break;

        case 'clean':
          result = await handleCleanPRs();
          break;

        case 'link':
          result = await handleLinkConfig();
          break;

        case 'state':
          result = await handleShowState();
          break;

        case 'config':
          result = await handleConfigure();
          break;

        default:
          result = CANCELLED;
      }

      // If flow says don't return to menu, exit
      if (!result.returnToMenu) {
        return;
      }

      // Otherwise loop back to main menu
    } catch (error) {
      // User cancelled (Ctrl+C or 'q') or navigated back (left arrow)
      if (error instanceof Error && error.message === 'User cancelled') {
        return;
      }
      if (error instanceof UserNavigatedBack) {
        return;
      }
      throw error;
    }
  }
}

// ============================================================================
// List Worktrees Flow
// ============================================================================

async function handleListWorktrees(): Promise<FlowResult> {
  console.log();
  const result = runSubcommandForResult('lswt', []);
  if (result.status !== 0) {
    console.log(red(`Command exited with code ${result.status}`));
  }
  return COMPLETED_RETURN;
}

// ============================================================================
// Browse PRs Flow
// ============================================================================

async function handleBrowsePRs(): Promise<FlowResult> {
  console.log();
  const result = runSubcommandForResult('prs', []);
  if (result.status !== 0) {
    console.log(red(`Command exited with code ${result.status}`));
  }
  return COMPLETED_RETURN;
}

// ============================================================================
// Create New PR Flow
// ============================================================================

type NewPRAction = 'from-description' | 'from-pr' | 'from-branch' | 'back';

const newPROptions: PromptOption<NewPRAction>[] = [
  {
    label: 'New feature/fix',
    description: 'Create a new PR from a description',
    value: 'from-description',
  },
  {
    label: 'From existing PR',
    description: 'Create worktree for an existing PR number',
    value: 'from-pr',
  },
  {
    label: 'From existing branch',
    description: 'Create PR for an existing local branch',
    value: 'from-branch',
  },
  {
    label: '← Back',
    description: 'Return to main menu',
    value: 'back',
  },
];

async function handleNewPR(): Promise<FlowResult> {
  console.log();
  console.log(bold('Create New PR'));
  console.log();

  try {
    const action = await promptChoice('How would you like to create the PR?', newPROptions);

    switch (action) {
      case 'back':
        return CANCELLED;

      case 'from-description':
        return await handleNewPRFromDescription();

      case 'from-pr':
        return await handleNewPRFromExisting();

      case 'from-branch':
        return await handleNewPRFromBranch();

      default:
        return CANCELLED;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      return CANCELLED;
    }
    if (error instanceof UserNavigatedBack) {
      return CANCELLED;
    }
    throw error;
  }
}

async function handleNewPRFromDescription(): Promise<FlowResult> {
  console.log();

  try {
    // Check if we're in a git repository first
    let repoRoot: string;
    try {
      repoRoot = git.getRepoRoot();
    } catch {
      console.log(red('Not in a git repository'));
      console.log(dim('Please run this command from within a git repository.'));
      return CANCELLED;
    }

    // Required: description
    const description = await promptInput('PR description (what are you building?)');
    if (!description) {
      console.log(red('Description is required'));
      return CANCELLED;
    }

    // Load config for defaults
    const config = loadConfig(repoRoot);

    // Optional: base branch
    const baseBranch = await promptInput('Base branch', config.baseBranch || 'main');

    // Optional: draft or ready
    const draftOptions: PromptOption<boolean>[] = [
      { label: 'Draft PR', description: 'Can be marked ready later', value: true },
      { label: 'Ready for review', description: 'Immediately reviewable', value: false },
    ];
    const isDraft = await promptChoice('PR status', draftOptions);

    // Optional: install dependencies
    const shouldInstall = await promptConfirm('Install dependencies after setup?', false);

    // Optional: open in editor
    const editorName = getEditorDisplayName(config.preferredEditor);
    const shouldOpenEditor = await promptConfirm(`Open in ${editorName}?`, false);

    // Build args
    const args: string[] = [description];
    if (baseBranch && baseBranch !== 'main') {
      args.push('--base', baseBranch);
    }
    if (!isDraft) {
      args.push('--ready');
    }
    if (shouldInstall) {
      args.push('--install');
    }
    if (shouldOpenEditor) {
      args.push('--code');
    }

    console.log();
    console.log(dim('Creating PR...'));
    const result = runSubcommandForResult('newpr', args);
    if (result.status !== 0) {
      console.log(red(`Command exited with code ${result.status}`));
    }
    return COMPLETED_RETURN;
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      return CANCELLED;
    }
    if (error instanceof UserNavigatedBack) {
      return CANCELLED;
    }
    throw error;
  }
}

async function handleNewPRFromExisting(): Promise<FlowResult> {
  console.log();

  try {
    // Required: PR number
    const prNumberStr = await promptInput('PR number');
    if (!prNumberStr) {
      console.log(red('PR number is required'));
      return CANCELLED;
    }

    const prNumber = parseInt(prNumberStr, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      console.log(red('Invalid PR number'));
      return CANCELLED;
    }

    // Load config for editor preference
    let editorName = 'VS Code';
    try {
      const repoRoot = git.getRepoRoot();
      const config = loadConfig(repoRoot);
      editorName = getEditorDisplayName(config.preferredEditor);
    } catch {
      // Not in a repo, use default
    }

    // Optional: install dependencies
    const shouldInstall = await promptConfirm('Install dependencies after setup?', false);

    // Optional: open in editor
    const shouldOpenEditor = await promptConfirm(`Open in ${editorName}?`, false);

    // Build args
    const args: string[] = ['--pr', String(prNumber)];
    if (shouldInstall) {
      args.push('--install');
    }
    if (shouldOpenEditor) {
      args.push('--code');
    }

    console.log();
    console.log(dim(`Creating worktree for PR #${prNumber}...`));
    const result = runSubcommandForResult('newpr', args);
    if (result.status !== 0) {
      console.log(red(`Command exited with code ${result.status}`));
    }
    return COMPLETED_RETURN;
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      return CANCELLED;
    }
    if (error instanceof UserNavigatedBack) {
      return CANCELLED;
    }
    throw error;
  }
}

async function handleNewPRFromBranch(): Promise<FlowResult> {
  console.log();

  try {
    // Check if we're in a git repository first
    let repoRoot: string;
    let branches: string[];
    try {
      repoRoot = git.getRepoRoot();
      // Get list of local branches (excluding main/master)
      branches = git
        .listLocalBranches()
        .filter(
          (b: string) => !['main', 'master', 'develop'].includes(b) && !b.startsWith('origin/')
        );
    } catch {
      console.log(red('Not in a git repository'));
      console.log(dim('Please run this command from within a git repository.'));
      return CANCELLED;
    }

    let branchName: string;

    if (branches.length > 0) {
      // Let user select from list or type custom
      const branchOptions: PromptOption<string>[] = [
        ...branches.slice(0, 10).map((b: string) => ({ label: b, value: b })),
        { label: '↳ Type branch name...', value: '__custom__' },
      ];

      const selected = await promptChoice<string>('Select branch', branchOptions);

      if (selected === '__custom__') {
        branchName = await promptInput('Branch name');
      } else {
        branchName = selected;
      }
    } else {
      branchName = await promptInput('Branch name');
    }

    if (!branchName) {
      console.log(red('Branch name is required'));
      return CANCELLED;
    }

    // Load config for defaults
    const config = loadConfig(repoRoot);

    // Optional: base branch
    const baseBranch = await promptInput('Base branch', config.baseBranch || 'main');

    // Optional: draft or ready
    const draftOptions: PromptOption<boolean>[] = [
      { label: 'Draft PR', description: 'Can be marked ready later', value: true },
      { label: 'Ready for review', description: 'Immediately reviewable', value: false },
    ];
    const isDraft = await promptChoice('PR status', draftOptions);

    // Build args
    const args: string[] = ['--branch', branchName];
    if (baseBranch && baseBranch !== 'main') {
      args.push('--base', baseBranch);
    }
    if (!isDraft) {
      args.push('--ready');
    }

    console.log();
    console.log(dim(`Creating PR for branch ${branchName}...`));
    const result = runSubcommandForResult('newpr', args);
    if (result.status !== 0) {
      console.log(red(`Command exited with code ${result.status}`));
    }
    return COMPLETED_RETURN;
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      return CANCELLED;
    }
    if (error instanceof UserNavigatedBack) {
      return CANCELLED;
    }
    throw error;
  }
}

// ============================================================================
// Clean PRs Flow
// ============================================================================

type CleanAction = 'clean-all' | 'clean-specific' | 'dry-run' | 'back';

const cleanOptions: PromptOption<CleanAction>[] = [
  {
    label: 'Clean all merged/closed',
    description: 'Remove all worktrees for merged or closed PRs',
    value: 'clean-all',
  },
  {
    label: 'Clean specific PR',
    description: 'Remove worktree for a specific PR number',
    value: 'clean-specific',
  },
  {
    label: 'Preview (dry run)',
    description: 'See what would be cleaned without removing',
    value: 'dry-run',
  },
  {
    label: '← Back',
    description: 'Return to main menu',
    value: 'back',
  },
];

async function handleCleanPRs(): Promise<FlowResult> {
  console.log();
  console.log(bold('Clean Up PRs'));
  console.log();

  try {
    const action = await promptChoice('What would you like to clean?', cleanOptions);

    switch (action) {
      case 'back':
        return CANCELLED;

      case 'clean-all': {
        const confirmed = await promptConfirm(
          'This will remove all worktrees for merged/closed PRs. Continue?',
          false
        );
        if (!confirmed) {
          return CANCELLED;
        }
        console.log();
        const cleanAllResult = runSubcommandForResult('cleanpr', ['--all']);
        if (cleanAllResult.status !== 0) {
          console.log(red(`Command exited with code ${cleanAllResult.status}`));
        }
        return COMPLETED_RETURN;
      }

      case 'clean-specific': {
        const prNumberStr = await promptInput('PR number to clean');
        if (!prNumberStr) {
          console.log(red('PR number is required'));
          return CANCELLED;
        }
        const prNumber = parseInt(prNumberStr, 10);
        if (isNaN(prNumber) || prNumber <= 0) {
          console.log(red('Invalid PR number'));
          return CANCELLED;
        }
        console.log();
        const cleanSpecificResult = runSubcommandForResult('cleanpr', [String(prNumber)]);
        if (cleanSpecificResult.status !== 0) {
          console.log(red(`Command exited with code ${cleanSpecificResult.status}`));
        }
        return COMPLETED_RETURN;
      }

      case 'dry-run': {
        console.log();
        const dryRunResult = runSubcommandForResult('cleanpr', ['--dry-run']);
        if (dryRunResult.status !== 0) {
          console.log(red(`Command exited with code ${dryRunResult.status}`));
        }
        return COMPLETED_RETURN;
      }

      default:
        return CANCELLED;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      return CANCELLED;
    }
    if (error instanceof UserNavigatedBack) {
      return CANCELLED;
    }
    throw error;
  }
}

// ============================================================================
// Link Config Flow
// ============================================================================

type LinkAction = 'view' | 'sync' | 'add' | 'remove' | 'validate' | 'back';

const linkOptions: PromptOption<LinkAction>[] = [
  {
    label: 'View linked files',
    description: 'Show current link manifest',
    value: 'view',
  },
  {
    label: 'Sync links',
    description: 'Synchronize all linked files to worktrees',
    value: 'sync',
  },
  {
    label: 'Add file to manifest',
    description: 'Add a new file to be linked',
    value: 'add',
  },
  {
    label: 'Remove file from manifest',
    description: 'Remove a file from linking',
    value: 'remove',
  },
  {
    label: 'Validate manifest',
    description: 'Check manifest for issues',
    value: 'validate',
  },
  {
    label: '← Back',
    description: 'Return to main menu',
    value: 'back',
  },
];

async function handleLinkConfig(): Promise<FlowResult> {
  console.log();
  console.log(bold('Link Config Files'));
  console.log();

  try {
    const action = await promptChoice('What would you like to do?', linkOptions);

    switch (action) {
      case 'back':
        return CANCELLED;

      case 'view': {
        console.log();
        try {
          const repoRoot = git.getRepoRoot();
          const manifest = loadManifestData(repoRoot);
          if (manifest.enabled.length === 0 && manifest.disabled.length === 0) {
            console.log(dim('No files in link manifest.'));
            console.log(dim('Use "Add file to manifest" to start linking files.'));
          } else {
            if (manifest.enabled.length > 0) {
              console.log(bold('Enabled (actively linked):'));
              for (const f of manifest.enabled) {
                console.log(`  ${f}`);
              }
            }
            if (manifest.disabled.length > 0) {
              if (manifest.enabled.length > 0) console.log();
              console.log(bold('Disabled (tracked but not linked):'));
              for (const f of manifest.disabled) {
                console.log(`  ${dim(f)}`);
              }
            }
            console.log();
            console.log(dim(`Source: ${manifest.source}`));
          }
        } catch {
          console.log(red('Not in a git repository'));
        }
        return COMPLETED_RETURN;
      }

      case 'sync': {
        console.log();
        const syncResult = runSubcommandForResult('wtlink', ['link']);
        if (syncResult.status !== 0) {
          console.log(red(`Link sync failed (exit code ${syncResult.status})`));
        }
        return COMPLETED_RETURN;
      }

      case 'add': {
        const filePath = await promptInput('File path to add (relative to repo root)');
        if (!filePath) {
          console.log(red('File path is required'));
          return CANCELLED;
        }
        console.log();
        try {
          const repoRoot = git.getRepoRoot();
          const manifest = loadManifestData(repoRoot);
          if (manifest.enabled.includes(filePath)) {
            console.log(dim(`"${filePath}" is already in the manifest.`));
          } else {
            const newEnabled = [...manifest.enabled, filePath];
            saveManifestData(repoRoot, newEnabled, manifest.disabled);
            console.log(`Added "${filePath}" to link manifest.`);
            console.log(dim('Run "Sync links" to create hard links.'));
          }
        } catch {
          console.log(red('Not in a git repository'));
        }
        return COMPLETED_RETURN;
      }

      case 'remove': {
        const filePath = await promptInput('File path to remove');
        if (!filePath) {
          console.log(red('File path is required'));
          return CANCELLED;
        }
        console.log();
        try {
          const repoRoot = git.getRepoRoot();
          const manifest = loadManifestData(repoRoot);
          const inEnabled = manifest.enabled.includes(filePath);
          const inDisabled = manifest.disabled.includes(filePath);
          if (!inEnabled && !inDisabled) {
            console.log(dim(`"${filePath}" is not in the manifest.`));
          } else {
            const newEnabled = manifest.enabled.filter((f) => f !== filePath);
            const newDisabled = manifest.disabled.filter((f) => f !== filePath);
            saveManifestData(repoRoot, newEnabled, newDisabled);
            console.log(`Removed "${filePath}" from link manifest.`);
          }
        } catch {
          console.log(red('Not in a git repository'));
        }
        return COMPLETED_RETURN;
      }

      case 'validate': {
        console.log();
        const validateResult = runSubcommandForResult('wtlink', ['validate']);
        if (validateResult.status !== 0) {
          console.log(red(`Command exited with code ${validateResult.status}`));
        }
        return COMPLETED_RETURN;
      }

      default:
        return CANCELLED;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      return CANCELLED;
    }
    if (error instanceof UserNavigatedBack) {
      return CANCELLED;
    }
    throw error;
  }
}

// ============================================================================
// Show State Flow
// ============================================================================

async function handleShowState(): Promise<FlowResult> {
  console.log();
  const result = runSubcommandForResult('wtstate', []);
  if (result.status !== 0) {
    console.log(red(`Command exited with code ${result.status}`));
  }
  return COMPLETED_RETURN;
}

// ============================================================================
// Configure Flow
// ============================================================================

type ConfigAction = 'view' | 'init' | 'edit' | 'back';

const configOptions: PromptOption<ConfigAction>[] = [
  {
    label: 'View current config',
    description: 'Display .worktreerc settings',
    value: 'view',
  },
  {
    label: 'Initialize config',
    description: 'Create a new .worktreerc file',
    value: 'init',
  },
  {
    label: 'Edit setting',
    description: 'Change a specific configuration value',
    value: 'edit',
  },
  {
    label: '← Back',
    description: 'Return to main menu',
    value: 'back',
  },
];

async function handleConfigure(): Promise<FlowResult> {
  console.log();
  console.log(bold('Configure Settings'));
  console.log();

  try {
    const action = await promptChoice('What would you like to do?', configOptions);

    switch (action) {
      case 'back':
        return CANCELLED;

      case 'view': {
        console.log();
        const viewResult = runSubcommandForResult('wtconfig', ['show']);
        if (viewResult.status !== 0) {
          console.log(red(`Command exited with code ${viewResult.status}`));
        }
        return COMPLETED_RETURN;
      }

      case 'init': {
        const confirmed = await promptConfirm('Create .worktreerc in current directory?', true);
        if (!confirmed) {
          return CANCELLED;
        }
        console.log();
        const initResult = runSubcommandForResult('wtconfig', ['init']);
        if (initResult.status !== 0) {
          console.log(red(`Command exited with code ${initResult.status}`));
        }
        return COMPLETED_RETURN;
      }

      case 'edit': {
        // Show available settings
        const settingOptions = [
          { label: 'baseBranch', description: 'Default base branch for PRs', value: 'baseBranch' },
          { label: 'draftPr', description: 'Create PRs as drafts by default', value: 'draftPr' },
          { label: 'branchPrefix', description: 'Prefix for new branches', value: 'branchPrefix' },
          {
            label: 'worktreePattern',
            description: 'Pattern for worktree directory names',
            value: 'worktreePattern',
          },
          {
            label: 'worktreeParent',
            description: 'Parent directory for worktrees',
            value: 'worktreeParent',
          },
        ];

        const setting = await promptChoice('Which setting?', settingOptions);
        const value = await promptInput(`New value for ${setting}`);

        if (!value) {
          console.log(red('Value is required'));
          return CANCELLED;
        }

        console.log();
        const editResult = runSubcommandForResult('wtconfig', ['set', setting, value]);
        if (editResult.status !== 0) {
          console.log(red(`Command exited with code ${editResult.status}`));
        }
        return COMPLETED_RETURN;
      }

      default:
        return CANCELLED;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'User cancelled') {
      return CANCELLED;
    }
    if (error instanceof UserNavigatedBack) {
      return CANCELLED;
    }
    throw error;
  }
}

// ============================================================================
// Exported flow handlers for testing
// ============================================================================

export const flows = {
  handleListWorktrees,
  handleBrowsePRs,
  handleNewPR,
  handleNewPRFromDescription,
  handleNewPRFromExisting,
  handleNewPRFromBranch,
  handleCleanPRs,
  handleLinkConfig,
  handleShowState,
  handleConfigure,
};
