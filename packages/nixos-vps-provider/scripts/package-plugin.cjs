#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const {providerFiles,buildEnvironment,archive}=require('./distribution.cjs');

function packagePlugin(destination) {
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('This development plugin supports x86_64 Linux only');
  const provider=path.resolve(__dirname,'..'),metadata=require('../package.json');
  const source=path.join(provider,'src/provider.ts');
  if(!fs.existsSync(path.join(provider,metadata.main)))throw Error('Build the provider before packaging it');
  if(fs.existsSync(source)) {
    const map=JSON.parse(fs.readFileSync(path.join(provider,'lib/provider.js.map')));
    if(!map.sourcesContent?.includes(fs.readFileSync(source,'utf8')))throw Error('Provider build is stale; run npm run build before packaging');
  }
  const output=path.resolve(destination);
  if(fs.existsSync(output))throw Error('Plugin destination already exists; refusing overwrite');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-plugin-package-'));
  try {
    const home=path.join(temporary,'home'),runtime=path.join(temporary,'runtime');
    fs.mkdirSync(home);fs.mkdirSync(runtime);
    const env=buildEnvironment(home);
    const run=(command,args,cwd)=>{
      const r=cp.spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});
      if(r.status!==0)throw Error('Local plugin packaging failed: '+(r.stderr||r.error?.message||command));
      return r.stdout;
    };
    const [pack]=JSON.parse(run('npm',['pack',provider,'--ignore-scripts','--json','--pack-destination',temporary],temporary));
    if(JSON.stringify(pack.files.map(file=>file.path).sort())!==JSON.stringify(providerFiles)) {
      throw Error('Unexpected provider package contents; review the explicit file allowlist');
    }
    for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(provider,'runtime',file),path.join(runtime,file));
    run('npm',['ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund'],runtime);
    run('npm',['audit','--omit=dev','--audit-level=high'],runtime);
    const injected=path.join(runtime,'node_modules/nixos-vps-provider');fs.mkdirSync(injected);
    run('tar',['-xzf',path.join(temporary,pack.filename),'--strip-components=1','-C',injected],temporary);
    // Build-machine metadata is not needed by the runtime and may contain local paths.
    fs.rmSync(path.join(runtime,'node_modules/.package-lock.json'),{force:true});
    // Pulumi's plugin extractor accepts regular files/directories, not npm's
    // executable symlinks. Materialize only links confined to this runtime.
    function verifyLinks(directory) {
      for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        const filename=path.join(directory,entry.name);
        if(entry.isSymbolicLink()) {
          const target=fs.realpathSync(filename);
          if(!target.startsWith(runtime+path.sep))throw Error('Dependency link escapes the plugin runtime');
        }else if(entry.isDirectory())verifyLinks(filename);
      }
    }
    verifyLinks(path.join(runtime,'node_modules'));
    const launcher=`#!/usr/bin/env node\n'use strict';\nconst {main}=require('./node_modules/@pulumi/pulumi/provider');\nconst {NixosServerProvider}=require('./node_modules/nixos-vps-provider');\nmain(new NixosServerProvider(),process.argv.slice(2)).catch(()=>{console.error('Component provider startup failed');process.exitCode=1;});\n`;
    fs.writeFileSync(path.join(runtime,'pulumi-resource-nixos-vps'),launcher,{mode:0o755});
    const packed=path.join(temporary,'plugin.tar.gz');
    archive(runtime,['pulumi-resource-nixos-vps','node_modules'],packed,env);
    const bytes=fs.readFileSync(packed),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(output,bytes,{flag:'wx',mode:0o600});
    return {name:'nixos-vps',version:metadata.version,platform:'linux-amd64',development:true,
      componentVersion:require(path.join(runtime,'node_modules/nixos-vps/package.json')).version,
      filename:path.basename(output),sha256};
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
module.exports={packagePlugin};
if(require.main===module) {
  try {
    if(process.argv.length!==3)throw Error('Usage: node package-plugin.cjs /new/plugin.tar.gz');
    console.log(JSON.stringify(packagePlugin(process.argv[2]),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
