# Validation coverage

Release-candidate full CI run: **2026-10-27 UTC**, commit `4314d61`. All
**53 package tests passed**, with
no failures or skipped tests. npm audit and credential scans reported no findings
in that run.

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
