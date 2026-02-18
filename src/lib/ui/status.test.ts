import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  printStatus,
  printHeader,
  printDetail,
  printDim,
  printNextSteps,
  printSummaryBox,
} from './status.js';
import { setJsonMode } from './output.js';
import { setColorEnabled } from '../colors.js';
import { icons, box } from './theme.js';

describe('ui/status', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setColorEnabled(true);
  });

  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  describe('printStatus', () => {
    it('prints success message with success icon', () => {
      printStatus('success', 'Done');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain(icons.success);
      expect(output).toContain('Done');
    });

    it('prints error message with error icon', () => {
      printStatus('error', 'Failed');
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain(icons.error);
      expect(output).toContain('Failed');
    });

    it('prints warning message', () => {
      printStatus('warning', 'Careful');
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain(icons.warning);
    });

    it('prints info message', () => {
      printStatus('info', 'Note');
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain(icons.info);
    });

    it('no-ops when JSON mode is active', () => {
      setJsonMode(true);
      printStatus('success', 'Done');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printHeader', () => {
    it('prints bold title with surrounding blank lines', () => {
      printHeader('My Title');
      // Should be called 3 times: blank line, title, blank line
      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(logSpy.mock.calls[0][0]).toBe('');
      expect(logSpy.mock.calls[1][0]).toContain('My Title');
      expect(logSpy.mock.calls[2][0]).toBe('');
    });

    it('no-ops when JSON mode is active', () => {
      setJsonMode(true);
      printHeader('Title');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printDetail', () => {
    it('prints label and value with default indent', () => {
      printDetail('Branch', 'feat/test');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('Branch');
      expect(output).toContain('feat/test');
      // Default indent of 2 spaces
      expect(output).toMatch(/^\s{2}Branch/);
    });

    it('respects custom indent', () => {
      printDetail('Path', '/tmp/test', 4);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/^\s{4}Path/);
    });

    it('no-ops when JSON mode is active', () => {
      setJsonMode(true);
      printDetail('Key', 'Value');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printDim', () => {
    it('prints dimmed text', () => {
      printDim('subtle text');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('subtle text');
    });

    it('applies indent when specified', () => {
      printDim('indented', 4);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/^\s{4}/);
    });

    it('no-ops when JSON mode is active', () => {
      setJsonMode(true);
      printDim('text');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printNextSteps', () => {
    it('prints formatted step list', () => {
      printNextSteps([
        { command: 'cd /tmp/wt', description: 'Go to worktree' },
        { command: 'npm install' },
      ]);
      // "Next steps:" header + 2 steps = 3 calls
      expect(logSpy).toHaveBeenCalledTimes(3);

      const header = logSpy.mock.calls[0][0] as string;
      expect(header).toContain('Next steps:');

      const step1 = logSpy.mock.calls[1][0] as string;
      expect(step1).toContain('cd /tmp/wt');
      expect(step1).toContain('# Go to worktree');

      const step2 = logSpy.mock.calls[2][0] as string;
      expect(step2).toContain('npm install');
      // No description, so no #
      expect(step2).not.toContain('#');
    });

    it('no-ops when JSON mode is active', () => {
      setJsonMode(true);
      printNextSteps([{ command: 'echo test' }]);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printSummaryBox', () => {
    it('prints box-drawing border with title and fields', () => {
      printSummaryBox('PR #42 ready!', [
        { label: 'Branch', value: 'feat/test' },
        { label: 'Path', value: '/tmp/test' },
      ]);

      const allOutput = logSpy.mock.calls.map((c) => c[0] as string);

      // Should contain the box horizontal character
      const borderLines = allOutput.filter((line) => line.includes(box.horizontal));
      expect(borderLines.length).toBe(2);

      // Should contain the title
      expect(allOutput.some((line) => line.includes('PR #42 ready!'))).toBe(true);

      // Should contain field values
      expect(allOutput.some((line) => line.includes('Branch'))).toBe(true);
      expect(allOutput.some((line) => line.includes('feat/test'))).toBe(true);
    });

    it('prints next steps when provided', () => {
      printSummaryBox(
        'Done!',
        [{ label: 'Status', value: 'OK' }],
        [{ command: 'npm test', description: 'Run tests' }]
      );

      const allOutput = logSpy.mock.calls.map((c) => c[0] as string);
      expect(allOutput.some((line) => line.includes('Next steps:'))).toBe(true);
      expect(allOutput.some((line) => line.includes('npm test'))).toBe(true);
    });

    it('omits next steps section when not provided', () => {
      printSummaryBox('Done!', [{ label: 'Status', value: 'OK' }]);

      const allOutput = logSpy.mock.calls.map((c) => c[0] as string);
      expect(allOutput.some((line) => line.includes('Next steps:'))).toBe(false);
    });

    it('no-ops when JSON mode is active', () => {
      setJsonMode(true);
      printSummaryBox('Title', [{ label: 'K', value: 'V' }]);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
