# Changelog

## 0.2.0-dev.1 — 2026-10-28

- Add independent public-distribution smoke tests and supply the C++ runtime
  needed by Python gRPC wheels in the provider development shell on NixOS.
- Verify protected consumer migration with remote-compatible transforms and a
  saved local-preflight plan before the full preview. A live TypeScript migration
  with the published SDK passed on the existing VPS, retaining cloud resources,
  protection, SSH identity, system and disk. An unchanged preview and repeated
  saved-plan update passed.
- Verify live TypeScript → Python → Go → TypeScript switches with the published
  SDKs on the same stack. Every preview and saved-plan update was unchanged;
  resources, protection, SSH/HTTP readiness, generation and disk were retained.
  Fresh installation through the provider remains unverified.
- Detect opaque alphanumeric Hetzner token assignments in credential scans, with
  regression coverage for detection, safe output and example placeholders.

- Publish matching plugin and TypeScript/Python/Go SDKs from one reviewed commit.
  Verify the first scoped npm OIDC upload, SLSA provenance and independent npm
  signature/attestation audit. PyPI uses OIDC with attestations.
- Verify public artifact hashes and independent consumers. npm processing exceeded
  the first verification window; a verification-only retry passed without
  republishing. Keep scoped `next` on this version and leave `latest` unchanged.

Fresh provider installation on Hetzner remains unverified. This release did not
access Hetzner or modify the live test VPS.

## 0.2.0-dev.0 — 2026-10-28

- Add a private component-provider workspace delegating to `nixos-vps@0.1.2`,
  preserving the resource token and child-resource names.
- Add a language-neutral schema, local TypeScript/Python/Go SDK generation and
  development-plugin packaging with an explicit file allowlist.
- Add engine tests for SDK interoperability, persisted-state migration,
  secrets, lifecycle operations and partial-failure recovery using substitute
  cloud providers. No live stack migration is included.
- Add a provider development shell; keep the published package and its runtime
  unchanged.
- Fix SDK distribution names and the initial API baseline. Pin plugin and SDK
  build dependency graphs and set the explicit plugin download location.
- Prepare reproducible plugin/npm/Python/Go artifacts, verify two independent
  builds and exercise the exact artifacts through offline consumers. Add a
  read-only CI artifact job without publishing or deploying.
- Publish the plugin and Go module through GitHub, the scoped npm SDK
  `@sgomezsal/nixos-vps`, and the Python distribution `pulumi-nixos-vps`.
  Public downloads match the reviewed candidate. PyPI publication uses OIDC
  and attestations; the npm bootstrap used interactive authentication.
- Add separately gated publication jobs and verify registry processing,
  checksums, source identity and safe retry behavior.

## 0.1.2 — 2026-10-27

- Request hierarchical `lsblk` output explicitly during bootstrap and after
  kexec. Without `--tree`, the requested columns returned a flat list on the
  tested Ubuntu image, causing 0.1.1 to stop safely before formatting.
- Add a regression for root-partition ancestry without weakening disk path,
  serial, size or topology checks.
- Make the repository's Nix development shell ignore ambient provider binaries
  so Pulumi selects the plugin version required by the SDK.
- Document a live CX23 installation in Helsinki, authenticated SSH identity
  continuity, public HTTP readiness and an unchanged second deployment.

The live installation used the 0.1.1 npm package with the same runner fix now
included in 0.1.2. It did not provision another server to test the release artifact.
See [validation coverage](docs/validation.md) for evidence and remaining limits.
