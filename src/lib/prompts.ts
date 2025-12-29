import readline from 'readline';
import { yellow, dim, cyan, red, bold } from './colors.js';

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
 * Prompt user to select from a list of simple string options
 * Returns 1-based index of selected option
 */
export async function promptChoiceIndex(
  prompt: string,
  options: string[]
): Promise<number> {
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
          console.log(red(`Invalid choice. Please enter a number between 1 and ${options.length}.`));
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
 * Prompt user to select from a list of options with values
 * Returns the value of the selected option
 */
export async function promptChoice<T>(
  prompt: string,
  options: PromptOption<T>[]
): Promise<T> {
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
          console.log(red(`Invalid choice. Please enter a number between 1 and ${options.length}.`));
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
export async function promptInput(
  prompt: string,
  defaultValue?: string
): Promise<string> {
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
export async function withSpinner<T>(
  message: string,
  operation: () => Promise<T>
): Promise<T> {
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
