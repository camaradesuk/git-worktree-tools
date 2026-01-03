## [1.4.1](https://github.com/camaradesuk/git-worktree-tools/compare/v1.4.0...v1.4.1) (2026-01-03)


### Bug Fixes

* propagate cwd parameter to git operations in API functions ([60078e6](https://github.com/camaradesuk/git-worktree-tools/commit/60078e61d4d023a40f293b8fd98afdc8847dee29))

# [1.4.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.3.0...v1.4.0) (2026-01-03)


### Bug Fixes

* add proper type annotation to wtstate test mock ([46ccfc0](https://github.com/camaradesuk/git-worktree-tools/commit/46ccfc0dc9176769fab269e59e9ca735aa1260fa))
* add StateActionKey type import for invalid action tests ([d09eaf4](https://github.com/camaradesuk/git-worktree-tools/commit/d09eaf4ab8dd52c815dc643c1b6c1850a8956f39))
* address code review feedback for AI tooling PR ([dc7367b](https://github.com/camaradesuk/git-worktree-tools/commit/dc7367b324424a38cf9f10d56b9622865dc9b044))
* address Sentry PR review - non-interactive mode and CLI flags ([f0ab7ed](https://github.com/camaradesuk/git-worktree-tools/commit/f0ab7edc66bc72d2e1fff96c90f910c09f916337))
* fix formatting and Windows test compatibility ([8b04f2f](https://github.com/camaradesuk/git-worktree-tools/commit/8b04f2fa4aef1d2ea9fb616d39e6d714f76a676b))
* make cli-provider test platform-aware for Windows ([751d844](https://github.com/camaradesuk/git-worktree-tools/commit/751d844e65a81b7589b5a2e39bbcadf9ba980969))
* make JavaScript script hook test Windows-compatible ([2878436](https://github.com/camaradesuk/git-worktree-tools/commit/2878436fe7da538c8aa59b6076927b80386fb02b))
* resolve TypeScript compilation errors and add ci:lint script ([c550181](https://github.com/camaradesuk/git-worktree-tools/commit/c5501814f32b59a7e54ba01e7a5bdc7768d7e678))
* skip e2e tests when GitHub CLI not available ([b254359](https://github.com/camaradesuk/git-worktree-tools/commit/b2543596b46853472a79749fbc2b2370fab8a7c3))
* use exitWithError for hook failures to support JSON output ([64dd668](https://github.com/camaradesuk/git-worktree-tools/commit/64dd668d382891026ac35df8e1251edbc47bf71c))


### Features

* add AI generation service and lifecycle hooks (Phase 8) ([5469606](https://github.com/camaradesuk/git-worktree-tools/commit/5469606c79cc44779ef57692d529d2486a05a726))
* add AI-friendly CLI options for automation (Phase 1) ([7c6188b](https://github.com/camaradesuk/git-worktree-tools/commit/7c6188bb42473bbe7e0273dbdef2731913773deb))
* add MCP server for AI agent integration (Phase 8) ([3a25d8d](https://github.com/camaradesuk/git-worktree-tools/commit/3a25d8daf19da048d6b35794bb2ae27787cd860a))
* add programmatic API layer (Phase 3) ([46ec22c](https://github.com/camaradesuk/git-worktree-tools/commit/46ec22c7110764374fd93b9840c3350bc9f41896))
* add wtconfig command for configuration management (Phase 8) ([214abeb](https://github.com/camaradesuk/git-worktree-tools/commit/214abeb6c5c823b2a03f4d79bdb23e6ff65a834c))
* add wtstate command for AI agent state queries (Phase 2) ([8669929](https://github.com/camaradesuk/git-worktree-tools/commit/8669929d86bf0a3ce80cb6d77dd66eb0ddc2a8d6))
* integrate hooks into newpr workflow (Phase 8) ([7e62d86](https://github.com/camaradesuk/git-worktree-tools/commit/7e62d86aa4eda62749b76f4f15d10fbe2d9b67b4))

# [1.3.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.2.1...v1.3.0) (2026-01-02)


### Bug Fixes

* add missing PrInfo properties in test mocks ([222f868](https://github.com/camaradesuk/git-worktree-tools/commit/222f868e560bbc195168f89f7c25b0975f121e7c))
* address Sentry bug reports from PR review ([a7a35f9](https://github.com/camaradesuk/git-worktree-tools/commit/a7a35f97b9592118cd808b6918d24c40113cd4a0))
* ensure pre-commit hook exits on tsc/prettier failures ([b91904e](https://github.com/camaradesuk/git-worktree-tools/commit/b91904e7eea9898bc8db235767161ec17d799562))
* **lswt:** honor available editor when preferred editor missing ([15daeb1](https://github.com/camaradesuk/git-worktree-tools/commit/15daeb1a7675eb9f087709cc4fbc18fd0fdad727))
* resolve TypeScript and formatting issues in tests ([bbf68eb](https://github.com/camaradesuk/git-worktree-tools/commit/bbf68eb04b5f29313d95b9861603b88996071bfb))
* use cross-platform paths in getMainWorktreeRoot tests ([5e5cf08](https://github.com/camaradesuk/git-worktree-tools/commit/5e5cf08723a97290fa06ab8671c4d4762b46b59d))


### Features

* **lswt:** add interactive mode with worktree actions ([ed64835](https://github.com/camaradesuk/git-worktree-tools/commit/ed6483573ea0b505785f75318cf80345ccd86c7c))

## [1.2.1](https://github.com/camaradesuk/git-worktree-tools/compare/v1.2.0...v1.2.1) (2025-12-31)


### Bug Fixes

* **ci:** add build step to coverage job ([b48ce82](https://github.com/camaradesuk/git-worktree-tools/commit/b48ce822fae07d46604ec50f5599233662aff7a2))
* resolve commit_all bug by ensuring git operations use repository root as cwd ([0013f38](https://github.com/camaradesuk/git-worktree-tools/commit/0013f384d49864542c463fa3bf8bc04075408197))

# [1.2.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.1.1...v1.2.0) (2025-12-31)

### Bug Fixes

- improve error handling for checkout failures with conflicting changes ([daea760](https://github.com/camaradesuk/git-worktree-tools/commit/daea76020d3c2f6ad6d794b3629093831023b53e))
- remove misleading expected-to-fail comments from integration tests ([85807d2](https://github.com/camaradesuk/git-worktree-tools/commit/85807d273f858a22555cade31929237df4d9d15b))

### Features

- add initial configuration for worktree management ([9d198dc](https://github.com/camaradesuk/git-worktree-tools/commit/9d198dca34629ccf54b19bd58fc38af61a4b6425))
- enhance state detection and logging for newpr flow ([e70c4de](https://github.com/camaradesuk/git-worktree-tools/commit/e70c4de30f02bb7f48f0c0c69c5cdd0dcae179ae))

## [1.1.1](https://github.com/camaradesuk/git-worktree-tools/compare/v1.1.0...v1.1.1) (2025-12-30)

### Bug Fixes

- remove unnecessary peer dependencies from package-lock.json ([1956c31](https://github.com/camaradesuk/git-worktree-tools/commit/1956c314da5472d604e255d8146d74670f33b1d0))
- remove unsupported --json flag from gh pr create ([61b272f](https://github.com/camaradesuk/git-worktree-tools/commit/61b272f4432102339cae9c804261c1ee47849d56))

# [1.1.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.0.5...v1.1.0) (2025-12-30)

### Bug Fixes

- correct test mocks and pass cwd to isGitIgnored in validate-manifest ([107c292](https://github.com/camaradesuk/git-worktree-tools/commit/107c292c9b2897036a088eb65195b0d14a5f7ac6))
- exclude CLI entry points from coverage ([d710c2f](https://github.com/camaradesuk/git-worktree-tools/commit/d710c2f4c1c11e7ecdfe08b4a5d483e7578c837e))
- handle 'behind' state in newpr and pass cwd for wtlink gitignore check ([2a0226b](https://github.com/camaradesuk/git-worktree-tools/commit/2a0226be748c05b1fcb3c04bd23465e161a382f9))
- improve shellEscape to quote paths with slashes and special chars ([42f1e91](https://github.com/camaradesuk/git-worktree-tools/commit/42f1e9146ae68d4098a11481aeb57080d5e049ea))
- normalize path separators to forward slashes on Windows ([bf2cec9](https://github.com/camaradesuk/git-worktree-tools/commit/bf2cec9450633c1ce5c1697e818b9462dfb0d28f))
- resolve lint warnings and Windows test failures ([bf3b18a](https://github.com/camaradesuk/git-worktree-tools/commit/bf3b18a224b73eab62cfb9333d124e6278ab55c0))

### Features

- add worktree confirmation with safety warnings for wtlink ([7002c05](https://github.com/camaradesuk/git-worktree-tools/commit/7002c053f93d14f6db3ed8080af718a4850b00ac))

## [1.0.5](https://github.com/camaradesuk/git-worktree-tools/compare/v1.0.4...v1.0.5) (2025-12-29)

### Bug Fixes

- add stdin.resume() for wtlink manage on Ubuntu ([ebc0ecd](https://github.com/camaradesuk/git-worktree-tools/commit/ebc0ecdd629c26aae55cec4057a3239561ab4f5f))

## [1.0.4](https://github.com/camaradesuk/git-worktree-tools/compare/v1.0.3...v1.0.4) (2025-12-29)

### Bug Fixes

- **tests:** handle nullable getCurrentBranch return type ([907cf99](https://github.com/camaradesuk/git-worktree-tools/commit/907cf9921d33cc77164632116e4daeab86744ba4))
- **tests:** resolve Windows 8.3 short path and default branch issues ([66be848](https://github.com/camaradesuk/git-worktree-tools/commit/66be848e98ec0095d8caf3f6fd784b7e216a924b))

## [1.0.3](https://github.com/camaradesuk/git-worktree-tools/compare/v1.0.2...v1.0.3) (2025-12-29)

### Bug Fixes

- add publishConfig for public npm access ([60f6633](https://github.com/camaradesuk/git-worktree-tools/commit/60f66339aca9249ab8cefe41586c7379c9c99fd8))

## [1.0.2](https://github.com/camaradesuk/git-worktree-tools/compare/v1.0.1...v1.0.2) (2025-12-29)

### Bug Fixes

- **ci:** set npm access to public for scoped package ([01a1cf1](https://github.com/camaradesuk/git-worktree-tools/commit/01a1cf1813da4c215edc93f3fdb61e88b4442665))

## [1.0.1](https://github.com/camaradesuk/git-worktree-tools/compare/v1.0.0...v1.0.1) (2025-12-29)

### Bug Fixes

- **ci:** remove registry-url to fix npm auth conflict ([15d6c3f](https://github.com/camaradesuk/git-worktree-tools/commit/15d6c3f87c64e483268a93ba399b6c3421b8a8a4))
- **tests:** improve cross-platform path handling in integration tests ([68f92f5](https://github.com/camaradesuk/git-worktree-tools/commit/68f92f54ffa718587bcf9044f3290c15f8b00319))

# 1.0.0 (2025-12-29)

### Bug Fixes

- **security:** add shell escaping to github.ts and add error classes ([4a1f4bd](https://github.com/camaradesuk/git-worktree-tools/commit/4a1f4bd2216a4a97a3a5e9c9b8e581bf5ce89dd8))
- **tests:** cross-platform path comparison in config tests ([1443a97](https://github.com/camaradesuk/git-worktree-tools/commit/1443a973c2a5a33f69e6cd941706910ebe6bcfc8))
- update Node.js to 22 for semantic-release and fix macOS symlink test ([ae6d238](https://github.com/camaradesuk/git-worktree-tools/commit/ae6d23862cc5a79ea8f4af3e6199df3b8cf493df))

### Features

- add semantic-release, ESLint, Prettier, and CI improvements ([55cea7e](https://github.com/camaradesuk/git-worktree-tools/commit/55cea7ea0b8d124eb3c8cc9864e45ce953cd8809))
- initial implementation of git-worktree-tools ([6c53e94](https://github.com/camaradesuk/git-worktree-tools/commit/6c53e94fc4278016ad607192afc4c2137a8d4492))
- **wtlink:** add dependencies for interactive TUI ([3bbecd3](https://github.com/camaradesuk/git-worktree-tools/commit/3bbecd32d2c4a0bc54ff54b6f69c552468296684))
- **wtlink:** port full wtlink implementation with interactive TUI ([4618129](https://github.com/camaradesuk/git-worktree-tools/commit/46181295591d1f2042bd426b919c360cfc97ad88))
