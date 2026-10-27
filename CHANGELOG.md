# Changelog

## Unreleased — component provider development

- Add a private component-provider workspace delegating to `nixos-vps@0.1.2`,
  preserving the resource token and child-resource names.
- Add a language-neutral schema, local TypeScript/Python/Go SDK generation and
  development-plugin packaging with an explicit file allowlist.
- Add engine tests for SDK interoperability, persisted-state migration,
  secrets, lifecycle operations and partial-failure recovery using substitute
  cloud providers. No live stack migration or SDK publication is included.
- Add a provider development shell; keep the published package and its runtime
  unchanged.
- Fix SDK distribution names and the initial API baseline. Pin plugin and SDK
  build dependency graphs and set the explicit plugin download location.
- Prepare reproducible plugin/npm/Python/Go artifacts, verify two independent
  builds and exercise the exact artifacts through offline consumers. Add a
  read-only CI artifact job without publishing or deploying.

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
