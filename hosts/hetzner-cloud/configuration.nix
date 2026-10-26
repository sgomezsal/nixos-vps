{ ... }:
{
  networking.hostName = "hetzner-cloud";
  # Public fixture for local checks; init creates separate deployment identities.
  users.users.root.openssh.authorizedKeys.keyFiles = [ ../../examples/hetzner/admin.pub ];
}
