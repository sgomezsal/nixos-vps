'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const phase=process.argv[2];
if(!phase){
 for(const check of ['plugin','npm','pypi','go']){
  const result=spawnSync(process.execPath,[__filename,check],{stdio:'inherit',env:process.env});
  if(result.status!==0)process.exit(result.status||1);
 }
 process.exit(0);
}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-public-consumer-'));
const env={PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,HOME:path.join(temporary,'home'),PULUMI_HOME:path.join(temporary,'plugins'),PULUMI_SKIP_UPDATE_CHECK:'true',PULUMI_CLI_TELEMETRY_OPTOUT:'1',PULUMI_DISABLE_AUTOMATIC_PLUGIN_ACQUISITION:'true',PULUMI_IGNORE_AMBIENT_PLUGINS:'true',GOTOOLCHAIN:'local',GOFLAGS:'-modcacherw',GOCACHE:path.join(temporary,'.go-build'),GOMODCACHE:path.join(temporary,'.go-modules'),GOPROXY:'https://proxy.golang.org',GOSUMDB:'sum.golang.org'};
fs.mkdirSync(env.HOME);fs.mkdirSync(env.PULUMI_HOME);
function run(command,args){const r=spawnSync(command,args,{cwd:temporary,env,encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr+'\n'+r.stdout+'\n'+(r.error?.message||''));return r.stdout;}
try {
 if(phase==='plugin'){
  run('pulumi',['plugin','install','resource','nixos-vps','0.2.0-dev.0','--server','github://api.github.com/sgomezsal/nixos-vps','--exact']);
  const plugins=JSON.parse(run('pulumi',['plugin','ls','--json']));assert.ok(plugins.some(p=>p.name==='nixos-vps'&&p.version==='0.2.0-dev.0'));
 } else if(phase==='npm'){
  fs.writeFileSync(path.join(temporary,'package.json'),JSON.stringify({name:'public-consumer',private:true}));
  run('npm',['install','--ignore-scripts','--no-audit','--no-fund','@sgomezsal/nixos-vps@0.2.0-dev.0','typescript@5.9.3','@types/node@22.20.5']);
  run(process.execPath,['-e','const sdk=require("@sgomezsal/nixos-vps");if(typeof sdk.hetzner.NixosServer!=="function")throw Error("CJS import failed");']);
  run(process.execPath,['--input-type=module','-e','import {hetzner} from "@sgomezsal/nixos-vps";if(typeof hetzner.NixosServer!=="function")throw Error("ESM import failed");']);
  fs.writeFileSync(path.join(temporary,'consumer.ts'),'import {hetzner} from "@sgomezsal/nixos-vps"; const args:hetzner.NixosServerArgs={flakeDirectory:"/flake",configuration:"web",installer:"/flake#nixos-anywhere",sshPublicKeyPath:"/deploy.pub",sshPrivateKeyPath:"/deploy",sshHostKeyPrivatePath:"/host"};void args;\n');
  run(process.execPath,[path.join(temporary,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--skipLibCheck','--target','ES2020','--module','commonjs','--moduleResolution','node','consumer.ts']);
 } else if(phase==='pypi'){
  run('python3',['-m','venv','.venv']);const python=path.join(temporary,'.venv/bin/python');
  run(python,['-m','pip','install','--only-binary=:all:','--disable-pip-version-check','pulumi-nixos-vps==0.2.0.dev0']);
  run(python,['-m','pip','check']);
  run(python,['-c','import importlib.metadata; from pulumi_nixos_vps.hetzner import NixosServer; assert importlib.metadata.version("pulumi-nixos-vps")=="0.2.0.dev0"; assert callable(NixosServer)']);
 } else if(phase==='go'){
  fs.writeFileSync(path.join(temporary,'go.mod'),'module example.local/public-consumer\n\ngo 1.24.0\n\nrequire github.com/sgomezsal/nixos-vps/sdk/go/nixosvps v0.2.0-dev.0\n');
  fs.writeFileSync(path.join(temporary,'main.go'),'package main\nimport "github.com/sgomezsal/nixos-vps/sdk/go/nixosvps/hetzner"\nfunc main(){var server *hetzner.NixosServer; _ = server}\n');
  run('go',['mod','tidy']);run('go',['build','-o','consumer','.']);
 } else throw Error('Unknown phase');
 console.log('PUBLIC CONSUMER PASS: '+phase+' installed from public distribution in an independent empty-HOME project; no cloud operations.');
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
