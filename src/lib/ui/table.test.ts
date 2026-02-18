import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { printTable } from './table.js';
import { setJsonMode } from './output.js';
import { setColorEnabled } from '../colors.js';

describe('ui/table', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setColorEnabled(true);
  });

  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  it('prints formatted rows with labels and fields', () => {
    printTable({
      rows: [
        {
          label: 'PR #42',
          fields: [
            { key: 'Branch', value: 'feat/test' },
            { key: 'Path', value: '/tmp/repo.pr42' },
          ],
        },
      ],
    });

    const allOutput = logSpy.mock.calls.map((c) => c[0] as string);
    expect(allOutput.some((line) => line.includes('PR #42'))).toBe(true);
    expect(allOutput.some((line) => line.includes('Branch'))).toBe(true);
    expect(allOutput.some((line) => line.includes('feat/test'))).toBe(true);
    expect(allOutput.some((line) => line.includes('Path'))).toBe(true);
  });

  it('prints title when provided', () => {
    printTable({
      title: 'myrepo worktrees:',
      rows: [
        {
          label: 'main',
          fields: [{ key: 'Branch', value: 'main' }],
        },
      ],
    });

    const allOutput = logSpy.mock.calls.map((c) => c[0] as string);
    expect(allOutput.some((line) => line.includes('myrepo worktrees:'))).toBe(true);
  });

  it('appends indicator to label when provided', () => {
    printTable({
      rows: [
        {
          label: 'PR #42',
          indicator: ' *',
          fields: [{ key: 'Branch', value: 'feat/test' }],
        },
      ],
    });

    const allOutput = logSpy.mock.calls.map((c) => c[0] as string);
    const labelLine = allOutput.find((line) => line.includes('PR #42'));
    expect(labelLine).toContain(' *');
  });

  it('prints nothing for empty rows', () => {
    printTable({ rows: [] });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('prints summary line when provided', () => {
    printTable({
      rows: [
        {
          label: 'main',
          fields: [{ key: 'Branch', value: 'main' }],
        },
      ],
      summary: '3 worktrees | 2 PRs | 1 open',
    });

    const allOutput = logSpy.mock.calls.map((c) => c[0] as string);
    expect(allOutput.some((line) => line.includes('3 worktrees'))).toBe(true);
  });

  it('aligns field keys across all rows', () => {
    printTable({
      rows: [
        {
          label: 'Row 1',
          fields: [
            { key: 'Branch', value: 'main' },
            { key: 'Path', value: '/tmp/main' },
          ],
        },
        {
          label: 'Row 2',
          fields: [
            { key: 'Branch', value: 'feat/x' },
            { key: 'Commit', value: 'abc123' },
          ],
        },
      ],
    });

    // All field lines should have consistent key padding
    const fieldLines = logSpy.mock.calls
      .map((c) => c[0] as string)
      .filter(
        (line) => line.includes('Branch') || line.includes('Path') || line.includes('Commit')
      );

    // Each field starts with 4 spaces of indent
    for (const line of fieldLines) {
      expect(line).toMatch(/^\s{4}/);
    }
  });

  it('no-ops when JSON mode is active', () => {
    setJsonMode(true);
    printTable({
      title: 'Test',
      rows: [{ label: 'item', fields: [{ key: 'k', value: 'v' }] }],
      summary: 'summary',
    });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
