# [1.10.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.9.0...v1.10.0) (2026-02-28)


### Bug Fixes

* **01-logger-wiring:** revise plans based on checker feedback ([2edf605](https://github.com/camaradesuk/git-worktree-tools/commit/2edf605863647d81fd4f11f02c472f1110a4eeae))
* **02-02:** replace raw unicode icons in link-configs.ts with colors.ts semantics ([b96bc00](https://github.com/camaradesuk/git-worktree-tools/commit/b96bc008bb5c6bda76b86f3572f62cf470ed1d15))
* **02-02:** replace remaining console.log(colors.error) in newpr.ts cancel path ([f1dad86](https://github.com/camaradesuk/git-worktree-tools/commit/f1dad86fabaf74b09e385bc65c0af3dbb9bfac9d))
* **02-03:** split checkout failure message into detail + hint ([5e5e69e](https://github.com/camaradesuk/git-worktree-tools/commit/5e5e69e5eeb2db602f1015e5f34a332f9ada0caf))
* **logger:** close audit file stream in _resetForTesting ([b8a48a8](https://github.com/camaradesuk/git-worktree-tools/commit/b8a48a813c37f3dfafb2b31d1e60bcbca9b1e5e8))
* **logger:** synchronously close audit stream fd for Windows compat ([9fddefc](https://github.com/camaradesuk/git-worktree-tools/commit/9fddefcd3d16d6053d7291cb77c1eaa5ebbf90e5))
* replace fixed 200ms sleep with polling in logger tests ([847394b](https://github.com/camaradesuk/git-worktree-tools/commit/847394b73b5e25eccd069dcb48a10891c2d87deb))
* **tests:** resolve CI failures on Windows and Ubuntu ([0033c24](https://github.com/camaradesuk/git-worktree-tools/commit/0033c24c599405119e234d4a8eaf1714ce481a7f))
* use path.join in XDG test assertions for Windows compatibility ([f5d46d9](https://github.com/camaradesuk/git-worktree-tools/commit/f5d46d982ea6f546f4425398b8699c45689efd3f))


### Features

* **01-01:** add getGlobalDataDir to constants.ts and make colors.ts mutable ([91636cb](https://github.com/camaradesuk/git-worktree-tools/commit/91636cbfccfbf80855f3bf24de94d2fc7874df9e))
* **01-01:** replace logger.ts with consola-based wrapper ([8641013](https://github.com/camaradesuk/git-worktree-tools/commit/8641013951943e377a6383edd9023003df0f64d2))
* **01-01:** update consumers to new consola-compatible logger API ([ef1ffb4](https://github.com/camaradesuk/git-worktree-tools/commit/ef1ffb44bfe6bb6d39c4b5f3395981c8ee39c047))
* **01-02:** add --verbose/--quiet/--no-color to all 4 legacy arg parsers ([1c8b3ac](https://github.com/camaradesuk/git-worktree-tools/commit/1c8b3aca768f1a702f4b7f6016601ea3fedf103c))
* **01-02:** forward logging flags from wt wrappers to child processes ([16ca52b](https://github.com/camaradesuk/git-worktree-tools/commit/16ca52b3f9572435535a1188aa374984c3a5294c))
* **01-02:** wire initializeLogger into all 4 legacy CLI entry points ([e7342e9](https://github.com/camaradesuk/git-worktree-tools/commit/e7342e97df19552ac18dad6824034fe7bc167507))
* **02-01:** create ui/error.ts for structured error display ([c21c531](https://github.com/camaradesuk/git-worktree-tools/commit/c21c53190e415732db88348487a68e22ffd4d800))
* **02-01:** create ui/index.ts barrel export for all UI primitives ([0cc4764](https://github.com/camaradesuk/git-worktree-tools/commit/0cc476445530fb88896ada41cdb4e770f9817732))
* **02-01:** create ui/output.ts JSON-mode-aware output gate ([c4445cc](https://github.com/camaradesuk/git-worktree-tools/commit/c4445cc6b3290ded83ea29ca8dc1fb09ee174b6a))
* **02-01:** create ui/spinner.ts as re-export of prompts.withSpinner ([3accc1b](https://github.com/camaradesuk/git-worktree-tools/commit/3accc1b4d125dc8f5a1dcadbf1826c96db13a1e1))
* **02-01:** create ui/status.ts with printStatus, printHeader, printSummaryBox ([002115b](https://github.com/camaradesuk/git-worktree-tools/commit/002115b8435c488559db5f47c7ad73bc5ab09dbe))
* **02-01:** create ui/table.ts for structured worktree table output ([0835f73](https://github.com/camaradesuk/git-worktree-tools/commit/0835f73dfe7e503bd16cfa4263d22d5cd434322d))
* **02-01:** create ui/theme.ts with centralized icons and box-drawing constants ([0d72db6](https://github.com/camaradesuk/git-worktree-tools/commit/0d72db6ff0ee1e68012db7fe8deba7ca69783086))
* **02-02:** add colored error output to wt.ts via printError ([ee41450](https://github.com/camaradesuk/git-worktree-tools/commit/ee4145055831a88f995101d6b1cce55698ea347e))
* **02-02:** wire setJsonMode() into all CLI init paths ([31f42af](https://github.com/camaradesuk/git-worktree-tools/commit/31f42afb789a71ae19d573cfff597864cd1fb5c6))
* **02-03:** add error hints to exitWithError() in newpr.ts ([d956a1c](https://github.com/camaradesuk/git-worktree-tools/commit/d956a1c3c139afd5f2cff1f807ece955502ecbc3))
* **02-03:** add hints to cleanpr.ts error paths ([778d8a8](https://github.com/camaradesuk/git-worktree-tools/commit/778d8a8f1ed8016ce8dd804740902f210aaf826b))
* **02-03:** add hints to newpr checkPrerequisites() ([a97e88d](https://github.com/camaradesuk/git-worktree-tools/commit/a97e88d85d4fd26c521ab6b4d4a022c8f2cb1cc8))
* **02-03:** add install hint to lswt GH CLI warning ([8e72f6a](https://github.com/camaradesuk/git-worktree-tools/commit/8e72f6ac10f6065aa5408053886d2cd2c90aaf30))
* **02-03:** standardize validate-manifest error to title+detail+hint ([73d66d7](https://github.com/camaradesuk/git-worktree-tools/commit/73d66d79271dab39665da41f7001627190e41060))
* **03-01:** replace runSubcommand with runSubcommandForResult and rewire wtlink actions ([bae03d3](https://github.com/camaradesuk/git-worktree-tools/commit/bae03d3360935ef1a4c96cc8f561017f2f8c7041))
* **03-03:** add global terminal safety net and fix prs Ctrl+C handling ([c3139ea](https://github.com/camaradesuk/git-worktree-tools/commit/c3139eab7f7da0a1e6822f07efb66e80a34b36dc))
* **04-01:** migrate prs JSON output to CommandResult<PrsResultData> ([2e5d956](https://github.com/camaradesuk/git-worktree-tools/commit/2e5d95636fbe8d6a447e13d79b5f278095ea586c))
* **04-01:** patch JSON error gaps in wtstate, wtlink, wt, and wtconfig CLIs ([5d34f93](https://github.com/camaradesuk/git-worktree-tools/commit/5d34f93eaa242de56a96ebcbc8f7505fcfd3a795))
* **04-01:** patch JSON error gaps in wtstate, wtlink, wt, and wtconfig CLIs ([1fece64](https://github.com/camaradesuk/git-worktree-tools/commit/1fece640b518a82ac4dc26a2a3d35e3d80f975b6))
* **04-02:** audit and fix help text for prs, link, init, new subcommands ([f524728](https://github.com/camaradesuk/git-worktree-tools/commit/f5247287a35990eddc7d85ec57f3818f81884a3e))
* **04-02:** audit and fix help text for state, clean, list, config subcommands ([47da4a0](https://github.com/camaradesuk/git-worktree-tools/commit/47da4a027a9430d3f58f33f16daf93dd97eb5329))
* **04-03:** add annotations, outputSchema, and enriched descriptions to MCP tools ([3d98e59](https://github.com/camaradesuk/git-worktree-tools/commit/3d98e59bb134acafd617e4c775700a877f2e1428))
* **04-04:** add prs and init to zsh/fish completions with all missing flags ([4c6d338](https://github.com/camaradesuk/git-worktree-tools/commit/4c6d338907ed91db5b1b695de471f1db7146dfff))
* **05-01:** migrate wt list and wt state from subprocess to direct library calls ([f796884](https://github.com/camaradesuk/git-worktree-tools/commit/f796884d4534a21d0e8f372322550cd8f6ce2315))
* **05-02:** migrate wt/clean.ts from subprocess to direct library calls ([2dec4ce](https://github.com/camaradesuk/git-worktree-tools/commit/2dec4ce93f08311e1aa03f215f770e35041c0eb7)), closes [#not-installed](https://github.com/camaradesuk/git-worktree-tools/issues/not-installed)
* **05-02:** migrate wt/config.ts from subprocess to direct library calls ([876e0c2](https://github.com/camaradesuk/git-worktree-tools/commit/876e0c2eb42e52cc17dd7f109e89060e8021042f))
* **05-03:** extract runNewprHandler and migrate wt/new.ts to direct library calls ([9487825](https://github.com/camaradesuk/git-worktree-tools/commit/94878256b7ad0949de39efd4720544db0b76063d))
* **05-03:** migrate wt/link.ts from subprocess to direct library calls ([358dd7f](https://github.com/camaradesuk/git-worktree-tools/commit/358dd7fb0eeb6cd6e93d36d238e46664b86259be))
* **05-04:** add deprecation notices to all legacy CLI entry points ([b42b5f4](https://github.com/camaradesuk/git-worktree-tools/commit/b42b5f4694aad6cdde9c136aaa388ec7e8449ae9))
* **05-04:** migrate interactive menu from subprocess to direct library calls ([70af18a](https://github.com/camaradesuk/git-worktree-tools/commit/70af18a68c48b18128aaed2fb8061c3184aea5bd))

# [1.9.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.8.0...v1.9.0) (2026-01-13)


### Bug Fixes

* **prs:** use actual PR branch name when creating worktree from TUI ([04c05dd](https://github.com/camaradesuk/git-worktree-tools/commit/04c05dd4163d6885808efd1a1bcc084cd3f12572))
* **test:** wait for menu items instead of header in PTY test ([d4acd04](https://github.com/camaradesuk/git-worktree-tools/commit/d4acd04032704d6596d26b599be2789c61d1cc7c))
* **windows:** handle file locking in config migration ([9b4fb68](https://github.com/camaradesuk/git-worktree-tools/commit/9b4fb6854b4ea572025019eacd93d366436390d9))
* **windows:** use copy+delete instead of rename for atomic writes ([ffa9599](https://github.com/camaradesuk/git-worktree-tools/commit/ffa9599c763d7cefe51d9432a9bfd85de14bddec))


### Features

* **config:** add config migration system with version tracking ([ff3cb85](https://github.com/camaradesuk/git-worktree-tools/commit/ff3cb85a66db3d22ca3bf6dbccccc6414d1c3f54))
* **newpr:** add hook confirmation wizard and AI plan document generation ([8f7ce63](https://github.com/camaradesuk/git-worktree-tools/commit/8f7ce6398817d5f3053d23001bfb590c5c74a72f))

# [1.8.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.7.0...v1.8.0) (2026-01-12)


### Bug Fixes

* address PR review comments for security and correctness ([b07586b](https://github.com/camaradesuk/git-worktree-tools/commit/b07586b1fe4c12a1561440ab1e8d049e92571d5a))
* address PR review comments for unused imports and variables ([a87af6d](https://github.com/camaradesuk/git-worktree-tools/commit/a87af6dd6c5cad68447a3dfda596c5cd5808c23e))
* default to not warning for local installations ([84fe92a](https://github.com/camaradesuk/git-worktree-tools/commit/84fe92a972d20045cd576dd3bd3040457afc1b94))
* improve CI reliability with timeouts and Node 18 exclusions ([5c34d4e](https://github.com/camaradesuk/git-worktree-tools/commit/5c34d4e37a7ebd0214900324e97893ab53216b5a))
* relax dry-run test assertion for Windows compatibility ([a0fed5a](https://github.com/camaradesuk/git-worktree-tools/commit/a0fed5a820b253f6de2449bca7db0bd85bc93d58))
* skip gh authentication tests on Windows CI ([16f2bfe](https://github.com/camaradesuk/git-worktree-tools/commit/16f2bfec1a3d792d5df98a826ba2d02831c83432))
* skip PTY tests on macOS and Windows CI ([99ec6bd](https://github.com/camaradesuk/git-worktree-tools/commit/99ec6bdc104a903a4ca57291dcff4b22ed2c1c17))
* suppress global install warning in e2e tests ([88e6f6c](https://github.com/camaradesuk/git-worktree-tools/commit/88e6f6c0c799dcf11aab983b9f587a0d25eb1f2f))


### Features

* comprehensive TUI UX improvements ([0a61ade](https://github.com/camaradesuk/git-worktree-tools/commit/0a61ade7ebe686feba724955f8baf8a79eef5277))
* Improve the UX further ([436406b](https://github.com/camaradesuk/git-worktree-tools/commit/436406b7f9de0bd1dfbbc563d003d18b8705534c))
* **wtlink:** merge .wtlinkrc manifest into .worktreerc config ([9073624](https://github.com/camaradesuk/git-worktree-tools/commit/907362415492bda0cf023347082aa340af5c501f))

# [1.7.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.6.0...v1.7.0) (2026-01-05)


### Bug Fixes

* address PR [#14](https://github.com/camaradesuk/git-worktree-tools/issues/14) code review issues ([1cb8fce](https://github.com/camaradesuk/git-worktree-tools/commit/1cb8fce6289663b4eed5c32081264d8ea79eaa2e))
* address PR review comments (Sentry + Copilot) ([72cb9cf](https://github.com/camaradesuk/git-worktree-tools/commit/72cb9cf01747ccb406fe2e1f6b617a907ed43521))


### Features

* add three-tier config, logging system, and fix PR review bugs ([8c50574](https://github.com/camaradesuk/git-worktree-tools/commit/8c505744a537807f2e40bbe7ad53aa20c75caea9))
* This is to improve the UX of the tools significantly by adding a unified wt cli with interactive menu that covers all the tools. It also fixes several bugs. ([109b9e8](https://github.com/camaradesuk/git-worktree-tools/commit/109b9e8ba3dbf7a9b06bb3afe82b9e543ac58b12))

# [1.6.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.5.0...v1.6.0) (2026-01-05)


### Bug Fixes

* address PR review comments ([ebdc2a3](https://github.com/camaradesuk/git-worktree-tools/commit/ebdc2a398fb96e747ac7633836d405cb72d40c6c))
* address PR review comments ([d2c3309](https://github.com/camaradesuk/git-worktree-tools/commit/d2c3309657740c213024da4de0eed34a9908b26f))
* **ux:** resolve 5 UX issues with regression tests ([1306b2b](https://github.com/camaradesuk/git-worktree-tools/commit/1306b2bc681d376a572cb653476d72339e3e7758))


### Features

* **cli:** add unified wt command with shell completion ([0175212](https://github.com/camaradesuk/git-worktree-tools/commit/017521245332269058a6183bfd3f82341626e84c))
* **lswt:** add fuzzy search in interactive mode ([04c01c0](https://github.com/camaradesuk/git-worktree-tools/commit/04c01c064b63c5b4382dffa7c77714f0b9bf4e7f)), closes [#42](https://github.com/camaradesuk/git-worktree-tools/issues/42)
* UX overhaul ([ff4707d](https://github.com/camaradesuk/git-worktree-tools/commit/ff4707d0ad908da751ae29f66c2e27aa17dfe704))
* **ux:** complete UX improvement batch 4 ([431042c](https://github.com/camaradesuk/git-worktree-tools/commit/431042cde137fde3495ad20f5151566f5e734e38))

# [1.5.0](https://github.com/camaradesuk/git-worktree-tools/compare/v1.4.1...v1.5.0) (2026-01-03)


### Bug Fixes

* address PR review comments ([bf08444](https://github.com/camaradesuk/git-worktree-tools/commit/bf0844404947c33f644b30e7dea58dbd9ba4a0c0))
* handle Windows backslash paths in getRepoName ([aefef73](https://github.com/camaradesuk/git-worktree-tools/commit/aefef73b7ed56b3b9aa4721f08184a549da38126))
* normalize line endings in e2e tests for Windows ([b1f3bfb](https://github.com/camaradesuk/git-worktree-tools/commit/b1f3bfbf04530a4837cc61cf2184fd0a72ed704d))
* replace remaining execSync calls with safe git.exec ([57d80ae](https://github.com/camaradesuk/git-worktree-tools/commit/57d80ae867337033ad2afab8571611969f43f414))
* resolve merge conflicts with main branch ([9f89d63](https://github.com/camaradesuk/git-worktree-tools/commit/9f89d639216e660fe47399810c6937fd605d9ff4))
* use spawnSync for cross-platform git command execution ([896eb88](https://github.com/camaradesuk/git-worktree-tools/commit/896eb88bf2d20a32ee9ccbba6709e4d8fb0dbf42))


### Features

* **api:** expose remote PR fields and add remotePrCount stat ([72c071e](https://github.com/camaradesuk/git-worktree-tools/commit/72c071e62b3983657ffcc9ce0ac716d731628cbf))
* fix newpr ([0ff7e95](https://github.com/camaradesuk/git-worktree-tools/commit/0ff7e951bf80b6a68c642e635cad16c3ed1a8503))
* **lswt:** compute badge width dynamically for consistent alignment ([f59fc4d](https://github.com/camaradesuk/git-worktree-tools/commit/f59fc4de10afc5bd05c4522d1d57f6bc88eb7461))
* **lswt:** show remote PRs without local worktrees ([1b36353](https://github.com/camaradesuk/git-worktree-tools/commit/1b363534c0a232a530411838328037de1662c631)), closes [#N](https://github.com/camaradesuk/git-worktree-tools/issues/N)

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
