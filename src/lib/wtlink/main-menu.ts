import inquirer from 'inquirer';
import * as colors from '../colors.js';
import { DEFAULT_MANIFEST_FILE } from '../constants.js';
import * as manage from './manage-manifest.js';
import * as link from './link-configs.js';
import * as validate from './validate-manifest.js';

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

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          {
            name: 'Manage config manifest (discover and select files)',
            value: 'manage',
          },
          {
            name: 'Link configs (create links from manifest)',
            value: 'link',
          },
          {
            name: 'Validate manifest (check for issues)',
            value: 'validate',
          },
          new inquirer.Separator(),
          {
            name: 'Help',
            value: 'help',
          },
          {
            name: 'Exit',
            value: 'exit',
          },
        ],
      },
    ]);

    try {
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
  });

  // Ask if user wants to link after managing
  const { shouldLink } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldLink',
      message: 'Would you like to link configs now?',
      default: true,
    },
  ]);

  if (shouldLink) {
    await runLink();
  } else {
    await pressAnyKey();
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
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...',
    },
  ]);
}
