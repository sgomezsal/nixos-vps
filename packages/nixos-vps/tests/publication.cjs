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
test('artifact discovery includes the hidden release directory and excludes unrelated private files',async t=>{
 // Match the pinned upload action's ESM glob engine using local fixtures only.
 const glob=await import('@actions/glob');
 const workflow=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/release.yml'),'utf8'));
 const upload=workflow.jobs.prepare.steps.find(s=>s.uses?.startsWith('actions/upload-artifact@'));
 assert.equal(upload.with['include-hidden-files'],true);
 assert.equal(upload.with['if-no-files-found'],'error');
 assert.deepEqual(upload.with.path.trim().split('\n'),['.release/manifest.json','.release/nixos-vps-*.tgz']);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-artifact-discovery-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 fs.mkdirSync(path.join(tmp,'.release'));
 for(const name of ['manifest.json','nixos-vps-0.1.1.tgz','.env','private.key','unrelated.tgz'])fs.writeFileSync(path.join(tmp,'.release',name),'synthetic fixture');
 fs.writeFileSync(path.join(tmp,'.env'),'synthetic fixture');
 const patterns=upload.with.path.trim().split('\n').map(p=>path.join(tmp,p)).join('\n');
 const discover=async includeHidden=>{const g=await glob.create(patterns,{excludeHiddenFiles:!includeHidden,implicitDescendants:false});return (await g.glob()).map(p=>path.relative(tmp,p)).sort();};
 assert.deepEqual(await discover(false),[],'Reproduce the upload action default that caused the failure');
 assert.deepEqual(await discover(upload.with['include-hidden-files']),['.release/manifest.json','.release/nixos-vps-0.1.1.tgz']);
});
test('verification-only workflow cannot publish and retrieves a version-bound artifact from the original run',()=>{
 const workflow=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/verify-release.yml'),'utf8'));
 assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
 assert.deepEqual(workflow.permissions,{contents:'read',actions:'read'});
 const job=workflow.jobs.verify;
 assert.equal(job.if,"github.ref == 'refs/heads/main'");assert.equal(job.environment,undefined);assert.equal(job.permissions,undefined);
 const download=job.steps.find(s=>s.uses?.startsWith('actions/download-artifact@'));
 assert.equal(download.with.name,'npm-release');assert.equal(download.with['run-id'],'${{ inputs.run_id }}');
 assert.equal(download.with.repository,'${{ github.repository }}');
 const commands=job.steps.map(s=>s.run||'').join('\n');
 assert.ok(!/npm (publish|stage|dist-tag)|release:prepare|id-token/.test(commands));
 assert.match(commands,/validateSourceRun/);assert.match(commands,/EXPECTED_VERSION/);
 assert.match(commands,/--version-only/);assert.match(commands,/--wait-seconds 600/);
 for(const step of job.steps.filter(s=>s.uses)){assert.match(step.uses,/^[^@]+@[a-f0-9]{40}$/);if(step.uses.startsWith('actions/checkout@'))assert.equal(step.with['persist-credentials'],false);}
});
test('hosted jobs pin Ubuntu 24.04 and approved Node 24 artifact actions with strict download integrity',()=>{
 const approved={
  'actions/upload-artifact':'cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  'actions/download-artifact':'9000827ccba6bdab643e8b6fd33ac0654aef8333',
 };
 for(const file of ['ci.yml','release.yml','verify-release.yml']){
  const workflow=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows',file),'utf8'));
  for(const job of Object.values(workflow.jobs)){
   assert.equal(job['runs-on'],'ubuntu-24.04');
   for(const step of job.steps.filter(s=>s.uses)){
    const [action,sha]=step.uses.split('@');
    if(approved[action])assert.equal(sha,approved[action],'Review action runtime and compatibility when upgrading');
    if(action==='actions/upload-artifact')assert.equal(step.with.archive,true,'Keep the manifest and tarball together in a ZIP artifact');
    if(action==='actions/download-artifact')assert.equal(step.with['digest-mismatch'],'error');
   }
  }
 }
 assert.equal(require('../../../package.json').devDependencies['@actions/glob'],'0.6.1','Match the pinned upload action glob engine');
});
