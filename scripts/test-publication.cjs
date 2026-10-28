// Validate workflow syntax and the provisioning-only distribution boundary.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
assert.equal(fs.existsSync(path.join(root,'modules')),false,'The baseline belongs in the packaged template');
assert.ok(fs.existsSync(path.join(root,'packages/nixos-vps/templates/nixos/base.nix')));
assert.deepEqual(fs.readdirSync(path.join(root,'secrets')).sort(),['provisioning.env.example'],'Only the operator provisioning example belongs in secrets');
const lock=JSON.parse(fs.readFileSync(path.join(root,'flake.lock')));assert.deepEqual(Object.keys(lock.nodes.root.inputs).sort(),['disko','flake-utils','nixpkgs']);
const evaluated=spawnSync('nix',['eval','--impure','--json','--expr','let f=builtins.getFlake '+JSON.stringify(root)+'; in { configurations=builtins.attrNames f.nixosConfigurations; ssh=f.nixosConfigurations.hetzner-cloud.config.services.openssh.enable; ignoreAmbientPlugins=f.devShells.x86_64-linux.default.PULUMI_IGNORE_AMBIENT_PLUGINS; }'],{encoding:'utf8',timeout:120000});assert.equal(evaluated.status,0,evaluated.stderr);
assert.deepEqual(JSON.parse(evaluated.stdout),{configurations:['example','hetzner-cloud'],ssh:true,ignoreAmbientPlugins:'true'});
const lint=spawnSync('actionlint',fs.readdirSync(path.join(root,'.github/workflows')).filter(file=>/\.ya?ml$/.test(file)).map(file=>'.github/workflows/'+file),{cwd:root,encoding:'utf8'});assert.equal(lint.status,0,lint.stderr+lint.stdout);
console.log('PUBLICATION SCOPE PASS: provisioning-only modules, credentials example, flake inputs and host configurations; pinned workflow syntax valid.');
