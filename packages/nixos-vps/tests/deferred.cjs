const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
// Separate processes prevent Pulumi's global rejection handling contaminating
// subsequent cases. An explicit observed rejection, never a timeout, is success.
test('deferred invalid inputs gate preflight and host identity races gate VM creation',()=>{
 for(const scenario of ['sources-empty','sources-invalid','ids-empty','ids-invalid','location','image','plan','identity']){
  const source=`
   const p=require('@pulumi/pulumi'),fs=require('fs'),os=require('os'),path=require('path');
   const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'deferred-validation-'));const host=path.join(tmp,'host');fs.writeFileSync(host,'synthetic',{mode:0o600});
   const resources=[];let verified=false;
   process.on('unhandledRejection',error=>{
    const text=String(error);const identity=${JSON.stringify(scenario)}==='identity';
    if(identity?text.includes('Host key changed since preflight'): /sshSourceIps|existingSshKeyIds|location must|bootstrapImage must|serverType must/.test(text)){
     const forbidden=resources.filter(r=>identity?r.type.includes('server:Server'):r.type!=='nixos-vps:hetzner:NixosServer'&&!r.name.endsWith('-preflight'));
     if(forbidden.length)process.exit(2);verified=true;fs.rmSync(tmp,{recursive:true,force:true});process.exit(0);
    }
   });
   p.runtime.setMocks({newResource(r){resources.push(r);if(r.name.endsWith('-preflight')&&r.inputs.environment.NIXOS_INPUT_ERROR)throw Error(r.inputs.environment.NIXOS_INPUT_ERROR);return{id:'1',state:{...r.inputs,stdout:JSON.stringify({hostKeyDigest:'changed',hostPublicKey:'ssh-ed25519 AAAA fixture',publicKey:'ssh-ed25519 AAAA fixture'})}}},call(){throw Error('unexpected call')}},'test','offline',false);
   const args={flakeDirectory:'/unexecuted',configuration:'web',installer:'/unexecuted#secure',sshPrivateKeyPath:'/unexecuted',sshPublicKeyPath:'/unexecuted.pub',sshHostKeyPrivatePath:host};
   const cases={'sources-empty':{sshSourceIps:Promise.resolve([])},'sources-invalid':{sshSourceIps:Promise.resolve(['invalid/32'])},'ids-empty':{existingSshKeyIds:Promise.resolve([])},'ids-invalid':{existingSshKeyIds:Promise.resolve(['bad'])},location:{location:Promise.resolve('invalid')},image:{bootstrapImage:Promise.resolve('fedora')},plan:{serverType:Promise.resolve('cax21')},identity:{}};
   new (require('../lib').NixosServer)('bad',{...args,...cases[${JSON.stringify(scenario)}]});
   setTimeout(()=>{fs.rmSync(tmp,{recursive:true,force:true});process.exit(3)},5000);
  `;
  const r=spawnSync(process.execPath,['-e',source],{cwd:__dirname,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
  assert.ok(!r.error,r.error?.message);assert.equal(r.status,0,scenario+': '+r.stderr);
 }
});
