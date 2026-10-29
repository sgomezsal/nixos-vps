const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {contract,artifactNames,archive,buildEnvironment,sha256}=require('../scripts/distribution.cjs');
const metadata=require('../package.json');
const root=path.resolve(__dirname,'../../..');
const {prepare,verify,writeManifest}=require('../../../scripts/provider-release.cjs');

function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'provider-distribution-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function strip(value){return Array.isArray(value)?value.map(strip):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='description').map(([key,v])=>[key,strip(v)])):value;}

test('registry metadata and overview describe the same package and supported languages',()=>{
  const schema=require('../schema.json'),YAML=require('yaml');
  const overview=fs.readFileSync(path.join(root,'docs/_index.md'),'utf8');
  const match=overview.match(/^---\n([\s\S]*?)\n---\n/);assert.ok(match,'Registry overview requires YAML front matter');
  const front=YAML.parse(match[1]);assert.equal(front.title,schema.displayName);assert.equal(front.layout,'package');
  assert.ok(front.meta_desc.includes(schema.name));assert.equal(schema.publisher,'sgomezsal');
  for(const keyword of ['category/infrastructure','kind/component'])assert.ok(schema.keywords.includes(keyword));
  assert.match(overview,/chooser language "typescript,python,go"/);
  for(const [language,example] of [['typescript','examples/provider/typescript/index.ts'],['python','examples/provider/python/__main__.py'],['go','examples/provider/go/main.go']]){
    const snippet=overview.match(new RegExp('```'+language+'\\n([\\s\\S]*?)```'));
    assert.ok(snippet,'Missing runnable '+language+' example');
    assert.equal(snippet[1].trim(),fs.readFileSync(path.join(root,example),'utf8').trim(),'Overview example drifted from engine-tested source');
  }
  for(const heading of ['Installation','Example Usage','Configuration'])assert.ok(overview.includes('## '+heading));
  for(const input of Object.keys(schema.resources['nixos-vps:hetzner:NixosServer'].inputProperties))assert.ok(overview.includes('`'+input+'`'),'Missing component input: '+input);
  assert.match(overview,/HCLOUD_TOKEN/);assert.match(overview,/formats/);assert.match(overview,/Node.js 22\+/);
});

test('generated README distinguishes stable and prerelease versions without widening support',()=>{
  const {sdkReadme}=require('../scripts/generate-sdks.cjs');
  assert.match(sdkReadme('0.2.0-dev.1'),/Experimental Pulumi component SDK/);
  assert.doesNotMatch(sdkReadme('0.2.0'),/Experimental/);
  for(const version of ['0.2.0','0.2.0-dev.1']){
    const readme=sdkReadme(version);assert.ok(readme.includes('('+version+')'));
    assert.match(readme,/Installation formats/);assert.match(readme,/Node.js 22\+/);assert.match(readme,/CX23 with BIOS/);
  }
});

test('the initial multi-language API and distribution names cannot drift silently',()=>{
  const schema=require('../schema.json');
  assert.deepEqual({resources:strip(schema.resources)},require('../api-baseline.json'));
  assert.equal(schema.version,metadata.version);
  assert.equal(schema.language.nodejs.packageName,'@sgomezsal/nixos-vps');
  assert.equal(schema.language.nodejs.packageName,contract.npmPackage);
  assert.equal(schema.language.python.packageName,contract.pythonModule);
  assert.equal(schema.language.go.importBasePath,contract.goModule);
  assert.equal(schema.pluginDownloadURL,contract.pluginDownloadURL);
  assert.equal(contract.pythonDistribution,'pulumi-nixos-vps');
  assert.equal(require('../../nixos-vps/package.json').name,'nixos-vps');
  const names=artifactNames(metadata.version);
  assert.equal(names.plugin,`pulumi-resource-nixos-vps-v${metadata.version}-linux-amd64.tar.gz`);
  assert.throws(()=>artifactNames('../malicious'),/Unsupported/);
});

test('plugin and SDK builds use public integrity-locked dependency graphs',()=>{
  const runtime=require('../runtime/package.json');
  const runtimeLock=require('../runtime/package-lock.json');
  const sdk=require('../sdk-node-lock.json');
  assert.deepEqual(runtime.dependencies,metadata.dependencies);
  assert.deepEqual(runtimeLock.packages[''].dependencies,runtime.dependencies);
  assert.equal(runtime.version,metadata.version);assert.equal(runtime.private,true);
  assert.equal(sdk.packages[''].name,contract.npmPackage);
  assert.equal(sdk.packages[''].devDependencies.typescript,contract.tools.typescript);
  for(const lock of [runtimeLock,sdk])for(const [name,item] of Object.entries(lock.packages)){
    if(!name)continue;
    assert.ok(!item.link,'Workspace links are not distributable');
    assert.match(item.resolved,/^https:\/\/registry\.npmjs\.org\//);
    assert.match(item.integrity,/^sha512-/);
  }
  assert.match(fs.readFileSync(path.join(__dirname,'../go-lock/go.mod'),'utf8'),/github.com\/pulumi\/pulumi\/sdk\/v3 v3\.217\.1/);
  assert.ok(fs.readFileSync(path.join(__dirname,'../go-lock/go.sum'),'utf8').split('\n').length>50);
});

test('canonical archives ignore build directory, modification time and umask',t=>{
  const directory=temporary(t),env=buildEnvironment(path.join(directory,'home'));
  const archives=[];
  for(const [index,mode] of [0o600,0o644].entries()){
    const source=path.join(directory,'source-'+index);fs.mkdirSync(source);
    const file=path.join(source,'file.txt');fs.writeFileSync(file,'identical\n',{mode});
    fs.utimesSync(file,new Date(1000+index*10000),new Date(2000+index*10000));
    const output=path.join(directory,index+'.tar.gz');archive(source,['file.txt'],output,env);archives.push(output);
  }
  assert.equal(sha256(archives[0]),sha256(archives[1]));
  assert.equal(env.HCLOUD_TOKEN,undefined);assert.equal(env.NPM_TOKEN,undefined);
  assert.equal(env.PULUMI_ACCESS_TOKEN,undefined);assert.equal(env.SOPS_AGE_KEY_FILE,undefined);
  assert.equal(env.HOME,path.join(directory,'home'));
});

test('artifact verification rejects tampering, unsafe paths, symlinks and incomplete validation',t=>{
  const directory=temporary(t),names=artifactNames(metadata.version),provider=path.resolve(__dirname,'..');
  const artifacts={};
  for(const [role,filename] of Object.entries(names)){
    fs.writeFileSync(path.join(directory,filename),role==='schema'?fs.readFileSync(path.join(provider,'schema.json')):'synthetic '+role);
    artifacts[role]={filename,sha256:sha256(path.join(directory,filename))};
  }
  const manifest={format:1,version:metadata.version,platform:contract.platform,publishable:false,validation:'passed',artifacts,
    apiSha256:sha256(path.join(provider,'schema.json')),runtimeLockSha256:sha256(path.join(provider,'runtime/package-lock.json')),
    nodeLockSha256:sha256(path.join(provider,'sdk-node-lock.json')),goLockSha256:sha256(path.join(provider,'go-lock/go.sum')),
    goModSha256:sha256(path.join(provider,'go-lock/go.mod')),distributionSha256:sha256(path.join(provider,'distribution.json'))};
  writeManifest(directory,manifest);
  const snapshot=()=>fs.readdirSync(directory).sort().map(file=>({file,hash:sha256(path.join(directory,file)),mode:fs.statSync(path.join(directory,file)).mode,mtime:fs.statSync(path.join(directory,file)).mtimeMs}));
  const before=snapshot();assert.equal(verify(directory).version,metadata.version);
  assert.throws(()=>prepare(directory),/refusing overwrite/);
  assert.deepEqual(snapshot(),before,'Verification or refused preparation modified existing artifacts');
  fs.appendFileSync(path.join(directory,names.plugin),'tamper');assert.throws(()=>verify(directory),/integrity/);
  fs.writeFileSync(path.join(directory,names.plugin),'synthetic plugin');
  manifest.artifacts.plugin.filename='../escape';writeManifest(directory,manifest);assert.throws(()=>verify(directory),/integrity/);
  manifest.artifacts.plugin.filename=names.plugin;manifest.validation='prepared';writeManifest(directory,manifest);
  assert.throws(()=>verify(directory),/validation status/);assert.equal(verify(directory,false).validation,'prepared');
  manifest.validation='passed';writeManifest(directory,manifest);
  const saved=fs.readFileSync(path.join(directory,'manifest.json'));fs.rmSync(path.join(directory,'manifest.json'));
  fs.writeFileSync(path.join(directory,'outside.json'),saved);fs.symlinkSync(path.join(directory,'outside.json'),path.join(directory,'manifest.json'));
  assert.throws(()=>verify(directory),/regular files/);
});

test('artifact preparation in CI cannot publish or request cloud credentials',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
  assert.match(workflow,/provider-artifacts:[\s\S]*needs: validate/);
  assert.match(workflow,/npm run provider:prepare/);assert.match(workflow,/npm run provider:verify/);
  assert.match(workflow,/include-hidden-files: true/);assert.match(workflow,/if-no-files-found: error/);
  assert.doesNotMatch(workflow,/id-token:\s*write|contents:\s*write|npm publish|twine upload|git push|secrets\./);
  for(const line of workflow.split('\n').filter(line=>/uses:/.test(line)))assert.match(line,/@[a-f0-9]{40}\b/);
});
