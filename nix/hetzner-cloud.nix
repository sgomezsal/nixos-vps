{ ... }:
{
  imports = [ ../packages/nixos-vps/templates/nixos/base.nix ];
  disko.tests.extraChecks = ''
    machine.wait_for_unit("sshd.service")
    machine.wait_for_open_port(22)
    machine.succeed("getent passwd root")
    machine.wait_until_succeeds("ip -4 address show scope global | grep -q 'inet '")
    machine.wait_until_succeeds("ip -4 route show default | grep -q default")
    machine.succeed("findmnt --mountpoint / --types ext4")
    machine.succeed("findmnt --mountpoint /boot --types vfat")
    machine.succeed("grep -q 'ssh-ed25519 ' /etc/ssh/authorized_keys.d/root")
    machine.succeed("sshd -T | grep -qx 'passwordauthentication no'")
    machine.succeed("sshd -T | grep -qx 'kbdinteractiveauthentication no'")
    machine.succeed("sshd -T | grep -qx 'pubkeyauthentication yes'")
    machine.succeed("sshd -T | grep -qx 'authenticationmethods publickey'")
  '';
}
