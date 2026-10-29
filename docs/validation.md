# Validation coverage

## Pulumi Registry submission

**PASS — Executed locally, 2026-10-29 UTC.** The Registry's community package
checker ran against public release `v0.2.0` and returned `pass` / "Ready for
approval". It generated metadata/documentation, installed the Linux amd64 plugin,
resolved the advertised npm, PyPI and Go SDKs, accepted the new publisher mapping,
matched the schema version to the release and found no overview lint issues.
The checker used a separate temporary HOME and plugin directory without cloud
credentials. These were installation/resolution checks, not cloud provisioning.
The upstream checker unit suite passed **135 tests**.

[pulumi/registry#13250](https://github.com/pulumi/registry/pull/13250) adds exactly
one `community-packages/package-list.json` entry and the required publisher
mapping, with no generated files. Local diff checks and JSON parsing passed.
The Registry's complete site lint/build was not executed: its `mise` setup failed
while compiling Node on Nix. The scoped checks used existing Nix tools, Go
1.26.10 and an isolated Python environment. Hosted Registry checks, final page
rendering and Pulumi maintainer approval remain unverified at submission time.
An open PR is not a published Registry listing. No SDK was republished and no
Hetzner account or VPS was accessed for this submission.

The subsequent [hosted community package check](https://github.com/pulumi/registry/actions/runs/40805963517)
passed against `v0.2.0`. Its [fact sheet](https://github.com/pulumi/registry/pull/13250#issuecomment-6486129550)
reports successful documentation generation, plugin installation, resolution of
all three SDKs, publisher/schema checks and overview lint. Pulumi's bot states
that nothing more is required from the submitter; a maintainer's review is still
required to merge. Final Registry listing and page rendering remain unverified.

## Stable 0.2.0 publication

**PASS — Executed, 2026-10-29 UTC.** The plugin and generated TypeScript,
Python and Go SDKs were published from clean source
`8a1ed30a43237fb62530a724f7f664883e5e1f7b`. The delegated installer/component
remains `nixos-vps@0.1.2`; the resource contract is unchanged.

- [Hosted CI](https://github.com/sgomezsal/nixos-vps/actions/runs/40793558834)
  passed validation and reproducible provider previews.
- [Candidate preparation](https://github.com/sgomezsal/nixos-vps/actions/runs/40795414988)
  passed two independent builds and exact-artifact engine/SDK integration. All
  six downloaded hosted artifacts matched the local candidate byte for byte.
- [GitHub publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40796510095)
  published normal release `v0.2.0` and module tag
  `sdk/go/nixosvps/v0.2.0`. Public Go module resolution matched the candidate source.
- [npm publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40797576003)
  uploaded `@sgomezsal/nixos-vps@0.2.0` through OIDC. Initial verification timed
  out during registry processing; subsequent direct verification downloaded
  matching bytes and confirmed `latest`. The failed job was retried under a new
  environment approval rather than republishing or changing the version. The
  retry passed, skipped the existing upload and verified the package and tag.
- [PyPI publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40797596300)
  passed OIDC upload and matching-byte checks for both the wheel and source archive.
- Independent empty-HOME consumers installed the public plugin and all three
  SDKs. TypeScript passed CJS/ESM imports and declaration compilation; Python
  passed dependency consistency and import checks; Go downloaded and compiled
  the tagged module. These checks did not create cloud resources.

After all destination checks passed, `PROVIDER_RELEASE_ENABLED` was set back to
`false`. Future publication requires a new explicit review and environment approval.

Release numbering does not expand supported platforms or live test coverage.
Fresh Hetzner installations below used `0.2.0-dev.1`, not these stable artifacts.
No additional VPS was created or modified for publication. Pulumi Registry
publisher/listing approval and hosted overview rendering remain unverified.

## Stable candidate preparation

**PASS — Executed locally, 2026-10-28.** `./scripts/validate.sh` exited zero
with the unpublished `0.2.0` provider source. Build/type checks, 54 core tests
and 26 provider tests passed. Independent tarball consumption, local SSH checks,
SOPS fixtures, read-only/fix validation, persisted engine lifecycle tests and
all three SDK/example integration tests passed with loopback cloud providers.
Template parity and publication-scope checks passed. The dependency audit found
zero vulnerabilities; the credential signature scan checked 118 source/build/log
files with zero findings. Nix checks reused existing VM derivations; this run
is not evidence of new VM boots.

Regression tests check Registry metadata, all component inputs, language examples
against the engine-tested source files, and stable/prerelease SDK README wording.
Schema comparison confirmed unchanged resources, language bindings and plugin
URL; lockfile changes only update the workspace/SDK version. The runtime still
uses published `nixos-vps@0.1.2`. Recorded live tests below exercised
`0.2.0-dev.1`, not a new deployment of the stable candidate.

Candidate artifacts require their own reproducibility/integrity manifest before
publication. Hosted CI for this source, actual stable publication, Registry
publisher registration/listing and hosted documentation rendering remain separate
gates. This local validation did not use operator credentials, access Hetzner,
modify a VPS, upload packages or change registry tags.

## Release channel review

**PASS — Executed locally, 2026-10-28.** `./scripts/validate.sh` exited zero
after the stable/prerelease publishing changes. It passed build/type checks,
54 core and 24 provider tests, independent tarball consumption, SOPS fixtures,
read-only/fix preflight checks, real local SSH identity/policy checks, persisted
Pulumi-engine lifecycle tests, packaged-plugin SDK/example tests, template
parity and publication-scope checks. Actionlint accepted the modified workflow.
The dependency audit reported zero vulnerabilities; the credential signature
scan checked 117 source/build/log files with zero findings.

The channel tests use substitute GitHub/npm/PyPI APIs. They exercise explicit
channel authorization, stable/prerelease release flags, interrupted upload
recovery, write-free retries, npm tag checks and refusal to republish a matching
artifact with the wrong tag. Stable PyPI version mapping and both distribution
downloads are covered. A final provider-test rerun also passed after adding an
assertion that tampered bytes fail even when the tag is wrong.

Nix evaluation/check commands completed using existing VM derivations in the
local store; this run does not claim new VM boots. Local documentation links and
shell-block syntax passed separately. At the time of this local run, hosted CI
for these changes and a real stable publication had not been run. No operator credentials,
Hetzner access, VPS operations, registry uploads or dist-tag changes were used.
At that review, fresh live Python/Go creation tests were paused. The separately
authorized [Python test](#fresh-python-installation) below subsequently passed;
Go creation first reached a [capacity-blocked preview](#go-capacity-blocked-attempt),
then passed a separately authorized [fresh installation](#fresh-go-installation)
in Nuremberg.

## Current status

- The original TypeScript component is published as `nixos-vps@0.1.2`.
- The multi-language provider and SDKs are published as `0.2.0`.
  [Stable publication](#stable-020-publication) verified matching artifact hashes
  and independent public consumers. Earlier prerelease evidence is retained below.
- Live installation evidence covers the original component. The provider's
  published `0.2.0-dev.0` SDKs passed migration and language switches on the
  existing server. A subsequent [fresh installation](#fresh-provider-installation)
  through the `0.2.0-dev.1` TypeScript SDK passed on a new CX23, including pinned
  readiness, a controlled reboot and unchanged repeat preview/update. A separate
  [fresh Python installation](#fresh-python-installation) passed the same checks
  with the published `0.2.0.dev1` SDK. A subsequent Go consumer passed local
  validation and actual preview before [capacity blocked creation](#go-capacity-blocked-attempt).
  After explicit location approval, its [fresh installation](#fresh-go-installation)
  in Nuremberg passed readiness, reboot and unchanged repeat update.
- A fresh-provider test was prepared on 2026-10-28 but stopped before any cloud
  mutation because the selected server type was unavailable. Local consumer
  validation passed; the blocked attempt is not an installation pass. No
  replacement was attempted at that stage. After capacity returned, a separately
  reviewed retirement and fresh-create sequence completed without two concurrent
  test servers. Other plans, live UEFI and post-formatting recovery remain unverified.

The sections below retain the versions and test counts of each executed run;
those historical counts must not be read as the current suite size.

The core `0.1.2` release-candidate CI ran on **2026-10-27 UTC**, commit
`4314d61`. All
**53 package tests passed**, with
no failures or skipped tests. npm audit and credential scans reported no findings
in that run.

The published multi-language prerelease and protected migration checks are
recorded under [distribution evidence](#multi-language-prerelease-distribution).
Earlier development runs below are historical evidence, not current release status.

## Offline review before publication — 2026-10-28

The complete `./scripts/validate.sh` run exited zero: build/type checks, package
consumption, SOPS, read-only CLI validation, SSH identity/policy, Pulumi lifecycle,
provider interoperability, protected migration, workflow syntax and template
parity passed. Nix system/VM checks reused successful store outputs; this was not
a fresh VM execution. The suite ran 53 core and 19 provider unit tests without
failures or skips. A separate rerun of all core tests after adding the credential
scanner regression passed **54 tests**, also with no failures or skips.

The scanner now detects opaque alphanumeric as well as hexadecimal Hetzner token
assignments. Its regression verifies detection without printing token values and
accepts the documented placeholder. The repository scan checked **117 files with
zero findings**; npm audit reported **zero vulnerabilities**. These checks are
bounded signature/dependency checks, not a comprehensive security audit.

`npm run test:provider:public` passed independent plugin, npm, Python and Go
installations. A separate read-only registry verification downloaded the npm
tarball and Python distributions and matched their SHA-256 values against the
original published candidate. All 43 local documentation file links resolved.
The inspected tracked files contained no references to the private repository,
private consumer directory or the known test-server IP/identifier.

No Hetzner account, VPS, cloud operation or registry publication was used during
this offline review. The subsequent
[live TypeScript migration](#live-typescript-provider-migration) and
[language switches](#live-language-switches) passed. Remaining integration work
at that stage included fresh installation through the new provider. The later
[npm OIDC prerelease](#npm-oidc-prerelease) verified the upload and provenance; the
[subsequent fresh-server test](#fresh-provider-installation) verified initial
creation through the TypeScript SDK.

## What is tested

| Area | Coverage | Entry point |
| --- | --- | --- |
| Package | Build, declarations, CJS/ESM imports, 20-file tarball, npm publish dry run and an independent consumer | `npm test` |
| CLI | Key generation, repeat initialization, rollback, read-only validation and explicit port fixes | `npm test` and `npm run test:preflight` |
| NixOS | Baseline and example builds; BIOS, UEFI, web-example and consumer-template installation checks | Direct builds below; `./scripts/validate.sh` |
| SSH | Pinned host identity, unsafe policy rejection and effective generated configuration | `scripts/test-ssh-identity.cjs`, `scripts/test-ssh-policy.cjs` |
| Pulumi | Persisted outputs, unchanged updates, replacements, protection, deletion and partial failures | `scripts/test-engine.cjs` |
| Template parity | Shared boot, disk, SSH, firewall and baseline settings; matching Nixpkgs/disko pins | `scripts/test-template-parity.cjs` |
| Release | Artifact identity, pending processing, integrity failures, fail-fast preparation and manual OIDC workflow guards | `npm test` |
| Secrets | Operator-only SOPS injection with test credentials | `npm run test:secrets` |
| Distribution and CI | Provisioning scope, pinned actions and workflow syntax | `scripts/test-publication.cjs` and package tests |
| Multi-language component provider | Installed local plugin, generated TypeScript/Python/Go SDKs, persisted-state interoperability and failure recovery | `npm run test:provider` |

Run `./scripts/validate.sh` for the full suite. It supplies the additional tools
needed by the scripts above. The suite uses temporary local state, test identities
and loopback substitute providers; it does not contact Hetzner.

Build the two shipped system configurations directly with:

```sh
nix build --no-link \
  .#nixosConfigurations.hetzner-cloud.config.system.build.toplevel \
  .#nixosConfigurations.example.config.system.build.toplevel
```

The BIOS, UEFI, web-example and consumer-template checks ran for the current SSH policy and enabled
logrotate validation. All four VM derivations executed successfully for the shared
baseline. Subsequent checks may reuse their successful Nix store outputs; a cached
check does not represent a new VM execution.

For the effective SSH policy test, `sshd -T` reads the generated configuration with
only its host-key paths replaced by disposable test identities. Its authentication
directives remain unchanged.

## Initial component-provider development (historical)

The local development working tree passed `./scripts/validate.sh` on
2026-10-27. The 53 existing package tests and ten provider tests passed, with
zero failures or skips. The independent core tarball still contained its expected
20 files. npm audit reported zero vulnerabilities; the signature scan checked
95 source/build/log files with zero findings. Nix checks reused existing
successful system/VM outputs; this run does not claim fresh VM executions.

The new integration test independently packs the private provider's fourteen allowed
files, installs them outside the repository and builds a plugin archive with its
runtime dependencies. Pulumi installs that archive into an empty temporary
`PULUMI_HOME` and launches it normally. Automatic plugin acquisition is disabled;
only hcloud/command CRUD is substituted on loopback. A module-resolution guard
rejects provider runtime dependencies on the original checkout.

SDK generation and actual engine runs passed for:

- TypeScript: compile the generated SDK, install its tarball, type-check a
  consumer and import its public package entry point.
- Python: install the generated SDK in an isolated virtual environment and
  evaluate its program through Pulumi.
- Go: resolve the generated module, compile a consumer and run its binary
  through Pulumi.

The test retains the same cloud resource identifiers, URNs and parent across
the original TypeScript component and all three remote SDKs. The initial move
to the bundled plugin changes absolute runner paths, so local preflight and
non-destructive `update` commands run once; cloud resources remain unchanged and
installation is not repeated. A subsequent unchanged deployment and the switches
to Python/Go cause no CRUD operations. Secret annotations and readiness outputs
are checked across the RPC boundary.

The same test exercises invalid deferred inputs, configuration/firewall updates,
replacement previews, replacement installation, protection, deletion, preview
without key-file access and retry after a failed initial installation without
recreating the server. It also rejects unapproved files in the provider package.
The unit tests cover static input validation, schema/API parity, import behavior,
resource options and refusal to overwrite existing artifacts.

This validates the component protocol and local packaging, not a live migration.
No Hetzner account, existing consumer project or real cloud resource was accessed
or changed. No provider/SDK was published. The published 0.1.2 implementation is
unchanged. Registry authorization and supported migration
paths still require review before releasing the provider. Legacy TypeScript
callback transformations and direct child access are outside the tested contract.

### Distribution preview

Local `provider:prepare` and `provider:verify` also passed on 2026-10-27 for the
uncommitted development working tree. Two separate build directories produced
identical SHA-256 values for all six artifacts: the plugin, npm SDK, Python wheel,
Python sdist, Go source archive and schema. Canonical archive metadata, locked npm
graphs, the checked-in Go graph/checksums and the locked Nix Python build tools
were used. Both the plugin runtime and Node SDK build passed their high-severity
npm audit gates.

The exact prepared npm and wheel files were installed into independent consumers;
the Python sdist was installed in a separate environment; the prepared Go module
was compiled and evaluated by Pulumi. The prepared plugin was installed normally
into disposable plugin state. The same lifecycle/secret/readiness checks above
passed against those artifacts, with cloud CRUD substituted on loopback.

Regression tests also passed for the frozen API/distribution names, integrity-locked
graphs, deterministic metadata, tampered files, unsafe artifact paths, manifest
symlinks and unvalidated status. Verification and a refused overwrite preserved
artifact hashes, modes and modification times. The CI job's dependencies, pinned
actions and absence of publishing/cloud credentials were checked locally;
actionlint passed. Hosted results are separate from these local checks and must
be reviewed in the repository's GitHub Actions workflow.

A read-only scan of 12,414 prepared archive members found no operator-home or
workspace-path references. Verification of the eight final output files also
preserved their hashes, permissions and modification times. This inspection
complements the source signature scan; it is not an exhaustive secrets audit.

Before pushing the provider changes, `npm run validate:clean` also passed from a
tracked-source snapshot with an empty HOME/npm cache and no initial node_modules
or cloud credentials. It repeated all 63 tests and the full local validation;
shared system/Nix store caches were retained.

The preview manifest records a dirty working tree and explicitly disables
publication. The original published package has no source changes. These results
do not validate a live migration or reserve npm/PyPI names. See the
[multi-language guide](multilanguage.md) for artifact installation and release
boundaries.

### GitHub artifact consumer check

On 2026-10-27, the preview bundle from clean commit `96a6ea9` was downloaded
from the successful [GitHub run 40590088663](https://github.com/sgomezsal/nixos-vps/actions/runs/40590088663).
Its manifest, schema, locks and artifact checksums passed local verification.
Those downloaded files were used for the consumer checks, rather than replacing
them with newly generated SDKs.

The [local quickstart](../examples/provider/README.md) was exercised in a disposable
project with an empty HOME and no cloud credentials. Initialization generated
real distinct SSH identities. The bootstrap, TypeScript, Python and Go stages
each passed real local NixOS/installer validation. TypeScript type-checking,
Python wheel installation/dependency checking/syntax compilation and a Go source
build passed. The final run exited successfully and removed its temporary files.
An earlier test-harness cleanup failed on read-only Go cache directories; the
rerun used a writable disposable module cache. No operator cache was modified.

The expanded `test:provider` run passed against that same downloaded bundle.
It executed the checked-in TypeScript, Python and Go examples using their normal
source loaders, including Pulumi's default Go compilation. Each passed a fresh
preview without CRUD, simulated creation, readiness outputs, an unchanged second
update and deletion. Missing required configuration and an empty SSH source list
failed before cloud CRUD. Migration, secret propagation, protection, replacement
and partial-install recovery checks also passed. The test refreshes the Go module
graph after copying the source; an earlier harness run correctly failed when the
new config import had no checksum entry. Cloud operations and installation in
these engine checks were loopback simulations, not real provisioning.

`npm run check` and `npm test` also passed: 53 existing package tests plus ten
provider tests, zero failures or skips, and independent core tarball consumption.
The credential signature scan checked 99 source/build/log files with zero findings.
These checks do not constitute a new full VM-suite run.

The initializer/validator still uses a TypeScript bootstrap for Python and Go.
Its Nix checks target the generated `nixos/` directory and `web` host; they do not
validate arbitrary alternative targets or replace language-specific checks.
At the time of that check the remote SDKs were unpublished. No Hetzner account, live consumer, cloud
resource or package registry publication was used in this check.

### Publication preparation

On 2026-10-28, local candidate preparation produced matching SHA-256 values for
all six artifacts across two independent builds. The publication-enabled npm
SDK, Python wheel/sdist, Go source and plugin passed the same independent-consumer
and real-engine checks, including the three source-language examples. Candidate
verification and byte-for-byte comparison with `sdk/go/nixosvps` passed. This was
a dirty development-tree candidate for review, not an authorized upload.

Publication tests exercise manual-workflow identity, disabled gates, forks,
dirty/different sources, incorrect tags, preview/candidate separation, pending
registry processing, downloaded-byte mismatches, partial Python uploads and
interrupted GitHub drafts. HTTP requests and publishing APIs in those tests are
substituted locally; they do not prove live registry authorization. Workflow
syntax is checked with `actionlint`.

The GitHub environments `pypi` and `provider-release` were configured and read
back: reviewer `sgomezsal`, only branch `main`, self-approval allowed for the solo
maintainer. Repository variable `PROVIDER_RELEASE_ENABLED=false` was read back.
The existing npm environment was inspected, not replaced. Public npm/PyPI
metadata returned 404 for the new SDK names; that is not a name reservation.
The account owner reported registering the PyPI pending publisher; its private
account configuration has not been independently inspected.

No provider tag, GitHub release, registry upload or cloud operation occurred in
these preparation checks. Actual npm/PyPI OIDC authorization, public plugin/Go
distribution and provider-specific live behavior still require separately
authorized execution. See [publication](provider-publication.md) for the remaining
npm bootstrap and release order.

## Live Hetzner test

On 2026-10-27, an independent consumer installed `nixos-vps@0.1.1` from npm
and provisioned one CX23 in Helsinki, starting from Ubuntu 24.04.
The first installation attempt stopped before kexec or formatting: `lsblk`
returned a flat JSON list because its requested columns omitted `NAME` and the
command did not specify `--tree`. The disk guard correctly refused to infer
the root partition's parent from that list.

The source fix explicitly requests `--tree` in both disk probes. The same patch
was applied to the consumer's installed runner, and recovery was previewed before
continuing: only the failed installation command was created; the server and
the other five resources stayed unchanged. This is live evidence for the patched
runner, not a successful installation with the unmodified npm 0.1.1 artifact.
The fix has a regression test covering flat versus hierarchical disk inventories.

The patched installation completed with:

- The predetermined SSH host identity authenticated on Ubuntu, in the kexec
  installer and after the final reboot, without accepting an unknown key.
- The same disk path, nonempty serial and size verified across kexec.
- NixOS booted from the root ext4 partition, with a FAT boot partition; the
  actual firmware path was BIOS.
- Active SSH and Caddy services, no failed systemd units, public-key-only SSH
  authentication and the expected HTTP 200 response from the public web endpoint.
- A second real `pulumi up`, constrained by a no-change plan, reporting all
  seven resources unchanged; installation was not run again.

This test used a dedicated project and incurred charges for one server and its
IPv4 address. It did not exercise other projects or existing infrastructure.
The full local `./scripts/validate.sh` suite completed successfully after the fix:
53 package tests with no failures or skips, TypeScript and independent tarball
consumption, SSH policy/identity checks, substitute-provider lifecycle tests,
template parity, zero npm audit vulnerabilities and zero credential-scan findings.
Nix checks reused existing successful VM outputs; no new VM execution is claimed.
The development shell also now ignores ambient provider binaries, preventing an
older bundled hcloud plugin from overriding the version selected by the SDK. Its
evaluated shell setting is checked by the publication-scope test.
Both fixes are included in release 0.1.2. The distribution and consumer checks
below verify the published artifact separately from the initial live installation.

### Routine operation

The same live server subsequently passed a normal system reboot. Its boot ID
changed while its installed system, root filesystem and disk identity stayed the
same; pinned SSH authentication, SSH/Caddy readiness and public HTTP all passed
after startup, with no failed systemd units reported.

A small flake change added a non-secret marker under `/etc`. Local validation
built the updated configuration, then `nixos-rebuild switch --target-host`
activated a new system generation over SSH with the pinned host policy. The
marker appeared, the boot ID stayed unchanged during activation, and disk identity,
partition sizes, SSH and public HTTP stayed correct. No installation command or
partitioning tool was invoked.

A second normal reboot then loaded that updated generation and retained the
marker, host identity, services and public HTTP response. A subsequent real
Pulumi preview and constrained update reported all seven resources unchanged.
These checks exercise routine configuration activation, not a Nixpkgs, package
or kernel upgrade.

### Remaining provider-specific checks

- Other locations, server families, bootstrap images and live UEFI boot.
- Real-provider infrastructure updates, replacements and deletion; those lifecycle
  paths remain covered by the local substitute-provider tests.
- Recovery from failures after kexec or after formatting. The observed recovery
  covered a failure before either operation.
- Long-term operation, Nixpkgs/package/kernel upgrades and a broader
  vulnerability review.

## Release evidence

### 0.1.2

The [full CI run](https://github.com/sgomezsal/nixos-vps/actions/runs/40544998325)
and [prepare/publish run](https://github.com/sgomezsal/nixos-vps/actions/runs/40545033318)
both passed for commit `4314d61`. Publication used the original validated
artifact through OIDC with provenance. Local verification and the publication
job independently confirmed registry availability, the `next` tag and the
SHA-512 integrity of the downloaded npm tarball.

An independent consumer then installed `nixos-vps@0.1.2` directly from npm.
Its lockfile points to the registry tarball and matching integrity, and all 20
installed package files match the original GitHub artifact byte for byte. No
manual patch remains in the installed package. All 17 runtime and template files
also match the implementation used for the successful live installation.

TypeScript and local validation passed in that consumer. A real Pulumi preview
and update, constrained to a no-change plan, reported all seven resources
unchanged. No server was created, reinstalled, replaced or deleted during this
release-consumer check. Authenticated SSH readiness and public HTTP were checked
again on the existing server. This is not a second fresh installation of the
published artifact.

The exact tarball and source/integrity manifest are attached to the
[0.1.2 release](https://github.com/sgomezsal/nixos-vps/releases/tag/v0.1.2).
The npm `latest` tag is separate from the experimental `next` channel;
both were set to 0.1.2 after consumer, reboot and configuration-update checks
passed. Promoting `latest` did not republish or change the artifact. Use the
documented exact version when reproducing these results; tags can move later.

### Earlier evidence

The [0.1.1 release run](https://github.com/sgomezsal/nixos-vps/actions/runs/40441429445)
submitted its artifact successfully but exceeded the former fifty-second
verification window during npm processing. Its original artifact was later
verified locally and by the
[verification-only workflow](https://github.com/sgomezsal/nixos-vps/actions/runs/40447258950).
The [earlier full CI run](https://github.com/sgomezsal/nixos-vps/actions/runs/40446722126)
passed 52 package tests. Those results remain historical evidence, distinct from
the 53-test 0.1.2 candidate above.

## Scope of the results

Nix can reuse successful system and VM derivations. A cached VM result is not a
new VM execution. npm audit covers npm dependencies, not a comprehensive NixOS
vulnerability review. Credential scans cover known patterns and inspected files,
rather than every possible form of secret. Registry tags are mutable distribution
pointers; exact versions, source commits and artifact integrity are checked
separately.

## Multi-language prerelease distribution

The first published experimental provider, `0.2.0-dev.0`, was built from commit
`5a217d3d74220dbc1b1338088cea8c4b9eb925ca`. The existing unscoped
`nixos-vps@0.1.2` package and its `latest`/`next` tags were unchanged.

Executed evidence:

- [Source CI](https://github.com/sgomezsal/nixos-vps/actions/runs/40637040096)
  passed local validation and provider artifact preparation. The candidate suite
  passed 53 core and 19 provider tests, with no failures or skips.
- [GitHub publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40639738722)
  published the [prerelease assets](https://github.com/sgomezsal/nixos-vps/releases/tag/v0.2.0-dev.0)
  and Go submodule tag. The public Go proxy download matched the committed SDK source.
- npm accepted the exact candidate `@sgomezsal/nixos-vps@0.2.0-dev.0`
  with interactive account verification. A subsequent registry download matched
  the candidate's SHA-256. This verifies publication, not npm OIDC or provenance.
- [PyPI publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40640717676)
  passed with trusted-publisher OIDC and attestations. Both downloaded Python
  distributions matched the candidate's SHA-256.
- Independent empty-HOME consumers installed the plugin from its GitHub URL,
  installed the npm SDK and checked CommonJS/ESM imports and TypeScript types,
  installed the PyPI wheel and passed `pip check` and imports, and compiled a
  Go consumer using the public module without a local replacement.

The Python consumer initially failed on NixOS because gRPC's wheel could not
load `libstdc++.so.6`. The provider development shell now supplies that runtime;
the same independent installation and import check then passed. The first local
Go consumer fixture also needed its module cache moved to a hidden directory so
`go mod tidy` would not interpret the cache as application source. Neither fix
changed a published artifact.

Repeat the read-only public distribution checks from the provider shell:

```sh
nix develop .#provider --command npm run test:provider:public
```

This uses disposable projects and public network downloads. It does not construct
cloud resources, connect to a VPS or load operator credentials. It tests exact
versions, not mutable registry tags. Full Pulumi engine behavior is covered by the
separate loopback provider suite; these public smoke tests do not replace it.

The GitHub publication gate was reset to `false`. npm subsequently confirmed
creation of the scoped package's GitHub trusted publisher for
`sgomezsal/nixos-vps`, `provider-release.yml`, environment `npm`, with publishing
permission. Configuration is verified by npm's successful creation response;
an actual npm OIDC upload had not yet been exercised at that stage. The first
manual npm publication did not test that upload path. The subsequent
[OIDC prerelease](#npm-oidc-prerelease) below closes that distribution gap. No Hetzner account or
server was accessed during this distribution check. The separately authorized
[live TypeScript migration](#live-typescript-provider-migration) below followed it.

### Protected consumer migration

The engine suite also exercises a consumer with a fixed physical server name,
backups disabled, inherited protection, a single-server limit and a `cx23` budget
guard. Its legacy callback is replaced by a remote-compatible `transforms`
callback. All operations use disposable state and loopback substitute providers.

The initial full preview fails safely: changed preflight runner paths make SSH
key outputs unknown, and protection blocks speculative replacement proposals.
A saved plan targeting only the existing local preflight resolves those outputs;
the subsequent full preview passes. The resulting migration retains the server
URN/ID and every decrypted server input, including secret labels, without any
cloud-resource create/update/delete or another installation. A repeated update
has no changes, protected deletion fails, and duplicate-server and budget-guard
previews fail without CRUD. The complete `npm run test:provider` suite exited zero.

This establishes a local migration strategy, not permission to apply an uncertain
live plan. The real target-only plan must be reviewed independently and must not
include cloud operations. Keep protection enabled and stop if the subsequent
full plan proposes cloud changes. No live stack was migrated by this test.

## Live TypeScript provider migration

On 2026-10-28, the published `@sgomezsal/nixos-vps@0.2.0-dev.0` SDK and matching
GitHub plugin migrated the existing dedicated CX23 test stack from the original
`nixos-vps@0.1.2` component. The reviewed source was `86e3fc9`; its
[complete CI](https://github.com/sgomezsal/nixos-vps/actions/runs/40647897103)
passed before the migration. This test used real Pulumi, the published plugin
and actual provider state, rather than loopback cloud substitutes.

A private source backup and encrypted checkpoint preceded the migration. The
plugin's bundled installer matched all 20 installed 0.1.2 package files. Cloud
and command provider versions, keys, flake and stack identity were retained.
The remote-compatible transform kept the fixed server name, disabled backups,
protection and single-server/budget guards.

The initial preview blocked protected replacement proposals caused by unknown
preflight outputs. A reviewed saved plan updated only the local preflight and
registered the local provider. The next full saved plan contained one local
installation-command update, changing its `create`/`update` executable paths;
its triggers were unchanged. That exact checksum-verified plan was applied.
The nonempty `update` handler retained the installation. Cloud resource IDs,
URNs, decrypted input values and protection matched before/after; decrypted
comparisons stayed in memory and were not written or logged. The installation
resource ID also stayed unchanged.

Verification passed:

- Ready IP and server-ID outputs identify the original server.
- `pulumi preview --expect-no-changes` succeeded; all ten resource plans were
  unchanged. A second update constrained to that no-op plan also passed, with
  identical resource IDs, inputs, outputs and protection.
- Pinned SSH, active SSH/Caddy services, no failed units, the expected test marker
  and public HTTP 200 passed. Boot ID, system generation, root disk and partitions
  were unchanged.

No Hetzner resource was created, updated, replaced or deleted. No additional
server, reboot, partitioning, reinstall or package publication occurred.
Operational state, keys, plans and server identifiers remain outside this public
repository. This verifies TypeScript migration of an installed server, not a
fresh installation through the new provider. The later language-switch checks
are recorded below.

## Live language switches

On 2026-10-28 the existing dedicated test stack completed this sequence using
published SDKs, the same provider plugin, backend, keys, flake and protected CX23. The
[source CI](https://github.com/sgomezsal/nixos-vps/actions/runs/40652355352) passed
separately; the checks below ran in the independent live consumer.


| Switch | Published SDK version | Preview and saved-plan update |
| --- | --- | --- |
| TypeScript baseline | npm `0.2.0-dev.0` | Unchanged |
| TypeScript → Python | PyPI `0.2.0.dev0` | Unchanged |
| Python → Go | Go `v0.2.0-dev.0` | Unchanged |
| Go → TypeScript | npm `0.2.0-dev.0` | Unchanged |

Each preview used `--expect-no-changes`. The controller independently checked
all ten resource plans and refused any step other than `same` before executing
an update constrained to that saved plan. Canonical fingerprints of decrypted
resource IDs, inputs, outputs, provider references and protection matched the
TypeScript baseline after every update. Plaintext comparisons remained in
memory; checkpoint exports were encrypted and operational evidence stayed private.

Python used an isolated virtual environment installed directly from PyPI and
passed dependency/import checks. Go resolved the public version through the Go
proxy without a local `replace`, compiled successfully and used Pulumi's normal
Go source loader. Module versions/checksums were locked before the credentialed
runtime; dependency downloads were disabled and the module graph was read-only
during its live checks. Python used the pinned Nix shell's C++ runtime for gRPC on NixOS.

The same logical name, physical server name, disabled backups, single-server
budget guard and remote-compatible protection transforms were retained in each
program. Ready IP/server-ID outputs, pinned SSH, SSH/Caddy readiness, the test
marker and public HTTP 200 passed after every language switch. Boot ID, system
generation, root disk and partitions matched the initial snapshot. No cloud
resource was created, changed, replaced or deleted, and no reinstall or reboot
occurred. The consumer was left in TypeScript with all language sources retained.

These checks verify interoperability on an installed server, not initial
installation through the new provider, arbitrary target configurations or
additional supported platforms. No package was published as part of these tests.

## npm OIDC prerelease

On 2026-10-28, provider `0.2.0-dev.1` and its matching SDKs were published from
clean commit `17f73ec33153f8e1079aa0136954859ff77d92a1`. The underlying installer
remains `nixos-vps@0.1.2`; no installer behavior changed.

Executed evidence:

- [Source CI](https://github.com/sgomezsal/nixos-vps/actions/runs/40656619908)
  passed the complete local validation and provider artifact jobs. The core
  suite passed 54 tests and the provider unit suite passed 19, without skips.
  Local engine integration also passed for TypeScript, Python and Go, including
  protected migration, lifecycle operations and partial-failure recovery with
  loopback substitute providers.
- Two independent local builds produced identical hashes for all six artifacts.
  Candidates from each hosted publication workflow matched those artifacts and
  the same clean source identity before environment approval.
- [GitHub publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40658556787)
  published the [plugin prerelease](https://github.com/sgomezsal/nixos-vps/releases/tag/v0.2.0-dev.1)
  and matching Go submodule tag. Public Go source matched the candidate.
- [npm publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40659450480/attempts/1)
  successfully uploaded `@sgomezsal/nixos-vps@0.2.0-dev.1` using GitHub OIDC,
  without a personal npm token, and published signed provenance to
  [Sigstore](https://search.sigstore.dev/?logIndex=3535385305).
  Registry processing exceeded the verifier's initial bounded window, so that
  attempt failed honestly at download verification after a successful upload.
  Once processing completed, a [verification-only retry](https://github.com/sgomezsal/nixos-vps/actions/runs/40659450480/attempts/2)
  verified the existing bytes, skipped publication and passed. No version was
  overwritten or incremented to bypass processing.
- The actual npm tarball SHA-256 matched the reviewed candidate:
  `655fbcb4a04b160d66796e8cb15ae20910c990c618375e57ea824f3c4b1d5dcc`.
  Its public SLSA statement matched the repository, workflow, exact source commit,
  original run/attempt and the candidate tarball SHA-512. An independent consumer
  passed CJS/ESM imports and TypeScript checks. `npm audit signatures`, using npm
  11.15.0, verified 222 registry signatures and 93 attestations in that dependency
  graph. These counts describe that executed graph, not a permanent coverage metric.
- [PyPI publication](https://github.com/sgomezsal/nixos-vps/actions/runs/40659695008)
  used OIDC with attestations; downloaded wheel and sdist hashes matched the
  candidate. A pip consumer initially saw the previous simple-index cache;
  after propagation, a fresh independent installation passed imports and
  `pip check`. The initial failed consumer run is not counted as a pass.
- Independent empty-HOME consumers installed the public plugin and compiled Go
  using its public module, without local replacements. All four distribution
  consumer checks passed without constructing cloud resources.

The scoped npm `next` tag selects `0.2.0-dev.1`; `latest` remains `0.2.0-dev.0`.
The original unscoped component and its tags are unchanged. The repository's
`PROVIDER_RELEASE_ENABLED` variable was reset to `false` after verification.

This release validation did not load operator credentials, access Hetzner,
connect to the VPS, create cloud resources, reinstall NixOS or reboot a server.
Previously recorded live migration/language-switch results used `0.2.0-dev.0`;
they were not a fresh live installation test of `0.2.0-dev.1`. The separately
authorized [fresh-provider installation](#fresh-provider-installation) below
subsequently verified initial provisioning through the TypeScript SDK.

## User documentation review — 2026-10-28

The review compared the guides with the checked-in CLI, component defaults,
provider schema and public registry metadata. It corrected the stale npm OIDC
status, separated historical evidence from current status, documented explicit
plan selection and capacity limits, and made the three-language setup use public
SDKs by default. Preview-artifact instructions remain separate.

Executed checks passed: `npm run check`, 54 core and 19 provider unit tests,
independent core tarball consumption, and all four public-distribution consumers
(plugin, npm, PyPI and Go). Local Markdown links/anchors and shell-block syntax
were checked separately. These checks do not establish live provider installation.
No cloud credentials, Hetzner queries, provisioning or registry publication were
used in this documentation review. Source README/description changes are for the
next package release; existing registry artifacts remain unchanged.

## Fresh-provider installation

**PASS — Executed, 2026-10-28.** An independent consumer installed the public
`@sgomezsal/nixos-vps@0.2.0-dev.1` SDK and matching plugin, from release source
`17f73ec33153f8e1079aa0136954859ff77d92a1`. It used the published
`nixos-vps@0.1.2` initializer/validator, its copied locked NixOS template and new
external deployment/host SSH identities. All twenty delegated core-package files
matched the independently installed npm package byte-for-byte. No provider or
installer source was patched for this deployment.

The target was one CX23 in Helsinki, using Ubuntu 24.04 bootstrap, a single root
disk and BIOS boot. This run used the TypeScript SDK; it did not independently
exercise fresh creation through Python or Go.

Executed evidence:

| Check | Result |
| --- | --- |
| Local preflight | TypeScript, keys/permissions, SSH policy, locked NixOS build, disko, ports and checksum-pinned installer passed |
| Budget/capacity | Current price and capacity reviewed before retirement and creation; no automatic plan upgrade |
| Retirement | Exact old test resources retired using a reviewed saved plan; both old auto-delete IPs removed and empty dedicated project confirmed before creation |
| Fresh creation | Saved create plan produced one protected CX23 with backups disabled; initial stack was empty |
| Installation | Completed bootstrap SSH, installation, post-install SSH and ready stages; protected stdout recorded `installed=true` |
| Readiness | Pinned SSH, public-key-only policy, active SSH/Caddy, no failed units, public HTTP 200 and the new configuration marker passed |
| Disk and boot | NixOS 26.05, BIOS, one `/dev/sda` disk with nonempty serial, ext4 root and vfat boot verified; previous installation marker absent |
| Reboot | One controlled reboot returned with a new boot ID, identical system generation/disk/partitions and pinned SSH/HTTP ready |
| Idempotency | Repeat preview and saved-plan update reported no changes; all ten plan entries, including provider resources, were `same` |
| State comparison | Order-independent comparison confirmed identical IDs, inputs, outputs, provider references and protection; secret values compared only in memory |
| Final inventory | One server, two auto-delete Primary IPs, one firewall and one SSH registration; no backups, snapshots, volumes, networks, floating IPs or load balancers |
| Protection | Component and all five managed children protected after creation and repeat deployment |

The initial create/install completed in approximately 4 minutes 31 seconds. Its
first post-apply inventory query encountered a transient connection failure;
a read-only retry confirmed the completed state without repeating apply.
SSH disconnected as the controlled reboot began; a read-only follow-up confirmed
the new boot without issuing another reboot. A private comparison helper initially
treated checkpoint array order as meaningful; sorting by URN showed that the
values were unchanged. Final state comparisons used decrypted values only in memory rather than
ciphertext, which can change on rewrite. Decrypted values were not written to
logs or files.

Private operational evidence retains source/plan hashes, encrypted checkpoints,
installation-stage records, inventory and before/after readiness results. These
files contain operator-specific metadata and are not distributed in this repository.
The unrelated server/project was outside the scoped credentials and operations.

This was an authorized billable deployment, distinct from zero-cost local tests
and registry publication checks. It establishes one real fresh TypeScript-provider
installation, not universal plan support or production readiness. Other plans,
live UEFI, package/kernel upgrades and recovery after kexec or formatting remain
unverified. The subsequent [Python test](#fresh-python-installation) below adds
initial Python provisioning evidence; the later [Go test](#fresh-go-installation)
adds fresh Go evidence. Earlier Python/Go state switches
retain their separately recorded `0.2.0-dev.0` evidence.


## Fresh Python installation

**PASS — Executed, 2026-10-28.** An independent Python consumer installed
`pulumi-nixos-vps==0.2.0.dev1` from PyPI with `pulumi==3.217.1`, using its own
virtual environment, frozen requirements, isolated Pulumi backend/plugin home,
and newly generated external deployment/host SSH identities. It installed the
published `nixos-vps@0.2.0-dev.1` plugin from GitHub, from release source
`17f73ec33153f8e1079aa0136954859ff77d92a1`. The npm `nixos-vps@0.1.2`
initializer/validator supplied the copied locked NixOS template. All twenty
bundled core files matched that independent npm installation; the SDK, provider
and installer were not patched locally.

| Check | Executed result |
| --- | --- |
| Local consumer | pip dependency check, Python compilation and real NixOS/SSH/disk preflight passed |
| Budget/capacity | CX23 availability and monthly/hourly account pricing checked before retirement and creation; no automatic upgrade |
| Isolation | Reviewed deletion of the exact prior test server/firewall/SSH registration; both old IPs removed and empty dedicated project confirmed before creation |
| Saved create plan | One CX23 in Helsinki, named `nixos-vps`, Ubuntu 24.04 bootstrap, backups disabled and protection enabled |
| Initial installation | Python runtime and published SDK constructed the component; bootstrap SSH, install, post-install SSH and ready phases completed with `installed=true` |
| Readiness | Pinned SSH, public-key-only authentication, SSH/Caddy active, no failed units, HTTP 200 and a distinct Python configuration marker passed |
| Disk/boot | NixOS 26.05, BIOS, single `/dev/sda` with a nonempty serial, ext4 root and vfat boot; previous test markers absent |
| Controlled reboot | One reboot changed the boot ID while retaining the system generation, disk/partitions and pinned SSH/HTTP readiness |
| Repeat deployment | All ten preview entries were `same`; saved-plan update preserved resource IDs, inputs, outputs, protection and installation without another reboot |
| Final scope | One server; six protected managed resources; no backups, snapshots, volumes, networks, floating IPs or load balancers |

Initial apply took **4 minutes 22 seconds**. The post-apply inventory request
encountered a transient connection failure after Pulumi succeeded and the
encrypted checkpoint was saved. A read-only retry confirmed the result; the
installation was not repeated. Independent readiness, reboot and no-op checks
then passed. Secret values were inspected only in memory; checkpoints, source
hashes, reviewed plans and operational details remain in private evidence.

This was an authorized billable replacement, never a second concurrent test VPS.
The unrelated server/project was outside the scoped credentials and operations.
No package, tag or release was published. This adds fresh Python installation
evidence on one CX23; it does not establish production readiness, other plans,
live UEFI or recovery after formatting. The subsequent
[Go attempt](#go-capacity-blocked-attempt) was initially blocked before cloud
mutation; the later [Nuremberg installation](#fresh-go-installation) passed.


## Go capacity-blocked attempt

**PARTIAL — Executed locally; live installation BLOCKED, 2026-10-28.** A new
independent Go consumer used the public module
`github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0-dev.1`, without a local
replacement, and the matching published plugin. It had new external SSH identities
and an isolated Pulumi backend/plugin home. `go mod verify`, compilation and the
published core CLI's real NixOS/SSH/disk preflight passed.

An actual Pulumi preview ran the Go program and remote component transform,
producing a create-only saved plan for exactly one protected CX23 in Helsinki,
named `nixos-vps`, with backups disabled. This was a preview, not provisioning.
The initial availability lookup allowed preparation, but capacity became
unavailable before retirement. The ordinary preparation guard stopped. A
separate preview-only operation completed local review without weakening the
retirement/apply capacity checks. The saved plan is locked against apply until a
new source, inventory, budget and capacity review.

During that blocked attempt, no cloud resource was created, deleted, replaced or
unprotected. The Python server retained six protected resources, its original program, system
generation, disk and boot ID; pinned SSH and HTTP readiness passed afterward.
No reboot, reinstall, package publication or automatic plan upgrade occurred.
Account hourly/monthly prices remained within the reviewed limits.

At that stage, the next action was a new capacity/price/inventory and source/plan
review. Capacity is not a reservation. The Helsinki attempt remains blocked in
this historical record; it is not counted as an installation pass. The subsequent
[Go installation in Nuremberg](#fresh-go-installation) below used explicit location
approval and a new reviewed plan. Private evidence retains the original blocked
plan separately from the successful run.


## Fresh Go installation

**PASS — Executed, 2026-10-28.** An independent Go consumer used the public
`github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0-dev.1` module, with no local
replacement, and matching GitHub plugin from release source
`17f73ec33153f8e1079aa0136954859ff77d92a1`. It used its own backend/plugin home,
new external deployment/host SSH identities, copied locked NixOS template and
published `nixos-vps@0.1.2` initializer/validator. All twenty bundled core files
matched the independent npm installation; no SDK, provider or installer patch
was required. Module verification, Go compilation and local NixOS/SSH/disk
preflight passed before any retirement.

Helsinki capacity had blocked the first attempt without a cloud mutation. After
explicit approval to use Germany at the same reviewed price, the old preview was
archived and a new create-only plan selected **Nuremberg (`nbg1`)**. This was not
an automatic region/plan fallback. Price and capacity were checked again before
retirement and creation. The exact Python test server, firewall and SSH
registration were retired using a saved plan; both auto-delete IPs were removed
and an empty dedicated project confirmed before Go created its replacement.

| Check | Executed result |
| --- | --- |
| Creation | Exactly one protected CX23, named `nixos-vps`, Ubuntu 24.04 bootstrap and backups disabled |
| Installation | Go program and remote component transform executed; bootstrap SSH, install, post-install SSH and ready phases completed with `installed=true` |
| Readiness | Pinned SSH, public-key-only authentication, active SSH/Caddy, no failed units, HTTP 200 and a distinct Go configuration marker |
| Disk/boot | NixOS 26.05, BIOS, one `/dev/sda` with a nonempty serial, ext4 root and vfat boot; previous test markers absent |
| Controlled reboot | One reboot changed the boot ID; system generation, disk/partitions and pinned SSH/HTTP readiness retained |
| Repeat deployment | Ten `same` plan entries; saved-plan update preserved IDs, inputs, outputs, provider references, protection and installation without another reboot |
| Final inventory | One server, two auto-delete Primary IPs, one firewall and one SSH registration; no backups, snapshots, volumes, networks, floating IPs or load balancers |
| Protection | Component and five managed children protected after installation and repeat deployment |

Initial apply took **4 minutes 18 seconds**. The final account price check stayed
within the reviewed monthly/hourly limits. Only one test VPS existed at any time.
Private evidence retains plan/source hashes, Go locks, encrypted checkpoints,
phase records and before/after readiness. Decrypted state values were compared
only in memory; operator metadata and private identities are not distributed.

This was an authorized billable test, separate from zero-cost engine tests and
registry publication. The unrelated server/project was outside the scoped
credentials and operations. No package, tag or release was published. Fresh
installation is now verified through TypeScript, Python and Go for the recorded
CX23/BIOS cases; other plans, live UEFI, package/kernel upgrades and interrupted
post-formatting recovery remain unverified. These tests do not establish general
production readiness or a real stable-version publication.
