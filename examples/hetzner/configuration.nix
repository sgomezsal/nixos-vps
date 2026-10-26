{ pkgs, ... }:
{
  networking.hostName = "example-web";
  # Replace this public key; preflight checks it matches Pulumi's SSH key paths.
  users.users.root.openssh.authorizedKeys.keyFiles = [ ./admin.pub ];
  services.caddy = {
    enable = true;
    # Replace :80 with your domain to enable HTTPS after configuring DNS.
    virtualHosts.":80".extraConfig = ''
      respond "NixOS provisioned by Pulumi" 200
    '';
  };
  networking.firewall.allowedTCPPorts = [ 80 443 ];
  disko.tests.extraChecks = ''
    machine.wait_for_unit("caddy.service")
    machine.succeed("${pkgs.curl}/bin/curl --fail http://127.0.0.1 | grep -q 'NixOS provisioned by Pulumi'")
  '';
}
