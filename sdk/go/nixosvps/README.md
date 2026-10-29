# nixos-vps

Pulumi component SDK (0.2.0).

Creates a new Hetzner server, firewall and SSH key registration, then installs
NixOS using the shared nixos-vps installer. Installation formats the target disk.
Node.js 22+, Nix, OpenSSH and Pulumi are required on x86_64 Linux for every SDK.

Use matching plugin and SDK versions. Installation and the supported scope are
documented in the [multi-language guide](https://github.com/sgomezsal/nixos-vps/blob/main/docs/multilanguage.md).
See the [quickstart](https://github.com/sgomezsal/nixos-vps/blob/main/examples/provider/README.md)
for runnable examples, prerequisites and migration limits. Live validation covers
CX23 with BIOS boot; other plans and interrupted-installation recovery remain
unverified.

The original npm package nixos-vps remains a separate TypeScript interface.
This SDK delegates to the same component through the local provider process.

Licensed under MIT.
