// Actual installed tarball + generated identities + one-command local validation.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,[path.join(__dirname,'test-package.cjs'),'--validate-local'],{stdio:'inherit',timeout:25*60*1000});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
