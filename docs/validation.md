# Validation coverage

Last completed full local run: **2026-10-26**. All **44 package tests passed**, with
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

Hosted GitHub Actions passed for commit `909a0d3` on 2026-10-27 UTC:
[Local validation #3](https://github.com/sgomezsal/nixos-vps/actions/runs/40429289654).
That run covers the release metadata preparation. The subsequent release
automation changes require a new hosted run after pushing. npm audit covers npm dependencies;
NixOS package vulnerability assessment is separate. Credential scans cover known
patterns and inspected files, rather than every possible form of secret.

Version `0.1.0` is available on npm. The optional OIDC release workflow is covered
by local syntax and policy tests; its external npm trust and GitHub environment
protections still require configuration and a future hosted execution. Local
release tests never publish, approve staged packages or change registry tags.

The published `0.1.0` tarball was downloaded and its SHA-512 integrity compared
with the original local artifact. An independent project also installed the
package directly from npm and imported `NixosServer` successfully. These checks
used the public registry without npm account credentials or cloud access.

The complete `release:prepare` command also passed in an independent clean source
snapshot: dependency installation, full validation, tarball generation, publish
dry run and manifest creation. The acceptance test prepared an artifact locally without publishing or
accessing Hetzner.
