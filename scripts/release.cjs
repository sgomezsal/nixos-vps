#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const registry='https://registry.npmjs.org';
function run(binary,args,cwd=root,stream=false){const r=spawnSync(binary,args,{cwd,encoding:'utf8',timeout:30*60*1000,maxBuffer:64*1024*1024,...(stream?{stdio:"inherit"}:{})});if(r.status!==0)throw new Error(`${binary} ${args[0]} failed; release preparation stopped.\n${r.stderr||r.error?.message||r.stdout}`);return (r.stdout||"").trim();}
function integrity(bytes){return 'sha512-'+crypto.createHash('sha512').update(bytes).digest('base64');}
function validateArtifact(manifest,bytes){if(manifest.name!=='nixos-vps'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)||manifest.filename!==`nixos-vps-${manifest.version}.tgz`||!/^sha512-[A-Za-z0-9+/=]+$/.test(manifest.integrity)||!/^[a-f0-9]{40}$/.test(manifest.commit))throw new Error('Invalid release manifest');if(integrity(bytes)!==manifest.integrity)throw new Error('Artifact integrity mismatch; do not publish or retry with different bytes');}
function publishedState(manifest,data){if(!data?.versions?.[manifest.version])return 'pending';if(data.versions[manifest.version].dist?.integrity!==manifest.integrity)throw new Error('Published integrity differs from the inspected artifact; investigate before announcing or retrying');if(data['dist-tags']?.next!==manifest.version)return 'tag-pending';return 'available';}
async function verify(manifest,bytes,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=6}={}){
 validateArtifact(manifest,bytes);
 for(let i=0;i<attempts;i++){
  const response=await fetchImpl(`${registry}/nixos-vps`,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok&&response.status!==404)throw new Error(`Registry lookup failed (${response.status}); availability is unverified`);
  const data=response.status===404?{}:await response.json(),state=publishedState(manifest,data);
  if(state==='available'){
   const url=data.versions[manifest.version].dist.tarball;
   if(typeof url!=='string'||!url.startsWith(`${registry}/nixos-vps/-/`))throw new Error('Unexpected registry tarball URL');
   const artifact=await fetchImpl(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
   if(!artifact.ok)throw new Error(`Published tarball download failed (${artifact.status})`);
   if(integrity(Buffer.from(await artifact.arrayBuffer()))!==manifest.integrity)throw new Error('Downloaded registry tarball integrity mismatch');
   return;
  }
  console.log(state==='pending'?'PENDING: requested version is not available; a staging placeholder is not a release.':'PENDING: version exists but next does not identify it.');
  if(i+1<attempts)await sleep(10000);
 }
 throw new Error('Release remains pending. Do not republish or bump the version to bypass processing. Check npm notifications and Staged Packages; contact npm support if unresolved.');
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
async function main(){const command=process.argv[2];if(command==='prepare')prepare();else if(command==='verify'){const {manifest,bytes}=readArtifact();await verify(manifest,bytes);console.log(`VERIFIED: nixos-vps@${manifest.version}, next tag and downloaded tarball integrity match the prepared artifact.`);}else throw new Error('Usage: node scripts/release.cjs prepare|verify');}
module.exports={integrity,validateArtifact,publishedState,verify,readArtifact};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
