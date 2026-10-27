// Prepare and verify preview artifacts only. This script never publishes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const provider = path.join(root, 'packages/nixos-vps-provider');
const metadata = require('../packages/nixos-vps-provider/package.json');
const {contract, artifactNames, run, checkTools, sha256, buildEnvironment, archive} =
  require('../packages/nixos-vps-provider/scripts/distribution.cjs');
const {generate} = require('../packages/nixos-vps-provider/scripts/generate-sdks.cjs');
const {packagePlugin} = require('../packages/nixos-vps-provider/scripts/package-plugin.cjs');
const names = artifactNames(metadata.version);

function sourceIdentity() {
  const {createHash} = require('node:crypto');
  const files = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root})
    .split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of [...new Set(files)]) {
    const filename = path.join(root, file);
    if (fs.existsSync(filename) && fs.lstatSync(filename).isFile()) {
      hash.update(file + '\0'); hash.update(fs.readFileSync(filename)); hash.update('\0');
    }
  }
  return {commit: run('git', ['rev-parse', 'HEAD'], {cwd: root}).trim(),
    dirty: Boolean(run('git', ['status', '--porcelain'], {cwd: root}).trim()), sha256: hash.digest('hex')};
}

function writeManifest(directory, manifest) {
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const sums = Object.values(manifest.artifacts).map(item => `${item.sha256}  ${item.filename}`);
  sums.push(`${sha256(path.join(directory, 'manifest.json'))}  manifest.json`);
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), sums.sort().join('\n') + '\n');
}

function verify(directory, requireValidated = true) {
  const location = path.resolve(directory);
  const manifestPath = path.join(location, 'manifest.json');
  if (!fs.lstatSync(location).isDirectory() || fs.lstatSync(location).isSymbolicLink()) {
    throw Error('Artifact directory must be a real directory');
  }
  for (const filename of ['manifest.json', 'SHA256SUMS']) {
    const stat = fs.lstatSync(path.join(location, filename));
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Manifest files must be regular files');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  if (!manifest || typeof manifest !== 'object' || !manifest.artifacts || Array.isArray(manifest.artifacts) ||
      manifest.format !== 1 || manifest.version !== metadata.version || manifest.platform !== contract.platform ||
      manifest.publishable !== false || (requireValidated && manifest.validation !== 'passed')) {
    throw Error('Artifact identity or validation status does not match this preview');
  }
  if (JSON.stringify(Object.keys(manifest.artifacts).sort()) !== JSON.stringify(Object.keys(names).sort())) {
    throw Error('Unexpected artifact roles');
  }
  const expected = ['manifest.json', 'SHA256SUMS', ...Object.values(names)].sort();
  if (JSON.stringify(fs.readdirSync(location).sort()) !== JSON.stringify(expected)) throw Error('Unexpected artifact files');
  for (const [role, filename] of Object.entries(names)) {
    const item = manifest.artifacts[role];
    const file = path.join(location, filename);
    if (item.filename !== filename || !/^[a-f0-9]{64}$/.test(item.sha256) ||
        !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || sha256(file) !== item.sha256) {
      throw Error('Artifact integrity mismatch: ' + role);
    }
  }
  const expectedSums = [...Object.values(manifest.artifacts).map(item => `${item.sha256}  ${item.filename}`),
    `${sha256(manifestPath)}  manifest.json`].sort().join('\n') + '\n';
  if (fs.readFileSync(path.join(location, 'SHA256SUMS'), 'utf8') !== expectedSums) throw Error('Checksum manifest mismatch');
  if (manifest.runtimeLockSha256 !== sha256(path.join(provider, 'runtime/package-lock.json')) ||
      manifest.nodeLockSha256 !== sha256(path.join(provider, 'sdk-node-lock.json')) ||
      manifest.goLockSha256 !== sha256(path.join(provider, 'go-lock/go.sum')) ||
      manifest.goModSha256 !== sha256(path.join(provider, 'go-lock/go.mod')) ||
      manifest.distributionSha256 !== sha256(path.join(provider, 'distribution.json')) ||
      manifest.apiSha256 !== sha256(path.join(provider, 'schema.json')) ||
      sha256(path.join(location, names.schema)) !== manifest.apiSha256) throw Error('Schema/runtime lock mismatch');
  return manifest;
}

function buildArtifacts(directory, working, env) {
  fs.mkdirSync(directory, {recursive: true}); fs.mkdirSync(working, {recursive: true});
  const sdk = path.join(working, 'sdk');
  // Generation also verifies the pinned CLI, versions and codegen templates.
  generate(sdk, {env});
  if (require('typescript/package.json').version !== contract.tools.typescript) throw Error('TypeScript lock mismatch');
  // Compile outside the checkout with only declared dependencies, using its lock.
  const node = path.join(sdk, 'nodejs');
  const runtimeLock = JSON.parse(fs.readFileSync(path.join(provider, 'runtime/package-lock.json')));
  const sdkMetadata = JSON.parse(fs.readFileSync(path.join(node, 'package.json')));
  // The SDK's build inputs are separately locked; runtime installation is not a build hook.
  fs.copyFileSync(path.join(provider, 'sdk-node-lock.json'), path.join(node, 'package-lock.json'));
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: node, env});
  run('npm', ['audit', '--audit-level=high'], {cwd: node, env});
  run(process.execPath, [path.join(node, 'node_modules/typescript/bin/tsc'), '-p', path.join(node, 'tsconfig.json')], {cwd: node, env});
  const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], {cwd: node, env}));
  if (packed.filename !== names.nodejs || sdkMetadata.name !== contract.npmPackage) throw Error('Node SDK identity mismatch');
  if (sdkMetadata.dependencies['@pulumi/pulumi'] !== runtimeLock.packages[''].dependencies['@pulumi/pulumi']) {
    throw Error('SDK and plugin Pulumi versions differ');
  }

  const python = path.join(sdk, 'python');
  run('python3', ['-m', 'build', '--no-isolation', '--wheel', '--sdist', '--outdir', directory], {cwd: python, env});
  // setuptools sdist headers/timestamps vary; canonicalize the completed source archive.
  const extracted = path.join(working, 'python-source'); fs.mkdirSync(extracted);
  run('tar', ['-xzf', path.join(directory, names.pythonSource), '-C', extracted], {env});
  fs.rmSync(path.join(directory, names.pythonSource));
  archive(extracted, fs.readdirSync(extracted).sort(), path.join(directory, names.pythonSource), env);

  const go = path.join(sdk, 'go/nixosvps');
  // Resolve once from the checked-in module graph, never select new versions.
  for (const file of ['go.mod', 'go.sum']) fs.copyFileSync(path.join(provider, 'go-lock', file), path.join(go, file));
  run('go', ['mod', 'verify'], {cwd: go, env});
  run('go', ['list', '-mod=readonly', './...'], {cwd: go, env});
  archive(path.dirname(go), ['nixosvps'], path.join(directory, names.go), env);
  packagePlugin(path.join(directory, names.plugin));
  fs.copyFileSync(path.join(provider, 'schema.json'), path.join(directory, names.schema));
  const artifacts = Object.fromEntries(Object.entries(names).map(([role, filename]) => [role,
    {filename, sha256: sha256(path.join(directory, filename))}]));
  const manifest = {format: 1, version: metadata.version, platform: contract.platform,
    publishable: false, validation: 'prepared', source: sourceIdentity(),
    tools: {...contract.tools, node: process.versions.node},
    nixpkgsRevision: JSON.parse(fs.readFileSync(path.join(root, 'flake.lock'))).nodes.nixpkgs.locked.rev,
    apiSha256: sha256(path.join(provider, 'schema.json')),
    runtimeLockSha256: sha256(path.join(provider, 'runtime/package-lock.json')),
    nodeLockSha256: sha256(path.join(provider, 'sdk-node-lock.json')),
    goLockSha256: sha256(path.join(provider, 'go-lock/go.sum')),
    goModSha256: sha256(path.join(provider, 'go-lock/go.mod')),
    distributionSha256: sha256(path.join(provider, 'distribution.json')),
    goTag: `sdk/go/nixosvps/v${metadata.version}`,
    pluginReleaseTag: `v${metadata.version}`, artifacts};
  writeManifest(directory, manifest);
  verify(directory, false);
  return manifest;
}

function prepare(destination) {
  const output = path.resolve(destination);
  if (fs.existsSync(output)) throw Error('Output already exists; refusing overwrite');
  if (!fs.existsSync(path.dirname(output))) throw Error('Create the output parent directory first');
  checkTools();
  const staging = fs.mkdtempSync(path.join(path.dirname(output), '.nixos-vps-provider-stage-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nixos-vps-provider-build-'));
  try {
    const env = buildEnvironment(path.join(work, 'home'));
    run('npm', ['run', 'build'], {cwd: root, env});
    const first = buildArtifacts(path.join(staging, 'artifacts'), path.join(work, 'first'), env);
    const second = buildArtifacts(path.join(work, 'second-artifacts'), path.join(work, 'second'), env);
    if (JSON.stringify(first.artifacts) !== JSON.stringify(second.artifacts)) {
      const mismatches = Object.keys(names).filter(role => first.artifacts[role].sha256 !== second.artifacts[role].sha256);
      throw Error('Reproducibility check failed: ' + mismatches.join(', '));
    }
    console.log('PROVIDER REPRODUCIBILITY PASS: all six artifacts match across separate build directories.');
    run(process.execPath, [path.join(root, 'scripts/test-component-provider.cjs')], {cwd: root,
      env: {...env, PROVIDER_RELEASE_DIR: path.join(staging, 'artifacts')}, stdio: 'inherit'});
    first.validation = 'passed'; first.reproducible = true;
    first.checks = ['two independent builds', 'prepared-artifact engine/SDK integration'];
    writeManifest(path.join(staging, 'artifacts'), first);
    verify(path.join(staging, 'artifacts'));
    fs.renameSync(path.join(staging, 'artifacts'), output);
    console.log(`PROVIDER PREVIEW VERIFIED: ${metadata.version}; reproducible plugin, npm, wheel, sdist and Go artifacts. Not published.`);
  } finally {
    fs.rmSync(staging, {recursive: true, force: true}); fs.rmSync(work, {recursive: true, force: true});
  }
}

module.exports = {prepare, verify, writeManifest, sourceIdentity};
if (require.main === module) {
  try {
    const [command, destination, ...extra] = process.argv.slice(2);
    if (!destination || extra.length || !['prepare', 'verify'].includes(command)) {
      throw Error('Usage: node scripts/provider-release.cjs prepare|verify /artifact/directory');
    }
    if (command === 'prepare') prepare(destination);
    else { verify(destination); console.log('PROVIDER ARTIFACT INTEGRITY PASS. No deployment or publication performed.'); }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
