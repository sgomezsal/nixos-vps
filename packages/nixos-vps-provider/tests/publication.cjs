const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {guardIdentity,registryState,requirePlugin,publishGitHub,preflight,verifyGoSource,verifyRegistry}=require('../../../scripts/provider-publish.cjs');
const {verify,writeManifest}=require('../../../scripts/provider-release.cjs');
const {artifactNames,sha256,archive,buildEnvironment}=require('../scripts/distribution.cjs');
const root=path.resolve(__dirname,'../../..'),version='0.2.0-dev.1',commit='a'.repeat(40),hash='b'.repeat(64);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function context(target='github'){return {PROVIDER_RELEASE_TARGET:target,PROVIDER_RELEASE_ENABLED:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'sgomezsal/nixos-vps',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'sgomezsal/nixos-vps/.github/workflows/provider-release.yml@refs/heads/main',GITHUB_SHA:commit};}
function manifest(){return {version,publishable:true,validation:'passed',reproducible:true,source:{commit,sha256:hash,dirty:false},pluginReleaseTag:'v'+version,goTag:'sdk/go/nixosvps/v'+version,
 artifacts:Object.fromEntries(Object.entries(artifactNames(version)).map(([role,filename])=>[role,{filename,sha256:digest(role)}]))};}
function temporary(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-publication-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});

test('publication refuses forks, automatic events, disabled releases, dirty sources, wrong tags and another commit',()=>{
 const m=manifest(),env=context();guardIdentity(m,env,m.source,'github');
 for(const [key,value] of Object.entries({PROVIDER_RELEASE_ENABLED:'false',PROVIDER_RELEASE_TARGET:'npm',GITHUB_ACTIONS:'false',GITHUB_REPOSITORY:'another/repo',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/topic',GITHUB_WORKFLOW_REF:'sgomezsal/nixos-vps/.github/workflows/release.yml@refs/heads/main',GITHUB_SHA:'c'.repeat(40)}))
  assert.throws(()=>guardIdentity(m,{...env,[key]:value},m.source,'github'));
 for(const patch of [{dirty:true},{commit:'c'.repeat(40)},{sha256:'c'.repeat(64)}])assert.throws(()=>guardIdentity(m,env,{...m.source,...patch},'github'));
 for(const patch of [{publishable:false},{reproducible:false},{validation:'prepared'},{pluginReleaseTag:'v0.1.2'},{goTag:'v0.1.2'},{source:{...m.source,dirty:true}}])assert.throws(()=>guardIdentity({...m,...patch},env,m.source,'github'));
});

function candidate(t){
 const directory=temporary(t),provider=path.resolve(__dirname,'..'),m=manifest();m.format=1;m.platform='linux-amd64';
 for(const [role,item] of Object.entries(m.artifacts)){
  fs.writeFileSync(path.join(directory,item.filename),role==='schema'?fs.readFileSync(path.join(provider,'schema.json')):role);
  item.sha256=sha256(path.join(directory,item.filename));
 }
 for(const [field,file] of Object.entries({apiSha256:'schema.json',runtimeLockSha256:'runtime/package-lock.json',nodeLockSha256:'sdk-node-lock.json',goLockSha256:'go-lock/go.sum',goModSha256:'go-lock/go.mod',distributionSha256:'distribution.json'}))m[field]=sha256(path.join(provider,file));
 writeManifest(directory,m);return {directory,m};
}

test('preview verification cannot accept a publication candidate and vice versa',t=>{
 const {directory,m}=candidate(t);assert.equal(verify(directory,true,true).publishable,true);
 assert.throws(()=>verify(directory),/validation status/);
 m.reproducible=false;writeManifest(directory,m);assert.throws(()=>verify(directory,true,true),/validation status/);
 m.publishable=false;writeManifest(directory,m);assert.equal(verify(directory).publishable,false);
 assert.throws(()=>verify(directory,true,true),/validation status/);
});

test('registry verification fails after bounded pending checks and succeeds only after matching-byte availability',async t=>{
 const {directory}=candidate(t);let requests=0,waits=0;
 await assert.rejects(()=>verifyRegistry(directory,'npm',{attempts:3,fetcher:async()=>{requests++;return json({},404);},sleep:async()=>{waits++;}}),/PENDING/);
 assert.equal(requests,3);assert.equal(waits,2);
 const fetcher=async url=>url.endsWith('/sdk.tgz')?new Response('nodejs'):json({versions:{[version]:{name:'@sgomezsal/nixos-vps',version,dist:{tarball:'https://registry.npmjs.org/sdk.tgz'}}}});
 await verifyRegistry(directory,'npm',{attempts:1,fetcher});
});

test('npm distinguishes absent, staging and complete versions and rejects downloaded-byte mismatches',async()=>{
 const m=manifest();
 assert.equal((await registryState(m,'npm',async()=>json({},404))).state,'absent');
 assert.equal((await registryState(m,'npm',async()=>json({versions:{'0.0.0-stage':{}}}))).state,'pending');
 assert.equal((await registryState(m,'npm',async()=>json({versions:{'0.0.0-stage':{},'0.1.0':{}}}))).state,'absent','An old placeholder must not block later releases');
 const fetcher=async url=>url.endsWith('/sdk.tgz')?new Response('nodejs'):json({versions:{[version]:{name:'@sgomezsal/nixos-vps',version,dist:{tarball:'https://registry.npmjs.org/sdk.tgz'}}}});
 assert.equal((await registryState(m,'npm',fetcher)).state,'complete');
 assert.equal((await registryState(m,'npm',async url=>url.endsWith('/sdk.tgz')?json({},404):fetcher(url))).state,'pending','Metadata without downloadable bytes is not a release');
 await assert.rejects(()=>registryState({...m,artifacts:{...m.artifacts,nodejs:{...m.artifacts.nodejs,sha256:'0'.repeat(64)}}},'npm',fetcher),/integrity/);
 await assert.rejects(()=>registryState(m,'npm',async()=>json({},403)),/HTTP 403/);
});

test('PyPI partial uploads verify existing bytes and identify only missing distributions',async()=>{
 const m=manifest(),wheel=m.artifacts.pythonWheel;
 const metadata={info:{name:'pulumi-nixos-vps',version:'0.2.0.dev1'},urls:[{filename:wheel.filename,digests:{sha256:wheel.sha256},url:'https://files.pythonhosted.org/wheel'}]};
 const fetcher=async url=>url==='https://files.pythonhosted.org/wheel'?new Response('pythonWheel'):json(metadata);
 assert.deepEqual(await registryState(m,'pypi',fetcher),{state:'partial',missing:['pythonSource']});
 metadata.urls[0].digests.sha256='0'.repeat(64);await assert.rejects(()=>registryState(m,'pypi',fetcher),/integrity/);
 metadata.urls=[];metadata.urls.push({filename:'unexpected.whl'});await assert.rejects(()=>registryState(m,'pypi',fetcher),/Unexpected/);
});

test('Go publication requires byte-identical source and rejects archive links and source symlinks',t=>{
 const directory=temporary(t),source=path.join(directory,'source'),m=manifest(),env=buildEnvironment(path.join(directory,'home'));
 fs.mkdirSync(path.join(source,'nixosvps'),{recursive:true});fs.writeFileSync(path.join(source,'nixosvps/go.mod'),'module example.local/test\n');
 archive(source,['nixosvps'],path.join(directory,m.artifacts.go.filename),env);
 verifyGoSource(directory,m,path.join(source,'nixosvps'));
 fs.writeFileSync(path.join(source,'nixosvps/go.mod'),'changed');assert.throws(()=>verifyGoSource(directory,m,path.join(source,'nixosvps')),/matching/);
 fs.symlinkSync('go.mod',path.join(source,'nixosvps/link'));assert.throws(()=>verifyGoSource(directory,m,path.join(source,'nixosvps')),/symlinks/);
 fs.unlinkSync(path.join(source,'nixosvps/link'));
 require('node:child_process').execFileSync('python3',['-c',`import tarfile,sys
with tarfile.open(sys.argv[1],'w:gz') as archive:
 item=tarfile.TarInfo('nixosvps/link');item.type=tarfile.SYMTYPE;item.linkname='/tmp/elsewhere';archive.addfile(item)
`,path.join(directory,m.artifacts.go.filename)]);
 assert.throws(()=>verifyGoSource(directory,m,path.join(source,'nixosvps')),/Unsafe Go/);
});

test('GitHub release creation is resumable, refuses conflicting assets/tags and publishes Go last',async t=>{
 const directory=temporary(t),m=manifest(),events=[],tags=new Map();let release=null;
 for(const name of ['manifest.json','SHA256SUMS',...Object.values(m.artifacts).map(item=>item.filename)])fs.writeFileSync(path.join(directory,name),name);
 for(const item of Object.values(m.artifacts))item.sha256=sha256(path.join(directory,item.filename));
 let failUpload=true;
 const api=async(endpoint,options={})=>{
  const method=options.method||'GET';events.push({endpoint,method});
  if(endpoint.startsWith('git/ref/tags/'))return tags.has(decodeURIComponent(endpoint.slice(13)))?{object:{type:'commit',sha:tags.get(decodeURIComponent(endpoint.slice(13)))}}:null;
  if(endpoint==='git/refs'){tags.set(options.body.ref.slice(10),options.body.sha);return {};}
  if(endpoint.startsWith('releases/tags/'))return release;
  if(endpoint==='releases'){release={...options.body,id:1,assets:[]};return release;}
  if(endpoint.startsWith('releases/1/assets?')){
   if(failUpload&&release.assets.length===2){failUpload=false;throw Error('Synthetic interruption');}
   const asset={name:new URL('https://example.local/'+endpoint).searchParams.get('name'),digest:'sha256:'+digest(options.bytes)};release.assets.push(asset);return asset;
  }
  if(endpoint==='releases/1'){Object.assign(release,options.body);return release;}
  throw Error('Unexpected API call '+endpoint);
 };
 const options={api,validate:()=>m};
 await assert.rejects(()=>publishGitHub(directory,options),/Synthetic/);assert.equal(release.draft,true);assert.equal(tags.has(m.goTag),false);
 await publishGitHub(directory,options);assert.equal(release.draft,false);assert.equal(tags.get(m.goTag),commit);
 const writes=events.filter(event=>event.method!=='GET').length;await publishGitHub(directory,options);
 assert.equal(events.filter(event=>event.method!=='GET').length,writes,'Retry performed writes');
 release.assets[0].digest='sha256:'+hash;await assert.rejects(()=>publishGitHub(directory,options),/differs/);
 tags.set(m.goTag,'c'.repeat(40));await assert.rejects(()=>publishGitHub(directory,options),/another commit/);
});

test('registry preflight requires a public matching plugin and never stages conflicting Python files',async t=>{
 const directory=temporary(t),m=manifest(),uploadDirectory=path.join(directory,'upload'),output=path.join(directory,'outputs');
 const wheel=m.artifacts.pythonWheel;
 fs.writeFileSync(path.join(directory,m.artifacts.pythonSource.filename),'pythonSource');
 const api=async endpoint=>endpoint.startsWith('git/ref/')?{object:{type:'commit',sha:commit}}:{draft:false,prerelease:true,assets:[{name:m.artifacts.plugin.filename,digest:'sha256:'+m.artifacts.plugin.sha256}]};
 const fetcher=async url=>url.startsWith('https://files.pythonhosted.org/')?new Response('pythonWheel'):json({info:{name:'pulumi-nixos-vps',version:'0.2.0.dev1'},urls:[{filename:wheel.filename,digests:{sha256:wheel.sha256},url:'https://files.pythonhosted.org/wheel'}]});
 await assert.rejects(()=>requirePlugin(m,async()=>null),/matching GitHub/);
 await preflight(directory,'pypi',{api,fetcher,validate:()=>m,env:{GITHUB_OUTPUT:output},uploadDirectory});
 assert.deepEqual(fs.readdirSync(uploadDirectory),[m.artifacts.pythonSource.filename]);assert.equal(fs.readFileSync(output,'utf8'),'exists=false\n');
 await assert.rejects(()=>preflight(directory,'pypi',{api,fetcher,validate:()=>m,env:{},uploadDirectory}),/refusing overwrite/);
});

test('the workflow is manual, fail-closed, approved per destination and gives no publishing privileges to preparation',()=>{
 const YAML=require('yaml'),filename=path.join(root,'.github/workflows/provider-release.yml');
 const source=fs.readFileSync(filename,'utf8'),workflow=YAML.parse(source);
 assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
 assert.equal(workflow.on.workflow_dispatch.inputs.target.default,'prepare');
 assert.deepEqual(workflow.permissions,{contents:'read'});
 assert.deepEqual(workflow.jobs.prepare.permissions,{contents:'read',actions:'read'});
 assert.match(workflow.jobs.prepare.steps.find(step=>step.name==='Require successful validation of this commit').run,/--commit "\$GITHUB_SHA"/);
 for(const [job,environment] of [['github','provider-release'],['npm','npm'],['pypi','pypi']]){
  assert.equal(workflow.jobs[job].environment,environment);
  assert.equal(workflow.jobs[job].needs,'prepare');
  assert.match(workflow.jobs[job].if,/vars\.PROVIDER_RELEASE_ENABLED == 'true'/);
 }
 assert.equal(workflow.jobs.github.permissions.contents,'write');assert.equal(workflow.jobs.github.permissions['id-token'],undefined);
 for(const job of ['npm','pypi'])assert.deepEqual(workflow.jobs[job].permissions,{contents:'read','id-token':'write'});
 for(const line of source.split('\n').filter(line=>/uses:/.test(line)))assert.match(line,/@[a-f0-9]{40}\b/);
 assert.doesNotMatch(source,/secrets\.|HCLOUD_TOKEN|pulumi up|--clobber|skip-existing/);
 assert.match(source,/digest-mismatch: error/);assert.match(source,/persist-credentials: false/);
});
