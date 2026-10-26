// Exercise the real snapshot wrapper and filesystem, substituting child commands.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
for(const exitCode of [0,1])test(`clean validation uses a disposable nixos-vps directory and removes only its own files after exit ${exitCode}`,t=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-wrapper-test-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
 const unrelated=path.join(parent,'unrelated-data');fs.writeFileSync(unrelated,'preserve');let owned,bashCalls=0;
 const child={spawnSync(binary,args,options){
  if(binary==='git')return {status:0,stdout:args[0]==='ls-files'?'package.json\0':'',stderr:''};
  assert.equal(binary,'bash');assert.deepEqual(Array.from(args),['scripts/validate.sh']);bashCalls++;
  owned=path.dirname(options.cwd);assert.equal(path.dirname(owned),parent);assert.ok(path.basename(owned).startsWith('nixos-vps-clean-'));
  assert.equal(fs.statSync(owned).mode&0o777,0o700);
  assert.equal(fs.readFileSync(path.join(options.cwd,'package.json'),'utf8'),fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.ok(fs.existsSync(options.env.HOME));assert.equal(fs.readdirSync(options.env.HOME).length,0);
  assert.equal(options.env.HCLOUD_TOKEN,undefined);assert.equal(options.env.AWS_SECRET_ACCESS_KEY,undefined);
  return {status:exitCode};
 }};
 const execute=()=>vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/validate-clean.cjs'),'utf8'),{
  __dirname:path.join(root,'scripts'),console:{log(){}},process:{env:{PATH:process.env.PATH,HCLOUD_TOKEN:'synthetic-do-not-forward',AWS_SECRET_ACCESS_KEY:'synthetic-do-not-forward'}},
  require(name){if(name==='node:child_process')return child;if(name==='node:os')return {...os,tmpdir:()=>parent};return require(name);},
 });
 if(exitCode===0)execute();else assert.throws(execute,/Clean validation failed/);
 assert.equal(bashCalls,1);assert.equal(fs.existsSync(owned),false);assert.equal(fs.readFileSync(unrelated,'utf8'),'preserve');
 assert.deepEqual(fs.readdirSync(parent),['unrelated-data']);
});
