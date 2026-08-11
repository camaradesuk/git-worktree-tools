/**
 * wt ai - AI provider diagnostics
 */
import type { CommandModule } from 'yargs';
import * as git from '../../lib/git.js';
import { loadConfig } from '../../lib/config.js';
import { runDiagnostics } from '../../lib/ai/doctor-report.js';
import {
  createSuccessResult,
  createErrorResult,
  formatJsonResult,
  ErrorCode,
} from '../../lib/json-output.js';
import { setJsonMode, print, printDim, printStatus, printError } from '../../lib/ui/index.js';

interface AiArgs {
  subcommand?: string;
  json?: boolean;
  offline?: boolean;
}

function repoRootOrUndefined(): string | undefined {
  try {
    return git.getRepoRoot();
  } catch {
    return undefined;
  }
}

async function runDoctor(argv: AiArgs): Promise<void> {
  const json = Boolean(argv.json);
  const offline = Boolean(argv.offline);
  setJsonMode(json);

  const config = loadConfig(repoRootOrUndefined());
  const report = await runDiagnostics(config.ai, { offline });

  if (json) {
    console.log(formatJsonResult(createSuccessResult('wt ai doctor', report)));
    return;
  }

  print(`AI provider diagnostics (mode: ${report.configuredMode}${offline ? ', offline' : ''})`);
  for (const p of report.providers) {
    const mark = p.name === report.selected ? '→' : ' ';
    printStatus(p.installed ? 'info' : 'warning', `${mark} ${p.displayName}`);
    printDim(
      `    installed: ${p.installed}  authenticated: ${p.authenticated}  reachable: ${p.reachable}`
    );
    if (p.model) printDim(`    model: ${p.model}`);
    printDim(`    timeout: ${p.timeoutMs}ms`);
    if (p.error) printDim(`    error: ${p.error}`);
  }
  print('');
  print(`auto would select: ${report.selected ?? '(none — falls back to template content)'}`);
  printDim(report.selectionReason);
  if (report.selectionWarning) {
    printStatus('warning', report.selectionWarning);
  }
}

export const aiCommand: CommandModule<object, AiArgs> = {
  command: ['ai [subcommand]'],
  describe: 'AI provider diagnostics (wt ai doctor)',
  builder: (yargs) =>
    yargs
      .positional('subcommand', { describe: 'Subcommand: doctor', type: 'string' })
      .option('json', { type: 'boolean', description: 'Output as JSON', default: false })
      .option('offline', {
        type: 'boolean',
        description: 'Skip live reachability probes (no quota spent)',
        default: false,
      })
      .example('$0 ai doctor', 'Show provider diagnostics and what auto would select')
      .example('$0 ai doctor --json', 'JSON output for AI agents')
      .example('$0 ai doctor --offline', 'Skip live probes (fast, no quota spent)'),
  handler: async (argv) => {
    const json = Boolean(argv.json);
    try {
      if (argv.subcommand !== 'doctor') {
        const message = `Unknown ai subcommand: ${argv.subcommand ?? '(none)'}. Try: wt ai doctor`;
        if (json) {
          console.log(
            formatJsonResult(createErrorResult('wt ai', ErrorCode.INVALID_ARGUMENT, message))
          );
        } else {
          printError({ title: message });
        }
        process.exit(1);
        return;
      }

      await runDoctor(argv);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (json) {
        console.log(
          formatJsonResult(createErrorResult('wt ai', ErrorCode.OPERATION_FAILED, message))
        );
      } else {
        printError({ title: message });
      }
      process.exit(1);
    }
  },
};
