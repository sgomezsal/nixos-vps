const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const pulumi=require('@pulumi/pulumi');
const {NixosServerProvider,resourceType,validateInputs}=require('../lib/provider');
const args={flakeDirectory:'/unread/flake',configuration:'web',installer:'/unread/flake#nixos-anywhere',sshPublicKeyPath:'/unread/client.pub',sshPrivateKeyPath:'/unread/client',sshHostKeyPrivatePath:'/unread/host'};

test('schema matches the existing component inputs and retains its resource token',()=>{
  const ts=require('typescript');
  const source=ts.createSourceFile('index.ts',fs.readFileSync(path.join(__dirname,'../../nixos-vps/src/index.ts'),'utf8'),ts.ScriptTarget.Latest);
  const declaration=source.statements.find(s=>ts.isInterfaceDeclaration(s)&&s.name.text==='NixosServerArgs');
  const schema=JSON.parse(new NixosServerProvider().schema),resource=schema.resources[resourceType];
  assert.equal(resourceType,'nixos-vps:hetzner:NixosServer');
  assert.deepEqual(Object.keys(resource.inputProperties).sort(),declaration.members.map(m=>m.name.text).sort());
  assert.deepEqual([...resource.requiredInputs].sort(),declaration.members.filter(m=>!m.questionToken).map(m=>m.name.text).sort());
  assert.deepEqual(resource.required,['ipv4','serverId']);assert.equal(resource.isComponent,true);
  assert.equal(schema.version,require('../package.json').version);
  assert.equal(require('../package.json').private,true);
  assert.equal(resource.inputProperties.flakeDirectory.plain,true);
});

test('RPC boundary rejects invalid static inputs without disclosing values or reading files',async()=>{
  const secret='synthetic-sensitive-value';
  for(const patch of [{flakeDirectory:'relative'},{sshPrivateKeyPath:secret},{configuration:null},{installer:'relative#installer'},{tcpPorts:[0]},{tcpPorts:'80'},{sshTimeoutSeconds:0},{expectedDiskSerial:''},{extra:secret}]){
    assert.throws(()=>validateInputs({...args,...patch}),error=>{assert.ok(!error.message.includes(secret));return true;});
  }
  assert.throws(()=>validateInputs({...args,sshPrivateKeyPath:pulumi.secret('/private/path')}),/plain string/);
  await assert.rejects(new NixosServerProvider().construct('bad','other:index:Server',args,{}),/Unsupported component type/);
  assert.deepEqual(validateInputs(args),args);
  const dynamic=pulumi.secret({purpose:'synthetic-label'});
  assert.equal(validateInputs({...args,labels:dynamic}).labels,dynamic);
});

test('provider entry point is inert when imported and adds no install hooks',()=>{
  const r=spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(__dirname,'../scripts/provider.cjs'))})`],{encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');
  for(const hook of ['install','postinstall','publish','prepublish'])assert.equal(require('../package.json').scripts[hook],undefined);
});

test('SDK and plugin packaging refuse to overwrite existing local artifacts',t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'provider-output-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const {generate}=require('../scripts/generate-sdks.cjs');
  const {packagePlugin}=require('../scripts/package-plugin.cjs');
  const sentinel=path.join(temporary,'keep.txt');fs.writeFileSync(sentinel,'preserve');
  assert.throws(()=>generate(temporary),/never overwritten/);
  assert.throws(()=>packagePlugin(sentinel),/refusing overwrite/);
  const link=path.join(temporary,'linked');fs.symlinkSync(temporary,link);
  assert.throws(()=>generate(link),/never overwritten/);
  assert.equal(fs.readFileSync(sentinel,'utf8'),'preserve');
});

test('construct delegates the original graph, options, secret user-data and gated outputs',async t=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'component-provider-unit-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const host=path.join(tmp,'host');fs.writeFileSync(host,'synthetic-host-private',{mode:0o600});
  const resources=[],options=new Map();
  pulumi.runtime.setMocks({newResource(a){resources.push(a);return {id:a.type.includes('firewall')?'12':a.name+'-id',state:{...a.inputs,ipv4Address:'192.0.2.9',stdout:JSON.stringify({publicKey:'ssh-ed25519 AAAATEST fixture',hostPublicKey:'ssh-ed25519 AAAAHOST fixture',hostKeyDigest:crypto.createHash('sha256').update('synthetic-host-private').digest('hex')})}};},call(){throw Error('Unexpected invoke');}},'provider-unit','offline',false);
  const result=await new NixosServerProvider().construct('web',resourceType,{...args,sshHostKeyPrivatePath:host,tcpPorts:[80]},
    {protect:true,transformations:[r=>{options.set(r.name,r.opts);return undefined;}]});
  const value=await pulumi.output(result.state).promise();
  assert.deepEqual(value,{ipv4:'192.0.2.9',serverId:'web-server-id'});
  assert.match(await pulumi.output(result.urn).promise(),/::nixos-vps:hetzner:NixosServer::web$/);
  assert.equal(options.get('web').protect,true);
  assert.equal(resources.filter(r=>r.type.includes('hcloud:index/server')).length,1);
  assert.ok(resources.find(r=>r.name==='web-install').inputs.update.endsWith(' update'));
  const vm=resources.find(r=>r.name==='web-server');
  assert.equal(vm.inputs.userData['4dabf18193072939515e22adb298388d'],'1b47061264138c4ac30d75fd1eb44270');
  assert.equal(options.get('web-install').parent,options.get('web-server').parent);
});
