// Compare the shipped consumer template with the repository example using real Nix evaluation.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nixos-vps-template-parity-'));
const template=path.join(root,'packages/nixos-vps/templates/nixos'),consumer=path.join(tmp,'nixos'),home=path.join(tmp,'home');fs.mkdirSync(home);
const env=Object.fromEntries(['PATH','USER','LOGNAME','NIX_REMOTE','NIX_SSL_CERT_FILE','SSL_CERT_FILE','NIX_CONFIG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));env.HOME=home;
try{
 fs.cpSync(template,consumer,{recursive:true});fs.copyFileSync(path.join(root,'examples/hetzner/admin.pub'),path.join(consumer,'admin.pub'));
 const rootLock=JSON.parse(fs.readFileSync(path.join(root,'flake.lock'))),templateLock=JSON.parse(fs.readFileSync(path.join(template,'flake.lock')));
 for(const name of ['nixpkgs','disko'])assert.deepEqual(rootLock.nodes[name].locked,templateLock.nodes[name].locked,'Shared pinned input differs: '+name);
 const summary=`n: let c=n.config; d=c.disko.devices.disk.main; p=d.content.partitions; in {
  system=n.pkgs.stdenv.hostPlatform.system; dhcp=c.networking.useDHCP;
  grub=c.boot.loader.grub.enable; efi=c.boot.loader.grub.efiSupport; removable=c.boot.loader.grub.efiInstallAsRemovable; stateVersion=c.system.stateVersion;
  disk={inherit (d) device type; table=d.content.type; bios={inherit (p.bios) size type;}; esp={inherit (p.ESP) size type; content={inherit (p.ESP.content) type format mountpoint;};}; root={inherit (p.root) size; content={inherit (p.root.content) type format mountpoint;};};};
  ssh={enable=c.services.openssh.enable; ports=c.services.openssh.ports; settings={inherit (c.services.openssh.settings) PasswordAuthentication KbdInteractiveAuthentication PubkeyAuthentication AuthenticationMethods PermitRootLogin;};};
  tcpPorts=c.networking.firewall.allowedTCPPorts; firewall=c.networking.firewall.enable; caddy=c.services.caddy.enable;
  git=builtins.elem n.pkgs.git c.environment.systemPackages; tmpClean=c.boot.tmp.cleanOnBoot; zram=c.zramSwap.enable; logrotateChecks=c.services.logrotate.checkConfig;
 }`;
 const expression=`let a=builtins.getFlake ${JSON.stringify(root)}; b=builtins.getFlake ${JSON.stringify(consumer)}; summarize=${summary}; in {example=summarize a.nixosConfigurations.example; consumer=summarize b.nixosConfigurations.web;}`;
 const result=spawnSync('nix',['eval','--impure','--json','--expr',expression],{env,encoding:'utf8',timeout:180000,maxBuffer:8e6});assert.equal(result.status,0,result.stderr||result.error?.message);
 const evaluated=JSON.parse(result.stdout);assert.deepEqual(evaluated.example,evaluated.consumer,'Repository example and shipped template have diverged');assert.equal(evaluated.consumer.logrotateChecks,true);
 console.log('TEMPLATE PARITY PASS: independent consumer and repository example agree on boot, disk, SSH, firewall, web service and baseline defaults; Nixpkgs/disko pins match. The consumer uses its own copied files.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
