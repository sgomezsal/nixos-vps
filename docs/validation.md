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

## What remains unverified

Actual Hetzner provisioning has not been exercised. The following need provider
integration testing:

- Cloud-init installation of the predetermined SSH host identity.
- Host-key continuity through the actual kexec transition.
- Disk serials, device enumeration, firmware and network behavior.
- Provider update/replacement plans and interrupted-install recovery.

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
