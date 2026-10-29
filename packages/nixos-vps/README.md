# nixos-vps

A TypeScript Pulumi component for provisioning a fresh x86_64 NixOS server on
Hetzner Cloud. It creates the server, SSH key registration and firewall, installs
NixOS from a locked flake, and returns its IP after readiness checks.

Version `0.1.2` includes the disk-inventory fix validated during a live CX23
installation in Helsinki. SSH identity was verified across kexec and the final
boot, public HTTP responded successfully, and a second deployment made no changes.
Normal reboots and a routine `nixos-rebuild` configuration update also passed on
the same server, including booting the updated generation.
The tested scope is CX23 with BIOS boot; other plans, live UEFI and recovery
after interrupted formatting remain unverified. See the repository's
[validation coverage](https://github.com/sgomezsal/nixos-vps/blob/main/docs/validation.md)
for the tested boundaries and fix status.

The unchanged published `0.1.2` runtime also completed a fresh installation through
the `0.2.0-dev.1` component provider. All twenty bundled core files matched this
npm package. Pinned SSH/HTTP checks, a controlled reboot and an unchanged repeat
preview/update passed through separate fresh TypeScript, Python and Go
installations. See
[Go evidence](https://github.com/sgomezsal/nixos-vps/blob/main/docs/validation.md#fresh-go-installation),
[Python evidence](https://github.com/sgomezsal/nixos-vps/blob/main/docs/validation.md#fresh-python-installation)
and [fresh-provider evidence](https://github.com/sgomezsal/nixos-vps/blob/main/docs/validation.md#fresh-provider-installation).

For the published multi-language provider `0.2.0`, use the separate
[TypeScript, Python and Go quickstart](https://github.com/sgomezsal/nixos-vps/blob/main/examples/provider/README.md).
Its SDKs delegate to this `0.1.2` implementation; their version numbers are independent.

## Quickstart

### 1. Install the prerequisites

Use Bash on x86_64 Linux with:

- Node.js 22 or newer and npm.
- Nix 2.24 or newer, with `nix-command` and `flakes` enabled.
- OpenSSH 9 or newer, including `ssh-keygen`.
- Git and Pulumi CLI v3.

The supported deployment runner is x86_64 Linux. Other operating systems and
remote-builder arrangements are outside the tested setup.

If you have the source repository, install Nix first and run `nix develop`
from the repository root. That shell provides Node.js/npm, Pulumi CLI, OpenSSH,
Git and the installer tools, so separate installations are unnecessary. Keep
that shell open for the following commands. Git must already be available to
clone the repository; alternatively, download a source archive.

For an independent npm or tarball consumer, provide the tools listed above through your
own environment. Installing the npm package does not provide the development
shell or install system tools.

Check the tools in the environment you will use:

```sh
node --version
npm --version
nix --version
ssh -V
pulumi version
git --version
```

If Nix flakes are not enabled, enable them for the current shell:

```sh
export NIX_CONFIG='experimental-features = nix-command flakes'
```

Use `nixos-vps@0.1.2` below. For a local tarball instead,
run `npm ci --ignore-scripts` followed by `npm run pack:component` in the repository
inside `nix develop`; the tarball is written to `/tmp`. Replace the package version
in the installation command with its absolute tarball path.

### 2. Create a local project

Start in a new directory outside other projects:

```sh
mkdir my-nixos-vps
cd my-nixos-vps
npm init -y
npm install --ignore-scripts nixos-vps@0.1.2 @pulumi/pulumi
npm install --ignore-scripts --save-dev typescript @types/node
npx nixos-vps init --stack dev \
  --key-directory "$HOME/.ssh/my-nixos-vps" \
  --location nbg1 --server-type cx23 --ports 80,443
git init
git add .
npx nixos-vps validate --stack dev
```

No cloud credentials or backend login are needed for these steps. Nix builds may
download public sources and use substantial disk space, memory and time.

`init` writes the Pulumi project and NixOS templates, then creates two distinct
Ed25519 key pairs outside the project: `deploy` for login and `host` for server
identity. The directory has mode `0700`, private keys have mode `0600`, and only
the deployment public key is copied into `nixos/admin.pub`.

Keys are unencrypted for unattended installation. Protect the workstation and
back them up securely. Repeating `init` with the same options preserves keys and
local edits. Different options, existing unrelated files or a partial project
cause an error instead of an overwrite. Existing `.gitignore` files are preserved;
review them before staging files.

### 3. Review the configuration

`init` writes the actual key paths to `Pulumi.dev.yaml`. Location, server type and
ports are read through `pulumi.Config`:

```yaml
config:
  standalone-nixos:sshPublicKeyPath: /absolute/external/key-directory/deploy.pub
  standalone-nixos:sshPrivateKeyPath: /absolute/external/key-directory/deploy
  standalone-nixos:sshHostKeyPrivatePath: /absolute/external/key-directory/host
  standalone-nixos:location: nbg1
  standalone-nixos:serverType: cx23
  standalone-nixos:tcpPorts: [80, 443]
  standalone-nixos:expectedDisk: /dev/sda
  # Optional: restrict TCP/22 to the deployment runner.
  # standalone-nixos:sshSourceIps: ["203.0.113.10/32"]
```

SSH is public by default; set `sshSourceIps` to restrict access.

`cx23` and `nbg1` are explicit example choices, not stock or price guarantees.
Choose a currently offered x86_64 CX, CPX or CCX plan and check its price and
availability before deployment. CAX/ARM targets are not supported by this package.
For the kexec installation path, choose at least 2 GiB of RAM to leave room for
the RAM installer; smaller plans require separate validation. Only CX23 has live
installation evidence here. See the upstream [system requirements](https://nix-community.github.io/nixos-anywhere/).

The component and initializer retain `cpx22` as their compatibility default;
explicitly set `serverType` rather than assuming that default is currently sold.
Local `validate` checks configuration, not provider stock, pricing or account limits.
An availability response is an indicator, not a reservation: do not delete a
working server assuming a replacement is guaranteed.

The template serves HTTP on port 80. Opening a firewall port does not configure a
service, DNS or HTTPS. Configure workloads in `nixos/configuration.nix` and review
the target disk in `nixos/disk-config.nix`.

Run validation after configuration changes:

```sh
npx nixos-vps validate --stack dev
```

Validation checks inputs, tools, TypeScript, keys, SSH policy, firewall ports and
disk layout, then builds NixOS, disko and the pinned installer. It reads the named
local stack file directly. It does not log in to a backend, connect to the server
or call provider APIs.

Validation preserves project configuration by default. If stack ports differ from
`nixos/ports.json`, it stops with `PORTS_OUT_OF_SYNC`. To apply that specific change:

```sh
npx nixos-vps validate --stack dev --fix
```

`--fix` updates only `nixos/ports.json`, writes a uniquely named backup beside it
and prints the backup path. If later checks fail, it restores the original bytes
and retains the backup. To undo a successful change, copy that backup over
`nixos/ports.json`. Matching ports cause no rewrite or backup. Nix may still
populate its store and caches during validation.

You can stop here to evaluate the package without accessing Hetzner. Before a
deployment, commit the source and lockfiles and preserve the external keys.

### 4. Configure credentials and preview

The following steps access Hetzner. Use a new stack for a fresh server. This example
uses a local Pulumi backend with passphrase encryption:

```sh
umask 077
mkdir -p "$HOME/.local/state/my-nixos-vps"
pulumi login "file://$HOME/.local/state/my-nixos-vps"
read -rsp 'New Pulumi backend passphrase: ' PULUMI_CONFIG_PASSPHRASE
printf '\n'
export PULUMI_CONFIG_PASSPHRASE
pulumi stack init dev --secrets-provider passphrase
read -rsp 'Hetzner project token: ' HCLOUD_TOKEN
printf '\n'
export HCLOUD_TOKEN
npx nixos-vps validate --stack dev
pulumi preview --stack dev
```

Create the project token in the Hetzner console. Enter it interactively; keep it
out of command arguments, source and Nix configuration. Store the backend
passphrase in a password manager: losing it prevents state recovery. SOPS
`exec-env` can supply `HCLOUD_TOKEN` as an alternative to the interactive prompt.

Preview contacts Hetzner. Review the plan, pricing, disk layout and any replacement
operations before proceeding.

### 5. Deploy and connect

This creates a billable server and formats its configured disk:

```sh
pulumi up --stack dev
```

The generated template enables resource protection. Deleting or replacing a server
can destroy its root disk; keep independent backups.

Pin the host identity already generated for this server, then connect:

```sh
server_ip=$(pulumi stack output ipv4 --stack dev)
mkdir -p "$HOME/.ssh"
printf '%s %s\n' "$server_ip" \
  "$(ssh-keygen -y -f "$HOME/.ssh/my-nixos-vps/host")" >> "$HOME/.ssh/known_hosts"
ssh -o StrictHostKeyChecking=yes -i "$HOME/.ssh/my-nixos-vps/deploy" root@"$server_ip"
```

### 6. Update NixOS

Use `nixos-rebuild` for later configuration changes. If it is not installed on the
workstation, obtain it from the pinned inputs:

```sh
NIX_SSHOPTS="-o StrictHostKeyChecking=yes -i $HOME/.ssh/my-nixos-vps/deploy" \
  nix shell --inputs-from ./nixos nixpkgs#nixos-rebuild \
  --command nixos-rebuild switch --flake ./nixos#web \
  --target-host root@"$server_ip"
```

Initial installation and routine updates are separate. Flake or path edits do not
rerun installation. A replacement VM receives a new installation; an existing
NixOS target is rejected by the installer.

### 7. Retire a server intentionally

Keep resource protection enabled during ordinary use. To retire a server, first
preserve any application data and the encrypted Pulumi state, and confirm the
project, backend, stack and exact resource IDs. Only then explicitly remove
protection from the resources you intend to delete. Preview the destruction:

```sh
pulumi destroy --preview-only --stack dev
```

Review every deletion before running `pulumi destroy --stack dev` interactively.
Do not use a broad unprotect operation on a stack containing unrelated resources.
Deleting the server destroys its root disk. Check Hetzner afterwards for retained
Primary IPs, volumes or snapshots: they can continue billing independently.
Powering off a server does not stop billing. See [Cloud billing](https://docs.hetzner.com/cloud/billing/faq/).

## Component API

For an existing TypeScript Pulumi project:

```ts
import { NixosServer } from "nixos-vps";

const server = new NixosServer("web", {
  flakeDirectory: "/checkout/my-nixos-flake",
  configuration: "web",
  installer: "/checkout/nixos-vps#nixos-anywhere",
  sshPublicKeyPath: "/keys/deploy.pub",
  sshPrivateKeyPath: "/keys/deploy",
  sshHostKeyPrivatePath: "/keys/dedicated-server-host-key",
  serverType: "cx23",
  location: "nbg1",
  tcpPorts: [80, 443],
}, { protect: true });

export const ipv4 = server.ipv4;
```

`flakeDirectory` must contain a lockfile and the selected `nixosConfigurations`
entry, including disko. `installer` must resolve to the bundled hardened
`nixos-anywhere` package. The standalone template defines it in its own flake;
source users can also use the repository's exported package and
`nixosModules.hetzner-cloud` module.

| Optional input | Default | Purpose |
| --- | --- | --- |
| `expectedDisk` | `/dev/sda` | Whole root disk; must match disko |
| `expectedDiskSerial` | omitted | Externally known disk serial |
| `serverType` | `cpx22` | Compatibility default; explicitly select a currently offered x86_64 plan |
| `location` | `nbg1` | Hetzner location |
| `bootstrapImage` | `ubuntu-24.04` | Ubuntu or Debian bootstrap image |
| `existingSshKeyIds` | omitted | Existing SSH key IDs in the Hetzner project |
| `sshSourceIps` | all IPv4/IPv6 | Allowed sources for TCP/22 |
| `tcpPorts` | `[]` | Additional public TCP ports; also open them in NixOS |
| `labels` | omitted | Hetzner server labels |
| `sshTimeoutSeconds` | `600` | SSH readiness timeout |

The generated web template chooses ports 80 and 443; the component's default opens
only SSH. Credentials come from `HCLOUD_TOKEN` or an explicit provider in component
options. Nix and SSH subprocesses receive a restricted environment without cloud
or SOPS credentials.

`ipv4` waits for installation to complete. `serverId` identifies the VM. Exposed
children are `preflight`, `sshKey` when created, `firewall`, `server` and
`installation`. Standard Pulumi parent, provider, protection and dependency options
are supported.

## Installation requirements

Keep both private keys outside the project with mode `0600`. The client key stays
local. The host private key is sent in cloud-init user-data and stored as a Pulumi
secret; protect both backend and provider metadata access.

The NixOS configuration must enable root SSH on port 22 with the deployment public
key and these settings:

```nix
services.openssh.settings = {
  PasswordAuthentication = false;
  KbdInteractiveAuthentication = false;
  PubkeyAuthentication = true;
  AuthenticationMethods = "publickey";
  PermitRootLogin = "prohibit-password";
};
```

`without-password` is also accepted for root login. Raw authentication directives,
`Match` blocks, `Include` files and deprecated authentication overrides are rejected
during initial provisioning. Configure the canonical settings above.

Disk checks require one physical root disk, the expected path and a nonempty
serial. Path, size and serial must match after kexec. Attached data disks and disks
without usable serials are unsupported. A stable disk serial was verified on the
tested CX23 in Helsinki; other provider configurations remain unverified.

The installer pins the server's host key in every phase and checks a SHA-256-pinned
kexec payload. Unknown identities and integrity mismatches stop installation.

## Troubleshooting

| Error | Action |
| --- | --- |
| `PORTS_OUT_OF_SYNC` | Review stack ports; use `validate --stack NAME --fix` to synchronize |
| `TYPESCRIPT_CHECK` | Run the printed TypeScript command and fix the reported types |
| `SSH_KEY_FILE` | Correct key paths or permissions; preserve existing identities |
| `SSH_AUTH_POLICY`, `SSH_AUTH_OVERRIDES` | Apply the SSH settings above and remove unsupported overrides |
| `SSH_HOST_IDENTITY` | Verify the host key through trusted console access; keep checking enabled |
| `SSH_AUTHENTICATION` | Check the login key, authorized keys and root SSH policy |
| `SSH_REFUSED`, `SSH_NETWORK`, `SSH_DNS` | Check sshd, address, firewall rules and allowed sources |
| `NIX_FAILED`, `INSTALLER_MANIFEST` | Inspect the locked build or required installer metadata |
| Disk safety errors | Inspect the intended disk, topology and serial through trusted access |

The runner prints stage names and classified errors. Raw build/install output is
suppressed to reduce secret exposure in logs and state. Use the diagnostic command
from an error in a controlled terminal; redact output before sharing it. Child
commands have a 45-minute timeout, and the installation resource has a 60-minute
create timeout. SSH readiness defaults to 600 seconds. Failure does not produce a
ready IP.

After an interrupted installation, inspect the OS and disk through trusted access.
For an installed NixOS target, use `nixos-rebuild` and reconcile Pulumi state. For an
incomplete RAM installer, preserve logs and data and recover through rescue access.
Unattended reformatting recovery is unsupported. Restore a bootstrap image only on
a disposable VM. Live recovery has been tested only for a failure before kexec
or formatting; recovery after either operation remains unverified.

For interrupted `init`, preserve the partial project and keys. Handled errors roll
back newly created, unchanged files. Abrupt termination or external edits may
leave a partial state that `init` refuses to overwrite. Inspect and restore a
coherent project before retrying; do not regenerate identities already in use.

## Validation limits

Local tests cover package installation, NixOS builds and VMs, SSH behavior and
Pulumi lifecycle operations with substitute providers. Live testing covers CX23 in Helsinki with Ubuntu 24.04 bootstrap and BIOS boot, including SSH identity
continuity, disk checks, public HTTP, normal reboots and a routine configuration
update. Other provider configurations, live UEFI, package/kernel upgrades and
recovery after kexec or formatting remain unverified. This component does not
migrate existing resources, DNS, volumes, runtime secrets or application data.

## Flake layout

The repository's root flake supplies development tools and local checks. The CLI
copies the packaged templates/nixos directory into your project as nixos/.

| Generated file | Change it to configure |
| --- | --- |
| nixos/configuration.nix | Services and host-specific settings |
| nixos/disk-config.nix | Storage layout; review before installation |
| nixos/flake.nix and flake.lock | Pinned inputs and host selection |
| nixos/base.nix | Shared boot, network and SSH defaults |

The repository hosts import the same base and disk files that ship in the package.
Tests check that their initial settings agree. Your generated project is an
independent copy and can be customized without editing the package repository.

## Security reports

Report suspected vulnerabilities privately to [contact@sgomezsal.com](mailto:contact@sgomezsal.com).
Do not include credentials, private keys, state exports or unredacted logs. For the
security model, see [SECURITY.md](https://github.com/sgomezsal/nixos-vps/blob/main/SECURITY.md).
