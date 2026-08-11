import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const runNewprHandler = vi.fn();
vi.mock('../newpr.js', () => ({ runNewprHandler }));
const printError = vi.fn();
vi.mock('../../lib/ui/index.js', () => ({
  setJsonMode: vi.fn(),
  printError,
}));

const { newCommand } = await import('./new.js');

// Mock process.exit - throws to halt execution (mimics real exit behavior)
class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new ExitError(code as number);
});

// Capture console.log output for JSON assertions
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

/** Invoke the command's handler with a parsed-argv-like object. */
async function invoke(argv: Record<string, unknown>) {
  runNewprHandler.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (newCommand.handler as any)({ base: 'main', ...argv });
  return runNewprHandler.mock.calls[0][0];
}

describe('wt new content flags', () => {
  beforeEach(() => {
    runNewprHandler.mockReset();
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    printError.mockClear();
  });

  it('passes --title through to Options.title', async () => {
    const options = await invoke({ title: 'feat: dark mode' });
    expect(options.title).toBe('feat: dark mode');
  });

  it('passes --body through, and resolves --body-file to its contents', async () => {
    const withBody = await invoke({ body: 'inline' });
    expect(withBody.body).toBe('inline');

    // The handler eagerly validates --body-file is readable, so this must
    // point at a real file rather than an arbitrary path.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-new-test-'));
    const bodyFilePath = path.join(tmpDir, 'body.md');
    fs.writeFileSync(bodyFilePath, '# body');
    try {
      const withFile = await invoke({ 'body-file': bodyFilePath });
      // The path is deliberately NOT forwarded: the file is read once here,
      // before any git mutation, and the bytes travel onward. Forwarding the
      // path would let a later re-read pick up stale or missing content once
      // the workflow has committed/pushed/checked out around it.
      expect(withFile.body).toBe('# body');
      expect(withFile.bodyFile).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('passes --force-ai and --skip-ai as booleans', async () => {
    const options = await invoke({ 'force-ai': true, 'skip-ai': true });
    expect(options.forceAi).toBe(true);
    expect(options.skipAi).toBe(true);
  });

  it('leaves content options undefined when no flags are given', async () => {
    const options = await invoke({});
    expect(options.title).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(options.bodyFile).toBeUndefined();
  });

  it('rejects --body and --body-file together before any git mutation runs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    await expect(
      handler({ base: 'main', body: 'inline', 'body-file': '/tmp/body.md' })
    ).rejects.toThrow('process.exit(1)');

    // The whole point of the early check: nothing downstream ran.
    expect(runNewprHandler).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('--body and --body-file are mutually exclusive'),
      })
    );
  });

  it('rejects --body and --body-file together with a JSON error when --json is set', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    await expect(
      handler({ base: 'main', body: 'inline', 'body-file': '/tmp/body.md', json: true })
    ).rejects.toThrow('process.exit(1)');

    expect(runNewprHandler).not.toHaveBeenCalled();
    const [output] = mockConsoleLog.mock.calls[0];
    const parsed = JSON.parse(output as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('INVALID_ARGUMENT');
    expect(parsed.error.message).toContain('--body and --body-file are mutually exclusive');
  });

  it('rejects an empty --title before any git mutation runs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    await expect(handler({ base: 'main', title: '   ' })).rejects.toThrow('process.exit(1)');

    expect(runNewprHandler).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('--title must not be empty or whitespace-only'),
      })
    );
  });

  it('rejects an empty --body before any git mutation runs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    await expect(handler({ base: 'main', body: '' })).rejects.toThrow('process.exit(1)');

    expect(runNewprHandler).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('--body must not be empty or whitespace-only'),
      })
    );
  });

  it('rejects a whitespace-only --body-file before any git mutation runs, with a JSON error when --json is set', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-new-test-'));
    const bodyFilePath = path.join(tmpDir, 'body.md');
    fs.writeFileSync(bodyFilePath, '   \n  ');
    try {
      await expect(
        handler({ base: 'main', 'body-file': bodyFilePath, json: true })
      ).rejects.toThrow('process.exit(1)');

      expect(runNewprHandler).not.toHaveBeenCalled();
      const [output] = mockConsoleLog.mock.calls[0];
      const parsed = JSON.parse(output as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('INVALID_ARGUMENT');
      expect(parsed.error.message).toContain('--body-file must not be empty or whitespace-only');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('wt new content-flag validation is scoped to modes that use it', () => {
  // Regression: the fail-fast validation ran before the mode was determined,
  // so `--pr 42 --body-file missing.md` was rejected over a file the command
  // would never open. --pr routes to modeExistingPr, which never calls
  // resolvePRContent; docs/AI-TOOLING.md documents the content flags as
  // ignored there, so rejecting them contradicts the shipped docs.
  it('does not validate --body-file in --pr mode, where it is ignored', async () => {
    runNewprHandler.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    await handler({ base: 'main', pr: 42, 'body-file': '/nonexistent-xyz-should-be-ignored.md' });

    expect(runNewprHandler).toHaveBeenCalled();
    const options = runNewprHandler.mock.calls[0][0];
    expect(options.mode).toBe('pr');
    expect(options.prNumber).toBe(42);
  });

  it('does not reject an empty --title in --pr mode', async () => {
    runNewprHandler.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    await handler({ base: 'main', pr: 42, title: '   ' });

    expect(runNewprHandler).toHaveBeenCalled();
    expect(runNewprHandler.mock.calls[0][0].mode).toBe('pr');
  });

  it('still validates --body-file when NOT in --pr mode', async () => {
    runNewprHandler.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;

    await expect(
      handler({ base: 'main', 'body-file': '/nonexistent-xyz-should-be-rejected.md' })
    ).rejects.toThrow('process.exit(1)');

    expect(runNewprHandler).not.toHaveBeenCalled();
  });
});

describe('wt new reads --body-file exactly once, before git mutation', () => {
  it('passes the file CONTENTS downstream and drops the path', async () => {
    runNewprHandler.mockReset();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-new-bodyfile-'));
    const file = path.join(dir, 'pr-body.md');
    fs.writeFileSync(file, '## Summary\n\nthe validated bytes\n');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = newCommand.handler as any;
      await handler({ base: 'main', description: 'x', 'body-file': file });

      const options = runNewprHandler.mock.calls[0][0];
      // The bytes validated up front are the bytes used downstream...
      expect(options.body).toBe('## Summary\n\nthe validated bytes\n');
      // ...and the path is gone, so nothing can re-read it after the workflow
      // commits/pushes/checks out and the file is missing or stale.
      expect(options.bodyFile).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('survives the body file being deleted after argument parsing', async () => {
    runNewprHandler.mockReset();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-new-bodyfile-gone-'));
    const file = path.join(dir, 'pr-body.md');
    fs.writeFileSync(file, 'content that must survive');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = newCommand.handler as any;
    await handler({ base: 'main', description: 'x', 'body-file': file });

    // Simulate the workflow moving git state out from under the path.
    fs.rmSync(dir, { recursive: true, force: true });

    const options = runNewprHandler.mock.calls[0][0];
    expect(options.body).toBe('content that must survive');
    expect(options.bodyFile).toBeUndefined();
  });
});
