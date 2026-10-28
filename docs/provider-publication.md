# Multi-language prerelease publication

The experimental `0.2.0-dev.0` provider and its SDKs are published. See
[installation](multilanguage.md#install-the-published-prerelease) and
[verified distribution](validation.md#multi-language-prerelease-distribution).
`nixos-vps@0.1.2` is a separate TypeScript component and remains unchanged.

## Next candidate

`0.2.0-dev.1` is being prepared to validate the configured npm trusted publisher
through a real GitHub Actions OIDC upload. Its matching plugin and SDK artifacts
use the same source commit; publication and provenance are not verified yet.
The installer still delegates to `nixos-vps@0.1.2`. This release does not create,
replace or update a Hetzner server.

## Prepare without publishing

Use x86_64 Linux and the locked provider shell:

```sh
nix develop .#provider
npm ci --ignore-scripts
npm run check
npm test
npm run provider:candidate
npm run provider:candidate:verify
```

Preparation refuses an existing `.provider-candidate/` directory. It builds all
six artifacts twice, compares their SHA-256 values, and tests the resulting
plugin and SDK archives through the real Pulumi engine with loopback substitute
providers. No registry upload, tag, GitHub release or cloud operation occurs.
Keep a previous candidate in another directory instead of overwriting it.

Ordinary `provider:prepare` continues to create publication-disabled previews in
`.provider-release/`. A publication candidate is different: its npm SDK has
`private: false` and its manifest has `publishable: true`. These indicate artifact
format, not authorization to upload. The workspace root and provider workspace
remain private. Publication guards reject previews, dirty source trees and
candidates from another commit.

The generated Go module is committed under `sdk/go/nixosvps`. Regenerate it from
the schema when changing the API or SDK generator, then copy its locked
`go.mod`/`go.sum` from `packages/nixos-vps-provider/go-lock`. Candidate preparation
and publication check that the committed module matches the archive exactly.
The source archive alone is not a publicly resolvable Go module.

## GitHub workflow and approvals

`.github/workflows/provider-release.yml` supports manual dispatch on `main` only.
It first requires a successful `ci.yml` run for the same commit. Its default
target is `prepare`: build, test and upload a candidate to GitHub Actions, without
publishing packages or creating release tags.

Publishing jobs additionally require repository variable
`PROVIDER_RELEASE_ENABLED=true` and approval of the destination's environment:

| Target | Environment | Write permissions |
| --- | --- | --- |
| `prepare` | none | none |
| `github` | `provider-release` | repository contents, for assets and tags |
| `npm` | `npm` | OIDC for the scoped SDK |
| `pypi` | `pypi` | OIDC for Python distributions |

Keep the variable `false` until release review is complete. Environments must
require an explicit maintainer approval and allow only the `main` branch. A solo
maintainer may approve their own dispatch; this is a manual checkpoint, not
independent two-person review. Repository administrators can change protection
settings, so access to administration remains part of the trust boundary.

Each dispatch publishes at most one destination. This makes recovery independent
across registries; publication across GitHub, npm and PyPI is not atomic.
Keep `main` at the reviewed release commit until all destinations are verified;
the same version cannot be published from a later source commit.
Publication rebuilds reproducibly at the selected commit and tests the exact
files before downloading them into a protected publishing job. No checkout
credentials are persisted, actions are pinned to commit SHAs, and preparation
does not receive an OIDC or repository-write permission.

## Registry configuration

The PyPI account owner configures a pending GitHub trusted publisher with:

| Field | Value |
| --- | --- |
| Project | `pulumi-nixos-vps` |
| GitHub owner | `sgomezsal` |
| Repository | `nixos-vps` |
| Workflow filename | `provider-release.yml` |
| Environment | `pypi` |

The filename and environment must match exactly. A pending publisher neither
publishes nor reserves the name. PyPI authentication is OIDC; no PyPI API token
is stored in GitHub. See [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/).

An npm login as `sgomezsal` provides access to the personal scope, but is not a
trusted-publisher configuration for `@sgomezsal/nixos-vps`. The automated `npm`
target requires a trusted publisher for this repository, `provider-release.yml`
and environment `npm`. That relationship is configured for the scoped package
with publishing permission; an actual npm OIDC upload remains untested.

For a package that does not yet exist, its first authenticated publication is a
separate maintainer-authorized bootstrap step. Do not upload a placeholder or
publish the original `nixos-vps` package instead. Use the validated candidate tarball with public access and the
`next` tag. Afterwards configure OIDC and restrict token-based publishing.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

No registry authorization is inferred from local compilation, an available name
or an npm login. The first PyPI OIDC upload is verified in the
[distribution evidence](validation.md#multi-language-prerelease-distribution).
The initial npm upload used interactive authentication; npm OIDC remains untested.
Keep the publication gate disabled until prerequisites and candidate review are complete.

## Future publication order

For a new, explicitly authorized release, first choose an unused version and
update the provider metadata, generated SDKs and their version assertions. The
versions below describe the first prerelease; do not republish it. Keep the
source commit fixed across all destinations.

After explicit release authorization:

1. Run `prepare` and review the candidate, source commit and checksums.
2. Enable the repository variable and dispatch target `github`. Approve the
   `provider-release` environment. The job creates the plugin prerelease
   `v0.2.0-dev.0`, uploads verified assets while it is still a draft, publishes it
   as a prerelease, and only then creates Go tag
   `sdk/go/nixosvps/v0.2.0-dev.0`. It checks public Go module resolution and compares
   the downloaded source against the candidate.
3. Complete the npm bootstrap/trust setup if needed. Dispatch `npm` and approve
   the `npm` environment. The scoped SDK uses version `0.2.0-dev.0` and tag `next`;
   this does not promote or replace the original package's `latest` tag.
4. Dispatch `pypi` and approve its environment. PyPI receives the wheel and source
   distribution as version `0.2.0.dev0`, with OIDC attestations enabled.
5. Review each verification result, then disable the repository variable again.

The npm and PyPI jobs require the matching public plugin prerelease first, so
their users do not receive an SDK pointing to a missing plugin. The prerelease
supports Linux amd64 only and requires Node.js even from Python and Go.

## Verification and recovery

Registry verification downloads the actual npm/PyPI artifacts and compares their
SHA-256 with the candidate. To repeat this read-only check after a publication:

```sh
node scripts/provider-publish.cjs verify .provider-candidate npm
node scripts/provider-publish.cjs verify .provider-candidate pypi
```

An identical existing npm version is verified and skipped. A staging placeholder
is pending, never success; do not republish or bump the version to bypass registry
processing. The verifier polls for a bounded interval and fails honestly if the
files remain unavailable. PyPI retries verify each existing distribution and
stage only missing files, rather than using `skip-existing` to hide conflicts.

GitHub retries accept only tags pointing to the expected commit and assets with
matching digests. Interrupted draft uploads may resume; conflicting files are
never replaced. An incomplete already-public GitHub release requires manual
investigation, rather than silently adding files. If Go proxy propagation is
delayed, inspect the existing tags and retry the same commit; do not retag.

A later source change requires a new version and reviewed tags. Never overwrite
published versions to make a retry pass. Hosted preparation is distinct from an
actual registry upload, OIDC authorization and live Hetzner deployment; none of
the latter is established by mocked publication tests.
