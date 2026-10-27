#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const registry='https://registry.npmjs.org';
function run(binary,args,cwd=root,stream=false){const r=spawnSync(binary,args,{cwd,encoding:'utf8',timeout:30*60*1000,maxBuffer:64*1024*1024,...(stream?{stdio:"inherit"}:{})});if(r.status!==0)throw new Error(`${binary} ${args[0]} failed; release preparation stopped.\n${r.stderr||r.error?.message||r.stdout}`);return (r.stdout||"").trim();}
function integrity(bytes){return 'sha512-'+crypto.createHash('sha512').update(bytes).digest('base64');}
function validateArtifact(manifest,bytes){if(manifest.name!=='nixos-vps'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)||manifest.filename!==`nixos-vps-${manifest.version}.tgz`||!/^sha512-[A-Za-z0-9+/=]+$/.test(manifest.integrity)||!/^[a-f0-9]{40}$/.test(manifest.commit))throw new Error('Invalid release manifest');if(integrity(bytes)!==manifest.integrity)throw new Error('Artifact integrity mismatch; do not publish or retry with different bytes');}
function publishedState(manifest,data,{requireNext=true}={}){if(!data?.versions?.[manifest.version])return 'pending';if(data.versions[manifest.version].dist?.integrity!==manifest.integrity)throw new Error('Published integrity differs from the inspected artifact; investigate before announcing or retrying');if(requireNext && data['dist-tags']?.next!==manifest.version)return 'tag-pending';return 'available';}
function verifyOptions(args) {
 const options={timeoutMs:600000,requireNext:true};
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--version-only')options.requireNext=false;
  else if(args[i]==='--wait-seconds') {
   const value=args[++i];
   if(!/^\d+$/.test(value??'')||Number(value)<1||Number(value)>1800)throw new Error('--wait-seconds must be an integer between 1 and 1800');
   options.timeoutMs=Number(value)*1000;
  } else throw new Error('Unknown verification option; use --wait-seconds SECONDS or --version-only');
 }
 return options;
}
function validateSourceRun(manifest,run,{repository,runId,version}) {
 if(!/^\d+$/.test(String(runId)) || String(run.id)!==String(runId) ||
    run.repository?.full_name!==repository || run.head_repository?.full_name!==repository ||
    run.head_branch!=='main' || run.event!=='workflow_dispatch' || run.status!=='completed' ||
    run.path?.split('@')[0]!=='.github/workflows/release.yml' ||
    run.head_sha!==manifest.commit || manifest.version!==version) {
  throw new Error('Source run, repository, commit or requested version does not match the release artifact');
 }
}
async function verify(manifest,bytes,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=Infinity,timeoutMs=600000,now=Date.now,requireNext=true}={}) {
 validateArtifact(manifest,bytes);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>1800000)throw new Error('Verification wait must be between 1 and 1800 seconds');
 const deadline=now()+timeoutMs;
 for(let i=0;i<attempts;i++) {
  const remaining=deadline-now();
  if(remaining<=0)break;
  const response=await fetchImpl(`${registry}/nixos-vps`,{signal:AbortSignal.timeout(Math.max(1,Math.min(15000,remaining))),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok&&response.status!==404)throw new Error(`Registry lookup failed (${response.status}); availability is unverified`);
  const data=response.status===404?{}:await response.json(),state=publishedState(manifest,data,{requireNext});
  if(state==='available') {
   const url=data.versions[manifest.version].dist.tarball;
   if(typeof url!=='string'||!url.startsWith(`${registry}/nixos-vps/-/`))throw new Error('Unexpected registry tarball URL');
   const artifact=await fetchImpl(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
   if(!artifact.ok)throw new Error(`Published tarball download failed (${artifact.status})`);
   if(integrity(Buffer.from(await artifact.arrayBuffer()))!==manifest.integrity)throw new Error('Downloaded registry tarball integrity mismatch');
   return;
  }
  console.log(state==='pending'?'PENDING: requested version is not yet available. This is not confirmation of publication failure.':'PENDING: version exists but next does not identify it.');
  if(i+1<attempts && now()<deadline)await sleep(Math.min(10000,deadline-now()));
 }
 const error=new Error('Release remains pending after the verification window. Submission may have succeeded. Run the Verify npm release workflow with the original run ID and artifact; do not republish or bump the version. Check npm notifications and Staged Packages if processing remains unresolved.');
 error.code='RELEASE_PENDING';throw error;
}
function readArtifact(directory=path.join(root,'.release')){const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));const bytes=fs.readFileSync(path.join(directory,path.basename(manifest.filename)));validateArtifact(manifest,bytes);return {manifest,bytes};}
function prepare(){
 const previous=path.join(root,'.release','manifest.json');
 if(fs.existsSync(path.dirname(previous)) && (!fs.lstatSync(path.dirname(previous)).isDirectory() || fs.lstatSync(path.dirname(previous)).isSymbolicLink()))throw new Error('Release output must be a real directory, not a symlink');
 fs.rmSync(previous,{force:true});
 if(run('git',['status','--porcelain']))throw new Error('Commit or stash source changes before release preparation; the artifact must identify a clean commit.');
 const commit=run('git',['rev-parse','HEAD']);
 console.log('Running full local validation. No publication or cloud provisioning.');
 run('bash',['scripts/validate.sh'],root,true);
 const directory=path.join(root,'.release');fs.mkdirSync(directory,{recursive:true});
 const [pack]=JSON.parse(run('npm',['pack','--workspace','nixos-vps','--ignore-scripts','--json','--pack-destination',directory]));
 const manifest={name:pack.name,version:pack.version,filename:pack.filename,integrity:pack.integrity,commit};
 validateArtifact(manifest,fs.readFileSync(path.join(directory,pack.filename)));
 const dry=JSON.parse(run('npm',['publish',path.join(directory,pack.filename),'--dry-run','--json','--ignore-scripts','--access','public','--tag','next',`--registry=${registry}/`]));
 if(dry.name!==manifest.name||dry.version!==manifest.version||dry.integrity!==manifest.integrity)throw new Error('npm dry-run artifact differs from the prepared release');
 if(run('git',['status','--porcelain'])||run('git',['rev-parse','HEAD'])!==commit)throw new Error('Source changed during release preparation; discard this artifact');
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(`PREPARED: ${pack.filename} from ${commit}. Not published. Use this exact artifact for publishing and release:verify afterward.`);
}
async function main(){
 const command=process.argv[2];
 if(command==='prepare')prepare();
 else if(command==='verify') {
  const options=verifyOptions(process.argv.slice(3));
  const {manifest,bytes}=readArtifact();
  await verify(manifest,bytes,options);
  const message=`VERIFIED: nixos-vps@${manifest.version}, downloaded tarball integrity matches the prepared artifact${options.requireNext?', next tag matches':''}.`;
  console.log(message);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,message+'\n');
 }else throw new Error('Usage: node scripts/release.cjs prepare|verify [--wait-seconds SECONDS] [--version-only]');
}
module.exports={integrity,validateArtifact,publishedState,verify,readArtifact,verifyOptions,validateSourceRun};
if(require.main===module)main().catch(e=>{
 console.error(e.message);
 if(e.code==='RELEASE_PENDING'&&process.env.GITHUB_STEP_SUMMARY) {
  const runId=process.env.SOURCE_RUN_ID ?? process.env.GITHUB_RUN_ID;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'Verification pending; publication submission may already have succeeded. Repeat only verification using the original npm-release artifact'+(/^\d+$/.test(runId??'')?' from run '+runId:'')+'. Do not republish.\n');
 }
 process.exitCode=1;
});
