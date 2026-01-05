/**
 * Tests for repository documentation discovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { gatherRepoDocumentation, formatDocsForPrompt, hasDocumentation } from './repo-docs.js';

describe('repo-docs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-docs-test-'));
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('gatherRepoDocumentation', () => {
    describe('README discovery', () => {
      it('finds README.md', () => {
        fs.writeFileSync(
          path.join(tempDir, 'README.md'),
          '# My Project\n\nThis is a test project.'
        );

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.readme).toContain('# My Project');
        expect(docs.readme).toContain('This is a test project');
        expect(docs.readmeSource).toBe('README.md');
      });

      it('finds lowercase readme.md', () => {
        fs.writeFileSync(path.join(tempDir, 'readme.md'), '# Lower Case');

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.readme).toContain('# Lower Case');
        expect(docs.readmeSource).toBe('readme.md');
      });

      it('finds README without extension', () => {
        fs.writeFileSync(path.join(tempDir, 'README'), 'Plain text readme');

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.readme).toContain('Plain text readme');
        expect(docs.readmeSource).toBe('README');
      });

      it('prefers README.md over README', () => {
        fs.writeFileSync(path.join(tempDir, 'README.md'), '# Markdown');
        fs.writeFileSync(path.join(tempDir, 'README'), 'Plain text');

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.readme).toContain('# Markdown');
        expect(docs.readmeSource).toBe('README.md');
      });

      it('finds README in docs/ directory', () => {
        fs.mkdirSync(path.join(tempDir, 'docs'));
        fs.writeFileSync(path.join(tempDir, 'docs', 'README.md'), '# Docs Readme');

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.readme).toContain('# Docs Readme');
        expect(docs.readmeSource).toBe('docs/README.md');
      });

      it('returns undefined readme when none exists', () => {
        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.readme).toBeUndefined();
        expect(docs.readmeSource).toBeUndefined();
      });

      it('respects includeReadme option', () => {
        fs.writeFileSync(path.join(tempDir, 'README.md'), '# My Project');

        const docs = gatherRepoDocumentation(tempDir, { includeReadme: false });

        expect(docs.readme).toBeUndefined();
      });
    });

    describe('README truncation', () => {
      it('truncates long README at section boundary', () => {
        const longReadme = `# Project

## Section 1
This is the first section with some content.

## Section 2
This is the second section with more content.

## Section 3
This is the third section.`;

        fs.writeFileSync(path.join(tempDir, 'README.md'), longReadme);

        const docs = gatherRepoDocumentation(tempDir, { maxReadmeLength: 100 });

        expect(docs.readme).toBeDefined();
        expect(docs.readme!.length).toBeLessThanOrEqual(150); // Allow some buffer
        expect(docs.readme).toContain('[...truncated]');
      });

      it('truncates at paragraph boundary when no section boundary', () => {
        const longReadme = `# Project

This is a very long paragraph that goes on and on without any section breaks.

This is another paragraph that adds more content to the readme file.

And yet another paragraph with even more content.`;

        fs.writeFileSync(path.join(tempDir, 'README.md'), longReadme);

        const docs = gatherRepoDocumentation(tempDir, { maxReadmeLength: 100 });

        expect(docs.readme).toBeDefined();
        expect(docs.readme).toContain('[...truncated]');
      });

      it('does not truncate short README', () => {
        const shortReadme = '# Short\n\nBrief description.';
        fs.writeFileSync(path.join(tempDir, 'README.md'), shortReadme);

        const docs = gatherRepoDocumentation(tempDir, { maxReadmeLength: 2000 });

        expect(docs.readme).toBe(shortReadme);
        expect(docs.readme).not.toContain('truncated');
      });
    });

    describe('package.json extraction', () => {
      it('extracts description from package.json', () => {
        const pkg = {
          name: 'test-project',
          description: 'A test project for unit testing',
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.projectDescription).toBe('A test project for unit testing');
      });

      it('detects TypeScript from devDependencies', () => {
        const pkg = {
          name: 'ts-project',
          devDependencies: { typescript: '^5.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('TypeScript');
      });

      it('detects JavaScript when no TypeScript', () => {
        const pkg = {
          name: 'js-project',
          dependencies: { lodash: '^4.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('JavaScript');
      });

      it('detects React framework', () => {
        const pkg = {
          name: 'react-app',
          dependencies: { react: '^18.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('React');
      });

      it('detects Vue framework', () => {
        const pkg = {
          name: 'vue-app',
          dependencies: { vue: '^3.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Vue');
      });

      it('detects Next.js framework', () => {
        const pkg = {
          name: 'nextjs-app',
          dependencies: { next: '^13.0.0', react: '^18.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Next.js');
        expect(docs.techStack).toContain('React');
      });

      it('detects Vitest testing framework', () => {
        const pkg = {
          name: 'test-project',
          devDependencies: { vitest: '^1.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Vitest');
      });

      it('detects Jest testing framework', () => {
        const pkg = {
          name: 'test-project',
          devDependencies: { jest: '^29.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Jest');
      });

      it('handles malformed package.json gracefully', () => {
        fs.writeFileSync(path.join(tempDir, 'package.json'), 'not valid json');

        const docs = gatherRepoDocumentation(tempDir);

        // Should not throw, just return empty tech stack
        expect(docs.techStack).toEqual([]);
      });
    });

    describe('pyproject.toml extraction', () => {
      it('extracts description from pyproject.toml', () => {
        const content = `[project]
name = "my-python-project"
description = "A Python project for testing"
`;
        fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), content);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.projectDescription).toBe('A Python project for testing');
        expect(docs.techStack).toContain('Python');
      });

      it('detects Django framework', () => {
        const content = `[project]
dependencies = ["django>=4.0"]
`;
        fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), content);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Django');
      });

      it('detects FastAPI framework', () => {
        const content = `[project]
dependencies = ["fastapi>=0.100.0"]
`;
        fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), content);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('FastAPI');
      });
    });

    describe('Cargo.toml extraction', () => {
      it('extracts description from Cargo.toml', () => {
        const content = `[package]
name = "my-rust-project"
description = "A Rust project for testing"
`;
        fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), content);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.projectDescription).toBe('A Rust project for testing');
        expect(docs.techStack).toContain('Rust');
      });

      it('detects Tokio runtime', () => {
        const content = `[dependencies]
tokio = { version = "1.0", features = ["full"] }
`;
        fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), content);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Tokio');
      });
    });

    describe('go.mod extraction', () => {
      it('detects Go from go.mod', () => {
        const content = `module github.com/user/project

go 1.21
`;
        fs.writeFileSync(path.join(tempDir, 'go.mod'), content);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Go');
      });

      it('detects Gin framework', () => {
        const content = `module github.com/user/project

require github.com/gin-gonic/gin v1.9.0
`;
        fs.writeFileSync(path.join(tempDir, 'go.mod'), content);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('Gin');
      });
    });

    describe('combined sources', () => {
      it('combines tech stack from multiple sources', () => {
        // package.json with TypeScript
        const pkg = {
          name: 'full-stack',
          devDependencies: { typescript: '^5.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        // pyproject.toml with Python
        const pyproject = `[project]
dependencies = ["fastapi"]
`;
        fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), pyproject);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.techStack).toContain('TypeScript');
        expect(docs.techStack).toContain('Python');
        expect(docs.techStack).toContain('FastAPI');
      });

      it('uses first found description', () => {
        // package.json description
        const pkg = {
          name: 'project',
          description: 'From package.json',
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        // pyproject.toml description
        const pyproject = `[project]
description = "From pyproject.toml"
`;
        fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), pyproject);

        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.projectDescription).toBe('From package.json');
      });

      it('respects includeTechStack option', () => {
        const pkg = {
          name: 'project',
          devDependencies: { typescript: '^5.0.0' },
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg));

        const docs = gatherRepoDocumentation(tempDir, { includeTechStack: false });

        expect(docs.techStack).toBeUndefined();
        expect(docs.projectDescription).toBeUndefined();
      });
    });

    describe('empty repository', () => {
      it('returns empty documentation for empty directory', () => {
        const docs = gatherRepoDocumentation(tempDir);

        expect(docs.readme).toBeUndefined();
        expect(docs.projectDescription).toBeUndefined();
        expect(docs.techStack).toEqual([]);
      });
    });
  });

  describe('formatDocsForPrompt', () => {
    it('formats documentation with all fields', () => {
      const docs = {
        readme: '# Test\n\nThis is a test.',
        projectDescription: 'A test project',
        techStack: ['TypeScript', 'React'],
      };

      const formatted = formatDocsForPrompt(docs);

      expect(formatted).toContain('Project: A test project');
      expect(formatted).toContain('Tech: TypeScript, React');
      expect(formatted).toContain('README:');
      expect(formatted).toContain('# Test');
    });

    it('formats documentation with only project description', () => {
      const docs = {
        projectDescription: 'Just a description',
      };

      const formatted = formatDocsForPrompt(docs);

      expect(formatted).toContain('Project: Just a description');
      expect(formatted).not.toContain('Tech:');
      expect(formatted).not.toContain('README:');
    });

    it('returns empty string for empty docs', () => {
      const docs = {};

      const formatted = formatDocsForPrompt(docs);

      expect(formatted).toBe('');
    });

    it('handles docs with only tech stack', () => {
      const docs = {
        techStack: ['Go', 'Gin'],
      };

      const formatted = formatDocsForPrompt(docs);

      expect(formatted).toContain('Tech: Go, Gin');
    });
  });

  describe('hasDocumentation', () => {
    it('returns true when README exists with content', () => {
      fs.writeFileSync(
        path.join(tempDir, 'README.md'),
        '# Project\n\nThis is a substantial readme with more than 50 characters of content.'
      );

      expect(hasDocumentation(tempDir)).toBe(true);
    });

    it('returns false when no README exists', () => {
      expect(hasDocumentation(tempDir)).toBe(false);
    });

    it('returns false when README is too short', () => {
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Hi');

      expect(hasDocumentation(tempDir)).toBe(false);
    });
  });
});
