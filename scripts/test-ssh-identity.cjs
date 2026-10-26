// Real SSH authentication on loopback only, using disposable client/server keys.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {strictSshArgs}=require('../packages/nixos-vps/scripts/runner.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-identity-regression-'));
let daemon;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function command(bin,args,extra={}){const r=spawnSync(bin,args,{encoding:'utf8',timeout:10000,...extra});return r;}
function ok(bin,args,extra){const r=command(bin,args,extra);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
async function port(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
async function start(key,p){
 const file=path.join(tmp,'sshd.conf');fs.writeFileSync(file,`Port ${p}\nListenAddress 127.0.0.1\nHostKey ${key}\nPidFile ${tmp}/pid\nAuthorizedKeysFile ${tmp}/client.pub\nStrictModes no\nUsePAM no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nAuthenticationMethods publickey\nLogLevel ERROR\n`);
 const sshd=fs.realpathSync(ok('which',['sshd']));daemon=spawn(sshd,['-D','-e','-f',file],{stdio:['ignore','ignore','pipe']});let errors='';daemon.stderr.on('data',b=>errors+=b);
 for(let i=0;i<100;i++){if(daemon.exitCode!==null)throw new Error('Disposable sshd failed: '+errors);const ready=await new Promise(resolve=>{const s=net.connect(p,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));});if(ready)return;await pause(20);}throw new Error('sshd readiness timeout');
}
async function stop(){if(daemon){const d=daemon;daemon=undefined;d.kill();await new Promise(r=>d.once('exit',r));}}
(async()=>{try{
 for(const name of ['client','host','impostor'])ok('ssh-keygen',['-q','-t','ed25519','-N','','-f',path.join(tmp,name)]);
 const p=await port(),target=`${os.userInfo().username}@127.0.0.1`,known=path.join(tmp,'known_hosts');
 const pub=fs.readFileSync(path.join(tmp,'host.pub'),'utf8').trim().split(/\s+/).slice(0,2).join(' ');
 fs.writeFileSync(known,`[127.0.0.1]:${p} ${pub}\n`,{mode:0o600});
 const args=strictSshArgs({privateKeyPath:path.join(tmp,'client')},known,target,p);
 await start(path.join(tmp,'host'),p);assert.equal(ok('ssh',[...args,'printf authenticated']),'authenticated');
 await stop();await start(path.join(tmp,'host'),p);assert.equal(ok('ssh',[...args,'printf installer-phase']),'installer-phase');
 await stop();await start(path.join(tmp,'impostor'),p);const wrong=command('ssh',[...args,'printf MUST_NOT_EXECUTE']);assert.notEqual(wrong.status,0);assert.ok(!wrong.stdout.includes('MUST_NOT_EXECUTE'));
 fs.writeFileSync(known,'');assert.notEqual(command('ssh',[...args,'printf MUST_NOT_EXECUTE']).status,0);
 console.log('REAL SSH PASS: pinned host accepts; same identity survives restart/phase transition; changed and unknown identities rejected before remote command execution.');
 const installer=ok('nix',['build','--no-link','--print-out-paths','.#nixos-anywhere']);
 const driver=fs.readFileSync(path.join(installer,'bin/.nixos-anywhere-wrapped'),'utf8');
 const defaults=driver.split('\n').find(line=>line.startsWith('declare -a sshArgs='));assert.ok(defaults);
 const probe=`tempDir=${JSON.stringify(tmp)}\n${defaults}\nssh "\${sshArgs[@]}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -G example.invalid`;
 const config=ok('bash',['-c',probe],{env:{...process.env,NIXOS_KNOWN_HOSTS:known}});
 assert.match(config,/stricthostkeychecking true|stricthostkeychecking yes/);assert.ok(config.includes('userknownhostsfile '+known));assert.match(config,/hostkeyalgorithms ssh-ed25519/);
 console.log('PINNED DRIVER PASS: actual patched SSH defaults remain strict even when later arguments attempt insecure overrides.');
}finally{await stop();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
