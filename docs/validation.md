# Validation coverage

Latest completed full CI run: **2026-10-27 UTC**, commit `264fc46`. All
**52 package tests passed**, with
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
This local evidence does not replace the historical full-CI evidence above or
claim that either fix is already published.

### Remaining provider-specific checks

- Other locations, server families, bootstrap images and live UEFI boot.
- Real-provider infrastructure updates, replacements and deletion; those lifecycle
  paths remain covered by the local substitute-provider tests.
- Recovery from failures after kexec or after formatting. The observed recovery
  covered a failure before either operation.
- Long-term operation, routine NixOS updates and a broader vulnerability review.

## Release evidence

The [0.1.1 release run](https://github.com/sgomezsal/nixos-vps/actions/runs/40441429445)
prepared the artifact, transferred it between jobs and submitted it through OIDC.
Its final verification exceeded the old fifty-second window before npm made the
version visible. The original artifact was subsequently verified locally:
version 0.1.1, the next tag and downloaded SHA-512 integrity all matched.
The source run, repository and commit were also checked against its manifest.

An independent project installed 0.1.0 directly from npm and imported
NixosServer successfully. Current local tarball consumption tests also pass.
The complete release:prepare command previously passed in a clean independent
snapshot, including full validation, tarball generation, dry run and manifest.
None of those local tests published or accessed Hetzner.

For the verification recovery change, all 52 package tests, build and declaration
checks, independent tarball consumption, npm audit and syntax checks for all three
workflows passed. An injected clock covers delays beyond fifty seconds and the
bounded deadline without actual waits. Other regressions reject invalid options,
artifact integrity mismatches and source-run identity mismatches, and check that
the verify-only workflow has read-only permissions and no publication commands.
The hidden-artifact regression uses the pinned upload action's glob engine.

The [full CI run](https://github.com/sgomezsal/nixos-vps/actions/runs/40446722126)
and [verification-only run](https://github.com/sgomezsal/nixos-vps/actions/runs/40447258950)
both passed for commit `264fc46`, using Ubuntu 24.04 and the Node 24 artifact
actions. Verification confirmed the published 0.1.1 artifact and the next tag.
The four VM tests executed in earlier validation; cached successes in subsequent
runs do not represent new VM executions.

npm audit covers npm dependencies, not a comprehensive NixOS vulnerability review.
Credential scans cover known patterns and inspected files, rather than every
possible form of secret. Registry tags are checked separately from immutable
version and artifact identity; historical verification can allow next to move.
