// Real component-provider RPC and engine, with disposable state and fake cloud CRUD.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {contract,providerFiles}=require('../packages/nixos-vps-provider/scripts/distribution.cjs');
const releaseDirectory=process.env.PROVIDER_RELEASE_DIR;
const publication=process.env.PROVIDER_PUBLICATION_CANDIDATE==='true';
const release=releaseDirectory?require('./provider-release.cjs').verify(releaseDirectory,false,publication):null;
const prepared=role=>path.join(releaseDirectory,release.artifacts[role].filename);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-provider-engine-'));
const children=[];
const stateFile=path.join(temporary,'cloud-state.json');
const initial={next:100,objects:{},events:[],attempts:0,installs:0,installUpdates:0,failNext:false};
fs.writeFileSync(stateFile,JSON.stringify(initial));
const env={PATH:process.env.PATH,HOME:path.join(temporary,'home'),USER:process.env.USER,
  PULUMI_HOME:path.join(temporary,'pulumi-home'),PULUMI_BACKEND_URL:'file://'+path.join(temporary,'backend'),
  PULUMI_CONFIG_PASSPHRASE:'synthetic-local-provider-passphrase',PULUMI_SKIP_UPDATE_CHECK:'true',
  PULUMI_DISABLE_AUTOMATIC_PLUGIN_ACQUISITION:'true',PULUMI_IGNORE_AMBIENT_PLUGINS:'true',
  PULUMI_CLI_TELEMETRY_OPTOUT:'1',PULUMI_NODEJS_TYPESCRIPT:'false',OFFLINE_PROVIDER_STATE:stateFile,
  GOTOOLCHAIN:'local',GOFLAGS:'-modcacherw',GOCACHE:path.join(temporary,'home/.cache/go-build'),GOMODCACHE:path.join(temporary,'home/.cache/go-modules')};
for(const name of ['home','pulumi-home','backend'])fs.mkdirSync(path.join(temporary,name));
function run(command,args,options={}) {
  const result=spawnSync(command,args,{cwd:temporary,env,encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024,...options});
  assert.ok(!result.error,result.error?.message);
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  return result.stdout;
}
function state(){return JSON.parse(fs.readFileSync(stateFile));}
function config(value={}){fs.writeFileSync(path.join(temporary,'case.json'),JSON.stringify(value));}
function cli(args,fail=false){
  const result=spawnSync('pulumi',[...args,'--non-interactive'],{cwd:temporary,env,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  assert.ok(!result.error,result.error?.message);
  if(fail)assert.notEqual(result.status,0);else assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  return result.stdout+result.stderr;
}
function up(){return cli(['up','--yes','--skip-preview']);}
function project(runtime){
  const value=runtime==='python'?{name:'python',options:{virtualenv:'.venv'}}:runtime==='go'?{name:'go',options:{binary:'./go-consumer'}}:'nodejs';
  fs.writeFileSync(path.join(temporary,'Pulumi.yaml'),JSON.stringify({name:'component-provider-offline',runtime:value}));
}
async function start(script,extra={}) {
  const child=spawn(process.execPath,[script],{cwd:temporary,env:{...env,...extra},stdio:['ignore','pipe','pipe']});
  children.push(child);let output='',errors='';child.stderr.on('data',b=>errors+=b);
  return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Provider startup timed out: '+errors)),20000);
    child.stdout.on('data',b=>{output+=b;const match=output.match(/^(\d+)\r?\n/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Provider exited '+code+': '+errors));});
  });
}
function assertReady(){assert.equal(cli(['stack','output','ipv4']).trim(),'192.0.2.55');}
function writeNode(mode){
  const module=mode==='legacy'?'nixos-vps':contract.npmPackage;
  fs.writeFileSync(path.join(temporary,'index.js'),`const fs=require('fs'),p=require('@pulumi/pulumi');
const {NixosServer}=${mode==='legacy'?'require('+JSON.stringify(module)+')':'require('+JSON.stringify(module)+').hetzner'};const c=JSON.parse(fs.readFileSync('case.json'));
const parent=new p.ComponentResource('fixture:index:Parent','group',{});
const a={flakeDirectory:process.cwd()+'/flake',configuration:c.configuration||'web',installer:'/unexecuted#secure',sshPublicKeyPath:'/unexecuted.pub',sshPrivateKeyPath:'/unexecuted',sshHostKeyPrivatePath:process.cwd()+'/host',serverType:p.output(c.serverType||'cpx22'),location:c.location||'nbg1',tcpPorts:c.ports||[80],labels:p.secret({purpose:'synthetic-secret-label-value'})};
if(c.sources!==undefined)a.sshSourceIps=p.output(c.sources);
let declarations=0;
const policy=args=>{
 if(args.type!=='hcloud:index/server:Server')return undefined;
 if(++declarations!==1)throw Error('Only one VPS is authorized for this fixture');
 return {props:{...args.props,name:'fixture-vps',backups:false},opts:{...args.opts,protect:true}};
};
const options={parent,protect:c.protect||c.customPolicy||false};
if(c.customPolicy){
 if(a.serverType && c.serverType!=='cx23')throw Error('This fixture permits only cx23');
 options[${JSON.stringify(mode==='legacy'?'transformations':'transforms')}]=[policy];
}
const s=new NixosServer('web',a,options);
if(c.duplicate)new NixosServer('duplicate',a,options);
exports.ipv4=s.ipv4;exports.serverId=s.serverId;`);
}
(async()=>{
  try {
    for(const command of ['pulumi','python3','go'])run(command,command==='python3'?['--version']:['version']);
    const [artifact]=JSON.parse(run('npm',['pack','--workspace','nixos-vps-provider','--ignore-scripts','--json','--pack-destination',temporary],{cwd:root}));
    assert.deepEqual(artifact.files.map(file=>file.path).sort(),providerFiles);
    fs.writeFileSync(path.join(temporary,'package.json'),JSON.stringify({name:'independent-provider-consumer',private:true}));
    const typescript=require('typescript/package.json').version,nodeTypes=require('@types/node/package.json').version;
    run('npm',['install','--ignore-scripts','--no-audit','--no-fund',path.join(temporary,artifact.filename),`typescript@${typescript}`,`@types/node@${nodeTypes}`]);
    const installed=path.join(temporary,'node_modules/nixos-vps-provider');
    assert.equal(fs.lstatSync(installed).isSymbolicLink(),false);
    assert.equal(fs.lstatSync(path.join(temporary,'node_modules/nixos-vps')).isSymbolicLink(),false);
    // Generate using the installed tarball, not a workspace-only file.
    run(process.execPath,[path.join(installed,'scripts/generate-sdks.cjs'),path.join(temporary,'sdk')]);
    const nodeMetadata=JSON.parse(fs.readFileSync(path.join(temporary,'sdk/nodejs/package.json')));
    assert.equal(nodeMetadata.private,true);assert.equal(nodeMetadata.version,'0.2.0-dev.1');
    assert.equal(nodeMetadata.scripts.postinstall,undefined);
    assert.match(fs.readFileSync(path.join(temporary,'sdk/python/setup.py'),'utf8'),/VERSION = "0\.2\.0\.dev1"/);
    assert.match(fs.readFileSync(path.join(temporary,'sdk/go/nixosvps/internal/pulumiVersion.go'),'utf8'),/semver.MustParse\("0\.2\.0-dev\.1"\)/);
    run(path.join(temporary,'node_modules/.bin/tsc'),['-p','sdk/nodejs/tsconfig.json']);
    const [sdkArtifact]=JSON.parse(run('npm',['pack','./sdk/nodejs','--ignore-scripts','--json','--pack-destination',temporary]));
    run('npm',['install','--ignore-scripts','--no-audit','--no-fund',release?prepared('nodejs'):path.join(temporary,sdkArtifact.filename)]);
    fs.writeFileSync(path.join(temporary,'type-consumer.ts'),`import {hetzner} from "${contract.npmPackage}";\nconst args:hetzner.NixosServerArgs={flakeDirectory:"/flake",configuration:"web",installer:"/flake#secure",sshPublicKeyPath:"/client.pub",sshPrivateKeyPath:"/client",sshHostKeyPrivatePath:"/host",tcpPorts:[80]};\nnew hetzner.NixosServer("web",args);\n`);
    run(path.join(temporary,'node_modules/.bin/tsc'),['--noEmit','--strict','--skipLibCheck','--target','ES2020','--module','commonjs','--moduleResolution','node','type-consumer.ts']);
    const blocked=path.join(temporary,'deny-source.cjs');
    fs.writeFileSync(blocked,`const Module=require('module');const original=Module._resolveFilename;Module._resolveFilename=function(...args){const value=original.apply(this,args);if(value.startsWith(${JSON.stringify(root+path.sep)}))throw Error('Original repository dependency');return value;};`);
    const fakePort=await start(path.join(root,'scripts/offline-provider.cjs'));
    const plugin=release?prepared('plugin'):path.join(temporary,'provider.tar.gz');
    if(!release)run(process.execPath,[path.join(installed,'scripts/package-plugin.cjs'),plugin]);
    const extra=path.join(installed,'lib/unexpected.txt'),refusedArchive=path.join(temporary,'refused.tar.gz');
    fs.writeFileSync(extra,'unapproved artifact');
    const rejected=spawnSync(process.execPath,[path.join(installed,'scripts/package-plugin.cjs'),refusedArchive],
      {cwd:temporary,env,encoding:'utf8',timeout:30000});
    fs.rmSync(extra);
    assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/explicit file allowlist/);
    assert.equal(fs.existsSync(refusedArchive),false,'Unexpected package file escaped the allowlist');
    run('pulumi',['plugin','install','resource','nixos-vps','0.2.0-dev.1','--file',plugin,'--exact']);
    console.log('PROVIDER PLUGIN: independent archive installed into disposable PULUMI_HOME.');
    env.NODE_OPTIONS='--require '+blocked;
    env.PULUMI_DEBUG_PROVIDERS=`hcloud:${fakePort},command:${fakePort}`;
    fs.writeFileSync(path.join(temporary,'host'),'synthetic-host-private',{mode:0o600});
    project('nodejs');config();writeNode('legacy');cli(['stack','init','normal']);up();assertReady();
    const original=JSON.parse(cli(['stack','export'])).deployment.resources;
    const originalServer=original.find(r=>r.type==='hcloud:index/server:Server');
    assert.ok(originalServer);assert.equal(state().installs,1);
    writeNode('remote');
    const beforeMigration=state().events.length;
    up();assertReady();
    const migrationEvents=state().events.slice(beforeMigration);
    assert.ok(migrationEvents.every(event=>event.op==='update'&&/::web-(preflight|install)$/.test(event.urn)),
      'Remote adapter changed infrastructure: '+JSON.stringify(migrationEvents));
    const originalEvents=state().events.length;
    assert.equal(state().installs,1,'Remote adapter reran installation');
    up();assert.equal(state().events.length,originalEvents,'Settled remote adapter was not idempotent');
    const migrated=JSON.parse(cli(['stack','export'])).deployment.resources;
    const migratedServer=migrated.find(r=>r.type===originalServer.type);
    assert.equal(migratedServer.id,originalServer.id);assert.equal(migratedServer.urn,originalServer.urn);
    assert.equal(migratedServer.parent,originalServer.parent);
    const exported=cli(['stack','export']);
    assert.ok(!exported.includes('synthetic-host-private'));
    assert.ok(!exported.includes('synthetic-secret-label-value'),'Secret lost across construct RPC');
    config({sources:[]});const invalid=cli(['up','--yes','--skip-preview'],true);
    assert.match(invalid,/sshSourceIps/);assert.equal(state().events.length,originalEvents);
    config({configuration:'changed',ports:[80,8080]});up();assert.equal(state().installs,1);assert.ok(state().installUpdates>0);
    config({configuration:'changed',ports:[80,8080],protect:true});up();const protectedEvents=state().events.length;
    cli(['destroy','--yes','--skip-preview'],true);assert.equal(state().events.length,protectedEvents,'Protection was not forwarded');
    config({configuration:'changed',ports:[80,8080]});up();
    config({location:'fsn1'});assert.match(cli(['preview','--json']),/replace/);up();assert.equal(state().installs,2);
    config();up(); // Restore the same input defaults used by Python and Go.
    assert.equal(state().installs,3);
    console.log('PROVIDER NODE: migration, idempotency, invalid inputs, updates, protection and replacement passed.');

    // Python consumer: install SDK metadata and dependencies in an isolated venv.
    run('python3',['-m','venv','.venv']);
    const python=path.join(temporary,'.venv/bin/python');
    run(python,['-m','pip','install','--disable-pip-version-check','pulumi==3.217.1','parver==0.5','semver==3.0.4','setuptools==80.9.0','wheel==0.45.1']);
    const setup=fs.readFileSync(path.join(temporary,'sdk/python/setup.py'),'utf8');
    assert.ok(!setup.includes('cmdclass'),'Review generated Python installation hooks');
    run(python,['-m','pip','install','--no-deps','--no-build-isolation',release?prepared('pythonWheel'):'./sdk/python']);
    if(release) {
      const sourceEnvironment=path.join(temporary,'source-venv');
      run('python3',['-m','venv',sourceEnvironment]);
      const sourcePython=path.join(sourceEnvironment,'bin/python');
      run(sourcePython,['-m','pip','install','--disable-pip-version-check','setuptools==80.9.0','wheel==0.45.1']);
      run(sourcePython,['-m','pip','install','--no-deps','--no-build-isolation',prepared('pythonSource')]);
      run(sourcePython,['-c',`import importlib.metadata; assert importlib.metadata.version('${contract.pythonDistribution}') == '0.2.0.dev1'`]);
      fs.rmSync(path.join(temporary,'sdk/go/nixosvps'),{recursive:true,force:true});
      run('tar',['-xzf',prepared('go'),'-C',path.join(temporary,'sdk/go')]);
    }
    fs.writeFileSync(path.join(temporary,'__main__.py'),`import json, os, pulumi\nfrom pulumi_nixos_vps.hetzner import NixosServer\nc=json.load(open('case.json'))\nparent=pulumi.ComponentResource('fixture:index:Parent','group',{})\ns=NixosServer('web',flake_directory=os.getcwd()+'/flake',configuration=c.get('configuration','web'),installer='/unexecuted#secure',ssh_public_key_path='/unexecuted.pub',ssh_private_key_path='/unexecuted',ssh_host_key_private_path=os.getcwd()+'/host',server_type=pulumi.Output.from_input(c.get('serverType','cpx22')),location=c.get('location','nbg1'),tcp_ports=c.get('ports',[80]),labels=pulumi.Output.secret({'purpose':'synthetic-secret-label-value'}),opts=pulumi.ResourceOptions(parent=parent))\npulumi.export('ipv4',s.ipv4)\npulumi.export('serverId',s.server_id)\n`);
    const beforePython=state().events.length;project('python');up();assertReady();
    assert.equal(state().events.length,beforePython,'Python changed the existing graph');
    assert.ok(!cli(['stack','export']).includes('synthetic-secret-label-value'),'Python lost secret propagation');
    console.log('PROVIDER PYTHON: generated SDK retained the existing graph, ready output and secret annotations.');

    fs.writeFileSync(path.join(temporary,'go.mod'),`module example.local/provider-consumer\n\ngo 1.24.0\n\nrequire (\n github.com/sgomezsal/nixos-vps/sdk/go/nixosvps v0.0.0\n github.com/pulumi/pulumi/sdk/v3 v3.217.1\n)\nreplace github.com/sgomezsal/nixos-vps/sdk/go/nixosvps => ./sdk/go/nixosvps\n`);
    fs.writeFileSync(path.join(temporary,'main.go'),`package main\nimport ("os";"encoding/json"; "github.com/pulumi/pulumi/sdk/v3/go/pulumi"; "github.com/sgomezsal/nixos-vps/sdk/go/nixosvps/hetzner")\nfunc main(){pulumi.Run(func(ctx *pulumi.Context)error{var c struct{Configuration string;ServerType string;Location string;Ports []int};b,e:=os.ReadFile("case.json");if e!=nil{return e};if e=json.Unmarshal(b,&c);e!=nil{return e};if c.Configuration==""{c.Configuration="web"};if c.ServerType==""{c.ServerType="cpx22"};if c.Location==""{c.Location="nbg1"};if c.Ports==nil{c.Ports=[]int{80}};cwd,e:=os.Getwd();if e!=nil{return e};parent:=&pulumi.ResourceState{};if e=ctx.RegisterComponentResource("fixture:index:Parent","group",parent);e!=nil{return e};s,e:=hetzner.NewNixosServer(ctx,"web",&hetzner.NixosServerArgs{FlakeDirectory:cwd+"/flake",Configuration:c.Configuration,Installer:"/unexecuted#secure",SshPublicKeyPath:"/unexecuted.pub",SshPrivateKeyPath:"/unexecuted",SshHostKeyPrivatePath:cwd+"/host",ServerType:pulumi.StringPtr(c.ServerType),Location:pulumi.StringPtr(c.Location),TcpPorts:c.Ports,Labels:pulumi.ToSecret(pulumi.StringMap{"purpose":pulumi.String("synthetic-secret-label-value")}).(pulumi.StringMapOutput)},pulumi.Parent(parent));if e!=nil{return e};ctx.Export("ipv4",s.Ipv4);ctx.Export("serverId",s.ServerId);return nil})}\n`);
    run('go',['mod','tidy']);run('go',['build','-o','go-consumer','.']);
    const beforeGo=state().events.length;project('go');up();assertReady();
    assert.equal(state().events.length,beforeGo,'Go changed the existing graph');
    assert.ok(!cli(['stack','export']).includes('synthetic-secret-label-value'),'Go lost secret propagation');
    assert.equal(state().installs,3);
    console.log('PROVIDER GO: generated SDK retained the existing graph, ready output and secret annotations.');
    cli(['destroy','--yes','--skip-preview']);assert.equal(Object.keys(state().objects).length,0);

    project('nodejs');config();writeNode('remote');cli(['stack','init','partial']);
    fs.renameSync(path.join(temporary,'host'),path.join(temporary,'host.saved'));
    const beforePreview=state().events.length;
    cli(['preview']);assert.equal(state().events.length,beforePreview,'Preview executed fake CRUD');
    fs.renameSync(path.join(temporary,'host.saved'),path.join(temporary,'host'));
    const failing=state();failing.failNext=true;fs.writeFileSync(stateFile,JSON.stringify(failing));
    cli(['up','--yes','--skip-preview'],true);
    assert.equal('ipv4' in JSON.parse(cli(['stack','output','--json'])),false,'Failed fresh install exposed a ready IP');
    const serverCreates=state().events.filter(e=>e.op==='create'&&e.urn.includes('hcloud:index/server:Server')).length;
    up();assertReady();
    assert.equal(state().events.filter(e=>e.op==='create'&&e.urn.includes('hcloud:index/server:Server')).length,serverCreates,'Retry recreated server');
    const settled=state().events.length;up();assert.equal(state().events.length,settled);
    cli(['destroy','--yes','--skip-preview']);assert.equal(Object.keys(state().objects).length,0);
    // Exercise the actual user programs with source loaders, not JS or a Go binary.
    const metadata=JSON.parse(fs.readFileSync(path.join(temporary,'package.json')));
    metadata.main='index.ts';
    fs.writeFileSync(path.join(temporary,'package.json'),JSON.stringify(metadata));
    fs.writeFileSync(path.join(temporary,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2020',module:'commonjs',moduleResolution:'node',strict:true,skipLibCheck:true},include:['index.ts']}));
    env.PULUMI_NODEJS_TYPESCRIPT='true';
    for(const [language,filename] of [['typescript','index.ts'],['python','__main__.py'],['go','main.go']]) {
      fs.copyFileSync(path.join(root,'examples/provider',language,filename),path.join(temporary,filename));
      if(language==='go')run('go',['mod','tidy']);
      const runtime=language==='typescript'?'nodejs':language==='python'?{name:'python',options:{virtualenv:'.venv'}}:'go';
      fs.writeFileSync(path.join(temporary,'Pulumi.yaml'),JSON.stringify({name:'component-provider-offline',runtime}));
      const settings={flakeDirectory:temporary+'/flake',sshPublicKeyPath:'/unexecuted.pub',sshPrivateKeyPath:'/unexecuted',sshHostKeyPrivatePath:temporary+'/host'};
      const writeSettings=value=>fs.writeFileSync(path.join(temporary,'Pulumi.partial.yaml'),JSON.stringify({config:Object.fromEntries(Object.entries(value).map(([key,item])=>['component-provider-offline:'+key,item]))}));
      writeSettings(settings);
      const empty=state().events.length;
      cli(['preview']);assert.equal(state().events.length,empty,'Source preview performed CRUD');
      writeSettings({...settings,sshSourceIps:[]});
      assert.match(cli(['up','--yes','--skip-preview'],true),/sshSourceIps/);
      assert.equal(state().events.length,empty,'Empty SSH source list performed CRUD');
      writeSettings(settings);
      up();assertReady();
      const ready=state().events.length;
      up();assert.equal(state().events.length,ready,'Source consumer was not idempotent');
      cli(['destroy','--yes','--skip-preview']);assert.equal(Object.keys(state().objects).length,0);
      console.log('USER SOURCE PASS: '+language+' checked-in example, default language loader, empty SSH sources rejected before CRUD, fresh preview/create, ready outputs, no-op and deletion.');
      fs.writeFileSync(path.join(temporary,'Pulumi.partial.yaml'),JSON.stringify({config:{}}));
      const missing=state().events.length;
      assert.match(cli(['preview'],true),/flakeDirectory/);
      assert.equal(state().events.length,missing,'Missing required user config performed CRUD');
    }
    // Reproduce consumer policies that legacy callbacks cannot forward through RPC.
    metadata.main='index.js';
    fs.writeFileSync(path.join(temporary,'package.json'),JSON.stringify(metadata));
    env.PULUMI_NODEJS_TYPESCRIPT='false';project('nodejs');
    cli(['stack','init','policy-migration']);
    config({customPolicy:true,serverType:'cx23'});writeNode('legacy');up();
    const policyResources=JSON.parse(cli(['stack','export'])).deployment.resources;
    const policyServer=policyResources.find(r=>r.type==='hcloud:index/server:Server');
    const policyPlainInputs=JSON.parse(cli(['stack','export','--show-secrets'])).deployment.resources.find(r=>r.type===policyServer.type).inputs;
    assert.equal(policyServer.inputs.name,'fixture-vps');
    assert.equal(policyServer.inputs.backups,false);assert.equal(policyServer.protect,true);
    const beforePolicy=state().events.length,policyInstalls=state().installs;
    writeNode('remote');
    // Changed runner paths make preflight outputs unknown during preview. The
    // engine must block speculative replacements of protected resources.
    const policyPreview=cli(['preview'],true);
    assert.match(policyPreview,/marked for protection/);
    assert.match(policyPreview,/publicKey|sshKeys/);
    assert.equal(state().events.length,beforePolicy,'Policy preview performed CRUD');
    // Resolve just the local preflight before asking for a full migration plan.
    // Never use an unreviewed full update to resolve protected cloud inputs.
    const preflightUrn=policyResources.find(r=>r.type==='command:local:Command'&&r.urn.endsWith('::web-preflight')).urn;
    const preflightPlan=path.join(temporary,'policy-preflight-plan.json');
    cli(['preview','--target',preflightUrn,'--save-plan',preflightPlan]);
    cli(['up','--yes','--skip-preview','--target',preflightUrn,'--plan',preflightPlan]);
    assert.ok(state().events.slice(beforePolicy).every(event=>event.op==='update'&&event.urn===preflightUrn),
      'Targeted preflight changed another resource');
    cli(['preview']);
    up();assertReady();
    assert.ok(state().events.slice(beforePolicy).every(event=>event.op==='update'&&/::web-(preflight|install)$/.test(event.urn)),
      'Policy migration changed cloud resources');
    assert.equal(state().installs,policyInstalls,'Policy migration reinstalled the server');
    const remotePolicyServer=JSON.parse(cli(['stack','export'])).deployment.resources.find(r=>r.type===policyServer.type);
    assert.equal(remotePolicyServer.id,policyServer.id);assert.equal(remotePolicyServer.urn,policyServer.urn);
    // State exports re-encrypt secrets, so compare values rather than ciphertext.
    const remotePlainInputs=JSON.parse(cli(['stack','export','--show-secrets'])).deployment.resources.find(r=>r.type===policyServer.type).inputs;
    assert.deepEqual(remotePlainInputs,policyPlainInputs);assert.equal(remotePolicyServer.protect,true);
    assert.ok(!cli(['stack','export']).includes('synthetic-secret-label-value'),'Policy migration lost secret propagation');
    const settledPolicy=state().events.length;
    up();assert.equal(state().events.length,settledPolicy,'Policy migration was not idempotent');
    cli(['destroy','--yes','--skip-preview'],true);
    assert.equal(state().events.length,settledPolicy,'Protected policy stack performed deletion');
    config({customPolicy:true,serverType:'cx23',duplicate:true});
    assert.match(cli(['preview'],true),/Only one VPS is authorized/);
    assert.equal(state().events.length,settledPolicy,'Duplicate preview performed CRUD');
    config({customPolicy:true,serverType:'cpx22'});
    assert.match(cli(['preview'],true),/permits only cx23/);
    assert.equal(state().events.length,settledPolicy,'Budget guard performed CRUD');
    cli(['state','unprotect','--all','--yes']);cli(['destroy','--yes','--skip-preview']);
    assert.equal(Object.keys(state().objects).length,0);
    console.log('POLICY MIGRATION PASS: protected preview blocks unknown-output replacements; a saved targeted local-preflight plan resolves them before full preview; physical name, backups, protection, server ID and inputs retained without reinstall/cloud changes; duplicate and budget guards reject before CRUD.');
    console.log('COMPONENT PROVIDER PASS: independently packaged/installed plugin; real Construct RPC; unchanged TypeScript→remote→Python→Go resource IDs/URNs; migration only updates local runner paths without reinstalling; secret propagation, outputs, preview, updates, protection, replacement, deletion and partial-failure retry. Cloud providers were loopback substitutes.');
  } finally {
    for(const child of children)child.kill();
    if(process.env.KEEP_PROVIDER_TEST_FILES==='true')console.log('Private diagnostic fixture retained at '+temporary);
    else fs.rmSync(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
