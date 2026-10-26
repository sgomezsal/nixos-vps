// Test-only gRPC provider. No SDK, HTTP, SSH or cloud API calls are implemented.
const fs=require('node:fs'),crypto=require('node:crypto');
const stateFile=process.env.OFFLINE_PROVIDER_STATE;
const read=()=>JSON.parse(fs.readFileSync(stateFile,'utf8'));
const save=s=>fs.writeFileSync(stateFile,JSON.stringify(s));
const preflight=()=>({publicKey:'ssh-ed25519 AAAATEST fixture',hostPublicKey:'ssh-ed25519 AAAAHOST fixture',hostKeyDigest:crypto.createHash('sha256').update('synthetic-host-private').digest('hex')});
const trim=v=>Object.fromEntries(Object.entries(v).filter(([k])=>!['stdout','stderr','ipv4Address'].includes(k)));
const provider={version:'1.43.2',
 async check(urn,olds,news){return {inputs:news};},
 async diff(id,urn,olds,news){const changed=Object.keys({...trim(olds),...news}).filter(k=>JSON.stringify(olds[k])!==JSON.stringify(news[k]));const replaces=urn.includes('hcloud:index/server:Server')?changed.filter(k=>['location','image','sshKeys','userData'].includes(k)):urn.includes('sshKey')?changed.filter(k=>k==='publicKey'):[];return {changes:changed.length>0,replaces};},
 async create(urn,inputs){if(urn.endsWith('-preflight')&&inputs.environment?.NIXOS_INPUT_ERROR)throw new Error(inputs.environment.NIXOS_INPUT_ERROR);const s=read();s.next++;const id=String(s.next);s.events.push({op:'create',urn,id});
  if(urn.endsWith('-install')){s.attempts++;if(s.failNext){s.failNext=false;save(s);throw new Error('Synthetic installer failure before completion');}s.installs++;}
  const outs={...inputs};if(urn.includes('hcloud:index/server:Server'))outs.ipv4Address='192.0.2.55';
  if(urn.endsWith('-preflight'))outs.stdout=JSON.stringify(preflight());else if(urn.includes('command:local:Command'))outs.stdout='';
  s.objects[id]={urn,inputs,outs};save(s);return {id,outs};},
 async update(id,urn,olds,news){const s=read();s.events.push({op:'update',urn,id});
  if(urn.endsWith('-install')){if(!news.update||!news.update.endsWith(' update'))throw new Error('Unsafe installer update');const r=require('node:child_process').spawnSync('/bin/sh',['-c',news.update],{encoding:'utf8',env:{PATH:'/nonexistent'}});if(r.status!==0)throw new Error('Update was not non-destructive');s.installUpdates++;}
  const outs={...news};if(urn.includes('hcloud:index/server:Server'))outs.ipv4Address='192.0.2.55';if(urn.endsWith('-preflight'))outs.stdout=JSON.stringify(preflight());else if(urn.includes('command:local:Command'))outs.stdout='';s.objects[id]={urn,inputs:news,outs};save(s);return {outs};},
 async read(id,urn){const s=read(),o=s.objects[id];return o?{id,props:o.outs,inputs:o.inputs}:{id:''};},
 async delete(id,urn,props){const s=read();if(urn.endsWith('-install')&&props.delete)throw new Error('Unexpected installer delete command');s.events.push({op:'delete',urn,id});delete s.objects[id];save(s);}
};
// The generic Node adapter omits property diffs. Supply these so the real
// engine, rather than this substitute, applies replaceOnChanges.
const grpc=require('@grpc/grpc-js');
const addService=grpc.Server.prototype.addService;
grpc.Server.prototype.addService=function(service,implementation){
 const original=implementation.diff.bind(implementation);
 implementation.diff=(call,callback)=>original(call,(error,response)=>{
  if(response){const olds=trim(call.request.getOlds().toJavaScript()),news=call.request.getNews().toJavaScript();
   response.setDiffsList(Object.keys({...olds,...news}).filter(k=>JSON.stringify(olds[k])!==JSON.stringify(news[k])));}
  callback(error,response);
 });
 return addService.call(this,service,implementation);
};
require('@pulumi/pulumi/provider').main(provider,process.argv.slice(2));
