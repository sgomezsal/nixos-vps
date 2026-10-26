const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const r = require('../scripts/runner.cjs');
const key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest fixture';
const host = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHost fixture';
function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-installer-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const directory = path.join(tmp, 'flake'); fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'flake.nix'), '{}');
  fs.writeFileSync(path.join(directory, 'flake.lock'), JSON.stringify({ nodes: {}, root: 'root' }));
  const privateKeyPath = path.join(tmp, 'client'); const hostKeyPrivatePath = path.join(tmp, 'host');
  fs.writeFileSync(privateKeyPath, 'client-private-fixture', { mode: 0o600 });
  fs.writeFileSync(hostKeyPrivatePath, 'host-private-fixture', { mode: 0o600 });
  const publicKeyPath = path.join(tmp, 'client.pub'); fs.writeFileSync(publicKeyPath, key);
  const installerPath = path.join(tmp, 'installer');
  fs.mkdirSync(path.join(installerPath, 'bin'), { recursive: true }); fs.mkdirSync(path.join(installerPath, 'share'));
  const driver = 'StrictHostKeyChecking=yes UserKnownHostsFile=${NIXOS_KNOWN_HOSTS}';
  fs.writeFileSync(path.join(installerPath, 'bin/.nixos-anywhere-wrapped'), driver);
  const kexecPath = path.join(tmp, 'payload'); fs.writeFileSync(kexecPath, 'synthetic pinned payload');
  fs.writeFileSync(path.join(installerPath, 'share/nixos-installer-security.json'), JSON.stringify({ securityVersion: 1, driver: 'bin/.nixos-anywhere-wrapped', driverSha256: r.digest(driver), kexecPath, kexecSha256: r.digest(fs.readFileSync(kexecPath)) }));
  return { directory, configuration: 'web', installer: '/tool#secure', publicKeyPath, privateKeyPath, hostKeyPrivatePath, expectedDisk: '/dev/sda', timeout: 1, installerPath, kexecPath };
}
const disk = () => ({ blockdevices: [{ path: '/dev/sda', type: 'disk', serial: 'test-disk', size: 10737418240, children: [{ type: 'part', mountpoints: ['/'] }] }] });
function executor(c, changes = {}) {
  const calls = []; const stages = [];
  const execute = (binary, args, options) => {
    calls.push([binary, args, options]);
    if (binary === 'nix' && args[0] === '--version') return 'nix (Nix) 2.34.8';
    if (binary === 'ssh' && args[0] === '-V') return 'OpenSSH_10.2p1';
    if (binary === 'ssh-keygen') return args.at(-1) === c.hostKeyPrivatePath ? (changes.host ?? host) : (changes.key ?? key);
    if (binary === 'nix' && args[0] === 'eval') return JSON.stringify({ system: 'x86_64-linux', ssh: true, ports: [22], passwordAuthentication:false, kbdInteractiveAuthentication:false, pubkeyAuthentication:true, authenticationMethods:'publickey', extraSshConfig:'', sshSettingNames:[], rootLogin: 'prohibit-password', keys: [key], hasDisko: true, disks: ['/dev/sda'], ...changes });
    if (binary === 'nix' && args[0] === 'build') return args.at(-1).endsWith('toplevel') ? '/nix/store/test-system' : args.at(-1).endsWith('diskoScript') ? '/nix/store/test-disko' : c.installerPath;
    if (binary.endsWith('/bin/nixos-anywhere')) { const phase=args.at(-1); stages.push(phase); if(changes.failPhase===phase)throw new Error('simulated interruption'); return ''; }
    if (binary === 'ssh') {
      const command = args.at(-1);
      if (command.startsWith('lsblk')) return JSON.stringify(changes.layout ?? disk());
      if (command.includes('VARIANT_ID')) return '';
      if (command.includes('printf nixos')) return changes.finalOs ?? 'nixos';
      return changes.bootstrapOs ?? 'ubuntu';
    }
    throw new Error('Unexpected command: '+binary);
  };
  return { calls, stages, execute };
}
test('preflight validates locked config, dedicated identity, disk and measured installer before provisioning', t => {
 const c=fixture(t), m=executor(c), result=r.preflight(c,m.execute);
 assert.equal(result.publicKey,key); assert.equal(result.hostPublicKey,r.keyIdentity(host)); assert.equal(result.installerPath,c.installerPath);
 assert.equal(m.calls.filter(([b,a])=>b==='nix'&&a[0]==='build').length,3);
 assert.ok(!JSON.stringify(result).includes('host-private-fixture'));
});
test('missing lock, wrong client key, absent disko/root key, wrong architecture and wrong disk fail preflight', t=>{
 const c=fixture(t);
 for(const changes of [{key:'different'}, {keys:[]}, {system:'aarch64-linux'}, {hasDisko:false}, {rootLogin:'no'}, {disks:['/dev/sdb']}, {disks:['/dev/sda','/dev/sdb']}]) assert.throws(()=>r.preflight(c,executor(c,changes).execute));
 fs.unlinkSync(path.join(c.directory,'flake.lock')); assert.throws(()=>r.preflight(c,executor(c).execute),/Missing flake.lock/);
});
test('preflight rejects cloud ports missing in the OS firewall and accepts matching port ranges',t=>{
 const c={...fixture(t),tcpPorts:[8080]};
 assert.throws(()=>r.preflight(c,executor(c,{firewall:true,tcpPorts:[80]}).execute),/OS_FIREWALL_PORTS/);
 assert.doesNotThrow(()=>r.preflight(c,executor(c,{firewall:true,tcpRanges:[{from:8000,to:9000}]}).execute));
 assert.throws(()=>r.diskInventory('not json'),/lsblk returned invalid JSON/);
 assert.throws(()=>r.validateDisk({},c),/disk inventory/);
 assert.throws(()=>r.validateDisk({blockdevices:[{path:'/dev/sda',type:'disk',size:1}]},c),/smaller than 1 GiB/);
});
test('existing NixOS and unknown bootstrap systems refuse any installer invocation',async t=>{
 const c=fixture(t);
 for(const bootstrapOs of ['nixos','fedora']){const m=executor(c,{bootstrapOs});await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},m.execute));assert.equal(m.stages.length,0);}
});
test('all phases pin one known host, use immutable outputs, and check disk identity before formatting',async t=>{
 const c=fixture(t),m=executor(c),events=[];
 const result=await r.install(c,{NIXOS_TARGET:'192.0.2.1'},m.execute,undefined,e=>events.push(e));
 assert.deepEqual(result,{installed:true}); assert.deepEqual(m.stages,['kexec','disko,install,reboot']); assert.equal(events.at(-1),'ready');
 for(const [b,a,o]of m.calls.filter(([b,a])=>b==='ssh'&&a[0]!=='-V')){assert.ok(a.includes('StrictHostKeyChecking=yes'));assert.ok(!a.includes('StrictHostKeyChecking=accept-new'));assert.ok(a.includes('HostKeyAlgorithms=ssh-ed25519'));}
 for(const [b,a,o]of m.calls.filter(([b])=>b.endsWith('/bin/nixos-anywhere'))){assert.ok(a.includes('--store-paths'));assert.ok(a.includes('/nix/store/test-system'));assert.equal(o.env.NIXOS_KNOWN_HOSTS.includes('known_hosts'),true);assert.equal(o.env.HCLOUD_TOKEN,undefined);}
 assert.equal(m.calls.filter(([b,a])=>b==='ssh'&&a.at(-1).startsWith('lsblk')).length,2);
});
test('wrong physical disk, serial, topology or root mount rejects before kexec',async t=>{
 for(const layout of [{blockdevices:[]},{blockdevices:[...disk().blockdevices,...disk().blockdevices]},{blockdevices:[{...disk().blockdevices[0],path:'/dev/sdb'}]},{blockdevices:[{...disk().blockdevices[0],children:[]}]}]){const c=fixture(t),m=executor(c,{layout});await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},m.execute),/Disk safety/);assert.equal(m.stages.length,0);}
 const c=fixture(t);c.expectedDiskSerial='different';const m=executor(c);await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},m.execute),/serial mismatch/);
});
test('disk identity change across authenticated kexec rejects formatting',async t=>{
 const c=fixture(t),m=executor(c);let probes=0;
 await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},(b,a,o)=>{if(b==='ssh'&&a.at(-1).startsWith('lsblk')){const d=disk();if(++probes===2)d.blockdevices[0].serial='swapped';return JSON.stringify(d);}return m.execute(b,a,o);}),/identity changed/);
 assert.deepEqual(m.stages,['kexec']);
});
test('a missing or blank disk serial blocks kexec and a lost serial after kexec blocks formatting',async t=>{
 for(const serial of [undefined,'','   ']){
  const c=fixture(t),layout=disk();layout.blockdevices[0].serial=serial;const m=executor(c,{layout});
  await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},m.execute),/nonempty physical disk serial/);assert.equal(m.stages.length,0);
 }
 const c=fixture(t),m=executor(c);let probes=0;
 await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},(binary,args,options)=>{
  if(binary==='ssh'&&args.at(-1).startsWith('lsblk')){const layout=disk();if(++probes===2)layout.blockdevices[0].serial='';return JSON.stringify(layout);}
  return m.execute(binary,args,options);
 }),/nonempty physical disk serial/);
 assert.deepEqual(m.stages,['kexec']);
});
test('tampered driver, insecure defaults or changed payload fail integrity verification',t=>{
 const c=fixture(t);fs.appendFileSync(c.kexecPath,'tampered');assert.throws(()=>r.verifyInstaller(c.installerPath),/payload integrity/);
 fs.appendFileSync(path.join(c.installerPath,'bin/.nixos-anywhere-wrapped'),' StrictHostKeyChecking=no');assert.throws(()=>r.verifyInstaller(c.installerPath),/driver integrity/);
});
test('failures and interrupted retries never return ready or bypass existing-NixOS guard',async t=>{
 const c=fixture(t);
 for(const failPhase of ['kexec','disko,install,reboot']){const m=executor(c,{failPhase}),events=[];await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},m.execute,undefined,e=>events.push(e)),/simulated interruption/);assert.ok(!events.includes('ready'));}
 const retry=executor(c,{bootstrapOs:'nixos'});await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},retry.execute),/Refusing to reinstall/);assert.equal(retry.stages.length,0);
 const wrong=executor(c,{finalOs:'ubuntu'});await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1'},wrong.execute),/Post-install/);
});
test('invalid target and missing configuration fail before network calls',async t=>{
 await assert.rejects(r.main('preflight',{NIXOS_INPUT_ERROR:'sshSourceIps must not be empty'}),/sshSourceIps must not be empty/);
 const c=fixture(t);await assert.rejects(r.install(c,{NIXOS_TARGET:'192.0.2.1;bad'},()=>assert.fail()),/IPv4/);assert.throws(()=>r.settings({}),/Missing NIXOS_FLAKE_DIRECTORY/);
});
test('private identities must be separate, restrictive, and outside the flake',t=>{
 const c=fixture(t),inside=path.join(c.directory,'private');fs.writeFileSync(inside,'fixture',{mode:0o600});assert.throws(()=>r.preflight({...c,privateKeyPath:inside},executor(c).execute),/outside flakeDirectory/);
 const link=path.join(c.directory,'linked-private');fs.symlinkSync(c.privateKeyPath,link);assert.throws(()=>r.preflight({...c,privateKeyPath:link},executor(c).execute),/outside flakeDirectory/);
 assert.throws(()=>r.preflight({...c,hostKeyPrivatePath:c.privateKeyPath},executor(c).execute),/dedicated server host key/);
 assert.throws(()=>r.preflight(c,executor(c,{host:key}).execute),/different key material/);
 fs.chmodSync(c.hostKeyPrivatePath,0o644);assert.throws(()=>r.preflight(c,executor(c).execute),/permissions must be 0600/);
});
test('missing executables and unsupported tool versions have actionable errors',()=>{
 assert.throws(()=>r.checkTools(()=> 'nix (Nix) 2.18.0'),/Nix >=2.24/);assert.throws(()=>r.checkTools(b=>b==='nix'?'nix (Nix) 2.34.8':'OpenSSH_8.9'),/OpenSSH >=9/);assert.throws(()=>r.run('/nonexistent/tool',[]),/ENOENT.*PATH/);
});
test('subprocess and readiness timeouts fail without sensitive diagnostics',async()=>{
 assert.throws(()=>r.run(process.execPath,['-e','setTimeout(()=>{},1000)'],{timeout:10}),/ETIMEDOUT/);
 assert.throws(()=>r.run(process.execPath,['-e',"console.error('FAKE_SENSITIVE_VALUE');process.exit(7)"]),e=>/exit 7/.test(e.message)&&!e.message.includes('FAKE_SENSITIVE_VALUE'));
 let now=0;await assert.rejects(r.waitForSsh(()=>{throw new Error('refused');},[],'true',1,async()=>{now+=1000;},()=>now),/SSH readiness timed out/);
});
test('cloud/SOPS credentials are removed while explicit public known-host policy is retained',()=>{
 assert.deepEqual(r.childEnvironment({PATH:'/bin',HCLOUD_TOKEN:'fake',SOPS_AGE_KEY:'fake',NIXOS_KNOWN_HOSTS:'/known'}),{PATH:'/bin',NIXOS_KNOWN_HOSTS:'/known'});
});
test('preflight rejects password, interactive, alternate or incomplete SSH policies before builds or installation',t=>{
 const c=fixture(t);
 for(const changes of [{passwordAuthentication:true},{passwordAuthentication:null},{passwordAuthentication:undefined},{kbdInteractiveAuthentication:true},{kbdInteractiveAuthentication:undefined},{pubkeyAuthentication:false},{pubkeyAuthentication:undefined},{authenticationMethods:'any'},{authenticationMethods:'publickey password'},{authenticationMethods:'publickey,password'},{authenticationMethods:undefined},{rootLogin:'yes'}]){
  const m=executor(c,changes);assert.throws(()=>r.preflight(c,m.execute),/SSH_AUTH_POLICY/);
  assert.equal(m.calls.filter(([b,a])=>b==='nix'&&a[0]==='build').length,0);assert.deepEqual(m.stages,[]);
 }
 assert.doesNotThrow(()=>r.preflight(c,executor(c,{rootLogin:'without-password'}).execute));
});
test('preflight rejects manual SSH policy overrides and unverified conditional or included configuration',t=>{
 const c=fixture(t);
 for(const changes of [
  {extraSshConfig:'PasswordAuthentication yes'},
  {extraSshConfig:'  pAsSwOrDaUtHeNtIcAtIoN=yes'},
  {extraSshConfig:'Match User root\n AuthenticationMethods any'},
  {extraSshConfig:'Include /etc/ssh/custom.conf'},
  {extraSshConfig:'ChallengeResponseAuthentication yes'},
  {extraSshConfig:'PubkeyAuthentication no'},
  {extraSshConfig:'PermitRootLogin yes'},
  {extraSshConfig:undefined},
  {sshSettingNames:['Include']},
  {sshSettingNames:['Match User root']},
  {sshSettingNames:['ChallengeResponseAuthentication']},
 ]){const m=executor(c,changes);assert.throws(()=>r.preflight(c,m.execute),/SSH_AUTH_OVERRIDES/);assert.equal(m.calls.filter(([b,a])=>b==='nix'&&a[0]==='build').length,0);assert.deepEqual(m.stages,[]);}
 assert.doesNotThrow(()=>r.preflight(c,executor(c,{extraSshConfig:'# PasswordAuthentication yes\nBanner none\nAddressFamily any\nPort 22'}).execute));
});
