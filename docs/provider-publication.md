# Multi-language publication

The `0.2.0` provider and its SDKs are published. See
[installation](multilanguage.md#install-the-published-release) and
[stable publication evidence](validation.md#stable-020-publication).
`nixos-vps@0.1.2` is a separate TypeScript component and remains unchanged.

## Earlier OIDC prerelease

`0.2.0-dev.1` passed GitHub, npm and PyPI publication from the same reviewed
commit. The npm upload used the configured trusted publisher and generated SLSA
provenance; actual registry downloads matched the candidate. See
[executed evidence](validation.md#npm-oidc-prerelease), including the npm
processing delay and verification-only retry. This did not access Hetzner or
change a VPS. The publication gate is disabled again.

## Stable 0.2.0 preparation

This section records preparation before publication of **`0.2.0`**. At that
point registries served `0.2.0-dev.1` / Python `0.2.0.dev1`. The stable release
subsequently passed [publication checks](validation.md#stable-020-publication);
Registry listing approval remains separate. The channel workflow passed
[hosted CI](https://github.com/sgomezsal/nixos-vps/actions/runs/40742650068).

The release source updates provider/schema/runtime metadata and lockfile root
versions, adds the Registry presentation, and regenerates the Go SDK. The
sixteen-input/six-required/two-output contract and delegated `nixos-vps@0.1.2`
implementation remain unchanged. Artifacts and public-consumer smoke tests now target published `0.2.0`.

Fresh creation through the published TypeScript,
[Python](validation.md#fresh-python-installation) and
[Go](validation.md#fresh-go-installation) SDKs passed in separately authorized
live tests, including reboot and unchanged repeat update. Go ran in Nuremberg
after Helsinki capacity blocked the first attempt and a location change was
explicitly approved. These results retain their CX23/BIOS and recovery limits;
this guide does not authorize another deployment or replacement.

### API and compatibility

The proposed contract retains `nixos-vps:hetzner:NixosServer`, all sixteen
inputs, six required inputs, and the `ipv4`/`serverId` outputs. The checked-in
`api-baseline.json` and provider tests check the schema against the shared
component. Retain the current package names, child logical names and default
values for this release; changing a server default can change infrastructure.
Examples should continue selecting an offered plan explicitly.

Keep `nixos-vps@0.1.2` as the delegated implementation unless a separately
reviewed defect requires changing it. The remote SDK is a separate interface:
plain absolute paths, no direct child-resource access, and no guarantee for
legacy callback transformations. Follow the existing
[migration limits](multilanguage.md#migration-limits) rather than treating SDK
replacement as an automatic migration. `ipv4` signals installation readiness;
`serverId` alone does not.

The intended platform remains x86_64 Linux with Node.js 22+, Nix and OpenSSH,
including for Python and Go. Stable version numbering would not expand platform
support or prove untested recovery paths.

### Release evidence and remaining gates

| Area | Current evidence | Remaining boundary |
| --- | --- | --- |
| API | Schema/baseline, adapter tests and persisted migration evidence passed; `0.2.0` retains resource identity | Remote SDK migration has [documented limits](multilanguage.md#migration-limits) |
| Live TypeScript | Published `0.2.0-dev.1` fresh installation, reboot and unchanged repeat deployment passed | Recorded [CX23/BIOS scope](validation.md#fresh-provider-installation); not a new `0.2.0` deployment |
| Live Python | Published `0.2.0.dev1` fresh installation, reboot and unchanged repeat update passed | Same CX23/BIOS and version limits |
| Live Go | Published `v0.2.0-dev.1` fresh installation, reboot and unchanged repeat update passed in Nuremberg | Same CX23/BIOS and version limits |
| Versioning | `0.2.0` plugin/SDKs and `nixos-vps@0.1.2` implementation are published | Keep the interface and implementation version lines distinct |
| Publication channels | [Stable publication](validation.md#stable-020-publication) passed GitHub/Go, npm and PyPI checks | Future versions require their own candidate review and approval |
| Artifacts | Two independent builds matched; all six hosted artifacts matched the local candidate | Preserve the original manifest and release assets |
| Public Registry | Local and hosted community package checks passed for [PR #13250](https://github.com/pulumi/registry/pull/13250) | Pulumi maintainer approval, merge and final hosted page verification remain pending |

### Channel policy

The version determines the release channel; the manual workflow's `channel`
selection must agree with it. The default remains `prerelease`. Unsupported
version forms and a missing or mismatched channel fail before publication.

| Version | Required channel | GitHub release flag | Scoped npm tag |
| --- | --- | --- | --- |
| `X.Y.Z-dev.N` | `prerelease` | prerelease | `next` |
| `X.Y.Z` | `stable` | normal release | `latest` |

Selecting `stable`, enabling publication and approving the `npm` environment
explicitly authorizes publishing that stable SDK to `latest`. It affects only
`@sgomezsal/nixos-vps`, not the original unscoped component. GitHub releases
continue using `make_latest: false`: GitHub's featured-release selection is a
separate decision from the npm dist-tag.

The same policy checks existing GitHub release flags before writes, rejects a
plugin from the wrong channel before any SDK upload, and supplies npm's tag
through the guarded preflight output. Matching-byte npm verification also
requires the expected tag to point to the candidate version. A version that
already exists with another tag is not republished or automatically retagged:
inspect the registry and authorize any tag repair separately. Verification may
be retried after registry propagation; it fails if the tag never agrees.

Keep exact-commit checks, destination approvals, matching-byte verification and
the publication gate disabled until the final release is approved. The stable
channel has local test coverage, not evidence of a real stable upload.

Do not remove `private: true` from the workspace root or provider workspace.
The generated publication candidate enables only the consumer npm SDK; those
private workspaces are not packages users should publish.

### Public Pulumi Registry preparation

The public Registry is a discovery/documentation step separate from npm, PyPI
and GitHub publication. Follow the current
[Pulumi publication guide](https://www.pulumi.com/docs/iac/guides/building-extending/packages/publishing-packages/)
when preparing the submission. The intended repository entry is:

```json
{
  "repoSlug": "sgomezsal/nixos-vps",
  "schemaFile": "packages/nixos-vps-provider/schema.json"
}
```

The schema now declares `displayName: nixos-vps`, `publisher: sgomezsal`, and
component/infrastructure discovery keywords. The [Registry overview](_index.md)
contains front matter, installation commands, the three checked-in examples, all
sixteen inputs, credential requirements and tested boundaries. Its instructions
target the published `0.2.0` version.

The upstream check found no `sgomezsal` publisher entry. The submitted request
adds the repository/schema entry above and the mapping
`"sgomezsal": "sgomezsal"` in
[`tools/resourcedocsgen/pkg/publishers/publisher-names.json`](https://github.com/pulumi/registry/blob/master/tools/resourcedocsgen/pkg/publishers/publisher-names.json).
The request is [pulumi/registry#13250](https://github.com/pulumi/registry/pull/13250),
opened on 2026-10-29 UTC. Its diff contains only the package entry and publisher
mapping; it includes no generated documentation or package YAML.

The Registry's own local checker returned `pass` against public `v0.2.0`:
documentation generation, plugin installation, all three SDK resolutions,
publisher registration, schema version and overview lint passed. Its 135 unit
tests also passed. Full site lint/build was not run; the upstream `mise` setup
failed while compiling Node on Nix. Scoped validation used the existing Nix tools,
the required Go toolchain and an isolated Python environment instead. Local checks
do not establish hosted Registry rendering or listing approval. The subsequent
[hosted community check](https://github.com/pulumi/registry/actions/runs/40805963517)
also passed. Pulumi maintainer review, merge and final hosted page verification
remain pending; do not treat an open PR as an accepted listing. See
[submission evidence](validation.md#pulumi-registry-submission).

Channel-aware publication passed local regression tests and hosted CI.
Version metadata and Registry content are prepared. Exact-candidate generation,
hosted CI and registry uploads passed the linked stable publication checks.
Registry submission and hosted rendering remain external gates. Fresh
TypeScript/Python/Go cloud evidence records the tested prerelease separately.

The channel review passed the complete `./scripts/validate.sh` suite, including
54 core tests, 24 provider tests, independent package/engine consumers and workflow
syntax validation. Channel regression tests cover explicit authorization, both
GitHub channels and interrupted retries, npm tag verification/repair refusal,
stable PyPI resolution and workflow wiring. These use substitute APIs; they do
not upload releases or replace the separately executed live tests. See the
[validation record](validation.md#release-channel-review) for execution boundaries.

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
target is `prepare` and default channel is `prerelease`: build, test and upload a
candidate to GitHub Actions, without publishing packages or creating release tags.

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
with publishing permission. A real OIDC upload and provenance verification passed
for `0.2.0-dev.1`.

For a package that does not yet exist, its first authenticated publication is a
separate maintainer-authorized bootstrap step. Do not upload a placeholder or
publish the original `nixos-vps` package instead. Use the validated candidate tarball with public access and the
`next` tag. Afterwards configure OIDC and restrict token-based publishing.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

No registry authorization is inferred from local compilation, an available name
or an npm login. The first PyPI OIDC upload is verified in the
[distribution evidence](validation.md#multi-language-prerelease-distribution).
The initial `0.2.0-dev.0` npm upload used interactive authentication; the
subsequent `0.2.0-dev.1` upload verified npm OIDC and provenance.
Keep the publication gate disabled until prerequisites and candidate review are complete.

## Future publication order

For a new, explicitly authorized release, choose an unused version and its
matching channel, then update the provider metadata, generated SDKs and version
assertions. Keep the source commit fixed across all destinations. Use the same
`channel` for every dispatch; `stable` publishes a normal GitHub release and npm
`latest`, while `prerelease` publishes a prerelease and npm `next`.

1. Run `prepare` and review the candidate, source commit and checksums.
2. Enable the repository variable and dispatch target `github`. Approve the
   `provider-release` environment. The job creates the matching plugin release,
   uploads verified assets while it is still a draft, publishes it with the
   selected channel, and then creates the matching Go submodule tag.
   It checks public Go module resolution and compares
   the downloaded source against the candidate.
3. Complete the npm bootstrap/trust setup if needed. Dispatch `npm` and approve
   the `npm` environment. The scoped SDK uses the candidate version and channel tag;
   this does not promote or replace the original package's `latest` tag.
4. Dispatch `pypi` and approve its environment. PyPI receives the wheel and source
   distribution with the candidate's Python version, with OIDC attestations enabled.
5. Review each verification result, then disable the repository variable again.

The npm and PyPI jobs require the matching public plugin and release channel
first, so their users do not receive an SDK pointing to a missing plugin. The plugin
supports Linux amd64 only and requires Node.js even from Python and Go.

## Verification and recovery

Registry verification downloads the actual npm/PyPI artifacts and compares their
SHA-256 with the candidate; npm also checks the channel dist-tag. To repeat this
read-only check after a publication:

```sh
node scripts/provider-publish.cjs verify .provider-candidate npm
node scripts/provider-publish.cjs verify .provider-candidate pypi
```

An identical existing npm version with its expected channel tag is verified and
skipped. A staging placeholder is pending, never success; do not republish or bump the version to bypass registry
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
