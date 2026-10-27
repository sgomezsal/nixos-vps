'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const contract = require('../distribution.json');

const providerFiles = [
  'LICENSE', 'README.md', 'package.json', 'schema.json', 'distribution.json',
  'runtime/package.json', 'runtime/package-lock.json',
  'lib/provider.js', 'lib/provider.d.ts', 'lib/provider.js.map',
  'scripts/provider.cjs', 'scripts/generate-sdks.cjs', 'scripts/package-plugin.cjs',
  'scripts/distribution.cjs',
].sort();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw Error(`${path.basename(command)} failed: ${result.stderr || result.error?.message || result.stdout}`);
  }
  return result.stdout;
}

function checkTools() {
  if (Number(process.versions.node.split('.')[0]) !== contract.tools.nodeMajor) {
    throw Error(`Use the pinned provider shell: Node.js ${contract.tools.nodeMajor} is required`);
  }
  const version = run('pulumi', ['version']).trim().replace(/^v/, '');
  if (version !== contract.tools.pulumi) {
    throw Error(`SDK generation requires Pulumi ${contract.tools.pulumi}; use nix develop .#provider`);
  }
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

// Only immutable public dependency downloads are allowed by the packaging tools.
// Never inherit operator credential/configuration variables or npm login state.
function buildEnvironment(home) {
  fs.mkdirSync(home, {recursive: true, mode: 0o700});
  const environment = Object.fromEntries(['PATH', 'NIX_SSL_CERT_FILE', 'SSL_CERT_FILE', 'TMPDIR']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  return {...environment, HOME: home, SOURCE_DATE_EPOCH: '0', PYTHONHASHSEED: '0',
    PULUMI_SKIP_UPDATE_CHECK: 'true', PULUMI_CLI_TELEMETRY_OPTOUT: '1',
    PULUMI_DISABLE_AUTOMATIC_PLUGIN_ACQUISITION: 'true', PULUMI_IGNORE_AMBIENT_PLUGINS: 'true',
    GOTOOLCHAIN: 'local', GOFLAGS: '-modcacherw',
    GOCACHE: path.join(home, 'go-build'), GOMODCACHE: path.join(home, 'go-modules')};
}

function archive(directory, entries, destination, env) {
  // Normalize filesystem metadata and gzip headers, including across build paths.
  const tar = destination + '.tar';
  try {
    run('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
      '--format=gnu', '--mode=u+rwX,go+rX,go-w', '--dereference', '--hard-dereference',
      '-cf', tar, '-C', directory, ...entries], {env});
    run('gzip', ['-n', '-9', tar], {env});
    fs.renameSync(tar + '.gz', destination);
  } finally {
    fs.rmSync(tar, {force: true}); fs.rmSync(tar + '.gz', {force: true});
  }
}

function artifactNames(version) {
  if (!/^\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(version)) throw Error('Unsupported provider version');
  const pythonVersion = version.replace(/-dev\.(\d+)$/, '.dev$1');
  return {
    plugin: `pulumi-resource-nixos-vps-v${version}-${contract.platform}.tar.gz`,
    nodejs: `sgomezsal-nixos-vps-${version}.tgz`,
    pythonWheel: `pulumi_nixos_vps-${pythonVersion}-py3-none-any.whl`,
    pythonSource: `pulumi_nixos_vps-${pythonVersion}.tar.gz`,
    go: `nixos-vps-go-${version}.tar.gz`,
    schema: 'schema.json',
  };
}

module.exports = {contract, providerFiles, run, checkTools, sha256, buildEnvironment, archive, artifactNames};
