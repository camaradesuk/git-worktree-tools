import { describe, it, expect, vi, beforeEach } from 'vitest';

const runNewprHandler = vi.fn();
vi.mock('../newpr.js', () => ({ runNewprHandler }));
vi.mock('../../lib/ui/index.js', () => ({
  setJsonMode: vi.fn(),
  printError: vi.fn(),
}));

const { newCommand } = await import('./new.js');

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
  });

  it('passes --title through to Options.title', async () => {
    const options = await invoke({ title: 'feat: dark mode' });
    expect(options.title).toBe('feat: dark mode');
  });

  it('passes --body and --body-file through unchanged', async () => {
    const withBody = await invoke({ body: 'inline' });
    expect(withBody.body).toBe('inline');

    const withFile = await invoke({ 'body-file': '/tmp/body.md' });
    expect(withFile.bodyFile).toBe('/tmp/body.md');
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
});
