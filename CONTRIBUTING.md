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

## Release preparation

The workspace root is intentionally private; only `packages/nixos-vps` is
publishable. The package defaults to the public npm registry and the `next` tag
because live Hetzner provisioning remains unverified. Publication is manual;
CI has no publishing step or npm credentials.

Before a release:

1. Run `./scripts/validate.sh` and require a successful GitHub Actions run for the
   exact commit being released.
2. Confirm the version, npm name availability and the publishing account's rights.
   A registry 404 is not a reservation or a guarantee that a name is publishable.
3. Build and inspect the artifact from the repository root:

   ```sh
   npm run pack:component
   npm publish /tmp/nixos-vps-0.1.0.tgz --dry-run --ignore-scripts --access public --tag next --registry=https://registry.npmjs.org/
   ```

   The dry run does not upload the package. Independent tarball consumption and
   dry-run package contents are also checked by `npm test`.
4. Only when intentionally publishing, authenticate with npm and publish that
   inspected artifact:

   ```sh
   npm login --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   npm publish /tmp/nixos-vps-0.1.0.tgz --access public --tag next --registry=https://registry.npmjs.org/
   ```

   Complete any authentication or two-factor prompts locally. Never commit npm
   tokens or place them in command arguments. Do not publish all workspaces.
5. Verify the registry version and tarball integrity, tag the released commit and
   create matching GitHub release notes. Update the README's unpublished status
   only after the release is confirmed. Consumers can then install
   `nixos-vps@next` or pin `nixos-vps@0.1.0`.

Replace the example version and tarball path for subsequent releases. Removing
`private: true` from the package enables an explicit publish command; it does not
publish automatically. Keep the workspace root private.
