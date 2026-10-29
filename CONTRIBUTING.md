# Contributing

Use x86_64 Linux with Nix 2.24+ and `nix-command` and `flakes` enabled. The
development shell supplies Node.js 22/npm, Pulumi, Git, OpenSSH and the installer;
the provider shell additionally supplies Python and Go. Install Nix first.

## Build and test

From the repository root:

```sh
nix develop .#provider
npm ci --ignore-scripts
npm run check
npm test
```

`npm test` runs the component and CLI tests, then installs the package tarball in
an independent consumer project to check its imports, declarations and templates.

For the multi-language component provider, use `nix develop .#provider` and run
`npm run test:provider` after building. This adds Python and Go and exercises
generated SDKs through a locally installed plugin. The full suite includes this
test. Keep the provider workspace private. The existing `release.yml` workflow
publishes only the original TypeScript package. The separate, manually gated
`provider-release.yml` workflow prepares and publishes reviewed multi-language candidates; see
[provider publication](docs/provider-publication.md) before using a publishing target.

The CI `provider-artifacts` job depends on full validation, then runs
`npm run provider:prepare` and `npm run provider:verify`. It uploads preview files
without publishing. See [multi-language preparation](docs/multilanguage.md) for the
locked build inputs, two-build reproducibility check and SDK naming contract.

For changes to installation, SSH policy, disk layout or lifecycle handling, run
the full suite:

```sh
./scripts/validate.sh
```

It also evaluates and builds NixOS, runs VM checks, checks SSH behavior and
exercises the Pulumi engine against local substitute providers. Allow time and
disk space for Nix builds; cached outputs may be reused.

Hosted jobs target `ubuntu-24.04` deliberately. The pinned artifact actions use
Node.js 24; this is separate from the Node.js 22 environment supplied by Nix for
the package itself. Review runtime requirements and artifact compatibility when
upgrading actions, and keep their full commit SHA pins.

## Changes and bug reports

Add regression coverage when fixing a functional or security defect. Keep examples
self-contained and use synthetic credentials and temporary state in tests.

For a bug report, include the command, error code, tool versions and a minimal
redacted configuration. Omit tokens, private keys, Pulumi state exports and raw
logs containing sensitive data. See [SECURITY.md](SECURITY.md).

Boot and SSH defaults live in packages/nixos-vps/templates/nixos/base.nix; the
disk layout lives beside it. Update these shared files rather than adding a
second host-specific copy. The full suite compares the shipped template with
the repository example and boots the template in a VM.

Keep documentation commands aligned with the CLI. Changes to the templates should
also be checked through the independent tarball workflow.

## Release preparation

Published versions cannot be overwritten. For a future release,
follow the [provider publication guide](docs/provider-publication.md) for the
multi-language SDKs. The commands in this section apply only to `nixos-vps`.
For that component, choose a new version, update package metadata and the lockfile,
and commit the changes. Keep the workspace root private. The release package defaults to the
public npm registry and the experimental `next` tag. Tags do not prove stability;
the registry may also assign `latest` during a first publication.

### Prepare one inspected artifact

From a clean checkout on x86_64 Linux:

```sh
nix develop
npm ci --ignore-scripts
npm run release:prepare
```

This command runs the full validation suite, including `npm ci --ignore-scripts`,
builds the tarball, and performs an npm publish dry run. Each failure stops the
process. It writes the tarball and a manifest containing its version, source
commit and SHA-512 integrity into the ignored `.release/` directory. It does not
publish, log in or provision cloud resources. Keep the manifest with the artifact.
Validation may reuse successful Nix store builds and VM checks.

### Manual publication

`npm whoami` confirms the session, not permission to publish. npm also requires
account 2FA for interactive publishing. Configure 2FA in your npm account, save
recovery codes securely and authenticate locally. Do not share codes or tokens.

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

Review the artifact and manifest and require successful CI for their exact commit.
Only when intentionally publishing, replace VERSION below with that version:

```sh
npm publish .release/nixos-vps-VERSION.tgz --ignore-scripts --access public --tag next --registry=https://registry.npmjs.org/
npm run release:verify
```

Complete npm's interactive verification. An E403 about 2FA means authentication
was insufficient; do not change the package version to fix authentication.

### Confirm availability before announcing

A successful publish submission can still be processing. A `0.0.0-stage`
placeholder is not the requested release. `release:verify` waits for the version
and `next` tag, compares registry integrity with the prepared manifest, then
downloads the public tarball and verifies its bytes. It exits unsuccessfully if
processing remains pending, metadata requests fail or integrity differs. The default
processing wait is ten minutes. To allow up to thirty minutes, use:

```sh
npm run release:verify -- --wait-seconds 1800
```

Each metadata request has a bounded timeout. Pending processing is reported as
`RELEASE_PENDING`, with a recovery instruction in the GitHub job summary. It does
not mean that the preceding publication submission failed.
It never republishes, approves a stage or changes a tag. Re-run verification later
if processing is pending; do not repeat publication or bump a version to bypass it.

For GitHub recovery, use **Actions → Verify npm release → Run workflow** on
`main`. Enter the original publication's run ID (the number at the end of its
`/actions/runs/NUMBER` URL) and exact version, for example `0.1.1`. The workflow
retrieves that run's `npm-release` artifact and checks its repository, workflow,
branch, commit and version before comparing public npm bytes. It never builds,
publishes, approves a stage or changes distribution tags. It needs only read
permissions; no npm credentials, OIDC permission or environment approval.

Leave **require_next** disabled for an older release whose `next` tag may have
moved. Enable it when verifying the current experimental channel. The original
publication workflow and local `release:verify` still require `next` by default.
For equivalent historical verification locally:

```sh
npm run release:verify -- --version-only
```

If the original artifact has expired (workflow retention is seven days), restore
the original saved tarball and manifest locally. Do not rebuild an artifact and
present it as the original release. Verify-only recovery runs the current code
from `main`, so push fixes before starting a new recovery run; re-running an old
job uses that old execution's workflow.

Check npm notifications and the account's Staged Packages tab. If there is an
explicit staged submission, review it before approving with 2FA. A placeholder
alone does not prove manual approval is required. If no action is shown and
processing remains unresolved, contact npm support. For CLI staging inspection,
use npm 11.15.0 or newer; it is not required by the component itself.

After verification, create the matching Git tag and GitHub release from the
manifest commit, and update consumer installation instructions. Do not announce
availability based only on CLI submission success. See npm's
[2FA requirements](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/),
[staged publishing](https://docs.npmjs.com/staged-publishing/) and
[trusted publishing](https://docs.npmjs.com/trusted-publishers/).

### Optional manual GitHub workflow with OIDC

`.github/workflows/release.yml` runs only through **Run workflow** on `main`.
It defaults to preparation only. Its preparation job runs the full suite and
uploads the exact tarball and manifest. The publishing job consumes that artifact,
checks its commit and integrity and refuses an already published version.
It does not rebuild the package. Publishing uses a pinned npm CLI supporting
OIDC and provenance, followed by registry verification.

Before enabling publishing, configure these external settings yourself:

1. Create the GitHub environment `npm`, restrict it to `main` and configure a
   required reviewer so publishing requires approval. Verify those protection
   settings; a workflow file cannot enforce them by itself.
2. In npm's Trusted Publisher settings for `nixos-vps`, select GitHub Actions:
   user `sgomezsal`, repository `nixos-vps`, workflow `release.yml`, environment
   `npm`. Allow direct publishing. No npm token is needed in GitHub secrets.
3. Set the GitHub repository variable `NPM_RELEASE_ENABLED` to `true` only after
   the protection and trust settings are configured. Leave it unset to keep the
   publishing job disabled.
4. For a new committed version, manually run the workflow on `main`, selecting
   `publish: true`, then review and approve the environment job.

Only the publishing job requests `id-token: write`; preparation has read-only
repository permissions. The regular validation workflow never publishes.
OIDC publishing and environment protections require external setup. They were
exercised by the hosted 0.1.2 release; local tests cover workflow guards rather
than the external account settings. See [validation coverage](docs/validation.md).
Neither workflow accesses Hetzner.

### Distribution channels

`next` and `latest` are independent npm tags. Publishing with `--tag next` does
not move `latest`. The default package page and an unqualified installation can
therefore show an older version. Use an exact version such as `nixos-vps@0.1.2`
or the `next` channel intentionally. Changing `latest` is a separate release
decision, not a workaround for processing delays.

After CI, original-artifact verification and consumer checks pass, a maintainer
can promote the reviewed version without republishing it:

```sh
npm dist-tag add nixos-vps@0.1.2 latest --registry=https://registry.npmjs.org/
npm view nixos-vps dist-tags --registry=https://registry.npmjs.org/
```

This requires npm authentication and any additional verification requested by npm.
It changes a distribution pointer, not the tarball or the `next` tag. `latest`
means the recommended default installation; it is not a production-readiness
guarantee. Keep the supported scope and validation limits visible.

### Documentation in published packages

GitHub documentation changes with the repository. npm and PyPI pages retain the
README and descriptive metadata bundled in their published versions. Editing
those source files does not update an existing registry artifact. Include the
reviewed documentation in the next explicitly authorized release with a new
version; never overwrite a release or present a rebuilt tarball as the original.
