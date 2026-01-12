import * as colors from '../colors.js';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';
import * as manage from './manage-manifest.js';
import * as link from './link-configs.js';
import * as validate from './validate-manifest.js';
import {
  promptChoice,
  promptConfirm,
  promptInput,
  UserNavigatedBack,
  type PromptOption,
} from '../prompts.js';

type MainMenuAction = 'manage' | 'link' | 'validate' | 'help' | 'exit';

const mainMenuOptions: PromptOption<MainMenuAction>[] = [
  {
    label: 'Manage config manifest',
    description: 'Discover and select files to link',
    value: 'manage',
  },
  {
    label: 'Link configs',
    description: 'Create links from manifest',
    value: 'link',
  },
  {
    label: 'Validate manifest',
    description: 'Check for issues',
    value: 'validate',
  },
  {
    label: 'Help',
    description: 'Show usage information',
    value: 'help',
  },
  {
    label: 'Exit',
    description: 'Return to shell',
    value: 'exit',
  },
];

export async function showMainMenu(): Promise<void> {
  let running = true;

  while (running) {
    console.clear();
    console.log(
      colors.cyan(
        colors.bold('\n╔═══════════════════════════════════════════════════════════════════════╗')
      )
    );
    console.log(
      colors.cyan(colors.bold('║')) +
        colors.bold('          Worktree Config Link Manager                             ') +
        colors.cyan(colors.bold('║'))
    );
    console.log(
      colors.cyan(
        colors.bold('╚═══════════════════════════════════════════════════════════════════════╝\n')
      )
    );

    try {
      const action = await promptChoice('What would you like to do?', mainMenuOptions);

      switch (action) {
        case 'manage':
          await runManage();
          break;
        case 'link':
          await runLink();
          break;
        case 'validate':
          await runValidate();
          break;
        case 'help':
          showHelp();
          await pressAnyKey();
          break;
        case 'exit':
          running = false;
          console.log(colors.green('\nGoodbye!\n'));
          break;
      }
    } catch (error: unknown) {
      // User cancelled (Ctrl+C or 'q') or navigated back (left arrow)
      if (error instanceof Error && error.message === 'User cancelled') {
        return;
      }
      if (error instanceof UserNavigatedBack) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(colors.red('\nError:'), errorMessage);
      await pressAnyKey();
    }
  }
}

async function runManage(): Promise<void> {
  console.log('\n');
  await manage.run({
    nonInteractive: false,
    clean: false,
    dryRun: false,
    manifestFile: DEFAULT_MANIFEST_FILE,
    backup: false,
    verbose: false,
  });

  // Ask if user wants to link after managing
  try {
    const shouldLink = await promptConfirm('Would you like to link configs now?', true);

    if (shouldLink) {
      await runLink();
    } else {
      await pressAnyKey();
    }
  } catch (error) {
    // Only silently return for user cancellation/navigation
    if (
      error instanceof UserNavigatedBack ||
      (error instanceof Error && error.message === 'User cancelled')
    ) {
      return;
    }
    // Re-throw other errors so they're not silently swallowed
    throw error;
  }
}

async function runLink(): Promise<void> {
  console.log('\n');
  await link.run({
    manifestFile: DEFAULT_MANIFEST_FILE,
    dryRun: false,
    type: 'hard',
    yes: false,
  });
  await pressAnyKey();
}

async function runValidate(): Promise<void> {
  console.log('\n');
  validate.run({
    manifestFile: DEFAULT_MANIFEST_FILE,
  });
  await pressAnyKey();
}

function showHelp(): void {
  console.clear();
  console.log(
    colors.cyan(
      colors.bold('\n╔═══════════════════════════════════════════════════════════════════════╗')
    )
  );
  console.log(
    colors.cyan(colors.bold('║')) +
      colors.bold('          wtlink Help                                               ') +
      colors.cyan(colors.bold('║'))
  );
  console.log(
    colors.cyan(
      colors.bold('╚═══════════════════════════════════════════════════════════════════════╝\n')
    )
  );

  console.log(colors.bold('About wtlink:'));
  console.log('  wtlink helps you share configuration files between git worktrees');
  console.log('  by creating hard links or symbolic links.\n');

  console.log(colors.bold('Common Workflow:'));
  console.log(
    '  1. ' + colors.green('Manage') + ' - Discover git-ignored files and select which to link'
  );
  console.log(
    '  2. ' + colors.blue('Link') + ' - Create links from source worktree to destination\n'
  );

  console.log(colors.bold('Commands:'));
  console.log('  ' + colors.green('wtlink') + '              Show this interactive menu');
  console.log('  ' + colors.green('wtlink manage') + '       Manage manifest interactively');
  console.log('  ' + colors.green('wtlink link') + '         Link configs between worktrees');
  console.log('  ' + colors.green('wtlink validate') + '     Validate manifest file\n');

  console.log(colors.bold('Manifest File:'));
  console.log(`  Default location: ${colors.cyan('.wtlinkrc')} (in repository root)`);
  console.log(`  The manifest lists which files should be linked\n`);

  console.log(colors.bold('Documentation:'));
  console.log('  For full documentation, see README.md\n');
}

async function pressAnyKey(): Promise<void> {
  try {
    await promptInput('Press Enter to continue...');
  } catch {
    // User cancelled - just continue
  }
}
