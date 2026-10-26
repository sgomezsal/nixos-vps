# Contributing

Use x86_64 Linux, Node.js 22 or newer, and Nix with `nix-command` and `flakes`
enabled. The development shell supplies Node, Pulumi, SSH and the installer.

## Build and test

From the repository root:

```sh
nix develop
npm ci --ignore-scripts
npm run check
npm test
```

`npm test` runs the component and CLI tests, then installs the package tarball in
an independent consumer project to check its imports, declarations and templates.

For changes to installation, SSH policy, disk layout or lifecycle handling, run
the full suite:

```sh
./scripts/validate.sh
```

It also evaluates and builds NixOS, runs VM checks, checks SSH behavior and
exercises the Pulumi engine against local substitute providers. Allow time and
disk space for Nix builds; cached outputs may be reused.

## Changes and bug reports

Add regression coverage when fixing a functional or security defect. Keep examples
self-contained and use synthetic credentials and temporary state in tests.

For a bug report, include the command, error code, tool versions and a minimal
redacted configuration. Omit tokens, private keys, Pulumi state exports and raw
logs containing sensitive data. See [SECURITY.md](SECURITY.md).

Boot and SSH defaults live in packages/nixos-vps/templates/nixos/base.nix; the
disk layout lives beside it. Update these shared files rather than adding a
second host-specific copy. The full suite compares the shipped template with
the repository example and boots the template in a VM.

Keep documentation commands aligned with the CLI. Changes to the templates should
also be checked through the independent tarball workflow.
