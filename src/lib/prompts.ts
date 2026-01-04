import readline from 'readline';
import { yellow, dim, cyan, red, bold, green } from './colors.js';

/**
 * Option for prompt choices
 */
export interface PromptOption<T = string> {
  label: string;
  description?: string;
  value: T;
}

/**
 * Create a readline interface for prompts
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Check if stdin is a TTY and supports raw mode
 */
function supportsArrowNavigation(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Render arrow-key selectable options (simple strings)
 */
function renderSimpleOptions(options: string[], selectedIndex: number, prompt: string): void {
  // Move cursor up to redraw (only after first render)
  const linesToClear = options.length + 3; // prompt + blank + options + hint
  process.stdout.write(`\x1b[${linesToClear}A`); // Move up
  process.stdout.write('\x1b[0J'); // Clear from cursor to end

  console.log(`${yellow(prompt)}\n`);

  options.forEach((opt, i) => {
    if (i === selectedIndex) {
      console.log(`  ${green('▶')} ${bold(opt)}`);
    } else {
      console.log(`    ${dim(opt)}`);
    }
  });

  console.log(dim('\n  ↑/↓ navigate • Enter select • q quit'));
}

/**
 * Arrow-key navigation prompt for simple string options
 * Returns 1-based index of selected option
 */
async function promptChoiceArrowKeys(prompt: string, options: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    let selectedIndex = 0;
    let isFirstRender = true;

    // Initial render
    console.log(`${yellow(prompt)}\n`);
    options.forEach((opt, i) => {
      if (i === selectedIndex) {
        console.log(`  ${green('▶')} ${bold(opt)}`);
      } else {
        console.log(`    ${dim(opt)}`);
      }
    });
    console.log(dim('\n  ↑/↓ navigate • Enter select • q quit'));
    isFirstRender = false;

    // Enable raw mode for keypress events
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('User cancelled'));
        return;
      }

      if (key.name === 'up') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
        renderSimpleOptions(options, selectedIndex, prompt);
      } else if (key.name === 'down') {
        selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
        renderSimpleOptions(options, selectedIndex, prompt);
      } else if (key.name === 'return') {
        cleanup();
        resolve(selectedIndex + 1); // 1-based index
      } else if (str === 'q' || str === 'Q') {
        cleanup();
        reject(new Error('User cancelled'));
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Prompt user to select from a list of simple string options
 * Returns 1-based index of selected option
 *
 * Uses arrow-key navigation in TTY mode, falls back to numbered input otherwise.
 */
export async function promptChoiceIndex(prompt: string, options: string[]): Promise<number> {
  // Use arrow-key navigation if TTY is available
  if (supportsArrowNavigation()) {
    return promptChoiceArrowKeys(prompt, options);
  }

  // Fallback to numbered input for non-TTY environments
  const rl = createInterface();

  return new Promise((resolve, reject) => {
    // Display prompt and options
    console.log(`\n${yellow(prompt)}\n`);

    options.forEach((opt, i) => {
      const num = `${i + 1})`;
      console.log(`  ${cyan(num)} ${opt}`);
    });

    console.log();

    const ask = () => {
      rl.question(`Enter choice [1-${options.length}]: `, (answer) => {
        const trimmed = answer.trim();

        // Handle empty input
        if (!trimmed) {
          ask();
          return;
        }

        // Handle 'q' or 'quit' to cancel
        if (trimmed.toLowerCase() === 'q' || trimmed.toLowerCase() === 'quit') {
          rl.close();
          reject(new Error('User cancelled'));
          return;
        }

        const choice = parseInt(trimmed, 10);

        if (isNaN(choice) || choice < 1 || choice > options.length) {
          console.log(
            red(`Invalid choice. Please enter a number between 1 and ${options.length}.`)
          );
          ask();
          return;
        }

        rl.close();
        resolve(choice);
      });
    };

    // Handle Ctrl+C
    rl.on('close', () => {
      // Interface closed without answer
    });

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('User cancelled'));
    });

    ask();
  });
}

/**
 * Render arrow-key selectable options (with labels and descriptions)
 */
function renderPromptOptions<T>(
  options: PromptOption<T>[],
  selectedIndex: number,
  prompt: string
): void {
  // Calculate lines to clear: prompt + blank + (options with descriptions) + hint
  const optionLines = options.reduce((acc, opt) => acc + 1 + (opt.description ? 1 : 0), 0);
  const linesToClear = optionLines + 3; // prompt + blank + options + hint
  process.stdout.write(`\x1b[${linesToClear}A`); // Move up
  process.stdout.write('\x1b[0J'); // Clear from cursor to end

  console.log(`${yellow(prompt)}\n`);

  options.forEach((opt, i) => {
    if (i === selectedIndex) {
      console.log(`  ${green('▶')} ${bold(opt.label)}`);
      if (opt.description) {
        console.log(`     ${dim(opt.description)}`);
      }
    } else {
      console.log(`    ${dim(opt.label)}`);
      if (opt.description) {
        console.log(`     ${dim(opt.description)}`);
      }
    }
  });

  console.log(dim('\n  ↑/↓ navigate • Enter select • q quit'));
}

/**
 * Arrow-key navigation prompt for PromptOption types
 * Returns the value of the selected option
 */
async function promptChoiceArrowKeysValue<T>(
  prompt: string,
  options: PromptOption<T>[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    let selectedIndex = 0;

    // Initial render
    console.log(`${yellow(prompt)}\n`);
    options.forEach((opt, i) => {
      if (i === selectedIndex) {
        console.log(`  ${green('▶')} ${bold(opt.label)}`);
        if (opt.description) {
          console.log(`     ${dim(opt.description)}`);
        }
      } else {
        console.log(`    ${dim(opt.label)}`);
        if (opt.description) {
          console.log(`     ${dim(opt.description)}`);
        }
      }
    });
    console.log(dim('\n  ↑/↓ navigate • Enter select • q quit'));

    // Enable raw mode for keypress events
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('User cancelled'));
        return;
      }

      if (key.name === 'up') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
        renderPromptOptions(options, selectedIndex, prompt);
      } else if (key.name === 'down') {
        selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
        renderPromptOptions(options, selectedIndex, prompt);
      } else if (key.name === 'return') {
        cleanup();
        resolve(options[selectedIndex].value);
      } else if (str === 'q' || str === 'Q') {
        cleanup();
        reject(new Error('User cancelled'));
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Prompt user to select from a list of options with values
 * Returns the value of the selected option
 *
 * Uses arrow-key navigation in TTY mode, falls back to numbered input otherwise.
 */
export async function promptChoice<T>(prompt: string, options: PromptOption<T>[]): Promise<T> {
  // Use arrow-key navigation if TTY is available
  if (supportsArrowNavigation()) {
    return promptChoiceArrowKeysValue(prompt, options);
  }

  // Fallback to numbered input for non-TTY environments
  const rl = createInterface();

  return new Promise((resolve, reject) => {
    // Display prompt and options
    console.log(`\n${yellow(prompt)}\n`);

    options.forEach((opt, i) => {
      const num = `${i + 1})`;
      console.log(`  ${cyan(num)} ${opt.label}`);
      if (opt.description) {
        console.log(`     ${dim(opt.description)}`);
      }
    });

    console.log();

    const ask = () => {
      rl.question(`Enter choice [1-${options.length}]: `, (answer) => {
        const trimmed = answer.trim();

        // Handle empty input
        if (!trimmed) {
          ask();
          return;
        }

        // Handle 'q' or 'quit' to cancel
        if (trimmed.toLowerCase() === 'q' || trimmed.toLowerCase() === 'quit') {
          rl.close();
          reject(new Error('User cancelled'));
          return;
        }

        const choice = parseInt(trimmed, 10);

        if (isNaN(choice) || choice < 1 || choice > options.length) {
          console.log(
            red(`Invalid choice. Please enter a number between 1 and ${options.length}.`)
          );
          ask();
          return;
        }

        rl.close();
        resolve(options[choice - 1].value);
      });
    };

    // Handle Ctrl+C
    rl.on('close', () => {
      // Interface closed without answer
    });

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('User cancelled'));
    });

    ask();
  });
}

/**
 * Prompt user for yes/no confirmation
 */
export async function promptConfirm(
  prompt: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const rl = createInterface();

  const hint = defaultValue ? '[Y/n]' : '[y/N]';

  return new Promise((resolve, reject) => {
    rl.question(`${prompt} ${dim(hint)} `, (answer) => {
      rl.close();

      const trimmed = answer.trim().toLowerCase();

      if (!trimmed) {
        resolve(defaultValue);
        return;
      }

      if (trimmed === 'y' || trimmed === 'yes') {
        resolve(true);
        return;
      }

      if (trimmed === 'n' || trimmed === 'no') {
        resolve(false);
        return;
      }

      // Invalid input, use default
      resolve(defaultValue);
    });

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('User cancelled'));
    });
  });
}

/**
 * Prompt user for text input
 */
export async function promptInput(prompt: string, defaultValue?: string): Promise<string> {
  const rl = createInterface();

  const hint = defaultValue ? dim(` [${defaultValue}]`) : '';

  return new Promise((resolve, reject) => {
    rl.question(`${prompt}${hint}: `, (answer) => {
      rl.close();

      const trimmed = answer.trim();

      if (!trimmed && defaultValue !== undefined) {
        resolve(defaultValue);
        return;
      }

      resolve(trimmed);
    });

    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('User cancelled'));
    });
  });
}

/**
 * Display a spinner while an async operation runs
 */
export async function withSpinner<T>(message: string, operation: () => Promise<T>): Promise<T> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let interval: NodeJS.Timeout | null = null;

  // Only show spinner if stdout is a TTY
  const showSpinner = process.stdout.isTTY ?? false;

  if (showSpinner) {
    interval = setInterval(() => {
      process.stdout.write(`\r${cyan(frames[frameIndex])} ${message}`);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 80);
  } else {
    console.log(message);
  }

  try {
    const result = await operation();

    if (interval) {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(message.length + 3) + '\r');
    }

    return result;
  } catch (error) {
    if (interval) {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(message.length + 3) + '\r');
    }
    throw error;
  }
}

/**
 * Print a formatted section header
 */
export function printHeader(text: string): void {
  console.log(`\n${bold(cyan(text))}\n`);
}

/**
 * Print a formatted list item
 */
export function printListItem(text: string, indent: number = 0): void {
  const spaces = '  '.repeat(indent);
  console.log(`${spaces}• ${text}`);
}
