{ ... }:
{
  imports = [ ./base.nix ];
  # Copy only your PUBLIC deployment key here before evaluation or deployment.
  users.users.root.openssh.authorizedKeys.keyFiles = [ ./admin.pub ];
  services.caddy = {
    enable = true;
    virtualHosts.":80".extraConfig = ''respond "NixOS provisioned by Pulumi" 200'';
  };
  # Public data generated from the selected Pulumi stack by nixos-vps validate.
  networking.firewall.allowedTCPPorts = builtins.fromJSON (builtins.readFile ./ports.json);
}
