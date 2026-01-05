/**
 * Repository Documentation Discovery
 *
 * Finds and reads README and other documentation files to provide
 * context for AI generation.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Documentation file patterns to look for, in priority order
 */
const DOC_FILE_PATTERNS = [
  'README.md',
  'README',
  'readme.md',
  'README.rst',
  'README.txt',
  'CONTRIBUTING.md',
  'ARCHITECTURE.md',
  'docs/README.md',
  'doc/README.md',
];

/**
 * Package files that may contain useful project info
 */
const PACKAGE_FILES = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];

/**
 * Repository documentation context
 */
export interface RepoDocumentation {
  /** README content (truncated) */
  readme?: string;
  /** Project description from package file */
  projectDescription?: string;
  /** Tech stack keywords */
  techStack?: string[];
  /** Source file path of README */
  readmeSource?: string;
}

/**
 * Maximum length for README content in prompts
 */
const MAX_README_LENGTH = 2000;

/**
 * Maximum length for project description
 */
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Find and read the README file from a repository
 */
function findReadme(repoRoot: string): { content: string; source: string } | null {
  for (const pattern of DOC_FILE_PATTERNS) {
    const filePath = path.join(repoRoot, pattern);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { content, source: pattern };
      } catch {
        // Continue to next pattern
      }
    }
  }
  return null;
}

/**
 * Extract project info from package.json
 */
function extractPackageJsonInfo(repoRoot: string): {
  description?: string;
  techStack?: string[];
} {
  const packagePath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(content);

    const techStack: string[] = [];

    // Add main technology
    if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
      techStack.push('TypeScript');
    } else {
      techStack.push('JavaScript');
    }

    // Check for framework
    if (pkg.dependencies?.react) techStack.push('React');
    if (pkg.dependencies?.vue) techStack.push('Vue');
    if (pkg.dependencies?.angular || pkg.dependencies?.['@angular/core']) techStack.push('Angular');
    if (pkg.dependencies?.express) techStack.push('Express');
    if (pkg.dependencies?.next) techStack.push('Next.js');
    if (pkg.dependencies?.nest || pkg.dependencies?.['@nestjs/core']) techStack.push('NestJS');

    // Check for testing framework
    if (pkg.devDependencies?.vitest) techStack.push('Vitest');
    if (pkg.devDependencies?.jest) techStack.push('Jest');
    if (pkg.devDependencies?.mocha) techStack.push('Mocha');

    return {
      description: pkg.description,
      techStack,
    };
  } catch {
    return {};
  }
}

/**
 * Extract project info from pyproject.toml
 */
function extractPyProjectInfo(repoRoot: string): {
  description?: string;
  techStack?: string[];
} {
  const pyprojectPath = path.join(repoRoot, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(pyprojectPath, 'utf-8');
    const techStack: string[] = ['Python'];

    // Simple TOML parsing for description
    const descMatch = content.match(/description\s*=\s*["']([^"']+)["']/);
    const description = descMatch ? descMatch[1] : undefined;

    // Check for common frameworks in dependencies
    if (content.includes('django')) techStack.push('Django');
    if (content.includes('flask')) techStack.push('Flask');
    if (content.includes('fastapi')) techStack.push('FastAPI');
    if (content.includes('pytest')) techStack.push('pytest');

    return { description, techStack };
  } catch {
    return {};
  }
}

/**
 * Extract project info from Cargo.toml (Rust)
 */
function extractCargoInfo(repoRoot: string): {
  description?: string;
  techStack?: string[];
} {
  const cargoPath = path.join(repoRoot, 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(cargoPath, 'utf-8');
    const techStack: string[] = ['Rust'];

    // Simple TOML parsing for description
    const descMatch = content.match(/description\s*=\s*["']([^"']+)["']/);
    const description = descMatch ? descMatch[1] : undefined;

    // Check for common frameworks
    if (content.includes('tokio')) techStack.push('Tokio');
    if (content.includes('actix')) techStack.push('Actix');
    if (content.includes('rocket')) techStack.push('Rocket');

    return { description, techStack };
  } catch {
    return {};
  }
}

/**
 * Extract project info from go.mod (Go)
 */
function extractGoModInfo(repoRoot: string): {
  description?: string;
  techStack?: string[];
} {
  const goModPath = path.join(repoRoot, 'go.mod');
  if (!fs.existsSync(goModPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(goModPath, 'utf-8');
    const techStack: string[] = ['Go'];

    // Check for common frameworks
    if (content.includes('gin-gonic')) techStack.push('Gin');
    if (content.includes('gorilla/mux')) techStack.push('Gorilla Mux');
    if (content.includes('echo')) techStack.push('Echo');

    return { techStack };
  } catch {
    return {};
  }
}

/**
 * Truncate content intelligently, preferring complete sections
 */
function truncateReadme(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }

  // Try to truncate at a section boundary (## heading)
  const truncated = content.slice(0, maxLength);
  const lastHeading = truncated.lastIndexOf('\n## ');
  if (lastHeading > maxLength * 0.5) {
    // Only truncate at heading if we keep at least half the content
    return truncated.slice(0, lastHeading).trim() + '\n\n[...truncated]';
  }

  // Try to truncate at paragraph boundary
  const lastParagraph = truncated.lastIndexOf('\n\n');
  if (lastParagraph > maxLength * 0.7) {
    return truncated.slice(0, lastParagraph).trim() + '\n\n[...truncated]';
  }

  // Fall back to hard truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.9) {
    return truncated.slice(0, lastSpace).trim() + '...[truncated]';
  }

  return truncated + '...[truncated]';
}

/**
 * Gather repository documentation for AI context
 *
 * @param repoRoot - Root directory of the repository
 * @param options - Options for documentation gathering
 * @returns Documentation context for AI prompts
 */
export function gatherRepoDocumentation(
  repoRoot: string,
  options: {
    maxReadmeLength?: number;
    includeReadme?: boolean;
    includeTechStack?: boolean;
  } = {}
): RepoDocumentation {
  const {
    maxReadmeLength = MAX_README_LENGTH,
    includeReadme = true,
    includeTechStack = true,
  } = options;

  const result: RepoDocumentation = {};

  // Find and read README
  if (includeReadme) {
    const readme = findReadme(repoRoot);
    if (readme) {
      result.readme = truncateReadme(readme.content, maxReadmeLength);
      result.readmeSource = readme.source;
    }
  }

  // Extract project info from package files
  if (includeTechStack) {
    // Try each package format in order of prevalence
    const packageInfo = extractPackageJsonInfo(repoRoot);
    const pyInfo = extractPyProjectInfo(repoRoot);
    const cargoInfo = extractCargoInfo(repoRoot);
    const goInfo = extractGoModInfo(repoRoot);

    // Combine tech stacks (first found wins for description)
    const allTechStack = new Set<string>();

    [packageInfo, pyInfo, cargoInfo, goInfo].forEach((info) => {
      if (info.techStack) {
        info.techStack.forEach((t) => allTechStack.add(t));
      }
    });

    result.techStack = Array.from(allTechStack);

    // Use first description found
    result.projectDescription =
      packageInfo.description || pyInfo.description || cargoInfo.description;

    // Truncate description if too long
    if (result.projectDescription && result.projectDescription.length > MAX_DESCRIPTION_LENGTH) {
      result.projectDescription =
        result.projectDescription.slice(0, MAX_DESCRIPTION_LENGTH) + '...';
    }
  }

  return result;
}

/**
 * Format documentation for inclusion in prompts
 *
 * @param docs - Repository documentation
 * @returns Formatted string for prompt inclusion
 */
export function formatDocsForPrompt(docs: RepoDocumentation): string {
  const parts: string[] = [];

  if (docs.projectDescription) {
    parts.push(`Project: ${docs.projectDescription}`);
  }

  if (docs.techStack && docs.techStack.length > 0) {
    parts.push(`Tech: ${docs.techStack.join(', ')}`);
  }

  if (docs.readme) {
    // Include a condensed version of the README
    parts.push(`README:\n${docs.readme}`);
  }

  return parts.join('\n');
}

/**
 * Check if repository has meaningful documentation
 */
export function hasDocumentation(repoRoot: string): boolean {
  const readme = findReadme(repoRoot);
  return readme !== null && readme.content.length > 50;
}
