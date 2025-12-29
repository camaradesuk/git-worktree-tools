import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import readline from 'readline';
import {
  promptChoiceIndex,
  promptChoice,
  promptConfirm,
  promptInput,
  printHeader,
  printListItem,
} from './prompts.js';

// Mock readline
vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

// Mock console.log
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('prompts', () => {
  let mockRl: {
    question: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as unknown as readline.Interface);
  });

  afterEach(() => {
    consoleSpy.mockClear();
  });

  describe('promptChoiceIndex', () => {
    it('displays prompt and options', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('1');
      });

      await promptChoiceIndex('Choose an option:', ['Option A', 'Option B', 'Option C']);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Choose an option:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Option A'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Option B'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Option C'));
    });

    it('returns 1-based index of selected option', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('2');
      });

      const result = await promptChoiceIndex('Choose:', ['A', 'B', 'C']);

      expect(result).toBe(2);
      expect(mockRl.close).toHaveBeenCalled();
    });

    it('re-prompts on invalid input', async () => {
      let callCount = 0;
      mockRl.question.mockImplementation((_, callback) => {
        callCount++;
        if (callCount === 1) {
          callback('invalid');
        } else if (callCount === 2) {
          callback('5'); // out of range
        } else {
          callback('1'); // valid
        }
      });

      const result = await promptChoiceIndex('Choose:', ['A', 'B']);

      expect(result).toBe(1);
      expect(mockRl.question).toHaveBeenCalledTimes(3);
    });

    it('re-prompts on empty input', async () => {
      let callCount = 0;
      mockRl.question.mockImplementation((_, callback) => {
        callCount++;
        if (callCount === 1) {
          callback('');
        } else {
          callback('1');
        }
      });

      const result = await promptChoiceIndex('Choose:', ['A']);

      expect(result).toBe(1);
      expect(mockRl.question).toHaveBeenCalledTimes(2);
    });

    it('rejects on quit command', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('q');
      });

      await expect(promptChoiceIndex('Choose:', ['A', 'B'])).rejects.toThrow('User cancelled');
    });

    it('rejects on quit word', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('quit');
      });

      await expect(promptChoiceIndex('Choose:', ['A'])).rejects.toThrow('User cancelled');
    });
  });

  describe('promptChoice', () => {
    it('returns value of selected option', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('2');
      });

      const result = await promptChoice('Choose:', [
        { label: 'First', value: 'first-value' },
        { label: 'Second', value: 'second-value' },
        { label: 'Third', value: 'third-value' },
      ]);

      expect(result).toBe('second-value');
    });

    it('displays descriptions when provided', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('1');
      });

      await promptChoice('Choose:', [
        { label: 'Option', description: 'A helpful description', value: 'opt' },
      ]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('A helpful description'));
    });

    it('works with typed values', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('1');
      });

      interface MyType {
        id: number;
        name: string;
      }

      const result = await promptChoice<MyType>('Choose:', [
        { label: 'Item 1', value: { id: 1, name: 'One' } },
        { label: 'Item 2', value: { id: 2, name: 'Two' } },
      ]);

      expect(result).toEqual({ id: 1, name: 'One' });
    });
  });

  describe('promptConfirm', () => {
    it('returns true for y input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('y');
      });

      const result = await promptConfirm('Continue?');

      expect(result).toBe(true);
    });

    it('returns true for yes input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('yes');
      });

      const result = await promptConfirm('Continue?');

      expect(result).toBe(true);
    });

    it('returns true for Y input (case insensitive)', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('Y');
      });

      const result = await promptConfirm('Continue?');

      expect(result).toBe(true);
    });

    it('returns false for n input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('n');
      });

      const result = await promptConfirm('Continue?');

      expect(result).toBe(false);
    });

    it('returns false for no input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('no');
      });

      const result = await promptConfirm('Continue?');

      expect(result).toBe(false);
    });

    it('returns default false for empty input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('');
      });

      const result = await promptConfirm('Continue?');

      expect(result).toBe(false);
    });

    it('returns default true when specified', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('');
      });

      const result = await promptConfirm('Continue?', true);

      expect(result).toBe(true);
    });

    it('returns default for invalid input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('maybe');
      });

      const result = await promptConfirm('Continue?', true);

      expect(result).toBe(true);
    });

    it('displays correct hint for default false', async () => {
      mockRl.question.mockImplementation((question, callback) => {
        expect(question).toContain('[y/N]');
        callback('');
      });

      await promptConfirm('Continue?', false);
    });

    it('displays correct hint for default true', async () => {
      mockRl.question.mockImplementation((question, callback) => {
        expect(question).toContain('[Y/n]');
        callback('');
      });

      await promptConfirm('Continue?', true);
    });
  });

  describe('promptInput', () => {
    it('returns user input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('user input');
      });

      const result = await promptInput('Enter value:');

      expect(result).toBe('user input');
    });

    it('trims whitespace', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('  trimmed  ');
      });

      const result = await promptInput('Enter value:');

      expect(result).toBe('trimmed');
    });

    it('returns default for empty input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('');
      });

      const result = await promptInput('Enter value:', 'default');

      expect(result).toBe('default');
    });

    it('returns empty string if no default and empty input', async () => {
      mockRl.question.mockImplementation((_, callback) => {
        callback('');
      });

      const result = await promptInput('Enter value:');

      expect(result).toBe('');
    });

    it('displays default value hint', async () => {
      mockRl.question.mockImplementation((question, callback) => {
        expect(question).toContain('[default-value]');
        callback('');
      });

      await promptInput('Enter:', 'default-value');
    });
  });

  describe('printHeader', () => {
    it('prints formatted header', () => {
      printHeader('Test Header');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Header'));
    });
  });

  describe('printListItem', () => {
    it('prints bullet point item', () => {
      printListItem('List item');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('•'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('List item'));
    });

    it('prints indented item', () => {
      printListItem('Indented item', 2);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/^\s{4}•/));
    });
  });
});
