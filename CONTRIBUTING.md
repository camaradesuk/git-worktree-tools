# Contributing to git-worktree-tools

Thank you for your interest in contributing to git-worktree-tools! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, constructive, and professional in all interactions.

## How to Contribute

### Reporting Bugs

Before creating a bug report:

- Check the [existing issues](https://github.com/camaradesuk/git-worktree-tools/issues) to avoid duplicates
- Collect relevant information (OS, Node version, command output, error messages)

When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the problem
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node.js version, package version)
- **Error messages** and stack traces (if applicable)

### Suggesting Features

Feature requests are welcome! Please:

- Check existing issues to avoid duplicates
- Clearly describe the feature and its benefits
- Provide use cases and examples
- Consider implementation complexity

### Pull Requests

#### Before You Start

1. **Open an issue first** for major changes to discuss the approach
2. **Check existing PRs** to avoid duplicate work
3. **Understand the codebase** - read CLAUDE.md for project context

#### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/git-worktree-tools.git
cd git-worktree-tools

# Install dependencies
npm install

# Build the project
npm run build

# Link for global testing
npm link

# Run tests
npm test

# Watch mode for development
npm run dev
```

#### Making Changes

1. **Create a feature branch**:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Write code following the existing style**:
   - TypeScript for all source code
   - Use existing patterns (signals, pure functions)
   - Follow cross-platform compatibility guidelines

3. **Write tests**:
   - Add tests for all new functionality
   - Use Vitest for testing
   - Test edge cases and error conditions

4. **Update documentation**:
   - Update README.md if adding features
   - Add inline comments for complex logic

5. **Test your changes**:

   ```bash
   npm test              # Run all tests
   npm run build         # Ensure it builds
   npm run lint          # Check linting
   npm run format:check  # Check formatting
   ```

6. **Commit with conventional commits**:

   ```bash
   git commit -m "feat: add support for custom worktree patterns"
   git commit -m "fix: resolve path resolution on Windows"
   git commit -m "docs: update README with new examples"
   ```

   **Commit types**:
   - `feat:` - New feature (triggers minor version bump)
   - `fix:` - Bug fix (triggers patch version bump)
   - `docs:` - Documentation only
   - `style:` - Code style (formatting, no logic change)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

7. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a pull request on GitHub.

#### Pull Request Guidelines

Your PR should:

- **Have a clear title and description**
- **Reference related issues** (e.g., "Fixes #123")
- **Include tests** for new functionality
- **Pass all CI checks**
- **Update documentation** as needed
- **Follow the existing code style**

### Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning via semantic-release.

#### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

#### Examples

```bash
# Feature (minor version bump: 0.1.0 → 0.2.0)
feat: add interactive mode to cleanpr command

# Bug fix (patch version bump: 0.1.0 → 0.1.1)
fix: handle spaces in worktree paths on Windows

# Breaking change (major version bump: 0.1.0 → 1.0.0)
feat!: redesign CLI interface

# Or with footer:
feat: redesign CLI interface

BREAKING CHANGE: Command syntax has changed. Use --help for new syntax.
```

#### Version Bumps Based on Commits

- **Patch** (0.1.0 → 0.1.1): Only `fix:` commits
- **Minor** (0.1.0 → 0.2.0): At least one `feat:` commit
- **Major** (0.1.0 → 1.0.0): Any commit with `BREAKING CHANGE:` or `!` after type
- **No release**: Only `docs:`, `chore:`, `style:`, `test:`, `refactor:` commits

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Run `npm run format` (Prettier)
- **Linting**: Run `npm run lint` (ESLint)
- **Naming**:
  - camelCase for functions and variables
  - PascalCase for types and interfaces
  - UPPER_CASE for constants
- **Cross-platform**: Always use `path.join()` for file paths, never hardcode separators

### Testing Guidelines

#### Unit Tests

- Test pure functions in isolation
- Mock external dependencies (fs, child_process, inquirer)
- Test both success and error cases
- Use descriptive test names

Example:

```typescript
describe('getMainWorktreeRoot', () => {
  it('should return main worktree path when in linked worktree', () => {
    // Arrange
    vi.spyOn(child_process, 'spawnSync').mockReturnValue({
      stdout: Buffer.from('.git/worktrees/feature'),
      status: 0,
    } as any);

    // Act
    const result = getMainWorktreeRoot();

    // Assert
    expect(result).toBe('/path/to/main');
  });
});
```

### Project Structure

```
git-worktree-tools/
├── src/
│   ├── cli/           # CLI entry points (newpr, cleanpr, lswt, wtlink)
│   ├── lib/           # Core libraries
│   │   ├── git.ts     # Git operations
│   │   ├── github.ts  # GitHub CLI wrapper
│   │   ├── prompts.ts # Interactive prompts
│   │   ├── config.ts  # Configuration handling
│   │   └── *.test.ts  # Unit tests (co-located)
│   └── index.ts       # Library exports
├── docs/              # Documentation
└── dist/              # Compiled output (generated)
```

## Questions?

- Open an issue for questions
- Check [README.md](README.md) for usage documentation
- Read [CLAUDE.md](CLAUDE.md) for project context

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
