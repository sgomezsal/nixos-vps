# Set up the TypeScript, Python or Go SDK

Choose one language and a new directory. This guide uses the published
experimental `0.2.0-dev.1` provider and matching SDKs. The source checkout supplies
the development shell and runnable examples; the SDK and plugin come from public
registries, not local workspace dependencies. Your generated project is independent
of the checkout after copying its example program.

Installation on a real server formats its disk. None of the setup or validation
commands below creates a server. For the original TypeScript component instead,
use its [quickstart](../../packages/nixos-vps/README.md#quickstart).

## 1. Tools and the published plugin

Start from the matching source checkout with Nix installed:

```sh
nix develop .#provider
export SOURCE="$PWD"
```

Use x86_64 Linux and Bash, with Nix already installed and flakes enabled.
The provider shell supplies Node/npm, Pulumi, Python, Go, Git and OpenSSH. Keep
it open for the remaining steps. Every language still needs Node.js because the
provider hosts the shared TypeScript implementation.

Use an isolated plugin directory. This downloads the published plugin without a backend
login or provider API call:

```sh
export PULUMI_HOME="$(mktemp -d /tmp/nixos-vps-preview-plugins-XXXXXX)"
export PULUMI_IGNORE_AMBIENT_PLUGINS=true
pulumi plugin install resource nixos-vps 0.2.0-dev.1 --exact \
  --server github://api.github.com/sgomezsal/nixos-vps
```

## 2. Generate and validate the shared NixOS/SSH setup

Use a new directory outside the source checkout. Pick a unique external key
directory; the initializer refuses to overwrite existing identities.

```sh
mkdir "$HOME/my-provider-project"
cd "$HOME/my-provider-project"
npm init -y
npm install --ignore-scripts nixos-vps@0.1.2 @pulumi/pulumi@3.272.0
npm install --ignore-scripts --save-dev typescript@5.9.3 @types/node@22.20.5
npx nixos-vps init --stack dev \
  --key-directory "$HOME/.ssh/my-provider-project" \
  --server-type cx23 --location nbg1 --ports 80,443
node -e 'require("fs").appendFileSync("Pulumi.dev.yaml", "  standalone-nixos:flakeDirectory: " + JSON.stringify(process.cwd()+"/nixos") + "\n")'
git init
git add .
npx nixos-vps validate --stack dev
```

Review `Pulumi.dev.yaml`, `nixos/configuration.nix` and `nixos/disk-config.nix`.
The key directory contains separate deployment and server host identities; private
keys stay outside the project. Region and plan are examples, not availability or
pricing guarantees. Choose an offered x86_64 plan with at least 2 GiB RAM for this
kexec workflow and check its current cost before deployment. Public TCP ports
must match `nixos/ports.json`.

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
npm install --ignore-scripts @sgomezsal/nixos-vps@0.2.0-dev.1
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
.venv/bin/python -m pip install pulumi-nixos-vps==0.2.0.dev1
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

Use the published Go module without a local replacement:

```sh
cp "$SOURCE/examples/provider/go/main.go" main.go
go mod init example.local/nixos-vps-preview
go mod edit -require=github.com/sgomezsal/nixos-vps/sdk/go/nixosvps@v0.2.0-dev.1
go mod tidy
go build -o /tmp/nixos-vps-preview-consumer .
node -e 'require("fs").writeFileSync("Pulumi.yaml", JSON.stringify({name:"standalone-nixos",runtime:"go"},null,2)+"\n")'
npx nixos-vps validate --stack dev
```

The source file must exist before `go mod tidy`. No `replace` directive is needed.
Pulumi's Go runtime builds the program from source; no binary option is required.

## 4. Test without a cloud account

From the source checkout, run:

```sh
cd "$SOURCE"
npm ci --ignore-scripts
npm run build
npm run test:provider
```

This acceptance test builds and installs local plugin and SDK artifacts into
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

Check the published distributions separately:

```sh
npm run test:provider:public
```

This downloads exact published versions into independent temporary projects,
checks npm CJS/ESM imports and TypeScript declarations, Python imports/dependencies,
Go compilation and plugin installation. It does not create resources or validate
live cloud networking or installation.

## Optional: local preview artifacts

Maintainers testing unpublished changes should use a separate disposable project
and empty plugin home. Follow [local artifact installation](../../docs/multilanguage.md#local-artifact-installation)
in place of the registry installation commands above. Do not mix a public plugin
and an unpublished SDK with the same version in one plugin home.

For exact-artifact engine checks, obtain all eight preview files from the same
successful CI job, check out that artifact's source commit, then run:

```sh
export ARTIFACTS=/absolute/path/to/downloaded/provider-preview
node scripts/provider-release.cjs verify "$ARTIFACTS"
PROVIDER_RELEASE_DIR="$ARTIFACTS" npm run test:provider
```

These are preview artifacts, not publication candidates. For an explicit
publication candidate, use `verify-candidate` and set
`PROVIDER_PUBLICATION_CANDIDATE=true` for the engine test. The two formats are
intentionally not interchangeable. Verification checks hashes and source/schema/locks, not a
cryptographic signature of the publisher.
