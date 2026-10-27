# npm publishing

`release.yml` is the only publishing workflow. After successful push CI on `main`,
semantic-release determines the version from conventional commits, publishes the
package, updates the changelog and version files, and creates the GitHub release.
Maintainers can also run **Release** manually on `main`; it uses the same version
calculation and does not force a release when there are no releasable commits.
Release runs are serialized so manual and automatic runs cannot publish together.

## Configure before merging the OIDC migration

An npm package maintainer must open
[package settings](https://www.npmjs.com/package/@camaradesuk/git-worktree-tools/access)
and add this **GitHub Actions** trusted publisher:

| Field                     | Value                                   |
| ------------------------- | --------------------------------------- |
| Organization or user      | `camaradesuk`                           |
| Repository                | `git-worktree-tools`                    |
| Workflow filename         | `release.yml`                           |
| Environment name          | Leave blank; the job has no environment |
| Allowed actions, if shown | Allow direct `npm publish`              |

Use the filename alone, not `.github/workflows/release.yml`. Keep token publishing
access and the existing `NPM_TOKEN` secret until a real OIDC release is verified.
Saving the trusted publisher does not itself prove that publication works.

The workflow runs on GitHub-hosted Ubuntu with Node 22 (at least 22.14.0) and npm 11.11.0. The lockfile
already includes semantic-release 25.0.3 and its OIDC-capable npm plugin 13.1.4.
The workflow explicitly installs npm because the plugin launches the npm CLI from
PATH; its transitive npm dependency is not a top-level pnpm executable.
Only the release job receives `id-token: write`; its other write permissions
support the existing release commits, GitHub releases, and issue/PR notifications.
No npm authentication secret is passed to the release job. npm generates
provenance for trusted publications. Package consumers still support Node 18+.

## Verify a real release

1. Confirm the account-side trusted publisher has been saved before merging.
   Merge requires the owner's authorization; preparing this PR does not authorize it.
2. Let the next authorized, releasable change complete CI and **Release**. This
   CI-only migration need not produce a new version. Do not create dummy feature
   commits, tags, or version bumps to manufacture a test release.
3. Inspect the release log for `OIDC token exchange with the npm registry succeeded`
   and a successful npm publish. Confirm that the job at that SHA has no
   `NPM_TOKEN` or `NODE_AUTH_TOKEN` mapping.
4. Confirm the new npm version, its provenance linking to this repository and
   workflow run, and the corresponding GitHub tag/release. Record the version,
   commit, and run URL in the migration PR.

The PR packaging check uses the release Node/npm versions, but packing and a
semantic-release dry run do not prove that npm accepted an OIDC publication.
If authentication fails, check the exact publisher fields, job permissions, and
runner type before retrying. A release may already have created a commit or tag;
inspect the registry and GitHub state before any recovery. Do not blindly rerun,
delete tags, or republish an existing version.

## Retire credentials only after verification

After a successful OIDC publication, a package maintainer can select **Require
two-factor authentication and disallow tokens** in the package's publishing-access
settings. Trusted publishing continues to work with this restriction.

Check the old credential's scope and all consumers using secret names and token
metadata, never token values. Remove the repository `NPM_TOKEN` secret once it is
unused. Revoke the underlying npm token only if it is dedicated to this package
and has no other consumers; otherwise migrate those consumers separately before
revocation. Do not delete an organization-wide secret used by other repositories.

If rollback is needed before verification, the retained token can support an
explicitly reviewed workflow revert. Do not reintroduce a second publish path.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [semantic-release npm authentication](https://github.com/semantic-release/npm#npm-registry-authentication).
