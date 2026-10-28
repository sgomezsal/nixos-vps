# Architecture

`NixosServer` groups Hetzner resources and an initial NixOS installation into a
Pulumi component. The CLI generates a consumer project; the component manages its
infrastructure lifecycle.

## Provisioning sequence

1. **Preflight:** validate local inputs, SSH identities and NixOS policy. Build the
   locked system, disko script and installer, then verify installer integrity.
2. **Infrastructure:** register the deployment public key, create firewall rules
   and create the bootstrap server. Cloud-init supplies its dedicated host identity.
3. **Installation:** connect using the pinned host key, verify the bootstrap OS
   and disk, and enter the kexec environment. Recheck disk identity before formatting
   and installing the built system.
4. **Readiness:** wait for the installed NixOS system and SSH service. Only then
   resolve the component's `ipv4` output.

The child resources are `preflight`, optional `sshKey`, `firewall`, `server` and
`installation`. They are parented to the component. Pulumi outputs and dependencies
connect the stages; provider resources depend on successful preflight.

## SSH identities and state

The initializer creates two Ed25519 key pairs outside the project:

| Identity | Purpose | Private material |
| --- | --- | --- |
| Deployment client | Log in to the server | Remains on the deployment machine |
| Server host | Authenticate the server in every installation phase | Sent in cloud-init user-data and stored as a Pulumi secret |

Preflight checks key permissions, verifies that the client key matches its public
key and rejects reused key material. The runner pins the server's public identity
in a temporary `known_hosts` file. Both the wrapper and installer use strict SSH
verification.

The SSH policy requires public-key authentication. Passwords, keyboard-interactive
authentication and unverified manual policy overrides are rejected before
provisioning. See [security policy](../SECURITY.md#ssh-authentication).

## Disk and installer checks

Nix builds produce immutable system, disko and installer paths. The kexec image
has a fixed SHA-256 hash; the runner verifies the built driver's and payload's
hashes before use.

Installation supports one physical bootstrap root disk. Its path must match
`expectedDisk` and the evaluated disko layout. A nonempty serial is required;
path, size and serial must remain unchanged across kexec. An optional
`expectedDiskSerial` checks an externally known value. Attached data disks and
devices without a stable serial are unsupported.

## Updates and recovery

Initial installation runs when the installation resource is created for a new VM.
An unchanged deployment performs no installation. Ordinary configuration changes
use `nixos-rebuild`; changing a flake path or host configuration does not reinstall
the server. A replacement VM receives a new installation.

The installer refuses an existing NixOS target. After an interrupted installation,
inspect the target and reconcile its state before retrying. Recovery instructions
are in the [package guide](../packages/nixos-vps/README.md#troubleshooting).

## Local workspaces

Initialization stages project files and writes its completion marker last. A
handled failure removes files it created only if they remain unchanged. Abrupt
termination can leave a partial project, which the next invocation refuses to
overwrite.

Clean validation creates a `nixos-vps-clean-` directory under the operating system's
temporary directory. It holds a source snapshot, an empty HOME and test
dependencies. Individual tests manage their own temporary state. Cleanup runs
after success or failure and preserves unrelated neighboring files.

[Validation coverage](validation.md) describes the checks and their limits.

## Experimental component provider

The private `packages/nixos-vps-provider` workspace implements Pulumi's Construct
RPC around the published `nixos-vps@0.1.2` component. A checked-in schema generates
TypeScript, Python and Go SDKs. The token remains
`nixos-vps:hetzner:NixosServer`; the adapter forwards parent/protection options,
dependencies and secrets. It registers the existing server ID and the IPv4
output gated on installation readiness.

The plugin packages its Node.js runtime dependencies, including the original
installer component. Nix and OpenSSH still execute on the Pulumi runner; Python
or Go replaces the consumer language, not the installation toolchain. Local paths
crossing the RPC boundary must be plain absolute paths. Private-key contents are
not SDK arguments.

Engine tests exercise conversion of an ordinary persisted TypeScript graph to
the remote SDKs. Moving the runner into the plugin changes its absolute paths;
the initial migration updates local preflight/update commands without running
installation again or changing cloud resources. Legacy callbacks do not cross the
provider boundary; remote-compatible `transforms` and protected migration plans
are covered in the [migration limits](multilanguage.md#migration-limits). Direct
child-resource access is outside that compatibility guarantee. A published
TypeScript SDK has migrated one existing test stack, followed by Python/Go
switches and a return to TypeScript without cloud-resource changes. Fresh provider
installations remain unverified. See [live evidence](validation.md#live-language-switches).

The provider preview pipeline installs its locked runtime, generates the SDKs
with a pinned CLI and packages their public entry points. Two builds from separate
directories must have identical artifact hashes. Exact-artifact consumer tests
then run before atomic output creation. Ordinary CI uploads private preview
artifacts. A separate manually gated workflow publishes reviewed candidates; the
`0.2.0-dev.1` plugin and SDKs are available from public distribution. See
[multi-language distribution](multilanguage.md) and
[publication controls](provider-publication.md).

## Flakes and shared source

| Flake | Purpose | Who changes it |
| --- | --- | --- |
| Repository root | Development tools, exported modules and local checks | Package maintainers |
| Packaged templates/nixos/flake.nix | Source for an independent consumer project | Package maintainers |
| Generated project nixos/flake.nix | Pin the consumer's Nix inputs and select its host | The server operator |

The packaged [base.nix](../packages/nixos-vps/templates/nixos/base.nix) and
[disk-config.nix](../packages/nixos-vps/templates/nixos/disk-config.nix) are the
single source for both repository hosts and generated projects. Root wrappers add
local checks and fixture configuration. There is no separate repository-only
policy for Git installation, zram or temporary-directory cleanup.

A parity check evaluates the repository example and an independent copy of the
consumer template. It compares installation settings and locked inputs. A VM check
also boots the template configuration itself.

After initialization, operators edit their own nixos/configuration.nix for services,
disk-config.nix for storage and flake.nix/flake.lock for inputs. These are independent
copies; the generated project does not depend on the source repository.

The repository public key was generated exclusively for examples, and its private
counterpart was discarded. It is excluded from the npm tarball. The initializer
creates fresh identities for each consumer project.
