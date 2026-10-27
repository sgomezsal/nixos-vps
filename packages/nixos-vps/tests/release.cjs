const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {integrity,validateArtifact,publishedState,verify}=require('../../../scripts/release.cjs');
const bytes=Buffer.from('synthetic release fixture');
const manifest={name:'nixos-vps',version:'0.1.1',filename:'nixos-vps-0.1.1.tgz',integrity:integrity(bytes),commit:'a'.repeat(40)};
const available=()=>({versions:{'0.1.1':{dist:{integrity:manifest.integrity,tarball:'https://registry.npmjs.org/nixos-vps/-/nixos-vps-0.1.1.tgz'}}},'dist-tags':{next:'0.1.1'}});
test('release verification refuses corrupted or misidentified artifacts',()=>{
 validateArtifact(manifest,bytes);
 assert.throws(()=>validateArtifact(manifest,Buffer.from('changed')),/integrity mismatch/);
 assert.throws(()=>validateArtifact({...manifest,filename:'../other.tgz'},bytes),/Invalid release manifest/);
 assert.throws(()=>publishedState(manifest,{versions:{'0.1.1':{dist:{integrity:'wrong'}}}}),/Published integrity differs/);
 assert.equal(publishedState(manifest,{versions:{'0.0.0-stage':{}},'dist-tags':{latest:'0.0.0-stage'}}),'pending');
 assert.equal(publishedState(manifest,{...available(),'dist-tags':{next:'0.1.0'}}),'tag-pending');
});
test('release verification waits for metadata then verifies downloaded bytes without publishing',async()=>{
 let lookups=0,waits=0;
 await verify(manifest,bytes,{sleep:async()=>{waits++;},fetchImpl:async url=>{
  if(url.endsWith('.tgz'))return {ok:true,arrayBuffer:async()=>bytes};
  lookups++;return lookups===1?{ok:false,status:404}:{ok:true,json:async()=>available()};
 }});
 assert.equal(lookups,2);assert.equal(waits,1);
});
test('pending processing, registry failures and corrupted downloads never report success',async()=>{
 await assert.rejects(verify(manifest,bytes,{attempts:1,fetchImpl:async()=>({ok:true,json:async()=>({versions:{'0.0.0-stage':{}}})})}),/remains pending/);
 await assert.rejects(verify(manifest,bytes,{fetchImpl:async()=>({ok:false,status:403})}),/lookup failed/);
 await assert.rejects(verify(manifest,bytes,{fetchImpl:async url=>url.endsWith('.tgz')?{ok:true,arrayBuffer:async()=>Buffer.from('tampered')}:{ok:true,json:async()=>available()}}),/tarball integrity mismatch/);
});
test('release preparation fails at the first child failure and cannot reach pack or publish',()=>{
 const vm=require('node:vm'),calls=[];
 const child={spawnSync(binary,args){calls.push([binary,...args]);if(binary==='git')return {status:0,stdout:args[0]==='status'?'':'a'.repeat(40)};return {status:1,stderr:'synthetic prerequisite failure'};}};
 const context={require:n=>n==='node:child_process'?child:n==='node:fs'?{...fs,existsSync:()=>false,rmSync:()=>{}}:require(n),module:{exports:{}},__dirname:path.resolve(__dirname,'../../../scripts'),process:{argv:['node','release.cjs','prepare']},console:{log(){},error(){}},Buffer,AbortSignal};context.require.main=context.module;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../scripts/release.cjs'),'utf8'),context);
 assert.deepEqual(calls.map(c=>c[0]),['git','git','bash']);
});
test('successful preparation requests machine-readable dry-run output before writing a matching manifest',()=>{
 const vm=require('node:vm'),calls=[];let written;
 const metadata={name:manifest.name,version:manifest.version,filename:manifest.filename,integrity:manifest.integrity};
 const child={spawnSync(binary,args){calls.push([binary,...args]);
  if(binary==='git')return {status:0,stdout:args[0]==='status'?'':manifest.commit};
  if(binary==='bash')return {status:0};
  assert.equal(binary,'npm');assert.ok(args.includes('--json'),'npm JSON output must be requested explicitly');
  return {status:0,stdout:JSON.stringify(args[0]==='pack'?[metadata]:metadata)};
 }};
 const fakeFs={existsSync:()=>false,rmSync(){},mkdirSync(){},readFileSync:()=>bytes,writeFileSync:(file,data)=>{assert.ok(file.endsWith('manifest.json'));written=JSON.parse(data);}};
 const context={require:n=>n==='node:child_process'?child:n==='node:fs'?fakeFs:require(n),module:{exports:{}},__dirname:path.resolve(__dirname,'../../../scripts'),process:{argv:['node','release.cjs','prepare']},console:{log(){},error(){}},Buffer,AbortSignal};context.require.main=context.module;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../scripts/release.cjs'),'utf8'),context);
 assert.deepEqual(written,manifest);assert.equal(calls.filter(c=>c[0]==='npm').length,2);
});
test('default verification accepts processing longer than the previous fifty-second window',async()=>{
 let time=0,lookups=0;
 await verify(manifest,bytes,{now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async url=>{
  if(url.endsWith('.tgz'))return {ok:true,arrayBuffer:async()=>bytes};
  lookups++;return {ok:true,json:async()=>lookups<8?{versions:{}}:available()};
 }});
 assert.equal(lookups,8);assert.equal(time,70000);
});
test('verification timeout is bounded and signals pending without reporting publication failure',async()=>{
 let time=0,calls=0;
 await assert.rejects(verify(manifest,bytes,{timeoutMs:25000,now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({versions:{}})};}}),error=>error.code==='RELEASE_PENDING'&&/Submission may have succeeded/.test(error.message));
 assert.equal(time,25000);assert.equal(calls,3);
});
test('verification wait arguments reject unsupported values and default to ten minutes',()=>{
 const {verifyOptions}=require('../../../scripts/release.cjs');
 assert.deepEqual(verifyOptions([]),{timeoutMs:600000,requireNext:true});
 assert.deepEqual(verifyOptions(['--wait-seconds','120','--version-only']),{timeoutMs:120000,requireNext:false});
 for(const args of [['--wait-seconds'],['--wait-seconds','0'],['--wait-seconds','1801'],['--wait-seconds','1.2'],['--wait-seconds',';echo'],['--unknown']])assert.throws(()=>verifyOptions(args));
});
test('historical verification allows next to move but still checks the requested artifact bytes',async()=>{
 const moved={...available(),'dist-tags':{next:'0.2.0'}};
 assert.equal(publishedState(manifest,moved),'tag-pending');
 assert.equal(publishedState(manifest,moved,{requireNext:false}),'available');
 const fetchImpl=async url=>url.endsWith('.tgz')?{ok:true,arrayBuffer:async()=>bytes}:{ok:true,json:async()=>moved};
 await verify(manifest,bytes,{requireNext:false,fetchImpl});
 await assert.rejects(verify(manifest,Buffer.from('wrong'),{requireNext:false,fetchImpl}),/Artifact integrity mismatch/);
});
test('verification-only recovery binds the artifact to the original repository, run, commit and version',()=>{
 const {validateSourceRun}=require('../../../scripts/release.cjs');
 const run={id:123,repository:{full_name:'owner/repo'},head_repository:{full_name:'owner/repo'},head_branch:'main',event:'workflow_dispatch',status:'completed',path:'.github/workflows/release.yml',head_sha:manifest.commit};
 const options={repository:'owner/repo',runId:'123',version:manifest.version};
 validateSourceRun(manifest,run,options);
 for(const change of [{id:124},{head_sha:'b'.repeat(40)},{head_repository:{full_name:'fork/repo'}},{repository:{full_name:'other/repo'}},{path:'.github/workflows/ci.yml'},{head_branch:'other'},{event:'pull_request'},{status:'in_progress'}])assert.throws(()=>validateSourceRun(manifest,{...run,...change},options),/does not match/);
 assert.throws(()=>validateSourceRun(manifest,run,{...options,version:'0.2.0'}),/does not match/);
});
