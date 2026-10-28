// Publication guards and read-only registry verification. Publishing is explicit.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {verify,sourceIdentity}=require('./provider-release.cjs');
const {contract,sha256,run}=require('../packages/nixos-vps-provider/scripts/distribution.cjs');
const root=path.resolve(__dirname,'..'),repository='sgomezsal/nixos-vps';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function releasePolicy(version) {
  if(typeof version!=='string'||version.trim()!==version||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-dev\.(0|[1-9]\d*))?$/.test(version))
    throw Error('Unsupported release version; use X.Y.Z or X.Y.Z-dev.N');
  const prerelease=version.includes('-dev.');
  return {channel:prerelease?'prerelease':'stable',prerelease,npmTag:prerelease?'next':'latest'};
}

function guardIdentity(manifest,env,source,target) {
  const policy=releasePolicy(manifest.version);
  if(env.PROVIDER_RELEASE_CHANNEL!==policy.channel)
    throw Error('Selected release channel does not match candidate version');
  if(!['github','npm','pypi'].includes(target)||env.PROVIDER_RELEASE_TARGET!==target||
    env.PROVIDER_RELEASE_ENABLED!=='true'||env.GITHUB_ACTIONS!=='true'||
    env.GITHUB_REPOSITORY!==repository||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_WORKFLOW_REF!==`${repository}/.github/workflows/provider-release.yml@refs/heads/main`)
    throw Error('Publication requires the enabled, manually dispatched provider-release.yml on main');
  if(!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||manifest.source?.commit!==env.GITHUB_SHA||
    source.commit!==env.GITHUB_SHA||manifest.source.dirty!==false||source.dirty!==false||
    manifest.source.sha256!==source.sha256||manifest.publishable!==true||
    manifest.validation!=='passed'||manifest.reproducible!==true||
    manifest.pluginReleaseTag!==`v${manifest.version}`||manifest.goTag!==`sdk/go/nixosvps/v${manifest.version}`)
    throw Error('Publication requires a validated reproducible candidate from this exact clean commit');
}

function files(directory,prefix='') {
  return fs.readdirSync(directory).sort().flatMap(name=>{
    const filename=path.join(directory,name),relative=prefix+name,stat=fs.lstatSync(filename);
    if(stat.isSymbolicLink())throw Error('Go SDK source must not contain symlinks');
    if(stat.isDirectory())return files(filename,relative+'/');
    if(!stat.isFile())throw Error('Go SDK source must contain only regular files');
    return [{name:relative,sha256:sha256(filename)}];
  });
}

function verifyGoSource(directory,manifest,source=path.join(root,'sdk/go/nixosvps')) {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-go-parity-'));
  try {
    // Reject links, duplicate members and traversal before extracting any member.
    run('python3',['-c',`import pathlib,sys,tarfile
with tarfile.open(sys.argv[1]) as archive:
 seen=set()
 for item in archive.getmembers():
  name=item.name.rstrip('/'); parts=pathlib.PurePosixPath(name).parts
  if not parts or parts[0]!='nixosvps' or name!='/'.join(parts) or '..' in parts or name in seen or not (item.isfile() or item.isdir()):
   raise SystemExit('Unsafe Go source archive')
  seen.add(name)
 archive.extractall(sys.argv[2],filter='data')
`,path.join(directory,manifest.artifacts.go.filename),temporary]);
    if(!fs.existsSync(source)||fs.lstatSync(source).isSymbolicLink()||
      JSON.stringify(files(path.join(temporary,'nixosvps')))!==JSON.stringify(files(source)))
      throw Error('Commit sdk/go/nixosvps matching the candidate before creating its Go module tag');
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}

function guard(directory,target,env=process.env) {
  const manifest=verify(directory,true,true);
  guardIdentity(manifest,env,sourceIdentity(),target);
  verifyGoSource(directory,manifest);
  return manifest;
}

async function request(url,options={},fetcher=fetch) {
  return fetcher(url,{...options,signal:AbortSignal.timeout(30000)});
}
async function checkDownload(url,expected,fetcher=fetch) {
  if(!url.startsWith('https://'))throw Error('Registry artifact URL must use HTTPS');
  const response=await request(url,{},fetcher);
  if(response.status===404)return false;
  if(!response.ok)throw Error('Cannot download registry artifact: HTTP '+response.status);
  if(digest(Buffer.from(await response.arrayBuffer()))!==expected)throw Error('Published artifact integrity mismatch');
  return true;
}

async function registryState(manifest,target,fetcher=fetch) {
  const policy=releasePolicy(manifest.version);
  if(target==='npm') {
    const response=await request('https://registry.npmjs.org/'+encodeURIComponent(contract.npmPackage),{},fetcher);
    if(response.status===404)return {state:'absent',missing:['nodejs']};
    if(!response.ok)throw Error('Cannot read npm metadata: HTTP '+response.status);
    const data=await response.json(),version=data.versions?.[manifest.version];
    if(!version)return {state:data.versions?.['0.0.0-stage']&&Object.keys(data.versions).every(item=>item==='0.0.0-stage')?'pending':'absent',missing:['nodejs']};
    if(version.name!==contract.npmPackage||version.version!==manifest.version)throw Error('npm package identity mismatch');
    const url=new URL(version.dist?.tarball);
    if(url.protocol!=='https:'||url.hostname!=='registry.npmjs.org')throw Error('Unexpected npm artifact host');
    if(!await checkDownload(url.href,manifest.artifacts.nodejs.sha256,fetcher))return {state:'pending',missing:['nodejs']};
    if(data['dist-tags']?.[policy.npmTag]!==manifest.version)return {state:'tag-mismatch',missing:[]};
    return {state:'complete',missing:[]};
  }
  if(target!=='pypi')throw Error('Unknown registry');
  const version=manifest.version.replace(/-dev\.(\d+)$/,'.dev$1');
  const response=await request(`https://pypi.org/pypi/${contract.pythonDistribution}/${version}/json`,{},fetcher);
  if(response.status===404)return {state:'absent',missing:['pythonWheel','pythonSource']};
  if(!response.ok)throw Error('Cannot read PyPI metadata: HTTP '+response.status);
  const data=await response.json();
  if(data.info?.name!==contract.pythonDistribution||data.info?.version!==version)throw Error('PyPI package identity mismatch');
  if(!Array.isArray(data.urls)||data.urls.some(file=>![manifest.artifacts.pythonWheel.filename,manifest.artifacts.pythonSource.filename].includes(file.filename)))
    throw Error('Unexpected PyPI release files');
  const missing=[];
  for(const role of ['pythonWheel','pythonSource']) {
    const expected=manifest.artifacts[role],matches=data.urls?.filter(file=>file.filename===expected.filename)||[];
    if(!matches.length){missing.push(role);continue;}
    if(matches.length!==1||matches[0].digests?.sha256!==expected.sha256)throw Error('Published PyPI artifact integrity mismatch');
    const url=new URL(matches[0].url);
    if(url.protocol!=='https:'||url.hostname!=='files.pythonhosted.org')throw Error('Unexpected PyPI artifact host');
    if(!await checkDownload(url.href,expected.sha256,fetcher))return {state:'pending',missing:[role]};
  }
  return {state:missing.length?'partial':'complete',missing};
}

async function githubAPI(endpoint,{method='GET',body,bytes,headers={}}={},fetcher=fetch,token=process.env.GH_TOKEN) {
  const base=bytes?'https://uploads.github.com/':'https://api.github.com/';
  const response=await request(base+`repos/${repository}/`+endpoint,{method,headers:{
    Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{}),
    ...(body?{'Content-Type':'application/json'}:{}),...headers},body:bytes|| (body?JSON.stringify(body):undefined)},fetcher);
  if(response.status===404&&method==='GET')return null;
  if(!response.ok)throw Error('GitHub API '+method+' failed: HTTP '+response.status);
  return response.json();
}
async function tagTarget(tag,api=githubAPI) {
  const ref=await api('git/ref/tags/'+encodeURIComponent(tag));
  if(!ref)return null;
  let object=ref.object;
  for(let depth=0;object.type==='tag'&&depth<5;depth++)object=(await api('git/tags/'+object.sha)).object;
  if(object.type!=='commit')throw Error('Release tag must resolve to a commit');
  return object.sha;
}
async function requirePlugin(manifest,api=githubAPI) {
  const policy=releasePolicy(manifest.version);
  const release=await api('releases/tags/'+encodeURIComponent(manifest.pluginReleaseTag));
  if(!release||release.draft||release.prerelease!==policy.prerelease)throw Error('Publish and verify the matching GitHub release channel before publishing an SDK');
  if(await tagTarget(manifest.pluginReleaseTag,api)!==manifest.source.commit)throw Error('Plugin release points to another commit');
  const asset=release.assets.find(item=>item.name===manifest.artifacts.plugin.filename);
  if(!asset||asset.digest!=='sha256:'+manifest.artifacts.plugin.sha256)throw Error('GitHub plugin asset integrity mismatch');
}

async function publishGitHub(directory,{env=process.env,api=githubAPI,validate=guard}={}) {
  const manifest=validate(directory,'github',env),commit=manifest.source.commit;
  const policy=releasePolicy(manifest.version);
  // Inspect an existing release before creating any missing tags.
  let release=await api('releases/tags/'+encodeURIComponent(manifest.pluginReleaseTag));
  if(release&&release.prerelease!==policy.prerelease)throw Error('Existing release channel differs; refusing modification');
  for(const tag of [manifest.pluginReleaseTag,manifest.goTag]) {
    const current=await tagTarget(tag,api);
    if(current&&current!==commit)throw Error('Existing release tag points to another commit; refusing replacement');
  }
  if(!await tagTarget(manifest.pluginReleaseTag,api))await api('git/refs',{method:'POST',body:{ref:'refs/tags/'+manifest.pluginReleaseTag,sha:commit}});
  if(!release)release=await api('releases',{method:'POST',body:{tag_name:manifest.pluginReleaseTag,target_commitish:commit,
    name:'nixos-vps '+manifest.version,draft:true,prerelease:policy.prerelease,
    body:(policy.prerelease?'Experimental multi-language':'Multi-language')+' component provider. Requires Node.js 22+, Nix, OpenSSH and Pulumi on x86_64 Linux. Installation formats the target disk. See docs/multilanguage.md and examples/provider/README.md at this release commit.'}});
  const filenames=['manifest.json','SHA256SUMS',...Object.values(manifest.artifacts).map(item=>item.filename)];
  if(release.assets.some(item=>!filenames.includes(item.name)))throw Error('Unexpected assets in existing GitHub release');
  for(const filename of filenames) {
    const content=fs.readFileSync(path.join(directory,filename)),expected='sha256:'+digest(content);
    const existing=release.assets.find(item=>item.name===filename);
    if(existing){if(existing.digest!==expected)throw Error('Existing GitHub asset differs; refusing replacement');continue;}
    if(!release.draft)throw Error('Published release is incomplete; refusing to add assets silently');
    const asset=await api(`releases/${release.id}/assets?name=${encodeURIComponent(filename)}`,{method:'POST',bytes:content,headers:{'Content-Type':'application/octet-stream'}});
    if(asset.digest!==expected)throw Error('Uploaded GitHub asset integrity mismatch');
  }
  if(release.draft)await api('releases/'+release.id,{method:'PATCH',body:{draft:false,prerelease:policy.prerelease,make_latest:'false'}});
  await requirePlugin(manifest,api);
  if(!await tagTarget(manifest.goTag,api))await api('git/refs',{method:'POST',body:{ref:'refs/tags/'+manifest.goTag,sha:commit}});
  return manifest;
}

async function preflight(directory,target,{env=process.env,fetcher=fetch,api=githubAPI,validate=guard,uploadDirectory=path.join(root,'.provider-upload')}={}) {
  const manifest=validate(directory,target,env);
  await requirePlugin(manifest,api);
  const status=await registryState(manifest,target,fetcher);
  if(status.state==='pending')throw Error(target+' is processing this package. Do not republish or bump the version; verify later');
  if(status.state==='tag-mismatch')throw Error('Matching npm version already exists but its channel tag differs. Review the dist-tag separately; do not republish');
  if(target==='npm'&&env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`npm_tag=${releasePolicy(manifest.version).npmTag}\n`);
  if(target==='pypi') {
    const output=uploadDirectory;
    if(fs.existsSync(output))throw Error('Upload directory exists; refusing overwrite');
    fs.mkdirSync(output,{mode:0o700});
    for(const role of status.missing)fs.copyFileSync(path.join(directory,manifest.artifacts[role].filename),path.join(output,manifest.artifacts[role].filename));
  }
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`exists=${status.state==='complete'}\n`);
  console.log(status.state==='complete'?'ALREADY VERIFIED: publication will be skipped.':'READY: only missing verified-version artifacts may be published after approval.');
}

async function verifyRegistry(directory,target,{attempts=6,delay=20000,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  const manifest=verify(directory,true,true);
  let state;
  for(let attempt=0;attempt<attempts;attempt++) {
    state=(await registryState(manifest,target,fetcher)).state;
    if(state==='complete'){
      console.log('VERIFIED: '+target+' artifacts downloaded and SHA-256 matched the candidate.'+
        (target==='npm'?' '+releasePolicy(manifest.version).npmTag+' tag matches.':''));return;
    }
    if(attempt+1<attempts)await sleep(delay);
  }
  if(state==='tag-mismatch')throw Error('npm artifacts match but the expected channel tag does not. Review the dist-tag separately; do not republish');
  throw Error('PENDING: registry processing is incomplete. Do not republish or bump the version; rerun verification');
}

module.exports={releasePolicy,guardIdentity,verifyGoSource,guard,registryState,tagTarget,requirePlugin,publishGitHub,preflight,verifyRegistry};
if(require.main===module)(async()=>{
  const [command,directory,target,...extra]=process.argv.slice(2);
  if(!directory||extra.length)throw Error('Usage: provider-publish.cjs guard|preflight|verify|publish-github /candidate [npm|pypi|github]');
  if(command==='guard')guard(directory,target);
  else if(command==='preflight')await preflight(directory,target);
  else if(command==='verify')await verifyRegistry(directory,target);
  else if(command==='publish-github'&&!target)await publishGitHub(directory);
  else throw Error('Unknown publication command');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
