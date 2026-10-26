const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cli=require('../scripts/cli.cjs'),project=require('../scripts/project.cjs'),runner=require('../scripts/runner.cjs'),YAML=require('yaml');
function fixture(t){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vps-onboarding-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));const dir=path.join(tmp,'consumer');fs.mkdirSync(dir);return{tmp,dir,keys:path.join(tmp,'keys')}}
test('init creates two real distinct identities with safe modes, public-only flake and editable Pulumi settings',t=>{
 const f=fixture(t);cli.initialize(f.dir,{'--key-directory':f.keys,'--stack':'demo','--location':'fsn1','--server-type':'cpx32','--ports':'80,8080'});
 assert.equal(fs.statSync(f.keys).mode&0o777,0o700);
 for(const name of ['deploy','host'])assert.equal(fs.statSync(path.join(f.keys,name)).mode&0o777,0o600);
 assert.notEqual(fs.readFileSync(path.join(f.keys,'deploy.pub'),'utf8'),fs.readFileSync(path.join(f.keys,'host.pub'),'utf8'));
 assert.equal(fs.readFileSync(path.join(f.dir,'nixos/admin.pub'),'utf8'),fs.readFileSync(path.join(f.keys,'deploy.pub'),'utf8'));
 const c=project.loadProject(f.dir,'demo');assert.equal(c.location,'fsn1');assert.equal(c.serverType,'cpx32');assert.deepEqual(c.tcpPorts,[80,8080]);
 assert.equal(YAML.parse(fs.readFileSync(path.join(f.dir,'Pulumi.yaml'),'utf8')).main,'index.ts');
 assert.equal(fs.statSync(path.join(f.dir,'Pulumi.demo.yaml')).mode&0o777,0o600);
 const before=fs.readFileSync(path.join(f.keys,'host'));
 assert.throws(()=>cli.initialize(f.dir,{'--key-directory':f.keys}),/Refusing to overwrite/);
 assert.deepEqual(fs.readFileSync(path.join(f.keys,'host')),before);
 for(const file of fs.readdirSync(path.join(f.dir,'nixos')))assert.ok(!fs.readFileSync(path.join(f.dir,'nixos',file),'utf8').includes('PRIVATE KEY-----'));
});
test('init rejects existing/external symlink collisions, in-project keys and invalid arguments before generating secrets',t=>{
 const f=fixture(t);
 assert.throws(()=>cli.initialize(f.dir,{'--key-directory':path.join(f.dir,'keys')}),/outside/);
 fs.symlinkSync(f.dir,path.join(f.tmp,'alias'),'dir');
 assert.throws(()=>cli.initialize(f.dir,{'--key-directory':path.join(f.tmp,'alias','keys')}),/symlink/);
 fs.mkdirSync(f.keys);fs.writeFileSync(path.join(f.keys,'keep'),'existing');
 assert.throws(()=>cli.initialize(f.dir,{'--key-directory':f.keys}),/EEXIST/);assert.equal(fs.readFileSync(path.join(f.keys,'keep'),'utf8'),'existing');
 assert.throws(()=>cli.options(['--unknown','value']),/Unknown/);
 assert.throws(()=>project.stackName('../other'),/simple local/);
 assert.throws(()=>cli.initialize(f.dir,{'--key-directory':path.join(f.tmp,'other'),'--ports':'65536'}),/tcpPorts/);
 assert.throws(()=>cli.initialize(f.dir,{'--key-directory':path.join(f.tmp,'failure')},()=>{throw Error('missing ssh-keygen')}),/ssh-keygen/);
 assert.equal(fs.existsSync(path.join(f.tmp,'failure')),false);assert.deepEqual(fs.readdirSync(f.dir),[]);
});
test('stack reader rejects ambiguous YAML, encrypted settings and invalid port/source arrays',t=>{
 const f=fixture(t);cli.initialize(f.dir,{'--key-directory':f.keys});const filename=path.join(f.dir,'Pulumi.dev.yaml');const initial=fs.readFileSync(filename,'utf8');
 for(const [name,value,error]of [['tcpPorts',[0],/tcpPorts/],['sshSourceIps',[],/sshSourceIps/],['sshSourceIps',['10.0.0.1/33'],/sshSourceIps/],['existingSshKeyIds',[123],/key IDs/],['sshPrivateKeyPath',{secure:'synthetic'},/encrypted/]]){
  const doc=YAML.parse(initial);doc.config['standalone-nixos:'+name]=value;fs.writeFileSync(filename,YAML.stringify(doc));assert.throws(()=>project.loadProject(f.dir,'dev'),error);
 }
 fs.writeFileSync(filename,'config: {}\nconfig: {}\n');assert.throws(()=>project.loadProject(f.dir,'dev'),/Invalid YAML/);
});
test('SSH/Nix diagnostics classify sanitized failures and identity failures are never retried',async()=>{
 for(const [stderr,code]of [['Host key verification failed','SSH_HOST_IDENTITY'],['Permission denied (publickey)','SSH_AUTHENTICATION'],['Connection refused','SSH_REFUSED'],['Connection timed out','SSH_NETWORK'],['Could not resolve hostname','SSH_DNS']]){
  const error=runner.failure('ssh',[],255,stderr+' FAKE_SENSITIVE_VALUE');assert.equal(error.code,code);assert.ok(!error.message.includes('FAKE_SENSITIVE_VALUE'));
 }
 const nix=runner.failure('nix',['build',"/tmp/quoted' directory#web"],1,'hash mismatch FAKE_SENSITIVE_VALUE');assert.match(nix.message,/checksum/);assert.match(nix.message,/--show-trace/);assert.ok(!nix.message.includes('FAKE_SENSITIVE_VALUE'));
 const identity=runner.failure('ssh',[],255,'Host key verification failed');let calls=0;
 await assert.rejects(runner.waitForSsh(()=>{calls++;throw identity},[],'true',600,()=>assert.fail('identity retry')),/pinned Ed25519/);assert.equal(calls,1);
});
test('validate is read-only by default, requires --fix for ports, and rejects unsafe writes',t=>{
 const f=fixture(t);cli.initialize(f.dir,{'--key-directory':f.keys});
 fs.writeFileSync(path.join(f.dir,'package.json'),'{}');fs.symlinkSync(path.resolve(__dirname,'../../../node_modules'),path.join(f.dir,'node_modules'),'dir');
 const configFile=path.join(f.dir,'Pulumi.dev.yaml'),doc=YAML.parse(fs.readFileSync(configFile,'utf8'));doc.config['standalone-nixos:tcpPorts']=[9090];fs.writeFileSync(configFile,YAML.stringify(doc));
 const original=runner.preflight,calls=[];let checked=false;
 runner.preflight=(config)=>{checked=true;assert.deepEqual(config.tcpPorts,[9090]);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir,'nixos/ports.json'))),[9090]);};
 try {
  const before=fs.readFileSync(path.join(f.dir,'nixos/ports.json'));
  const execute=(binary,args,options)=>{
   calls.push([binary,args]);assert.equal(options.env.HCLOUD_TOKEN,undefined);assert.equal(options.env.PULUMI_ACCESS_TOKEN,undefined);
   if(binary==='pulumi'){assert.deepEqual(args,['version']);return 'v3.217.1';}
   assert.equal(binary,process.execPath);assert.ok(args.includes('--noEmit'));return '';
  };
  assert.throws(()=>cli.validate(f.dir,{'--stack':'dev'},execute),/PORTS_OUT_OF_SYNC/);
  assert.deepEqual(fs.readFileSync(path.join(f.dir,'nixos/ports.json')),before);
  calls.length=0;
  cli.validate(f.dir,{'--stack':'dev','--fix':true},execute);
  assert.ok(checked);assert.equal(calls.length,2);
  const backups=fs.readdirSync(path.join(f.dir,'nixos')).filter(name=>name.startsWith('ports.json.backup-'));
  assert.equal(backups.length,1);assert.deepEqual(fs.readFileSync(path.join(f.dir,'nixos',backups[0])),before);
  const unchanged=snapshot(f.dir);cli.validate(f.dir,{'--stack':'dev'},execute);assert.deepEqual(snapshot(f.dir),unchanged);
  assert.throws(()=>cli.validate(f.dir,{'--stack':'missing'},()=>assert.fail('must not execute tools')),/Missing Pulumi.missing.yaml/);
  assert.throws(()=>cli.validate(f.dir,{},binary=>{if(binary==='pulumi')return 'v3.217.1';throw Error('compiler output with synthetic secret')}),/TYPESCRIPT_CHECK/);
  fs.unlinkSync(path.join(f.dir,'nixos/ports.json'));fs.symlinkSync(path.join(f.keys,'host'),path.join(f.dir,'nixos/ports.json'));
  const hostBefore=fs.readFileSync(path.join(f.keys,'host'));
  assert.throws(()=>cli.validate(f.dir,{},binary=>binary==='pulumi'?'v3.217.1':''),/symlink/);
  assert.deepEqual(fs.readFileSync(path.join(f.keys,'host')),hostBefore);
 } finally {runner.preflight=original;}
});
function snapshot(dir){
 const result={};
 function visit(current){for(const e of fs.readdirSync(current,{withFileTypes:true})){
  const file=path.join(current,e.name),stat=fs.lstatSync(file),name=path.relative(dir,file);
  if(e.isDirectory()){result[name]='directory';visit(file);}
  else if(e.isSymbolicLink())result[name]=['link',fs.readlinkSync(file)];
  else result[name]=[runner.digest(fs.readFileSync(file)),stat.mode,stat.mtimeMs];
 }}visit(dir);return result;
}
test('repeated init is a no-op preserving edits, identities, permissions and modification times',t=>{
 const f=fixture(t),opts={'--key-directory':f.keys};
 fs.writeFileSync(path.join(f.dir,'.gitignore'),'# existing custom rules\n');
 cli.initialize(f.dir,opts);
 fs.appendFileSync(path.join(f.dir,'Pulumi.dev.yaml'),'# operator customization\n');
 const before=snapshot(f.dir),keys=snapshot(f.keys);
 cli.initialize(f.dir,opts,()=>assert.fail('must not generate keys again'));
 assert.deepEqual(snapshot(f.dir),before);assert.deepEqual(snapshot(f.keys),keys);
 assert.equal(fs.readFileSync(path.join(f.dir,'.gitignore'),'utf8'),'# existing custom rules\n');
 assert.throws(()=>cli.initialize(f.dir,{...opts,'--location':'fsn1'}),/different options/);
 assert.deepEqual(snapshot(f.dir),before);assert.deepEqual(snapshot(f.keys),keys);
});
test('handled failures throughout init roll back only new files and permit a clean retry',t=>{
 for(const phase of ['key:deploy','key:host','staged','published:Pulumi.yaml','published:nixos/admin.pub','published:Pulumi.dev.yaml','published:.nixos-vps-init.json']){
  const f=fixture(t),opts={'--key-directory':f.keys};fs.writeFileSync(path.join(f.dir,'.gitignore'),'existing\n');fs.writeFileSync(path.join(f.dir,'package.json'),'{}');
  const before=snapshot(f.dir);let reached=false;
  assert.throws(()=>cli.initialize(f.dir,opts,runner.run,p=>{if(p===phase){reached=true;throw Error('injected initialization interruption')}}),/injected/);
  assert.ok(reached,phase);assert.deepEqual(snapshot(f.dir),before,phase);assert.equal(fs.existsSync(f.keys),false);
  cli.initialize(f.dir,opts);assert.ok(fs.existsSync(path.join(f.dir,'.nixos-vps-init.json')));
 }
 const f=fixture(t),opts={'--key-directory':f.keys};let keys;
 assert.throws(()=>cli.initialize(f.dir,opts,runner.run,phase=>{
  if(phase==='published:index.ts'){keys=snapshot(f.keys);fs.writeFileSync(path.join(f.dir,'index.ts'),'concurrent operator edit');throw Error('injected concurrent change');}
 }),/keys were preserved/);
 assert.equal(fs.readFileSync(path.join(f.dir,'index.ts'),'utf8'),'concurrent operator edit');
 assert.deepEqual(snapshot(f.keys),keys);
 assert.throws(()=>cli.initialize(f.dir,opts),/Refusing to overwrite/);
});
test('forced interruption leaves identities intact and retries refuse partial project overwrite',t=>{
 const f=fixture(t),opts={'--key-directory':f.keys};
 const source=`const cli=require(${JSON.stringify(path.resolve(__dirname,'../scripts/cli.cjs'))});const runner=require(${JSON.stringify(path.resolve(__dirname,'../scripts/runner.cjs'))});cli.initialize(${JSON.stringify(f.dir)},${JSON.stringify(opts)},runner.run,p=>{if(p==='published:Pulumi.yaml')process.kill(process.pid,'SIGKILL')});`;
 const result=require('node:child_process').spawnSync(process.execPath,['-e',source],{timeout:10000,encoding:'utf8'});
 assert.equal(result.signal,'SIGKILL');const before=snapshot(f.dir),keys=snapshot(f.keys);
 assert.throws(()=>cli.initialize(f.dir,opts),/Refusing to overwrite/);
 assert.deepEqual(snapshot(f.dir),before);assert.deepEqual(snapshot(f.keys),keys);
});
test('--fix restores original port bytes if subsequent build or settings checks fail',t=>{
 const f=fixture(t);cli.initialize(f.dir,{'--key-directory':f.keys});
 fs.writeFileSync(path.join(f.dir,'package.json'),'{}');fs.symlinkSync(path.resolve(__dirname,'../../../node_modules'),path.join(f.dir,'node_modules'),'dir');
 const filename=path.join(f.dir,'Pulumi.dev.yaml'),doc=YAML.parse(fs.readFileSync(filename,'utf8'));doc.config['standalone-nixos:tcpPorts']=[9090];fs.writeFileSync(filename,YAML.stringify(doc));
 const before=fs.readFileSync(path.join(f.dir,'nixos/ports.json')),original=runner.preflight;
 runner.preflight=()=>{throw Error('injected build failure')};
 try {assert.throws(()=>cli.validate(f.dir,{'--fix':true},binary=>binary==='pulumi'?'v3.217.1':''),/injected build failure/);}
 finally {runner.preflight=original;}
 assert.deepEqual(fs.readFileSync(path.join(f.dir,'nixos/ports.json')),before);
 assert.deepEqual(cli.options(['--fix','--stack','dev']),{'--fix':true,'--stack':'dev'});
});
