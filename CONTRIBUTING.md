# Contributing

Use x86_64 Linux, Node.js 22 or newer, and Nix with `nix-command` and `flakes`
enabled. The development shell supplies Node, Pulumi, SSH and the installer.

## Build and test

From the repository root:

```sh
nix develop
npm ci --ignore-scripts
npm run check
npm test
```

`npm test` runs the component and CLI tests, then installs the package tarball in
an independent consumer project to check its imports, declarations and templates.

For changes to installation, SSH policy, disk layout or lifecycle handling, run
the full suite:

```sh
./scripts/validate.sh
```

It also evaluates and builds NixOS, runs VM checks, checks SSH behavior and
exercises the Pulumi engine against local substitute providers. Allow time and
disk space for Nix builds; cached outputs may be reused.

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

Version 0.1.0 is already published and cannot be overwritten. For a future release,
choose a new version, update package metadata and the lockfile, and commit the
changes. Keep the workspace root private. The release package defaults to the
public npm registry and the experimental `next` tag. Tags do not prove stability;
the registry may also assign `latest` during a first publication.

### Prepare one inspected artifact

From a clean checkout on x86_64 Linux:

```sh
nix develop
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
processing remains pending, metadata requests fail or integrity differs.
It never republishes, approves a stage or changes a tag. Re-run verification later
if processing is pending; do not repeat publication or bump a version to bypass it.

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
OIDC publishing and environment protections require external setup and have not
been exercised by local tests. Neither workflow accesses Hetzner.
