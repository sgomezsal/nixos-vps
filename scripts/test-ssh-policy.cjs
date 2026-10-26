// Real Nix module evaluation plus sshd's effective configuration parser; no daemon or cloud operations.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{validateSshPolicy}=require('../packages/nixos-vps/scripts/runner.cjs');
const root=path.resolve(__dirname,'..'),home=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-ssh-policy-'));
const env=Object.fromEntries(['PATH','USER','NIX_REMOTE','SSL_CERT_FILE','NIX_SSL_CERT_FILE','NIX_CONFIG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));env.HOME=home;
function run(binary,args){const r=spawnSync(binary,args,{env,encoding:'utf8',timeout:180000,maxBuffer:8e6});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
const flake=`builtins.getFlake ${JSON.stringify(root)}`;
function expression(host,settings){return `let f=${flake}; n=f.nixosConfigurations.${host}.extendModules {modules=[({lib,...}: ${settings})];}; c=n.config; in { rootLogin=c.services.openssh.settings.PermitRootLogin; passwordAuthentication=c.services.openssh.settings.PasswordAuthentication; kbdInteractiveAuthentication=c.services.openssh.settings.KbdInteractiveAuthentication; pubkeyAuthentication=c.services.openssh.settings.PubkeyAuthentication or true; authenticationMethods=c.services.openssh.settings.AuthenticationMethods or "any"; extraSshConfig=c.services.openssh.extraConfig; sshSettingNames=builtins.attrNames c.services.openssh.settings; logrotateChecks=c.services.logrotate.checkConfig; }`;}
function evaluate(host,settings='{}'){return JSON.parse(run('nix',['eval','--impure','--json','--expr',expression(host,settings)]));}
try{
 const hostKey=path.join(home,"host");run("ssh-keygen",["-q","-t","ed25519","-N","","-f",hostKey]);
 for(const host of ['hetzner-cloud','example']){
  const summary=evaluate(host);validateSshPolicy(summary);assert.equal(summary.logrotateChecks,true,'logrotate validation must remain enabled');
  const config=run('nix',['build','--impure','--no-link','--print-out-paths','--expr',`(${flake}).nixosConfigurations.${host}.config.environment.etc."ssh/sshd_config".source`]);
  // Replace only host identity paths with a disposable key; authentication directives remain unchanged.
  const isolated=path.join(home,host+".conf");fs.writeFileSync(isolated,fs.readFileSync(config,"utf8").replace(/^HostKey[ \t]+.*$/gim,"HostKey "+hostKey),{mode:0o600});
  const effective=run('sshd',['-T','-f',isolated]);
  for(const line of ['passwordauthentication no','kbdinteractiveauthentication no','pubkeyauthentication yes','authenticationmethods publickey'])assert.ok(effective.split('\n').includes(line),'Effective sshd policy missing: '+line);
  assert.match(effective,/^permitrootlogin (?:prohibit-password|without-password)$/m);
 }
 for(const settings of [
  '{services.openssh.settings.PasswordAuthentication=lib.mkForce true;}',
  '{services.openssh.settings.KbdInteractiveAuthentication=lib.mkForce true;}',
  '{services.openssh.settings.PubkeyAuthentication=lib.mkForce false;}',
  '{services.openssh.settings.AuthenticationMethods=lib.mkForce "any";}',
  '{services.openssh.settings.PermitRootLogin=lib.mkForce "yes";}',
 ])assert.throws(()=>validateSshPolicy(evaluate('hetzner-cloud',settings)),/SSH_AUTH_POLICY/);
 for(const settings of [
  '{services.openssh.extraConfig="Match User root\\n  PasswordAuthentication yes";}',
  '{services.openssh.extraConfig="Include /etc/ssh/custom.conf";}',
  '{services.openssh.settings.Include="/etc/ssh/custom.conf";}',
 ])assert.throws(()=>validateSshPolicy(evaluate('hetzner-cloud',settings)),/SSH_AUTH_OVERRIDES/);
 console.log('REAL SSH POLICY PASS: Nix-derived unsafe custom policies rejected; generated baseline/example configs parsed by sshd -T require public-key-only authentication; logrotate checks enabled. No SSH daemon, provider or account was accessed.');
}finally{fs.rmSync(home,{recursive:true,force:true});}
