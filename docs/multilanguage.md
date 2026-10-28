# Multi-language provider prerelease

The component provider has a published experimental `0.2.0-dev.1` prerelease.
The existing npm package
`nixos-vps@0.1.2` remains unchanged. These SDKs call the same implementation
through a local Node.js provider; Python and Go do not replace the installer.

## Names and versions

| Interface | Name | Version |
| --- | --- | --- |
| Existing TypeScript component | npm `nixos-vps` | 0.1.2, already published |
| Remote TypeScript SDK | npm `@sgomezsal/nixos-vps` | 0.2.0-dev.1 |
| Python SDK | distribution `pulumi-nixos-vps`, import `pulumi_nixos_vps` | 0.2.0.dev1 |
| Go SDK | `github.com/sgomezsal/nixos-vps/sdk/go/nixosvps` | v0.2.0-dev.1 |
| Local provider plugin | `nixos-vps`, x86_64 Linux | 0.2.0-dev.1 |

## Install the published prerelease

On x86_64 Linux, with Node.js 22+, Pulumi and the deployment prerequisites
available, choose one SDK in your own project:

```sh
# TypeScript
npm install --ignore-scripts @sgomezsal/nixos-vps@0.2.0-dev.1

# Python (inside a virtual environment)
python -m pip install pulumi-nixos-vps==0.2.0.dev1

# Go (inside an initialized module)
go get github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0-dev.1
```

Install the matching plugin explicitly, or let Pulumi acquire it from the SDK's
recorded GitHub download URL:

```sh
pulumi plugin install resource nixos-vps 0.2.0-dev.1 --exact \
  --server github://api.github.com/sgomezsal/nixos-vps
```

These commands install software; they do not create a server. Python and Go
still require Node.js because the plugin hosts the existing TypeScript component.
Use exact prerelease versions. The scoped package's `next` tag selects
`0.2.0-dev.1`; `latest` still selects `0.2.0-dev.0`. Neither is a stable provider
release. The separate unscoped `nixos-vps` package remains at `0.1.2`.

See [publication evidence](validation.md#multi-language-prerelease-distribution)
for the first prerelease, and [OIDC release evidence](validation.md#npm-oidc-prerelease)
for the current release. A published TypeScript consumer has
[migrated an existing Hetzner test stack](validation.md#live-typescript-provider-migration)
without replacing or reinstalling the server. Subsequent
[Python/Go switches and a return to TypeScript](validation.md#live-language-switches)
retained that same state and server. A subsequent
[fresh installation](validation.md#fresh-provider-installation) through the
published `0.2.0-dev.1` TypeScript SDK passed on a new CX23, including a normal
reboot and an unchanged repeat update. Fresh creation through Python/Go was not
separately executed.

The resource token stays `nixos-vps:hetzner:NixosServer`. Its initial contract is
checked against `packages/nixos-vps-provider/api-baseline.json`: sixteen inputs,
six required inputs, and the `ipv4` and `serverId` outputs. Paths are plain absolute
paths on the Pulumi runner. Provide paths to private keys, never their contents.
Infrastructure inputs retain Pulumi dependencies and secret annotations. The
server ID identifies the resource; only `ipv4` is gated on installation readiness.

The SDK entry points are:

```typescript
import {hetzner} from "@sgomezsal/nixos-vps";
// new hetzner.NixosServer("web", args, options)
```

```python
from pulumi_nixos_vps.hetzner import NixosServer
# NixosServer("web", **args, opts=options)
```

```go
import "github.com/sgomezsal/nixos-vps/sdk/go/nixosvps/hetzner"
// hetzner.NewNixosServer(ctx, "web", args, options...)
```

The [component schema](../packages/nixos-vps-provider/schema.json) defines the
argument names, types and defaults. Python uses snake_case names; Go uses exported
field names such as `FlakeDirectory`. All three require `flakeDirectory`,
`configuration`, `installer`, `sshPublicKeyPath`, `sshPrivateKeyPath` and
`sshHostKeyPrivatePath` in their language's naming convention. The existing
[NixOS/SSH setup guide](../packages/nixos-vps/README.md#quickstart) describes the
required flake and separate SSH identities. Its generated TypeScript program
targets the original component, not these remote SDKs.

Node.js 22+, Nix with flakes, OpenSSH, Git and Pulumi are still required on
x86_64 Linux for every language. Python and Go additionally require their own
language runtime/toolchain. Installation formats the target disk; local SDK
validation does not authorize a deployment.

## Prepare without publishing

From the repository root with Nix already installed:

```sh
nix develop .#provider
npm ci --ignore-scripts
./scripts/validate.sh
npm run provider:prepare
npm run provider:verify
```

`provider:prepare` builds the component/provider, generates all SDKs using the
pinned Pulumi CLI, and builds the six artifacts twice in different temporary
directories. Every artifact must have the same SHA-256 in both builds. It then
tests those exact plugin/npm/wheel/sdist/Go files through independent consumers
and the real Pulumi engine with substitute cloud providers. The final output
appears atomically at `.provider-release/` only after success. The command refuses
to overwrite an existing output; preserve an earlier preview elsewhere before
preparing another one.

The output contains:

- `pulumi-resource-nixos-vps-v0.2.0-dev.1-linux-amd64.tar.gz`
- `sgomezsal-nixos-vps-0.2.0-dev.1.tgz`
- `pulumi_nixos_vps-0.2.0.dev1-py3-none-any.whl`
- `pulumi_nixos_vps-0.2.0.dev1.tar.gz`
- `nixos-vps-go-0.2.0-dev.1.tar.gz`
- `schema.json`, `manifest.json` and `SHA256SUMS`

The manifest records the source commit, whether the working tree was dirty, a
source-content digest, the Nixpkgs revision, tool versions, lockfile hashes,
artifact hashes and the completed integration/reproducibility checks. Local
development may record a dirty tree; CI accepts only its clean checked-out commit.
`provider:verify` checks identity, schema, locks, expected filenames and file
integrity. It does not rerun the engine tests and is not a signature or proof of
authorship: obtain the manifest and artifacts from the same trusted CI run.

## Local artifact installation

For complete setup commands and runnable programs, follow the
[three-language setup guide](../examples/provider/README.md). It includes
key generation, real local Nix validation, language-specific dependencies and
offline engine tests. It uses published packages by default; use the local
artifact commands below in a separate project when testing previews. The short commands below are only artifact installation.

Use a disposable local project/backend for preview testing. Do not migrate an
existing cloud stack merely to try the SDK. Download or copy the whole artifact
directory, check out its matching source version, and verify it first:

```sh
node scripts/provider-release.cjs verify /absolute/path/to/artifacts
pulumi plugin install resource nixos-vps 0.2.0-dev.1 \
  --file /absolute/path/to/artifacts/pulumi-resource-nixos-vps-v0.2.0-dev.1-linux-amd64.tar.gz \
  --exact
```

The plugin archive includes its Node dependencies; Node itself must be on PATH.
Install the chosen SDK artifact in the consumer's own environment:

```sh
# TypeScript project
npm install --ignore-scripts /absolute/path/to/artifacts/sgomezsal-nixos-vps-0.2.0-dev.1.tgz

# Python project, inside its virtual environment
python -m pip install /absolute/path/to/artifacts/pulumi_nixos_vps-0.2.0.dev1-py3-none-any.whl

# Go project: extract the module to a separate local directory
# First create the project with go mod init and add your main.go imports.
mkdir -p /absolute/path/to/local-module
tar -xzf /absolute/path/to/artifacts/nixos-vps-go-0.2.0-dev.1.tar.gz \
  -C /absolute/path/to/local-module
go mod edit -replace=github.com/sgomezsal/nixos-vps/sdk/go/nixosvps=/absolute/path/to/local-module/nixosvps
go mod edit -require=github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0-dev.1
go mod tidy
```

These commands install files and dependencies; they do not provision a server.
For these local preview artifacts, the Node SDK remains `private: true` and the
preview manifest says `publishable: false`. Published candidates use separate
metadata; the workspace root and provider workspace remain private.

## Build and release boundaries

The [publication guide](provider-publication.md) describes the separate
`provider-release.yml` workflow, explicit publication candidates, protected
environments, registry setup and retry behavior. Publication remains disabled
until a maintainer enables it and approves a destination. The ordinary preview
commands above still produce a private npm SDK.

The plugin uses `runtime/package-lock.json` with `npm ci --ignore-scripts`; it does
not resolve a fresh dependency graph during packaging. SDK build dependencies use
`sdk-node-lock.json`, the checked-in Go module graph/checksums and the Python build
tools supplied by the locked Nix shell. Python SDK runtime dependencies are pinned
directly; consumers should keep their own environment lockfiles for transitive
dependencies. Reproducibility is tested within this pinned Linux build environment,
not promised across arbitrary operating systems or tool versions.

When upgrading dependencies, edit the intended direct versions first, refresh the
runtime npm lock in its own directory with `--workspaces=false`, regenerate the
SDK into a temporary directory, refresh its npm lock and run `go mod tidy` there.
Copy the reviewed SDK lock and Go module/checksum files back to the provider
workspace. Update the root npm lock after changing workspace metadata. Review the
diffs and repeat the complete preparation; do not hand-edit integrity hashes or
automatically replace the API baseline to make a failing test pass.

CI runs full local validation before preparing previews and uploading their
eight output files. It has read-only repository permissions, no publishing tokens,
no OIDC write permission and no publish/deploy step. Hosted validation and guarded publication have passed; see the linked
publication evidence for the source commit and workflow runs.

Public distribution uses the schema's explicit
`github://api.github.com/sgomezsal/nixos-vps` plugin URL and Pulumi's standard
archive filename. The plugin release tag is `v0.2.0-dev.1`. A published
Go module uses generated source under `sdk/go/nixosvps`
and the separate submodule tag `sdk/go/nixosvps/v0.2.0-dev.1`. Candidate preparation
checks the source against its archive; preparation never creates either release
tag. Future releases still require registry trust, explicit candidate preparation
and a separate release review. See the official
[plugin distribution documentation](https://www.pulumi.com/docs/iac/guides/building-extending/packages/executable-plugin/).

## Migration limits

The offline engine tests preserve resource identifiers across the original
TypeScript component and all three SDKs. The first move into the bundled plugin
updates absolute local runner paths, executing preflight and the non-destructive
installation update command. It does not reinstall NixOS or change cloud resources
in those tests. Later unchanged deployments and switches to Python/Go are no-ops.

One existing TypeScript stack has been migrated with the published SDK; live
Python and Go switches also retained its resources. Legacy
JavaScript `transformations` callbacks
do not cross the remote component boundary. Use Pulumi's newer `transforms`
option for such policies and test the exact consumer before migration. Direct
access to child resources is outside this contract.

A protected consumer can initially receive speculative replacement proposals:
changed local runner paths make preflight outputs unknown during preview. Do not
remove protection or apply the full plan to resolve that uncertainty. The engine
regression exercises a saved plan targeting only the existing local preflight,
then repeats the full preview after those outputs are known. It preserves the
physical server name, disabled backups, protection and single-server/budget
policies in the substitute-provider fixture. This is offline evidence, not an
approved procedure for an arbitrary live stack. A real plan still needs review;
stop on any cloud create, replacement, deletion or setting change.

The provider workflow neither accesses a live project nor creates a VPS.

## Migration review reference

The migration and all three language switches passed on one existing test
server; see [live evidence](validation.md#live-language-switches). Fresh
installation through the provider remains a separate validation requirement.
The sequence remains a reference for future reviewed migrations. Keep
operational files and state outside this repository:

1. Require successful CI for the source under review. Back up the consumer,
   lockfile and encrypted Pulumi state; retain the existing keys and flake.
2. Change only the TypeScript SDK import and the remote-compatible resource
   policy. Keep the stack, logical names, provider versions, physical server
   identity, machine type, location and protection unchanged.
3. Review a saved plan targeting only the existing local preflight. It must not
   create, update, replace or delete cloud resources. Apply only that reviewed
   plan, then generate a new full preview.
4. Require the full plan to preserve every cloud resource. Only the expected
   non-destructive local command update is acceptable. Stop on unknown cloud
   changes, replacements or installation creation; do not disable protection.
5. Apply that reviewed plan, check the original server ID, pinned SSH identity,
   system readiness and HTTP, and require an unchanged repeat preview.
6. Evaluate equivalent Python and Go consumers against the same state. Each
   language switch must leave the infrastructure unchanged.

Record actual results before expanding the validation claim. Reusing an installed
server cannot establish that the new provider's initial installation works on a
fresh VPS. The subsequent fresh TypeScript test required its own explicit cost and resource
decision; it was not an automatic migration fallback. Do not create another server as an automatic migration fallback.

## Fresh-server validation and capacity

The published `0.2.0-dev.1` TypeScript SDK completed a fresh CX23 installation
on 2026-10-28 after capacity returned. The earlier capacity-blocked attempt was
not counted as a pass. The old disposable test server and its IPs were removed
before the new server was created, keeping at most one test VPS. Pinned SSH/HTTP,
a normal reboot and an unchanged repeat preview/update passed. See
[executed evidence](validation.md#fresh-provider-installation). This does not
establish fresh creation through Python/Go, other plans or other boot modes.

The reusable component accepts x86_64 CX, CPX and CCX plans; it is not restricted
to the plan used by the test consumer. Choose an explicit plan and location,
check current pricing and capacity, and leave RAM headroom for kexec. ARM/CAX
requires a different target configuration and is unsupported by this release.
Only CX23 has live installation evidence, through the original component and
the TypeScript provider SDK.

Provider availability is not a reservation. Keep an existing server protected
while evaluating alternatives; never automatically choose a more expensive plan
or delete a working server to try to free capacity. Local validation does not
check prices or reserve cloud resources. For a current availability query, use
Hetzner's server-type `locations[].available` field; the retired datacenters
endpoint must not be used. See the [official API](https://docs.hetzner.cloud/reference/cloud).
