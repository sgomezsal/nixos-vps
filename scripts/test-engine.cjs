// Real Pulumi engine + local file backend + loopback substitute providers ONLY.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pulumi-offline-engine-'));
let provider;
const file=path.join(tmp,'provider-state.json');
const initial={next:100,objects:{},events:[],attempts:0,installs:0,installUpdates:0,failNext:false};
fs.writeFileSync(file,JSON.stringify(initial));
function status(){return JSON.parse(fs.readFileSync(file));}
function writeConfig(config){fs.writeFileSync(path.join(tmp,'case.json'),JSON.stringify(config));}
(async()=>{try{
 const env={PATH:process.env.PATH,HOME:path.join(tmp,'home'),USER:process.env.USER,PULUMI_HOME:path.join(tmp,'pulumi-home'),PULUMI_BACKEND_URL:'file://'+path.join(tmp,'backend'),PULUMI_CONFIG_PASSPHRASE:'synthetic-local-test-only',PULUMI_SKIP_UPDATE_CHECK:'true',PULUMI_DISABLE_AUTOMATIC_PLUGIN_ACQUISITION:'true',PULUMI_CLI_TELEMETRY_OPTOUT:'1',PULUMI_NODEJS_TYPESCRIPT:'false',OFFLINE_PROVIDER_STATE:file};
 for(const dir of [env.HOME,env.PULUMI_HOME,path.join(tmp,'backend')])fs.mkdirSync(dir,{recursive:true});
 provider=spawn(process.execPath,[path.join(root,'scripts/offline-provider.cjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});let errors='';provider.stderr.on('data',b=>errors+=b);
 const port=await new Promise((resolve,reject)=>{provider.stdout.once('data',b=>resolve(Number(String(b).trim())));provider.once('exit',code=>reject(new Error('Offline provider exited '+code+': '+errors)));});assert.ok(port>0);
 env.PULUMI_DEBUG_PROVIDERS=`hcloud:${port},command:${port}`;
 fs.symlinkSync(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
 fs.writeFileSync(path.join(tmp,'Pulumi.yaml'),'name: local-engine-validation\nruntime: nodejs\n');
 fs.writeFileSync(path.join(tmp,'host'),'synthetic-host-private',{mode:0o600});
 fs.writeFileSync(path.join(tmp,'index.js'),`const fs=require('fs');const {NixosServer}=require(${JSON.stringify(path.join(root,'packages/nixos-vps/lib'))});const c=JSON.parse(fs.readFileSync('case.json'));const s=new NixosServer('web',{flakeDirectory:process.cwd()+'/flake',configuration:c.configuration||'web',installer:'/unexecuted#secure',sshPublicKeyPath:'/unexecuted.pub',sshPrivateKeyPath:'/unexecuted',sshHostKeyPrivatePath:process.cwd()+'/host',tcpPorts:c.ports||[],serverType:c.serverType||'cpx22',location:Promise.resolve(c.location||'nbg1'),sshSourceIps:Promise.resolve(c.sources||['0.0.0.0/0']),existingSshKeyIds:c.ids===undefined?undefined:Promise.resolve(c.ids)},{protect:c.protect||false});exports.ipv4=s.ipv4;`);
 function cli(args,expected=0){const r=spawnSync('pulumi',[...args,'--non-interactive'],{cwd:tmp,env,encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000});assert.ok(!r.error,r.error?.message+'\n'+r.stderr+'\n'+r.stdout);assert.equal(typeof r.status,'number','CLI did not exit normally');if(expected===0)assert.equal(r.status,0,r.stderr+'\n'+r.stdout);else assert.notEqual(r.status,0);return r.stdout+r.stderr;}
 const up=()=>cli(['up','--yes','--skip-preview']);
 cli(['stack','init','normal']);
 for(const bad of [{sources:[]},{sources:['bad/32']},{ids:[]},{ids:['not-an-id']},{location:'invalid'}]){
  writeConfig(bad);const error=cli(['up','--yes','--skip-preview'],1);assert.match(error,/sshSourceIps|existingSshKeyIds|location must/);assert.equal(status().events.length,0,'invalid deferred input allowed provisioning');
 }
 writeConfig({});up();assert.equal(status().installs,1);
 const exportedState=cli(['stack','export']);
 assert.ok(!exportedState.includes('synthetic-host-private'),'host private identity leaked into unencrypted exported state');
 const persisted=JSON.parse(exportedState).deployment.resources;
 const component=persisted.find(r=>r.type==='nixos-vps:hetzner:NixosServer');assert.ok(component,'new component type missing from real engine state');
 assert.equal((component.aliases||[]).length,0,'new installations must not retain legacy aliases');
 const child=persisted.find(r=>r.type==='hcloud:index/server:Server');assert.ok(child);assert.equal(child.parent,component.urn);assert.ok(child.urn.includes('::nixos-vps:hetzner:NixosServer$hcloud:index/server:Server::'));

 const first=status();up();assert.equal(status().installs,1);assert.equal(status().events.length,first.events.length,'unchanged update performed CRUD');
 writeConfig({configuration:'changed',ports:[80]});up();assert.equal(status().installs,1);assert.ok(status().installUpdates>=1);
 writeConfig({configuration:'changed',ports:[80],serverType:'cpx32'});up();assert.equal(status().installs,1);
 writeConfig({location:'fsn1'});const plan=cli(['preview','--json']);assert.match(plan,/replace/);up();assert.equal(status().installs,2,'VM replacement did not install exactly once');
 writeConfig({location:'fsn1',protect:true});up();const protectedCount=status().events.length;cli(['destroy','--yes','--skip-preview'],1);assert.equal(status().events.length,protectedCount);
 writeConfig({location:'fsn1'});up();cli(['destroy','--yes','--skip-preview']);assert.equal(Object.keys(status().objects).length,0);
 cli(['stack','init','partial']);writeConfig({});const failing=status();failing.failNext=true;fs.writeFileSync(file,JSON.stringify(failing));cli(['up','--yes','--skip-preview'],1);
 const afterFailure=status(),servers=afterFailure.events.filter(e=>e.op==='create'&&e.urn.includes('hcloud:index/server:Server')).length;
 assert.ok(Object.keys(afterFailure.objects).length>0,'failed update lost all partial state');up();assert.equal(status().events.filter(e=>e.op==='create'&&e.urn.includes('hcloud:index/server:Server')).length,servers,'retry recreated the VM');
 assert.equal(status().installs,3);up();assert.equal(status().installs,3);cli(['destroy','--yes','--skip-preview']);assert.equal(Object.keys(status().objects).length,0);
 console.log('PULUMI ENGINE PASS: persisted no-op, configuration/firewall/type updates, replacement preview and install, protection, deletion, partial-state retry without recreating VM. Providers were loopback substitutes, not Hetzner.');
}catch(e){console.error(JSON.stringify(status().events));throw e;}finally{if(provider)provider.kill();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
