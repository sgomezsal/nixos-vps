---
title: nixos-vps
meta_desc: Provision reproducible NixOS servers on Hetzner Cloud with the nixos-vps Pulumi component.
layout: package
---

`nixos-vps` provisions a new [Hetzner Cloud](https://www.hetzner.com/cloud) server,
SSH key registration and firewall, then installs NixOS from your locked flake.
TypeScript, Python and Go SDKs call the same local component provider and installer.
The IPv4 output resolves after installation and pinned SSH readiness checks.

**Installation repartitions and formats the target disk.** Use a new or
intentionally disposable server. Routine OS updates use `nixos-rebuild`, not a
second installation. For retained deployments, enable Pulumi resource protection
and review the planned operations before applying them.

## Installation

All SDKs require **x86_64 Linux, Node.js 22+, Nix 2.24+ with flakes, OpenSSH 9+,
Git and Pulumi CLI v3** on the deployment runner. Python and Go also require their
language runtime/toolchain. The repository's `nix develop .#provider` shell supplies
the development tools after Nix itself is installed.

The commands install published `0.2.0`; see the
[release](https://github.com/sgomezsal/nixos-vps/releases/tag/v0.2.0).
Use the same SDK and plugin version. The separate npm package `nixos-vps@0.1.2`
is the original TypeScript component, not this generated SDK.

{{< chooser language "typescript,python,go" >}}
{{% choosable language typescript %}}

```sh
npm install --ignore-scripts @sgomezsal/nixos-vps@0.2.0
```

{{% /choosable %}}
{{% choosable language python %}}

Inside a Python virtual environment:

```sh
python -m pip install pulumi-nixos-vps==0.2.0
```

{{% /choosable %}}
{{% choosable language go %}}

Inside an initialized Go module:

```sh
go get github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0
```

{{% /choosable %}}
{{< /chooser >}}

Pulumi can acquire the matching plugin from GitHub through the SDK metadata.
The plugin includes its Node dependencies; Node.js itself remains a prerequisite
for every language. For complete project initialization, separate SSH identities,
a locked NixOS template and local validation, follow the
[consumer quickstart](https://github.com/sgomezsal/nixos-vps/blob/main/examples/provider/README.md).

## Example Usage

These programs use a copied flake exporting `nixosConfigurations.web` and the
pinned `nixos-anywhere` installer package. First configure their shared inputs:

```sh
pulumi config set flakeDirectory /absolute/path/to/project/nixos
pulumi config set sshPublicKeyPath /absolute/external/keys/deploy.pub
pulumi config set sshPrivateKeyPath /absolute/external/keys/deploy
pulumi config set sshHostKeyPrivatePath /absolute/external/keys/host
pulumi config set serverType cx23
pulumi config set location nbg1
```

Use your actual paths. The deployment and host identities must be distinct;
private keys must be outside the flake with restrictive permissions. Run the
quickstart's local validation before deployment. Capacity and account prices must
be checked separately; the example location/plan is not a reservation.

Supply `HCLOUD_TOKEN` through your credential manager to the process running
Pulumi, or configure the underlying Hetzner provider securely. Never put a token
or private key contents in the Nix flake. This component has no separate token
input. See the [security model](https://github.com/sgomezsal/nixos-vps/blob/main/SECURITY.md).

{{< chooser language "typescript,python,go" >}}
{{% choosable language typescript %}}

```typescript
import * as pulumi from "@pulumi/pulumi";
import {hetzner} from "@sgomezsal/nixos-vps";

const config = new pulumi.Config();
const flakeDirectory = config.require("flakeDirectory");
const server = new hetzner.NixosServer("web", {
    flakeDirectory,
    configuration: config.get("configuration") ?? "web",
    installer: `${flakeDirectory}#nixos-anywhere`,
    sshPublicKeyPath: config.require("sshPublicKeyPath"),
    sshPrivateKeyPath: config.require("sshPrivateKeyPath"),
    sshHostKeyPrivatePath: config.require("sshHostKeyPrivatePath"),
    serverType: config.get("serverType") ?? "cx23",
    location: config.get("location") ?? "nbg1",
    tcpPorts: config.getObject<number[]>("tcpPorts") ?? [80, 443],
    sshSourceIps: config.getObject<string[]>("sshSourceIps"),
    expectedDisk: config.get("expectedDisk") ?? "/dev/sda",
});

export const ipv4 = server.ipv4;
export const serverId = server.serverId;
```

{{% /choosable %}}
{{% choosable language python %}}

```python
import pulumi
from pulumi_nixos_vps.hetzner import NixosServer

config = pulumi.Config()
flake_directory = config.require("flakeDirectory")
ports = config.get_object("tcpPorts")
server = NixosServer(
    "web",
    flake_directory=flake_directory,
    configuration=config.get("configuration") or "web",
    installer=f"{flake_directory}#nixos-anywhere",
    ssh_public_key_path=config.require("sshPublicKeyPath"),
    ssh_private_key_path=config.require("sshPrivateKeyPath"),
    ssh_host_key_private_path=config.require("sshHostKeyPrivatePath"),
    server_type=config.get("serverType") or "cx23",
    location=config.get("location") or "nbg1",
    tcp_ports=ports if ports is not None else [80, 443],
    ssh_source_ips=config.get_object("sshSourceIps"),
    expected_disk=config.get("expectedDisk") or "/dev/sda",
)
pulumi.export("ipv4", server.ipv4)
pulumi.export("serverId", server.server_id)
```

{{% /choosable %}}
{{% choosable language go %}}

```go
package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
	"github.com/sgomezsal/nixos-vps/sdk/go/nixosvps/hetzner"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		c := config.New(ctx, "")
		flake := c.Require("flakeDirectory")
		configuration := c.Get("configuration")
		if configuration == "" {
			configuration = "web"
		}
		serverType := c.Get("serverType")
		if serverType == "" {
			serverType = "cx23"
		}
		location := c.Get("location")
		if location == "" {
			location = "nbg1"
		}
		ports := []int{80, 443}
		if err := c.GetObject("tcpPorts", &ports); err != nil {
			return err
		}
		var sources []string
		if err := c.GetObject("sshSourceIps", &sources); err != nil {
			return err
		}
		var sshSources pulumi.StringArrayInput
		if sources != nil {
			values := make(pulumi.StringArray, len(sources))
			for index, source := range sources {
				values[index] = pulumi.String(source)
			}
			sshSources = values
		}
		disk := c.Get("expectedDisk")
		if disk == "" {
			disk = "/dev/sda"
		}
		server, err := hetzner.NewNixosServer(ctx, "web", &hetzner.NixosServerArgs{
			FlakeDirectory:        flake,
			Configuration:         configuration,
			Installer:             flake + "#nixos-anywhere",
			SshPublicKeyPath:      c.Require("sshPublicKeyPath"),
			SshPrivateKeyPath:     c.Require("sshPrivateKeyPath"),
			SshHostKeyPrivatePath: c.Require("sshHostKeyPrivatePath"),
			ServerType:            pulumi.StringPtr(serverType),
			Location:              pulumi.StringPtr(location),
			TcpPorts:              ports,
			SshSourceIps:          sshSources,
			ExpectedDisk:          &disk,
		})
		if err != nil {
			return err
		}
		ctx.Export("ipv4", server.Ipv4)
		ctx.Export("serverId", server.ServerId)
		return nil
	})
}
```

{{% /choosable %}}
{{< /chooser >}}

## Configuration

The SDK exposes component inputs, not a separate provider configuration schema.
The examples read project configuration with `pulumi.Config` (or its Go equivalent)
and derive `installer` from `flakeDirectory`. Paths below are plain strings,
not secret Outputs; pass paths rather than key contents. Private key contents and
credentials must stay secret. Python uses snake_case argument names and Go uses
exported field names.

| Component input | Required | Secret value? | Meaning |
| --- | --- | --- | --- |
| `flakeDirectory` | Yes | No | Absolute local directory containing the flake and lockfile |
| `configuration` | Yes | No | NixOS configuration attribute; examples use `web` |
| `installer` | Yes | No | Absolute local flake package reference or explicit pinned installer URL |
| `sshPublicKeyPath` | Yes | No | Absolute deployment public key path |
| `sshPrivateKeyPath` | Yes | Path only | Absolute deployment private key path, outside the flake |
| `sshHostKeyPrivatePath` | Yes | Path only | Separate Ed25519 host private key path, outside the flake |
| `expectedDisk` | No | No | Whole target disk; default `/dev/sda`; must match disko |
| `expectedDiskSerial` | No | No | Optional externally verified serial; installation also checks observed disk identity |
| `serverType` | No | No | x86_64 CX/CPX/CCX plan; compatibility default `cpx22`; examples explicitly select `cx23` |
| `location` | No | No | Hetzner location code; default `nbg1` |
| `bootstrapImage` | No | No | Ubuntu/Debian bootstrap image; default `ubuntu-24.04` |
| `existingSshKeyIds` | No | No | Existing deployment key IDs instead of registering a new key; they must correspond to the deployment identity |
| `sshSourceIps` | No | No | Nonempty allowed SSH CIDRs; must include the deployment runner; default public IPv4/IPv6 |
| `tcpPorts` | No | No | Additional public TCP ports; the OS firewall must also allow them; examples use 80/443 |
| `labels` | No | No | Public Hetzner labels; do not include secrets |
| `sshTimeoutSeconds` | No | No | SSH readiness timeout, 1–3600 seconds; default 600 |

`ipv4` is the readiness-gated asynchronous output. `serverId` identifies the
server and does not by itself mean installation is complete. The remote SDK does
not expose the original TypeScript component's child resource objects.

## Supported scope

Live fresh-installation evidence covers CX23 with BIOS boot: TypeScript and
Python in Helsinki, and Go in Nuremberg. Each passed pinned SSH/HTTP checks,
one controlled reboot and an unchanged repeat deployment. See
[executed validation](https://github.com/sgomezsal/nixos-vps/blob/main/docs/validation.md).
Other server types, live UEFI, package/kernel upgrades and recovery after
interrupted formatting remain unverified. ARM/CAX and other runner platforms are
outside this release's supported scope. This evidence is not a general
production-readiness guarantee.
