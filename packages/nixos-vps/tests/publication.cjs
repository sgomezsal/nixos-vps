const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),YAML=require('yaml');
const root=path.resolve(__dirname,'../../..');
const secretPaths=['.env','.env.local','nested/.env.production','credentials.env','nested/private.key','identity.pem','identity.p12','identity.pfx','identity.agekey','id_ed25519','nested/id_rsa','ssh_host_ed25519_key','age-keys.txt','.pulumi/stacks/dev.json','pulumi-state-export.json','Pulumi.dev.json','.nixos-vps-stage-interrupted/input'];
const publicPaths=['.env.example','.env.production.example','secrets/provisioning.env.example','secrets/provisioning.enc.env','examples/hetzner/admin.pub','id_ed25519.pub','Pulumi.example.yaml','Pulumi.dev.yaml','package-lock.json','flake.lock'];
function ignored(directory,filename){const result=spawnSync('git',['check-ignore','--no-index','--quiet',filename],{cwd:directory,encoding:'utf8'});assert.ok(!result.error,result.error?.message);assert.ok([0,1].includes(result.status),result.stderr);return result.status===0;}
test('root and generated ignore rules exclude operator secrets/state while preserving public/encrypted examples',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ignore-policy-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const initialized=spawnSync('git',['init','--quiet',tmp]);assert.equal(initialized.status,0);
 fs.writeFileSync(path.join(tmp,'.gitignore'),require('../scripts/ignore-rules.cjs'));
 for(const dir of [root,tmp]){for(const file of secretPaths)assert.ok(ignored(dir,file),'Not excluded: '+file);for(const file of publicPaths)assert.equal(ignored(dir,file),false,'Public example hidden: '+file);}
 // Example source must not bundle operator stack configuration.
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,"package.json"))).workspaces,["packages/*","examples/hetzner"]);
});
test('validation workflow pins every action and does not persist checkout credentials or grant write permissions',()=>{
 const workflow=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8'));
 assert.deepEqual(workflow.permissions,{contents:'read'});assert.ok(!('pull_request_target' in workflow.on));
 const steps=workflow.jobs.validate.steps;
 for(const step of steps.filter(step=>step.uses))assert.match(step.uses,/^[^@]+@[a-f0-9]{40}$/);
 assert.equal(steps.find(step=>step.uses?.startsWith('actions/checkout@')).with['persist-credentials'],false);
 assert.ok(steps.some(step=>step.run==='./scripts/validate.sh'));
 assert.ok(!JSON.stringify(workflow).includes('${{ secrets.'));
});
test("CI installs an explicit Nix release accepted by the actual tool preflight",()=>{
 const workflow=YAML.parse(fs.readFileSync(path.join(root,".github/workflows/ci.yml"),"utf8"));
 const installer=workflow.jobs.validate.steps.find(step=>step.uses?.startsWith("cachix/install-nix-action@"));
 const match=installer.with.install_url?.match(/^https:\/\/releases\.nixos\.org\/nix\/nix-(\d+\.\d+\.\d+)\/install$/);
 assert.ok(match,"Pin an official Nix installer URL instead of relying on the action default");
 const {checkTools}=require("../scripts/runner.cjs");
 const execute=version=>binary=>binary==="nix" ? "nix (Nix) "+version : "OpenSSH_9.9";
 checkTools(execute(match[1]));
 assert.throws(()=>checkTools(execute("2.22.1")),/Nix >=2.24/);
 assert.match(installer.with.extra_nix_config,/experimental-features\s*=.*nix-command.*flakes/);
});
test('only the release package is publishable, with public metadata and no automatic publishing or deployment hooks',()=>{
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'packages/nixos-vps/package.json')));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).private,true);
 assert.equal(metadata.private,undefined);
 const lock=JSON.parse(fs.readFileSync(path.join(root,"package-lock.json")));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,"examples/hetzner/package.json"))).dependencies["nixos-vps"],metadata.version);
 assert.equal(lock.packages["packages/nixos-vps"].version,metadata.version);
 assert.equal(lock.packages["examples/hetzner"].dependencies["nixos-vps"],metadata.version);
 assert.equal(lock.packages["examples/hetzner/node_modules/nixos-vps"],undefined,"Example must use the local release workspace");
 assert.deepEqual(metadata.publishConfig,{access:'public',registry:'https://registry.npmjs.org/',tag:'next'});
 assert.deepEqual(metadata.repository,{type:'git',url:'git+https://github.com/sgomezsal/nixos-vps.git',directory:'packages/nixos-vps'});
 assert.equal(metadata.homepage,'https://github.com/sgomezsal/nixos-vps#readme');
 assert.equal(metadata.bugs.url,'https://github.com/sgomezsal/nixos-vps/issues');
 assert.equal(metadata.author.email,'contact@sgomezsal.com');
 assert.ok(metadata.keywords.includes('pulumi') && metadata.keywords.includes('nixos'));
 assert.match(fs.readFileSync(path.join(root,'SECURITY.md'),'utf8'),/mailto:contact@sgomezsal\.com/);
 for(const name of ['publish','prepublish','postpublish','postinstall','install'])assert.equal(metadata.scripts[name],undefined);
 const cli=fs.readFileSync(path.join(root,'packages/nixos-vps/scripts/cli.cjs'),'utf8');assert.ok(!/pulumi (up|preview|destroy)/.test(cli));
});
test('repository identity is a public-only example fixture that consumers must replace',()=>{
 const fixture=fs.readFileSync(path.join(root,'examples/hetzner/admin.pub'),'utf8').trim();
 assert.match(fixture,/^ssh-ed25519 [A-Za-z0-9+/=]+ nixos-vps-example-only-private-key-discarded$/);
 const checked=spawnSync('ssh-keygen',['-l','-f',path.join(root,'examples/hetzner/admin.pub')],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);
 for(const name of ['admin','admin.key','admin.pem','deploy','host'])assert.equal(fs.existsSync(path.join(root,'examples/hetzner',name)),false);
 const baseline=fs.readFileSync(path.join(root,'hosts/hetzner-cloud/configuration.nix'),'utf8');assert.ok(baseline.includes('../../examples/hetzner/admin.pub'));assert.ok(!baseline.includes('ssh-ed25519 '),'Do not duplicate the fixture in configuration');
});
test('provisioning credential example contains only the documented placeholder',()=>{
 const lines=fs.readFileSync(path.join(root,'secrets/provisioning.env.example'),'utf8').split('\n').filter(line=>line&&!line.startsWith('#'));
 assert.deepEqual(lines,['HCLOUD_TOKEN=replace-with-a-hetzner-project-token']);
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'packages/nixos-vps/package.json')));assert.equal(metadata.name,'nixos-vps');assert.deepEqual(Object.keys(metadata.bin),['nixos-vps']);assert.ok(!metadata.files.includes('secrets'));
});
test('release workflow is manual, gated, artifact-based and grants OIDC only to publishing',()=>{
 const workflow=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/release.yml'),'utf8'));
 assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
 assert.equal(workflow.on.workflow_dispatch.inputs.publish.default,false);
 assert.deepEqual(workflow.permissions,{contents:'read'});
 const {prepare,publish}=workflow.jobs;
 assert.equal(prepare.if,"github.ref == 'refs/heads/main'");
 assert.equal(publish.needs,'prepare');assert.equal(publish.environment,'npm');
 assert.equal(publish.if,"inputs.publish && vars.NPM_RELEASE_ENABLED == 'true'");
 assert.deepEqual(publish.permissions,{contents:'read','id-token':'write'});
 assert.ok(prepare.steps.some(s=>s.run==='nix develop --command npm run release:prepare'));
 assert.ok(prepare.steps.some(s=>s.uses?.startsWith('actions/upload-artifact@')));
 assert.ok(publish.steps.some(s=>s.uses?.startsWith('actions/download-artifact@')));
 assert.ok(publish.steps.some(s=>s.run==='nix develop --command npm run release:verify'));
 const commands=publish.steps.map(s=>s.run||'').join('\n');
 assert.match(commands,/readArtifact/);assert.match(commands,/manifest.commit!==process.env.GITHUB_SHA/);
 assert.match(commands,/Version already exists/);assert.match(commands,/--provenance/);
 assert.ok(!commands.includes('npm pack'));assert.ok(!JSON.stringify(workflow).includes('${{ secrets.'));
 for(const job of [prepare,publish])for(const step of job.steps.filter(s=>s.uses)){
  assert.match(step.uses,/^[^@]+@[a-f0-9]{40}$/);
  if(step.uses.startsWith('actions/checkout@'))assert.equal(step.with['persist-credentials'],false);
 }
});
