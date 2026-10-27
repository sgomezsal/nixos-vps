# Changelog

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
