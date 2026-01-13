/**
 * Config Migration Reporter
 *
 * Formats migration detection results and execution results
 * for console output and JSON output.
 */

import * as colors from '../colors.js';
import type { DetectionResult, MigrationResult, MigrationIssue } from './types.js';

/**
 * Options for report formatting
 */
export interface ReportOptions {
  /** Show verbose details for each issue */
  verbose?: boolean;
  /** Use colors in output (default: true) */
  useColors?: boolean;
}

/**
 * Get severity icon for console output
 */
function getSeverityIcon(severity: MigrationIssue['severity']): string {
  switch (severity) {
    case 'error':
      return '✗';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
    default:
      return '•';
  }
}

/**
 * Get colored severity text
 */
function colorSeverity(text: string, severity: MigrationIssue['severity']): string {
  switch (severity) {
    case 'error':
      return colors.error(text);
    case 'warning':
      return colors.warning(text);
    case 'info':
      return colors.dim(text);
    default:
      return text;
  }
}

/**
 * Format a single issue for console output
 */
function formatIssue(issue: MigrationIssue, options: ReportOptions = {}): string {
  const { verbose = false } = options;
  const lines: string[] = [];

  const icon = getSeverityIcon(issue.severity);
  const autoFixLabel = issue.autoFixable ? colors.success('[auto-fix available]') : '';

  lines.push(`  ${colorSeverity(icon, issue.severity)} ${issue.message} ${autoFixLabel}`);

  if (verbose && issue.details) {
    lines.push(`    ${colors.dim(issue.details)}`);
  }

  if (issue.keyPath) {
    lines.push(`    ${colors.dim(`Key: ${issue.keyPath}`)}`);
  }

  if (issue.suggestion) {
    lines.push(`    ${colors.cyan(`→ ${issue.suggestion}`)}`);
  }

  return lines.join('\n');
}

/**
 * Format migration detection report for console output
 *
 * @param detection - Detection result from detectMigrationIssues
 * @param options - Formatting options
 * @returns Formatted string for console output
 */
export function formatMigrationReport(
  detection: DetectionResult,
  options: ReportOptions = {}
): string {
  const lines: string[] = [];

  // Header
  lines.push(colors.bold('Config Migration Report'));
  lines.push(colors.dim('═'.repeat(40)));
  lines.push('');

  // Summary
  if (detection.issues.length === 0) {
    lines.push(colors.success('✓ No migration issues found. Config is up to date.'));
    return lines.join('\n');
  }

  const summaryParts: string[] = [];
  if (detection.autoFixableCount > 0) {
    summaryParts.push(colors.success(`${detection.autoFixableCount} auto-fixable`));
  }
  if (detection.manualFixCount > 0) {
    summaryParts.push(colors.warning(`${detection.manualFixCount} manual`));
  }

  lines.push(`Found ${detection.issues.length} issue(s): ${summaryParts.join(', ')}`);
  lines.push('');

  // Group issues by severity
  const errors = detection.issues.filter((i) => i.severity === 'error');
  const warnings = detection.issues.filter((i) => i.severity === 'warning');
  const infos = detection.issues.filter((i) => i.severity === 'info');

  if (errors.length > 0) {
    lines.push(colors.error('Errors:'));
    for (const issue of errors) {
      lines.push(formatIssue(issue, options));
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(colors.warning('Warnings:'));
    for (const issue of warnings) {
      lines.push(formatIssue(issue, options));
    }
    lines.push('');
  }

  if (infos.length > 0) {
    lines.push(colors.dim('Info:'));
    for (const issue of infos) {
      lines.push(formatIssue(issue, options));
    }
    lines.push('');
  }

  // Migration recommendation
  if (detection.migrationRecommended) {
    lines.push(colors.dim('─'.repeat(40)));
    if (detection.autoFixableCount > 0) {
      lines.push(
        colors.cyan(
          `Run ${colors.bold("'wtconfig migrate'")} to apply ${detection.autoFixableCount} auto-fix(es).`
        )
      );
    }
  }

  return lines.join('\n');
}

/**
 * Format migration detection report as JSON
 *
 * @param detection - Detection result from detectMigrationIssues
 * @returns JSON-serializable object
 */
export function formatMigrationReportJSON(detection: DetectionResult): object {
  return {
    summary: {
      totalIssues: detection.issues.length,
      autoFixableCount: detection.autoFixableCount,
      manualFixCount: detection.manualFixCount,
      migrationRecommended: detection.migrationRecommended,
      currentVersion: detection.currentVersion,
      targetVersion: detection.targetVersion,
    },
    configPath: detection.configPath,
    legacyFilesFound: detection.legacyFilesFound,
    parseError: detection.parseError,
    issues: detection.issues.map((issue) => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
      details: issue.details,
      keyPath: issue.keyPath,
      currentValue: issue.currentValue,
      suggestedValue: issue.suggestedValue,
      suggestion: issue.suggestion,
      autoFixable: issue.autoFixable,
      fixAction: issue.fixAction
        ? {
            type: issue.fixAction.type,
            description: issue.fixAction.description,
          }
        : undefined,
    })),
  };
}

/**
 * Format migration execution result for console output
 *
 * @param result - Migration result from runMigration
 * @returns Formatted string for console output
 */
export function formatMigrationResultReport(result: MigrationResult): string {
  const lines: string[] = [];

  if (result.success) {
    if (result.actionsExecuted.length === 0) {
      lines.push(colors.success('✓ Config is already up to date. No changes needed.'));
    } else {
      lines.push(
        colors.success(`✓ Migration complete. ${result.actionsExecuted.length} action(s) applied.`)
      );

      if (result.backupPath) {
        lines.push(colors.dim(`  Backup saved to: ${result.backupPath}`));
      }

      lines.push('');
      lines.push(colors.dim('Actions executed:'));
      for (const action of result.actionsExecuted) {
        lines.push(`  • ${action.description}`);
      }
    }
  } else {
    lines.push(colors.error(`✗ Migration failed with ${result.errors.length} error(s).`));

    if (result.backupPath) {
      lines.push(colors.warning(`  Backup available at: ${result.backupPath}`));
      lines.push(colors.dim("  To restore: copy the backup file to '.worktreerc'"));
    }

    lines.push('');
    lines.push(colors.error('Errors:'));
    for (const error of result.errors) {
      lines.push(`  • ${error}`);
    }

    if (result.actionsExecuted.length > 0) {
      lines.push('');
      lines.push(colors.dim('Actions completed before failure:'));
      for (const action of result.actionsExecuted) {
        lines.push(`  • ${action.description}`);
      }
    }
  }

  if (result.actionsSkipped.length > 0) {
    lines.push('');
    lines.push(colors.dim('Actions skipped:'));
    for (const action of result.actionsSkipped) {
      lines.push(`  • ${action.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format migration execution result as JSON
 *
 * @param result - Migration result from runMigration
 * @returns JSON-serializable object
 */
export function formatMigrationResultJSON(result: MigrationResult): object {
  return {
    success: result.success,
    backupPath: result.backupPath,
    newConfigPath: result.newConfigPath,
    actionsExecuted: result.actionsExecuted.map((a) => ({
      type: a.type,
      description: a.description,
    })),
    actionsSkipped: result.actionsSkipped.map((a) => ({
      type: a.type,
      description: a.description,
    })),
    errors: result.errors,
  };
}

/**
 * Format dry-run preview for console output
 *
 * @param detection - Detection result
 * @returns Formatted string for console output
 */
export function formatDryRunPreview(detection: DetectionResult): string {
  const lines: string[] = [];

  lines.push(colors.bold('[DRY RUN] Migration Preview'));
  lines.push(colors.dim('─'.repeat(40)));
  lines.push('');
  lines.push(colors.dim('The following changes would be made:'));
  lines.push('');

  const autoFixableIssues = detection.issues.filter((i) => i.autoFixable && i.fixAction);

  if (autoFixableIssues.length === 0) {
    lines.push(colors.dim('  No auto-fixable changes to make.'));
  } else {
    for (const issue of autoFixableIssues) {
      lines.push(`  • ${issue.fixAction!.description}`);
    }
  }

  lines.push('');
  lines.push(colors.dim('No files were modified.'));

  return lines.join('\n');
}
