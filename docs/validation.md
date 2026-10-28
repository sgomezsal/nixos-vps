# Validation coverage

The core `0.1.2` release-candidate CI ran on **2026-10-27 UTC**, commit
`4314d61`. All
**53 package tests passed**, with
no failures or skipped tests. npm audit and credential scans reported no findings
in that run.

The published multi-language prerelease and protected migration checks are
recorded under [distribution evidence](#multi-language-prerelease-distribution).
Earlier development runs below are historical evidence, not current release status.

## Latest offline review — 2026-10-28

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
is fresh installation through the new provider and its first npm OIDC upload.

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
| Experimental component provider | Installed local plugin, generated TypeScript/Python/Go SDKs, persisted-state interoperability and failure recovery | `npm run test:provider` |

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

The published experimental provider is built from commit
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
an actual npm OIDC upload has not yet been exercised. The first manual npm
publication does not test that upload path. No Hetzner account or
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
