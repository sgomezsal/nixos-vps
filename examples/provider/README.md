# Run a preview SDK from local artifacts

Choose one language and a new directory. These examples exercise local preview
artifacts for the experimental `0.2.0-dev.1` provider. For the published SDKs,
use the [registry installation commands](../../docs/multilanguage.md#install-the-published-prerelease).
This guide does not replace the original package quickstart.
Installation on a real server formats its disk. None of the setup or validation
commands below creates a server.

## 1. Tools and trusted artifacts

Start from the matching source checkout with Nix installed:

```sh
nix develop .#provider
export SOURCE="$PWD"
export ARTIFACTS=/absolute/path/to/downloaded/provider-preview
node scripts/provider-release.cjs verify "$ARTIFACTS"
```

Replace the artifact path before continuing. Download all eight files from the
same successful GitHub `provider-artifacts` job. The shell supplies Node/npm,
Pulumi, Python, Go, Git and SSH. Artifact verification checks checksums and the
schema/locks; it is not a cryptographic signature of the publisher.

Use an isolated plugin directory. This installs a local plugin, without a backend
login or provider API call:

```sh
export PULUMI_HOME="$(mktemp -d /tmp/nixos-vps-preview-plugins-XXXXXX)"
export PULUMI_DISABLE_AUTOMATIC_PLUGIN_ACQUISITION=true
export PULUMI_IGNORE_AMBIENT_PLUGINS=true
pulumi plugin install resource nixos-vps 0.2.0-dev.1 --exact \
  --file "$ARTIFACTS/pulumi-resource-nixos-vps-v0.2.0-dev.1-linux-amd64.tar.gz"
```

## 2. Generate and validate the shared NixOS/SSH setup

Use a new directory outside the source checkout. Pick a unique external key
directory; the initializer refuses to overwrite existing identities.

```sh
mkdir "$HOME/my-provider-preview"
cd "$HOME/my-provider-preview"
npm init -y
npm install --ignore-scripts nixos-vps@0.1.2 @pulumi/pulumi@3.272.0
npm install --ignore-scripts --save-dev typescript@5.9.3 @types/node@22.20.5
npx nixos-vps init --stack dev \
  --key-directory "$HOME/.ssh/my-provider-preview" \
  --server-type cx23 --location nbg1 --ports 80,443
node -e 'require("fs").appendFileSync("Pulumi.dev.yaml", "  standalone-nixos:flakeDirectory: " + JSON.stringify(process.cwd()+"/nixos") + "\n")'
git init
git add .
npx nixos-vps validate --stack dev
```

Review `Pulumi.dev.yaml`, `nixos/configuration.nix` and `nixos/disk-config.nix`.
The key directory contains separate deployment and server host identities; private
keys stay outside the project. Region and plan are examples, not availability or
pricing guarantees. Public TCP ports must match `nixos/ports.json`.

The published initializer currently generates a TypeScript bootstrap program.
Keep it for local Nix/SSH validation when choosing Python or Go. `validate` checks
that TypeScript file, not a Python/Go program: check those separately below.
Its Nix checks target this quickstart's `nixos/` directory and `web` configuration;
changing the program to another flake or host requires separate validation of
that target.
Keep the project name `standalone-nixos` so the generated configuration namespace
continues to match. No Hetzner credentials are needed for local validation.

## 3. Install and check one language

### TypeScript

```sh
npm install --ignore-scripts "$ARTIFACTS/sgomezsal-nixos-vps-0.2.0-dev.1.tgz"
cp "$SOURCE/examples/provider/typescript/index.ts" index.ts
npm pkg set main=index.ts
npx tsc --noEmit
npx nixos-vps validate --stack dev
```

The generated `Pulumi.yaml` already selects Node.js with TypeScript support.

### Python

```sh
printf '\n.venv/\n__pycache__/\n' >> .gitignore
python3 -m venv .venv
.venv/bin/python -m pip install "$ARTIFACTS/pulumi_nixos_vps-0.2.0.dev1-py3-none-any.whl"
.venv/bin/python -m pip check
cp "$SOURCE/examples/provider/python/__main__.py" __main__.py
node -e 'require("fs").writeFileSync("Pulumi.yaml", JSON.stringify({name:"standalone-nixos",runtime:{name:"python",options:{virtualenv:".venv"}}},null,2)+"\n")'
.venv/bin/python -m py_compile __main__.py
npx nixos-vps validate --stack dev
```

`py_compile` checks syntax; the offline engine test below also executes the
program and its SDK calls. Do not run `__main__.py` directly: it needs Pulumi's
runtime. Keep your environment lockfile for transitive dependencies.

### Go

Extract the local artifact module outside the consumer project:

```sh
export LOCAL_MODULE="$(mktemp -d /tmp/nixos-vps-preview-go-XXXXXX)"
tar -xzf "$ARTIFACTS/nixos-vps-go-0.2.0-dev.1.tar.gz" -C "$LOCAL_MODULE"
cp "$SOURCE/examples/provider/go/main.go" main.go
go mod init example.local/nixos-vps-preview
go mod edit -require=github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0-dev.1
go mod edit -replace=github.com/sgomezsal/nixos-vps/sdk/go/nixosvps="$LOCAL_MODULE/nixosvps"
go mod tidy
go build -o /tmp/nixos-vps-preview-consumer .
node -e 'require("fs").writeFileSync("Pulumi.yaml", JSON.stringify({name:"standalone-nixos",runtime:"go"},null,2)+"\n")'
npx nixos-vps validate --stack dev
```

Keep the extracted module while using this preview; `replace` is deliberately
local until a Go module is published. The source file must exist before `tidy`.
Pulumi's Go runtime builds the program from source; no binary option is required.

## 4. Test without a cloud account

From the source checkout, run:

```sh
cd "$SOURCE"
npm ci --ignore-scripts
npm run build
PROVIDER_RELEASE_DIR="$ARTIFACTS" npm run test:provider
```

This acceptance test installs the downloaded plugin and SDK artifacts into
temporary consumers with an empty HOME and local state. It runs these three
source programs through the real Pulumi engine with loopback substitute providers:
fresh preview, creation, ready outputs, an unchanged second update, deletion and
missing-configuration errors. It also covers migration, secrets and recovery.
Cloud creation and installer/preflight commands in this engine test are simulated.
The separate `nixos-vps validate` command above performs real local Nix builds and
key/configuration checks. Public dependency and Nix downloads may occur.

Local validation does not confirm Hetzner networking, capacity or installation.
There is deliberately no `pulumi up` command here. A real deployment requires a
separate review of credentials, backend, cost, SSH sources and the target disk.
