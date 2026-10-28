# Multi-language provider preview

The component provider is an unpublished preview. The current npm package
`nixos-vps@0.1.2` remains unchanged. These SDKs call the same implementation
through a local Node.js provider; Python and Go do not replace the installer.

## Names and versions

| Interface | Name | Preview version |
| --- | --- | --- |
| Existing TypeScript component | npm `nixos-vps` | 0.1.2, already published |
| Remote TypeScript SDK | npm `@sgomezsal/nixos-vps` | 0.2.0-dev.0 |
| Python SDK | distribution `pulumi-nixos-vps`, import `pulumi_nixos_vps` | 0.2.0.dev0 |
| Go SDK | `github.com/sgomezsal/nixos-vps/sdk/go/nixosvps` | v0.2.0-dev.0 |
| Local provider plugin | `nixos-vps`, x86_64 Linux | 0.2.0-dev.0 |

The npm and PyPI SDK names returned HTTP 404 from their public registry metadata
endpoints on 2026-10-27. This is an availability check, not a reservation or proof
of future publishing rights. Registry ownership/trusted publishing must be
confirmed before a release.

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

- `pulumi-resource-nixos-vps-v0.2.0-dev.0-linux-amd64.tar.gz`
- `sgomezsal-nixos-vps-0.2.0-dev.0.tgz`
- `pulumi_nixos_vps-0.2.0.dev0-py3-none-any.whl`
- `pulumi_nixos_vps-0.2.0.dev0.tar.gz`
- `nixos-vps-go-0.2.0-dev.0.tar.gz`
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
[three-language local quickstart](../examples/provider/README.md). It includes
key generation, real local Nix validation, language-specific dependencies and
offline engine tests. The short commands below are only artifact installation.

Use a disposable local project/backend for preview testing. Do not migrate an
existing cloud stack merely to try the SDK. Download or copy the whole artifact
directory, check out its matching source version, and verify it first:

```sh
node scripts/provider-release.cjs verify /absolute/path/to/artifacts
pulumi plugin install resource nixos-vps 0.2.0-dev.0 \
  --file /absolute/path/to/artifacts/pulumi-resource-nixos-vps-v0.2.0-dev.0-linux-amd64.tar.gz \
  --exact
```

The plugin archive includes its Node dependencies; Node itself must be on PATH.
Install the chosen SDK artifact in the consumer's own environment:

```sh
# TypeScript project
npm install --ignore-scripts /absolute/path/to/artifacts/sgomezsal-nixos-vps-0.2.0-dev.0.tgz

# Python project, inside its virtual environment
python -m pip install /absolute/path/to/artifacts/pulumi_nixos_vps-0.2.0.dev0-py3-none-any.whl

# Go project: extract the module to a separate local directory
# First create the project with go mod init and add your main.go imports.
mkdir -p /absolute/path/to/local-module
tar -xzf /absolute/path/to/artifacts/nixos-vps-go-0.2.0-dev.0.tar.gz \
  -C /absolute/path/to/local-module
go mod edit -replace=github.com/sgomezsal/nixos-vps/sdk/go/nixosvps=/absolute/path/to/local-module/nixosvps
go mod edit -require=github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0-dev.0
go mod tidy
```

These commands install files and dependencies; they do not provision a server.
There is no registry-install command for an unpublished SDK. The Node SDK remains
`private: true`, and the preview manifest explicitly says `publishable: false`.

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
no OIDC write permission and no publish/deploy step. Hosted execution is not
claimed until these changes have been committed, pushed and checked by GitHub.

Future distribution uses the schema's explicit
`github://api.github.com/sgomezsal/nixos-vps` plugin URL and Pulumi's standard
archive filename. The planned plugin release tag is `v0.2.0-dev.0`. A published
Go module uses generated source under `sdk/go/nixosvps`
and the separate submodule tag `sdk/go/nixosvps/v0.2.0-dev.0`. Candidate preparation
checks the source against its archive; preparation never creates either release
tag. SDK publication, registry trust and enabling
the publishable metadata require a separate release review. See the official
[plugin distribution documentation](https://www.pulumi.com/docs/iac/guides/building-extending/packages/executable-plugin/).

## Migration limits

The offline engine tests preserve resource identifiers across the original
TypeScript component and all three SDKs. The first move into the bundled plugin
updates absolute local runner paths, executing preflight and the non-destructive
installation update command. It does not reinstall NixOS or change cloud resources
in those tests. Later unchanged deployments and switches to Python/Go are no-ops.

No live stack has been migrated. JavaScript callback transformations and direct
access to child resources are outside this contract. The existing live consumer
has customizations that need an explicit migration review before any cloud
operation. The provider workflow neither accesses that project nor creates a VPS.
