'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');

test('credential scan detects hexadecimal and opaque Hetzner tokens without printing their values',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-scan-'));
  try {
    fs.mkdirSync(path.join(directory,'scripts'));
    fs.copyFileSync(path.resolve(__dirname,'../../../scripts/scan-validation.cjs'),path.join(directory,'scripts/scan-validation.cjs'));
    const initialized=spawnSync('git',['init','--quiet'],{cwd:directory,encoding:'utf8'});
    assert.equal(initialized.status,0,initialized.stderr);
    for(const token of ['a'.repeat(64),'G'.repeat(64)]){
      fs.writeFileSync(path.join(directory,'fixture.env'),`HCLOUD_TOKEN="${token}"\n`);
      const tracked=spawnSync('git',['add','--force','fixture.env'],{cwd:directory,encoding:'utf8'});
      assert.equal(tracked.status,0,tracked.stderr);
      const result=spawnSync(process.execPath,['scripts/scan-validation.cjs'],{cwd:directory,encoding:'utf8'});
      assert.equal(result.status,1,'Credential signature must fail validation');
      assert.match(result.stdout,/1 findings/);assert.match(result.stderr,/fixture\.env/);
      assert.ok(!(result.stdout+result.stderr).includes(token),'Scanner exposed the synthetic credential');
    }
    fs.writeFileSync(path.join(directory,'fixture.env'),'HCLOUD_TOKEN=replace-with-your-project-token\n');
    const placeholder=spawnSync(process.execPath,['scripts/scan-validation.cjs'],{cwd:directory,encoding:'utf8'});
    assert.equal(placeholder.status,0,placeholder.stderr);assert.match(placeholder.stdout,/0 findings/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
