/**
 * Guards schemas/worktreerc.schema.json against drifting from the actual
 * implementation. The schema is never loaded at runtime (no ajv, no JSON
 * import of it in src/) — it exists for editor autocomplete and
 * `wt config schema`, so nothing catches drift except this test.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../../schemas/worktreerc.schema.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSchema(): any {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveNode(node: any, definitions: any): any {
  return node.$ref ? definitions[node.$ref.split('/').pop()] : node;
}

/** Flatten declared leaf properties into dot-paths, following $refs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenSchemaKeys(properties: any, definitions: any, prefix = ''): string[] {
  const out: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [key, rawNode] of Object.entries<any>(properties || {})) {
    const nodePath = prefix ? `${prefix}.${key}` : key;
    const node = resolveNode(rawNode, definitions);
    if (node.type === 'object' && node.properties) {
      out.push(...flattenSchemaKeys(node.properties, definitions, nodePath));
    } else {
      out.push(nodePath);
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectSchemaDefaults(
  properties: any,
  definitions: any,
  prefix = ''
): [string, unknown][] {
  const out: [string, unknown][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [key, rawNode] of Object.entries<any>(properties || {})) {
    const nodePath = prefix ? `${prefix}.${key}` : key;
    const node = resolveNode(rawNode, definitions);
    if (node.type === 'object' && node.properties) {
      out.push(...collectSchemaDefaults(node.properties, definitions, nodePath));
    } else if ('default' in node) {
      out.push([nodePath, node.default]);
    }
  }
  return out;
}

function getAtPath(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

describe('schema coverage (schemas/worktreerc.schema.json)', () => {
  const schema = loadSchema();
  const schemaKeys = flattenSchemaKeys(schema.properties, schema.definitions);

  it('declares gemini-api as a valid ai.provider and ai.fallback value', () => {
    expect(schema.definitions.AIConfig.properties.provider.enum).toContain('gemini-api');
    expect(schema.definitions.AIConfig.properties.fallback.enum).toContain('gemini-api');
  });

  // Keep in sync with WorktreeConfig / AIConfig / HooksConfig.
  const DOCUMENTED_KEYS = [
    'configVersion',
    'sharedRepos',
    'baseBranch',
    'draftPr',
    'worktreePattern',
    'worktreeParent',
    'syncPatterns',
    'branchPrefix',
    'previewLabel',
    'preferredEditor',
    'linkConfigFiles',
    'ai.provider',
    'ai.fallback',
    'ai.branchName',
    'ai.prTitle',
    'ai.prDescription',
    'ai.commitMessage',
    'ai.planDocument',
    'ai.branchStyle',
    'ai.commitStyle',
    'ai.prTemplate',
    'ai.planTemplate',
    'ai.planPath',
    'ai.planPathMode',
    'ai.claude.model',
    'ai.gemini.model',
    'ai.openai.model',
    'ai.ollama.model',
    'ai.ollama.host',
    'ai.script.path',
    'hooks.pre-analyze',
    'hooks.post-analyze',
    'hooks.pre-branch',
    'hooks.post-branch',
    'hooks.pre-commit',
    'hooks.post-commit',
    'hooks.pre-push',
    'hooks.post-push',
    'hooks.pre-pr',
    'hooks.post-pr',
    'hooks.pre-worktree',
    'hooks.post-worktree',
    'hooks.cleanup',
    'hookDefaults.timeout',
    'hookDefaults.maxTimeout',
    'plugins',
    'generators.branchName',
    'generators.prTitle',
    'generators.prDescription',
    'generators.commitMessage',
    'integrations.linear.teamId',
    'integrations.linear.apiKeyEnv',
    'integrations.jira.projectKey',
    'integrations.jira.baseUrl',
    'integrations.jira.apiTokenEnv',
    'integrations.slack.webhookUrl',
    'integrations.slack.channel',
    'logging.level',
    'logging.logFile',
    'logging.timestamps',
    'global.warnNotGlobal',
    'global.logging.level',
    'global.logging.logFile',
    'global.logging.timestamps',
    'wtlink.enabled',
    'wtlink.disabled',
  ];

  it.each(DOCUMENTED_KEYS)('schema documents %s', (key) => {
    expect(schemaKeys).toContain(key);
  });

  it('every schema leaf default matches the runtime default in getDefaultConfig()', () => {
    const defaults = getDefaultConfig();
    const mismatches: string[] = [];
    for (const [key, schemaDefault] of collectSchemaDefaults(
      schema.properties,
      schema.definitions
    )) {
      const actual = getAtPath(defaults, key);
      if (actual !== undefined && JSON.stringify(actual) !== JSON.stringify(schemaDefault)) {
        mismatches.push(
          `${key}: schema says ${JSON.stringify(schemaDefault)}, runtime default is ${JSON.stringify(actual)}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
